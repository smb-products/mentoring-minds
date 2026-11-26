/**
 * SCAFFOLD SWITCH. Only when DEMO_MODE is exactly "true" does the app skip sign-in
 * (dev only, on the demo data from `npm run db:seed:demo`): /admin is Vienne; /parent is the parent
 * picked in the account menu. Anything else, including unset, means real sign-in,
 * so a production deploy that forgets the variable is never left open.
 *
 * Going live: remove DEMO_MODE=true once src/ui/api points at src/server
 * (docs/WIRING.md → Step 1).
 */
export const DEMO_MODE = process.env.DEMO_MODE === 'true';
