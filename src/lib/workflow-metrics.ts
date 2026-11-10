/**
 * Workflow timing and health metrics.
 *
 * All functions are pure so the same numbers can be unit tested and rendered
 * in the dashboard. Timestamps come from the GitHub Actions runs API:
 *
 *   created_at      -> the run was queued
 *   run_started_at  -> a runner picked the run up
 *   updated_at      -> last state change (completion for finished runs)
 */

import type { GitHubWorkflowRun } from './api/types';

export const STALE_RUN_MS = 90 * 60 * 1000; // running for over 90 minutes
export const STALE_QUEUE_MS = 45 * 60 * 1000; // queued for over 45 minutes

export interface DurationStats {
  count: number;
  medianMs: number;
  p95Ms: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
}

export interface WorkflowHistory {
  workflowId: number;
  /** Newest first. */
  runs: GitHubWorkflowRun[];
  completedRuns: number;
  decisiveRuns: number;
  successRate: number | null;
  averageDurationMs: number | null;
  medianDurationMs: number | null;
  p95DurationMs: number | null;
  averageQueueMs: number | null;
  medianQueueMs: number | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
}

export interface RepositoryMetrics {
  totalRuns: number;
  workflowCount: number;
  runningCount: number;
  queuedCount: number;
  completedCount: number;
  successRate: number | null;
  averageDurationMs: number | null;
  medianDurationMs: number | null;
  averageQueueMs: number | null;
  estimatedQueueDrainMs: number;
  oldestQueuedMs: number | null;
  longestRunningMs: number | null;
  staleCount: number;
  lastSuccessAt: string | null;
}

export type RunOutcome =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | 'neutral'
  | 'running'
  | 'queued'
  | 'unknown';

