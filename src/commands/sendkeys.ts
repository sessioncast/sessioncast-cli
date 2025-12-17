import chalk from 'chalk';
import ora from 'ora';
import { api } from '../api';
import { isLoggedIn } from '../config';

export async function sendKeys(
  target: string,
  keys: string,
  options: { noEnter?: boolean }
): Promise<void> {
  if (!isLoggedIn()) {
    console.log(chalk.red('Not logged in. Run: sessioncast login <api-key>'));
    process.exit(1);
  }

  // Parse target: "agent:session" or "agent:session:window"
  const parts = target.split(':');
  if (parts.length < 2) {
    console.log(chalk.red('Invalid target format.'));
    console.log(chalk.gray('Expected: <agent>:<session> or <agent>:<session>:<window>'));
    console.log(chalk.gray('Example: macbook:dev or server:main:0'));
    process.exit(1);
  }

  const agentName = parts[0];
  const sessionTarget = parts.slice(1).join(':'); // session:window or just session

  const spinner = ora('Finding agent...').start();

  try {
    // Find agent by name/label/machineId
    const agent = await api.findAgentByName(agentName);

    if (!agent) {
      spinner.stop();
      console.log(chalk.red(`Agent not found: ${agentName}`));
      console.log(chalk.gray('Run: sessioncast agents'));
      process.exit(1);
    }

    if (!agent.isActive) {
      spinner.stop();
      console.log(chalk.red(`Agent is offline: ${agentName}`));
      process.exit(1);
    }

    if (!agent.apiEnabled) {
      spinner.stop();
      console.log(chalk.red(`API is not enabled for agent: ${agentName}`));
      console.log(chalk.gray('Enable API in agent settings at https://account.sessioncast.io'));
      process.exit(1);
    }

    spinner.text = 'Sending keys...';

    const result = await api.sendKeys(
      agent.id,
      sessionTarget,
      keys,
      !options.noEnter
    );

    spinner.stop();

    if (result.success) {
      console.log(chalk.green(`✓ Keys sent to ${target}`));
      if (!options.noEnter) {
        console.log(chalk.gray('(Enter key was pressed)'));
      }
    } else {
      console.log(chalk.red(`Failed to send keys: ${result.error || 'Unknown error'}`));
      process.exit(1);
    }
  } catch (error) {
    spinner.stop();
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}
