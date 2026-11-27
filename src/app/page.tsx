import type { Metadata } from 'next';
import { Landing } from '@/components/landing/Landing';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from '@/components/landing/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: { title: SITE_TITLE, description: SITE_DESCRIPTION, url: '/', siteName: SITE_NAME, type: 'website' },
};

/**
 * The landing page for signed-out visitors. The proxy (src/proxy.ts) sends a signed-in
 * Vienne or parent home before this renders, so the page stays static.
 */
export default function Root() {
  return <Landing />;
}
