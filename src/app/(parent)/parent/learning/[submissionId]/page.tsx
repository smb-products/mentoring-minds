import type { Metadata } from 'next';
import AssignmentItemPage from '@/ui/pages/parent/AssignmentItemPage';

export const metadata: Metadata = { title: 'Homework' };

/** /parent/learning/[submissionId] — screen: src/ui/pages/parent/AssignmentItemPage.jsx (runs on the mock data in src/mock for now). */
export default async function Page(props: PageProps<'/parent/learning/[submissionId]'>) {
  return <AssignmentItemPage params={await props.params} />;
}
