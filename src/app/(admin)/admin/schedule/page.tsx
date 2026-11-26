import type { Metadata } from 'next';
import SchedulePage from '@/ui/pages/admin/SchedulePage';

export const metadata: Metadata = { title: 'Schedule' };

/** /admin/schedule — screen: src/ui/pages/admin/SchedulePage.jsx. */
export default function Page() {
  return <SchedulePage />;
}
