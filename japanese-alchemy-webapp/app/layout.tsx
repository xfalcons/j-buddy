import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

export const metadata: Metadata = {
  title: "Japanese Alchemy - Vocabulary & Grammar Study",
  description: "A Japanese vocabulary and grammar study application built with Next.js, shadcn/ui, and Firebase",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://static.line-scdn.net/seed/line-seed/2.0/LineSeedJP_TTF_Rg.css" />
      </head>
      <body className="antialiased" style={{ fontFamily: '"LINE Seed JP", sans-serif' }}>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
