import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '@/components/landing/SiteChrome';
import { SITE_URL } from '@/components/landing/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Privacy',
  description: 'What Mentoring Minds Academy stores, who sees it, where it lives and how to delete it.',
  alternates: { canonical: '/privacy' },
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'What the app stores',
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Your account: signing up asks for your name and email, and your children’s first names and grades. You can add a phone number. If you sign in with Google, Google shares only your name and email.</li>
        <li>Your children’s first names and grades.</li>
        <li>Sessions, and Vienne’s notes about them.</li>
        <li>Homework, and the photos of it you send.</li>
        <li>Messages between you and Vienne.</li>
        <li>FAST scores.</li>
        <li>Messages from the “Questions? Message Vienne” form: your name, email, phone, your child’s grade and your message, plus a scrambled (hashed) form of your internet address, used only to stop spam. Both are deleted after 90 days.</li>
      </ul>
    ),
  },
  {
    title: 'Who sees it',
    body: <p>Vienne sees everything, so she can teach. Each family sees only its own children and messages, never another family’s.</p>,
  },
  {
    title: 'Who else handles it',
    body: <p>We never sell or share your information. Only the services that run the app handle it: Vercel (hosting), Neon (the database), Google (if you sign in with Google) and, if you turn on notifications, your phone’s notification service (Apple or Google), which delivers them.</p>,
  },
  {
    title: 'Where it lives',
    body: <p>The app runs on Vercel, and the data is kept in a Neon database. Both are in the US.</p>,
  },
  {
    title: 'How long it’s kept',
    body: <p>Invite requests are deleted after 90 days. Everything else stays while your family uses the app.</p>,
  },
  {
    title: 'How to delete it',
    body: (
      <p>
        Ask Vienne, and she deletes your family, or one child, with everything stored about them. Copies in the
        database’s backups clear on their own once its restore window passes.
      </p>
    ),
  },
];

/** /privacy (docs/DESIGN.md → Privacy page): plain words, no legal boilerplate. Open to everyone. */
export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-card text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1080px] px-5 py-12 md:px-8 md:py-16">
        <div className="max-w-2xl">
          <h1 className="text-page text-ink dark:text-foreground">Privacy</h1>
          <p className="mt-3 text-body text-muted-foreground">
            What Mentoring Minds Academy keeps about your family, who sees it, and how to have it deleted.
          </p>
          {SECTIONS.map(({ title, body }) => (
            <section key={title} className="mt-10">
              <h2 className="text-heading text-ink dark:text-foreground">{title}</h2>
              <div className="mt-3 text-body text-muted-foreground">{body}</div>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
