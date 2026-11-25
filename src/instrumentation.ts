/**
 * Runs once when the server starts. In production it refuses to start with a missing
 * or unsafe setting, so a bad deploy fails at once with a clear message in the logs
 * (Vercel → Deployments → the deploy → Logs), not later with a confusing sign-in error.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') return;
  const { productionProblems } = await import('./lib/env-check');
  const problems = productionProblems(process.env);
  if (problems.length) {
    throw new Error(`Mentoring Minds can't start:\n${problems.map((p) => `  - ${p}`).join('\n')}\nSee docs/DEPLOY.md → Environment variables.`);
  }
}
