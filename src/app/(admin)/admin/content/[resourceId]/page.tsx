import type { Metadata } from 'next';
import ResourcePage from '@/ui/pages/admin/ResourcePage';

export const metadata: Metadata = { title: 'Resource' };

/** /admin/content/[resourceId] — screen: src/ui/pages/admin/ResourcePage.jsx (runs on the mock data in src/mock for now). */
export default async function Page(props: PageProps<'/admin/content/[resourceId]'>) {
  return <ResourcePage params={await props.params} />;
}
