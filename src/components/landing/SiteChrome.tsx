import Link from 'next/link';
import { LogoMark } from '@/ui/components/brand/Logo';
import { SITE_NAME } from './site';

/**
 * The public pages' header (landing, privacy): the brain logo and the name, linking home.
 * The landing page adds a Sign in link at top right (`signIn`); /privacy, which signed-in people open too, doesn't.
 */
export function SiteHeader({ signIn = false }: { signIn?: boolean }) {
  return (
    <header className="mx-auto flex w-full max-w-[1080px] items-center gap-4 px-5 py-4 md:px-8 md:py-5">
      <Link href="/" className="flex min-w-0 items-center gap-3 rounded-md text-ink dark:text-foreground">
        <LogoMark size={44} className="" />
        <span className="text-title">{SITE_NAME}</span>
      </Link>
      {signIn && (
        <Link href="/sign-in" className="ml-auto shrink-0 rounded-md px-1 text-body font-medium text-brand underline-offset-4 hover:underline">
          Sign in
        </Link>
      )}
    </header>
  );
}

/** The public pages' footer: Privacy, Sign in, and the copyright line. */
export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-[1080px] px-5 pb-10 md:px-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-6 text-small text-muted-foreground">
        <nav aria-label="Footer" className="flex gap-6">
          <Link href="/privacy" className="text-brand underline-offset-4 hover:underline">Privacy</Link>
          <Link href="/sign-in" className="text-brand underline-offset-4 hover:underline">Sign in</Link>
        </nav>
        <p className="sm:ml-auto">© Mentoring Minds Academy</p>
      </div>
    </footer>
  );
}
