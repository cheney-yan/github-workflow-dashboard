import { evaluateWorkflowAlerts, normalizeAlertPreferences } from '../src/lib/alerts';
import type { AlertRepository } from '../src/lib/alerts';
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
    url: '',
    html_url: '',
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

function repo(workflows: GitHubWorkflowRun[]): AlertRepository {
  return {
    repository: { id: 1, full_name: 'octocat/demo', default_branch: 'main' },
    workflows,
  };
}

const prefs = normalizeAlertPreferences({
  enabled: true,
  notifyOnFailure: true,
  queueMinutes: 30,
  runMinutes: 60,
});

describe('alert preferences', () => {
  it('clamps thresholds and defaults to disabled', () => {
    expect(normalizeAlertPreferences({ queueMinutes: 1, runMinutes: 9999 })).toMatchObject({
      enabled: false,
      queueMinutes: 5,
      runMinutes: 480,
    });
  });
});

describe('workflow alerts', () => {
  it('returns nothing when disabled', () => {
    expect(evaluateWorkflowAlerts([repo([run({ conclusion: 'failure' })])], { ...prefs, enabled: false }, NOW)).toEqual([]);
  });

  it('alerts on a default-branch failure only', () => {
    const alerts = evaluateWorkflowAlerts([
      repo([
        run({ id: 1, conclusion: 'failure', head_branch: 'main' }),
        run({ id: 2, conclusion: 'failure', head_branch: 'feature' }),
      ]),
    ], prefs, NOW);

    expect(alerts.map((alert) => alert.key)).toEqual(['failure:1:1']);
  });

  it('alerts when a queued run passes the threshold', () => {
    const alerts = evaluateWorkflowAlerts([
      repo([
        run({
          status: 'queued',
          conclusion: null,
          created_at: '2026-11-10T11:20:00Z',
          run_started_at: undefined,
        }),
      ]),
    ], prefs, NOW);

    expect(alerts[0]).toMatchObject({ kind: 'queue' });
    expect(alerts[0].body).toContain('40m 00s');
  });

  it('alerts when a running run passes the threshold', () => {
    const alerts = evaluateWorkflowAlerts([
      repo([
        run({
          status: 'in_progress',
          conclusion: null,
          run_started_at: '2026-11-10T10:30:00Z',
        }),
      ]),
    ], prefs, NOW);

    expect(alerts[0]).toMatchObject({ kind: 'runtime' });
    expect(alerts[0].body).toContain('1h 30m');
  });

  it('does not alert for failures when failure notifications are off', () => {
    const alerts = evaluateWorkflowAlerts(
      [repo([run({ conclusion: 'failure' })])],
      { ...prefs, notifyOnFailure: false },
      NOW
    );
    expect(alerts).toEqual([]);
  });
});
