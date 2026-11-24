import type { Metadata } from 'next';
import MessagesPage from '@/ui/pages/parent/MessagesPage';

export const metadata: Metadata = { title: 'Messages' };

/** /parent/messages — screen: src/ui/pages/parent/MessagesPage.jsx (runs on the mock data in src/mock for now). */
export default function Page() {
  return <MessagesPage />;
}