function parseTime(value?: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function nonNegative(value: number): number {
  return value > 0 ? value : 0;
}

function isQueuedStatus(status: GitHubWorkflowRun['status']): boolean {
  return status === 'queued' || status === 'waiting' || status === 'requested' || status === 'pending';
}

/** Time from queued to picked up by a runner. */
export function getQueueTimeMs(run: GitHubWorkflowRun, now: number = Date.now()): number | null {
  const created = parseTime(run.created_at);
  if (created === null) return null;

  const started = parseTime(run.run_started_at);
  if (started !== null) return nonNegative(started - created);

  if (isQueuedStatus(run.status)) {
    return nonNegative(now - created);
  }

  return null;
}

/** Time from pickup to completion, or to now for an active run. */
export function getRuntimeMs(run: GitHubWorkflowRun, now: number = Date.now()): number | null {
  // A queued run has not started; its wait is queue time, not runtime.
  const started = parseTime(run.run_started_at) ?? (isQueuedStatus(run.status) ? null : parseTime(run.created_at));
  if (started === null) return null;

  const end = run.status === 'completed' ? parseTime(run.updated_at) : now;
  if (end === null) return null;

  return nonNegative(end - started);
}

export function getRunDurationMs(run: GitHubWorkflowRun, now: number = Date.now()): number | null {
  return getRuntimeMs(run, now);
}

export function isRunStale(run: GitHubWorkflowRun, now: number = Date.now()): boolean {
  if (run.status === 'in_progress') {
    const runtime = getRuntimeMs(run, now);
    return runtime !== null && runtime > STALE_RUN_MS;
  }
  if (run.status === 'queued' || run.status === 'waiting' || run.status === 'requested') {
    const queue = getQueueTimeMs(run, now);
    return queue !== null && queue > STALE_QUEUE_MS;
  }
  return false;
}

export function getRunOutcome(run: GitHubWorkflowRun): RunOutcome {
  if (run.status === 'in_progress') return 'running';
  if (run.status === 'queued' || run.status === 'waiting' || run.status === 'requested' || run.status === 'pending') {
    return 'queued';
  }
  switch (run.conclusion) {
    case 'success':
    case 'failure':
    case 'cancelled':
    case 'skipped':
    case 'timed_out':
    case 'neutral':
      return run.conclusion;
    default:
      return 'unknown';
  }
}

/** Whether a completed run tells us something about pass/fail health. */
export function isDecisiveRun(run: GitHubWorkflowRun): boolean {
  if (run.status !== 'completed') return false;
  return run.conclusion === 'success' || run.conclusion === 'failure' || run.conclusion === 'timed_out';
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

export function summarizeDurations(values: number[]): DurationStats | null {
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (clean.length === 0) return null;

  const sum = clean.reduce((total, value) => total + value, 0);
  return {
    count: clean.length,
    medianMs: percentile(clean, 0.5),
    p95Ms: percentile(clean, 0.95),
    averageMs: Math.round(sum / clean.length),
    minMs: clean[0],
    maxMs: clean[clean.length - 1],
  };
}

function byCreatedAtDesc(a: GitHubWorkflowRun, b: GitHubWorkflowRun): number {
  return (parseTime(b.created_at) ?? 0) - (parseTime(a.created_at) ?? 0);
}

function latestSuccess(runs: GitHubWorkflowRun[]): GitHubWorkflowRun | undefined {
  return runs.reduce<GitHubWorkflowRun | undefined>((latest, run) => {
    if (run.conclusion !== 'success') return latest;
    const time = parseTime(run.updated_at) ?? 0;
    if (!latest) return run;
    return time > (parseTime(latest.updated_at) ?? 0) ? run : latest;
  }, undefined);
}

/**
 * Group a flat run history into per-workflow statistics.
 */
export function buildWorkflowHistories(
  runs: GitHubWorkflowRun[],
  now: number = Date.now()
): Map<number, WorkflowHistory> {
  const grouped = new Map<number, GitHubWorkflowRun[]>();

  for (const run of runs) {
    const existing = grouped.get(run.workflow_id);
    if (existing) existing.push(run);
    else grouped.set(run.workflow_id, [run]);
  }

  const histories = new Map<number, WorkflowHistory>();

  for (const [workflowId, workflowRuns] of grouped) {
    workflowRuns.sort(byCreatedAtDesc);

    const completed = workflowRuns.filter((run) => run.status === 'completed');
    const decisive = completed.filter(isDecisiveRun);
    const successes = decisive.filter((run) => run.conclusion === 'success');
    const durations = completed
      .map((run) => getRuntimeMs(run, now))
      .filter((value): value is number => value !== null);
    // Only runs that actually started tell us how long the queue takes.
    const queueTimes = workflowRuns
      .filter((run) => parseTime(run.run_started_at) !== null)
      .map((run) => getQueueTimeMs(run, now))
      .filter((value): value is number => value !== null);

    const durationStats = summarizeDurations(durations);
    const queueStats = summarizeDurations(queueTimes);

    let consecutiveFailures = 0;
    for (const run of completed) {
      if (run.conclusion === 'failure' || run.conclusion === 'timed_out') consecutiveFailures += 1;
      else break;
    }

    const lastSuccessRun = latestSuccess(workflowRuns);

    histories.set(workflowId, {
      workflowId,
      runs: workflowRuns,
      completedRuns: completed.length,
      decisiveRuns: decisive.length,
      successRate: decisive.length > 0 ? successes.length / decisive.length : null,
      averageDurationMs: durationStats?.averageMs ?? null,
      medianDurationMs: durationStats?.medianMs ?? null,
      p95DurationMs: durationStats?.p95Ms ?? null,
      averageQueueMs: queueStats?.averageMs ?? null,
      medianQueueMs: queueStats?.medianMs ?? null,
      lastSuccessAt: lastSuccessRun?.updated_at ?? null,
      consecutiveFailures,
    });
  }

  return histories;
}

/**
 * Latest run per workflow. The API returns runs newest-first, but sorting by
 * created_at keeps this correct when several workflows are interleaved.
 */
export function getLatestRunPerWorkflow(runs: GitHubWorkflowRun[]): Map<number, GitHubWorkflowRun> {
  const latest = new Map<number, GitHubWorkflowRun>();
  for (const run of runs) {
    const current = latest.get(run.workflow_id);
    if (!current || (parseTime(run.created_at) ?? 0) > (parseTime(current.created_at) ?? 0)) {
      latest.set(run.workflow_id, run);
    }
  }
  return latest;
}

/**
 * Expected remaining wait before a queued run starts, based on the workflow's
 * own median queue time. Returns null when there is no history to learn from.
 */
export function estimateRemainingQueueMs(
  history: WorkflowHistory | undefined,
  run: GitHubWorkflowRun,
  now: number = Date.now()
): number | null {
  const expected = history?.medianQueueMs ?? history?.averageQueueMs;
  if (expected === null || expected === undefined) return null;

  const elapsed = getQueueTimeMs(run, now);
  if (elapsed === null) return expected;

  return Math.max(0, expected - elapsed);
}

/**
 * Repository-level health summary, computed from the latest run per workflow
 * plus the full recent history for timing.
 */
export function buildRepositoryMetrics(
  runs: GitHubWorkflowRun[],
  histories: Map<number, WorkflowHistory> = buildWorkflowHistories(runs),
  now: number = Date.now()
): RepositoryMetrics {
  const latest = getLatestRunPerWorkflow(runs);
  const latestRuns = Array.from(latest.values());

  const running = latestRuns.filter((run) => run.status === 'in_progress');
  const queued = latestRuns.filter(
    (run) => run.status === 'queued' || run.status === 'waiting' || run.status === 'requested' || run.status === 'pending'
  );

  const decisiveLatest = latestRuns.filter(isDecisiveRun);
  const successesLatest = decisiveLatest.filter((run) => run.conclusion === 'success');

  const allDurations = runs
    .filter((run) => run.status === 'completed')
    .map((run) => getRuntimeMs(run, now))
    .filter((value): value is number => value !== null);
  const allQueues = runs
    .filter((run) => parseTime(run.run_started_at) !== null)
    .map((run) => getQueueTimeMs(run, now))
    .filter((value): value is number => value !== null);

  const durationStats = summarizeDurations(allDurations);
  const queueStats = summarizeDurations(allQueues);

  const estimatedDrain = queued.reduce((total, run) => {
    const history = histories.get(run.workflow_id);
    const remaining = estimateRemainingQueueMs(history, run, now) ?? 0;
    return total + remaining;
  }, 0);

  const oldestQueued = queued.reduce<number | null>((oldest, run) => {
    const elapsed = getQueueTimeMs(run, now);
    if (elapsed === null) return oldest;
    return oldest === null ? elapsed : Math.max(oldest, elapsed);
  }, null);

  const longestRunning = running.reduce<number | null>((longest, run) => {
    const runtime = getRuntimeMs(run, now);
    if (runtime === null) return longest;
    return longest === null ? runtime : Math.max(longest, runtime);
  }, null);

  const lastSuccessRun = latestSuccess(runs);

  return {
    totalRuns: runs.length,
    workflowCount: latest.size,
    runningCount: running.length,
    queuedCount: queued.length,
    completedCount: runs.filter((run) => run.status === 'completed').length,
    successRate: decisiveLatest.length > 0 ? successesLatest.length / decisiveLatest.length : null,
    averageDurationMs: durationStats?.averageMs ?? null,
    medianDurationMs: durationStats?.medianMs ?? null,
    averageQueueMs: queueStats?.averageMs ?? null,
    estimatedQueueDrainMs: estimatedDrain,
    oldestQueuedMs: oldestQueued,
    longestRunningMs: longestRunning,
    staleCount: latestRuns.filter((run) => isRunStale(run, now)).length,
    lastSuccessAt: lastSuccessRun?.updated_at ?? null,
  };
}

