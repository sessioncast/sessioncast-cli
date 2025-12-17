import fetch from 'node-fetch';
import { getApiKey, getApiUrl } from './config';

export interface Agent {
  id: string;
  label: string | null;
  machineId: string | null;
  isActive: boolean;
  apiEnabled: boolean;
  lastConnectedAt: string | null;
  createdAt: string;
}

export interface TmuxSession {
  name: string;
  windows: number;
  created: string | null;
  attached: boolean;
}

export interface SendKeysResult {
  success: boolean;
  agentId: string;
  target: string;
  error?: string;
}

class ApiClient {
  private getHeaders(): Record<string, string> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('Not logged in. Run: sessioncast login');
    }
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  async listAgents(): Promise<Agent[]> {
    const url = `${getApiUrl()}/api/v1/agents`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error((error as any).message || 'Failed to list agents');
    }

    const data = await response.json() as { agents: Agent[] };
    return data.agents;
  }

  async getAgent(agentId: string): Promise<Agent> {
    const url = `${getApiUrl()}/api/v1/agents/${agentId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error('Agent not found');
    }

    return await response.json() as Agent;
  }

  async listSessions(agentId: string): Promise<TmuxSession[]> {
    const url = `${getApiUrl()}/api/v1/agents/${agentId}/sessions`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error((error as any).message || 'Failed to list sessions');
    }

    const data = await response.json() as { sessions: TmuxSession[] };
    return data.sessions;
  }

  async sendKeys(agentId: string, target: string, keys: string, enter: boolean = true): Promise<SendKeysResult> {
    const url = `${getApiUrl()}/api/v1/agents/${agentId}/send-keys`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ target, keys, enter })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error((error as any).message || 'Failed to send keys');
    }

    return await response.json() as SendKeysResult;
  }

  async findAgentByName(name: string): Promise<Agent | null> {
    const agents = await this.listAgents();
    // Search by label or machineId
    return agents.find(a =>
      a.label?.toLowerCase() === name.toLowerCase() ||
      a.machineId?.toLowerCase() === name.toLowerCase() ||
      a.id === name
    ) || null;
  }
}

export const api = new ApiClient();
