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
