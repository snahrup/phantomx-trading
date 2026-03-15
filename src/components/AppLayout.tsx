'use client';

import type { ReactNode } from 'react';
import AppSidebar from './AppSidebar';
import LiveAvatar from './LiveAvatar';
import AxonActivityBar from './autopilot/AxonActivityBar';
import { motion } from 'framer-motion';

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function AppLayout({ children, title, subtitle, actions }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AxonActivityBar />
        <LiveAvatar />
        {/* Page header */}
        {title && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="px-6 pt-5 pb-3 flex items-start justify-between"
          >
            <div>
              <h1 className="text-xl font-display font-semibold tracking-tight text-foreground">{title}</h1>
              {subtitle && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-sm text-muted-foreground mt-0.5"
                >
                  {subtitle}
                </motion.p>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-2">
                {actions}
              </div>
            )}
          </motion.div>
        )}
        {/* Page content */}
        <main className="flex-1 overflow-y-auto px-6 pb-6">
          {children}
        </main>
      </div>
    </div>
  );
}
