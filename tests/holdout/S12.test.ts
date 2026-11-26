/** S12 holdout: engines.node decides Vercel’s Node only if nothing else in the repo asks for another one. */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('S12 holdout: one Node version', () => {
  it('no version file or Vercel setting asks for anything but Node 22', () => {
    for (const file of ['.nvmrc', '.node-version']) {
      if (existsSync(file)) expect(readFileSync(file, 'utf8').trim(), file).toMatch(/^v?22(\.|$)/);
    }
    const vercel = readFileSync('vercel.json', 'utf8');
    expect(vercel).not.toMatch(/nodeVersion|"runtime"|nodejs\d/);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.engines.node).toBe('22.x');
    expect(pkg.volta?.node ?? '22').toMatch(/^22/);
    expect(pkg.devDependencies['@types/node']).toMatch(/^\D*22(\.|$)/);
  });
});
