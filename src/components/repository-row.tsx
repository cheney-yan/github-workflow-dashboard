'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import type { RepositoryWithWorkflowStatus, WorkflowStatus } from '@/contexts/repository-selection-context';

export const getWorkflowStatusInfo = (status: WorkflowStatus, workflowCount?: number) => {
  switch (status) {
    case 'unknown':
      return {
        icon: <div className="w-4 h-4 bg-muted rounded-full animate-pulse" />,
        text: 'Checking...',
        className: 'text-muted-foreground',
        selectable: false,
      };
    case 'checking':
      return {
        icon: <Loader2 className="w-4 h-4 animate-spin text-primary" />,
        text: 'Checking workflows...',
        className: 'text-primary',
        selectable: false,
      };
    case 'has-workflows':
      return {
        icon: <Check className="w-4 h-4 text-green-500 dark:text-green-400" />,
        text: workflowCount ? `${workflowCount.toLocaleString()} runs` : 'Has workflows',
        className: 'text-green-600 dark:text-green-400',
        selectable: true,
      };
    case 'no-workflows':
      return {
        icon: <AlertCircle className="w-4 h-4 text-muted-foreground" />,
        text: 'No workflows',
        className: 'text-muted-foreground',
        selectable: false,
      };
    case 'error':
      return {
        icon: <AlertCircle className="w-4 h-4 text-destructive" />,
        text: 'Check failed',
        className: 'text-destructive',
        selectable: false,
      };
  }
};

interface RepositoryRowProps {
  repository: RepositoryWithWorkflowStatus;
  selected: boolean;
  onToggle: () => void;
}

export function RepositoryRow({ repository, selected, onToggle }: RepositoryRowProps) {
  const statusInfo = getWorkflowStatusInfo(repository.workflowStatus, repository.workflowCount);
  const selectable = statusInfo.selectable;

  return (
    <div
      className={cn(
        'flex items-start space-x-3 p-3 rounded-lg border transition-colors',
        selectable ? 'hover:bg-muted/50 cursor-pointer' : 'opacity-50 bg-muted/20'
      )}
      onClick={() => selectable && onToggle()}
    >
      <Checkbox
        id={`repo-${repository.id}`}
        checked={selected}
        disabled={!selectable}
        onCheckedChange={() => selectable && onToggle()}
        onClick={(event) => event.stopPropagation()}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <label
            htmlFor={`repo-${repository.id}`}
            className={cn('text-sm font-medium leading-none cursor-pointer', !selectable && 'cursor-not-allowed')}
          >
            <span className="text-muted-foreground text-xs font-normal">{repository.owner.login}/</span>
            {repository.name}
          </label>
          {repository.private && <Badge variant="secondary" className="text-xs">Private</Badge>}
          <div className="flex items-center gap-1">
            {statusInfo.icon}
            <span className={cn('text-xs', statusInfo.className)}>{statusInfo.text}</span>
          </div>
        </div>

        {repository.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{repository.description}</p>
        )}

        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <span>Updated {new Date(repository.updated_at).toLocaleDateString()}</span>
          <span>•</span>
          <a
            href={repository.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 underline"
            onClick={(event) => event.stopPropagation()}
          >
            View on GitHub →
          </a>
        </div>
      </div>
    </div>
  );
}
