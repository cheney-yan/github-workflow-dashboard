/**
 * Repository Selection Context
 * Manages selected repositories state and provides repository management
 */
'use client';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import { setSecureItem, getSecureItem, removeSecureItem, STORAGE_KEYS } from '@/lib/storage/secure-storage';
import { GitHubApiClient } from '@/lib/api/github';
import { Repository } from '@/lib/api/types';
import { useGitHubToken } from './github-token-context';

// Extended repository type with workflow status
export type WorkflowStatus = 'unknown' | 'checking' | 'has-workflows' | 'no-workflows' | 'error';

export interface RepositoryWithWorkflowStatus extends Repository {
  workflowStatus: WorkflowStatus;
  workflowCount?: number;
}

// Organization interface
export interface Organization {
  login: string;
  id: number;
  avatar_url: string;
  type: 'User' | 'Organization';
}

interface RepositorySelectionContextType {
  selectedRepositories: RepositoryWithWorkflowStatus[];
  availableRepositories: RepositoryWithWorkflowStatus[];
  filteredRepositories: RepositoryWithWorkflowStatus[];
  organizations: Organization[];
  selectedOrganization: string | null;
  isLoading: boolean;
  isLoadingOrganizations: boolean;
  error: string | null;
  loadingStatus: string | null;
  nameFilter: string;
  fetchRepositories: (owner?: string) => Promise<void>;
  fetchOrganizations: () => Promise<void>;
  setSelectedOrganization: (org: string | null) => void;
  toggleRepository: (repository: RepositoryWithWorkflowStatus) => void;
  setSelectedRepositories: (repositories: RepositoryWithWorkflowStatus[]) => void;
  clearSelection: () => void;
  setNameFilter: (filter: string) => void;
  clearFilter: () => void;
}

const RepositorySelectionContext = createContext<RepositorySelectionContextType | undefined>(undefined);

interface RepositorySelectionProviderProps {
  children: ReactNode;
}

