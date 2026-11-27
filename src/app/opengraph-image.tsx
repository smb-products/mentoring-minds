import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/components/landing/site';

export const alt = 'Mentoring Minds Academy: math tutoring for grades K-6 in Miami-Dade, with F.A.S.T. test prep';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Brand colors from src/app/globals.css (docs/DESIGN.md): navy --mm-brand-900, blue --mm-brand-600, --ink-muted.
const NAVY = '#0b1f5c';
const BLUE = '#2b56dc';
const MUTED = '#c5d8ff';

/** The Open Graph image: text only, white on navy with one blue rule. No photos. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 96px', background: NAVY, color: '#ffffff' }}>
        <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.01em' }}>{SITE_NAME}</div>
        <div style={{ width: 120, height: 6, background: BLUE, margin: '36px 0' }} />
        <div style={{ fontSize: 60, fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.01em', maxWidth: 960 }}>Math tutoring for grades K-6</div>
        <div style={{ fontSize: 34, marginTop: 20, color: MUTED }}>Miami-Dade · F.A.S.T. test prep</div>
      </div>
    ),
    size,
  );
}
