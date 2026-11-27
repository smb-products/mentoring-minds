import Link from 'next/link';
import { Home, Laptop, User, Users, type LucideIcon } from 'lucide-react';
import { SiteFooter, SiteHeader } from './SiteChrome';
import { STEP_UP_URL } from './site';
import { RequestInvite } from './RequestInvite';

const SERVICES: { name: string; line: string; icon: LucideIcon }[] = [
  { name: '1-on-1 Tutoring', line: 'Individual support for students who need extra help in a subject.', icon: User },
  { name: 'Small Groups', line: 'Students practice and learn alongside their peers.', icon: Users },
  { name: 'In-Home Tutoring', line: 'For special circumstances.', icon: Home },
  { name: 'Online Tutoring', line: 'For special circumstances.', icon: Laptop },
];

const STEPS = [
  'Ask Vienne for an invite code.',
  'Create your account with the code.',
  'Book sessions and follow homework and progress.',
];

const link = 'text-brand underline underline-offset-4 hover:no-underline';
const button = 'inline-flex h-11 items-center justify-center rounded-md px-5 text-body font-medium';
const sectionTitle = 'text-title text-ink dark:text-foreground';

/** One section of the page: a title and its content, with the page's spacing. */
function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  const headingId = `${id ?? title.toLowerCase().replace(/[^a-z]+/g, '-')}-title`;
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-6 border-t border-border py-12 md:py-16">
      <h2 id={headingId} className={sectionTitle}>{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * The public landing page at / for signed-out visitors (docs/DESIGN.md → Landing page).
 * A server component outside AppRoot, with no database call.
 */
export function Landing() {
  return (
    <div className="min-h-dvh bg-card text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1080px] px-5 md:px-8">
        <section aria-labelledby="hero-title" className="py-14 md:py-24">
          <h1 id="hero-title" className="max-w-2xl text-page text-ink dark:text-foreground">
            Math tutoring for grades K-6 in Miami-Dade, with F.A.S.T. test prep
          </h1>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#request-invite" className={`${button} bg-primary text-primary-foreground hover:bg-primary-hover`}>
              Get started
            </a>
            <Link href="/sign-in" className={`${button} border border-border bg-card text-foreground hover:bg-muted`}>
              Sign in
            </Link>
          </div>
        </section>

        <Section title="Services">
          <ul className="grid gap-x-12 gap-y-8 md:grid-cols-2">
            {SERVICES.map(({ name, line, icon: Icon }) => (
              <li key={name} className="flex gap-3">
                <Icon size={18} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
                <div>
                  <h3 className="text-heading text-ink dark:text-foreground">{name}</h3>
                  <p className="mt-1 text-body text-muted-foreground">{line}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Rates">
          <p className="text-heading text-ink tabular-nums dark:text-foreground">$50 per hour</p>
          <p className="mt-2 max-w-2xl text-body text-muted-foreground">
            Pay by cash, Zelle, Cash App, Apple Pay, or the{' '}
            <a href={STEP_UP_URL} target="_blank" rel="noopener noreferrer" className={link}>
              Step Up For Students scholarship
            </a>
            .
          </p>
        </Section>

        <Section title="How it works">
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-3 text-body">
                <span aria-hidden className="text-heading text-muted-foreground tabular-nums">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="In person or online">
          <p className="max-w-2xl text-body text-muted-foreground">
            Sessions are in person or online by video call, whichever works best for your child.
          </p>
        </Section>

        <Section id="request-invite" title="Request an invite">
          <RequestInvite />
          <p className="mt-8 max-w-2xl text-body text-muted-foreground">
            Have an invite code from Vienne?{' '}
            <Link href="/sign-in" className={link}>Create your account on the sign-in page.</Link>
          </p>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
