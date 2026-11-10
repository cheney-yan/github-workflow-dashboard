'use client';

import React, { useEffect, useCallback } from 'react';
import { useRepositorySelection } from '@/contexts/repository-selection-context';
import { useGitHubToken } from '@/contexts/github-token-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { XCircle, Search, X } from 'lucide-react';
import type { RepositoryWithWorkflowStatus } from '@/contexts/repository-selection-context';
import { RepositoryRow, getWorkflowStatusInfo } from '@/components/repository-row';

interface RepositorySelectionProps {
  onSelectionChange?: (repositories: RepositoryWithWorkflowStatus[]) => void;
}

export function RepositorySelection({ onSelectionChange }: RepositorySelectionProps) {
  const { token, isValidated } = useGitHubToken();
  const {
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
    setSelectedOrganization,
    toggleRepository,
    setSelectedRepositories,
    clearSelection,
    setNameFilter,
    clearFilter
  } = useRepositorySelection();

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(selectedRepositories);
    }
  }, [selectedRepositories, onSelectionChange]);

  // Auto-fetch repositories when token becomes available
  useEffect(() => {
    if (token && isValidated && availableRepositories.length === 0 && !isLoading && !error) {
      console.log('🚀 Auto-triggering repository fetch...');
      fetchRepositories();
    }
  }, [token, isValidated, availableRepositories.length, isLoading, error, fetchRepositories]);

  const handleRepositoryToggle = useCallback((repository: RepositoryWithWorkflowStatus) => {
    const statusInfo = getWorkflowStatusInfo(repository.workflowStatus, repository.workflowCount);
    if (statusInfo.selectable) {
      toggleRepository(repository);
    }
  }, [toggleRepository]);

  const handleSelectAll = () => {
    // Only consider selectable repositories
    const selectableRepos = filteredRepositories.filter(repo => 
      getWorkflowStatusInfo(repo.workflowStatus, repo.workflowCount).selectable
    );
    
    const filteredSelectedCount = selectableRepos.filter(repo => 
      selectedRepositories.some(selected => selected.id === repo.id)
    ).length;
    
    if (filteredSelectedCount === selectableRepos.length && selectableRepos.length > 0) {
      // Deselect all filtered repositories
      const filteredIds = new Set(selectableRepos.map(repo => repo.id));
      const remainingSelected = selectedRepositories.filter(repo => !filteredIds.has(repo.id));
      setSelectedRepositories(remainingSelected);
    } else {
      // Select all selectable filtered repositories that aren't already selected
      const currentIds = new Set(selectedRepositories.map(repo => repo.id));
      const newSelections = selectableRepos.filter(repo => !currentIds.has(repo.id));
      setSelectedRepositories([...selectedRepositories, ...newSelections]);
    }
  };

  const isRepositorySelected = (repository: RepositoryWithWorkflowStatus) => {
    return selectedRepositories.some(selected => selected.id === repository.id);
  };

  // Sort repositories: selectable ones first, then non-selectable ones
  const sortedRepositories = [...filteredRepositories].sort((a, b) => {
    const aSelectable = getWorkflowStatusInfo(a.workflowStatus, a.workflowCount).selectable;
    const bSelectable = getWorkflowStatusInfo(b.workflowStatus, b.workflowCount).selectable;
    
    if (aSelectable && !bSelectable) return -1;
    if (!aSelectable && bSelectable) return 1;
    return 0;
  });

  if (!token || !isValidated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Repository Selection</CardTitle>
          <CardDescription>
            Select repositories to monitor for GitHub Actions workflows
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              Please configure a valid GitHub token first
            </p>
            <p className="text-sm text-muted-foreground">
              Go to Settings to add your GitHub Personal Access Token
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Repository Selection
          <div className="flex items-center gap-2">
            {selectedRepositories.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {selectedRepositories.length} selected
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchRepositories()}
              disabled={isLoading}
            >
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </CardTitle>
        <CardDescription>
          Select repositories from your accessible organizations that have configured workflows
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Organization Selection */}
        <div className="space-y-4 mb-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Organization</label>
            <Select
              value={selectedOrganization || ''}
              onValueChange={(value) => setSelectedOrganization(value)}
              disabled={isLoadingOrganizations || organizations.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an organization...">
                  {selectedOrganization && (
                    <div className="flex items-center gap-2">
                      {organizations.find(org => org.login === selectedOrganization) && (
                        <>
                          <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center text-xs font-medium">
                            {organizations.find(org => org.login === selectedOrganization)?.login.charAt(0).toUpperCase()}
                          </div>
                          <span>{organizations.find(org => org.login === selectedOrganization)?.login}</span>
                          <Badge variant="outline" className="text-xs">
                            {organizations.find(org => org.login === selectedOrganization)?.type}
                          </Badge>
                        </>
                      )}
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.login} value={org.login}>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center text-xs font-medium">
                        {org.login.charAt(0).toUpperCase()}
                      </div>
                      <span>{org.login}</span>
                      <Badge variant="outline" className="text-xs">
                        {org.type}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLoadingOrganizations && (
              <p className="text-xs text-muted-foreground">Loading organizations...</p>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mb-4">
            <div className="flex items-start gap-2">
              <XCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-destructive text-sm font-medium">Failed to load repositories</p>
                <p className="text-destructive/80 text-xs mt-1">{error}</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => fetchRepositories()}
                  className="mt-2"
                >
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        )}

        {isLoading && availableRepositories.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-flex flex-col items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
              <p className="text-foreground font-medium">
                {loadingStatus || 'Loading repositories...'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Fetching accessible repositories
              </p>
            </div>
          </div>
        )}

        {!isLoading && availableRepositories.length === 0 && !error && (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">No repositories found</p>
            <Button variant="outline" onClick={() => fetchRepositories()}>
              Try Again
            </Button>
          </div>
        )}

        {availableRepositories.length > 0 && (
          <div className="space-y-4">
            {/* Search Filter */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Filter repositories by name..."
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  className="pl-10 pr-10"
                />
                {nameFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilter}
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {nameFilter && (
                <p className="text-xs text-muted-foreground mt-1">
                  Showing {filteredRepositories.length} of {availableRepositories.length} repositories
                </p>
              )}
            </div>

            {/* Select All Controls */}
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="select-all"
                  checked={
                    (() => {
                      const selectableRepos = filteredRepositories.filter(repo => 
                        getWorkflowStatusInfo(repo.workflowStatus, repo.workflowCount).selectable
                      );
                      return selectableRepos.length > 0 && 
                        selectableRepos.filter(repo => 
                          selectedRepositories.some(selected => selected.id === repo.id)
                        ).length === selectableRepos.length;
                    })()
                  }
                  onCheckedChange={handleSelectAll}
                />
                <label 
                  htmlFor="select-all" 
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Select All Workflow-Enabled ({(() => {
                    const selectableRepos = filteredRepositories.filter(repo => 
                      getWorkflowStatusInfo(repo.workflowStatus, repo.workflowCount).selectable
                    );
                    return selectableRepos.length;
                  })()} repositories{nameFilter ? ' (filtered)' : ''})
                </label>
              </div>
              {selectedRepositories.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  Clear Selection
                </Button>
              )}
            </div>

            {/* Repository List */}
            {filteredRepositories.length === 0 && nameFilter ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-2">No repositories found matching &ldquo;{nameFilter}&rdquo;</p>
                <p className="text-sm text-muted-foreground mb-4">Try adjusting your search terms</p>
                <Button variant="outline" size="sm" onClick={clearFilter}>
                  Clear Filter
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {sortedRepositories.map((repository) => (
                  <RepositoryRow
                    key={repository.id}
                    repository={repository}
                    selected={isRepositorySelected(repository)}
                    onToggle={() => handleRepositoryToggle(repository)}
                  />
                ))}
              </div>
            )}

            {/* Selection Summary */}
            {selectedRepositories.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-sm text-muted-foreground mb-2">
                  Selected repositories ({selectedRepositories.length}):
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedRepositories.map((repo) => (
                    <Badge key={repo.id} variant="default" className="text-xs">
                      {repo.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RepositorySelection;