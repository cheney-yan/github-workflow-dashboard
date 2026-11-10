import { GitHubApiClient, GitHubApiError, isValidGitHubName } from '../src/lib/api/github';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function response(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
) {
  const headers = new Headers(init.headers);
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('GitHubApiClient', () => {
  const token = 'ghp_test_token_value_1234567890';

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('rejects an empty token', () => {
    expect(() => new GitHubApiClient('')).toThrow(GitHubApiError);
  });

  it('sends bearer auth, API version and JSON accept headers', async () => {
    mockFetch.mockResolvedValueOnce(response({ login: 'octocat' }));

    const client = new GitHubApiClient(token);
    await client.validateToken();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.github.com/user');
    expect(init.headers).toMatchObject({
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    });
    expect(init.redirect).toBe('error');
  });

  it('surfaces the GitHub error message and status', async () => {
    mockFetch.mockResolvedValueOnce(
      response({ message: 'Bad credentials' }, { status: 401 })
    );

    const client = new GitHubApiClient(token);
    await expect(client.validateToken()).rejects.toMatchObject({
      name: 'GitHubApiError',
      status: 401,
      message: 'Bad credentials',
    });
  });

  it('explains rate-limit 403 responses', async () => {
    mockFetch.mockResolvedValueOnce(
      response(
        { message: 'API rate limit exceeded' },
        {
          status: 403,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': '1700000000',
          },
        }
      )
    );

    const client = new GitHubApiClient(token);
    await expect(client.validateToken()).rejects.toThrow(/rate limit exceeded/i);
  });

  it('returns scopes and rate limit metadata', async () => {
    mockFetch.mockResolvedValueOnce(
      response(
        { login: 'octocat' },
        {
          headers: {
            'X-OAuth-Scopes': 'repo, read:org',
            'X-RateLimit-Limit': '5000',
            'X-RateLimit-Remaining': '4998',
            'X-RateLimit-Reset': '1700000000',
          },
        }
      )
    );

    const client = new GitHubApiClient(token);
    const details = await client.getTokenDetails();

    expect(details.scopes).toEqual(['repo', 'read:org']);
    expect(details.rateLimit).toMatchObject({ limit: 5000, remaining: 4998 });
  });

  it('retries a 503 once and then succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(response({ message: 'unavailable' }, { status: 503 }))
      .mockResolvedValueOnce(response({ login: 'octocat' }));

    const client = new GitHubApiClient(token);
    await expect(client.validateToken()).resolves.toMatchObject({ login: 'octocat' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects path traversal in owner or repository names', async () => {
    const client = new GitHubApiClient(token);
    await expect(client.getWorkflows('../evil', 'repo')).rejects.toThrow(/invalid github repository/i);
    await expect(client.getWorkflows('owner', 'repo/../../x')).rejects.toThrow(/invalid github repository/i);
  });

  it('encodes owner and repository path segments', async () => {
    mockFetch.mockResolvedValueOnce(response({ workflow_runs: [] }));

    const client = new GitHubApiClient(token);
    await client.getWorkflowRunSnapshot('owner', 'my.repo');

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/owner/my.repo/actions/runs?per_page=50'
    );
  });

  it('caps per_page at 100', async () => {
    mockFetch.mockResolvedValueOnce(response({ workflow_runs: [] }));

    const client = new GitHubApiClient(token);
    await client.getWorkflowRunSnapshot('owner', 'repo', { per_page: 500 });

    expect(mockFetch.mock.calls[0][0]).toContain('per_page=100');
  });

  it('returns a run snapshot with runs and metadata', async () => {
    mockFetch.mockResolvedValueOnce(
      response(
        { workflow_runs: [{ id: 1, workflow_id: 10 }] },
        {
          headers: {
            'X-OAuth-Scopes': 'repo',
            'X-RateLimit-Limit': '5000',
            'X-RateLimit-Remaining': '100',
          },
        }
      )
    );

    const client = new GitHubApiClient(token);
    const snapshot = await client.getWorkflowRunSnapshot('owner', 'repo');

    expect(snapshot.runs).toHaveLength(1);
    expect(snapshot.scopes).toEqual(['repo']);
    expect(snapshot.rateLimit.remaining).toBe(100);
  });

  it('uses the user endpoint for personal repositories and org endpoint otherwise', async () => {
    mockFetch
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([]));

    const client = new GitHubApiClient(token);
    await client.getRepositories('octocat', true, { per_page: 10, page: 2 });
    await client.getRepositories('acme', false, { sort: 'updated' });

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.github.com/users/octocat/repos?per_page=10&page=2'
    );
    expect(mockFetch.mock.calls[1][0]).toBe(
      'https://api.github.com/orgs/acme/repos?sort=updated'
    );
  });

  it('keeps only the latest run per workflow', async () => {
    mockFetch.mockResolvedValueOnce(
      response({
        workflow_runs: [
          { id: 2, workflow_id: 10, created_at: '2026-01-02T00:00:00Z' },
          { id: 1, workflow_id: 10, created_at: '2026-01-01T00:00:00Z' },
          { id: 3, workflow_id: 11, created_at: '2026-01-01T00:00:00Z' },
        ],
      })
    );

    const client = new GitHubApiClient(token);
    const latest = await client.getLatestWorkflowStatuses('owner', 'repo');

    expect(latest[10].id).toBe(2);
    expect(latest[11].id).toBe(3);
  });

  it('fetches jobs for a run and paginates until a short page', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }));
    mockFetch
      .mockResolvedValueOnce(response({ total_count: 101, jobs: firstPage }))
      .mockResolvedValueOnce(response({ total_count: 101, jobs: [{ id: 101 }] }));

    const client = new GitHubApiClient(token);
    const jobs = await client.getWorkflowRunJobs('owner', 'repo', 99);

    expect(jobs).toHaveLength(101);
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/owner/repo/actions/runs/99/jobs?per_page=100&page=1'
    );
    expect(mockFetch.mock.calls[1][0]).toContain('page=2');
  });

  it('rejects an invalid workflow run id', async () => {
    const client = new GitHubApiClient(token);
    await expect(client.getWorkflowRunJobs('owner', 'repo', 0)).rejects.toThrow(/invalid workflow run id/i);
    await expect(client.getWorkflowRunJobs('owner', 'repo', 1.5)).rejects.toThrow(/invalid workflow run id/i);
  });
});

describe('isValidGitHubName', () => {
  it.each(['octocat', 'my.repo', 'repo_name', 'a-b'])('accepts %s', (name) => {
    expect(isValidGitHubName(name)).toBe(true);
  });

  it.each(['', '.', '..', '../x', 'a/b', 'a b', '-leading'])('rejects %s', (name) => {
    expect(isValidGitHubName(name)).toBe(false);
  });
});
