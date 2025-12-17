import { RelayWebSocketClient } from './websocket';
import * as tmux from './tmux';
import { AgentConfig } from './types';

interface SessionHandlerOptions {
  config: AgentConfig;
  tmuxSession: string;
  onCreateSession?: (name: string) => void;
}

// Capture intervals
const CAPTURE_INTERVAL_ACTIVE_MS = 50;
const CAPTURE_INTERVAL_IDLE_MS = 200;
const ACTIVE_THRESHOLD_MS = 2000;
const FORCE_SEND_INTERVAL_MS = 10000;
const USE_COMPRESSION = true;
const MIN_COMPRESS_SIZE = 512;

export class TmuxSessionHandler {
  private config: AgentConfig;
  private tmuxSession: string;
  private sessionId: string;
  private wsClient: RelayWebSocketClient | null = null;
  private onCreateSession?: (name: string) => void;

  private running = false;
  private lastScreen = '';
  private lastForceSendTime = 0;
  private lastChangeTime = 0;
  private captureTimer: NodeJS.Timeout | null = null;

  constructor(options: SessionHandlerOptions) {
    this.config = options.config;
    this.tmuxSession = options.tmuxSession;
    this.sessionId = `${options.config.machineId}/${options.tmuxSession}`;
    this.onCreateSession = options.onCreateSession;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Add jitter to prevent thundering herd
    const jitter = Math.floor(Math.random() * 5000);
    console.log(`[${this.tmuxSession}] Starting in ${jitter}ms`);

    setTimeout(() => this.connectAndRun(), jitter);
  }

  private connectAndRun(): void {
    if (!this.running) return;

    this.wsClient = new RelayWebSocketClient({
      url: this.config.relay,
      sessionId: this.sessionId,
      machineId: this.config.machineId,
      token: this.config.token,
      label: this.tmuxSession,
      autoReconnect: true
    });

    this.wsClient.on('connected', () => {
      console.log(`[${this.tmuxSession}] Connected to relay`);
      this.startScreenCapture();
    });

    this.wsClient.on('disconnected', ({ code, reason }) => {
      console.log(`[${this.tmuxSession}] Disconnected: code=${code}, reason=${reason}`);
      this.stopScreenCapture();
    });

    this.wsClient.on('keys', (keys: string) => {
      this.handleKeys(keys);
    });

    this.wsClient.on('resize', ({ cols, rows }: { cols: number; rows: number }) => {
      console.log(`[${this.tmuxSession}] Resize: ${cols}x${rows}`);
      tmux.resizeWindow(this.tmuxSession, cols, rows);
    });

    this.wsClient.on('createSession', (name: string) => {
      console.log(`[${this.tmuxSession}] Create session request: ${name}`);
      if (this.onCreateSession) {
        this.onCreateSession(name);
      }
    });

    this.wsClient.on('killSession', () => {
      console.log(`[${this.tmuxSession}] Kill session request`);
      tmux.killSession(this.tmuxSession);
      this.stop();
    });

    this.wsClient.on('error', (error: Error) => {
      console.error(`[${this.tmuxSession}] WebSocket error:`, error.message);
    });

    this.wsClient.connect();
  }

  private handleKeys(keys: string): void {
    tmux.sendKeys(this.tmuxSession, keys, false);
  }

  private startScreenCapture(): void {
    if (this.captureTimer) return;

    const capture = () => {
      if (!this.running || !this.wsClient?.getConnected()) {
        // Wait and retry
        this.captureTimer = setTimeout(capture, 500);
        return;
      }

      try {
        const screen = tmux.capturePane(this.tmuxSession);
        if (screen !== null) {
          const now = Date.now();
          const changed = screen !== this.lastScreen;
          const forceTime = (now - this.lastForceSendTime) >= FORCE_SEND_INTERVAL_MS;

          if (changed || forceTime) {
            this.lastScreen = screen;
            this.lastForceSendTime = now;
            if (changed) {
              this.lastChangeTime = now;
            }

            // Send clear screen + content
            const fullOutput = '\x1b[2J\x1b[H' + screen;
            const data = Buffer.from(fullOutput, 'utf-8');

            // Compress if enabled and data is large enough
            if (USE_COMPRESSION && data.length > MIN_COMPRESS_SIZE) {
              this.wsClient.sendScreenCompressed(data);
            } else {
              this.wsClient.sendScreen(data);
            }
          }

          // Adaptive sleep: faster when active, slower when idle
          const isActive = (now - this.lastChangeTime) < ACTIVE_THRESHOLD_MS;
          const sleepMs = isActive ? CAPTURE_INTERVAL_ACTIVE_MS : CAPTURE_INTERVAL_IDLE_MS;
          this.captureTimer = setTimeout(capture, sleepMs);
        } else {
          this.captureTimer = setTimeout(capture, CAPTURE_INTERVAL_IDLE_MS);
        }
      } catch (error) {
        console.error(`[${this.tmuxSession}] Screen capture error:`, error);
        this.captureTimer = setTimeout(capture, 500);
      }
    };

    capture();
    console.log(`[${this.tmuxSession}] Screen capture started`);
  }

  private stopScreenCapture(): void {
    if (this.captureTimer) {
      clearTimeout(this.captureTimer);
      this.captureTimer = null;
    }
  }

  stop(): void {
    console.log(`[${this.tmuxSession}] Stopping`);
    this.running = false;
    this.stopScreenCapture();

    if (this.wsClient) {
      this.wsClient.destroy();
      this.wsClient = null;
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getTmuxSession(): string {
    return this.tmuxSession;
  }
}
