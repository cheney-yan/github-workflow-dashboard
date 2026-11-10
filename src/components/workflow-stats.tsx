'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Gauge, Hourglass, Timer, TrendingUp } from 'lucide-react';
import type { GitHubWorkflowRun, GitHubRateLimit } from '@/lib/api/types';
import type { RepositoryWorkflows } from '@/contexts/workflow-context';
import {
  buildRepositoryMetrics,
  estimateRemainingQueueMs,
  getQueueTimeMs,
  getRuntimeMs,
  isRunStale,
  type WorkflowHistory,
} from '@/lib/workflow-metrics';
import {
  formatCompactDuration,
  formatDuration,
  formatPercent,
} from '@/lib/format';
import { cn } from '@/lib/utils';

const ACTIVE_STATUSES = new Set<GitHubWorkflowRun['status']>(['queued', 'waiting', 'requested', 'pending']);

export function isActiveRun(run: GitHubWorkflowRun): boolean {
  return run.status === 'in_progress' || ACTIVE_STATUSES.has(run.status);
}

export function passRateClass(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return 'text-muted-foreground';
  if (rate >= 0.95) return 'text-emerald-600 dark:text-emerald-400';
  if (rate >= 0.8) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

/**
 * Runtime that updates once a second while a run is active. Each active card
 * owns its timer, so idle dashboards do not re-render every second.
 */
export function LiveRuntime({ run, className }: { run: GitHubWorkflowRun; className?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (run.status !== 'in_progress') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [run.id, run.status]);

  const runtime = getRuntimeMs(run, run.status === 'in_progress' ? now : undefined);
  return (
    <span className={className}>
      {formatDuration(runtime)}
    </span>
  );
}

/** Live queue wait plus an estimate of the remaining wait. */
export function LiveQueue({ run, history, className }: {
  run: GitHubWorkflowRun;
  history?: WorkflowHistory;
  className?: string;
}) {
  const queued = ACTIVE_STATUSES.has(run.status);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!queued) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [queued, run.id]);

  const elapsed = getQueueTimeMs(run, queued ? now : undefined);
  if (elapsed === null) return null;

  const remaining = queued ? estimateRemainingQueueMs(history, run, now) : null;

  return (
    <span className={className} title="Time between the run being queued and a runner picking it up">
      <Hourglass className="w-3 h-3" aria-hidden="true" />
      {formatDuration(elapsed)}
      {queued && remaining !== null && (
        <span className="text-muted-foreground/80">
          {remaining <= 1000 ? ' · any moment' : ` · ~${formatCompactDuration(remaining)} to start`}
        </span>
      )}
    </span>
  );
}

interface RunTimingProps {
  run: GitHubWorkflowRun;
  history?: WorkflowHistory;
  compact?: boolean;
}

/**
 * Runtime, queue time and recent reliability for one workflow run.
 */
export function RunTiming({ run, history, compact = false }: RunTimingProps) {
  const stale = isRunStale(run);
  const runtime = getRuntimeMs(run);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground',
        compact ? 'text-[11px]' : 'text-xs'
      )}
    >
      {runtime !== null && (
        <span
          className={cn(
            'inline-flex items-center gap-1 tabular-nums',
            run.status === 'in_progress' && 'text-sky-600 dark:text-sky-400 font-medium'
          )}
          title="Run time (pickup to completion)"
        >
          <Timer className="w-3 h-3" aria-hidden="true" />
          <LiveRuntime run={run} />
        </span>
      )}

      <LiveQueue run={run} history={history} className="inline-flex items-center gap-1 tabular-nums" />

      {history?.averageDurationMs !== null && history?.averageDurationMs !== undefined && (
        <span title="Average runtime over the recent runs fetched" className="tabular-nums">
          avg {formatCompactDuration(history.averageDurationMs)}
        </span>
      )}

      {history?.successRate !== null && history?.successRate !== undefined && (
        <span
          title={`${history.completedRuns} completed runs in the recent window`}
          className={cn('tabular-nums', passRateClass(history.successRate))}
        >
          {formatPercent(history.successRate)} pass
        </span>
      )}

      {history && history.consecutiveFailures > 1 && (
        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
          {history.consecutiveFailures} failing
        </span>
      )}

      {stale && (
        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
          stale
        </span>
      )}
    </div>
  );
}

