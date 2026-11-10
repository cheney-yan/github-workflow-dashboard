'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useGitHubToken } from '@/contexts/github-token-context';
import type { RepositoryWorkflows } from '@/contexts/workflow-context';
import { GitHubApiClient } from '@/lib/api/github';
import type { GitHubWorkflowJob } from '@/lib/api/types';
import { mapWithConcurrency } from '@/lib/concurrency';
import { formatCompactDuration } from '@/lib/format';
import { Loader, RefreshCw, Users, XCircle } from 'lucide-react';

const MAX_RUNS = 25;
const CONCURRENCY = 3;

interface ActiveRun {
  repositoryName: string;
  workflowName: string;
  owner: string;
  repo: string;
  runId: number;
}

interface RunnerRow {
  runner: string;
  jobs: number;
  running: number;
  queued: number;
  totalDurationMs: number;
  withDuration: number;
}

function activeRuns(repositories: RepositoryWorkflows[]): ActiveRun[] {
  const running: ActiveRun[] = [];
  const queued: ActiveRun[] = [];

  for (const entry of repositories) {
    const [owner, repo] = entry.repository.full_name.split('/');
    for (const run of entry.workflows) {
      if (run.status !== 'in_progress' && run.status !== 'queued' && run.status !== 'waiting') continue;
      const item = {
        repositoryName: entry.repository.full_name,
        workflowName: run.name,
        owner,
        repo,
        runId: run.id,
      };
      if (run.status === 'in_progress') running.push(item);
      else queued.push(item);
    }
  }

  // Running jobs must be visible even when many runs are queued.
  return [...running, ...queued].slice(0, MAX_RUNS);
}

function runnerLabel(job: GitHubWorkflowJob): string {
  if (job.runner_name) return job.runner_name;
  if (job.runner_group_name) return job.runner_group_name;
  if (job.labels.length > 0) return job.labels.join(', ');
  return job.status === 'queued' ? 'Queued (no runner yet)' : 'Unassigned';
}

function aggregate(jobs: { run: ActiveRun; job: GitHubWorkflowJob }[]): RunnerRow[] {
  const rows = new Map<string, RunnerRow>();

  for (const { job } of jobs) {
    const runner = runnerLabel(job);
    const row = rows.get(runner) ?? {
      runner,
      jobs: 0,
      running: 0,
      queued: 0,
      totalDurationMs: 0,
      withDuration: 0,
    };
    row.jobs += 1;
    if (job.status === 'in_progress') row.running += 1;
    if (job.status === 'queued') row.queued += 1;
    if (job.started_at) {
      const start = new Date(job.started_at).getTime();
      const end = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        row.totalDurationMs += end - start;
        row.withDuration += 1;
      }
    }
    rows.set(runner, row);
  }

  return Array.from(rows.values()).sort((a, b) => b.jobs - a.jobs || a.runner.localeCompare(b.runner));
}

export function RunnerUtilization({ repositories }: { repositories: RepositoryWorkflows[] }) {
  const { token } = useGitHubToken();
  const runs = useMemo(() => activeRuns(repositories), [repositories]);
  const [rows, setRows] = useState<RunnerRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoLoadedRef = React.useRef<string | null>(null);
  const activeRunKey = runs.map((run) => run.runId).join(',');

  const load = useCallback(async () => {
    if (!token || runs.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const client = new GitHubApiClient(token);
      const results = await mapWithConcurrency(runs, CONCURRENCY, async (run) => {
        try {
          const jobs = await client.getWorkflowRunJobs(run.owner, run.repo, run.runId);
          return jobs.map((job) => ({ run, job }));
        } catch {
          return [];
        }
      });
      setRows(aggregate(results.flat()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runners');
    } finally {
      setLoading(false);
    }
  }, [runs, token]);

  useEffect(() => {
    if (!activeRunKey || !token || autoLoadedRef.current === activeRunKey) return;
    autoLoadedRef.current = activeRunKey;
    void load();
  }, [activeRunKey, load, token]);

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4" /> Runner utilization
            </CardTitle>
            <CardDescription className="text-xs">
              Runners carrying the active runs across selected repositories.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            onClick={() => void load()}
            disabled={loading || runs.length === 0}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span className="ml-1 text-xs">{loading ? 'Loading' : 'Refresh'}</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {runs.length === 0 && (
          <p className="text-xs text-muted-foreground">No active runs right now.</p>
        )}
        {error && (
          <p className="flex items-center gap-1 text-xs text-destructive">
            <XCircle className="w-3 h-3" /> {error}
          </p>
        )}
        {loading && rows === null && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader className="w-3 h-3 animate-spin" /> Reading jobs for {runs.length} active runs…
          </p>
        )}
        {rows !== null && !loading && rows.length === 0 && runs.length > 0 && (
          <p className="text-xs text-muted-foreground">No jobs reported for the active runs.</p>
        )}
        {rows !== null && runs.length > 0 && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Runner</th>
                  <th className="py-1 pr-3 font-medium">Jobs</th>
                  <th className="py-1 pr-3 font-medium">Running</th>
                  <th className="py-1 pr-3 font-medium">Queued</th>
                  <th className="py-1 font-medium">Avg runtime</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.runner} className="border-t">
                    <td className="py-1 pr-3 text-foreground">{row.runner}</td>
                    <td className="py-1 pr-3 tabular-nums">{row.jobs}</td>
                    <td className="py-1 pr-3 tabular-nums text-sky-600 dark:text-sky-400">{row.running}</td>
                    <td className="py-1 pr-3 tabular-nums text-amber-600 dark:text-amber-400">{row.queued}</td>
                    <td className="py-1 tabular-nums">
                      {row.withDuration > 0
                        ? formatCompactDuration(row.totalDurationMs / row.withDuration)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
