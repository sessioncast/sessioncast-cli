import { spawn, execSync } from 'child_process';
import { TmuxSession } from './types';

/**
 * Scan for all tmux sessions
 */
export function scanSessions(): string[] {
  try {
    const output = execSync('tmux ls -F "#{session_name}"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return output
      .trim()
      .split('\n')
      .filter(s => s.length > 0);
  } catch {
    // tmux not running or no sessions
    return [];
  }
}

/**
 * Get detailed session info
 */
export function listSessions(): TmuxSession[] {
  try {
    const output = execSync(
      'tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_created}|#{session_attached}"',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    return output
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => {
        const [name, windows, created, attached] = line.split('|');
        return {
          name,
          windows: parseInt(windows, 10) || 1,
          created: created || undefined,
          attached: attached === '1'
        };
      });
  } catch {
    return [];
  }
}

/**
 * Capture tmux pane content with escape sequences (colors)
 */
export function capturePane(sessionName: string): string | null {
  try {
    const output = execSync(`tmux capture-pane -t "${sessionName}" -p -e -N`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024 // 10MB
    });
    // Normalize line endings
    return output.replace(/\n/g, '\r\n');
  } catch {
    return null;
  }
}

/**
 * Send keys to tmux session
 */
export function sendKeys(target: string, keys: string, enter: boolean = true): boolean {
  try {
    // Handle special keys
    if (keys === '\x03') {
      // Ctrl+C
      execSync(`tmux send-keys -t "${target}" C-c`, { stdio: 'pipe' });
      return true;
    }
    if (keys === '\x04') {
      // Ctrl+D
      execSync(`tmux send-keys -t "${target}" C-d`, { stdio: 'pipe' });
      return true;
    }

    // For Enter key only
    if (keys === '\n' || keys === '\r\n') {
      execSync(`tmux send-keys -t "${target}" Enter`, { stdio: 'pipe' });
      return true;
    }

    // For text with newline at end (command + enter)
    if (keys.endsWith('\n')) {
      const cmd = keys.slice(0, -1);
      if (cmd) {
        execSync(`tmux send-keys -t "${target}" -l "${escapeForShell(cmd)}"`, { stdio: 'pipe' });
      }
      execSync(`tmux send-keys -t "${target}" Enter`, { stdio: 'pipe' });
      return true;
    }

    // Regular text input
    execSync(`tmux send-keys -t "${target}" -l "${escapeForShell(keys)}"`, { stdio: 'pipe' });

    if (enter) {
      execSync(`tmux send-keys -t "${target}" Enter`, { stdio: 'pipe' });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Resize tmux window
 */
export function resizeWindow(sessionName: string, cols: number, rows: number): boolean {
  try {
    execSync(`tmux resize-window -t "${sessionName}" -x ${cols} -y ${rows}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create new tmux session
 */
export function createSession(sessionName: string): boolean {
  try {
    // Sanitize session name
    const sanitized = sessionName.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!sanitized) return false;

    execSync(`tmux new-session -d -s "${sanitized}"`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill tmux session
 */
export function killSession(sessionName: string): boolean {
  try {
    execSync(`tmux kill-session -t "${sessionName}"`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Escape string for shell
 */
function escapeForShell(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}
