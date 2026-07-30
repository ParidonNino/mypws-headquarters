import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    "https://powerselect-werkplanner.nino-van-paridon.chatgpt.site",
  ),
  title: "My Powerselect Headquarters",
  description:
    "Plan je Powerselect-taken vanuit My Powerselect Headquarters.",
  icons: {
    icon: "/powerselect-favicon.png",
    shortcut: "/powerselect-favicon.png",
    apple: "/powerselect-favicon.png",
  },
  openGraph: {
    title: "My Powerselect Headquarters",
    description:
      "Plan je Powerselect-taken vanuit My Powerselect Headquarters.",
    siteName: "My Powerselect Headquarters",
    locale: "nl_NL",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1732,
        height: 909,
        alt: "My Powerselect Headquarters",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "My Powerselect Headquarters",
    description:
      "Plan je Powerselect-taken vanuit My Powerselect Headquarters.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
