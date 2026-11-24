import type { Metadata } from 'next';
import AssignmentsPage from '@/ui/pages/admin/AssignmentsPage';

export const metadata: Metadata = { title: 'Assignments' };

/** /admin/assignments — screen: src/ui/pages/admin/AssignmentsPage.jsx (runs on the mock data in src/mock for now). */
export default function Page() {
  return <AssignmentsPage />;
}
