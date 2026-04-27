import { motion } from 'framer-motion';
import { Play } from 'lucide-react';

import { BOARD_STEP, BOARD_SWAY, BOARD_TOP_OFFSET, BOARD_WIDTH } from '../lib/gameShared';
import type { Category, Player } from '../types';
import { cn } from './Button';

interface BoardCategoryCardProps {
  category: Category;
  index: number;
  captor?: Player | null;
  previewingPlayers?: Array<Pick<Player, 'id' | 'color'>>;
  ownerPillLabel: string;
  statusText: string;
  onClick: () => void;
}

export const BoardCategoryCard = ({
  category,
  index,
  captor = null,
  previewingPlayers = [],
  ownerPillLabel,
  statusText,
  onClick,
}: BoardCategoryCardProps) => {
  const top = BOARD_TOP_OFFSET + index * BOARD_STEP;
  const yRelative = top - BOARD_TOP_OFFSET;
  const left = BOARD_WIDTH / 2 + Math.cos((yRelative * Math.PI) / BOARD_STEP) * BOARD_SWAY;

  return (
    <div
      className="absolute z-10"
      style={{
        top,
        left,
        transform: 'translate(-50%, -50%)',
        width: '15rem',
      }}
    >
      <motion.button
        type="button"
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: index * 0.05 }}
        className={cn(
          'group w-full rounded-[2rem] bg-white px-4 py-3 text-left transition-all duration-150',
          'border-2',
          previewingPlayers.length === 2 ? 'border-duo-purple shadow-[-4px_4px_0px_0px_#ce82ff]' :
          previewingPlayers.length === 1 ? 'border-gray-300 shadow-[-4px_4px_0px_0px_#d1d5db]' :
          'border-gray-200 shadow-[-4px_4px_0px_0px_#e5e7eb]',
          !category.capturedBy && 'hover:border-duo-blue hover:shadow-[-4px_4px_0px_0px_#1cb0f6] active:shadow-[0_0_0_0_transparent] active:translate-y-[4px] active:-translate-x-[4px]',
          category.capturedBy && 'bg-white/90 hover:border-gray-300 hover:shadow-[-4px_4px_0px_0px_rgba(255,255,255,0.95)]',
        )}
        style={{
          backgroundColor: captor ? `${captor.color}14` : undefined,
        }}
        onClick={onClick}
      >
        {previewingPlayers.length > 0 && (
          <div className="mb-2 flex items-center gap-1">
            {previewingPlayers.map((player) => (
              <span key={player.id} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: player.color }} />
            ))}
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">
              {previewingPlayers.length === 2 ? 'Both Looking' : 'Previewing'}
            </span>
          </div>
        )}

        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-lg font-black shadow-sm transition-all duration-150',
              captor ? 'border-white text-white' : 'border-gray-200 bg-gray-50 text-gray-400',
              captor && 'shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_6px_0_rgba(0,0,0,0.14)] group-active:translate-y-[6px] group-active:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0px_0_rgba(0,0,0,0)]',
            )}
            style={captor ? { background: `linear-gradient(180deg, rgba(255,255,255,0.24) 0%, ${captor.color} 26%, ${captor.color} 74%, rgba(0,0,0,0.18) 100%)` } : undefined}
          >
            {captor ? <Play className="h-5 w-5 fill-current" /> : index + 1}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black text-gray-800">{category.name || 'Empty Category Slot'}</p>
            <p className="mt-1 line-clamp-2 text-xs font-bold leading-relaxed text-gray-500">
              {category.description || 'Waiting for a worthy premise.'}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className={cn('rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em]', captor ? 'bg-white/75 text-gray-700' : 'bg-gray-100 text-gray-500')}>
            {ownerPillLabel}
          </span>

          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">{statusText}</span>
        </div>
      </motion.button>
    </div>
  );
};