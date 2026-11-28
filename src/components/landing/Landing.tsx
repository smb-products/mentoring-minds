import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { BadgeDollarSign, BookOpen, ClipboardCheck, GraduationCap, type LucideIcon } from 'lucide-react';
import { LogoMark } from '@/ui/components/brand/Logo';
import { SITE_NAME, STEP_UP_URL } from './site';
import { RequestInvite } from './RequestInvite';
// Static imports: served from /_next/static and /_next/image, which src/proxy.ts lets through signed out (L5).
import oneOnOne from '../../../public/landing/services/one-on-one.jpg';
import smallGroups from '../../../public/landing/services/small-groups.jpg';
import inHome from '../../../public/landing/services/in-home.jpg';
import online from '../../../public/landing/services/online.jpg';

/**
 * The public landing page at / for signed-out visitors: Landing C, "Bright and clear" (docs/design/landing-c.html,
 * docs/DESIGN.md → Landing C). A server component outside AppRoot, with no database call. Its colors are the
 * --landing-* tokens in globals.css, set on `.landing`.
 */

type Tone = 'blue' | 'yellow' | 'green' | 'purple';
const TONE: Record<Tone, { tile: string; ink: string }> = {
  blue: { tile: 'bg-landing-blue', ink: 'text-landing-blue-ink' },
  yellow: { tile: 'bg-landing-yellow', ink: 'text-landing-yellow-ink' },
  green: { tile: 'bg-landing-green', ink: 'text-landing-green-ink' },
  purple: { tile: 'bg-landing-purple', ink: 'text-landing-purple-ink' },
};

const TRUST: { label: string; icon: LucideIcon; tone: Tone }[] = [
  { label: 'Grades K–6', icon: GraduationCap, tone: 'blue' },
  { label: 'Florida B.E.S.T. standards', icon: BookOpen, tone: 'yellow' },
  { label: 'F.A.S.T. test prep', icon: ClipboardCheck, tone: 'green' },
  { label: 'Step Up For Students accepted', icon: BadgeDollarSign, tone: 'purple' },
];

/** Each card's photo is an illustrative scene from Vienne's flyer, not her students or families (L5). */
const SERVICES: { name: string; line: string; photo: StaticImageData; alt: string; tone: Tone }[] = [
  { name: '1-on-1 Tutoring', line: 'Individual support for students who need extra help in a subject.', photo: oneOnOne, alt: 'A tutor helping a student with a worksheet', tone: 'blue' },
  { name: 'Small Groups', line: 'Students practice and learn alongside their peers.', photo: smallGroups, alt: 'A tutor working with a small group of students', tone: 'yellow' },
  { name: 'In-Home Tutoring', line: 'For special circumstances.', photo: inHome, alt: 'A tutor and a student working at a kitchen table', tone: 'green' },
  { name: 'Online Tutoring', line: 'For special circumstances.', photo: online, alt: 'A student in an online session with a tutor on a laptop', tone: 'purple' },
];
/** Matches the services grid: 4 across from lg, 2 across from sm, 1 across below. */
const SERVICE_PHOTO_SIZES = '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw';

/** What the parent app does today: each line is true of the screens (L4 report). */
const APP_LINES: [string, string][] = [
  ['Book sessions online', 'at a time that suits you'],
  ['Homework with feedback', 'from Vienne'],
  ['Progress reports', 'in Vienne’s words'],
  ['F.A.S.T. score tracking', 'and the area to work on next'],
  ['Message Vienne directly,', 'plus video sessions when needed'],
];

const WAYS_TO_PAY = ['Cash', 'Zelle', 'Cash App', 'Apple Pay'];

const STEPS: [string, string][] = [
  ['Create your account', 'Sign up with your email or Google.'],
  ['Add your child', 'Their first name and grade.'],
  ['Book your first session', 'Pick a time, and Vienne confirms it.'],
];

