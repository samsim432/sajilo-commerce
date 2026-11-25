import * as React from "react";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-ivory text-charcoal flex flex-col justify-between px-4 py-8">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-charcoal font-display text-sm font-bold text-ivory">
            SC
          </span>
          <div>
            <p className="font-display text-base font-bold leading-none text-charcoal">
              Sajilo Commerce
            </p>
            <p className="mt-0.5 text-[11px] text-muted-ink">
              Every channel. One business.
            </p>
          </div>
        </Link>

        <Link
          href="/"
          className="text-xs font-medium text-muted-ink hover:text-charcoal transition-colors"
        >
          Back to website
        </Link>
      </header>

      <main className="mx-auto my-8 w-full max-w-md">{children}</main>

      <footer className="mx-auto w-full max-w-5xl text-center text-xs text-muted-ink">
        Built for Nepali merchants · NPR · English &amp; Nepali
      </footer>
    </div>
  );
}