export function RepositorySelectionProvider({ children }: RepositorySelectionProviderProps) {
  const { token, isValidated, userId } = useGitHubToken();
  const [selectedRepositories, setSelectedRepositoriesState] = useState<RepositoryWithWorkflowStatus[]>([]);
  const [availableRepositories, setAvailableRepositories] = useState<RepositoryWithWorkflowStatus[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganization, setSelectedOrganizationState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOrganizations, setIsLoadingOrganizations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [nameFilter, setNameFilterState] = useState<string>('');
  const storageLoadedRef = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);

  // Clear a previous user's repository selection when the authenticated
  // identity changes or the token is removed.
  useEffect(() => {
    const previous = previousUserIdRef.current;
    if (previous && previous !== (userId ?? null)) {
      setSelectedRepositoriesState([]);
      removeSecureItem(STORAGE_KEYS.SELECTED_REPOSITORIES);
    }
    previousUserIdRef.current = userId ?? null;
  }, [userId]);

  // Load selected repositories and last organization from storage on mount
  useEffect(() => {
    async function loadStoredData() {
      try {
        // Load selected repositories
        const stored = await getSecureItem(STORAGE_KEYS.SELECTED_REPOSITORIES);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const repositories = parsed.filter(
              (repo): repo is Repository =>
                Boolean(repo) &&
                typeof repo.id === 'number' &&
                typeof repo.name === 'string' &&
                typeof repo.full_name === 'string' &&
                typeof repo.html_url === 'string' &&
                Boolean(repo.owner) &&
                typeof repo.owner.login === 'string' &&
                repo.full_name.split('/').length === 2
            );
            const repositoriesWithStatus = repositories.map(repo => ({
              ...repo,
              workflowStatus: 'unknown' as WorkflowStatus // Will be updated when workflows are checked
            }));
            setSelectedRepositoriesState(repositoriesWithStatus);
          }
        }
        
        // Load last selected organization
        let lastOrg: string | null = null;
        try {
          lastOrg = localStorage.getItem('github-flow-dashboard-last-org');
        } catch {
          lastOrg = null;
        }
        if (lastOrg && lastOrg !== 'null') {
          setSelectedOrganizationState(lastOrg);
        } else if (userId) {
          // Default to user's personal repositories
          setSelectedOrganizationState(userId);
        }
      } catch (err) {
        console.error('Failed to load stored data:', err);
      } finally {
        storageLoadedRef.current = true;
      }
    }

    loadStoredData();
  }, [userId]);


  // Persist selected repositories to storage whenever they change
  useEffect(() => {
    if (!storageLoadedRef.current) return;

    async function saveSelectedRepositories() {
      try {
        if (selectedRepositories.length > 0) {
          await setSecureItem(STORAGE_KEYS.SELECTED_REPOSITORIES, JSON.stringify(selectedRepositories));
        } else {
          removeSecureItem(STORAGE_KEYS.SELECTED_REPOSITORIES);
        }
      } catch (err) {
        console.error('Failed to save selected repositories:', err);
      }
    }

    saveSelectedRepositories();
  }, [selectedRepositories]);

  // Background workflow checking function
  const checkWorkflowsInBackground = useCallback(async (
    repositories: RepositoryWithWorkflowStatus[], 
    apiClient: GitHubApiClient
  ) => {
    const batchSize = 5; // Check 5 repositories at a time to avoid rate limiting
    let processedCount = 0;

    for (let i = 0; i < repositories.length; i += batchSize) {
      const batch = repositories.slice(i, i + batchSize);
      
      // Update status to 'checking' for current batch
      setAvailableRepositories(current => 
        current.map(repo => {
          const isInCurrentBatch = batch.some(batchRepo => batchRepo.id === repo.id);
          return isInCurrentBatch && repo.workflowStatus === 'unknown'
            ? { ...repo, workflowStatus: 'checking' as WorkflowStatus }
            : repo;
        })
      );

      // Check workflows for current batch in parallel (OPTIMIZED: single API call per repo)
      const batchPromises = batch.map(async (repo) => {
        try {
          // PERFORMANCE OPTIMIZATION: Use hasRecentWorkflowActivity for single API call
          const activityCheck = await apiClient.hasRecentWorkflowActivity(repo.owner.login, repo.name, {
            daysBack: 90 // Look for workflow activity in last 90 days
          });
          
          return {
            id: repo.id,
            status: activityCheck.hasActivity ? 'has-workflows' as WorkflowStatus : 'no-workflows' as WorkflowStatus,
            count: activityCheck.totalRuns
          };
        } catch (error) {
          console.warn(`[Repository Selection Context] ❌ Failed to check workflow activity for ${repo.name}:`, error);
          return {
            id: repo.id,
            status: 'error' as WorkflowStatus,
            count: 0
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      processedCount += batch.length;

      // Update repositories with workflow results
      setAvailableRepositories(current => 
        current.map(repo => {
          const result = batchResults.find(r => r.id === repo.id);
          return result
            ? { 
                ...repo, 
                workflowStatus: result.status,
                workflowCount: result.count
              }
            : repo;
        })
      );

      console.log(`[Repository Selection Context] Processed ${processedCount}/${repositories.length} repositories`);

      // Small delay to avoid hitting rate limits
      if (i + batchSize < repositories.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log('[Repository Selection Context] ✅ Background workflow checking complete');
  }, []);

  const fetchRepositories = useCallback(async (owner?: string) => {
    if (!token || !isValidated) {
      setError('Valid GitHub token required');
      return;
    }

    const targetOwner = owner || selectedOrganization || userId;
    if (!targetOwner) {
      setError('No organization selected');
      return;
    }

    console.log(`[Repository Selection Context] Fetching repositories for ${targetOwner}...`);
    setIsLoading(true);
    setError(null);
    setLoadingStatus('Fetching repositories...');

    try {
      const apiClient = new GitHubApiClient(token);
      const allRepositories: Repository[] = [];
      let page = 1;
      const perPage = 100;
      const maxPages = 20; // hard stop: 2,000 repositories per owner

      while (page <= maxPages) {
        setLoadingStatus(`Fetching page ${page}...`);
        const isUser = organizations.find(org => org.login === targetOwner)?.type === 'User';
        const pageRepositories = await apiClient.getRepositories(targetOwner, isUser, {
          per_page: perPage,
          page: page,
          sort: 'updated',
          direction: 'desc'
        });

        if (pageRepositories.length > 0) {
          allRepositories.push(...pageRepositories);
        }
        // If no repositories are found, break immediately to avoid infinite loop
        if (pageRepositories.length === 0) {
          break;
        }
        // If less than perPage, we've reached the last page
        if (pageRepositories.length < perPage) {
          break;
        }

        page++;
      }

      const activeRepos = allRepositories
        .filter(repo => !repo.archived && !repo.disabled)
        .map(repo => ({ ...repo, workflowStatus: 'unknown' as WorkflowStatus }));

      setAvailableRepositories(activeRepos);

      if (activeRepos.length > 0) {
        checkWorkflowsInBackground(activeRepos, apiClient);
      }
      // If no repositories found, set error or status for GUI
      if (activeRepos.length === 0) {
        setError('No repositories found for this organization.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch repositories';
      console.error('[Repository Selection Context] ❌ Repository fetch error:', err);
      setError(message);
    } finally {
      setIsLoading(false);
      setLoadingStatus(null);
    }
  }, [token, isValidated, selectedOrganization, userId, checkWorkflowsInBackground, organizations]);

  const toggleRepository = useCallback((repository: RepositoryWithWorkflowStatus) => {
    // Only allow toggling repositories with workflows
    if (repository.workflowStatus !== 'has-workflows') {
      console.log(`[Repository Selection Context] Cannot select ${repository.name}: No workflows available`);
      return;
    }

    setSelectedRepositoriesState(current => {
      const isSelected = current.some(repo => repo.id === repository.id);
      
      if (isSelected) {
        // Remove repository
        return current.filter(repo => repo.id !== repository.id);
      } else {
        // Add repository
        return [...current, repository];
      }
    });
  }, []);

  const setSelectedRepositories = useCallback((repositories: RepositoryWithWorkflowStatus[]) => {
    setSelectedRepositoriesState(repositories);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedRepositoriesState([]);
  }, []);

  const fetchOrganizations = useCallback(async () => {
    if (!token || !isValidated || !userId) {
      return;
    }

    console.log('[Repository Selection Context] Fetching organizations...');
    setIsLoadingOrganizations(true);

    try {
      const apiClient = new GitHubApiClient(token);
      
      // Get user info first
      const user = await apiClient.validateToken();
      
      // Get organizations
      const orgs = await apiClient.getUserOrganizations();
      
      // Create organization list with user first
      const allOrganizations: Organization[] = [
        {
          login: user.login,
          id: user.id,
          avatar_url: user.avatar_url,
          type: 'User'
        },
        ...orgs.map(org => ({
          login: org.login,
          id: org.id,
          avatar_url: org.avatar_url,
          type: 'Organization' as const
        }))
      ];
      
      setOrganizations(allOrganizations);
      console.log(`[Repository Selection Context] Found ${allOrganizations.length} organizations`);
      
    } catch (err) {
      console.error('[Repository Selection Context] Failed to fetch organizations:', err);
    } finally {
      setIsLoadingOrganizations(false);
    }
  }, [token, isValidated, userId]);

  const setSelectedOrganization = useCallback((org: string | null) => {
    setSelectedOrganizationState(org);
    
    // Clear current repository list and stop any ongoing verification
    setAvailableRepositories([]);
    setLoadingStatus(null);
    setError(null);
    
    // Save to localStorage (non-sensitive UI preference)
    try {
      if (org) {
        localStorage.setItem('github-flow-dashboard-last-org', org);
      } else {
        localStorage.removeItem('github-flow-dashboard-last-org');
      }
    } catch {
      // Storage can be blocked in private mode; the selection still applies.
    }
    
    // Fetch repositories for the new organization
    if (org) {
      fetchRepositories(org);
    }
  }, [fetchRepositories]);

  const setNameFilter = useCallback((filter: string) => {
    setNameFilterState(filter);
  }, []);

  const clearFilter = useCallback(() => {
    setNameFilterState('');
  }, []);

  // Calculate filtered repositories based on name filter only
  const filteredRepositories = useMemo(() => {
    if (!nameFilter.trim()) {
      return availableRepositories;
    }
    
    const filterLower = nameFilter.toLowerCase().trim();
    return availableRepositories.filter(repo =>
      repo.name.toLowerCase().includes(filterLower) ||
      repo.description?.toLowerCase().includes(filterLower)
    );
  }, [availableRepositories, nameFilter]);

  // Fetch organizations when token becomes available
  useEffect(() => {
    if (token && isValidated && userId) {
      fetchOrganizations();
    }
  }, [token, isValidated, userId, fetchOrganizations]);

  // Fetch repositories when organization is selected
  useEffect(() => {
    if (token && isValidated && selectedOrganization) {
      fetchRepositories(selectedOrganization);
    }
  }, [token, isValidated, selectedOrganization, fetchRepositories]);

  const contextValue: RepositorySelectionContextType = {
    selectedRepositories,
    availableRepositories,
    filteredRepositories,
    organizations,
    selectedOrganization,
    isLoading,
    isLoadingOrganizations,
    error,
    loadingStatus,
    nameFilter,
    fetchRepositories,
    fetchOrganizations,
    setSelectedOrganization,
    toggleRepository,
    setSelectedRepositories,
    clearSelection,
    setNameFilter,
    clearFilter,
  };

  return (
    <RepositorySelectionContext.Provider value={contextValue}>
      {children}
    </RepositorySelectionContext.Provider>
  );
}

export function useRepositorySelection(): RepositorySelectionContextType {
  const context = useContext(RepositorySelectionContext);
  if (context === undefined) {
    throw new Error('useRepositorySelection must be used within a RepositorySelectionProvider');
  }
  return context;
}