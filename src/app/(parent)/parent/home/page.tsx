import type { Metadata } from 'next';
import HomePage from '@/ui/pages/parent/HomePage';

export const metadata: Metadata = { title: 'Home' };

/** /parent/home — screen: src/ui/pages/parent/HomePage.jsx (runs on the mock data in src/mock for now). */
export default function Page() {
  return <HomePage />;
}
