import type { Metadata } from 'next';
import NewAssignmentPage from '@/ui/pages/admin/NewAssignmentPage';

export const metadata: Metadata = { title: 'New assignment' };

/** /admin/assignments/new — screen: src/ui/pages/admin/NewAssignmentPage.jsx. */
export default function Page() {
  return <NewAssignmentPage />;
}
