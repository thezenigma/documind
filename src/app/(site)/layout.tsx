import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeSwitch } from "@/components/theme/theme-switch";

/** Marketing and library pages share the wordmark header. The Ask screen is a
    chat shell with its own top bar, so it lives outside this group and keeps
    the same URL. The footer names the project honestly and holds the theme
    switch (PRD F18), which is why it is a client component in a server layout. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="wordmark">
            DocuMind
          </Link>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <p className="max-w-[52ch] text-sm text-muted">
            DocuMind is a portfolio project. Every answer comes from the
            documents you upload, and shows the page it came from.
          </p>
          <ThemeSwitch label="Theme for this site" />
        </div>
      </footer>
    </>
  );
}
