import {
  buildRepositoryMetrics,
  buildWorkflowHistories,
  estimateRemainingQueueMs,
  getLatestRunPerWorkflow,
  getQueueTimeMs,
  getRunOutcome,
  getRuntimeMs,
  isRunStale,
  summarizeDurations,
} from '../src/lib/workflow-metrics';
import {
  formatClock,
  formatCompactDuration,
  formatDuration,
  formatPercent,
  formatRelativeTime,
} from '../src/lib/format';
import type { GitHubWorkflowRun } from '../src/lib/api/types';

const NOW = new Date('2026-11-10T12:00:00Z').getTime();

function run(overrides: Partial<GitHubWorkflowRun> = {}): GitHubWorkflowRun {
  return {
    id: 1,
    name: 'CI',
    head_branch: 'main',
    head_sha: 'abc',
    path: '.github/workflows/ci.yml',
    display_title: 'CI',
    run_number: 1,
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    workflow_id: 10,
    url: 'https://api.github.com/repos/o/r/actions/runs/1',
    html_url: 'https://github.com/o/r/actions/runs/1',
    created_at: '2026-11-10T10:00:00Z',
    run_started_at: '2026-11-10T10:00:30Z',
    updated_at: '2026-11-10T10:03:30Z',
    actor: { login: 'octocat' },
    run_attempt: 1,
    repository: { id: 1, name: 'r', full_name: 'o/r', owner: { login: 'o' } },
    head_commit: null,
    ...overrides,
  };
}

describe('queue and runtime calculations', () => {
  it('computes queue time from create to start', () => {
    expect(getQueueTimeMs(run(), NOW)).toBe(30_000);
  });

  it('computes live queue time for queued runs without a start timestamp', () => {
    const queued = run({
      status: 'queued',
      conclusion: null,
      run_started_at: undefined,
      created_at: '2026-11-10T11:55:00Z',
    });
    expect(getQueueTimeMs(queued, NOW)).toBe(5 * 60_000);
  });

  it('computes completed runtime from start to update', () => {
    expect(getRuntimeMs(run(), NOW)).toBe(3 * 60_000);
  });

  it('computes live runtime for in-progress runs', () => {
    const active = run({
      status: 'in_progress',
      conclusion: null,
      run_started_at: '2026-11-10T11:50:00Z',
    });
    expect(getRuntimeMs(active, NOW)).toBe(10 * 60_000);
  });

  it('returns no runtime for a queued run that has not started', () => {
    const queued = run({
      status: 'queued',
      conclusion: null,
      run_started_at: undefined,
      created_at: '2026-11-10T11:55:00Z',
    });
    expect(getRuntimeMs(queued, NOW)).toBeNull();
  });

  it('falls back to created_at when run_started_at is missing', () => {
    const legacy = run({ run_started_at: undefined });
    expect(getRuntimeMs(legacy, NOW)).toBe(3.5 * 60_000);
  });

  it('never returns negative durations', () => {
    const skewed = run({
      created_at: '2026-11-10T12:00:00Z',
      run_started_at: '2026-11-10T11:00:00Z',
      updated_at: '2026-11-10T10:00:00Z',
    });
    expect(getQueueTimeMs(skewed, NOW)).toBe(0);
    expect(getRuntimeMs(skewed, NOW)).toBe(0);
  });

  it('flags long-running and long-queued runs as stale', () => {
    expect(
      isRunStale(
        run({
          status: 'in_progress',
          conclusion: null,
          run_started_at: '2026-11-10T09:00:00Z',
        }),
        NOW
      )
    ).toBe(true);

    expect(
      isRunStale(
        run({
          status: 'queued',
          conclusion: null,
          run_started_at: undefined,
          created_at: '2026-11-10T09:00:00Z',
        }),
        NOW
      )
    ).toBe(true);

    expect(isRunStale(run(), NOW)).toBe(false);
  });

  it('maps statuses to outcomes', () => {
    expect(getRunOutcome(run())).toBe('success');
    expect(getRunOutcome(run({ status: 'in_progress', conclusion: null }))).toBe('running');
    expect(getRunOutcome(run({ status: 'queued', conclusion: null }))).toBe('queued');
    expect(getRunOutcome(run({ status: 'completed', conclusion: 'timed_out' }))).toBe('timed_out');
  });
});

describe('duration statistics', () => {
  it('returns null for an empty sample', () => {
    expect(summarizeDurations([])).toBeNull();
  });

  it('calculates median, p95 and average', () => {
    const stats = summarizeDurations([1000, 2000, 3000, 4000, 10_000]);
    expect(stats).toMatchObject({
      count: 5,
      medianMs: 3000,
      p95Ms: 10_000,
      averageMs: 4000,
      minMs: 1000,
      maxMs: 10_000,
    });
  });

  it('ignores invalid values', () => {
    expect(summarizeDurations([Number.NaN, -5, 1000])).toMatchObject({
      count: 1,
      medianMs: 1000,
    });
  });
});

