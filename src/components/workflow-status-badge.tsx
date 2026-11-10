import { AlertCircle, CheckCircle, Clock, Loader, XCircle } from 'lucide-react';
import type { GitHubWorkflowRun } from '@/lib/api/types';

interface WorkflowStatusBadgeProps {
  status: GitHubWorkflowRun['status'];
  conclusion: GitHubWorkflowRun['conclusion'];
}

export function WorkflowStatusBadge({ status, conclusion }: WorkflowStatusBadgeProps) {
  if (!status) {
    return <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded font-medium">UNKNOWN</span>;
  }

  let displayText = status.toUpperCase();
  let bgColor = 'bg-slate-100';
  let textColor = 'text-slate-600';
  let IconComponent = AlertCircle;

  if (status === 'in_progress') {
    displayText = 'RUNNING';
    bgColor = 'bg-sky-500';
    textColor = 'text-white';
    IconComponent = Loader;
  } else if (status === 'queued') {
    displayText = 'QUEUED';
    bgColor = 'bg-orange-500';
    textColor = 'text-white';
    IconComponent = Clock;
  } else if (status === 'waiting') {
    displayText = 'WAITING';
    bgColor = 'bg-amber-500';
    textColor = 'text-white';
    IconComponent = Clock;
  } else if (status === 'completed') {
    if (conclusion === 'success') {
      displayText = 'SUCCESS';
      bgColor = 'bg-emerald-500';
      textColor = 'text-white';
      IconComponent = CheckCircle;
    } else if (conclusion === 'failure') {
      displayText = 'FAILURE';
      bgColor = 'bg-rose-500';
      textColor = 'text-white';
      IconComponent = XCircle;
    } else if (conclusion === 'cancelled') {
      displayText = 'CANCELLED';
      bgColor = 'bg-stone-500';
      textColor = 'text-white';
      IconComponent = AlertCircle;
    } else if (conclusion === 'skipped') {
      displayText = 'SKIPPED';
      bgColor = 'bg-zinc-500';
      textColor = 'text-white';
      IconComponent = AlertCircle;
    } else if (conclusion === 'timed_out') {
      displayText = 'TIMEOUT';
      bgColor = 'bg-orange-600';
      textColor = 'text-white';
      IconComponent = Clock;
    } else {
      displayText = conclusion?.toUpperCase() || 'COMPLETED';
      bgColor = 'bg-slate-500';
      textColor = 'text-white';
      IconComponent = CheckCircle;
    }
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${bgColor} ${textColor} text-xs font-medium`}>
      <IconComponent className={`w-3 h-3 ${status === 'in_progress' ? 'animate-spin' : ''}`} />
      <span>{displayText}</span>
    </span>
  );
}

/** Strong left border colour used by workflow cards. */
export function getRunBorderColor(run: GitHubWorkflowRun): string {
  if (run.status === 'completed') {
    if (run.conclusion === 'success') return 'border-l-4 border-l-emerald-500 dark:border-l-emerald-400';
    if (run.conclusion === 'failure') return 'border-l-4 border-l-rose-500 dark:border-l-rose-400';
    if (run.conclusion === 'cancelled') return 'border-l-4 border-l-stone-500 dark:border-l-stone-400';
    if (run.conclusion === 'skipped') return 'border-l-4 border-l-zinc-500 dark:border-l-zinc-400';
  } else if (run.status === 'in_progress') {
    return 'border-l-4 border-l-sky-500 dark:border-l-sky-400';
  } else if (run.status === 'queued') {
    return 'border-l-4 border-l-orange-500 dark:border-l-orange-400';
  }
  return 'border-l-4 border-l-slate-300 dark:border-l-slate-600';
}
