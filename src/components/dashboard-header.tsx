'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { REFRESH_INTERVALS } from '@/contexts/display-settings-context';
import { formatRelativeTime } from '@/lib/format';
import { Moon, Sun, RefreshCw, Settings, ZoomIn, ZoomOut } from 'lucide-react';

interface DashboardHeaderProps {
  dashboardName: string;
  repositoryCount: number;
  workflowCount: number;
  activeFilter: string | null;
  lastGlobalUpdate: Date | null;
  userId?: string | null;
  onlyMe: boolean;
  onOnlyMeChange: (value: boolean) => void;
  refreshInterval: number;
  onRefreshIntervalChange: (value: number) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  compactMode: boolean;
  onToggleCompactMode: () => void;
  isLoading: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
}

export function DashboardHeader({
  dashboardName,
  repositoryCount,
  workflowCount,
  activeFilter,
  lastGlobalUpdate,
  userId,
  onlyMe,
  onOnlyMeChange,
  refreshInterval,
  onRefreshIntervalChange,
  theme,
  onToggleTheme,
  compactMode,
  onToggleCompactMode,
  isLoading,
  onRefresh,
  onOpenSettings,
}: DashboardHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-2">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{dashboardName}</h1>
        <p className="text-muted-foreground text-sm sm:text-base mt-1">
          Monitoring {repositoryCount} {repositoryCount === 1 ? 'repository' : 'repositories'} · {workflowCount} active {workflowCount === 1 ? 'workflow' : 'workflows'}
          {activeFilter && (
            <span className="ml-2 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs font-medium">
              Filtered by: {activeFilter.replace(/_/g, ' ')}
            </span>
          )}
          {lastGlobalUpdate && (
            <span className="ml-2 text-xs sm:text-sm">
              • Last updated {formatRelativeTime(lastGlobalUpdate.toISOString())}
            </span>
          )}
          <br />
          <span className="text-xs text-muted-foreground">
            Press <kbd className="px-1 py-0.5 bg-muted text-muted-foreground rounded text-xs">R</kbd> to refresh, <kbd className="px-1 py-0.5 bg-muted text-muted-foreground rounded text-xs">S</kbd> for settings, <kbd className="px-1 py-0.5 bg-muted text-muted-foreground rounded text-xs">Z</kbd> for compact mode
            {activeFilter && (
              <span className="ml-2">
                • <kbd className="px-1 py-0.5 bg-muted text-muted-foreground rounded text-xs">Click card again</kbd> to clear filter
              </span>
            )}
          </span>
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
        {userId && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="only-me"
              checked={onlyMe}
              onCheckedChange={(checked) => onOnlyMeChange(checked === true)}
              className="h-4 w-4 border-2 border-slate-400 dark:border-slate-500 bg-background"
            />
            <label htmlFor="only-me" className="text-sm text-muted-foreground whitespace-nowrap cursor-pointer">
              Only Me
            </label>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Auto-refresh:</span>
          <Select
            value={refreshInterval.toString()}
            onValueChange={(value) => onRefreshIntervalChange(Number(value))}
          >
            <SelectTrigger className="w-[120px] h-8" aria-label="Auto-refresh interval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFRESH_INTERVALS.map((interval) => (
                <SelectItem key={interval.value} value={interval.value.toString()}>
                  {interval.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            onClick={onToggleTheme}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <Button
            onClick={onToggleCompactMode}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title={`${compactMode ? 'Exit compact mode (zoom out)' : 'Enter compact mode (zoom in)'}`}
          >
            {compactMode ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
          </Button>

          <Button
            onClick={onRefresh}
            disabled={isLoading}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Refresh all workflows"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            onClick={onOpenSettings}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Open settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
