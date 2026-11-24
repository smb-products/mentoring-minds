import type { Metadata } from 'next';
import MessagesPage from '@/ui/pages/admin/MessagesPage';

export const metadata: Metadata = { title: 'Messages' };

/** /admin/messages/[conversationId] — screen: src/ui/pages/admin/MessagesPage.jsx (runs on the mock data in src/mock for now). */
export default async function Page(props: PageProps<'/admin/messages/[conversationId]'>) {
  return <MessagesPage params={await props.params} />;
}
