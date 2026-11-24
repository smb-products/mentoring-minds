import path from 'node:path';
import { defineConfig } from 'prisma/config';

// With a prisma.config.ts, Prisma stops loading .env itself, so load it here.
try {
  process.loadEnvFile();
} catch {
  /* no .env file: use the environment as is (CI, Netlify) */
}

/** Prisma CLI config: schema, migrations and seed. The app's runtime client is in src/lib/db.ts. */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: { path: path.join('prisma', 'migrations'), seed: 'tsx prisma/seed.ts' },
});
