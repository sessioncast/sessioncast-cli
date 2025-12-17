import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { Message } from './types';
import * as zlib from 'zlib';

interface WebSocketClientOptions {
  url: string;
  sessionId: string;
  machineId: string;
  token: string;
  label?: string;
  autoReconnect?: boolean;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 60000;
const CIRCUIT_BREAKER_DURATION_MS = 120000;

export class RelayWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private sessionId: string;
  private machineId: string;
  private token: string;
  private label: string;
  private autoReconnect: boolean;

  private isConnected = false;
  private reconnectAttempts = 0;
  private circuitBreakerOpen = false;
  private circuitBreakerResetTime = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  constructor(options: WebSocketClientOptions) {
    super();
    this.url = options.url;
    this.sessionId = options.sessionId;
    this.machineId = options.machineId;
    this.token = options.token;
    this.label = options.label || options.sessionId;
    this.autoReconnect = options.autoReconnect ?? true;
  }

  connect(): void {
    if (this.destroyed) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.circuitBreakerOpen = false;
        this.emit('connected');
        this.registerAsHost();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message: Message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      });

      this.ws.on('close', (code, reason) => {
        this.isConnected = false;
        this.emit('disconnected', { code, reason: reason.toString() });

        if (this.autoReconnect && !this.destroyed) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error) => {
        this.emit('error', error);
      });

    } catch (error) {
      this.emit('error', error);
      if (this.autoReconnect && !this.destroyed) {
        this.scheduleReconnect();
      }
    }
  }

  private registerAsHost(): void {
    const meta: Record<string, string> = {
      label: this.label,
      machineId: this.machineId,
    };
    if (this.token) {
      meta.token = this.token;
    }

    this.send({
      type: 'register',
      role: 'host',
      session: this.sessionId,
      meta
    });
  }

  private handleMessage(message: Message): void {
    switch (message.type) {
      case 'keys':
        if (message.session === this.sessionId && message.payload) {
          this.emit('keys', message.payload);
        }
        break;

      case 'resize':
        if (message.session === this.sessionId && message.meta) {
          const cols = parseInt(message.meta.cols, 10);
          const rows = parseInt(message.meta.rows, 10);
          if (!isNaN(cols) && !isNaN(rows)) {
            this.emit('resize', { cols, rows });
          }
        }
        break;

      case 'createSession':
        if (message.meta?.sessionName) {
          this.emit('createSession', message.meta.sessionName);
        }
        break;

      case 'killSession':
        if (message.session === this.sessionId) {
          this.emit('killSession');
        }
        break;

      case 'error':
        this.handleError(message);
        break;

      default:
        this.emit('message', message);
    }
  }

  private handleError(message: Message): void {
    const meta = message.meta;
    if (!meta) return;

    if (meta.code === 'LIMIT_EXCEEDED') {
      console.error('============================================================');
      console.error('SESSION LIMIT EXCEEDED');
      console.error('============================================================');
      console.error(`Resource: ${meta.resource}`);
      console.error(`Current: ${meta.current}, Max: ${meta.max}`);
      console.error(`Message: ${meta.messageEn}`);
      console.error(`한국어: ${meta.messageKo}`);
      console.error(`Upgrade at: ${meta.upgradeUrl}`);
      console.error('============================================================');

      // Stop reconnection and exit
      this.autoReconnect = false;
      this.destroy();
      process.exit(1);
    } else {
      console.error(`Error: code=${meta.code}, message=${meta.messageEn}`);
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;

    // Check circuit breaker
    if (this.circuitBreakerOpen) {
      const now = Date.now();
      if (now < this.circuitBreakerResetTime) {
        const remainingSeconds = Math.ceil((this.circuitBreakerResetTime - now) / 1000);
        console.log(`Circuit breaker open. Retry in ${remainingSeconds} seconds`);
        this.reconnectTimer = setTimeout(() => this.scheduleReconnect(), this.circuitBreakerResetTime - now);
        return;
      } else {
        console.log('Circuit breaker reset');
        this.circuitBreakerOpen = false;
        this.reconnectAttempts = 0;
      }
    }

    this.reconnectAttempts++;

    // Check max attempts
    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.error(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Circuit breaker active for ${CIRCUIT_BREAKER_DURATION_MS / 1000} seconds`);
      this.circuitBreakerOpen = true;
      this.circuitBreakerResetTime = Date.now() + CIRCUIT_BREAKER_DURATION_MS;
      this.reconnectAttempts = 0;
      this.reconnectTimer = setTimeout(() => this.scheduleReconnect(), CIRCUIT_BREAKER_DURATION_MS);
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS
    );
    const jitter = Math.random() * delay * 0.5;
    const reconnectDelay = Math.floor(delay + jitter);

    console.log(`Reconnecting in ${reconnectDelay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    this.reconnectTimer = setTimeout(() => {
      if (!this.isConnected && !this.destroyed) {
        this.connect();
      }
    }, reconnectDelay);
  }

  send(message: Message): boolean {
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

  sendScreen(data: Buffer): boolean {
    if (!this.isConnected) return false;

    const base64Data = data.toString('base64');
    return this.send({
      type: 'screen',
      session: this.sessionId,
      payload: base64Data
    });
  }

  sendScreenCompressed(data: Buffer): boolean {
    if (!this.isConnected) return false;

    try {
      const compressed = zlib.gzipSync(data);
      const base64Data = compressed.toString('base64');
      return this.send({
        type: 'screenGz',
        session: this.sessionId,
        payload: base64Data
      });
    } catch {
      return this.sendScreen(data);
    }
  }

  getConnected(): boolean {
    return this.isConnected;
  }

  destroy(): void {
    this.destroyed = true;
    this.autoReconnect = false;

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
