// GitHub API response types
export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  private: boolean;
  html_url: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  default_branch: string;
  archived?: boolean;
  disabled?: boolean;
  has_actions?: boolean;
}

// Type alias for repository selection
export type Repository = GitHubRepository;

export interface GitHubWorkflow {
  id: number;
  name: string;
  path: string;
  state: 'active' | 'deleted' | 'disabled_fork' | 'disabled_inactivity' | 'disabled_manually';
  created_at: string;
  updated_at: string;
  url: string;
  html_url: string;
  badge_url: string;
}

export interface GitHubWorkflowRunActor {
  login: string;
  avatar_url?: string;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  path: string;
  display_title: string;
  run_number: number;
  event: string;
  status: 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | 'stale' | null;
  workflow_id: number;
  url: string;
  html_url: string;
  jobs_url?: string;
  logs_url?: string;
  check_suite_url?: string;
  created_at: string;
  /** When GitHub actually started the job; absent for runs that never started. */
  run_started_at?: string;
  updated_at: string;
  actor: GitHubWorkflowRunActor;
  triggering_actor?: GitHubWorkflowRunActor;
  run_attempt: number;
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
  };
  head_commit: {
    id: string;
    message: string;
    timestamp: string;
    author: {
      name: string;
      email: string;
    };
  } | null;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  email: string | null;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
}

export interface GitHubRateLimit {
  limit: number;
  remaining: number;
  reset: number;
  used?: number;
}

export interface GitHubApiResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
  rateLimit?: GitHubRateLimit;
  scopes: string[];
}

export interface GitHubWorkflowRunSnapshot {
  runs: GitHubWorkflowRun[];
  totalCount: number;
  rateLimit: GitHubRateLimit;
  scopes: string[];
}

export interface GitHubWorkflowStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface GitHubWorkflowJob {
  id: number;
  run_id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  runner_id?: number | null;
  runner_name?: string | null;
  runner_group_id?: number | null;
  runner_group_name?: string | null;
  labels: string[];
  html_url: string;
  steps?: GitHubWorkflowStep[];
}

export interface GitHubTokenDetails {
  user: GitHubUser;
  scopes: string[];
  rateLimit: GitHubRateLimit;
}

export interface GitHubApiErrorBody {
  message: string;
  documentation_url?: string;
  status: number;
}
