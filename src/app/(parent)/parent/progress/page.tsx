import type { Metadata } from 'next';
import ProgressPage from '@/ui/pages/parent/ProgressPage';

export const metadata: Metadata = { title: 'Progress' };

/** /parent/progress — screen: src/ui/pages/parent/ProgressPage.jsx (runs on the mock data in src/mock for now). */
export default function Page() {
  return <ProgressPage />;
}
