import type { Command, OptionValues } from 'commander';
import { usesDefaultStatusFilters } from './options.js';
import { attachSession, showStatus, type ShowStatusOptions } from './sessionDisplay.js';
import { deleteSessionsOlderThan } from '../sessionManager.js';

export interface StatusOptions extends OptionValues {
  hours: number;
  limit: number;
  all: boolean;
  clear?: boolean;
  clean?: boolean;
}

interface SessionCommandDependencies {
  showStatus: (options: ShowStatusOptions) => Promise<void> | void;
  attachSession: (sessionId: string) => Promise<void>;
  usesDefaultStatusFilters: (cmd: Command) => boolean;
  deleteSessionsOlderThan: typeof deleteSessionsOlderThan;
}

const defaultDependencies: SessionCommandDependencies = {
  showStatus,
  attachSession,
  usesDefaultStatusFilters,
  deleteSessionsOlderThan,
};

export async function handleSessionCommand(
  sessionId: string | undefined,
  command: Command,
  deps: SessionCommandDependencies = defaultDependencies,
): Promise<void> {
  const sessionOptions = command.opts<StatusOptions>();
  const clearRequested = Boolean(sessionOptions.clear || sessionOptions.clean);
  if (clearRequested) {
    if (sessionId) {
      console.error('Cannot combine a session ID with --clear. Remove the ID to delete cached sessions.');
      process.exitCode = 1;
      return;
    }
    const hours = sessionOptions.hours;
    const includeAll = sessionOptions.all;
    const result = await deps.deleteSessionsOlderThan({ hours, includeAll });
    const scope = includeAll ? 'all stored sessions' : `sessions older than ${hours}h`;
    console.log(`Deleted ${result.deleted} ${result.deleted === 1 ? 'session' : 'sessions'} (${scope}).`);
    return;
  }
  if (sessionId === 'clear' || sessionId === 'clean') {
    console.error('Session cleanup now uses --clear. Run "oracle session --clear --hours <n>" instead.');
    process.exitCode = 1;
    return;
  }
  if (!sessionId) {
    const showExamples = deps.usesDefaultStatusFilters(command);
    await deps.showStatus({
      hours: sessionOptions.all ? Infinity : sessionOptions.hours,
      includeAll: sessionOptions.all,
      limit: sessionOptions.limit,
      showExamples,
    });
    return;
  }
  await deps.attachSession(sessionId);
}
