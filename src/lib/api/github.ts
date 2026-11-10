import type {
  GitHubRepository,
  GitHubWorkflow,
  GitHubWorkflowRun,
  GitHubUser,
  GitHubApiResponse,
  GitHubRateLimit,
  GitHubWorkflowRunSnapshot,
  GitHubTokenDetails,
  GitHubWorkflowJob,
} from './types';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: Response
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

/** GitHub owner/repo names only allow a small, path-safe character set. */
export function isValidGitHubName(name: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/.test(name) && name !== '.' && name !== '..';
}

function repoPath(owner: string, repo: string): string {
  if (!isValidGitHubName(owner) || !isValidGitHubName(repo)) {
    throw new GitHubApiError('Invalid GitHub repository identifier', 400);
  }
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function parseRateLimit(headers: Headers): GitHubRateLimit {
  const limit = Number.parseInt(headers.get('X-RateLimit-Limit') ?? '0', 10);
  const remaining = Number.parseInt(headers.get('X-RateLimit-Remaining') ?? '0', 10);
  const reset = Number.parseInt(headers.get('X-RateLimit-Reset') ?? '0', 10);
  const used = Number.parseInt(headers.get('X-RateLimit-Used') ?? '0', 10);
  return { limit, remaining, reset, used };
}

function parseScopes(headers: Headers): string[] {
  return (headers.get('X-OAuth-Scopes') ?? '')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof GitHubApiError) {
    return [502, 503, 504].includes(error.status);
  }
  return error instanceof TypeError || error instanceof DOMException;
}

export class GitHubApiClient {
  private baseUrl = 'https://api.github.com';
  private token: string;

  constructor(token: string) {
    if (!token || typeof token !== 'string') {
      throw new GitHubApiError('A GitHub token is required', 401);
    }
    this.token = token.trim();
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<GitHubApiResponse<T>> {
    if (!endpoint.startsWith('/')) {
      throw new GitHubApiError('Invalid API endpoint', 400);
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          ...options,
          signal: options.signal ?? controller.signal,
          // Never follow a redirect with the Authorization header to another host.
          redirect: 'error',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${this.token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...options.headers,
          },
        });

        if (!response.ok) {
          let errorMessage = `GitHub API Error: ${response.status}`;
          try {
            const errorData = await response.json();
            errorMessage = errorData?.message || errorMessage;
          } catch {
            // Keep the status-based message when the body is not JSON.
          }

          if (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') {
            const reset = response.headers.get('X-RateLimit-Reset');
            const resetDate = reset
              ? new Date(Number.parseInt(reset, 10) * 1000).toLocaleTimeString()
              : 'soon';
            errorMessage = `GitHub rate limit exceeded. Resets at ${resetDate}.`;
          }

          const error = new GitHubApiError(errorMessage, response.status, response);
          if (isRetryable(error) && attempt < MAX_RETRIES) {
            lastError = error;
            continue;
          }
          throw error;
        }

        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        const data = response.status === 204
          ? (undefined as T)
          : ((await response.json()) as T);

        return {
          data,
          status: response.status,
          headers,
          rateLimit: parseRateLimit(response.headers),
          scopes: parseScopes(response.headers),
        };
      } catch (error) {
        lastError = error;
        const retryable = isRetryable(error) || (error instanceof Error && error.name === 'AbortError');
        if (!retryable || attempt >= MAX_RETRIES) break;
      } finally {
        clearTimeout(timeout);
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new GitHubApiError('GitHub API request failed', 0);
  }

  /** Authenticated user plus token scopes and rate-limit metadata. */
  async getTokenDetails(): Promise<GitHubTokenDetails> {
    const response = await this.makeRequest<GitHubUser>('/user');
    return {
      user: response.data,
      scopes: response.scopes,
      rateLimit: response.rateLimit ?? { limit: 0, remaining: 0, reset: 0 },
    };
  }

