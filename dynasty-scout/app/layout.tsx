import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Elite Rookie Scouter | 2026 Dynasty Draft",
  description: "AI-powered dynasty fantasy football rookie scouting agent with real-time news scanning and sentiment analysis",
};

import { DataRefresher } from '@/components/DataRefresher';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${dmSans.variable} ${jetBrainsMono.variable} ${dmSans.className}`}>
        <DataRefresher />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
