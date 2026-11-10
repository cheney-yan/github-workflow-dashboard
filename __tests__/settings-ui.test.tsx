import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '../src/app/settings/page';

const setToken = jest.fn().mockResolvedValue(undefined);
const removeToken = jest.fn().mockResolvedValue(undefined);
const setDashboardName = jest.fn();

const tokenState = {
  token: null as string | null,
  isValidated: false,
  isLoading: false,
  error: null as string | null,
  userId: null as string | null,
  scopes: [] as string[],
  rateLimit: null as { limit: number; remaining: number; reset: number } | null,
  setToken,
  removeToken,
  validateToken: jest.fn().mockResolvedValue(true),
  isSecureStorageSupported: true,
};

jest.mock('@/contexts/github-token-context', () => ({
  useGitHubToken: () => tokenState,
}));

jest.mock('@/contexts/theme-context', () => ({
  useTheme: () => ({ theme: 'light', setTheme: jest.fn(), toggleTheme: jest.fn() }),
}));

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      username: 'admin',
      isAdmin: true,
      mustChangePassword: false,
      hasToken: false,
    },
    loading: false,
    error: null,
    login: jest.fn(),
    logout: jest.fn(),
    changePassword: jest.fn(),
    refresh: jest.fn(),
  }),
}));

jest.mock('@/contexts/display-settings-context', () => {
  const actual = jest.requireActual('@/contexts/display-settings-context');
  return {
    REFRESH_INTERVALS: actual.REFRESH_INTERVALS,
    useDisplaySettings: () => ({
      settings: {
        compactMode: false,
        refreshInterval: 120,
        dashboardName: 'Workflow Monitor',
        alerts: { enabled: false, notifyOnFailure: true, queueMinutes: 30, runMinutes: 90 },
      },
      updateSettings: jest.fn(),
      toggleCompactMode: jest.fn(),
      setRefreshInterval: jest.fn(),
      getRefreshIntervalLabel: () => '2 minutes',
      setDashboardName,
      setAlertPreferences: jest.fn(),
    }),
  };
});

jest.mock('@/components/repository-selection', () => ({
  RepositorySelection: () => <div data-testid="repository-selection" />,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/settings',
}));

function resetTokenState(overrides: Partial<typeof tokenState> = {}) {
  Object.assign(tokenState, {
    token: null,
    isValidated: false,
    isLoading: false,
    error: null,
    userId: null,
    scopes: [],
    rateLimit: null,
    isSecureStorageSupported: true,
    ...overrides,
  });
}

describe('Settings page - token management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetTokenState();
  });

  it('renders the token form and setup guidance', () => {
    render(<SettingsPage />);

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByLabelText(/GitHub Personal Access Token/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Token' })).toBeDisabled();
    expect(screen.getByText(/Fine-grained token with/i)).toBeInTheDocument();
  });

  it('links to the GitHub token page with safe rel attributes', () => {
    render(<SettingsPage />);

    const link = screen.getByRole('link', { name: /Create a token on GitHub/i });
    expect(link).toHaveAttribute('href', 'https://github.com/settings/tokens');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('enables submit only when a token is entered', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    const input = screen.getByLabelText(/GitHub Personal Access Token/);
    const submit = screen.getByRole('button', { name: 'Save Token' });

    await user.type(input, 'ghp_test');
    expect(submit).toBeEnabled();

    await user.click(submit);
    await waitFor(() => expect(setToken).toHaveBeenCalledWith('ghp_test'));
  });

  it('never renders a token prefix for a stored token', () => {
    resetTokenState({ token: 'ghp_abcdefghijklmnop', isValidated: true });
    render(<SettingsPage />);

    expect(screen.queryByDisplayValue(/ghp_/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Stored GitHub token/i)).toHaveValue('••••••••••••••••');
  });

  it('shows reported token scopes and quota', () => {
    resetTokenState({
      token: 'ghp_abcdefghijklmnop',
      isValidated: true,
      scopes: ['repo', 'read:org'],
      rateLimit: { limit: 5000, remaining: 4321, reset: 1700000000 },
    });
    render(<SettingsPage />);

    expect(screen.getAllByText('repo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('read:org').length).toBeGreaterThan(0);
    expect(screen.getByText(/4,321 of 5,000/)).toBeInTheDocument();
  });

  it('warns about excessive token scopes', () => {
    resetTokenState({
      token: 'ghp_abcdefghijklmnop',
      isValidated: true,
      scopes: ['repo', 'delete_repo', 'admin:org'],
    });
    render(<SettingsPage />);

    expect(screen.getByText(/more access than the dashboard needs/i)).toBeInTheDocument();
    expect(screen.getByText(/delete_repo, admin:org/)).toBeInTheDocument();
  });

  it('renders the repository selector only for a validated token', () => {
    render(<SettingsPage />);
    expect(screen.queryByTestId('repository-selection')).not.toBeInTheDocument();

    resetTokenState({ token: 'ghp_abcdefghijklmnop', isValidated: true });
    render(<SettingsPage />);
    expect(screen.getByTestId('repository-selection')).toBeInTheDocument();
  });

  it('explains when encrypted persistence is unavailable', () => {
    resetTokenState({ isSecureStorageSupported: false });
    render(<SettingsPage />);

    expect(screen.getByText(/Secure storage not supported/i)).toBeInTheDocument();
    expect(screen.getByText(/only persist for this session/i)).toBeInTheDocument();
  });

  it('shows the alert rules', () => {
    render(<SettingsPage />);

    expect(screen.getByText('Alerts')).toBeInTheDocument();
    expect(screen.getByLabelText('Enable browser notifications')).toBeInTheDocument();
    expect(screen.getByLabelText('Queue warning (minutes)')).toHaveValue(30);
    expect(screen.getByLabelText('Runtime warning (minutes)')).toHaveValue(90);
  });

  it('shows the security and privacy model', () => {
    render(<SettingsPage />);

    expect(screen.getByText('Security & Privacy')).toBeInTheDocument();
    expect(screen.getByText(/no backend ever receives your token/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /security audit/i })).toHaveAttribute(
      'href',
      expect.stringContaining('SECURITY-AUDIT.md')
    );
  });
});
