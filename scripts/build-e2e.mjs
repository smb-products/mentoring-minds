// A production build for the browser tests. Same as `next build`.
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
process.exit(r.status ?? 1);
