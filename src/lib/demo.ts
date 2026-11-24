/**
 * SCAFFOLD SWITCH. While DEMO_MODE isn't "false", the app runs on the in-browser
 * mock data (src/mock): no sign-in, no database. /admin is Vienne; /parent is the
 * parent picked in the account menu.
 *
 * Going live: set DEMO_MODE=false once src/ui/api points at src/server and the
 * database is set up (docs/PORTING.md → "Going live").
 */
export const DEMO_MODE = process.env.DEMO_MODE !== 'false';
