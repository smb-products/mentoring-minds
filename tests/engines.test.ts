import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vercel builds on the Node major in package.json `engines.node`, so it must be the one CI tests on.
const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
const ciMajors = [...ci.matchAll(/node-version:\s*['"]?(\d+)/g)].map((m) => m[1]);

describe('Node version', () => {
  it('CI tests on one Node major', () => {
    expect(ciMajors.length).toBeGreaterThan(0);
    expect(new Set(ciMajors).size).toBe(1);
  });

  it('engines.node pins that major, 22.x', () => {
    expect(pkg.engines.node).toBe('22.x');
    expect(pkg.engines.node).toBe(`${ciMajors[0]}.x`);
  });
});
