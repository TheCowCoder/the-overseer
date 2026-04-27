import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Info, LoaderCircle, Play, Trophy, WifiOff, X } from 'lucide-react';

import { Button, cn } from './components/Button';
import { Header } from './components/Header';
import { JudgingLogPanel } from './components/JudgingLogPanel';
import { DEFAULT_MODEL_ID, MODEL_OPTIONS, isValidModelId } from '../shared/modelOptions.js';
import { BOARD_STEP, BOARD_TOP_OFFSET, BOARD_WIDTH, buildBoardPath } from './lib/gameShared';
import { socket } from './lib/socket';
import type { Category, MatchView, PlayerId } from './types';

const COLORS = ['#58cc02', '#1cb0f6', '#ff4b4b', '#ffc800', '#ce82ff'] as const;
const SESSION_STORAGE_KEY = 'overseer-session-id';
const PROFILE_STORAGE_KEY = 'overseer-profile';

interface HomeProfile {
  name: string;
  color: string;
}

interface OnlineMultiplayerAppProps {
  onBack?: () => void;
}

const readStoredProfile = (): HomeProfile => {
  if (typeof window === 'undefined') {
    return { name: '', color: COLORS[0] };
  }

  try {
    const rawValue = window.localStorage.getItem(PROFILE_STORAGE_KEY);

    if (!rawValue) {
      return { name: '', color: COLORS[0] };
    }

    const parsedValue = JSON.parse(rawValue) as Partial<HomeProfile>;
    return {
      name: typeof parsedValue.name === 'string' ? parsedValue.name : '',
      color:
        typeof parsedValue.color === 'string' && COLORS.includes(parsedValue.color as (typeof COLORS)[number])
          ? parsedValue.color
          : COLORS[0],
    };
  } catch {
    return { name: '', color: COLORS[0] };
  }
};

const readStoredSessionId = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(SESSION_STORAGE_KEY) ?? '';
};

const ownerLabel = (category: Category, players: MatchView['players']) => {
  if (category.ownerId === 'ai') {
    return 'AI Slot';
  }

  return players.find((player) => player.id === category.ownerId)?.name ?? 'Player Slot';
};

