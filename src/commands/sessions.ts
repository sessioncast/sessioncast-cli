import chalk from 'chalk';
import ora from 'ora';
import { api, Agent, TmuxSession } from '../api';
import { isLoggedIn } from '../config';

interface AgentSessions {
  agent: Agent;
  sessions: TmuxSession[];
}

export async function listSessions(agentName?: string): Promise<void> {
  if (!isLoggedIn()) {
    console.log(chalk.red('Not logged in. Run: sessioncast login <api-key>'));
    process.exit(1);
  }

  const spinner = ora('Fetching sessions...').start();

  try {
    const agents = await api.listAgents();
    const onlineAgents = agents.filter(a => a.isActive && a.apiEnabled);

    if (onlineAgents.length === 0) {
      spinner.stop();
      console.log(chalk.yellow('No online agents with API enabled.'));
      return;
    }

    // Filter by agent name if provided
    let targetAgents = onlineAgents;
    if (agentName) {
      const found = onlineAgents.find(a =>
        a.label?.toLowerCase() === agentName.toLowerCase() ||
        a.machineId?.toLowerCase() === agentName.toLowerCase() ||
        a.id.startsWith(agentName)
      );

      if (!found) {
        spinner.stop();
        console.log(chalk.red(`Agent not found: ${agentName}`));
        console.log(chalk.gray('Run: sessioncast agents'));
        process.exit(1);
      }

      targetAgents = [found];
    }

    // Fetch sessions from all target agents
    const allSessions: AgentSessions[] = [];

    for (const agent of targetAgents) {
      try {
        const sessions = await api.listSessions(agent.id);
        allSessions.push({ agent, sessions });
      } catch (error) {
        // Skip failed agents
      }
    }

    spinner.stop();

    if (allSessions.every(as => as.sessions.length === 0)) {
      console.log(chalk.yellow('No tmux sessions found.'));
      return;
    }

    console.log(chalk.bold('\nTmux Sessions:\n'));

    // Table header
    console.log(
      chalk.gray(
        padRight('AGENT', 16) +
        padRight('SESSION', 16) +
        padRight('WINDOWS', 10) +
        padRight('ATTACHED', 10) +
        'TARGET'
      )
    );
    console.log(chalk.gray('─'.repeat(70)));

    // Table rows
    for (const { agent, sessions } of allSessions) {
      const agentName = agent.label || agent.machineId || agent.id.substring(0, 8);

      for (const session of sessions) {
        const attached = session.attached ? chalk.green('yes') : chalk.gray('no');
        const target = `${agentName}:${session.name}`;

        console.log(
          padRight(agentName, 16) +
          padRight(session.name, 16) +
          padRight(String(session.windows), 10) +
          padRight(attached, 10) +
          chalk.cyan(target)
        );
      }
    }

    console.log();
    console.log(chalk.gray('Use: sessioncast send <target> "command"'));
  } catch (error) {
    spinner.stop();
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

function padRight(str: string, len: number): string {
  const plainStr = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, len - plainStr.length);
  return str + ' '.repeat(padding);
}
