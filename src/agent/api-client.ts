import WebSocket from 'ws';
import { AgentConfig, ApiConfig, Message } from './types';
import { CommandExecutionService } from './exec-service';
import { LlmService } from './llm-service';
import * as tmux from './tmux';

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 60000;
const CIRCUIT_BREAKER_DURATION_MS = 120000;

export class ApiWebSocketClient {
  private ws: WebSocket | null = null;
  private config: AgentConfig;
  private apiConfig: ApiConfig;
  private commandService: CommandExecutionService;
  private llmService: LlmService;

  private isConnected = false;
  private reconnectAttempts = 0;
  private circuitBreakerOpen = false;
  private circuitBreakerResetTime = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  constructor(config: AgentConfig) {
    this.config = config;
    this.apiConfig = config.api || { enabled: false };
    this.commandService = new CommandExecutionService(this.apiConfig.exec);
    this.llmService = new LlmService(this.apiConfig.llm);
  }

  start(): void {
    if (!this.apiConfig.enabled || !this.apiConfig.agentId) {
      console.log('[API] API client disabled or no agentId configured');
      return;
    }

    // Add jitter to prevent thundering herd
    const jitter = Math.floor(Math.random() * 2000);
    console.log(`[API] Starting in ${jitter}ms`);
    setTimeout(() => this.connect(), jitter);
  }

  private connect(): void {
    if (this.destroyed) return;

    try {
      this.ws = new WebSocket(this.config.relay);

      this.ws.on('open', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.circuitBreakerOpen = false;
        console.log('[API] Connected to relay');
        this.registerAsApiAgent();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message: Message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (e) {
          console.error('[API] Failed to parse message:', e);
        }
      });

      this.ws.on('close', (code, reason) => {
        this.isConnected = false;
        console.log(`[API] Disconnected: code=${code}, reason=${reason.toString()}`);

        if (!this.destroyed) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error) => {
        console.error('[API] WebSocket error:', error.message);
      });

    } catch (error: any) {
      console.error('[API] Connection error:', error.message);
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    }
  }

  private registerAsApiAgent(): void {
    const meta: Record<string, string> = {
      machineId: this.config.machineId,
      agentId: this.apiConfig.agentId!
    };
    if (this.config.token) {
      meta.token = this.config.token;
    }

    this.send({
      type: 'register',
      role: 'host',
      session: `api-${this.apiConfig.agentId}`,
      meta
    });

    console.log(`[API] Registered as API agent: ${this.apiConfig.agentId}`);
  }

  private async handleMessage(message: Message): Promise<void> {
    switch (message.type) {
      case 'exec':
        await this.handleExec(message);
        break;
      case 'llm_chat':
        await this.handleLlmChat(message);
        break;
      case 'send_keys':
        await this.handleSendKeys(message);
        break;
      case 'list_sessions':
        await this.handleListSessions(message);
        break;
    }
  }

  private async handleExec(message: Message): Promise<void> {
    const meta = message.meta;
    if (!meta?.requestId) return;

    try {
      const payload = meta.payload ? JSON.parse(meta.payload) : {};
      const { command, cwd, timeout, sessionId } = payload;

      console.log(`[API] exec: command=${command}, cwd=${cwd}, timeout=${timeout}`);

      const result = await this.commandService.executeCommand(command, cwd, timeout, sessionId);
      this.sendApiResponse(meta.requestId, result);
    } catch (error: any) {
      this.sendApiResponse(meta.requestId, {
        exitCode: -1,
        stdout: '',
        stderr: `Error: ${error.message}`,
        duration: 0
      });
    }
  }

  private async handleLlmChat(message: Message): Promise<void> {
    const meta = message.meta;
    if (!meta?.requestId) return;

    try {
      const payload = meta.payload ? JSON.parse(meta.payload) : {};
      const { model, messages, temperature, max_tokens, stream } = payload;

      console.log(`[API] llm_chat: model=${model}, messages=${messages?.length || 0}`);

      const result = await this.llmService.chat(model, messages, temperature, max_tokens, stream);
      this.sendApiResponse(meta.requestId, result);
    } catch (error: any) {
      this.sendApiResponse(meta.requestId, {
        error: {
          message: error.message,
          type: 'internal_error'
        }
      });
    }
  }

  private async handleSendKeys(message: Message): Promise<void> {
    const meta = message.meta;
    if (!meta?.requestId) return;

    try {
      const payload = meta.payload ? JSON.parse(meta.payload) : {};
      const { target, keys, enter = true } = payload;

      if (!target || !keys) {
        this.sendApiResponse(meta.requestId, {
          success: false,
          error: 'target and keys are required'
        });
        return;
      }

      console.log(`[API] send_keys: target=${target}, keys=${keys}, enter=${enter}`);

      const success = tmux.sendKeys(target, keys, enter);
      this.sendApiResponse(meta.requestId, { success, target });
    } catch (error: any) {
      this.sendApiResponse(meta.requestId, {
        success: false,
        error: error.message
      });
    }
  }

  private async handleListSessions(message: Message): Promise<void> {
    const meta = message.meta;
    if (!meta?.requestId) return;

    try {
      console.log('[API] list_sessions');
      const sessions = tmux.listSessions();
      this.sendApiResponse(meta.requestId, { sessions });
    } catch (error: any) {
      this.sendApiResponse(meta.requestId, {
        sessions: [],
        error: error.message
      });
    }
  }

  private sendApiResponse(requestId: string, response: any): void {
    this.send({
      type: 'api_response',
      meta: {
        requestId,
        payload: JSON.stringify(response)
      }
    });
  }

  private send(message: Message): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;

    // Check circuit breaker
    if (this.circuitBreakerOpen) {
      const now = Date.now();
      if (now < this.circuitBreakerResetTime) {
        const remainingSeconds = Math.ceil((this.circuitBreakerResetTime - now) / 1000);
        console.log(`[API] Circuit breaker open. Retry in ${remainingSeconds} seconds`);
        this.reconnectTimer = setTimeout(() => this.scheduleReconnect(), this.circuitBreakerResetTime - now);
        return;
      } else {
        console.log('[API] Circuit breaker reset');
        this.circuitBreakerOpen = false;
        this.reconnectAttempts = 0;
      }
    }

    this.reconnectAttempts++;

    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.error(`[API] Max reconnect attempts reached. Circuit breaker active for ${CIRCUIT_BREAKER_DURATION_MS / 1000}s`);
      this.circuitBreakerOpen = true;
      this.circuitBreakerResetTime = Date.now() + CIRCUIT_BREAKER_DURATION_MS;
      this.reconnectAttempts = 0;
      this.reconnectTimer = setTimeout(() => this.scheduleReconnect(), CIRCUIT_BREAKER_DURATION_MS);
      return;
    }

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS
    );
    const jitter = Math.random() * delay * 0.5;
    const reconnectDelay = Math.floor(delay + jitter);

    console.log(`[API] Reconnecting in ${reconnectDelay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    this.reconnectTimer = setTimeout(() => {
      if (!this.isConnected && !this.destroyed) {
        this.connect();
      }
    }, reconnectDelay);
  }

  stop(): void {
    console.log('[API] Stopping');
    this.destroyed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
