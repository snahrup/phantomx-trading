'use client';

import { useEffect } from 'react';
import { useTradingStore } from '@/store/trading-store';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useTradingStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return <>{children}</>;
}
