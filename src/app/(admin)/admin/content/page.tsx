import type { Metadata } from 'next';
import ContentPage from '@/ui/pages/admin/ContentPage';

export const metadata: Metadata = { title: 'Content' };

/** /admin/content — screen: src/ui/pages/admin/ContentPage.jsx. */
export default function Page() {
  return <ContentPage />;
}
