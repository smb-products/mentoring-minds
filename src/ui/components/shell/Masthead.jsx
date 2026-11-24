import { createContext, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Link } from '../../lib/router';

/**
 * The navy masthead at the top of every page. Pages render <PageHeader>; its content
 * is portalled into the band the shell draws full-width above the page body.
 * `overlap` pulls the first row of page content up over the band.
 */
export const MastheadContext = createContext({ target: null, setOverlap: () => {} });

/** Where drawers, sheets and the quiz render: covers the work surface (desktop) or the screen (phone). */
export const OverlayContext = createContext(null);

export function PageHeader({ title, subtitle, actions, back, overlap = false, tabs, children }) {
  const { target, setOverlap } = useContext(MastheadContext);
  useEffect(() => {
    setOverlap(overlap);
    return () => {
      setOverlap(false);
    };
  }, [overlap, setOverlap]);
  if (!target) return null;

  return createPortal(
    <header className="pt-5 @3xl/page:pt-8">
      {back && (
        <Link href={back.href} className="-ml-1.5 mb-1.5 inline-flex min-h-10 items-center gap-1 rounded-md px-1.5 text-[13.5px] font-bold text-ink-muted hover:text-ink-foreground @3xl/page:mb-2 @3xl/page:min-h-8">
          <ChevronLeft size={16} strokeWidth={2.4} aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink-foreground @3xl/page:text-[32px]">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-[15px] text-ink-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
      {tabs && (
        <div role="tablist" aria-label={tabs.label} className="scrollbar-none -mb-6 mt-6 flex gap-1 overflow-x-auto @3xl/page:-mb-8">
          {tabs.items.map((tab) => {
            const selected = tab.value === tabs.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => tabs.onChange(tab.value)}
                className={cn(
                  'flex h-11 shrink-0 items-center gap-2 rounded-t-xl px-4 text-[14.5px] font-bold transition-colors',
                  selected ? 'bg-background text-foreground' : 'text-ink-muted hover:bg-ink-foreground/10 hover:text-ink-foreground',
                )}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn('tabular rounded-md px-1.5 text-[12px] font-extrabold', selected ? 'bg-primary text-primary-foreground' : 'bg-reward text-reward-foreground')}>{tab.count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>,
    target,
  );
}

/** Brain line art with a few linked "minds": drawn once as a faint watermark in the band. */
const BRAIN_PATHS = ["M194.0 24.0 L181.4 26.3 L174.8 28.5 L169.4 30.8 L164.7 33.0 L160.5 35.3 L156.7 37.5 L153.1 39.8 L149.8 42.1 L146.6 44.3 L143.5 46.6 L140.5 48.8 L137.6 51.1 L134.8 53.3 L132.2 55.6 L129.8 57.9 L127.6 60.1 L125.6 62.4 L123.9 64.6 L122.3 66.9 L120.8 69.1 L119.4 71.4 L117.8 73.7 L116.0 75.9 L114.1 78.2 L111.9 80.4 L109.4 82.7 L106.8 84.9 L104.1 87.2 L101.4 89.5 L98.9 91.7 L96.5 94.0 L94.3 96.2 L92.3 98.5 L90.6 100.7 L89.0 103.0 L87.5 105.3 L86.1 107.5 L84.6 109.8 L83.0 112.0 L81.4 114.3 L79.8 116.5 L78.3 118.8 L77.0 121.1 L75.9 123.3 L75.1 125.6 L74.7 127.8 L74.6 130.1 L74.7 132.3 L75.0 134.6 L75.3 136.9 L75.5 139.1 L75.5 141.4 L75.0 143.6 L74.3 145.9 L73.1 148.1 L71.6 150.4 L70.0 152.7 L68.2 154.9 L66.6 157.2 L65.0 159.4 L63.8 161.7 L62.7 163.9 L62.0 166.2 L61.3 168.5 L60.8 170.7 L60.3 173.0 L59.8 175.2 L59.1 177.5 L58.4 179.7 L57.6 182.0 L56.9 184.3 L56.4 186.5 L56.1 188.8 L56.2 191.0 L56.7 193.3 L57.7 195.5 L59.0 197.8 L60.6 200.1 L62.3 202.3 L63.9 204.6 L65.4 206.8 L66.5 209.1 L67.3 211.3 L67.7 213.6 L67.8 215.9 L67.6 218.1 L67.3 220.4 L67.0 222.6 L66.7 224.9 L66.7 227.1 L66.9 229.4 L67.3 231.7 L67.9 233.9 L68.5 236.2 L69.2 238.4 L69.8 240.7 L70.3 242.9 L70.7 245.2 L71.0 247.5 L71.4 249.7 L71.9 252.0 L72.6 254.2 L73.6 256.5 L75.1 258.7 L77.0 261.0 L79.2 263.3 L81.8 265.5 L84.5 267.8 L87.3 270.0 L90.0 272.3 L92.6 274.5 L95.0 276.8 L97.0 279.1 L98.9 281.3 L100.6 283.6 L102.1 285.8 L103.7 288.1 L105.4 290.3 L107.2 292.6 L109.1 294.9 L111.3 297.1 L113.6 299.4 L116.0 301.6 L118.4 303.9 L120.9 306.1 L123.4 308.4 L125.9 310.7 L128.5 312.9 L131.2 315.2 L134.0 317.4 L137.2 319.7 L140.7 321.9 L144.6 324.2 L148.9 326.5 L153.6 328.7 L158.9 331.0 L164.7 333.2 L171.2 335.5 L179.1 337.7 L194.0 340.0", "M206.0 24.0 L218.6 26.3 L225.2 28.5 L230.6 30.8 L235.3 33.0 L239.5 35.3 L243.3 37.5 L246.9 39.8 L250.2 42.1 L253.4 44.3 L256.5 46.6 L259.5 48.8 L262.4 51.1 L265.2 53.3 L267.8 55.6 L270.2 57.9 L272.4 60.1 L274.4 62.4 L276.1 64.6 L277.7 66.9 L279.2 69.1 L280.6 71.4 L282.2 73.7 L284.0 75.9 L285.9 78.2 L288.1 80.4 L290.6 82.7 L293.2 84.9 L295.9 87.2 L298.6 89.5 L301.1 91.7 L303.5 94.0 L305.7 96.2 L307.7 98.5 L309.4 100.7 L311.0 103.0 L312.5 105.3 L313.9 107.5 L315.4 109.8 L317.0 112.0 L318.6 114.3 L320.2 116.5 L321.7 118.8 L323.0 121.1 L324.1 123.3 L324.9 125.6 L325.3 127.8 L325.4 130.1 L325.3 132.3 L325.0 134.6 L324.7 136.9 L324.5 139.1 L324.5 141.4 L325.0 143.6 L325.7 145.9 L326.9 148.1 L328.4 150.4 L330.0 152.7 L331.8 154.9 L333.4 157.2 L335.0 159.4 L336.2 161.7 L337.3 163.9 L338.0 166.2 L338.7 168.5 L339.2 170.7 L339.7 173.0 L340.2 175.2 L340.9 177.5 L341.6 179.7 L342.4 182.0 L343.1 184.3 L343.6 186.5 L343.9 188.8 L343.8 191.0 L343.3 193.3 L342.3 195.5 L341.0 197.8 L339.4 200.1 L337.7 202.3 L336.1 204.6 L334.6 206.8 L333.5 209.1 L332.7 211.3 L332.3 213.6 L332.2 215.9 L332.4 218.1 L332.7 220.4 L333.0 222.6 L333.3 224.9 L333.3 227.1 L333.1 229.4 L332.7 231.7 L332.1 233.9 L331.5 236.2 L330.8 238.4 L330.2 240.7 L329.7 242.9 L329.3 245.2 L329.0 247.5 L328.6 249.7 L328.1 252.0 L327.4 254.2 L326.4 256.5 L324.9 258.7 L323.0 261.0 L320.8 263.3 L318.2 265.5 L315.5 267.8 L312.7 270.0 L310.0 272.3 L307.4 274.5 L305.0 276.8 L303.0 279.1 L301.1 281.3 L299.4 283.6 L297.9 285.8 L296.3 288.1 L294.6 290.3 L292.8 292.6 L290.9 294.9 L288.7 297.1 L286.4 299.4 L284.0 301.6 L281.6 303.9 L279.1 306.1 L276.6 308.4 L274.1 310.7 L271.5 312.9 L268.8 315.2 L266.0 317.4 L262.8 319.7 L259.3 321.9 L255.4 324.2 L251.1 326.5 L246.4 328.7 L241.1 331.0 L235.3 333.2 L228.8 335.5 L220.9 337.7 L206.0 340.0", "M 160 54 C 128 50, 104 70, 116 94 C 126 114, 160 104, 172 124", "M 74 118 C 98 104, 124 122, 112 144 C 100 166, 130 180, 156 168", "M 176 196 C 146 184, 120 204, 134 226 C 148 248, 118 264, 92 250", "M 64 196 C 82 186, 98 202, 88 222", "M 118 288 C 140 274, 166 286, 160 306 C 156 320, 176 326, 186 316", "M 76 276 C 96 266, 110 282, 102 298", "M 240 50 C 272 46, 296 66, 284 90 C 274 110, 240 100, 228 120", "M 326 124 C 302 110, 276 128, 288 150 C 300 172, 270 186, 244 174", "M 224 192 C 254 180, 280 200, 266 222 C 252 244, 282 260, 308 246", "M 336 202 C 318 192, 302 208, 312 228", "M 282 284 C 260 270, 234 282, 240 302 C 244 316, 224 322, 214 312", "M 324 282 C 304 272, 290 288, 298 304", "M200.0 36.0 L200.6 43.5 L201.1 51.0 L201.5 58.5 L201.7 66.0 L201.8 73.5 L201.6 81.0 L201.3 88.5 L200.8 96.0 L200.3 103.5 L199.7 111.0 L199.1 118.5 L198.6 126.0 L198.3 133.5 L198.2 141.0 L198.3 148.5 L198.5 156.0 L199.0 163.5 L199.5 171.0 L200.1 178.5 L200.7 186.0 L201.2 193.5 L201.6 201.0 L201.8 208.5 L201.8 216.0 L201.6 223.5 L201.2 231.0 L200.7 238.5 L200.2 246.0 L199.6 253.5 L199.0 261.0 L198.6 268.5 L198.3 276.0 L198.2 283.5 L198.3 291.0 L198.6 298.5 L199.0 306.0 L199.6 313.5 L200.2 321.0 L200.8 328.5 L201.2 336.0"];
const BRAIN_NODES = [[96, 170], [150, 232], [250, 140], [300, 236], [230, 292]];
const BRAIN_LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]];

export function BandMotif({ className }) {
  return (
    <svg viewBox="0 0 400 360" aria-hidden className={cn('pointer-events-none absolute', className)}>
      {BRAIN_PATHS.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {BRAIN_LINKS.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={BRAIN_NODES[a][0]} y1={BRAIN_NODES[a][1]} x2={BRAIN_NODES[b][0]} y2={BRAIN_NODES[b][1]} stroke="currentColor" strokeWidth="1.1" strokeDasharray="1 6" strokeLinecap="round" />
      ))}
      {BRAIN_NODES.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4.2" fill="currentColor" />
      ))}
    </svg>
  );
}