  // Validate token by making a test API call
  async validateToken(): Promise<GitHubUser> {
    const response = await this.makeRequest<GitHubUser>('/user');
    return response.data;
  }

  // Get organizations for the authenticated user
  async getUserOrganizations(): Promise<{ login: string; id: number; avatar_url: string }[]> {
    const response = await this.makeRequest<{ login: string; id: number; avatar_url: string }[]>(
      '/user/orgs'
    );
    return response.data;
  }

  // Get repositories for the authenticated user or organization
  async getRepositories(
    owner: string,
    isUser: boolean,
    options: {
      type?: 'all' | 'owner' | 'member';
      sort?: 'created' | 'updated' | 'pushed' | 'full_name';
      direction?: 'asc' | 'desc';
      per_page?: number;
      page?: number;
    } = {}
  ): Promise<GitHubRepository[]> {
    if (!isValidGitHubName(owner)) {
      throw new GitHubApiError('Invalid GitHub owner', 400);
    }

    const searchParams = new URLSearchParams();
    if (options.type) searchParams.append('type', options.type);
    if (options.sort) searchParams.append('sort', options.sort);
    if (options.direction) searchParams.append('direction', options.direction);
    if (options.per_page) searchParams.append('per_page', String(options.per_page));
    if (options.page) searchParams.append('page', String(options.page));

    const endpoint = isUser
      ? `/users/${encodeURIComponent(owner)}/repos?${searchParams.toString()}`
      : `/orgs/${encodeURIComponent(owner)}/repos?${searchParams.toString()}`;

    const response = await this.makeRequest<GitHubRepository[]>(endpoint);
    return response.data;
  }

  // Get workflows for a specific repository
  async getWorkflows(owner: string, repo: string): Promise<GitHubWorkflow[]> {
    const response = await this.makeRequest<{ workflows: GitHubWorkflow[] }>(
      `${repoPath(owner, repo)}/actions/workflows`
    );
    return response.data.workflows;
  }

  // Get workflow runs for a specific repository
  async getWorkflowRuns(
    owner: string,
    repo: string,
    options: {
      actor?: string;
      branch?: string;
      event?: string;
      status?: 'completed' | 'action_required' | 'cancelled' | 'failure' | 'neutral' | 'skipped' | 'stale' | 'success' | 'timed_out' | 'in_progress' | 'queued' | 'requested' | 'waiting';
      per_page?: number;
      page?: number;
    } = {}
  ): Promise<GitHubWorkflowRun[]> {
    const snapshot = await this.getWorkflowRunSnapshot(owner, repo, options);
    return snapshot.runs;
  }

  /**
   * Fetch recent runs and the response metadata (rate limit, token scopes) in
   * one request. The run history feeds runtime and queue-time statistics.
   */
  async getWorkflowRunSnapshot(
    owner: string,
    repo: string,
    options: {
      actor?: string;
      branch?: string;
      event?: string;
      status?: string;
      per_page?: number;
      page?: number;
    } = {}
  ): Promise<GitHubWorkflowRunSnapshot> {
    const searchParams = new URLSearchParams();
    if (options.actor) searchParams.append('actor', options.actor);
    if (options.branch) searchParams.append('branch', options.branch);
    if (options.event) searchParams.append('event', options.event);
    if (options.status) searchParams.append('status', options.status);
    searchParams.append('per_page', String(Math.min(options.per_page ?? 50, 100)));
    if (options.page) searchParams.append('page', String(options.page));

    const response = await this.makeRequest<{ total_count?: number; workflow_runs: GitHubWorkflowRun[] }>(
      `${repoPath(owner, repo)}/actions/runs?${searchParams.toString()}`
    );

    const runs = response.data.workflow_runs ?? [];
    return {
      runs,
      totalCount: response.data.total_count ?? runs.length,
      rateLimit: response.rateLimit ?? { limit: 0, remaining: 0, reset: 0 },
      scopes: response.scopes,
    };
  }

