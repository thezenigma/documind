import type { ReactNode } from "react";
import Link from "next/link";

/** Marketing and library pages share the wordmark header. The Ask screen is a
    chat shell with its own top bar, so it lives outside this group and keeps
    the same URL. */
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
    </>
  );
}