/** The two patterns Landing C allows, both CSS gradients: the graph-paper hero and the highlight. */
const GRAPH_PAPER: CSSProperties = {
  backgroundImage:
    'linear-gradient(var(--landing-grid) 1px, transparent 1px), linear-gradient(90deg, var(--landing-grid) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
};
const HIGHLIGHT: CSSProperties = { backgroundImage: 'linear-gradient(transparent 62%, var(--landing-highlight) 62%)' };

/** J3: sign-up is open. Get started opens the sign-in page in Create account mode (J2). */
const SIGN_UP = '/sign-in?mode=new';

const container = 'mx-auto w-full max-w-[1160px] px-6';
const primaryButton =
  'inline-flex w-full items-center justify-center rounded-[12px] bg-landing-accent px-[26px] py-[15px] font-semibold text-landing-paper hover:bg-landing-accent-hover hover:text-landing-paper sm:w-auto';
const secondaryButton =
  'inline-flex w-full items-center justify-center rounded-[12px] border border-landing-control-line bg-landing-paper px-[26px] py-[15px] font-semibold text-landing-ink hover:bg-landing-chip sm:w-auto';

/** A section title: weight 700 with tight tracking (text-headline), ink on white or white on the dark panel. */
function SectionTitle({ id, children, className = '', onDark = false }: { id: string; children: ReactNode; className?: string; onDark?: boolean }) {
  return (
    <h2 id={id} className={`text-headline ${onDark ? 'text-landing-paper' : 'text-landing-ink'} ${className}`}>
      {children}
    </h2>
  );
}

function LandingHeader() {
  return (
    <header className="mx-auto flex w-full max-w-[1160px] flex-wrap items-center justify-between gap-4 px-6 py-5 max-[480px]:flex-nowrap">
      {/* Under 480px only the logo, the name and Sign in: the name shrinks with an ellipsis, and the hero carries the
          call to action (lead amend, approved by Javaris 2026-11-27; holdout L3's 320px check). */}
      <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-md font-bold tracking-[-0.01em] text-landing-ink">
        <LogoMark size={32} className="shrink-0" />
        <span className="min-w-0 truncate text-[18px]">{SITE_NAME}</span>
      </Link>
      <nav aria-label="Main" className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 text-[15px] font-medium">
        <a href="#services" className="text-landing-muted hover:text-landing-ink max-[480px]:hidden">Services</a>
        <a href="#rates" className="text-landing-muted hover:text-landing-ink max-[480px]:hidden">Rates</a>
        <Link href="/sign-in" className="text-landing-muted hover:text-landing-ink">Sign in</Link>
        <Link href={SIGN_UP} className="rounded-[10px] bg-landing-accent px-[18px] py-2.5 font-semibold text-landing-paper hover:bg-landing-accent-hover max-[480px]:hidden">
          Get started
        </Link>
      </nav>
    </header>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-landing-line">
      <div className="mx-auto flex w-full max-w-[1160px] flex-wrap justify-between gap-4 px-6 py-7 text-[14px] text-landing-subtle">
        <span className="font-bold text-landing-ink">{SITE_NAME}</span>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <nav aria-label="Footer" className="flex gap-6">
            <Link href="/privacy" className="text-landing-subtle underline underline-offset-4 hover:text-landing-ink">Privacy</Link>
            <Link href="/sign-in" className="text-landing-subtle underline underline-offset-4 hover:text-landing-ink">Sign in</Link>
          </nav>
          <span>© Mentoring Minds Academy</span>
        </div>
      </div>
    </footer>
  );
}

/** The dark progress card: static markup, clearly labelled as a sample. 'Ella' is in no family's data, not even the demo seed's,
 * so the leak holdouts that ban seed names on / keep holding (lead edit, CHANGES.md 2026-11-27). */
