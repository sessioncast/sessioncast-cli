import { TmuxExecutor, createTmuxExecutor, getPlatformName } from './tmux-executor';
import { TmuxSession } from './types';

// Lazy-initialized executor (created on first use)
let executor: TmuxExecutor | null = null;

/**
 * Get or create the tmux executor for the current platform.
 */
function getExecutor(): TmuxExecutor {
  if (!executor) {
    console.log(`[tmux] Initializing on ${getPlatformName()}`);
    executor = createTmuxExecutor();
    const version = executor.getVersion();
    console.log(`[tmux] Version: ${version}`);
  }
  return executor;
}

/**
 * Scan for all tmux sessions
 */
export function scanSessions(): string[] {
  return getExecutor().listSessions();
}

/**
 * Get detailed session info
 */
export function listSessions(): TmuxSession[] {
  try {
    const sessions = getExecutor().listSessions();
    // For now, return basic info (detailed info would require additional tmux commands)
    return sessions.map(name => ({
      name,
      windows: 1,
      attached: false
    }));
  } catch {
    return [];
  }
}

/**
 * Capture tmux pane content with escape sequences (colors)
 */
export function capturePane(sessionName: string): string | null {
  return getExecutor().capturePane(sessionName);
}

/**
 * Send keys to tmux session
 */
export function sendKeys(target: string, keys: string, enter: boolean = true): boolean {
  const exec = getExecutor();

  try {
    // Handle special keys
    if (keys === '\x03') {
      // Ctrl+C
      return exec.sendSpecialKey(target, 'C-c');
    }
    if (keys === '\x04') {
      // Ctrl+D
      return exec.sendSpecialKey(target, 'C-d');
    }

    // For Enter key only
    if (keys === '\n' || keys === '\r\n') {
      return exec.sendSpecialKey(target, 'Enter');
    }

    // For text with newline at end (command + enter)
    if (keys.endsWith('\n')) {
      const cmd = keys.slice(0, -1);
      if (cmd) {
        exec.sendKeys(target, cmd);
      }
      return exec.sendSpecialKey(target, 'Enter');
    }

    // Regular text input
    exec.sendKeys(target, keys);

    if (enter) {
      exec.sendSpecialKey(target, 'Enter');
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
  return getExecutor().resizeWindow(sessionName, cols, rows);
}

/**
 * Create new tmux session
 */
export function createSession(sessionName: string, workingDir?: string): boolean {
  return getExecutor().createSession(sessionName, workingDir);
}

/**
 * Kill tmux session
 */
export function killSession(sessionName: string): boolean {
  return getExecutor().killSession(sessionName);
}

/**
 * Check if tmux is available
 */
export function isAvailable(): boolean {
  try {
    return getExecutor().isAvailable();
  } catch {
    return false;
  }
}

/**
 * Get tmux version
 */
export function getVersion(): string | null {
  try {
    return getExecutor().getVersion();
  } catch {
    return null;
  }
}
