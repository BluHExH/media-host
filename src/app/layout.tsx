import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Media Host — Private CDN for images, video & audio",
    template: "%s · Media Host",
  },
  description:
    "Secure personal media hosting. Upload images, video, audio and HTML. Folders, expiry links, background removal, private libraries.",
  keywords: ["image hosting", "video hosting", "CDN", "private media", "background removal"],
  openGraph: {
    title: "Media Host",
    description: "Private CDN library — sign in, upload, share.",
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
    <html lang="en" className={`${inter.variable} ${playfair.variable} h-full`}>
      <body className="min-h-full font-light antialiased">{children}</body>
    </html>
  );
}
