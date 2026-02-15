import type { Metadata } from "next";
import ClientErrorBoundary from "@/components/ClientErrorBoundary";
import ThemeProvider from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "PhantomX — AI-Powered Phemex Trading",
  description: "Autonomous crypto trading platform with Claude AI integration, TradingView PineScript automation, and full kill-switch safety controls.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var stored = JSON.parse(localStorage.getItem('phantomx-trading-store') || '{}');
            var theme = (stored.state && stored.state.theme) || 'light';
            document.documentElement.setAttribute('data-theme', theme);
          } catch(e) {
            document.documentElement.setAttribute('data-theme', 'light');
          }
        `}} />
      </head>
      <body className="antialiased overflow-hidden">
        <ThemeProvider>
          <ClientErrorBoundary>{children}</ClientErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
