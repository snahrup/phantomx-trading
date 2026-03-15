'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Microscope, Swords, ShieldAlert, CheckCircle2, Crosshair,
} from 'lucide-react';

const WAVES = [
  { label: 'Research', icon: Microscope },
  { label: 'Debate', icon: Swords },
  { label: 'Risk', icon: ShieldAlert },
  { label: 'Approval', icon: CheckCircle2 },
  { label: 'Execution', icon: Crosshair },
] as const;

export type WaveStatus = 'pending' | 'active' | 'completed';

interface WaveProgressBarProps {
  /** Status array for waves 1-5 */
  statuses: WaveStatus[];
  /** Optional: which wave is selected (0-indexed) */
  activeIndex?: number;
  /** Callback when a completed/active wave step is clicked */
  onWaveClick?: (index: number) => void;
  className?: string;
}

export default function WaveProgressBar({ statuses, activeIndex, onWaveClick, className }: WaveProgressBarProps) {
  return (
    <div className={cn('flex items-center w-full', className)}>
      {WAVES.map((wave, i) => {
        const status = statuses[i] ?? 'pending';
        const Icon = wave.icon;
        const isSelected = activeIndex === i;

        return (
          <div key={wave.label} className="flex items-center flex-1 last:flex-initial">
            {/* Step node */}
            <button
              onClick={() => status !== 'pending' && onWaveClick?.(i)}
              disabled={status === 'pending'}
              className={cn(
                'relative flex flex-col items-center gap-1.5 group',
                status !== 'pending' && 'cursor-pointer',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {/* Circle */}
              <div className="relative">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors duration-200',
                    status === 'completed' && 'bg-claude-green border-claude-green text-white',
                    status === 'active' && 'border-claude-green bg-transparent',
                    status === 'pending' && 'border-border bg-transparent',
                    isSelected && status !== 'pending' && 'ring-2 ring-claude-green/30 ring-offset-2 ring-offset-card',
                  )}
                >
                  {status === 'active' && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-claude-green"
                      animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                  <Icon
                    className={cn(
                      'w-3.5 h-3.5',
                      status === 'completed' && 'text-white',
                      status === 'active' && 'text-claude-green',
                      status === 'pending' && 'text-muted-foreground',
                    )}
                  />
                </div>
              </div>

              {/* Label */}
              <span
                className={cn(
                  'text-[10px] font-medium tracking-wide uppercase whitespace-nowrap',
                  status === 'completed' && 'text-claude-green',
                  status === 'active' && 'text-claude-green',
                  status === 'pending' && 'text-muted-foreground',
                )}
              >
                {wave.label}
              </span>
            </button>

            {/* Connecting line */}
            {i < WAVES.length - 1 && (
              <div className="flex-1 mx-2 h-0.5 rounded-full overflow-hidden bg-border">
                <motion.div
                  className="h-full bg-claude-green"
                  initial={{ width: '0%' }}
                  animate={{
                    width: status === 'completed' ? '100%' : status === 'active' ? '50%' : '0%',
                  }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