interface FleetMetricsProps {
  repositories: RepositoryWorkflows[];
  rateLimit?: GitHubRateLimit | null;
}

/**
 * Fleet-wide timing strip: pass rate, runtime, queue and active runs.
 */
export function FleetMetrics({ repositories, rateLimit }: FleetMetricsProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const allRuns = useMemo(
    () => repositories.flatMap((repository) => repository.runs),
    [repositories]
  );
  const fleet = useMemo(() => buildRepositoryMetrics(allRuns, undefined, now), [allRuns, now]);

  if (allRuns.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        Waiting for the first workflow runs. Runtime and queue statistics appear after the
        first refresh.
      </div>
    );
  }

  const tiles = [
    {
      label: 'Pass rate',
      value: formatPercent(fleet.successRate),
      hint: 'Latest completed run per workflow',
      icon: TrendingUp,
      tone: passRateClass(fleet.successRate),
    },
    {
      label: 'Avg runtime',
      value: formatCompactDuration(fleet.averageDurationMs),
      hint: `Median ${formatCompactDuration(fleet.medianDurationMs)}`,
      icon: Timer,
      tone: 'text-foreground',
    },
    {
      label: 'Avg queue',
      value: formatCompactDuration(fleet.averageQueueMs),
      hint: fleet.queuedCount > 0
        ? (fleet.estimatedQueueDrainMs <= 1000
            ? 'Past their usual queue time'
            : `Est. ${formatCompactDuration(fleet.estimatedQueueDrainMs)} left`)
        : 'No runs queued',
      icon: Hourglass,
      tone: fleet.queuedCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
    },
    {
      label: 'Active',
      value: `${fleet.runningCount + fleet.queuedCount}`,
      hint: `${fleet.runningCount} running · ${fleet.queuedCount} queued`,
      icon: Activity,
      tone: fleet.runningCount + fleet.queuedCount > 0 ? 'text-sky-600 dark:text-sky-400' : 'text-foreground',
    },
  ];

  return (
    <div className="mt-4 space-y-2">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.label} className="rounded-lg border bg-card px-3 py-2 shadow-sm">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                <Icon className="w-3 h-3" aria-hidden="true" />
                {tile.label}
              </div>
              <div className={cn('mt-0.5 text-lg font-bold tabular-nums leading-tight', tile.tone)}>
                {tile.value}
              </div>
              <div className="truncate text-[11px] text-muted-foreground" title={tile.hint}>
                {tile.hint}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-1 text-[11px] text-muted-foreground">
        {fleet.staleCount > 0 && (
          <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            {fleet.staleCount} stale {fleet.staleCount === 1 ? 'run' : 'runs'}
          </span>
        )}
        {fleet.oldestQueuedMs !== null && (
          <span>Oldest queue {formatDuration(fleet.oldestQueuedMs)}</span>
        )}
        {fleet.longestRunningMs !== null && (
          <span>Longest run {formatDuration(fleet.longestRunningMs)}</span>
        )}
        {rateLimit && rateLimit.limit > 0 && (
          <span className="inline-flex items-center gap-1">
            <Gauge className="w-3 h-3" aria-hidden="true" />
            GitHub API {rateLimit.remaining.toLocaleString()}/{rateLimit.limit.toLocaleString()} left
          </span>
        )}
      </div>
    </div>
  );
}

/** Compact health line shown in a repository card header. */
export function RepositoryHealth({ metrics }: { metrics: RepositoryWorkflows['metrics'] }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
      <span className={cn('font-medium tabular-nums', passRateClass(metrics.successRate))}>
        {formatPercent(metrics.successRate)} pass
      </span>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">avg {formatCompactDuration(metrics.averageDurationMs)}</span>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">queue {formatCompactDuration(metrics.averageQueueMs)}</span>
      {(metrics.runningCount > 0 || metrics.queuedCount > 0) && (
        <>
          <span aria-hidden="true">·</span>
          <span className="text-sky-600 dark:text-sky-400 tabular-nums">
            {metrics.runningCount} running · {metrics.queuedCount} queued
          </span>
        </>
      )}
      {metrics.staleCount > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <span className="text-amber-600 dark:text-amber-400">{metrics.staleCount} stale</span>
        </>
      )}
    </div>
  );
}
