import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 text-center">
      <div>
        <h1 className="text-[26px] font-extrabold">This page isn’t here</h1>
        <p className="mt-2 text-muted-foreground">It may have moved, or the link is out of date.</p>
        <Link href="/" className="chrome-primary mt-6 inline-flex h-12 items-center rounded-xl bg-primary px-6 font-bold text-primary-foreground">Go home</Link>
      </div>
    </main>
  );
}
