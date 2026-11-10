/**
 * Workflow Context
 * Fetches recent runs and derives runtime/queue metrics for every monitored
 * repository. A single API call per repository powers both the latest status
 * and the timing history.
 */
'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
  useCallback,
} from 'react';
import { GitHubApiClient } from '@/lib/api/github';
import { GitHubWorkflowRun, GitHubRateLimit, Repository } from '@/lib/api/types';
import {
  buildRepositoryMetrics,
  buildWorkflowHistories,
  RepositoryMetrics,
  WorkflowHistory,
} from '@/lib/workflow-metrics';
import { mapWithConcurrency } from '@/lib/concurrency';
import { useGitHubToken } from './github-token-context';
import { useRepositorySelection } from './repository-selection-context';
import { useDisplaySettings } from './display-settings-context';

export interface RepositoryWorkflows {
  repository: Repository;
  /** Latest run per workflow (the status cards). */
  workflows: GitHubWorkflowRun[];
  /** Recent run history used for timing statistics. */
  runs: GitHubWorkflowRun[];
  histories: Map<number, WorkflowHistory>;
  metrics: RepositoryMetrics;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

interface WorkflowContextType {
  repositoryWorkflows: RepositoryWorkflows[];
  isLoading: boolean;
  error: string | null;
  lastGlobalUpdate: Date | null;
  rateLimit: GitHubRateLimit | null;
  refreshWorkflows: () => Promise<void>;
  refreshRepository: (repositoryId: number) => Promise<void>;
}

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

interface WorkflowProviderProps {
  children: ReactNode;
}

const RUNS_PER_REPOSITORY = 50;
const MAX_PARALLEL_REQUESTS = 4;
const EMPTY_METRICS: RepositoryMetrics = {
  totalRuns: 0,
  workflowCount: 0,
  runningCount: 0,
  queuedCount: 0,
  completedCount: 0,
  successRate: null,
  averageDurationMs: null,
  medianDurationMs: null,
  averageQueueMs: null,
  estimatedQueueDrainMs: 0,
  oldestQueuedMs: null,
  longestRunningMs: null,
  staleCount: 0,
  lastSuccessAt: null,
};

export function WorkflowProvider({ children }: WorkflowProviderProps) {
  const { token, isValidated } = useGitHubToken();
  const { selectedRepositories } = useRepositorySelection();
  const { settings } = useDisplaySettings();

  const [repositoryWorkflows, setRepositoryWorkflows] = useState<RepositoryWorkflows[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGlobalUpdate, setLastGlobalUpdate] = useState<Date | null>(null);
  const [rateLimit, setRateLimit] = useState<GitHubRateLimit | null>(null);

  const repositoryWorkflowsRef = useRef<RepositoryWorkflows[]>([]);
  const refreshingRef = useRef(false);

  useEffect(() => {
    repositoryWorkflowsRef.current = repositoryWorkflows;
  }, [repositoryWorkflows]);

  // Keep the repository list in sync with the selection without discarding
  // data already loaded for repositories that stay selected.
  useEffect(() => {
    setRepositoryWorkflows((current) =>
      selectedRepositories.map((repository) => {
        const existing = current.find((entry) => entry.repository.id === repository.id);
        if (existing) return { ...existing, repository };
        return {
          repository,
          workflows: [],
          runs: [],
          histories: new Map(),
          metrics: EMPTY_METRICS,
          isLoading: false,
          error: null,
          lastUpdated: null,
        };
      })
    );
  }, [selectedRepositories]);

  const applySnapshot = useCallback(
    (
      repositoryId: number,
      runs: GitHubWorkflowRun[],
      now: number
    ): RepositoryWorkflows | null => {
      let updated: RepositoryWorkflows | null = null;

      setRepositoryWorkflows((current) =>
        current.map((entry) => {
          if (entry.repository.id !== repositoryId) return entry;

          const histories = buildWorkflowHistories(runs, now);
          const metrics = buildRepositoryMetrics(runs, histories, now);
          const workflows = Array.from(
            histories.values(),
            (history) => history.runs[0]
          )
            .filter(Boolean)
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );

          updated = {
            ...entry,
            workflows,
            runs,
            histories,
            metrics,
            isLoading: false,
            error: null,
            lastUpdated: new Date(now),
          };
          return updated;
        })
      );

      return updated;
    },
    []
  );

