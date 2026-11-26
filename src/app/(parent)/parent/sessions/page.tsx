import type { Metadata } from 'next';
import SessionsPage from '@/ui/pages/parent/SessionsPage';

export const metadata: Metadata = { title: 'Sessions' };

/** /parent/sessions — screen: src/ui/pages/parent/SessionsPage.jsx. */
export default function Page() {
  return <SessionsPage />;
}
