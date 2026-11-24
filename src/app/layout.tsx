import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/nunito-sans';
import '@fontsource-variable/fredoka';
import './globals.css';
import { RegisterServiceWorker } from '@/components/pwa/RegisterServiceWorker';

export const metadata: Metadata = {
  title: { default: 'Mentoring Minds', template: '%s · Mentoring Minds' },
  description: 'Math tutoring with Vienne Elliott.',
  applicationName: 'Mentoring Minds',
  appleWebApp: { capable: true, title: 'Mentoring Minds', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0b1f5c' },
    { media: '(prefers-color-scheme: dark)', color: '#07143c' },
  ],
};

/**
 * Root layout. Text size (Settings → Text size) is applied by the app shell as
 * data-text on #mm-root (zoom), from the signed-in user's textSize.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
