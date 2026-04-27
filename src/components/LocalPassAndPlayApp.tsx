import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Info, LoaderCircle, Trophy, X } from 'lucide-react';

import { DEFAULT_MODEL_ID, MODEL_OPTIONS, isValidModelId } from '../../shared/modelOptions.js';
import { BoardCategoryCard } from './BoardCategoryCard';
import { Button, cn } from './Button';
import { CategoryBoardModal } from './CategoryBoardModal';
import { Header } from './Header';
import { JudgingLogPanel } from './JudgingLogPanel';
import { StickyStatusPill } from './StickyStatusPill';
import { BOARD_STEP, BOARD_TOP_OFFSET, BOARD_WIDTH, buildBoardPath, getCapturedScore, otherPlayerId, toConnectedMatchPlayers } from '../lib/gameShared';
import { fetchPrompt } from '../lib/prompts';
import type { Category, JudgingResult, MatchPlayer, Player, PlayerId, PromptLog } from '../types';

const COLORS = ['#58cc02', '#1cb0f6', '#ff4b4b', '#ffc800', '#ce82ff'] as const;

type LocalScreen =
  | 'ONBOARDING'
  | 'CATEGORY_CREATION'
  | 'BATTLE_PATH'
  | 'HANDOFF'
  | 'PROMPT_ENTRY'
  | 'RESOLVING'
  | 'RESULTS'
  | 'WIN';

interface LocalPassAndPlayAppProps {
  onBack?: () => void;
}

interface AICategoryResponse {
  category_name: string;
  category_description: string;
}

const createLocalCategory = ({
  slotIndex,
  name,
  description,
  createdBy,
}: {
  slotIndex: number;
  name: string;
  description: string;
  createdBy: PlayerId | 'ai';
}): Category => ({
  id: crypto.randomUUID(),
  slotIndex,
  name,
  description,
  createdBy,
  ownerId: createdBy,
  capturedBy: null,
  history: [],
  isTie: false,
});

const requestLocalApi = async <T,>(path: string, payload: Record<string, unknown>): Promise<T> => {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof data === 'object' && data && 'message' in data && typeof data.message === 'string'
        ? data.message
        : 'The Overseer could not finish that request.',
    );
  }

  return data as T;
};

