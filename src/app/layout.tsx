import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});
const poppins = Poppins({
  variable: "--font-display",
  weight: ["400", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Media Host — Private image & video hosting",
  description: "Sign in to upload. Folders, expiry links, CDN URLs. No guest uploads.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable} h-full`} data-theme="light">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