  /**
   * Jobs for one workflow run, including per-step status and the runner.
   * Used by the per-run breakdown and runner utilization.
   */
  async getWorkflowRunJobs(
    owner: string,
    repo: string,
    runId: number
  ): Promise<GitHubWorkflowJob[]> {
    if (!Number.isSafeInteger(runId) || runId <= 0) {
      throw new GitHubApiError('Invalid workflow run id', 400);
    }

    const jobs: GitHubWorkflowJob[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const response = await this.makeRequest<{ total_count?: number; jobs: GitHubWorkflowJob[] }>(
        `${repoPath(owner, repo)}/actions/runs/${runId}/jobs?per_page=100&page=${page}`
      );
      const pageJobs = response.data.jobs ?? [];
      jobs.push(...pageJobs);
      if (pageJobs.length < 100) break;
    }
    return jobs;
  }

  // Get latest workflow run for each workflow in a repository (legacy, N+1 calls)
  async getLatestWorkflowRuns(owner: string, repo: string): Promise<GitHubWorkflowRun[]> {
    const workflows = await this.getWorkflows(owner, repo);
    const latestRuns: GitHubWorkflowRun[] = [];

    for (let index = 0; index < workflows.length; index += 1) {
      try {
        const runs = await this.getWorkflowRuns(owner, repo, { per_page: 1 });
        if (runs.length > 0) latestRuns.push(runs[0]);
      } catch {
        // Continue if a single workflow cannot be read (permissions, deleted).
      }
    }

    return latestRuns;
  }

  // Get latest workflow runs with a single API call (up to 100 most recent runs)
  async getLatestWorkflowRunsOptimized(
    owner: string,
    repo: string,
    options: { per_page?: number; branch?: string } = {}
  ): Promise<GitHubWorkflowRun[]> {
    const { per_page = 20, branch } = options;
    return this.getWorkflowRuns(owner, repo, {
      per_page: Math.min(per_page, 100),
      branch,
    });
  }

  // Latest run for each unique workflow from a single API call
  async getLatestWorkflowStatuses(
    owner: string,
    repo: string,
    options: { per_page?: number; branch?: string } = {}
  ): Promise<{ [workflowId: number]: GitHubWorkflowRun }> {
    const { runs } = await this.getWorkflowRunSnapshot(owner, repo, {
      per_page: options.per_page ?? 50,
      branch: options.branch,
    });

    const latestByWorkflow: { [workflowId: number]: GitHubWorkflowRun } = {};
    for (const run of runs) {
      const current = latestByWorkflow[run.workflow_id];
      if (!current || new Date(run.created_at) > new Date(current.created_at)) {
        latestByWorkflow[run.workflow_id] = run;
      }
    }

    return latestByWorkflow;
  }

  // Check if repository has any recent workflow activity (single API call)
  async hasRecentWorkflowActivity(
    owner: string,
    repo: string,
    options: { daysBack?: number } = {}
  ): Promise<{ hasActivity: boolean; latestRun?: GitHubWorkflowRun; totalRuns: number }> {
    const { daysBack = 30 } = options;

    try {
      const snapshot = await this.getWorkflowRunSnapshot(owner, repo, { per_page: 1 });
      if (snapshot.runs.length === 0) return { hasActivity: false, totalRuns: 0 };

      const latestRun = snapshot.runs[0];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);
      const hasActivity = new Date(latestRun.created_at) >= cutoffDate;

      return {
        hasActivity,
        latestRun: hasActivity ? latestRun : undefined,
        totalRuns: snapshot.totalCount,
      };
    } catch {
      try {
        const workflows = await this.getWorkflows(owner, repo);
        return { hasActivity: workflows.length > 0, totalRuns: 0 };
      } catch {
        return { hasActivity: false, totalRuns: 0 };
      }
    }
  }

  // Get rate limit status
  async getRateLimit(): Promise<{ rate: GitHubRateLimit }> {
    const response = await this.makeRequest<{ rate: GitHubRateLimit }>('/rate_limit');
    return response.data;
  }
}
