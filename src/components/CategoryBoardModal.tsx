import { motion } from 'framer-motion';
import { X } from 'lucide-react';

import type { Category, Player } from '../types';
import { Button } from './Button';
import { JudgingLogPanel } from './JudgingLogPanel';

interface CategoryBoardModalProps {
  category: Category;
  players: Player[];
  onClose: () => void;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
}

export const CategoryBoardModal = ({ category, players, onClose, primaryActionLabel, onPrimaryAction }: CategoryBoardModalProps) => {
  const showJudgingLog = Boolean(category.capturedBy && category.history.length > 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 px-6 py-6 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.94, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 20 }}
        className="mx-auto my-auto flex w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border-2 border-white bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b-2 border-gray-100 px-5 py-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-gray-400">{showJudgingLog ? 'Judgment Log' : 'Preview'}</p>
            <h3 className="mt-1 whitespace-pre-wrap break-words text-xl font-black text-gray-800">{category.name}</h3>
          </div>

          <button onClick={onClose} className="rounded-full p-2 text-gray-400 transition-all hover:bg-gray-200 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {showJudgingLog ? (
            <JudgingLogPanel className="w-full" category={category} logs={category.history} players={players} />
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-gray-400">Description</p>
              <p className="whitespace-pre-wrap break-words font-bold leading-relaxed text-gray-700">{category.description}</p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-3 border-t-2 border-gray-100 px-5 py-5">
          <Button onClick={onPrimaryAction ?? onClose}>{primaryActionLabel ?? 'Close'}</Button>
        </div>
      </motion.div>
    </motion.div>
  );
};