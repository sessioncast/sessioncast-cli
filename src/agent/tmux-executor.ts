import { execSync, spawnSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Interface for tmux operations.
 * Implementations handle platform-specific differences (Unix vs Windows/itmux).
 */
export interface TmuxExecutor {
  listSessions(): string[];
  capturePane(session: string): string | null;
  sendKeys(session: string, keys: string): boolean;
  sendSpecialKey(session: string, key: string): boolean;
  resizeWindow(session: string, cols: number, rows: number): boolean;
  killSession(session: string): boolean;
  createSession(session: string, workingDir?: string): boolean;
  isAvailable(): boolean;
  getVersion(): string | null;
}

/**
 * Unix/Linux/macOS implementation of TmuxExecutor.
 */
export class UnixTmuxExecutor implements TmuxExecutor {
  listSessions(): string[] {
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
      return [];
    }
  }

  capturePane(session: string): string | null {
    try {
      const output = execSync(`tmux capture-pane -t "${session}" -p -e -N`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024
      });
      return output.replace(/\n/g, '\r\n');
    } catch {
      return null;
    }
  }

  sendKeys(session: string, keys: string): boolean {
    try {
      const escaped = this.escapeForShell(keys);
      execSync(`tmux send-keys -t "${session}" -l "${escaped}"`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  sendSpecialKey(session: string, key: string): boolean {
    try {
      execSync(`tmux send-keys -t "${session}" ${key}`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  resizeWindow(session: string, cols: number, rows: number): boolean {
    try {
      execSync(`tmux resize-window -t "${session}" -x ${cols} -y ${rows}`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  killSession(session: string): boolean {
    try {
      execSync(`tmux kill-session -t "${session}"`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  createSession(session: string, workingDir?: string): boolean {
    try {
      const sanitized = session.replace(/[^a-zA-Z0-9_-]/g, '_');
      if (!sanitized) return false;

      let cmd = `tmux new-session -d -s "${sanitized}"`;
      if (workingDir) {
        cmd += ` -c "${workingDir}"`;
      }
      execSync(cmd, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  isAvailable(): boolean {
    try {
      execSync('which tmux', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  getVersion(): string | null {
    try {
      return execSync('tmux -V', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch {
      return null;
    }
  }

  private escapeForShell(str: string): string {
    return str.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  }
}

/**
 * Windows implementation of TmuxExecutor using itmux (Cygwin + tmux bundle).
 */
export class WindowsTmuxExecutor implements TmuxExecutor {
  private itmuxPath: string;
  private bashPath: string;

  constructor(itmuxPath: string) {
    this.itmuxPath = itmuxPath;
    this.bashPath = path.join(itmuxPath, 'bin', 'bash.exe');

    if (!fs.existsSync(this.bashPath)) {
      throw new Error(`itmux bash not found at: ${this.bashPath}`);
    }

    console.log(`[Windows] Using itmux at: ${itmuxPath}`);
  }

  private executeCommand(command: string): string {
    try {
      const result = spawnSync(this.bashPath, ['-l', '-c', command], {
        encoding: 'utf-8',
        cwd: this.itmuxPath,
        env: {
          ...process.env,
          CYGWIN: 'nodosfilewarning',
          HOME: `/home/${os.userInfo().username}`,
          TERM: 'xterm-256color'
        },
        maxBuffer: 10 * 1024 * 1024
      });

      if (result.stderr) {
        // Log but don't fail on stderr (tmux often outputs to stderr)
        console.debug(`[itmux stderr] ${result.stderr}`);
      }

      return result.stdout?.trim() || '';
    } catch (error) {
      console.error(`[itmux] Command failed: ${command}`, error);
      return '';
    }
  }

  listSessions(): string[] {
    try {
      const output = this.executeCommand("tmux ls -F '#{session_name}' 2>/dev/null || true");
      if (!output) return [];

      return output
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('no server') && !s.includes('error'));
    } catch {
      return [];
    }
  }

  capturePane(session: string): string | null {
    try {
      const escaped = this.escapeSession(session);
      const output = this.executeCommand(`tmux capture-pane -t '${escaped}' -p -e -N`);
      if (!output) return null;
      return output.replace(/\n/g, '\r\n');
    } catch {
      return null;
    }
  }

  sendKeys(session: string, keys: string): boolean {
    try {
      const escapedSession = this.escapeSession(session);
      const escapedKeys = keys.replace(/'/g, "'\\''");
      this.executeCommand(`tmux send-keys -t '${escapedSession}' -l '${escapedKeys}'`);
      return true;
    } catch {
      return false;
    }
  }

  sendSpecialKey(session: string, key: string): boolean {
    try {
      const escaped = this.escapeSession(session);
      this.executeCommand(`tmux send-keys -t '${escaped}' ${key}`);
      return true;
    } catch {
      return false;
    }
  }

  resizeWindow(session: string, cols: number, rows: number): boolean {
    try {
      const escaped = this.escapeSession(session);
      this.executeCommand(`tmux resize-window -t '${escaped}' -x ${cols} -y ${rows}`);
      return true;
    } catch {
      return false;
    }
  }

  killSession(session: string): boolean {
    try {
      const escaped = this.escapeSession(session);
      this.executeCommand(`tmux kill-session -t '${escaped}'`);
      return true;
    } catch {
      return false;
    }
  }

  createSession(session: string, workingDir?: string): boolean {
    try {
      const sanitized = session.replace(/[^a-zA-Z0-9_-]/g, '_');
      if (!sanitized) return false;

      let cmd: string;
      if (workingDir) {
        const cygwinPath = this.windowsToCygwinPath(workingDir);
        cmd = `tmux new-session -d -s '${sanitized}' -c '${cygwinPath}'`;
      } else {
        cmd = `tmux new-session -d -s '${sanitized}'`;
      }
      this.executeCommand(cmd);
      return true;
    } catch {
      return false;
    }
  }

  isAvailable(): boolean {
    try {
      const version = this.getVersion();
      return version !== null && version.includes('tmux');
    } catch {
      return false;
    }
  }

  getVersion(): string | null {
    try {
      const output = this.executeCommand('tmux -V');
      return output || null;
    } catch {
      return null;
    }
  }

  private escapeSession(session: string): string {
    return session.replace(/'/g, "'\\''");
  }

  private windowsToCygwinPath(windowsPath: string): string {
    if (!windowsPath) return windowsPath;

    // Handle UNC paths
    if (windowsPath.startsWith('\\\\')) {
      return windowsPath;
    }

    // Handle drive letters (C:\...)
    if (windowsPath.length >= 2 && windowsPath[1] === ':') {
      const drive = windowsPath[0].toLowerCase();
      const rest = windowsPath.substring(2).replace(/\\/g, '/');
      return `/cygdrive/${drive}${rest}`;
    }

    return windowsPath.replace(/\\/g, '/');
  }

  /**
   * Find itmux installation path on Windows.
   */
  static findItmuxPath(): string | null {
    // 1. Check environment variable
    const envPath = process.env.ITMUX_HOME;
    if (envPath && fs.existsSync(path.join(envPath, 'bin', 'bash.exe'))) {
      return envPath;
    }

    // 2. Check common locations
    const locations = [
      path.join(os.homedir(), 'itmux'),
      'C:\\itmux',
      'D:\\itmux',
      path.join(process.cwd(), 'itmux'),
      path.join(process.env.LOCALAPPDATA || '', 'itmux'),
      path.join(process.env.ProgramFiles || '', 'itmux'),
    ];

    for (const loc of locations) {
      if (loc && fs.existsSync(path.join(loc, 'bin', 'bash.exe'))) {
        return loc;
      }
    }

    return null;
  }
}

/**
 * Get the appropriate TmuxExecutor for the current platform.
 */
export function createTmuxExecutor(): TmuxExecutor {
  const isWindows = os.platform() === 'win32';

  if (isWindows) {
    const itmuxPath = WindowsTmuxExecutor.findItmuxPath();
    if (!itmuxPath) {
      throw new Error(
        'itmux not found. Please install itmux from https://github.com/itefixnet/itmux\n' +
        'Set ITMUX_HOME environment variable or place itmux in a standard location.'
      );
    }
    return new WindowsTmuxExecutor(itmuxPath);
  }

  return new UnixTmuxExecutor();
}

/**
 * Check if the current platform is Windows.
 */
export function isWindows(): boolean {
  return os.platform() === 'win32';
}

/**
 * Get platform name for logging.
 */
export function getPlatformName(): string {
  const platform = os.platform();
  if (platform === 'win32') return 'Windows';
  if (platform === 'darwin') return 'macOS';
  return 'Linux/Unix';
}
