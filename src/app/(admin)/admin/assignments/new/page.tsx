import type { Metadata } from 'next';
import NewAssignmentPage from '@/ui/pages/admin/NewAssignmentPage';

export const metadata: Metadata = { title: 'New assignment' };

/** /admin/assignments/new — screen: src/ui/pages/admin/NewAssignmentPage.jsx (runs on the mock data in src/mock for now). */
export default function Page() {
  return <NewAssignmentPage />;
}
