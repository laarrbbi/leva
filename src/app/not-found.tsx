import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center"
    >
      <h1 className="type-title">Nothing here</h1>
      <p className="type-body text-ink-muted text-pretty">
        This tag does not point at a store we know about. If you just scanned something in a shop,
        let a member of staff know.
      </p>
      <Link href="/" className="type-caption font-semibold text-brand underline underline-offset-4">
        Go to the start
      </Link>
    </main>
  );
}
