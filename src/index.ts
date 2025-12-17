#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { login, logout, status } from './commands/login';
import { listAgents } from './commands/agents';
import { listSessions } from './commands/sessions';
import { sendKeys } from './commands/sendkeys';
import { startAgent } from './commands/agent';

const program = new Command();

program
  .name('sessioncast')
  .description('SessionCast CLI - Control your agents from anywhere')
  .version('0.1.0');

// Login command
program
  .command('login <api-key>')
  .description('Login with your API key')
  .option('-u, --url <url>', 'Custom API URL')
  .action(login);

// Logout command
program
  .command('logout')
  .description('Clear stored credentials')
  .action(logout);

// Status command
program
  .command('status')
  .description('Check login status')
  .action(status);

// Agents command
program
  .command('agents')
  .description('List your agents')
  .action(listAgents);

// List/Sessions command
program
  .command('list [agent]')
  .alias('ls')
  .description('List tmux sessions on agents')
  .action(listSessions);

// Send keys command
program
  .command('send <target> <keys>')
  .alias('sendkeys')
  .description('Send keys to a tmux session')
  .option('--no-enter', 'Do not press Enter after keys')
  .action(sendKeys);

// Agent command
program
  .command('agent')
  .description('Start the SessionCast agent')
  .option('-c, --config <path>', 'Path to config file')
  .action(startAgent);

// Help examples
program.on('--help', () => {
  console.log('');
  console.log('Examples:');
  console.log('  $ sessioncast login sk-xxx-xxx-xxx');
  console.log('  $ sessioncast agents');
  console.log('  $ sessioncast list');
  console.log('  $ sessioncast list macbook');
  console.log('  $ sessioncast send macbook:dev "ls -la"');
  console.log('  $ sessioncast send server:main:0 "npm run build"');
  console.log('  $ sessioncast agent                          # Start agent with default config');
  console.log('  $ sessioncast agent -c ~/.sessioncast.yml    # Start with custom config');
  console.log('');
  console.log('Target format:');
  console.log('  <agent>:<session>          - Send to session');
  console.log('  <agent>:<session>:<window> - Send to specific window');
  console.log('');
});

// Default action (no command)
program.action(() => {
  console.log(chalk.bold('\n  SessionCast CLI\n'));
  console.log('  Control your agents from anywhere.\n');
  console.log(chalk.gray('  Run `sessioncast --help` for usage.\n'));
});

program.parse();
