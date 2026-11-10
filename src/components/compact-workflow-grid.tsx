'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { GitHubWorkflowRun } from '@/lib/api/types';
import type { WorkflowHistory } from '@/lib/workflow-metrics';
import { formatRelativeTime } from '@/lib/format';
import { RunTiming } from '@/components/workflow-stats';
import { getRunBorderColor } from '@/components/workflow-status-badge';

export interface CompactWorkflowItem {
  run: GitHubWorkflowRun;
  repositoryName: string;
  repositoryUrl: string;
  history?: WorkflowHistory;
}

export function CompactWorkflowGrid({ items }: { items: CompactWorkflowItem[] }) {
  return (
    <div className="mt-6">
      <div
        className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 auto-rows-max overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 320px)' }}
      >
        {items.map(({ run, repositoryName, repositoryUrl, history }) => (
          <div
            key={`${repositoryName}-${run.id}`}
            className={`flex flex-col p-2 border rounded-lg hover:shadow-md hover:border-primary/30 transition-all duration-200 gap-2 h-fit ${getRunBorderColor(run)}`}
          >
            <div className="flex items-center gap-1 mb-1">
              <a
                href={repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 group truncate"
              >
                <span className="truncate">{repositoryName}</span>
                <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-60 group-hover:opacity-100" />
              </a>
            </div>

            <div className="flex items-start">
              <a
                href={run.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-sm text-foreground hover:text-primary transition-colors flex-1 min-w-0 group"
              >
                <span className="line-clamp-2">{run.name}</span>
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span>#{run.run_number}</span>
              <span>•</span>
              <span className="truncate">{run.head_branch}</span>
              <span>•</span>
              <span>{formatRelativeTime(run.updated_at)}</span>
            </div>

            <RunTiming run={run} history={history} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
