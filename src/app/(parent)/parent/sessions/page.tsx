import type { Metadata } from 'next';
import SessionsPage from '@/ui/pages/parent/SessionsPage';

export const metadata: Metadata = { title: 'Sessions' };

/** /parent/sessions — screen: src/ui/pages/parent/SessionsPage.jsx (runs on the mock data in src/mock for now). */
export default function Page() {
  return <SessionsPage />;
}
