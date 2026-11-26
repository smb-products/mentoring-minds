import type { Metadata } from 'next';
import AssignmentsPage from '@/ui/pages/admin/AssignmentsPage';

export const metadata: Metadata = { title: 'Assignments' };

/** /admin/assignments — screen: src/ui/pages/admin/AssignmentsPage.jsx. */
export default function Page() {
  return <AssignmentsPage />;
}
