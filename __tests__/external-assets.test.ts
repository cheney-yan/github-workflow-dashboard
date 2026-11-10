import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', 'src');
const FILE_PATTERN = /\.(ts|tsx|css)$/;

const FORBIDDEN = [
  /\bcdn\./i,
  /unpkg\.com/i,
  /cdn\.jsdelivr\.net/i,
  /fonts\.googleapis\.com/i,
  /fonts\.gstatic\.com/i,
  /<script[^>]+src=/i,
  /<link[^>]+rel=["']stylesheet/i,
  /@import\s+url\(["']?https?:/i,
];

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) return walk(fullPath);
    return FILE_PATTERN.test(entry) ? [fullPath] : [];
  });
}

describe('external assets', () => {
  it('does not reference CDN scripts, styles or fonts', () => {
    const offenders = walk(ROOT).flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      return FORBIDDEN.filter((pattern) => pattern.test(content)).map(
        (pattern) => `${file}: ${pattern}`
      );
    });

    expect(offenders).toEqual([]);
  });
});
