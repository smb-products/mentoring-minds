import type { Metadata } from 'next';
import TodayPage from '@/ui/pages/admin/TodayPage';

export const metadata: Metadata = { title: 'Today' };

/** /admin/today — screen: src/ui/pages/admin/TodayPage.jsx. */
export default function Page() {
  return <TodayPage />;
}