function SampleProgress() {
  const tile = 'rounded-[16px] bg-landing-night-raised p-[18px]';
  const label = 'text-[13px] text-landing-night-muted';
  return (
    <figure data-sample-screen className="m-0 flex min-w-0 flex-[1_1_400px] flex-col gap-3.5 rounded-[28px] bg-landing-night p-7 text-landing-paper">
      <div className={label}>Progress · Ella, grade 3</div>
      <div className={tile}>
        <div className={label}>From Vienne</div>
        <div className="mt-1.5 text-[15px] leading-normal">Much more patient with word problems, and now draws a picture before solving.</div>
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <div className={tile}>
          <div className={label}>Average score</div>
          <div className="text-[30px] font-bold tracking-[-0.02em]">83%</div>
        </div>
        <div className={tile}>
          <div className={label}>Next session</div>
          <div className="mt-1.5 text-[17px] font-semibold">Mon, 6:30 PM</div>
        </div>
      </div>
      <figcaption className="text-[12px] text-landing-night-faint">Sample screen with demo data.</figcaption>
    </figure>
  );
}

export function Landing() {
  return (
    <div className="landing min-h-dvh bg-landing-paper font-sans text-[16px] leading-[1.6] text-landing-ink">
      <LandingHeader />
      <main>
        <section aria-labelledby="hero-title" className="px-4">
          <div
            data-hero
            className="mx-auto max-w-[1128px] rounded-[32px] bg-landing-hero px-6 py-[clamp(48px,8vw,96px)] text-center"
            style={GRAPH_PAPER}
          >
            <p className="mx-auto inline-block rounded-full border border-landing-pill-line bg-landing-paper px-3.5 py-1.5 text-[13px] font-semibold text-landing-accent">
              Grades K–6 · Miami-Dade · In person or online
            </p>
            <h1 id="hero-title" className="mx-auto mt-6 max-w-[820px] text-display text-landing-ink">
              Math tutoring that builds{' '}
              <span data-highlight className="px-1" style={HIGHLIGHT}>
                real confidence
              </span>
            </h1>
            <p className="mx-auto mt-[22px] max-w-[600px] text-[19px] text-landing-muted">
              One-on-one and small-group sessions with Vienne Elliott, with F.A.S.T. test prep for Florida students.
            </p>
            <div className="mt-[34px] flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
              <Link href={SIGN_UP} className={primaryButton}>Get started</Link>
              <a href="#rates" className={secondaryButton}>$50 per hour · See rates</a>
            </div>
          </div>
        </section>

        <ul aria-label="At a glance" className={`${container} grid list-none grid-cols-2 gap-4 pt-10 lg:grid-cols-4`}>
          {TRUST.map(({ label, icon: Icon, tone }) => (
            <li key={label} className="flex flex-col items-start gap-3 rounded-[16px] border border-landing-line p-4 sm:flex-row sm:items-center sm:p-[18px]">
              <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] ${TONE[tone].tile} ${TONE[tone].ink}`}>
                <Icon data-icon size={20} strokeWidth={1.75} aria-hidden />
              </span>
              <span className="text-[15px] font-semibold leading-snug">{label}</span>
            </li>
          ))}
        </ul>

        <section id="services" aria-labelledby="services-title" className={`${container} scroll-mt-6 pt-24`}>
          <div className="text-center">
            <SectionTitle id="services-title">Ways to learn with Vienne</SectionTitle>
            <p className="mx-auto mt-2.5 max-w-[520px] text-landing-muted">Pick what fits your child. Every option includes the parent app.</p>
          </div>
          <ul className="mt-11 grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map(({ name, line, photo, alt, tone }) => (
              <li key={name} className={`overflow-hidden rounded-[24px] ${TONE[tone].tile}`}>
                <Image src={photo} alt={alt} sizes={SERVICE_PHOTO_SIZES} className="block aspect-[2/1] h-auto w-full object-cover" />
                <div className="p-[30px]">
                  <h3 className="mb-2 text-[19px] font-bold leading-[1.3] tracking-[-0.01em]">{name}</h3>
                  <p className="text-[15px] text-landing-text">{line}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* About Vienne: its slot. It stays out until Javaris sends the content (docs/DESIGN.md → Landing C). */}

        <section aria-labelledby="app-title" className={`${container} flex flex-wrap items-center gap-12 pt-24`}>
          <div className="min-w-0 flex-[1_1_400px]">
            <SectionTitle id="app-title">Know exactly how your child is doing</SectionTitle>
            <p className="mt-3.5 text-[17px] text-landing-muted">Every family gets the Mentoring Minds app.</p>
            <ul className="mt-7 flex list-none flex-col gap-3.5">
              {APP_LINES.map(([strong, rest]) => (
                <li key={strong} className="flex gap-3">
                  <span aria-hidden className="font-bold text-landing-accent">✓</span>
                  <span>
                    <strong className="font-semibold">{strong}</strong> <span className="text-landing-muted">{rest}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <SampleProgress />
        </section>

        <section id="rates" aria-labelledby="rates-title" className={`${container} scroll-mt-6 pt-24`}>
          <div data-rates-panel className="flex flex-wrap items-center justify-between gap-10 rounded-[28px] border border-landing-line p-[clamp(28px,5vw,56px)]">
            <div>
              <h2 id="rates-title" className="text-[14px] font-semibold text-landing-accent">Simple pricing</h2>
              <p className="mt-2 text-price">
                <span>$50</span>
                <span className="text-[18px] font-medium tracking-normal text-landing-muted">{' '}per hour</span>
              </p>
              <p className="mt-3.5 text-landing-muted">In person or online, whichever works best for your child.</p>
            </div>
            <div className="min-w-0 flex-[0_1_440px]">
              <p className="mb-3 font-semibold">Ways to pay</p>
              <ul aria-label="Ways to pay" className="flex list-none flex-wrap gap-2 text-[15px]">
                {WAYS_TO_PAY.map((way) => (
                  <li key={way} className="rounded-[10px] bg-landing-chip px-3.5 py-2 font-medium">{way}</li>
                ))}
                <li className="flex">
                  <a
                    href={STEP_UP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-[10px] bg-landing-purple px-3.5 py-2 font-semibold text-landing-purple-ink hover:underline"
                  >
                    Step Up For Students scholarship <span aria-hidden>↗</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="steps-title" className={`${container} pt-24`}>
          <SectionTitle id="steps-title" className="text-center">Getting started takes three steps</SectionTitle>
          <ol className="mt-11 grid list-none grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map(([title, line], i) => (
              <li key={title} className="rounded-[20px] border border-landing-line p-7">
                <span aria-hidden data-step-number className="flex size-9 items-center justify-center rounded-[10px] bg-landing-accent font-bold text-landing-paper">
                  {i + 1}
                </span>
                <h3 className="mb-1.5 mt-[18px] text-[18px] font-bold">{title}</h3>
                <p className="text-[15px] text-landing-muted">{line}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="request-invite" aria-labelledby="request-invite-title" className="scroll-mt-6 px-4 py-24">
          <div className="mx-auto flex max-w-[1128px] flex-wrap gap-12 rounded-[32px] bg-landing-night p-[clamp(32px,6vw,64px)] text-landing-paper">
            <div className="min-w-0 flex-[1_1_300px]">
              <SectionTitle id="request-invite-title" onDark>Questions? Message Vienne</SectionTitle>
              <p className="mt-3.5 text-[17px] text-landing-night-text">Send a request and Vienne will reply personally.</p>
              <p className="mt-[22px] text-[15px] text-landing-night-muted">
                Ready to start?{' '}
                <Link href={SIGN_UP} className="text-landing-night-link underline underline-offset-4 hover:no-underline">
                  Create your account
                </Link>
              </p>
            </div>
            <div className="min-w-0 flex-[1_1_520px]">
              <RequestInvite />
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
