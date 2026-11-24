import type { Metadata } from 'next';
import ContentPage from '@/ui/pages/admin/ContentPage';

export const metadata: Metadata = { title: 'Content' };

/** /admin/content — screen: src/ui/pages/admin/ContentPage.jsx (runs on the mock data in src/mock for now). */
export default function Page() {
  return <ContentPage />;
}
