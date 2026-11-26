import type { Metadata } from 'next';
import MessagesPage from '@/ui/pages/admin/MessagesPage';

export const metadata: Metadata = { title: 'Messages' };

/** /admin/messages — screen: src/ui/pages/admin/MessagesPage.jsx. */
export default function Page() {
  return <MessagesPage params={{}} />;
}
