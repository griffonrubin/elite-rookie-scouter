import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "../styles/theme.css";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={inter.className}>
        <DataRefresher />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
