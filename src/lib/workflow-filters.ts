import type { GitHubWorkflowRun } from './api/types';

export interface RunFilter {
  onlyMe: boolean;
  userId?: string | null;
  activeFilter: string | null;
}

export function matchesOnlyMe(
  run: GitHubWorkflowRun,
  userId: string | null | undefined,
  onlyMe: boolean
): boolean {
  if (!onlyMe || !userId) return true;
  return run.actor?.login === userId || run.triggering_actor?.login === userId;
}

/**
 * Apply the "Only me" and status/conclusion filters to a run list.
 */
export function filterRuns(runs: GitHubWorkflowRun[], filter: RunFilter): GitHubWorkflowRun[] {
  let result = runs;

  if (filter.onlyMe && filter.userId) {
    result = result.filter((run) => matchesOnlyMe(run, filter.userId, true));
  }

  if (!filter.activeFilter || filter.activeFilter === 'Total') {
    return result;
  }

  return result.filter((run) => {
    if (run.status === filter.activeFilter) return true;
    return run.status === 'completed' && run.conclusion === filter.activeFilter;
  });
}
