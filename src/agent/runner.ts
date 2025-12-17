import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { AgentConfig } from './types';
import { TmuxSessionHandler } from './session-handler';
import { ApiWebSocketClient } from './api-client';
import * as tmux from './tmux';

const SCAN_INTERVAL_MS = 5000;

export class AgentRunner {
  private config: AgentConfig;
  private handlers: Map<string, TmuxSessionHandler> = new Map();
  private apiClient: ApiWebSocketClient | null = null;
  private scanTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  static loadConfig(configPath?: string): AgentConfig {
    // Check environment variable
    const envPath = process.env.SESSIONCAST_CONFIG || process.env.TMUX_REMOTE_CONFIG;

    // Try multiple default paths
    const defaultPaths = [
      path.join(process.env.HOME || '', '.sessioncast.yml'),
      path.join(process.env.HOME || '', '.tmux-remote.yml'),
    ];

    let finalPath = configPath || envPath;

    if (!finalPath) {
      for (const p of defaultPaths) {
        if (fs.existsSync(p)) {
          finalPath = p;
          break;
        }
      }
    }

    if (!finalPath || !fs.existsSync(finalPath)) {
      throw new Error(`Config file not found. Tried: ${configPath || envPath || defaultPaths.join(', ')}`);
    }

    console.log(`Loading config from: ${finalPath}`);

    const content = fs.readFileSync(finalPath, 'utf-8');
    const ext = path.extname(finalPath).toLowerCase();

    if (ext === '.json') {
      return JSON.parse(content);
    } else {
      return yaml.load(content) as AgentConfig;
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log('Starting SessionCast Agent...');
    console.log(`Machine ID: ${this.config.machineId}`);
    console.log(`Relay: ${this.config.relay}`);
    console.log(`Token: ${this.config.token ? 'present' : 'none'}`);

    // Start API client if configured
    if (this.config.api?.enabled && this.config.api.agentId) {
      this.apiClient = new ApiWebSocketClient(this.config);
      this.apiClient.start();
    }

    // Initial scan
    this.scanAndUpdateSessions();

    // Schedule periodic scan
    this.scanTimer = setInterval(() => {
      this.scanAndUpdateSessions();
    }, SCAN_INTERVAL_MS);

    console.log(`Agent started with auto-discovery (scanning every ${SCAN_INTERVAL_MS / 1000}s)`);

    // Handle shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  private scanAndUpdateSessions(): void {
    try {
      const currentSessions = new Set(tmux.scanSessions());
      const trackedSessions = new Set(this.handlers.keys());

      // Start handlers for new sessions
      for (const session of currentSessions) {
        if (!trackedSessions.has(session)) {
          this.startSessionHandler(session);
        }
      }

      // Stop handlers for removed sessions
      for (const session of trackedSessions) {
        if (!currentSessions.has(session)) {
          this.stopSessionHandler(session);
        }
      }
    } catch (error) {
      console.error('Error during session scan:', error);
    }
  }

  private startSessionHandler(tmuxSession: string): void {
    console.log(`Discovered new tmux session: ${tmuxSession}`);

    const handler = new TmuxSessionHandler({
      config: this.config,
      tmuxSession,
      onCreateSession: (name) => this.createTmuxSession(name)
    });

    this.handlers.set(tmuxSession, handler);
    handler.start();

    console.log(`Started handler for session: ${this.config.machineId}/${tmuxSession}`);
  }

  private stopSessionHandler(tmuxSession: string): void {
    console.log(`Tmux session removed: ${tmuxSession}`);

    const handler = this.handlers.get(tmuxSession);
    if (handler) {
      handler.stop();
      this.handlers.delete(tmuxSession);
      console.log(`Stopped handler for session: ${this.config.machineId}/${tmuxSession}`);
    }
  }

  private createTmuxSession(sessionName: string): void {
    // Sanitize session name
    const sanitized = sessionName.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!sanitized) {
      console.warn(`Invalid session name: ${sessionName}`);
      return;
    }

    if (this.handlers.has(sanitized)) {
      console.warn(`Session already exists: ${sanitized}`);
      return;
    }

    console.log(`Creating new tmux session: ${sanitized}`);

    if (tmux.createSession(sanitized)) {
      console.log(`Successfully created tmux session: ${sanitized}`);
      // Force immediate scan
      this.scanAndUpdateSessions();
    } else {
      console.error(`Failed to create tmux session: ${sanitized}`);
    }
  }

  stop(): void {
    console.log('Shutting down Agent...');
    this.running = false;

    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }

    if (this.apiClient) {
      this.apiClient.stop();
      this.apiClient = null;
    }

    for (const handler of this.handlers.values()) {
      handler.stop();
    }
    this.handlers.clear();

    console.log('Agent shutdown complete');
    process.exit(0);
  }
}
