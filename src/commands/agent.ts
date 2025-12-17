import chalk from 'chalk';
import { AgentRunner } from '../agent/runner';

interface AgentOptions {
  config?: string;
}

export async function startAgent(options: AgentOptions): Promise<void> {
  try {
    const config = AgentRunner.loadConfig(options.config);
    const runner = new AgentRunner(config);
    await runner.start();
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}