  const fetchRepository = useCallback(
    async (repository: RepositoryWorkflows['repository']): Promise<void> => {
      if (!token || !isValidated) return;

      setRepositoryWorkflows((current) =>
        current.map((entry) =>
          entry.repository.id === repository.id
            ? { ...entry, isLoading: true, error: null }
            : entry
        )
      );

      try {
        const apiClient = new GitHubApiClient(token);
        const [owner, repo] = repository.full_name.split('/');
        const snapshot = await apiClient.getWorkflowRunSnapshot(owner, repo, {
          per_page: RUNS_PER_REPOSITORY,
        });

        applySnapshot(repository.id, snapshot.runs, Date.now());
        setRateLimit(snapshot.rateLimit);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch workflows';
        setRepositoryWorkflows((current) =>
          current.map((entry) =>
            entry.repository.id === repository.id
              ? { ...entry, isLoading: false, error: message }
              : entry
          )
        );
      }
    },
    [token, isValidated, applySnapshot]
  );

  const refreshRepository = useCallback(
    async (repositoryId: number) => {
      const entry = repositoryWorkflowsRef.current.find(
        (item) => item.repository.id === repositoryId
      );
      if (entry) await fetchRepository(entry.repository);
    },
    [fetchRepository]
  );

  const refreshWorkflows = useCallback(async () => {
    if (!token || !isValidated) return;
    if (refreshingRef.current) return;
    if (repositoryWorkflowsRef.current.length === 0) return;

    refreshingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const entries = [...repositoryWorkflowsRef.current];
      const results = await mapWithConcurrency(
        entries,
        MAX_PARALLEL_REQUESTS,
        async (entry) => {
          try {
            const apiClient = new GitHubApiClient(token);
            const [owner, repo] = entry.repository.full_name.split('/');
            const snapshot = await apiClient.getWorkflowRunSnapshot(owner, repo, {
              per_page: RUNS_PER_REPOSITORY,
            });
            return { repositoryId: entry.repository.id, snapshot, error: null };
          } catch (err) {
            return {
              repositoryId: entry.repository.id,
              snapshot: null,
              error: err instanceof Error ? err.message : 'Failed to fetch workflows',
            };
          }
        }
      );

      const now = Date.now();
      const newestRateLimit =
        results.find((item) => item.snapshot?.rateLimit)?.snapshot?.rateLimit ?? null;

      setRepositoryWorkflows((current) =>
        current.map((entry) => {
          const result = results.find((item) => item.repositoryId === entry.repository.id);
          if (!result) return entry;
          if (!result.snapshot) {
            return { ...entry, isLoading: false, error: result.error };
          }

          const { runs } = result.snapshot;

          const histories = buildWorkflowHistories(runs, now);
          const metrics = buildRepositoryMetrics(runs, histories, now);
          const workflows = Array.from(
            histories.values(),
            (history) => history.runs[0]
          )
            .filter(Boolean)
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );

          return {
            ...entry,
            workflows,
            runs,
            histories,
            metrics,
            isLoading: false,
            error: null,
            lastUpdated: new Date(now),
          };
        })
      );

      if (newestRateLimit) setRateLimit(newestRateLimit);
      setLastGlobalUpdate(new Date(now));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh workflows');
    } finally {
      refreshingRef.current = false;
      setIsLoading(false);
    }
  }, [token, isValidated]);

  // Auto refresh with jitter, paused while the tab is hidden.
  useEffect(() => {
    const intervalMs = settings.refreshInterval * 1000;
    if (intervalMs <= 0 || repositoryWorkflows.length === 0) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      const jitter = intervalMs * (0.9 + Math.random() * 0.2);
      timer = setTimeout(async () => {
        if (typeof document === 'undefined' || !document.hidden) {
          await refreshWorkflows();
        }
        schedule();
      }, jitter);
    };

    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [refreshWorkflows, settings.refreshInterval, repositoryWorkflows.length]);

  // Initial load when repositories become available.
  useEffect(() => {
    if (!token || !isValidated || repositoryWorkflows.length === 0) return;

    const hasUnloaded = repositoryWorkflows.some(
      (entry) => entry.lastUpdated === null && !entry.isLoading && !entry.error
    );
    if (hasUnloaded) refreshWorkflows();
  }, [token, isValidated, repositoryWorkflows, refreshWorkflows]);

  const value: WorkflowContextType = {
    repositoryWorkflows,
    isLoading,
    error,
    lastGlobalUpdate,
    rateLimit,
    refreshWorkflows,
    refreshRepository,
  };

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflow() {
  const context = useContext(WorkflowContext);
  if (context === undefined) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }
  return context;
}
