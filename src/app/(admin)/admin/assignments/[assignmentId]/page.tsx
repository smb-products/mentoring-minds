import type { Metadata } from 'next';
import AssignmentPage from '@/ui/pages/admin/AssignmentPage';

export const metadata: Metadata = { title: 'Assignment' };

/** /admin/assignments/[assignmentId] — screen: src/ui/pages/admin/AssignmentPage.jsx. */
export default async function Page(props: PageProps<'/admin/assignments/[assignmentId]'>) {
  return <AssignmentPage params={await props.params} />;
}
