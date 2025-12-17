import { LlmConfig, LlmMessage, LlmResponse } from './types';

export class LlmService {
  private config: LlmConfig;

  constructor(config?: LlmConfig) {
    this.config = config || {
      enabled: false,
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama2'
    };
  }

  async chat(
    model?: string,
    messages?: LlmMessage[],
    temperature?: number,
    maxTokens?: number,
    stream?: boolean
  ): Promise<LlmResponse> {
    if (!this.config.enabled) {
      return {
        id: '',
        object: 'error',
        created: Date.now(),
        model: '',
        choices: [],
        error: {
          message: 'LLM is disabled on this agent',
          type: 'service_unavailable'
        }
      };
    }

    const provider = this.config.provider || 'ollama';
    const actualModel = model || this.config.model;

    try {
      switch (provider.toLowerCase()) {
        case 'ollama':
          return await this.callOllama(actualModel, messages || [], temperature, maxTokens);
        case 'openai':
          return await this.callOpenAi(actualModel, messages || [], temperature, maxTokens);
        default:
          return {
            id: '',
            object: 'error',
            created: Date.now(),
            model: '',
            choices: [],
            error: {
              message: `Unknown LLM provider: ${provider}`,
              type: 'invalid_request'
            }
          };
      }
    } catch (error: any) {
      return {
        id: '',
        object: 'error',
        created: Date.now(),
        model: '',
        choices: [],
        error: {
          message: error.message,
          type: 'internal_error'
        }
      };
    }
  }

  private async callOllama(
    model: string,
    messages: LlmMessage[],
    temperature?: number,
    maxTokens?: number
  ): Promise<LlmResponse> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434';

    const requestBody: any = {
      model,
      messages,
      stream: false
    };

    const options: any = {};
    if (temperature !== undefined) {
      options.temperature = temperature;
    }
    if (maxTokens !== undefined) {
      options.num_predict = maxTokens;
    }
    if (Object.keys(options).length > 0) {
      requestBody.options = options;
    }

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Ollama returned status ${response.status}`);
    }

    const ollamaResponse = await response.json() as any;
    return this.convertOllamaToOpenAiFormat(ollamaResponse, model);
  }

  private convertOllamaToOpenAiFormat(ollamaResponse: any, model: string): LlmResponse {
    const message = ollamaResponse.message || {};
    const content = message.content || '';

    const promptTokens = ollamaResponse.prompt_eval_count || 0;
    const completionTokens = ollamaResponse.eval_count || 0;

    return {
      id: `chatcmpl-${Math.random().toString(36).substring(2, 10)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      }
    };
  }

  private async callOpenAi(
    model: string,
    messages: LlmMessage[],
    temperature?: number,
    maxTokens?: number
  ): Promise<LlmResponse> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    const apiKey = this.config.apiKey;

    if (!apiKey) {
      return {
        id: '',
        object: 'error',
        created: Date.now(),
        model: '',
        choices: [],
        error: {
          message: 'OpenAI API key not configured',
          type: 'configuration_error'
        }
      };
    }

    const requestBody: any = {
      model,
      messages
    };

    if (temperature !== undefined) {
      requestBody.temperature = temperature;
    }
    if (maxTokens !== undefined) {
      requestBody.max_tokens = maxTokens;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`OpenAI returned status ${response.status}`);
    }

    return await response.json() as LlmResponse;
  }
}
