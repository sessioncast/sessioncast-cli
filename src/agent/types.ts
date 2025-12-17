// Agent configuration types
export interface AgentConfig {
  machineId: string;
  relay: string;
  token: string;
  api?: ApiConfig;
}

export interface ApiConfig {
  enabled: boolean;
  agentId?: string;
  exec?: ExecConfig;
  llm?: LlmConfig;
}

export interface ExecConfig {
  enabled: boolean;
  shell: string;
  workingDir?: string;
  allowedCommands?: string[];
  defaultTimeout: number;
}

export interface LlmConfig {
  enabled: boolean;
  provider: 'ollama' | 'openai';
  baseUrl: string;
  model: string;
  apiKey?: string;
}

// WebSocket message types
export interface Message {
  type: string;
  role?: string;
  session?: string;
  payload?: string;
  meta?: Record<string, string>;
}

// tmux session info
export interface TmuxSession {
  name: string;
  windows: number;
  created?: string;
  attached: boolean;
}

// Exec result
export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

// LLM types
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: {
    message: string;
    type: string;
  };
}