export const LocalPassAndPlayApp = ({ onBack }: LocalPassAndPlayAppProps) => {
  const [screen, setScreen] = useState<LocalScreen>('ONBOARDING');
  const [setupPlayerId, setSetupPlayerId] = useState<PlayerId>('player_1');
  const [setupName, setSetupName] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectionPlayerId, setSelectionPlayerId] = useState<PlayerId>('player_1');
  const [promptPlayerId, setPromptPlayerId] = useState<PlayerId>('player_1');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<PlayerId, string>>({
    player_1: '',
    player_2: '',
  });
  const [currentResultLog, setCurrentResultLog] = useState<PromptLog | null>(null);
  const [winnerId, setWinnerId] = useState<PlayerId | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(DEFAULT_MODEL_ID);
  const [previewCategoryId, setPreviewCategoryId] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryNameInput, setCategoryNameInput] = useState('');
  const [categoryDescriptionInput, setCategoryDescriptionInput] = useState('');
  const [introText, setIntroText] = useState('');
  const [hasSeenIntro, setHasSeenIntro] = useState<Record<PlayerId, boolean>>({
    player_1: false,
    player_2: false,
  });
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptTypingPlayerIds, setPromptTypingPlayerIds] = useState<PlayerId[]>([]);
  const promptTypingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    fetchPrompt('ui_intro_message.md').then(setIntroText).catch(() => {
      setIntroText('The Overseer judges every round. Hand the phone over only when the screen tells you to.');
    });
  }, []);

  const boardHeight = Math.max(500, BOARD_TOP_OFFSET + categories.length * BOARD_STEP + 120);
  const boardPath = useMemo(() => buildBoardPath(boardHeight), [boardHeight]);

  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? null;
  const previewCategory = categories.find((category) => category.id === previewCategoryId) ?? null;
  const currentChooser = players.find((player) => player.id === selectionPlayerId) ?? null;
  const currentPromptPlayer = players.find((player) => player.id === promptPlayerId) ?? null;
  const resultsLogs = activeCategory && currentResultLog ? [currentResultLog] : [];
  const previewCategoryHasLog = Boolean(previewCategory?.capturedBy && previewCategory.history.length > 0);

  const headerPlayers = useMemo<MatchPlayer[]>(() => toConnectedMatchPlayers(players, categories), [categories, players]);

  const spinnerPlayerIds = useMemo(() => {
    if (screen === 'BATTLE_PATH') {
      return [selectionPlayerId];
    }

    if (screen === 'PROMPT_ENTRY') {
      return promptTypingPlayerIds;
    }

    if (screen === 'RESOLVING') {
      return players.map((player) => player.id);
    }

    return [] as PlayerId[];
  }, [players, promptTypingPlayerIds, screen, selectionPlayerId]);

  const centerLabel = useMemo(() => {
    switch (screen) {
      case 'CATEGORY_CREATION':
        return 'Forge Board';
      case 'BATTLE_PATH':
        return 'Pass & Play';
      case 'HANDOFF':
      case 'PROMPT_ENTRY':
        return 'Live Round';
      case 'RESOLVING':
        return 'Judging';
      case 'RESULTS':
        return 'Results';
      case 'WIN':
        return 'Crowned';
      default:
        return 'Pass & Play';
    }
  }, [screen]);

  const resetRoundState = () => {
    setDrafts({ player_1: '', player_2: '' });
    setActiveCategoryId(null);
    setCurrentResultLog(null);
    setPreviewCategoryId(null);
    setPromptPlayerId('player_1');
  };

  useEffect(() => {
    if (screen !== 'BATTLE_PATH') {
      setPreviewCategoryId(null);
    }

    if (screen !== 'PROMPT_ENTRY') {
      setPromptTypingPlayerIds([]);
    }
  }, [screen]);

  useEffect(() => {
    return () => {
      if (promptTypingTimeoutRef.current) {
        window.clearTimeout(promptTypingTimeoutRef.current);
      }
    };
  }, []);

  const handleOnboarding = (color: string) => {
    const trimmedName = setupName.trim();
    const fallbackName = setupPlayerId === 'player_1' ? 'Player 1' : 'Player 2';
    const nextPlayer: Player = {
      id: setupPlayerId,
      name: trimmedName || fallbackName,
      color,
    };

    setPlayers((currentPlayers) => [...currentPlayers, nextPlayer]);
    setSetupName('');
    setError(null);

    if (setupPlayerId === 'player_1') {
      setSetupPlayerId('player_2');
      return;
    }

    setScreen('CATEGORY_CREATION');
    setSelectionPlayerId('player_1');
    setPromptPlayerId('player_1');
  };

  const openCategoryModal = (category?: Category) => {
    if (category) {
      setEditingCategoryId(category.id);
      setCategoryNameInput(category.name);
      setCategoryDescriptionInput(category.description);
    } else {
      setEditingCategoryId(null);
      setCategoryNameInput('');
      setCategoryDescriptionInput('');
    }

    setShowCategoryModal(true);
  };

  const saveCategory = () => {
    const trimmedName = categoryNameInput.trim();
    const trimmedDescription = categoryDescriptionInput.trim();

    if (!trimmedName || !trimmedDescription) {
      return;
    }

    setError(null);

    if (editingCategoryId) {
      setCategories((currentCategories) =>
        currentCategories.map((category) =>
          category.id === editingCategoryId
            ? { ...category, name: trimmedName, description: trimmedDescription }
            : category,
        ),
      );
    } else if (categories.length < 5) {
      setCategories((currentCategories) => [
        ...currentCategories,
        createLocalCategory({
          slotIndex: currentCategories.length,
          name: trimmedName,
          description: trimmedDescription,
          createdBy: 'player_1',
        }),
      ]);
    }

    setShowCategoryModal(false);
  };

  const handleGenerateCategory = async () => {
    if (categories.length >= 5) {
      return;
    }

    setBusyLabel('The Overseer is inventing a category.');
    setError(null);

    try {
      const generatedCategory = await requestLocalApi<AICategoryResponse>('/api/local/category', {
        modelId: selectedModelId,
        existingCategories: categories.map((category) => ({
          name: category.name,
          description: category.description,
        })),
      });

      setCategories((currentCategories) => [
        ...currentCategories,
        createLocalCategory({
          slotIndex: currentCategories.length,
          name: generatedCategory.category_name,
          description: generatedCategory.category_description,
          createdBy: 'ai',
        }),
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The Overseer could not generate a category.');
    } finally {
      setBusyLabel(null);
    }
  };

  const handleStartGame = () => {
    if (categories.length !== 5) {
      return;
    }

    setError(null);
    setScreen('BATTLE_PATH');
  };

  const handleStartTurn = (category: Category) => {
    if (category.capturedBy) {
      return;
    }

    setError(null);
    setPreviewCategoryId(null);
    setPromptTypingPlayerIds([]);
    setActiveCategoryId(category.id);
    setPromptPlayerId('player_1');
    setScreen('HANDOFF');
  };

  const openPreview = (categoryId: string) => {
    setPreviewCategoryId(categoryId);
  };

  const closePreview = () => {
    setPreviewCategoryId(null);
  };

  const handlePromptAdvance = () => {
    const currentDraft = drafts[promptPlayerId].trim();

    if (!currentDraft) {
      return;
    }

    if (promptTypingTimeoutRef.current) {
      window.clearTimeout(promptTypingTimeoutRef.current);
    }

    setPromptTypingPlayerIds([]);

    if (promptPlayerId === 'player_1') {
      setPromptPlayerId('player_2');
      setScreen('HANDOFF');
      return;
    }

    void resolveTurn();
  };

  const resolveTurn = async () => {
    if (!activeCategory) {
      return;
    }

    setBusyLabel('The Overseer is judging the round.');
    setScreen('RESOLVING');
    setError(null);

    try {
      const previousLog = activeCategory.isTie ? activeCategory.history[activeCategory.history.length - 1] ?? null : null;
      const judgingResult = await requestLocalApi<JudgingResult>('/api/local/judge', {
        modelId: selectedModelId,
        categoryName: activeCategory.name,
        categoryDescription: activeCategory.description,
        playerOneText: drafts.player_1,
        playerTwoText: drafts.player_2,
        isTieBreaker: activeCategory.isTie,
        previousLog,
      });

      const nextLog: PromptLog = {
        player1Text: drafts.player_1,
        player2Text: drafts.player_2,
        judgingLog: judgingResult,
      };

      const nextCategories = categories.map((category) =>
        category.id === activeCategory.id
          ? {
              ...category,
              history: [...category.history, nextLog],
              capturedBy: judgingResult.winner_id === 'tie' ? null : judgingResult.winner_id,
              isTie: judgingResult.winner_id === 'tie',
            }
          : category,
      );

      const nextSelectionPlayerId = otherPlayerId(selectionPlayerId);
      const playerOneScore = getCapturedScore(nextCategories, 'player_1');
      const playerTwoScore = getCapturedScore(nextCategories, 'player_2');

      setCategories(nextCategories);
      setCurrentResultLog(nextLog);
      setSelectionPlayerId(nextSelectionPlayerId);
      setBusyLabel(null);

      if (playerOneScore >= 3) {
        setWinnerId('player_1');
        setScreen('WIN');
        return;
      }

      if (playerTwoScore >= 3) {
        setWinnerId('player_2');
        setScreen('WIN');
        return;
      }

      setScreen('RESULTS');
    } catch (requestError) {
      setBusyLabel(null);
      setError(requestError instanceof Error ? requestError.message : 'Judging failed. Please try the round again.');
      setPromptPlayerId('player_2');
      setScreen('PROMPT_ENTRY');
    }
  };

  const handleContinue = () => {
    resetRoundState();
    setError(null);
    setPromptTypingPlayerIds([]);
    setScreen('BATTLE_PATH');
  };

  const handlePromptDraftChange = (nextValue: string) => {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [promptPlayerId]: nextValue,
    }));

    const isTyping = nextValue.trim().length > 0;
    setPromptTypingPlayerIds(isTyping ? [promptPlayerId] : []);

    if (promptTypingTimeoutRef.current) {
      window.clearTimeout(promptTypingTimeoutRef.current);
    }

    if (!isTyping) {
      return;
    }

    const typingPlayerId = promptPlayerId;
    promptTypingTimeoutRef.current = window.setTimeout(() => {
      setPromptTypingPlayerIds((currentValue) =>
        currentValue.includes(typingPlayerId) ? [] : currentValue,
      );
    }, 900);
  };

  const renderBanner = () => {
    const bannerText = error ?? busyLabel;

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
        {error ? <Info className="mt-0.5 h-5 w-5 shrink-0" /> : <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-duo-purple" />}
        <span className="leading-relaxed">{bannerText}</span>
      </div>
    );
  };

  const renderBoardCard = (category: Category, index: number) => {
    const captor = players.find((player) => player.id === category.capturedBy) ?? null;

    return (
      <BoardCategoryCard
        key={category.id}
        category={category}
        index={index}
        captor={captor}
        ownerPillLabel={captor ? `${captor.name} owns it` : category.createdBy === 'ai' ? 'Overseer Pick' : 'Open Category'}
        statusText={category.capturedBy ? 'Log' : 'Preview'}
        onClick={() => openPreview(category.id)}
      />
    );
  };

  const renderOnboarding = () => (
    <motion.div key={`ONBOARDING_${setupPlayerId}`} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-full flex-col justify-center gap-6 py-10 text-center">
      {onBack && (
        <div className="flex justify-start">
          <Button variant="ghost" className="w-auto px-4 py-3 text-[10px] tracking-[0.22em]" onClick={onBack}>
            Back
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-gray-400">Pass &amp; Play</p>
        <h1 className="text-5xl font-black leading-none text-gray-900">Hand The Phone Over</h1>
        <p className="text-sm font-bold leading-relaxed text-gray-500">
          Set each player once, then keep passing the device back and forth as the Overseer calls for it.
        </p>
      </div>

      {renderBanner()}

      <div className="rounded-[2rem] border-2 border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-gray-400">
          {setupPlayerId === 'player_1' ? 'Player One Setup' : 'Player Two Setup'}
        </p>
        <h2 className="mt-2 text-3xl font-black text-gray-800">{setupPlayerId === 'player_1' ? 'Choose Player 1' : 'Choose Player 2'}</h2>

        <input
          type="text"
          maxLength={16}
          value={setupName}
          onChange={(event) => setSetupName(event.target.value)}
          placeholder={setupPlayerId === 'player_1' ? 'Uncle Ray' : 'Mysterious Rival'}
          className="mt-5 w-full rounded-2xl border-2 border-gray-200 bg-gray-50 p-4 text-lg font-bold text-center text-gray-800 outline-none transition-all focus:border-duo-blue focus:bg-white"
        />

        <div className="mt-5">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-gray-400">Tap A Color To Lock In</p>
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handleOnboarding(color)}
                className="h-14 w-14 rounded-full border-4 border-transparent transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );

  const renderCategoryCreation = () => (
    <motion.div key="CATEGORY_CREATION" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-full flex-col">
      {onBack && (
        <div className="mb-4 flex justify-start">
          <Button variant="ghost" className="w-auto px-4 py-3 text-[10px] tracking-[0.22em]" onClick={onBack}>
            Back
          </Button>
        </div>
      )}

      {renderBanner()}

      <div className="mb-4 shrink-0 text-center">
        <h2 className="text-3xl font-black text-gray-800">Build The Local Board</h2>
        <p className="mt-2 text-sm font-bold text-gray-500">Add four custom categories and one Overseer category, then start the pass-and-play match.</p>
      </div>

      <div className="space-y-3 pb-6">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => openCategoryModal(category)}
            className="w-full rounded-[2rem] border-2 border-gray-100 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
                  {category.createdBy === 'ai' ? 'Overseer Slot' : `Category ${category.slotIndex + 1}`}
                </p>
                <h3 className="mt-2 break-words text-xl font-black text-gray-800">{category.name}</h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed text-gray-500">{category.description}</p>
              </div>
              {category.createdBy === 'ai' && (
                <span className="rounded-full bg-duo-purple/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-duo-purple">
                  AI
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-auto shrink-0 space-y-3">
        <Button variant="ghost" className="border-2 border-gray-200 bg-white" onClick={() => openCategoryModal()} disabled={categories.length >= 5}>
          Add Custom Category
        </Button>

        {!categories.some((category) => category.createdBy === 'ai') && categories.length < 5 && (
          <Button variant="secondary" onClick={handleGenerateCategory} disabled={busyLabel !== null}>
            Generate Overseer Category
          </Button>
        )}

        <Button onClick={handleStartGame} disabled={categories.length !== 5}>
          Start Pass &amp; Play
        </Button>
      </div>
    </motion.div>
  );

  const renderBattlePath = () => (
    <motion.div key="BATTLE_PATH" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-full flex-col">
      {renderBanner()}

      {currentChooser && <StickyStatusPill label="Next:" value={currentChooser.name} color={currentChooser.color} />}

      <div className="shrink-0 pb-4 text-center">
        <h2 className="text-3xl font-black text-gray-800">Pick A Category</h2>
        <p className="mt-2 text-sm font-bold text-gray-500">Captured categories reopen the ruling. Uncaptured categories open the category brief before the round begins.</p>
      </div>

      <div className="pb-8 relative">
        <div className="relative mx-auto w-full max-w-[20rem]" style={{ height: boardHeight }}>
          <svg className="pointer-events-none absolute left-0 top-0 h-full w-full text-gray-300" viewBox={`0 0 ${BOARD_WIDTH} ${boardHeight}`} preserveAspectRatio="none">
            <path d={boardPath} fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="10 10" />
          </svg>

          {categories.map((category, index) => renderBoardCard(category, index))}
        </div>
      </div>
    </motion.div>
  );

  const renderHandoff = () => (
    <motion.div key={`HANDOFF_${promptPlayerId}`} initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex min-h-full flex-col items-center justify-center gap-8 px-6 text-center">
      <h1 className="text-4xl font-black text-gray-800">Hand The Phone To</h1>
      <h2 className="text-6xl font-black" style={{ color: currentPromptPlayer?.color }}>
        {currentPromptPlayer?.name}
      </h2>

      {!hasSeenIntro[promptPlayerId] && (
        <div className="rounded-[2rem] border-2 border-gray-200 bg-white p-6 shadow-sm">
          <Info className="mx-auto mb-3 h-8 w-8 text-duo-purple" />
          <p className="text-sm font-bold italic leading-relaxed text-gray-600">{introText}</p>
        </div>
      )}

      <Button
        onClick={() => {
          setHasSeenIntro((currentValue) => ({ ...currentValue, [promptPlayerId]: true }));
          setScreen('PROMPT_ENTRY');
        }}
      >
        Ready
      </Button>
    </motion.div>
  );

  const renderPromptEntry = () => {
    if (!activeCategory) {
      return null;
    }

    return (
      <motion.div key={`PROMPT_ENTRY_${promptPlayerId}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-full flex-col">
        {renderBanner()}

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
            value={drafts[promptPlayerId]}
            onChange={(event) => handlePromptDraftChange(event.target.value)}
            spellCheck
          />
        </div>

        <div className="mt-4 shrink-0 flex gap-3">
          <Button variant="ghost" className="border-2 border-gray-200 bg-white" onClick={() => setScreen('BATTLE_PATH')}>
            Back
          </Button>
          <Button onClick={handlePromptAdvance} disabled={drafts[promptPlayerId].trim().length === 0}>
            {promptPlayerId === 'player_1' ? 'Pass To Player 2' : 'Lock In Prompt'}
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
        <p className="text-sm font-bold text-gray-500">Both prompts are locked. The local round is resolving now.</p>
      </div>
    </motion.div>
  );

  const renderResults = () => {
    if (!activeCategory || resultsLogs.length === 0) {
      return null;
    }

    return (
      <motion.div key="RESULTS" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-full flex-col">
        {renderBanner()}

        <div className="shrink-0 pb-4 text-center">
          <h2 className="text-3xl font-black text-gray-800">Judgment</h2>
          <p className="mt-2 text-sm font-bold text-gray-500">Review the ruling, then keep the phone moving.</p>
        </div>

        <div className="pb-6">
          <JudgingLogPanel className="w-full" category={activeCategory} logs={resultsLogs} players={players} />
        </div>

        <div className="mt-auto shrink-0 border-t-2 border-gray-100 bg-duo-gray/90 pt-4">
          <Button onClick={handleContinue}>Continue</Button>
        </div>
      </motion.div>
    );
  };

  const renderWinScreen = () => {
    const winningPlayer = players.find((player) => player.id === winnerId) ?? null;

    return (
      <motion.div key="WIN" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-full flex-col">
        {renderBanner()}

        <div className="mb-6 shrink-0 text-center">
          <Trophy className="mx-auto h-16 w-16 text-duo-yellow" />
          <h1 className="mt-2 text-4xl font-black text-gray-800">Game Over</h1>
          <p className="mt-2 text-sm font-bold text-gray-500">
            {winningPlayer ? `${winningPlayer.name} takes the crown.` : 'The match is over.'}
          </p>
        </div>

        <div className="space-y-8 pb-10">
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

  const showHeader = players.length === 2 && screen !== 'ONBOARDING' && screen !== 'HANDOFF';

  return (
    <div className="relative mx-auto flex min-h-screen min-h-[100dvh] w-full max-w-md flex-col overflow-x-hidden bg-duo-gray shadow-2xl md:my-[2.5vh] md:min-h-[95vh] md:rounded-3xl">
      {showHeader && (
        <Header
          players={headerPlayers}
          spinnerPlayerIds={spinnerPlayerIds}
          centerLabel={centerLabel}
          modelOptions={MODEL_OPTIONS}
          selectedModelId={selectedModelId}
          onModelChange={(modelId) => {
            if (isValidModelId(modelId)) {
              setSelectedModelId(modelId);
            }
          }}
        />
      )}

      <main className={cn('relative z-10 flex-1 px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]', showHeader ? 'pt-[calc(env(safe-area-inset-top)+5rem)]' : 'pt-10')}>
        <AnimatePresence mode="wait">
          {screen === 'ONBOARDING' && renderOnboarding()}
          {screen === 'CATEGORY_CREATION' && renderCategoryCreation()}
          {screen === 'BATTLE_PATH' && renderBattlePath()}
          {screen === 'HANDOFF' && renderHandoff()}
          {screen === 'PROMPT_ENTRY' && renderPromptEntry()}
          {screen === 'RESOLVING' && renderResolving()}
          {screen === 'RESULTS' && renderResults()}
          {screen === 'WIN' && renderWinScreen()}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {previewCategory && screen === 'BATTLE_PATH' && (
          <CategoryBoardModal
            category={previewCategory}
            players={players}
            onClose={closePreview}
            primaryActionLabel={previewCategory.capturedBy ? 'Close' : 'Start Round'}
            onPrimaryAction={() => {
              if (!previewCategory.capturedBy) {
                handleStartTurn(previewCategory);
                return;
              }

              closePreview();
            }}
          />
        )}

        {showCategoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 px-6 py-6 backdrop-blur-sm"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)',
            }}
          >
            <motion.div
              initial={{ scale: 0.94, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 20 }}
              className="my-auto flex w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border-2 border-white bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b-2 border-gray-100 bg-gray-50 px-4 py-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-gray-400">Category Slot</p>
                  <h3 className="mt-1 text-xl font-black text-gray-800">{editingCategoryId ? 'Edit Category' : 'New Category'}</h3>
                </div>
                <button onClick={() => setShowCategoryModal(false)} className="rounded-full p-2 text-gray-400 transition-all hover:bg-gray-200 hover:text-gray-600">
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4 p-5">
                <div>
                  <label className="ml-2 block text-xs font-black uppercase tracking-[0.22em] text-gray-400">Category Name</label>
                  <input
                    type="text"
                    value={categoryNameInput}
                    onChange={(event) => setCategoryNameInput(event.target.value)}
                    className="mt-2 w-full rounded-2xl border-2 border-gray-200 bg-gray-50 p-4 font-bold text-gray-800 outline-none transition-all focus:border-duo-blue focus:bg-white"
                    placeholder="e.g. The Infinite Loop"
                  />
                </div>

                <div>
                  <label className="ml-2 block text-xs font-black uppercase tracking-[0.22em] text-gray-400">Description</label>
                  <textarea
                    value={categoryDescriptionInput}
                    onChange={(event) => setCategoryDescriptionInput(event.target.value)}
                    className="h-32 w-full resize-none rounded-2xl border-2 border-gray-200 bg-gray-50 p-4 font-bold text-gray-800 outline-none transition-all focus:border-duo-blue focus:bg-white"
                    placeholder="Set the scene..."
                  />
                </div>
              </div>

              <div className="flex gap-3 border-t-2 border-gray-100 px-5 py-5">
                <Button variant="ghost" className="border-2 border-gray-200 bg-white" onClick={() => setShowCategoryModal(false)}>
                  Cancel
                </Button>
                <Button onClick={saveCategory} disabled={categoryNameInput.trim().length === 0 || categoryDescriptionInput.trim().length === 0}>
                  Save Category
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};