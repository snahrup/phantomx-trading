'use client';

import { useEffect } from 'react';
import { useTradingStore } from '@/store/trading-store';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useTradingStore((s) => s.theme);

  useEffect(() => {
    // Set data-theme for PhantomX custom variant: @custom-variant dark (&:is([data-theme="dark"] *))
    document.documentElement.setAttribute('data-theme', theme);
    // Also toggle .dark class for shadcn/ui components that use dark: variant
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return <>{children}</>;
}
