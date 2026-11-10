import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let dataDir: string;

beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'gwm-auth-'));
  process.env.DATA_DIR = dataDir;
});

afterAll(() => {
  delete process.env.DATA_DIR;
  rmSync(dataDir, { recursive: true, force: true });
});

describe('auth store', () => {
  it('seeds an admin that must change the bootstrap password', async () => {
    const store = await import('../src/lib/auth/store');
    const admin = await store.findUserByUsername('admin');

    expect(admin).not.toBeNull();
    expect(admin?.isAdmin).toBe(true);
    expect(admin?.mustChangePassword).toBe(true);
    await expect(store.verifyPassword('changeme', admin!.passwordHash)).resolves.toBe(true);
  });

  it('changes the password and clears the first-login flag', async () => {
    const store = await import('../src/lib/auth/store');
    const admin = await store.findUserByUsername('admin');
    await store.changePassword(admin!.id, 'NewPassword123');
    const updated = await store.findUserById(admin!.id);

    expect(updated?.mustChangePassword).toBe(false);
    await expect(store.verifyPassword('NewPassword123', updated!.passwordHash)).resolves.toBe(true);
    await expect(store.verifyPassword('changeme', updated!.passwordHash)).resolves.toBe(false);
  });

  it('encrypts the per-user GitHub token at rest', async () => {
    const store = await import('../src/lib/auth/store');
    const admin = await store.findUserByUsername('admin');
    const token = 'ghp_dummy_token_value_1234567890abcdef';

    await store.setUserToken(admin!.id, token);
    const reloaded = await store.findUserById(admin!.id);
    const file = readFileSync(join(dataDir, 'users.json'), 'utf8');

    expect(file).not.toContain(token);
    await expect(store.getUserToken(reloaded!)).resolves.toBe(token);
  });

  it('rejects duplicate usernames', async () => {
    const store = await import('../src/lib/auth/store');
    await store.createUser('operator', 'OperatorPass123');
    await expect(store.createUser('OPERATOR', 'AnotherPass123')).rejects.toThrow(/already exists/i);
  });
});
