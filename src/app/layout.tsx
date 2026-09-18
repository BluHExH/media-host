import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: {
    default: "Media Host — Private CDN for images, video & audio",
    template: "%s · Media Host",
  },
  description:
    "Secure personal media hosting. Upload images, video, audio and HTML. Folders, expiry links, background removal, and private libraries — login required.",
  keywords: [
    "image hosting",
    "video hosting",
    "CDN",
    "private media library",
    "background removal",
  ],
  authors: [{ name: "Media Host" }],
  openGraph: {
    title: "Media Host — Private CDN library",
    description: "Sign in, upload, get instant CDN URLs. Folders, expiry, Remove BG.",
    type: "website",
    siteName: "Media Host",
  },
  twitter: {
    card: "summary_large_image",
    title: "Media Host",
    description: "Private image & video hosting with CDN links.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
