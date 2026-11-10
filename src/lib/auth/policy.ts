export function validatePassword(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters.';
  if (password.length > 200) return 'Password is too long.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

export function validateUsername(username: string): string | null {
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
    return 'Username must be 3-32 characters using letters, numbers, dot, dash or underscore.';
  }
  return null;
}
