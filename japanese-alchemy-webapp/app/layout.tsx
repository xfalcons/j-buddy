import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

export const metadata: Metadata = {
  title: "J-Buddy: Learning Hub - 單字與文法學習",
  description: "一個使用 Next.js、shadcn/ui 和 Firebase 構建的日語單字與文法學習應用程式",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
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
