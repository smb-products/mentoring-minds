// A production build for the browser tests: sign-in on (DEMO_MODE=false). Same as `next build` otherwise.
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, DEMO_MODE: 'false' } });
process.exit(r.status ?? 1);
