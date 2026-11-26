import type { Metadata } from 'next';
import SettingsPage from '@/ui/pages/admin/SettingsPage';

export const metadata: Metadata = { title: 'Settings' };

/** /admin/settings — screen: src/ui/pages/admin/SettingsPage.jsx. */
export default function Page() {
  return <SettingsPage />;
}
