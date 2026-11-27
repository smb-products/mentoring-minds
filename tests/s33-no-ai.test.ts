/**
 * S33: no AI for launch (Javaris, 2026-11-27). The AI code, its SDK and its key are gone,
 * the schema keeps only TYPED sources, and one migration only removes. Reads files, no database.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
// Built from parts so this file doesn't name what it looks for.
const SDK = ['@anthropic', 'ai/sdk'].join('-');
const KEY = ['ANTHROPIC', 'API', 'KEY'].join('_');
const SELF = path.join('tests', 's33-no-ai.test.ts');

function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((f) => {
    const rel = path.join(dir, f);
    if (f === 'node_modules' || f.startsWith('.')) return [];
    return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.(m?[jt]sx?|prisma|sql|json)$/.test(f) ? [rel] : [];
  });
}

describe('the AI code is gone', () => {
  it('src/server/ai.ts, src/lib/ai/ and src/ui/components/ai/ are deleted; shrinkPhoto stays for homework photos', () => {
    for (const p of ['src/server/ai.ts', 'src/lib/ai', 'src/ui/components/ai']) expect(existsSync(path.join(ROOT, p)), p).toBe(false);
    expect(read('src/ui/components/learning/AnswerSheet.jsx')).toContain("from '../../lib/shrinkPhoto'");
  });

  it('nothing under src/, prisma/ or tests/ imports the SDK or names the key', () => {
    const hits = ['src', 'prisma', 'tests']
      .flatMap(files)
      .filter((f) => f !== SELF)
      .filter((f) => {
        const text = read(f);
        return text.includes(SDK) || text.includes(KEY) || /from ['"]@\/server\/ai['"]|from ['"]@\/lib\/ai\//.test(text);
      });
    expect(hits).toEqual([]);
  });

  it('package.json doesn’t list the SDK; .env.example has no key', () => {
    const pkg = JSON.parse(read('package.json'));
    for (const k of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) expect(Object.keys(pkg[k] ?? {}), k).not.toContain(SDK);
    expect(read('.env.example')).not.toContain(KEY);
  });

  it('the adapter has no ai area', () => {
    const live = read('src/ui/api/live.js');
    expect(live).not.toMatch(/@\/server\/ai['"]/);
    expect(live).not.toMatch(/^\s*ai:/m);
  });

  it('the screens have no AI controls left', () => {
    const drawer = read('src/ui/components/sessions/AdminSessionDrawer.jsx');
    for (const s of ['Talk about it', 'What you said', 'Write my note', 'Or type it', 'api.ai.', 'aiDraftId', "'VOICE'"]) expect(drawer, s).not.toContain(s);
    const key = read('src/ui/pages/admin/AnswerKeyPage.jsx');
    for (const s of ['Set up from photos', 'api.ai.', 'aiDraftId', "'PHOTO'"]) expect(key, s).not.toContain(s);
  });
});

describe('next.config.ts', () => {
  const config = read('next.config.ts');
  it('denies the microphone and keeps the camera; the comment no longer mentions "Talk about it"', () => {
    const policy = config.match(/'Permissions-Policy', value: '([^']+)'/)?.[1];
    expect(policy).toBeDefined();
    expect(policy).toContain('microphone=()');
    expect(policy).toContain('camera=(self)');
    expect(config).not.toContain('Talk about it');
  });
  it('keeps the 4 MB server action body limit', () => {
    expect(config).toContain("bodySizeLimit: '4mb'");
  });
});

describe('schema and migration', () => {
  const schema = read('prisma/schema.prisma');
  const block = (kind: 'enum' | 'model', name: string) => schema.match(new RegExp(`\\n${kind} ${name} \\{([^}]*)\\}`))?.[1];

  it('AiDraft, DraftKind and DraftStatus are gone; NoteSource and KeySource are TYPED only; no aiDraftId', () => {
    expect(block('model', 'AiDraft')).toBeUndefined();
    expect(block('enum', 'DraftKind')).toBeUndefined();
    expect(block('enum', 'DraftStatus')).toBeUndefined();
    for (const e of ['NoteSource', 'KeySource']) {
      const values = block('enum', e)!.split('\n').map((l) => l.replace(/\/\/.*/, '').trim()).filter(Boolean);
      expect(values, e).toEqual(['TYPED']);
    }
    expect(schema).not.toMatch(/aiDraftId/i);
    // The source columns stay (sessionDTO spreads the note row, and the contract shapes don't change).
    expect(block('model', 'SessionNote')).toMatch(/source\s+NoteSource\s+@default\(TYPED\)/);
    expect(block('model', 'BookItem')).toMatch(/source\s+KeySource\s+@default\(TYPED\)/);
  });

  it('one new migration only removes: drops AiDraft and its enums, recreates the two sources without VOICE and PHOTO', () => {
    const dirs = readdirSync(path.join(ROOT, 'prisma/migrations')).filter((d) => statSync(path.join(ROOT, 'prisma/migrations', d)).isDirectory());
    const mine = dirs.filter((d) => d.endsWith('_remove_ai'));
    expect(mine).toHaveLength(1);
    // In order: right after S23b's, the newest when S33 landed (L2's invite_requests comes after it).
    expect(dirs.sort()[dirs.indexOf(mine[0]) - 1]).toBe('20261126220000_notification_links');
    const sql = read(`prisma/migrations/${mine[0]}/migration.sql`);
    expect(sql).toMatch(/DROP TABLE "AiDraft"/);
    expect(sql).toMatch(/DROP TYPE "DraftKind"/);
    expect(sql).toMatch(/DROP TYPE "DraftStatus"/);
    expect(sql).toMatch(/CREATE TYPE "NoteSource_new" AS ENUM \('TYPED'\)/);
    expect(sql).toMatch(/CREATE TYPE "KeySource_new" AS ENUM \('TYPED'\)/);
    expect(sql).not.toMatch(/CREATE TABLE|ADD COLUMN|ADD CONSTRAINT|CREATE INDEX|ADD VALUE/i);
  });

  it('the demo seed has no AI drafts', () => {
    expect(read('prisma/demo/seed.js')).not.toMatch(/aiDrafts/);
  });
});

describe('docs this ticket may edit', () => {
  it('README.md no longer lists the SDK or lib/ai', () => {
    const readme = read('README.md');
    expect(readme).not.toMatch(/Anthropic SDK/);
    expect(readme).not.toMatch(/jobs, ai\b/);
  });
});
