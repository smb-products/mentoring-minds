import type { Metadata } from 'next';
import FamiliesPage from '@/ui/pages/admin/FamiliesPage';

export const metadata: Metadata = { title: 'Families' };

/** /admin/families — screen: src/ui/pages/admin/FamiliesPage.jsx (runs on the mock data in src/mock for now). */
export default function Page() {
  return <FamiliesPage />;
}
