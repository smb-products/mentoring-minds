/**
 * The UI's data layer. Every screen imports `api`, `useQuery` and `useAction` from here.
 *
 * SCAFFOLD: points at the prototype's in-browser mock (src/mock), so every screen runs
 * with demo data and no database.
 *
 * GOING LIVE: replace this file with an adapter that calls the server functions in
 * src/server/*.ts (same namespaces, names and inputs — see docs/CONTRACT.md):
 *   import * as families from '@/server/families'; …
 *   export const api = { families, … };
 * and a useQuery/useAction pair that re-runs queries after a successful write
 * (or move reads into server components). Nothing else in src/ui changes.
 */
export { api, useQuery, useAction, auth, setSessionUser } from '../../mock';
