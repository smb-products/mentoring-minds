import type { Metadata } from 'next';
import AnswerKeyPage from '@/ui/pages/admin/AnswerKeyPage';

export const metadata: Metadata = { title: 'Answer key' };

/** /admin/content/book/[bookId]/[test] — screen: src/ui/pages/admin/AnswerKeyPage.jsx (runs on the mock data in src/mock for now). */
export default async function Page(props: PageProps<'/admin/content/book/[bookId]/[test]'>) {
  return <AnswerKeyPage params={await props.params} />;
}
