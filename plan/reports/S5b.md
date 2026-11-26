status: done
checks: 1 ✓ 2 ✓ 3 ✓ 4 ✓
tests: tests/integration/s5b-redeem.test.ts (new), tests/integration/jobs-ai.test.ts (one line), tests/integration/s5-redeem.test.ts, tests/e2e auth w0 w1 w2 + holdouts W0–W2, npm run test:contract
notes: redeemInvite re-reads redeemFailures/redeemLockedUntil under pg_advisory_xact_lock(7300530001). A right code takes the same lock and re-checks the global count (and the account lock) before it's claimed. cleanUp returns redeemFailures. jobs-ai.test.ts (outside touches) needed `redeemFailures: 0` added to its exact toEqual on cleanUp's result.
