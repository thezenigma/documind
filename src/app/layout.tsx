import type { Metadata } from "next";
import { Fraunces, Source_Sans_3, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DocuMind",
    template: "%s · DocuMind",
  },
  description:
    "Upload your documents, ask a question in plain language, and get a concise answer you can check against the exact page it came from.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${sourceSans.variable} ${jetbrains.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
