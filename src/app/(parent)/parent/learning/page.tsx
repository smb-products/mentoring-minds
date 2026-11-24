import type { Metadata } from 'next';
import LearningPage from '@/ui/pages/parent/LearningPage';

export const metadata: Metadata = { title: 'Learning' };

/** /parent/learning — screen: src/ui/pages/parent/LearningPage.jsx (runs on the mock data in src/mock for now). */
export default function Page() {
  return <LearningPage />;
}
