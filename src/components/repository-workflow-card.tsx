'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { GitHubWorkflowRun } from '@/lib/api/types';
import type { RepositoryWorkflows } from '@/contexts/workflow-context';
import { formatRelativeTime } from '@/lib/format';
import { RepositoryHealth, RunTiming } from '@/components/workflow-stats';
import { WorkflowStatusBadge, getRunBorderColor } from '@/components/workflow-status-badge';
import { WorkflowJobs } from '@/components/workflow-jobs';
import { ExternalLink, Loader, RefreshCw, XCircle } from 'lucide-react';

interface RepositoryWorkflowCardProps {
  entry: RepositoryWorkflows;
  workflows: GitHubWorkflowRun[];
  activeFilter: string | null;
  onRefresh: () => void;
}

export function RepositoryWorkflowCard({
  entry,
  workflows,
  activeFilter,
  onRefresh,
}: RepositoryWorkflowCardProps) {
  const [owner, repoName] = entry.repository.full_name.split('/');

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base sm:text-lg">
              <a
                href={entry.repository.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary flex items-center gap-2 transition-colors text-foreground"
              >
                <span className="truncate">
                  <span className="text-muted-foreground text-xs font-normal">{entry.repository.owner.login}/</span>
                  {entry.repository.name}
                </span>
                <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
              </a>
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm line-clamp-2">
              {entry.repository.description || 'No description'}
            </CardDescription>
            <RepositoryHealth metrics={entry.metrics} />
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              onClick={onRefresh}
              disabled={entry.isLoading}
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              title="Refresh repository"
            >
              <RefreshCw className={`w-3 h-3 ${entry.isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {entry.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading workflows...</span>
          </div>
        ) : entry.error ? (
          <div className="flex items-center gap-2 py-4 text-destructive">
            <XCircle className="w-5 h-5" />
            <span>{entry.error}</span>
          </div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>
              {activeFilter
                ? `No workflows found with status "${activeFilter}"`
                : 'No recent workflows found'}
            </p>
            {!activeFilter && (
              <p className="text-sm">This repository may not have GitHub Actions configured</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className={`flex flex-col p-4 border rounded-xl hover:shadow-md hover:border-primary/30 transition-all duration-200 gap-3 ${getRunBorderColor(workflow)}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <a
                        href={workflow.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold hover:text-primary transition-colors text-lg text-foreground flex items-center gap-2 group"
                      >
                        <span className="flex-1 min-w-0">{workflow.name}</span>
                        <ExternalLink className="w-4 h-4 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                      </a>
                    </div>
                    <div className="flex-shrink-0">
                      <WorkflowStatusBadge status={workflow.status} conclusion={workflow.conclusion} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                    <span>#{workflow.run_number}</span>
                    <span>on {workflow.head_branch}</span>
                    <span>by {workflow.actor.login}</span>
                    <span>{formatRelativeTime(workflow.updated_at)}</span>
                  </div>

                  <div className="mt-1.5">
                    <RunTiming
                      run={workflow}
                      history={entry.histories.get(workflow.workflow_id)}
                    />
                  </div>

                  <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-1 sm:line-clamp-2">
                    {workflow.display_title}
                  </p>

                  <WorkflowJobs owner={owner} repo={repoName} run={workflow} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
