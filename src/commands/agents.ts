import chalk from 'chalk';
import ora from 'ora';
import { api } from '../api';
import { isLoggedIn } from '../config';

export async function listAgents(): Promise<void> {
  if (!isLoggedIn()) {
    console.log(chalk.red('Not logged in. Run: sessioncast login <api-key>'));
    process.exit(1);
  }

  const spinner = ora('Fetching agents...').start();

  try {
    const agents = await api.listAgents();
    spinner.stop();

    if (agents.length === 0) {
      console.log(chalk.yellow('No agents found.'));
      console.log(chalk.gray('Create an agent at https://account.sessioncast.io'));
      return;
    }

    console.log(chalk.bold('\nYour Agents:\n'));

    // Table header
    console.log(
      chalk.gray(
        padRight('NAME', 20) +
        padRight('STATUS', 12) +
        padRight('API', 8) +
        padRight('LAST SEEN', 20) +
        'ID'
      )
    );
    console.log(chalk.gray('─'.repeat(80)));

    // Table rows
    for (const agent of agents) {
      const name = agent.label || agent.machineId || 'unnamed';
      const status = agent.isActive ? chalk.green('● online') : chalk.gray('○ offline');
      const apiStatus = agent.apiEnabled ? chalk.green('yes') : chalk.gray('no');
      const lastSeen = agent.lastConnectedAt
        ? formatRelativeTime(new Date(agent.lastConnectedAt))
        : chalk.gray('never');

      console.log(
        padRight(name, 20) +
        padRight(status, 12) +
        padRight(apiStatus, 8) +
        padRight(lastSeen, 20) +
        chalk.gray(agent.id.substring(0, 8))
      );
    }

    console.log();
  } catch (error) {
    spinner.stop();
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

function padRight(str: string, len: number): string {
  // Remove ANSI codes for length calculation
  const plainStr = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, len - plainStr.length);
  return str + ' '.repeat(padding);
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}
