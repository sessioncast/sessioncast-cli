import Conf from 'conf';

interface ConfigSchema {
  apiKey?: string;
  apiUrl: string;
}

const config = new Conf<ConfigSchema>({
  projectName: 'sessioncast',
  defaults: {
    apiUrl: 'https://api.sessioncast.io'
  }
});

export function getApiKey(): string | undefined {
  return config.get('apiKey');
}

export function setApiKey(key: string): void {
  config.set('apiKey', key);
}

export function clearApiKey(): void {
  config.delete('apiKey');
}

export function getApiUrl(): string {
  return config.get('apiUrl');
}

export function setApiUrl(url: string): void {
  config.set('apiUrl', url);
}

export function isLoggedIn(): boolean {
  return !!getApiKey();
}

export default config;
