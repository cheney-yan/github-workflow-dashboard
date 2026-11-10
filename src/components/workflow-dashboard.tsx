'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWorkflow } from '@/contexts/workflow-context';
import { useRepositorySelection } from '@/contexts/repository-selection-context';
import { useGitHubToken } from '@/contexts/github-token-context';
import { useDisplaySettings } from '@/contexts/display-settings-context';
import { useTheme } from '@/contexts/theme-context';
import { filterRuns } from '@/lib/workflow-filters';
import { DashboardHeader } from '@/components/dashboard-header';
import { DashboardSummary } from '@/components/dashboard-summary';
import { FleetMetrics } from '@/components/workflow-stats';
import { RunnerUtilization } from '@/components/runner-utilization';
import { CompactWorkflowGrid, type CompactWorkflowItem } from '@/components/compact-workflow-grid';
import { RepositoryWorkflowCard } from '@/components/repository-workflow-card';
import { useWorkflowAlerts } from '@/hooks/use-workflow-alerts';
import { AlertCircle, XCircle } from 'lucide-react';

export function WorkflowDashboard() {
  const router = useRouter();
  const { token, isValidated, userId } = useGitHubToken();
  const { selectedRepositories } = useRepositorySelection();
  const { settings, toggleCompactMode, setRefreshInterval } = useDisplaySettings();
  const { theme, setTheme } = useTheme();
  const {
    repositoryWorkflows,
    isLoading,
    error,
    lastGlobalUpdate,
    rateLimit,
    refreshWorkflows,
    refreshRepository,
  } = useWorkflow();

  const [activeFilter, setActiveFilter] = React.useState<string | null>(null);
  const [onlyMe, setOnlyMe] = React.useState(false);

  useWorkflowAlerts(repositoryWorkflows, settings.alerts);

  // Keyboard shortcuts: R refresh, S settings, Z compact.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

      if (event.key === 'r') {
        event.preventDefault();
        refreshWorkflows();
      } else if (event.key === 's') {
        event.preventDefault();
        router.push('/settings');
      } else if (event.key === 'z') {
        event.preventDefault();
        toggleCompactMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [refreshWorkflows, toggleCompactMode, router]);

  if (!token || !isValidated) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Setup Required</CardTitle>
            <CardDescription>
              Please configure your GitHub token in settings to view workflows
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => router.push('/settings')}>Go to Settings</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (selectedRepositories.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <AlertCircle className="w-5 h-5 text-primary" />
              No Repositories Selected
            </CardTitle>
            <CardDescription>Please select repositories to monitor in settings</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={() => router.push('/settings')} className="w-full">
              Select Repositories
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Select repositories from your accessible organizations to monitor their GitHub Actions workflows
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filter = { onlyMe, userId, activeFilter };
  const totalWorkflows = repositoryWorkflows.reduce(
    (total, entry) => total + filterRuns(entry.workflows, { onlyMe, userId, activeFilter: null }).length,
    0
  );

  const compactItems: CompactWorkflowItem[] = repositoryWorkflows
    .flatMap((entry) =>
      filterRuns(entry.workflows, filter).map((run) => ({
        run,
        repositoryName: `${entry.repository.owner.login}/${entry.repository.name}`,
        repositoryUrl: entry.repository.html_url,
        history: entry.histories.get(run.workflow_id),
      }))
    );

  const visibleRepositories = repositoryWorkflows.filter(
    (entry) => entry.isLoading || entry.error || filterRuns(entry.workflows, filter).length > 0
  );

  return (
    <div>
      <DashboardHeader
        dashboardName={settings.dashboardName}
        repositoryCount={repositoryWorkflows.length}
        workflowCount={totalWorkflows}
        activeFilter={activeFilter}
        lastGlobalUpdate={lastGlobalUpdate}
        userId={userId}
        onlyMe={onlyMe}
        onOnlyMeChange={setOnlyMe}
        refreshInterval={settings.refreshInterval}
        onRefreshIntervalChange={(value) => setRefreshInterval(value as typeof settings.refreshInterval)}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        compactMode={settings.compactMode}
        onToggleCompactMode={toggleCompactMode}
        isLoading={isLoading}
        onRefresh={refreshWorkflows}
        onOpenSettings={() => router.push('/settings')}
      />

      <DashboardSummary
        repositoryWorkflows={repositoryWorkflows}
        onlyMe={onlyMe}
        userId={userId}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        compactMode={settings.compactMode}
      />

      <FleetMetrics repositories={repositoryWorkflows} rateLimit={rateLimit} />
      <RunnerUtilization repositories={repositoryWorkflows} />

      {error && (
        <Card className="mt-4 border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              <p className="text-red-700 dark:text-red-300">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {settings.compactMode ? (
        <CompactWorkflowGrid items={compactItems} />
      ) : (
        <div className="grid gap-4 mt-6 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {visibleRepositories.map((entry) => (
            <RepositoryWorkflowCard
              key={entry.repository.id}
              entry={entry}
              workflows={filterRuns(entry.workflows, filter)}
              activeFilter={activeFilter}
              onRefresh={() => refreshRepository(entry.repository.id)}
            />
          ))}
        </div>
      )}

      {activeFilter && visibleRepositories.length === 0 && (
        <Card className="mt-6">
          <CardContent className="pt-8 pb-8">
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium">
                No repositories have workflows with status &quot;{activeFilter}&quot;
              </p>
              <p className="text-sm mt-2">
                Try selecting a different filter or click the active filter to show all workflows.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
