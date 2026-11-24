import { readFileSync } from 'node:fs';
import path from 'node:path';

/** The `api` areas (docs/WIRING.md). */
export const AREAS = ['taxonomy', 'fast', 'families', 'invites', 'messages', 'notifications', 'books', 'content', 'assignments', 'scheduling', 'reports', 'dashboard', 'ai'] as const;
export type Area = (typeof AREAS)[number];

/**
 * Which areas the screens get from the real backend, read from src/ui/api/index.js:
 *   - still `export … from '../../mock'` with no LIVE set → none
 *   - `const LIVE = new Set([...])`                         → those
 *   - no mock import left (ticket W8)                       → all
 */
export function liveAreas(): Set<Area> {
  const src = readFileSync(path.join(process.cwd(), 'src/ui/api/index.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const set = src.match(/new Set\(\s*\[([^\]]*)\]\s*\)/);
  if (set) return new Set([...set[1].matchAll(/['"]([a-z]+)['"]/g)].map((m) => m[1] as Area).filter((a) => AREAS.includes(a)));
  if (/from\s+['"]\.\.\/\.\.\/mock['"]/.test(src)) return new Set();
  return new Set(AREAS);
}

/** True once any area is live: by then sign-in (WIRING.md Step 1) must be wired too. */
export const sessionWired = () => liveAreas().size > 0;

export function missing(areas: Area[]) {
  const live = liveAreas();
  return areas.filter((a) => !live.has(a));
}
