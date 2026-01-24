import type { Metadata } from "next";
import { Geist, Geist_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// OSRS-style pixel font for headings
const pressStart = Press_Start_2P({
  variable: "--font-press-start",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "OSRS Helper - AI-Powered RuneScape Assistant",
  description: "Get personalized OSRS advice based on your stats, gear recommendations, boss strategies, and more with AI-powered assistance.",
  keywords: ["OSRS", "Old School RuneScape", "RuneScape", "AI", "Assistant", "Guide", "Boss", "Gear"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${pressStart.variable} antialiased`}
        style={{ backgroundColor: 'var(--osrs-bg)' }}
      >
        {children}
      </body>
    </html>
  );
}
