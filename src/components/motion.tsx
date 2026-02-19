'use client';

import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { useEffect, useState, useRef, type ReactNode } from 'react';

// === PAGE TRANSITION ===
// Wraps page content with a subtle fade + slide on mount

export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// === STAGGERED LIST ===
// Children cascade in with slight delays — feels like information "arriving"

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } },
};

export function StaggerList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  );
}

// === FADE IN ===
// Simple fade-in for individual elements

export function FadeIn({ children, delay = 0, className, duration = 0.3 }: { children: ReactNode; delay?: number; className?: string; duration?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// === SLIDE IN ===
// Slide from a direction

export function SlideIn({ children, from = 'bottom', delay = 0, className }: { children: ReactNode; from?: 'left'|'right'|'top'|'bottom'; delay?: number; className?: string }) {
  const offsets = { left: { x: -20, y: 0 }, right: { x: 20, y: 0 }, top: { x: 0, y: -20 }, bottom: { x: 0, y: 20 } };
  return (
    <motion.div
      initial={{ opacity: 0, ...offsets[from] }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// === ANIMATED COUNTER ===
// Numbers count up on mount — draws the eye to what matters

export function AnimatedCounter({ value, duration = 1.2, className }: { value: number; duration?: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number | null>(null);
  const startTime = useRef<number>(0);

  useEffect(() => {
    startTime.current = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime.current;
      const progress = Math.min(elapsed / (duration * 1000), 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) {
        ref.current = requestAnimationFrame(animate);
      }
    };
    ref.current = requestAnimationFrame(animate);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [value, duration]);

  return <span className={className}>{display}</span>;
}

// === ANIMATED PERCENTAGE ===
// For confidence bars and progress indicators

export function AnimatedPercentage({ value, duration = 1.0, className }: { value: number; duration?: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number | null>(null);
  const startTime = useRef<number>(0);

  useEffect(() => {
    startTime.current = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime.current;
      const progress = Math.min(elapsed / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) {
        ref.current = requestAnimationFrame(animate);
      }
    };
    ref.current = requestAnimationFrame(animate);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [value, duration]);

  return <span className={className}>{display}%</span>;
}

// === HOVER LIFT CARD ===
// Cards lift with subtle shadow depth on hover

export function HoverCard({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
      whileTap={{ scale: 0.995 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={className}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}

// === PRESS BUTTON ===
// Spring-loaded press state for buttons

export function PressButton({ children, className, onClick, disabled }: { children: ReactNode; className?: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </motion.button>
  );
}

// === COLLAPSE/EXPAND ===
// Smooth height animation for expanding sections

export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          className={`overflow-hidden ${className || ''}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// === SKELETON PULSE ===
// Animated skeleton placeholder that matches content layout

export function Skeleton({ className, width, height }: { className?: string; width?: string; height?: string }) {
  return (
    <motion.div
      className={`rounded-md bg-muted ${className || ''}`}
      style={{ width, height }}
      animate={{ opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton width="32px" height="32px" className="rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton height="14px" width="60%" />
          <Skeleton height="10px" width="40%" />
        </div>
      </div>
      <Skeleton height="10px" width="90%" />
      <Skeleton height="10px" width="70%" />
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// === PROGRESS NARRATION ===
// Shows step-by-step processing with typewriter effect

interface NarrationStep { label: string; status: 'pending' | 'running' | 'complete'; }

export function ProgressNarration({ steps, className }: { steps: NarrationStep[]; className?: string }) {
  return (
    <div className={`space-y-2 ${className || ''}`}>
      {steps.map((step, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.3, duration: 0.3 }}
          className="flex items-center gap-2 text-xs"
        >
          {step.status === 'running' && (
            <motion.div
              className="w-2 h-2 rounded-full bg-primary"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
          {step.status === 'complete' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-2 h-2 rounded-full bg-claude-green"
            />
          )}
          {step.status === 'pending' && (
            <div className="w-2 h-2 rounded-full bg-muted" />
          )}
          <span className={step.status === 'running' ? 'text-foreground font-medium' : step.status === 'complete' ? 'text-muted-foreground' : 'text-muted-foreground/50'}>
            {step.label}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

// === PULSE INDICATOR ===
// Subtle pulse for background activity

export function PulseIndicator({ active, color = 'bg-primary', size = 'w-2 h-2' }: { active: boolean; color?: string; size?: string }) {
  return (
    <div className="relative">
      <div className={`${size} rounded-full ${color}`} />
      {active && (
        <motion.div
          className={`absolute inset-0 ${size} rounded-full ${color}`}
          animate={{ scale: [1, 2, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  );
}

// === DISMISS ANIMATION ===
// For approval cards sliding away

export function DismissCard({ children, onDismiss, direction = 'left', className }: { children: ReactNode; onDismiss?: () => void; direction?: 'left' | 'right'; className?: string }) {
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = () => {
    setDismissed(true);
    setTimeout(() => onDismiss?.(), 300);
  };

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 1, x: 0, height: 'auto' }}
          exit={{
            opacity: 0,
            x: direction === 'left' ? -100 : 100,
            height: 0,
            marginBottom: 0,
            paddingTop: 0,
            paddingBottom: 0,
          }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className={className}
        >
          {typeof children === 'function' ? (children as (dismiss: () => void) => ReactNode)(handleDismiss) : children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// === SOURCE BADGE ===
// Animated badge showing which source contributed data

const sourceColors: Record<string, string> = {
  jira: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  email: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  meeting: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  notion: 'bg-stone-100 text-stone-700 dark:bg-stone-900/30 dark:text-stone-300',
  slack: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  calendar: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  screen: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  agent: 'bg-primary/10 text-primary',
};

export function SourceBadge({ source, className }: { source: string; className?: string }) {
  const colorClass = sourceColors[source.toLowerCase()] || sourceColors.agent;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${colorClass} ${className || ''}`}
    >
      {source}
    </motion.span>
  );
}

// === CONFIDENCE BAR (animated) ===

export function ConfidenceBar({ value, className, showLabel = true }: { value: number; className?: string; showLabel?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 ${className || ''}`}>
      <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${value * 100}%` }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
        />
      </div>
      {showLabel && (
        <AnimatedPercentage value={Math.round(value * 100)} duration={0.8} className="text-[10px] font-mono text-muted-foreground" />
      )}
    </div>
  );
}

// Re-export framer-motion essentials
export { motion, AnimatePresence };
