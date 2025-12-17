import { spawn, execSync } from 'child_process';
import { ExecConfig, ExecResult } from './types';

export class CommandExecutionService {
  private config: ExecConfig;

  constructor(config?: ExecConfig) {
    this.config = config || {
      enabled: false,
      shell: '/bin/bash',
      defaultTimeout: 30000
    };
  }

  async executeCommand(
    command: string,
    cwd?: string,
    timeout?: number,
    sessionId?: string
  ): Promise<ExecResult> {
    const startTime = Date.now();

    if (!this.config.enabled) {
      return {
        exitCode: -1,
        stdout: '',
        stderr: 'Command execution is disabled on this agent',
        duration: 0
      };
    }

    // Check allowed commands if configured
    if (this.config.allowedCommands && this.config.allowedCommands.length > 0) {
      const allowed = this.config.allowedCommands.some(
        pattern => command.startsWith(pattern) || new RegExp(pattern).test(command)
      );
      if (!allowed) {
        return {
          exitCode: -1,
          stdout: '',
          stderr: 'Command not in allowed list',
          duration: 0
        };
      }
    }

    const timeoutMs = timeout ?? this.config.defaultTimeout;
    const workingDir = cwd ?? this.config.workingDir;
    const shell = this.config.shell || '/bin/bash';

    return new Promise((resolve) => {
      try {
        // If sessionId is provided, run in tmux session
        if (sessionId) {
          try {
            execSync(`tmux send-keys -t "${sessionId}" "${escapeForShell(command)}" Enter`, {
              stdio: 'pipe',
              timeout: timeoutMs
            });
            resolve({
              exitCode: 0,
              stdout: 'Command sent to tmux session',
              stderr: '',
              duration: Date.now() - startTime
            });
          } catch (error: any) {
            resolve({
              exitCode: -1,
              stdout: '',
              stderr: error.message || 'Failed to send to tmux',
              duration: Date.now() - startTime
            });
          }
          return;
        }

        // Direct shell execution
        const child = spawn(shell, ['-c', command], {
          cwd: workingDir || undefined,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        let killed = false;

        const timer = setTimeout(() => {
          killed = true;
          child.kill('SIGKILL');
        }, timeoutMs);

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          clearTimeout(timer);
          const duration = Date.now() - startTime;

          if (killed) {
            resolve({
              exitCode: -1,
              stdout: '',
              stderr: `Command timed out after ${timeoutMs}ms`,
              duration
            });
          } else {
            resolve({
              exitCode: code ?? -1,
              stdout,
              stderr,
              duration
            });
          }
        });

        child.on('error', (error) => {
          clearTimeout(timer);
          resolve({
            exitCode: -1,
            stdout: '',
            stderr: `Execution error: ${error.message}`,
            duration: Date.now() - startTime
          });
        });

      } catch (error: any) {
        resolve({
          exitCode: -1,
          stdout: '',
          stderr: `Execution error: ${error.message}`,
          duration: Date.now() - startTime
        });
      }
    });
  }
}

function escapeForShell(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}