export default function App({ onBack }: OnlineMultiplayerAppProps) {
  const [profile, setProfile] = useState<HomeProfile>(readStoredProfile);
  const [sessionId, setSessionId] = useState<string>(readStoredSessionId);
  const [queueing, setQueueing] = useState(false);
  const [matchView, setMatchView] = useState<MatchView | null>(null);
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [error, setError] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryNameInput, setCategoryNameInput] = useState('');
  const [categoryDescriptionInput, setCategoryDescriptionInput] = useState('');
  const [previewCategoryId, setPreviewCategoryId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [selectedModelId, setSelectedModelId] = useState(DEFAULT_MODEL_ID);

  const typingTimeoutRef = useRef<number | null>(null);
  const categoryTypingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (!sessionId) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }, [sessionId]);

  useEffect(() => {
    socket.connect();

    const handleConnect = () => {
      setSocketConnected(true);

      if (sessionId) {
        socket.emit('player:resume', { sessionId });
      }
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
    };

    const handleSessionReady = ({ sessionId: nextSessionId }: { sessionId: string }) => {
      setSessionId(nextSessionId);
    };

    const handleQueueJoined = () => {
      setQueueing(true);
      setError(null);
    };

    const handleQueueLeft = () => {
      setQueueing(false);
    };

    const handleMatchUpdate = (nextMatchView: MatchView) => {
      setMatchView(nextMatchView);
      if (isValidModelId(nextMatchView.modelId)) {
        setSelectedModelId(nextMatchView.modelId);
      }
      setQueueing(false);
      setError(null);
    };

    const handleMatchError = ({ message }: { message: string }) => {
      setError(message);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('session:ready', handleSessionReady);
    socket.on('queue:joined', handleQueueJoined);
    socket.on('queue:left', handleQueueLeft);
    socket.on('match:update', handleMatchUpdate);
    socket.on('match:error', handleMatchError);

    if (socket.connected && sessionId) {
      socket.emit('player:resume', { sessionId });
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('session:ready', handleSessionReady);
      socket.off('queue:joined', handleQueueJoined);
      socket.off('queue:left', handleQueueLeft);
      socket.off('match:update', handleMatchUpdate);
      socket.off('match:error', handleMatchError);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!matchView) {
      setDraft('');
      setPreviewCategoryId(null);
      setEditingCategoryId(null);
      return;
    }

    if (matchView.phase !== 'category_review' && matchView.phase !== 'battle_path') {
      setPreviewCategoryId(null);
    }

    if (matchView.phase !== 'category_setup') {
      setEditingCategoryId(null);
      socket.emit('category:typing', { isTyping: false });
    }

    if (matchView.phase === 'prompt_entry') {
      setDraft(matchView.promptDraft ?? '');
      return;
    }

    setDraft('');
  }, [matchView?.phase, matchView?.activeCategoryId, matchView?.promptDraft]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }

      if (categoryTypingTimeoutRef.current) {
        window.clearTimeout(categoryTypingTimeoutRef.current);
      }
    };
  }, []);

  const categories = matchView?.categories ?? [];
  const players = matchView?.players ?? [];
  const selfId = matchView?.selfId ?? 'player_1';
  const selfPlayer = players.find((player) => player.id === selfId) ?? null;
  const nextPlayer = players.find((player) => player.id === matchView?.activePlayer) ?? null;
  const activeCategory = categories.find((category) => category.id === matchView?.activeCategoryId) ?? null;
  const previewCategory = categories.find((category) => category.id === previewCategoryId) ?? null;
  const editingCategory = categories.find((category) => category.id === editingCategoryId) ?? null;
  const currentResultLogs = activeCategory && matchView?.currentResultLog ? [matchView.currentResultLog] : [];

  useEffect(() => {
    if (selfPlayer && selfPlayer.color !== profile.color) {
      setProfile((currentProfile) => ({ ...currentProfile, color: selfPlayer.color }));
    }
  }, [profile.color, selfPlayer]);

  const boardHeight = Math.max(500, BOARD_TOP_OFFSET + categories.length * BOARD_STEP + 120);
  const boardPath = useMemo(() => buildBoardPath(boardHeight), [boardHeight]);

  const lockedPlayerIds = useMemo(() => {
    if (!matchView) {
      return [] as PlayerId[];
    }

    if (matchView.phase === 'category_setup') {
      return matchView.categorySetupLockedPlayers;
    }

    if (matchView.phase === 'category_review') {
      return matchView.reviewLockedPlayers;
    }

    if (matchView.phase === 'prompt_entry' || matchView.phase === 'resolving') {
      return matchView.promptLockedPlayers;
    }

    if (matchView.phase === 'results') {
      return matchView.resultLockedPlayers;
    }

    return [] as PlayerId[];
  }, [matchView]);

  const spinnerPlayerIds = useMemo(() => {
    if (!matchView) {
      return [] as PlayerId[];
    }

    if (matchView.phase === 'battle_path') {
      return [matchView.activePlayer];
    }

    if (matchView.phase === 'category_setup') {
      return matchView.categoryTypingPlayers;
    }

    if (matchView.phase === 'prompt_entry') {
      return matchView.typingPlayers;
    }

    if (matchView.phase === 'resolving') {
      return players.map((player) => player.id);
    }

    return [] as PlayerId[];
  }, [matchView, players]);

  const disconnectedPlayerIds = players.filter((player) => !player.connected).map((player) => player.id);

  const centerLabel = useMemo(() => {
    if (!matchView) {
      return 'Online';
    }

    switch (matchView.phase) {
      case 'category_setup':
        return 'Category Forge';
      case 'category_review':
        return 'Board Review';
      case 'battle_path':
        return 'Pick Category';
      case 'prompt_entry':
        return 'Live Round';
      case 'resolving':
        return 'Judging';
      case 'results':
        return 'Results';
      case 'win':
        return 'Crowned';
      default:
        return 'Online';
    }
  }, [matchView]);

  const openEditor = (category: Category) => {
    if (!matchView || matchView.phase !== 'category_setup') {
      return;
    }

    if (category.ownerId !== selfId || matchView.categorySetupLockedPlayers.includes(selfId)) {
      return;
    }

    setEditingCategoryId(category.id);
    setCategoryNameInput(category.name);
    setCategoryDescriptionInput(category.description);
  };

  const closeEditor = () => {
    setEditingCategoryId(null);
    socket.emit('category:typing', { isTyping: false });

    if (categoryTypingTimeoutRef.current) {
      window.clearTimeout(categoryTypingTimeoutRef.current);
    }
  };

  const closePreview = () => {
    setPreviewCategoryId(null);

    if (matchView && (matchView.phase === 'category_review' || matchView.phase === 'battle_path')) {
      socket.emit('category:preview', { categoryId: null });
    }
  };

  const openPreview = (categoryId: string) => {
    setPreviewCategoryId(categoryId);

    if (matchView && (matchView.phase === 'category_review' || matchView.phase === 'battle_path')) {
      socket.emit('category:preview', { categoryId });
    }
  };

  const handleQueue = () => {
    const trimmedName = profile.name.trim();

    if (!trimmedName) {
      setError('Choose a username before entering the queue.');
      return;
    }

    setError(null);
    socket.connect();
    socket.emit('player:queue', {
      sessionId: sessionId || undefined,
      name: trimmedName,
      color: profile.color,
      modelId: selectedModelId,
    });
  };

  const handleModelChange = (modelId: string) => {
    if (!isValidModelId(modelId)) {
      return;
    }

    setSelectedModelId(modelId);

    if (matchView) {
      socket.emit('match:model', { modelId });
    }
  };

  const handleLeaveQueue = () => {
    socket.emit('queue:leave');
    setQueueing(false);
  };

  const handleSaveCategory = () => {
    if (!editingCategoryId) {
      return;
    }

    socket.emit('category:update', {
      categoryId: editingCategoryId,
      name: categoryNameInput,
      description: categoryDescriptionInput,
    });
    socket.emit('category:typing', { isTyping: false });
    closeEditor();
  };

  const handleCategoryTyping = (nextName: string, nextDescription: string) => {
    const isTyping = nextName.trim().length > 0 || nextDescription.trim().length > 0;

    socket.emit('category:typing', { isTyping });

    if (categoryTypingTimeoutRef.current) {
      window.clearTimeout(categoryTypingTimeoutRef.current);
    }

    if (!isTyping) {
      return;
    }

    categoryTypingTimeoutRef.current = window.setTimeout(() => {
      socket.emit('category:typing', { isTyping: false });
    }, 900);
  };

  const handleDraftChange = (nextValue: string) => {
    setDraft(nextValue);
    socket.emit('prompt:update', { draft: nextValue });
    socket.emit('prompt:typing', { isTyping: nextValue.trim().length > 0 });

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }

    if (nextValue.trim().length === 0) {
      return;
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      socket.emit('prompt:typing', { isTyping: false });
    }, 900);
  };

  const handleLockPrompt = () => {
    socket.emit('prompt:update', { draft });
    socket.emit('prompt:typing', { isTyping: false });
    socket.emit('prompt:lock');
  };

  const renderSystemBanner = () => {
    const bannerText = error ?? matchView?.systemMessage ?? (!socketConnected ? 'Trying to reconnect to the match server.' : null);

    if (!bannerText) {
      return null;
    }

    return (
      <div
        className={cn(
          'mb-4 flex items-start gap-3 rounded-[1.75rem] border-2 p-4 text-sm font-bold shadow-sm',
          error ? 'border-red-200 bg-red-50 text-red-600' : 'border-gray-200 bg-white text-gray-600',
        )}
      >
        {error ? <WifiOff className="mt-0.5 h-5 w-5 shrink-0" /> : <Info className="mt-0.5 h-5 w-5 shrink-0 text-duo-purple" />}
        <span className="leading-relaxed">{bannerText}</span>
      </div>
    );
  };

  const renderCategoryCard = (category: Category, index: number) => {
    const top = BOARD_TOP_OFFSET + index * BOARD_STEP;
    const yRelative = top - BOARD_TOP_OFFSET;
    const left = BOARD_WIDTH / 2 + Math.cos((yRelative * Math.PI) / BOARD_STEP) * BOARD_SWAY;
    
    const ownerPlayer = category.ownerId === 'ai' ? null : players.find((player) => player.id === category.ownerId) ?? null;
    const captor = players.find((player) => player.id === category.capturedBy) ?? null;
    const previewingPlayers = players.filter((player) => matchView?.previewSelections[player.id] === category.id);
    const canChooseCategory = matchView?.phase === 'battle_path' && selfId === matchView.activePlayer && !category.capturedBy;

    return (
      <motion.button
        key={category.id}
        type="button"
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: index * 0.05 }}
        className={cn(
          'absolute -translate-x-1/2 -translate-y-1/2 rounded-[2rem] bg-white px-4 py-3 text-left transition-all duration-200',
          previewingPlayers.length === 2 ? 'border-2 border-duo-purple shadow-[-4px_4px_0px_0px_#ce82ff]' :
          previewingPlayers.length === 1 ? 'border-2 border-gray-300 shadow-[-4px_4px_0px_0px_#d1d5db]' :
          'border-2 border-gray-200 shadow-[-4px_4px_0px_0px_#e5e7eb]',
          !category.capturedBy && 'hover:border-duo-blue hover:shadow-[-4px_4px_0px_0px_#1cb0f6] active:shadow-[0_0_0_0_transparent] active:mt-[4px] active:-ml-[4px]',
          category.capturedBy && 'border-transparent shadow-none opacity-80'
        )}
        style={{
          top,
          left,
          width: '15rem',
          backgroundColor: captor ? `${captor.color}14` : undefined,
        }}
        onClick={() => openPreview(category.id)}
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
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-lg font-black shadow-sm',
              captor ? 'border-white text-white' : 'border-gray-200 bg-gray-50 text-gray-400',
            )}
            style={captor ? { backgroundColor: captor.color } : undefined}
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
          <span
            className={cn(
              'rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em]',
              captor ? 'bg-white/75 text-gray-700' : ownerPlayer ? 'text-white' : 'bg-gray-100 text-gray-500',
            )}
            style={ownerPlayer && !captor ? { backgroundColor: ownerPlayer.color } : undefined}
          >
            {captor ? `${captor.name} owns it` : ownerLabel(category, players)}
          </span>

          {matchView?.phase === 'battle_path' && (
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
              {canChooseCategory ? 'Choose' : category.capturedBy ? 'Captured' : 'Preview'}
            </span>
          )}
        </div>
      </motion.button>
    );
  };

  const renderHomeScreen = () => (
    <motion.div
      key="HOME"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-full flex-col justify-center gap-6 py-10"
    >
      {onBack && !queueing && (
        <div className="flex justify-start">
          <Button variant="ghost" className="w-auto px-4 py-3 text-[10px] tracking-[0.22em]" onClick={onBack}>
            Back
          </Button>
        </div>
      )}

      <div className="space-y-3 text-center">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-gray-400">The Overseer Online</p>
        <h1 className="text-5xl font-black leading-none text-gray-900">Queue For The Throne</h1>
        <p className="mx-auto max-w-sm text-sm font-bold leading-relaxed text-gray-500">
          Set your name, claim a color, and enter the online queue. When two players are found, the server builds a live match and keeps both screens in sync.
        </p>
      </div>

      {renderSystemBanner()}

      <div className="rounded-[2rem] border-2 border-gray-100 bg-white p-5 shadow-sm">
        <label className="ml-2 block text-xs font-black uppercase tracking-[0.24em] text-gray-400">Username</label>
        <input
          type="text"
          maxLength={16}
          value={profile.name}
          onChange={(event) => setProfile((currentProfile) => ({ ...currentProfile, name: event.target.value }))}
          placeholder="Uncle Ray"
          className="mt-2 w-full rounded-2xl border-2 border-gray-200 bg-gray-50 p-4 text-lg font-bold text-gray-800 outline-none transition-all focus:border-duo-blue focus:bg-white"
        />

        <div className="mt-5">
          <p className="ml-2 text-xs font-black uppercase tracking-[0.24em] text-gray-400">Color</p>
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            {COLORS.map((color) => {
              const isSelected = profile.color === color;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setProfile((currentProfile) => ({ ...currentProfile, color }))}
                  className={cn(
                    'relative h-14 w-14 rounded-full border-4 transition-all',
                    isSelected ? 'scale-110 border-gray-900' : 'border-transparent hover:scale-105',
                  )}
                  style={{ backgroundColor: color }}
                >
                  {isSelected && <Check className="absolute inset-0 m-auto h-6 w-6 text-white" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Button onClick={handleQueue} disabled={queueing || profile.name.trim().length === 0}>
          {queueing ? 'Searching For Opponent' : 'Play Online'}
        </Button>

        {queueing && (
          <Button variant="ghost" className="border-2 border-gray-200 bg-white" onClick={handleLeaveQueue}>
            Leave Queue
          </Button>
        )}
      </div>

      {queueing && (
        <div className="flex items-center justify-center gap-3 rounded-[1.75rem] border-2 border-gray-100 bg-white px-4 py-4 text-sm font-bold text-gray-500 shadow-sm">
          <LoaderCircle className="h-5 w-5 animate-spin text-duo-purple" />
          Waiting for another player to enter the queue.
        </div>
      )}
    </motion.div>
  );

  const renderCategorySetup = () => (
    <motion.div key="CATEGORY_SETUP" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-full flex-col">
      {renderSystemBanner()}

      <div className="mb-4 shrink-0 text-center">
        <h2 className="text-3xl font-black text-gray-800">Build The Board</h2>
        <p className="mt-2 text-sm font-bold text-gray-500">Top two slots belong to player one. Bottom two belong to player two. Lock in to summon the fifth category.</p>
      </div>

      <div className="space-y-3 pb-6">
        {categories.map((category) => {
          const categoryOwner = category.ownerId === 'ai' ? null : players.find((player) => player.id === category.ownerId) ?? null;
          const isEditable = category.ownerId === selfId && !matchView?.categorySetupLockedPlayers.includes(selfId);
          const isLockedSlot = category.ownerId !== 'ai' && matchView?.categorySetupLockedPlayers.includes(category.ownerId);

          return (
            <button
              key={category.id}
              type="button"
              onClick={() => isEditable && openEditor(category)}
              className={cn(
                'w-full rounded-[2rem] border-2 bg-white p-5 text-left shadow-sm transition-all',
                isEditable && 'hover:-translate-y-0.5 hover:shadow-md',
                category.ownerId === 'ai' && 'border-dashed border-gray-200 bg-gray-50',
              )}
              style={categoryOwner ? { borderColor: `${categoryOwner.color}55`, backgroundColor: `${categoryOwner.color}12` } : undefined}
              disabled={!isEditable}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
                    {category.ownerId === 'ai' ? 'Overseer Slot' : `${ownerLabel(category, players)} Slot`}
                  </p>
                  <h3 className="mt-2 break-words text-xl font-black text-gray-800">
                    {category.name || (category.ownerId === 'ai' ? 'Awaiting the fifth category' : 'Tap to write a title')}
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed text-gray-500">
                    {category.description || (category.ownerId === 'ai'
                      ? 'The AI category appears after both players lock in their two slots.'
                      : 'Write a short category that can hold a full round.')}
                  </p>
                </div>

                {isLockedSlot && (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                    Locked
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-auto shrink-0">
        <Button onClick={() => socket.emit('category:lock')} disabled={matchView?.categorySetupLockedPlayers.includes(selfId)}>
          {matchView?.categorySetupLockedPlayers.includes(selfId) ? 'Categories Locked' : 'Lock In Categories'}
        </Button>
      </div>
    </motion.div>
  );

  const renderBoard = (phase: 'category_review' | 'battle_path') => (
    <motion.div key={phase} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-full flex-col">
      {renderSystemBanner()}

      <div className="shrink-0 pb-4 text-center">
        <h2 className="text-3xl font-black text-gray-800">{phase === 'category_review' ? 'Review The Board' : 'Pick A Category'}</h2>
        <p className="mt-2 text-sm font-bold text-gray-500">
          {phase === 'category_review'
            ? 'Preview any category. When both players are satisfied, lock in and begin the match.'
            : selfId === matchView?.activePlayer
              ? 'Choose an uncaptured category. Both players will be pulled into the same writing screen.'
              : `${nextPlayer?.name ?? 'Your opponent'} is choosing the next category.`}
        </p>
      </div>

      <div className="pb-8 relative">
        <div className="relative mx-auto w-full max-w-[20rem]" style={{ height: boardHeight }}>
          <svg className="pointer-events-none absolute left-0 top-0 h-full w-full text-gray-300" viewBox={`0 0 ${BOARD_WIDTH} ${boardHeight}`} preserveAspectRatio="none">
            <path d={boardPath} fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="10 10" />
          </svg>

          {categories.map((category, index) => renderCategoryCard(category, index))}
        </div>
      </div>

      {phase === 'category_review' && (
        <div className="shrink-0 pt-4">
          <Button onClick={() => socket.emit('review:lock')} disabled={matchView?.reviewLockedPlayers.includes(selfId)}>
            {matchView?.reviewLockedPlayers.includes(selfId) ? 'Ready Locked' : 'Start Match'}
          </Button>
        </div>
      )}
    </motion.div>
  );

  const renderPromptEntry = () => {
    const selfLocked = matchView?.promptLockedPlayers.includes(selfId) ?? false;

    if (!activeCategory) {
      return null;
    }

    return (
      <motion.div key="PROMPT_ENTRY" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-full flex-col">
        {renderSystemBanner()}

        <div className="rounded-[2rem] border-2 border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-gray-400">Live Category</p>
          <h3 className="mt-2 break-words text-2xl font-black text-gray-800">{activeCategory.name}</h3>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed text-gray-500">{activeCategory.description}</p>
          {activeCategory.isTie && (
            <div className="mt-4 rounded-[1.25rem] bg-duo-red/10 px-4 py-3 text-sm font-bold text-duo-red">
              Tie-breaker round. Build on the last exchange and finish the capture.
            </div>
          )}
        </div>

        <div className="mt-4 flex-1 rounded-[2rem] border-2 border-gray-200 bg-white shadow-inner">
          <textarea
            className="h-full min-h-[18rem] w-full resize-none rounded-[2rem] bg-transparent p-5 text-lg font-bold text-gray-800 outline-none"
            placeholder="Weave your lies..."
            value={draft}
            onChange={(event) => handleDraftChange(event.target.value)}
            disabled={selfLocked}
            spellCheck
          />
        </div>

        <div className="mt-4 shrink-0">
          <Button onClick={handleLockPrompt} disabled={selfLocked || draft.trim().length === 0}>
            {selfLocked ? 'Locked In' : 'Lock In Prompt'}
          </Button>
        </div>
      </motion.div>
    );
  };

  const renderResolving = () => (
    <motion.div key="RESOLVING" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-full flex-col items-center justify-center gap-6 text-center">
      <div className="relative h-24 w-24">
        <div className="absolute inset-0 rounded-full border-8 border-duo-purple/30" />
        <div className="absolute inset-0 rounded-full border-8 border-duo-purple border-t-transparent animate-spin" />
      </div>
      <div className="space-y-2">
        <h2 className="text-3xl font-black text-gray-800">The Overseer Judges...</h2>
        <p className="text-sm font-bold text-gray-500">Both prompts are locked. The server is resolving the round now.</p>
      </div>
    </motion.div>
  );

  const renderResults = () => {
    if (!activeCategory || currentResultLogs.length === 0) {
      return null;
    }

    return (
      <motion.div key="RESULTS" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-full flex-col overflow-hidden">
        {renderSystemBanner()}

        <div className="shrink-0 pb-4 text-center">
          <h2 className="text-3xl font-black text-gray-800">Judgment</h2>
          <p className="mt-2 text-sm font-bold text-gray-500">Review the ruling, then both players continue.</p>
        </div>

        <div className="duo-scrollbar flex-1 overflow-y-auto pb-6">
          <JudgingLogPanel className="w-full" category={activeCategory} logs={currentResultLogs} players={players} />
        </div>

        <div className="shrink-0 border-t-2 border-gray-100 bg-duo-gray/90 pt-4">
          <Button onClick={() => socket.emit('results:continue')} disabled={matchView?.resultLockedPlayers.includes(selfId)}>
            {matchView?.resultLockedPlayers.includes(selfId) ? 'Continue Locked' : 'Continue'}
          </Button>
        </div>
      </motion.div>
    );
  };

  const renderWinScreen = () => {
    const winningPlayer = players.find((player) => player.id === matchView?.winnerId) ?? null;

    return (
      <motion.div key="WIN" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-full flex-col overflow-hidden">
        {renderSystemBanner()}

        <div className="mb-6 shrink-0 text-center">
          <Trophy className="mx-auto h-16 w-16 text-duo-yellow" />
          <h1 className="mt-2 text-4xl font-black text-gray-800">Game Over</h1>
          <p className="mt-2 text-sm font-bold text-gray-500">
            {winningPlayer ? `${winningPlayer.name} takes the crown.` : 'The match is over.'}
          </p>
        </div>

        <div className="duo-scrollbar flex-1 overflow-y-auto space-y-8 pb-10">
          {categories.map((category, index) => (
            <section key={category.id} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-black uppercase tracking-[0.22em] text-gray-400">Conquest {index + 1}</span>
                {category.capturedBy && (
                  <div
                    className="h-9 w-9 rounded-full border-2 border-white shadow-md"
                    style={{ backgroundColor: players.find((player) => player.id === category.capturedBy)?.color }}
                  />
                )}
              </div>
              <JudgingLogPanel className="w-full" category={category} logs={category.history} players={players} />
            </section>
          ))}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="relative mx-auto flex h-screen w-full max-w-md flex-col overflow-x-hidden bg-duo-gray shadow-2xl md:mt-[2.5vh] md:h-[95vh] md:rounded-3xl">
      {matchView && (
        <Header
          players={players}
          spinnerPlayerIds={spinnerPlayerIds}
          lockedPlayerIds={lockedPlayerIds}
          disconnectedPlayerIds={disconnectedPlayerIds}
          centerLabel={centerLabel}
          modelOptions={MODEL_OPTIONS}
          selectedModelId={selectedModelId}
          onModelChange={handleModelChange}
        />
      )}

      <main className={cn('relative z-10 flex-1 overflow-y-auto px-6 pb-6', matchView ? (matchView.phase === 'battle_path' ? 'pt-24' : 'pt-20') : 'pt-10')}>
        <AnimatePresence mode="wait">
          {!matchView && renderHomeScreen()}
          {matchView?.phase === 'category_setup' && renderCategorySetup()}
          {matchView?.phase === 'category_review' && renderBoard('category_review')}
          {matchView?.phase === 'battle_path' && renderBoard('battle_path')}
          {matchView?.phase === 'prompt_entry' && renderPromptEntry()}
          {matchView?.phase === 'resolving' && renderResolving()}
          {matchView?.phase === 'results' && renderResults()}
          {matchView?.phase === 'win' && renderWinScreen()}
        </AnimatePresence>
      </main>

      {previewCategory && matchView && (matchView.phase === 'category_review' || matchView.phase === 'battle_path') && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-900/40 px-6 py-6 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.94, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 20 }}
            className="mx-auto flex max-h-[calc(100vh-3rem)] w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border-2 border-white bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b-2 border-gray-100 bg-gray-50 px-4 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-gray-400">Preview</p>
                <h3 className="mt-1 truncate text-xl font-black text-gray-800">{previewCategory.name}</h3>
              </div>

              <button onClick={closePreview} className="rounded-full p-2 text-gray-400 transition-all hover:bg-gray-200 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="duo-scrollbar flex-1 space-y-4 overflow-y-auto p-5">
              <div className="rounded-[1.75rem] border-2 border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-gray-400">Description</p>
                <p className="mt-3 whitespace-pre-wrap break-words font-bold leading-relaxed text-gray-700">{previewCategory.description}</p>
              </div>
            </div>

            <div className="flex shrink-0 gap-3 border-t-2 border-gray-100 bg-white px-5 py-5">
              <Button variant="ghost" className="border-2 border-gray-200 bg-white" onClick={closePreview}>
                Back
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (matchView.phase === 'battle_path' && selfId === matchView.activePlayer && !previewCategory.capturedBy) {
                    socket.emit('battle:select', { categoryId: previewCategory.id });
                    setPreviewCategoryId(null);
                  } else {
                    closePreview();
                  }
                }}
              >
                Choose
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {editingCategory && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-6 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.94, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 20 }}
            className="flex w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border-2 border-white bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b-2 border-gray-100 bg-gray-50 px-4 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-gray-400">Edit Slot</p>
                <h3 className="mt-1 text-xl font-black text-gray-800">{ownerLabel(editingCategory, players)}</h3>
              </div>
              <button onClick={closeEditor} className="rounded-full p-2 text-gray-400 transition-all hover:bg-gray-200 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label className="ml-2 block text-xs font-black uppercase tracking-[0.22em] text-gray-400">Category Name</label>
                <input
                  type="text"
                  value={categoryNameInput}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setCategoryNameInput(nextName);
                    handleCategoryTyping(nextName, categoryDescriptionInput);
                  }}
                  className="mt-2 w-full rounded-2xl border-2 border-gray-200 bg-gray-50 p-4 font-bold text-gray-800 outline-none transition-all focus:border-duo-blue focus:bg-white"
                  placeholder="e.g. The Infinite Loop"
                />
              </div>

              <div>
                <label className="ml-2 block text-xs font-black uppercase tracking-[0.22em] text-gray-400">Description</label>
                <textarea
                  value={categoryDescriptionInput}
                  onChange={(event) => {
                    const nextDescription = event.target.value;
                    setCategoryDescriptionInput(nextDescription);
                    handleCategoryTyping(categoryNameInput, nextDescription);
                  }}
                  className="h-32 w-full resize-none rounded-2xl border-2 border-gray-200 bg-gray-50 p-4 font-bold text-gray-800 outline-none transition-all focus:border-duo-blue focus:bg-white"
                  placeholder="Set the scene..."
                />
              </div>
            </div>

            <div className="flex gap-3 border-t-2 border-gray-100 px-5 py-5">
              <Button variant="ghost" className="border-2 border-gray-200 bg-white" onClick={closeEditor}>
                Cancel
              </Button>
              <Button onClick={handleSaveCategory} disabled={categoryNameInput.trim().length === 0 || categoryDescriptionInput.trim().length === 0}>
                Save Slot
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}