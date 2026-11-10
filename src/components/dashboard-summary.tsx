'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { RepositoryWorkflows } from '@/contexts/workflow-context';
import { matchesOnlyMe } from '@/lib/workflow-filters';
import { AlertCircle, CheckCircle, Clock, Loader, XCircle } from 'lucide-react';

interface DashboardSummaryProps {
  repositoryWorkflows: RepositoryWorkflows[];
  onlyMe: boolean;
  userId?: string | null;
  activeFilter: string | null;
  onFilterChange: (label: string | null) => void;
  compactMode: boolean;
}

interface SummaryCard {
  label: string;
  count: number;
  bgColor: string;
  icon: string | null;
}

function buildSummaryCards(
  repositoryWorkflows: RepositoryWorkflows[],
  onlyMe: boolean,
  userId?: string | null
): SummaryCard[] {
  const statusCounts: Record<string, number> = {};
  const conclusionCounts: Record<string, number> = {};
  let total = 0;

  repositoryWorkflows.forEach((repository) => {
    repository.workflows.forEach((run) => {
      if (!matchesOnlyMe(run, userId, onlyMe)) return;
      total += 1;
      statusCounts[run.status] = (statusCounts[run.status] || 0) + 1;
      if (run.status === 'completed' && run.conclusion) {
        conclusionCounts[run.conclusion] = (conclusionCounts[run.conclusion] || 0) + 1;
      }
    });
  });

  const cards: SummaryCard[] = [
    { label: 'Total', count: total, bgColor: 'bg-slate-700', icon: null },
  ];

  Object.entries(statusCounts).forEach(([status, count]) => {
    if (count === 0 || status === 'completed') return;
    if (status === 'in_progress') {
      cards.push({ label: status, count, bgColor: 'bg-sky-600', icon: 'Loader' });
    } else if (status === 'queued') {
      cards.push({ label: status, count, bgColor: 'bg-orange-500', icon: 'Clock' });
    } else if (status === 'waiting') {
      cards.push({ label: status, count, bgColor: 'bg-amber-500', icon: 'Clock' });
    } else {
      cards.push({ label: status, count, bgColor: 'bg-stone-600', icon: 'AlertCircle' });
    }
  });

  Object.entries(conclusionCounts).forEach(([conclusion, count]) => {
    if (count === 0) return;
    if (conclusion === 'success') {
      cards.push({ label: conclusion, count, bgColor: 'bg-emerald-600', icon: 'CheckCircle' });
    } else if (conclusion === 'failure') {
      cards.push({ label: conclusion, count, bgColor: 'bg-rose-600', icon: 'XCircle' });
    } else if (conclusion === 'cancelled') {
      cards.push({ label: conclusion, count, bgColor: 'bg-stone-500', icon: 'AlertCircle' });
    } else if (conclusion === 'skipped') {
      cards.push({ label: conclusion, count, bgColor: 'bg-zinc-500', icon: 'AlertCircle' });
    } else if (conclusion === 'timed_out') {
      cards.push({ label: conclusion, count, bgColor: 'bg-orange-600', icon: 'Clock' });
    } else {
      cards.push({ label: conclusion, count, bgColor: 'bg-slate-500', icon: 'CheckCircle' });
    }
  });

  return cards;
}

function activeCardStyles(label: string): string {
  switch (label.toLowerCase()) {
    case 'total': return 'ring-inset ring-4 ring-slate-800 dark:ring-slate-300';
    case 'queued': return 'ring-inset ring-4 ring-orange-800 dark:ring-orange-300';
    case 'failure': return 'ring-inset ring-4 ring-rose-800 dark:ring-rose-300';
    case 'success': return 'ring-inset ring-4 ring-emerald-800 dark:ring-emerald-300';
    case 'cancelled': return 'ring-inset ring-4 ring-stone-800 dark:ring-stone-300';
    case 'in_progress':
    case 'running': return 'ring-inset ring-4 ring-sky-800 dark:ring-sky-300';
    default: return 'ring-inset ring-4 ring-gray-800 dark:ring-gray-300';
  }
}

function CardIcon({ type, compact }: { type: string | null; compact: boolean }) {
  if (!type) {
    return <span className={`${compact ? 'w-3 h-3' : 'w-6 h-6'} bg-current rounded-full opacity-80`} />;
  }

  const className = `${compact ? 'w-4 h-4' : 'w-6 h-6'} text-white drop-shadow-sm ${type === 'Loader' ? 'animate-spin' : ''}`;
  switch (type) {
    case 'Clock': return <Clock className={className} />;
    case 'Loader': return <Loader className={className} />;
    case 'CheckCircle': return <CheckCircle className={className} />;
    case 'XCircle': return <XCircle className={className} />;
    case 'AlertCircle': return <AlertCircle className={className} />;
    default: return <span className={`${compact ? 'w-3 h-3' : 'w-6 h-6'} bg-current rounded-full opacity-80`} />;
  }
}

export function DashboardSummary({
  repositoryWorkflows,
  onlyMe,
  userId,
  activeFilter,
  onFilterChange,
  compactMode,
}: DashboardSummaryProps) {
  const cards = buildSummaryCards(repositoryWorkflows, onlyMe, userId);

  return (
    <div className={`grid gap-2 ${
      compactMode
        ? 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10'
        : cards.length <= 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : cards.length <= 4
        ? 'grid-cols-2 lg:grid-cols-4'
        : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
    }`}>
      {cards.map((card) => (
        <Card
          key={card.label}
          className={`cursor-pointer transition-all duration-300 hover:scale-105 ${
            compactMode ? 'rounded-lg' : ''
          } ${
            activeFilter === card.label ? activeCardStyles(card.label) : 'hover:shadow-lg border-transparent'
          } ${card.bgColor} backdrop-blur-sm`}
          onClick={() => onFilterChange(activeFilter === card.label ? null : card.label)}
        >
          <CardContent className={compactMode ? 'p-1' : 'p-4 sm:p-5'}>
            {compactMode ? (
              <div className="flex items-center justify-center gap-1">
                <p className="text-lg font-black text-white drop-shadow-lg">{card.count}</p>
                <div className="bg-white/20 backdrop-blur-sm w-6 h-6 rounded-md flex items-center justify-center shadow-lg border border-white/30">
                  <CardIcon type={card.icon} compact />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm sm:text-base font-bold text-white/90 capitalize mb-1 tracking-wide">
                    {card.label.replace(/_/g, ' ')}
                  </p>
                  <p className="text-2xl sm:text-3xl lg:text-4xl font-black text-white drop-shadow-lg">{card.count}</p>
                </div>
                <div className="flex-shrink-0 ml-3">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg border border-white/30">
                    <CardIcon type={card.icon} compact={false} />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
