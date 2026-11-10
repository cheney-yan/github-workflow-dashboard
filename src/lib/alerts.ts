import type { GitHubWorkflowRun } from './api/types';
import { formatDuration } from './format';
import { getQueueTimeMs, getRuntimeMs } from './workflow-metrics';

export interface AlertPreferences {
  enabled: boolean;
  notifyOnFailure: boolean;
  queueMinutes: number;
  runMinutes: number;
}

export interface AlertRepository {
  repository: {
    id: number;
    full_name: string;
    default_branch: string;
  };
  workflows: GitHubWorkflowRun[];
}

export type AlertKind = 'failure' | 'queue' | 'runtime';

export interface WorkflowAlert {
  key: string;
  kind: AlertKind;
  title: string;
  body: string;
}

const DEFAULT_PREFS: AlertPreferences = {
  enabled: false,
  notifyOnFailure: true,
  queueMinutes: 30,
  runMinutes: 90,
};

export function normalizeAlertPreferences(input?: Partial<AlertPreferences> | null): AlertPreferences {
  return {
    enabled: input?.enabled === true,
    notifyOnFailure: input?.notifyOnFailure !== false,
    queueMinutes: clampMinutes(input?.queueMinutes, 5, 240, DEFAULT_PREFS.queueMinutes),
    runMinutes: clampMinutes(input?.runMinutes, 10, 480, DEFAULT_PREFS.runMinutes),
  };
}

function clampMinutes(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/**
 * Derive alerts from the latest workflow state. Pure, so duplicate suppression
 * and notification delivery stay in the hook.
 */
export function evaluateWorkflowAlerts(
  repositories: AlertRepository[],
  preferences: AlertPreferences,
  now: number = Date.now()
): WorkflowAlert[] {
  if (!preferences.enabled) return [];

  const queueThreshold = preferences.queueMinutes * 60_000;
  const runtimeThreshold = preferences.runMinutes * 60_000;
  const alerts: WorkflowAlert[] = [];

  for (const entry of repositories) {
    const repo = entry.repository.full_name;
    for (const run of entry.workflows) {
      if (
        preferences.notifyOnFailure &&
        run.status === 'completed' &&
        run.conclusion === 'failure' &&
        run.head_branch === entry.repository.default_branch
      ) {
        alerts.push({
          key: `failure:${entry.repository.id}:${run.id}`,
          kind: 'failure',
          title: `Workflow failed: ${run.name}`,
          body: `${repo} · #${run.run_number} on ${run.head_branch}`,
        });
      }

      if (run.status === 'queued' || run.status === 'waiting' || run.status === 'requested') {
        const wait = getQueueTimeMs(run, now);
        if (wait !== null && wait >= queueThreshold) {
          alerts.push({
            key: `queue:${entry.repository.id}:${run.id}`,
            kind: 'queue',
            title: `Workflow queued: ${run.name}`,
            body: `${repo} · waiting ${formatDuration(wait)} (threshold ${preferences.queueMinutes}m)`,
          });
        }
      }

      if (run.status === 'in_progress') {
        const runtime = getRuntimeMs(run, now);
        if (runtime !== null && runtime >= runtimeThreshold) {
          alerts.push({
            key: `runtime:${entry.repository.id}:${run.id}`,
            kind: 'runtime',
            title: `Workflow running long: ${run.name}`,
            body: `${repo} · running ${formatDuration(runtime)} (threshold ${preferences.runMinutes}m)`,
          });
        }
      }
    }
  }

  return alerts;
}
