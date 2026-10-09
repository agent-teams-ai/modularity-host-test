import { spawn, type ChildProcess } from 'node:child_process';
import type { Resources } from '@get-modular/resources';

export type ProcessGroup = { readonly child: ChildProcess; readonly pgid: number; readonly closed: Promise<unknown> };

const exited = (child: ChildProcess): boolean => child.exitCode !== null || child.signalCode !== null;

// ESRCH: no member is left. EPERM after the leader exited: macOS reports it while the remaining
// members are zombies that init has not reaped yet. With a live leader EPERM is a real failure.
function signalGroup(child: ChildProcess, pgid: number, signal: NodeJS.Signals): void {
  try { process.kill(-pgid, signal); } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH' || (code === 'EPERM' && exited(child))) return;
    throw error;
  }
}

/**
 * POSIX recipe from the resources README: a detached leader owns a process group. Release sends SIGTERM
 * to the group, SIGKILL when escalate aborts, and SIGKILL again after the leader closed so no member survives.
 */
export function spawnGroup(resources: Resources, name: string, command: string, args: readonly string[]): Promise<ProcessGroup> {
  return resources.setup({
    name,
    setup: () => {
      const child = spawn(command, args, { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
      if (child.pid === undefined) throw new Error(`${name}: the leader did not start`);
      const closed = new Promise(resolve => { child.once('close', resolve); });
      return { child, pgid: child.pid, closed };
    },
    cleanup: async ({ child, pgid, closed }, { escalate }) => {
      const kill = (): void => { signalGroup(child, pgid, 'SIGKILL'); };
      signalGroup(child, pgid, 'SIGTERM');
      if (escalate.aborted) kill(); else escalate.addEventListener('abort', kill, { once: true });
      try { await closed; } finally { escalate.removeEventListener('abort', kill); }
      kill();
    },
  });
}
