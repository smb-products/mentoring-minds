'use client';

import NextLink from 'next/link';
import { usePathname as useNextPathname, useRouter as useNextRouter } from 'next/navigation';
import { useMemo } from 'react';

/**
 * Same API as the prototype router, backed by Next.js navigation:
 *   usePathname(), useRouter().navigate(path), <Link href>, matchRoute(pattern, path)
 */
export function RouterProvider({ children }) {
  return children;
}

export const usePathname = () => useNextPathname() ?? '/';

export function useRouter() {
  const router = useNextRouter();
  const pathname = usePathname();
  return useMemo(() => ({ pathname, navigate: (path) => router.push(path) }), [router, pathname]);
}

export function Link({ href, ...props }) {
  return <NextLink href={href} {...props} />;
}

/** Match '/admin/families/:parentId' style patterns. Returns params or null. */
export function matchRoute(pattern, pathname) {
  const p = pattern.split('/').filter(Boolean);
  const a = pathname.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i += 1) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}
