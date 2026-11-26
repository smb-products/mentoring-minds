import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as uiApi from '@/ui/api';
import { live } from '@/ui/api/live';
import * as best from '@/ui/api/best';
import * as frozenBest from './mock/best';
import { createSeed } from '../../prisma/demo/seed.js';
import { createSeed as frozenSeed } from './mock/seed';
import { AREAS, liveAreas } from '../e2e/support/live';
import { db, freshDemo } from '../integration/helpers';

/**
 * W8: src/mock is gone. The screens read live directly; the pieces still needed moved:
 * B.E.S.T. data → src/ui/api/best.js, the demo seed → prisma/demo/, and the mock the
 * contract check compares against → tests/contract/mock/ (a frozen copy).
 */
freshDemo();

const ROOT = process.cwd();
const MOCK_DIR = path.join(ROOT, 'src/mock');
const FROZEN = path.join(ROOT, 'tests/contract/mock');

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(name)) out.push(p);
  }
  return out;
}

/** Where an import specifier points, or null for a package. */
function target(file: string, spec: string) {
  if (spec.startsWith('@/')) return path.join(ROOT, 'src', spec.slice(2));
  if (spec.startsWith('.')) return path.resolve(path.dirname(file), spec);
  return null;
}

const IMPORT = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

describe('W8: src/mock is gone', () => {
  it('there is no src/mock folder', () => {
    expect(existsSync(MOCK_DIR)).toBe(false);
  });

  it('nothing in src, prisma or tests imports from src/mock, and only the contract check uses the frozen copy', () => {
    const bad: string[] = [];
    for (const dir of ['src', 'prisma', 'tests']) {
      for (const file of files(path.join(ROOT, dir))) {
        for (const [, spec] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
          const to = target(file, spec);
          if (!to) continue;
          const rel = path.relative(ROOT, file);
          if (to === MOCK_DIR || to.startsWith(MOCK_DIR + path.sep)) bad.push(`${rel} → ${spec}`);
          if ((to === FROZEN || to.startsWith(FROZEN + path.sep)) && !rel.startsWith('tests/contract/')) bad.push(`${rel} → ${spec}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('src/ui/api/index.js exports live and the live hooks directly, with no LIVE set', async () => {
    const src = read('src/ui/api/index.js');
    expect(src).not.toMatch(/\bLIVE\b|new Set/);
    expect(Object.keys(uiApi).sort()).toEqual(['api', 'useAction', 'useQuery']);
    expect(uiApi.api).toBe(live);
    const hooks = await import('@/ui/api/live-hooks');
    expect(uiApi.useQuery).toBe(hooks.useQuery);
    expect(uiApi.useAction).toBe(hooks.useAction);
  });

  it('liveAreas() reports every area', () => {
    expect([...liveAreas()].sort()).toEqual([...AREAS].sort());
    for (const a of AREAS) expect(live[a as keyof typeof live], a).toBeTruthy();
  });

  it('setSessionUser and the mock auth are gone, and AppRoot and the shell no longer call them', () => {
    expect('setSessionUser' in uiApi).toBe(false);
    expect('auth' in uiApi).toBe(false);
    expect(read('src/ui/AppRoot.jsx')).not.toMatch(/setSessionUser/);
    expect(read('src/ui/components/shell/ShellContext.jsx')).not.toMatch(/\bauth\(\)|setSessionUser/);
    for (const file of files(path.join(ROOT, 'src'))) expect(readFileSync(file, 'utf8'), path.relative(ROOT, file)).not.toMatch(/setSessionUser/);
  });

  it('live-hooks.js no longer subscribes to the mock', () => {
    const src = read('src/ui/api/live-hooks.js');
    expect(src).not.toMatch(/mock/i);
    expect(src).not.toMatch(/subscribe/);
  });
});

describe('W8: the pieces still needed moved', () => {
  it('the B.E.S.T. reference data lives in src/ui/api/best.js, unchanged', () => {
    expect(readFileSync(path.join(ROOT, 'src/ui/api/best.js'), 'utf8')).not.toMatch(/export \* from/);
    expect(best.REPORTING_CATEGORIES).toEqual(frozenBest.REPORTING_CATEGORIES);
    expect(best.STRANDS).toEqual(frozenBest.STRANDS);
    expect(best.AREA_LABEL).toEqual(frozenBest.AREA_LABEL);
    expect(best.codesForGrade(4)).toEqual(frozenBest.codesForGrade(4));
    expect(best.codesForGrade(4).length).toBeGreaterThan(0);
  });

  it('the demo seed under prisma/demo/ has the same ids as the mock had', () => {
    const now = createSeed() as Record<string, unknown>;
    const then = frozenSeed() as Record<string, unknown>;
    expect(Object.keys(now).sort()).toEqual(Object.keys(then).sort());
    const ids = (rows: unknown) => (Array.isArray(rows) ? rows.map((r) => (r as { id?: string }).id ?? rows.indexOf(r)) : Object.keys(rows as object));
    for (const k of Object.keys(then)) expect(ids(now[k]), k).toEqual(ids(then[k]));
  });

  it('loadDemo (npm run db:seed:demo and the e2e reset) loads the same families from prisma/demo/', async () => {
    expect(read('prisma/data.ts')).toMatch(/from '\.\/demo\/seed\.js'/);
    const seed = createSeed() as unknown as { users: { id: string }[]; students: { id: string }[] };
    const users = await db.user.findMany({ where: { id: { in: seed.users.map((u) => u.id) } }, select: { id: true } });
    const students = await db.student.findMany({ where: { id: { in: seed.students.map((s) => s.id) } }, select: { id: true } });
    expect(users.map((u) => u.id).sort()).toEqual(seed.users.map((u) => u.id).sort());
    expect(students.map((s) => s.id).sort()).toEqual(seed.students.map((s) => s.id).sort());
    expect(users.map((u) => u.id)).toEqual(expect.arrayContaining(['u_admin', 'u_ana', 'u_grace', 'u_monique']));
  });
});