describe('workflow history', () => {
  const runs = [
    run({ id: 3, run_number: 3, created_at: '2026-11-10T11:00:00Z', run_started_at: '2026-11-10T11:00:10Z', updated_at: '2026-11-10T11:04:10Z', conclusion: 'failure' }),
    run({ id: 2, run_number: 2, created_at: '2026-11-10T09:00:00Z', run_started_at: '2026-11-10T09:00:20Z', updated_at: '2026-11-10T09:02:20Z', conclusion: 'success' }),
    run({ id: 1, run_number: 1, created_at: '2026-11-10T07:00:00Z', run_started_at: '2026-11-10T07:00:15Z', updated_at: '2026-11-10T07:01:15Z', conclusion: 'failure' }),
  ];

  it('groups runs by workflow and sorts newest first', () => {
    const histories = buildWorkflowHistories([...runs, run({ id: 4, workflow_id: 11 })], NOW);
    expect(histories.size).toBe(2);
    expect(histories.get(10)?.runs.map((item) => item.id)).toEqual([3, 2, 1]);
  });

  it('computes success rate over decisive runs only', () => {
    const withSkipped = [
      ...runs,
      run({ id: 5, conclusion: 'skipped', created_at: '2026-11-10T06:00:00Z' }),
    ];
    const history = buildWorkflowHistories(withSkipped, NOW).get(10);
    expect(history?.decisiveRuns).toBe(3);
    expect(history?.successRate).toBeCloseTo(1 / 3);
  });

  it('counts consecutive failures from the newest run', () => {
    const history = buildWorkflowHistories(runs, NOW).get(10);
    expect(history?.consecutiveFailures).toBe(1);
  });

  it('records the last success timestamp', () => {
    const history = buildWorkflowHistories(runs, NOW).get(10);
    expect(history?.lastSuccessAt).toBe('2026-11-10T09:02:20Z');
  });

  it('computes median duration and queue', () => {
    const history = buildWorkflowHistories(runs, NOW).get(10);
    expect(history?.medianDurationMs).toBe(2 * 60_000);
    expect(history?.medianQueueMs).toBe(15_000);
  });

  it('estimates the remaining wait for a queued run', () => {
    const histories = buildWorkflowHistories(runs, NOW);
    const queued = run({
      status: 'queued',
      conclusion: null,
      run_started_at: undefined,
      created_at: '2026-11-10T11:59:50Z',
    });
    expect(estimateRemainingQueueMs(histories.get(10), queued, NOW)).toBe(5000);
  });

  it('returns null when there is no queue history', () => {
    expect(estimateRemainingQueueMs(undefined, run({ status: 'queued' }), NOW)).toBeNull();
  });

  it('picks the latest run per workflow', () => {
    const latest = getLatestRunPerWorkflow(runs);
    expect(latest.get(10)?.id).toBe(3);
  });
});

describe('repository metrics', () => {
  it('summarises running, queued and success state', () => {
    const runs = [
      run({ id: 1, workflow_id: 10, status: 'in_progress', conclusion: null, run_started_at: '2026-11-10T11:50:00Z' }),
      run({ id: 2, workflow_id: 11, status: 'queued', conclusion: null, run_started_at: undefined, created_at: '2026-11-10T11:59:00Z' }),
      run({ id: 3, workflow_id: 12, conclusion: 'failure' }),
      run({ id: 4, workflow_id: 13, conclusion: 'success' }),
    ];

    const metrics = buildRepositoryMetrics(runs, undefined, NOW);

    expect(metrics.workflowCount).toBe(4);
    expect(metrics.runningCount).toBe(1);
    expect(metrics.queuedCount).toBe(1);
    expect(metrics.successRate).toBe(0.5);
    expect(metrics.oldestQueuedMs).toBe(60_000);
    expect(metrics.longestRunningMs).toBe(10 * 60_000);
  });

  it('estimates queue drain from per-workflow history', () => {
    const history = [
      run({ id: 1, workflow_id: 10, created_at: '2026-11-10T08:00:00Z', run_started_at: '2026-11-10T08:01:00Z', updated_at: '2026-11-10T08:05:00Z' }),
      run({ id: 2, workflow_id: 10, created_at: '2026-11-10T09:00:00Z', run_started_at: '2026-11-10T09:01:00Z', updated_at: '2026-11-10T09:05:00Z' }),
    ];
    const queued = run({
      id: 3,
      workflow_id: 10,
      status: 'queued',
      conclusion: null,
      run_started_at: undefined,
      created_at: '2026-11-10T11:59:30Z',
    });

    const metrics = buildRepositoryMetrics([...history, queued], undefined, NOW);
    expect(metrics.estimatedQueueDrainMs).toBe(30_000);
  });
});

describe('formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(500)).toBe('<1s');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(133_000)).toBe('2m 13s');
    expect(formatDuration(3_840_000)).toBe('1h 04m');
  });

  it('formats compact durations', () => {
    expect(formatCompactDuration(45_000)).toBe('45s');
    expect(formatCompactDuration(120_000)).toBe('2m');
    expect(formatCompactDuration(3_900_000)).toBe('1h 5m');
  });

  it('formats a live clock', () => {
    expect(formatClock(133_000)).toBe('02:13');
    expect(formatClock(3_733_000)).toBe('1:02:13');
  });

  it('formats relative times', () => {
    expect(formatRelativeTime('2026-11-10T11:59:30Z', NOW)).toBe('just now');
    expect(formatRelativeTime('2026-11-10T11:55:00Z', NOW)).toBe('5m ago');
    expect(formatRelativeTime('2026-11-10T09:00:00Z', NOW)).toBe('3h ago');
  });

  it('formats percentages', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(0.956)).toBe('96%');
  });
});
