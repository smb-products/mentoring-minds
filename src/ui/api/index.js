/** The screens' data layer: every area runs on the real backend (src/server) through the live adapter. */
export { live as api } from './live';
export { useQuery, useAction } from './live-hooks';
