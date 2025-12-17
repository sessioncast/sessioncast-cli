import chalk from 'chalk';
import { setApiKey, setApiUrl, isLoggedIn, clearApiKey } from '../config';

export async function login(apiKey: string, options: { url?: string }): Promise<void> {
  if (options.url) {
    setApiUrl(options.url);
    console.log(chalk.gray(`API URL set to: ${options.url}`));
  }

  // Validate API key format
  if (!apiKey.startsWith('sk-')) {
    console.log(chalk.red('Invalid API key format. Key should start with "sk-"'));
    process.exit(1);
  }

  setApiKey(apiKey);
  console.log(chalk.green('✓ Logged in successfully!'));
  console.log(chalk.gray('Your API key has been saved.'));
}

export async function logout(): Promise<void> {
  if (!isLoggedIn()) {
    console.log(chalk.yellow('Not logged in.'));
    return;
  }

  clearApiKey();
  console.log(chalk.green('✓ Logged out successfully!'));
}

export function status(): void {
  if (isLoggedIn()) {
    console.log(chalk.green('✓ Logged in'));
  } else {
    console.log(chalk.yellow('Not logged in'));
    console.log(chalk.gray('Run: sessioncast login <api-key>'));
  }
}
