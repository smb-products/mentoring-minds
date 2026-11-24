import type { Metadata } from 'next';
import ReportPage from '@/ui/pages/admin/ReportPage';

export const metadata: Metadata = { title: 'Progress report' };

/** /admin/reports/[reportId] — screen: src/ui/pages/admin/ReportPage.jsx (runs on the mock data in src/mock for now). */
export default async function Page(props: PageProps<'/admin/reports/[reportId]'>) {
  return <ReportPage params={await props.params} />;
}
