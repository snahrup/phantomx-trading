'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, LineChart, Crosshair, MessageSquare, Network, BookOpen,
  Puzzle, Search, Shield, Settings, ChevronLeft, ChevronRight, Zap,
  Microscope, Workflow, Library,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTradingStore } from '@/store/trading-store';

const navSections = [
  {
    label: 'Trading',
    items: [
      { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/trading', icon: LineChart, label: 'Trading' },
      { path: '/mission-control', icon: Crosshair, label: 'Mission Control' },
      { path: '/ai', icon: MessageSquare, label: 'Concierge' },
      { path: '/agents', icon: Network, label: 'Agents' },
      { path: '/pipeline', icon: Workflow, label: 'Pipeline' },
    ],
  },
  {
    label: 'Strategy',
    items: [
      { path: '/research', icon: Microscope, label: 'Research' },
      { path: '/journal', icon: BookOpen, label: 'Journal' },
      { path: '/strategy', icon: Puzzle, label: 'Strategy' },
      { path: '/scanner', icon: Search, label: 'Gem Scanner' },
      { path: '/knowledge', icon: Library, label: 'Knowledge' },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/controls', icon: Shield, label: 'Controls' },
      { path: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const collapsed = useTradingStore(s => s.sidebarCollapsed);
  const setSidebarCollapsed = useTradingStore(s => s.setSidebarCollapsed);
  const isExecuting = useTradingStore(s => s.isExecuting);
  const isKilled = useTradingStore(s => s.isKilled);
  const agentStatuses = useTradingStore(s => s.agentStatuses);

  const activeAgents = agentStatuses.filter(a => a.state === 'running').length;
  const researchStatus = useTradingStore(s => s.researchEngineStatus);
  const researchRunning = researchStatus?.state === 'running';

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-56'} shrink-0 h-screen sticky top-0 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200`}>
      {/* Logo */}
      <div className="px-3 pt-4 pb-2">
        <div className="flex items-center gap-2 mb-3">
          <motion.div
            className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Zap className="w-3.5 h-3.5 text-primary-foreground" />
          </motion.div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="font-display font-semibold text-sm tracking-tight"
              >
                PhantomX
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Status indicator */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="px-2 py-1.5 rounded-md bg-sidebar-accent text-[10px] font-medium"
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${isKilled ? 'bg-destructive' : isExecuting ? 'bg-claude-green' : 'bg-muted-foreground'}`} />
              {isKilled ? 'KILLED' : isExecuting ? 'AUTO-TRADING' : 'MANUAL'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
        {navSections.map(section => (
          <div key={section.label}>
            <AnimatePresence>
              {!collapsed && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-2 mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {section.label}
                </motion.p>
              )}
            </AnimatePresence>
            <div className="space-y-0.5">
              {section.items.map(item => {
                const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
                const hasActivity = (item.path === '/agents' && activeAgents > 0) || (item.path === '/trading' && isExecuting) || (item.path === '/research' && researchRunning);

                const linkContent = (
                  <Link
                    href={item.path}
                    className={`relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors duration-150 ${
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                        : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                    }`}
                  >
                    <div className="relative">
                      <item.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-sidebar-primary' : ''}`} />
                      {hasActivity && (
                        <motion.div
                          className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-claude-green"
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      )}
                    </div>
                    {!collapsed && <span>{item.label}</span>}
                    {!collapsed && item.path === '/agents' && activeAgents > 0 && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary"
                      >
                        {activeAgents}
                      </motion.span>
                    )}
                    {/* Active indicator bar */}
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-sidebar-primary"
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      />
                    )}
                  </Link>
                );

                if (collapsed) {
                  return (
                    <Tooltip key={item.path} delayDuration={0}>
                      <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">
                        {item.label}
                        {item.path === '/agents' && activeAgents > 0 ? ` (${activeAgents})` : ''}
                      </TooltipContent>
                    </Tooltip>
                  );
                }
                return <div key={item.path}>{linkContent}</div>;
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-sidebar-border">
        <motion.button
          onClick={() => setSidebarCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-colors"
          whileTap={{ scale: 0.97 }}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /><span>Collapse</span></>}
        </motion.button>
      </div>
    </aside>
  );
}
