import type { Metadata } from 'next';
import HomePage from '@/ui/pages/parent/HomePage';

export const metadata: Metadata = { title: 'Home' };

/** /parent/home — screen: src/ui/pages/parent/HomePage.jsx. */
export default function Page() {
  return <HomePage />;
}
