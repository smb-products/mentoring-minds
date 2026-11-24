import type { Metadata } from 'next';
import FamilyPage from '@/ui/pages/admin/FamilyPage';

export const metadata: Metadata = { title: 'Family' };

/** /admin/families/[parentId] — screen: src/ui/pages/admin/FamilyPage.jsx (runs on the mock data in src/mock for now). */
export default async function Page(props: PageProps<'/admin/families/[parentId]'>) {
  return <FamilyPage params={await props.params} />;
}
