'use client';

import React, { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useGitHubToken } from '@/contexts/github-token-context';
import { GitHubApiClient } from '@/lib/api/github';
import type { GitHubWorkflowJob, GitHubWorkflowRun } from '@/lib/api/types';
import { formatDuration } from '@/lib/format';
import { WorkflowStatusBadge } from '@/components/workflow-status-badge';
import { ChevronDown, ChevronRight, Loader, RefreshCw, XCircle } from 'lucide-react';

interface WorkflowJobsProps {
  owner: string;
  repo: string;
  run: GitHubWorkflowRun;
}

function duration(job: GitHubWorkflowJob): number | null {
  if (!job.started_at) return null;
  const start = new Date(job.started_at).getTime();
  const end = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

function failedStep(job: GitHubWorkflowJob): string | null {
  return job.steps?.find(
    (step) => step.conclusion === 'failure' || step.conclusion === 'timed_out'
  )?.name ?? null;
}

export function WorkflowJobs({ owner, repo, run }: WorkflowJobsProps) {
  const { token } = useGitHubToken();
  const [open, setOpen] = React.useState(false);
  const [jobs, setJobs] = React.useState<GitHubWorkflowJob[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const client = new GitHubApiClient(token);
      setJobs(await client.getWorkflowRunJobs(owner, repo, run.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [owner, repo, run.id, token]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && jobs === null && !loading) void load();
  };

  return (
    <div className="mt-2 border-t pt-2">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1 text-xs text-muted-foreground"
          onClick={toggle}
          aria-expanded={open}
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {open ? 'Hide jobs' : 'Show jobs'}
        </Button>
        {open && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => void load()}
            disabled={loading}
            title="Refresh jobs"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-1 space-y-1.5">
          {loading && jobs === null && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader className="w-3 h-3 animate-spin" /> Loading jobs…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-1 text-xs text-destructive">
              <XCircle className="w-3 h-3" /> {error}
            </div>
          )}
          {jobs?.length === 0 && (
            <p className="text-xs text-muted-foreground">No jobs reported for this run.</p>
          )}
          {jobs?.map((job) => {
            const failed = failedStep(job);
            return (
              <div key={job.id} className="rounded-md border bg-muted/20 px-2 py-1.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{job.name}</span>
                  <WorkflowStatusBadge
                    status={job.status as GitHubWorkflowRun['status']}
                    conclusion={job.conclusion as GitHubWorkflowRun['conclusion']}
                  />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                  <span className="tabular-nums">{formatDuration(duration(job))}</span>
                  <span>{job.runner_name || job.runner_group_name || job.labels.join(', ') || 'No runner yet'}</span>
                  {failed && <span className="text-rose-600 dark:text-rose-400">Failed step: {failed}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
