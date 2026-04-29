import 'dotenv/config';

import crypto from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { Server } from 'socket.io';

import { DEFAULT_MODEL_ID, isValidModelId } from './shared/modelOptions.js';
import { generateMatchCategory, judgeMatchTurn } from './server/vertex.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');

const app = express();
const httpServer = createServer(app);

const allowedOrigins = [
  process.env.CLIENT_ORIGIN,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

app.use(express.json());

const PORT = Number(process.env.PORT ?? 3001);
const DISCONNECT_GRACE_MS = 120_000;
const COLOR_OPTIONS = ['#58cc02', '#1cb0f6', '#ff4b4b', '#ffc800', '#ce82ff'];
const PLAYER_IDS = ['player_1', 'player_2'];

const sessions = new Map();
const socketToSession = new Map();
const waitingQueue = [];
const matches = new Map();
const disconnectTimers = new Map();

const createId = () => crypto.randomUUID();
const otherPlayerId = (playerId) => (playerId === 'player_1' ? 'player_2' : 'player_1');

const createEmptyCategory = (slotIndex, ownerId) => ({
  id: createId(),
  slotIndex,
  name: '',
  description: '',
  createdBy: ownerId,
  ownerId,
  capturedBy: null,
  history: [],
  isTie: false,
});

const createMatch = (playerOneSession, playerTwoSession) => ({
  id: createId(),
  modelId: isValidModelId(playerOneSession.modelId) ? playerOneSession.modelId : DEFAULT_MODEL_ID,
  phase: 'category_setup',
  players: {
    player_1: {
      id: 'player_1',
      name: playerOneSession.name,
      color: playerOneSession.color,
      connected: true,
      sessionId: playerOneSession.sessionId,
    },
    player_2: {
      id: 'player_2',
      name: playerTwoSession.name,
      color: playerTwoSession.color,
      connected: true,
      sessionId: playerTwoSession.sessionId,
    },
  },
  categories: [
    createEmptyCategory(0, 'player_1'),
    createEmptyCategory(1, 'player_1'),
    // AI category is not captured or counted for win at start
    { ...createEmptyCategory(2, 'ai'), capturedBy: null, history: [], name: '', description: '' },
    createEmptyCategory(3, 'player_2'),
    createEmptyCategory(4, 'player_2'),
  ],
  activePlayer: 'player_1',
  activeCategoryId: null,
  previewSelections: {
    player_1: null,
    player_2: null,
  },
  categorySetupLockedPlayers: [],
  categoryTypingPlayers: [],
  reviewLockedPlayers: [],
  promptLockedPlayers: [],
  resultLockedPlayers: [],
  typingPlayers: [],
  promptDrafts: {
    player_1: '',
    player_2: '',
  },
  currentResultLog: null,
  winnerId: null,
  systemMessage: 'Fill your two highlighted slots, then lock in to summon the fifth category.',
  aiCategoryGenerationInFlight: false,
  aiCategoryGenerationAttempts: 0,
  aiCategoryGenerationErrors: [],
});

// Only count categories that have a name and are not AI-owned for win condition
const getScore = (match, playerId) =>
  match.categories.filter((category) =>
    category.capturedBy === playerId &&
    category.ownerId !== 'ai' &&
    category.name.trim().length > 0
  ).length;

const getOwnSetupCategories = (match, playerId) =>
  match.categories.filter((category) => category.ownerId === playerId);

const isOwnSetupComplete = (match, playerId) =>
  getOwnSetupCategories(match, playerId).every(
    (category) => category.name.trim().length > 0 && category.description.trim().length > 0,
  );

const emitToSession = (sessionId, eventName, payload) => {
  const session = sessions.get(sessionId);

  if (session?.socketId) {
    io.to(session.socketId).emit(eventName, payload);
  }
};

const emitMatchError = (sessionId, message) => {
  emitToSession(sessionId, 'match:error', { message });
};

const removeFromQueue = (sessionId) => {
  const queueIndex = waitingQueue.indexOf(sessionId);

  if (queueIndex !== -1) {
    waitingQueue.splice(queueIndex, 1);
  }

  const session = sessions.get(sessionId);

  if (session) {
    session.queued = false;
  }
};

const buildClientView = (match, viewerId) => ({
  matchId: match.id,
  modelId: match.modelId,
  phase: match.phase,
  selfId: viewerId,
  players: PLAYER_IDS.map((playerId) => ({
    id: playerId,
    name: match.players[playerId].name,
    color: match.players[playerId].color,
    connected: match.players[playerId].connected,
    score: getScore(match, playerId),
  })),
  categories: [...match.categories].sort((left, right) => left.slotIndex - right.slotIndex),
  activePlayer: match.activePlayer,
  activeCategoryId: match.activeCategoryId,
  previewSelections: match.previewSelections,
  categorySetupLockedPlayers: [...match.categorySetupLockedPlayers],
  categoryTypingPlayers: [...match.categoryTypingPlayers],
  reviewLockedPlayers: [...match.reviewLockedPlayers],
  promptLockedPlayers: [...match.promptLockedPlayers],
  resultLockedPlayers: [...match.resultLockedPlayers],
  typingPlayers: [...match.typingPlayers],
  promptDraft: match.promptDrafts[viewerId] ?? '',
  currentResultLog: match.currentResultLog,
  winnerId: match.winnerId,
  systemMessage: match.systemMessage,
  aiCategoryGenerationInFlight: match.aiCategoryGenerationInFlight,
  aiCategoryGenerationAttempts: match.aiCategoryGenerationAttempts,
  aiCategoryGenerationErrors: [...match.aiCategoryGenerationErrors],
});

const runAiCategoryGeneration = async (match) => {
  if (match.aiCategoryGenerationInFlight) {
    return;
  }

  match.aiCategoryGenerationInFlight = true;
  match.aiCategoryGenerationAttempts += 1;
  match.systemMessage = `The Overseer is generating the fifth category. Attempt ${match.aiCategoryGenerationAttempts}.`;
  emitMatchUpdate(match);

  try {
    const manualCategories = match.categories.filter((category) => category.ownerId !== 'ai');
    const generatedCategory = await generateMatchCategory(manualCategories, match.modelId);
    const aiCategory = match.categories.find((category) => category.ownerId === 'ai');

    if (aiCategory) {
      aiCategory.name = generatedCategory.category_name;
      aiCategory.description = generatedCategory.category_description;
      aiCategory.createdBy = 'ai';
    }

    match.phase = 'category_review';
    match.aiCategoryGenerationInFlight = false;
    match.aiCategoryGenerationErrors = [];
    match.categorySetupLockedPlayers = [];
    match.categoryTypingPlayers = [];
    match.reviewLockedPlayers = [];
    match.previewSelections = {
      player_1: null,
      player_2: null,
    };
    match.systemMessage = 'Review the full board and press Start when both players are ready.';
    emitMatchUpdate(match);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate the fifth category.';
    match.aiCategoryGenerationInFlight = false;
    match.categoryTypingPlayers = [];
    match.aiCategoryGenerationErrors = [
      ...match.aiCategoryGenerationErrors,
      `Attempt ${match.aiCategoryGenerationAttempts}: ${message}`,
    ];
    match.systemMessage = `The Overseer failed to generate the fifth category on attempt ${match.aiCategoryGenerationAttempts}. Retry to continue.`;
    emitMatchUpdate(match);
  }
};

const emitMatchUpdate = (match) => {
  for (const playerId of PLAYER_IDS) {
    emitToSession(match.players[playerId].sessionId, 'match:update', buildClientView(match, playerId));
  }
};

const ensureDistinctColors = (firstSession, secondSession) => {
  if (firstSession.color !== secondSession.color) {
    return;
  }

  const fallbackColor = COLOR_OPTIONS.find((color) => color !== firstSession.color) ?? COLOR_OPTIONS[0];
  secondSession.color = fallbackColor;
};

const clearDisconnectTimer = (sessionId) => {
  const timer = disconnectTimers.get(sessionId);

  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(sessionId);
  }
};

const getSessionFromSocket = (socket) => {
  const sessionId = socketToSession.get(socket.id);
  return sessionId ? sessions.get(sessionId) ?? null : null;
};

const getMatchAndPlayer = (socket) => {
  const session = getSessionFromSocket(socket);

  if (!session?.matchId || !session.playerId) {
    return null;
  }

  const match = matches.get(session.matchId);

  if (!match) {
    return null;
  }

  return {
    match,
    playerId: session.playerId,
    session,
  };
};

const finishMatchWithWinner = (match, winnerId, systemMessage) => {
  match.phase = 'win';
  match.winnerId = winnerId;
  match.systemMessage = systemMessage;
  match.activeCategoryId = null;
  match.previewSelections = {
    player_1: null,
    player_2: null,
  };
  match.categoryTypingPlayers = [];
  match.typingPlayers = [];
  match.promptLockedPlayers = [];
  match.resultLockedPlayers = [];
};

const resetRoundState = (match) => {
  match.activeCategoryId = null;
  match.previewSelections = {
    player_1: null,
    player_2: null,
  };
  match.categoryTypingPlayers = [];
  match.promptDrafts = {
    player_1: '',
    player_2: '',
  };
  match.promptLockedPlayers = [];
  match.typingPlayers = [];
  match.currentResultLog = null;
  match.resultLockedPlayers = [];
};

const maybeCreateMatch = () => {
  while (waitingQueue.length >= 2) {
    const firstSessionId = waitingQueue.shift();
    const secondSessionId = waitingQueue.shift();
    const firstSession = sessions.get(firstSessionId);
    const secondSession = sessions.get(secondSessionId);

    if (!firstSession || !secondSession) {
      continue;
    }

    ensureDistinctColors(firstSession, secondSession);

    firstSession.queued = false;
    secondSession.queued = false;

    const match = createMatch(firstSession, secondSession);
    matches.set(match.id, match);

    firstSession.matchId = match.id;
    firstSession.playerId = 'player_1';
    secondSession.matchId = match.id;
    secondSession.playerId = 'player_2';

    emitMatchUpdate(match);
  }
};

const forfeitDisconnectedPlayer = (sessionId) => {
  disconnectTimers.delete(sessionId);

  const session = sessions.get(sessionId);

  if (!session?.matchId || !session.playerId) {
    return;
  }

  const match = matches.get(session.matchId);

  if (!match || match.phase === 'win') {
    return;
  }

  const winnerId = otherPlayerId(session.playerId);
  finishMatchWithWinner(match, winnerId, `${match.players[session.playerId].name} disconnected and forfeited the match.`);
  emitMatchUpdate(match);
};

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/local/category', async (req, res) => {
  const existingCategories = Array.isArray(req.body?.existingCategories)
    ? req.body.existingCategories
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          name: typeof entry.name === 'string' ? entry.name.trim().slice(0, 50) : '',
          description: typeof entry.description === 'string' ? entry.description.trim().slice(0, 220) : '',
        }))
        .filter((entry) => entry.name && entry.description)
    : [];

  try {
    const generatedCategory = await generateMatchCategory(existingCategories, isValidModelId(req.body?.modelId) ? req.body.modelId : DEFAULT_MODEL_ID);
    res.json(generatedCategory);
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to generate a local category.',
    });
  }
});

app.post('/api/local/judge', async (req, res) => {
  const categoryName = typeof req.body?.categoryName === 'string' ? req.body.categoryName.trim() : '';
  const categoryDescription = typeof req.body?.categoryDescription === 'string' ? req.body.categoryDescription.trim() : '';
  const playerOneText = typeof req.body?.playerOneText === 'string' ? req.body.playerOneText.trim() : '';
  const playerTwoText = typeof req.body?.playerTwoText === 'string' ? req.body.playerTwoText.trim() : '';

  if (!categoryName || !categoryDescription || !playerOneText || !playerTwoText) {
    res.status(400).json({ message: 'Missing local judging fields.' });
    return;
  }

  try {
    const judgingResult = await judgeMatchTurn({
      categoryName,
      categoryDescription,
      playerOneText,
      playerTwoText,
      modelId: isValidModelId(req.body?.modelId) ? req.body.modelId : DEFAULT_MODEL_ID,
      isTieBreaker: Boolean(req.body?.isTieBreaker),
      previousLog: req.body?.previousLog ?? null,
    });
    res.json(judgingResult);
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to judge the local round.',
    });
  }
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(DIST_DIR));
  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

io.on('connection', (socket) => {
  socket.on('player:resume', ({ sessionId }) => {
    if (!sessionId) {
      return;
    }

    const existingSession = sessions.get(sessionId);

    if (!existingSession) {
      return;
    }

    existingSession.socketId = socket.id;
    existingSession.connected = true;
    socketToSession.set(socket.id, sessionId);
    socket.emit('session:ready', { sessionId });

    clearDisconnectTimer(sessionId);

    if (existingSession.matchId && existingSession.playerId) {
      const match = matches.get(existingSession.matchId);

      if (match) {
        match.players[existingSession.playerId].connected = true;
        match.systemMessage = null;
        emitMatchUpdate(match);
      }
    } else if (existingSession.queued) {
      socket.emit('queue:joined');
    }
  });

  socket.on('player:queue', ({ sessionId, name, color, modelId }) => {
    const trimmedName = typeof name === 'string' ? name.trim().slice(0, 16) : '';
    const resolvedModelId = isValidModelId(typeof modelId === 'string' ? modelId : '')
      ? modelId
      : undefined;

    if (!trimmedName || typeof color !== 'string') {
      socket.emit('match:error', { message: 'Choose a username and color before entering the queue.' });
      return;
    }

    const resolvedSessionId = typeof sessionId === 'string' && sessions.has(sessionId) ? sessionId : createId();
    const existingSession = sessions.get(resolvedSessionId);
    const nextSession = {
      sessionId: resolvedSessionId,
      socketId: socket.id,
      name: trimmedName,
      color,
      matchId: existingSession?.matchId ?? null,
      playerId: existingSession?.playerId ?? null,
      modelId: resolvedModelId ?? existingSession?.modelId ?? DEFAULT_MODEL_ID,
      queued: existingSession?.queued ?? false,
      connected: true,
    };

    sessions.set(resolvedSessionId, nextSession);
    socketToSession.set(socket.id, resolvedSessionId);
    socket.emit('session:ready', { sessionId: resolvedSessionId });

    if (nextSession.matchId && nextSession.playerId) {
      const match = matches.get(nextSession.matchId);

      if (match) {
        match.players[nextSession.playerId].connected = true;
        emitMatchUpdate(match);
        return;
      }
    }

    removeFromQueue(resolvedSessionId);
    nextSession.queued = true;
    waitingQueue.push(resolvedSessionId);
    socket.emit('queue:joined');
    maybeCreateMatch();
  });

  socket.on('queue:leave', () => {
    const session = getSessionFromSocket(socket);

    if (!session) {
      return;
    }

    removeFromQueue(session.sessionId);
    socket.emit('queue:left');
  });

  socket.on('category:update', ({ categoryId, name, description }) => {
    const context = getMatchAndPlayer(socket);

    if (!context) {
      return;
    }

    const { match, playerId, session } = context;

    if (match.phase !== 'category_setup') {
      return;
    }

    if (match.categorySetupLockedPlayers.includes(playerId)) {
      emitMatchError(session.sessionId, 'Your categories are already locked in.');
      return;
    }

    const category = match.categories.find((entry) => entry.id === categoryId);

    if (!category || category.ownerId !== playerId) {
      emitMatchError(session.sessionId, 'You can only edit your own category slots.');
      return;
    }

    category.name = typeof name === 'string' ? name.trim().slice(0, 50) : '';
    category.description = typeof description === 'string' ? description.trim().slice(0, 220) : '';
    match.categoryTypingPlayers = match.categoryTypingPlayers.filter((entry) => entry !== playerId);
    match.aiCategoryGenerationAttempts = 0;
    match.aiCategoryGenerationErrors = [];
    match.aiCategoryGenerationInFlight = false;
    match.systemMessage = null;
    emitMatchUpdate(match);
  });

  socket.on('category:typing', ({ isTyping }) => {
    const context = getMatchAndPlayer(socket);

    if (!context) {
      return;
    }

    const { match, playerId } = context;

    if (match.phase !== 'category_setup' || match.categorySetupLockedPlayers.includes(playerId)) {
      return;
    }

    if (isTyping) {
      if (!match.categoryTypingPlayers.includes(playerId)) {
        match.categoryTypingPlayers.push(playerId);
      }
    } else {
      match.categoryTypingPlayers = match.categoryTypingPlayers.filter((entry) => entry !== playerId);
    }

    emitMatchUpdate(match);
  });

  socket.on('category:lock', async () => {
    const context = getMatchAndPlayer(socket);

    if (!context) {
      return;
    }

    const { match, playerId, session } = context;

    if (match.phase !== 'category_setup' || match.categorySetupLockedPlayers.includes(playerId)) {
      return;
    }

    if (!isOwnSetupComplete(match, playerId)) {
      emitMatchError(session.sessionId, 'Fill both of your category slots before locking in.');
      return;
    }

    match.categorySetupLockedPlayers.push(playerId);
    match.categoryTypingPlayers = match.categoryTypingPlayers.filter((entry) => entry !== playerId);
    emitMatchUpdate(match);

    if (match.categorySetupLockedPlayers.length !== 2) {
      return;
    }

    await runAiCategoryGeneration(match);
  });

  socket.on('category:retry-ai', async () => {
    const context = getMatchAndPlayer(socket);

    if (!context) {
      return;
    }

    const { match } = context;

    if (
      match.phase !== 'category_setup'
      || match.categorySetupLockedPlayers.length !== 2
      || match.aiCategoryGenerationInFlight
      || match.aiCategoryGenerationErrors.length === 0
    ) {
      return;
    }

    await runAiCategoryGeneration(match);
  });

  socket.on('category:preview', ({ categoryId }) => {
    const context = getMatchAndPlayer(socket);

    if (!context) {
      return;
    }

    const { match, playerId } = context;

    if (match.phase !== 'category_review' && match.phase !== 'battle_path') {
      return;
    }

    if (categoryId !== null && !match.categories.some((category) => category.id === categoryId)) {
      return;
    }

    match.previewSelections[playerId] = categoryId ?? null;
    emitMatchUpdate(match);
  });

  socket.on('review:lock', () => {
    const context = getMatchAndPlayer(socket);

    if (!context) {
      return;
    }

    const { match, playerId } = context;

    if (match.phase !== 'category_review' || match.reviewLockedPlayers.includes(playerId)) {
      return;
    }

    match.reviewLockedPlayers.push(playerId);
    emitMatchUpdate(match);

    if (match.reviewLockedPlayers.length !== 2) {
      return;
    }

    match.phase = 'battle_path';
    match.reviewLockedPlayers = [];
    match.previewSelections = {
      player_1: null,
      player_2: null,
    };
    match.systemMessage = 'Player 1 chooses the opening category.';
    emitMatchUpdate(match);
  });

  socket.on('match:model', ({ modelId }) => {
    const context = getMatchAndPlayer(socket);

    if (!context || !isValidModelId(modelId)) {
      return;
    }

    const { match, session } = context;
    match.modelId = modelId;
    session.modelId = modelId;

    for (const playerId of PLAYER_IDS) {
      const playerSession = sessions.get(match.players[playerId].sessionId);

      if (playerSession) {
        playerSession.modelId = modelId;
      }
    }

    emitMatchUpdate(match);
  });

  socket.on('battle:select', ({ categoryId }) => {
    const context = getMatchAndPlayer(socket);

    if (!context) {
      return;
    }

    const { match, playerId, session } = context;

    if (match.phase !== 'battle_path') {
      return;
    }

    if (match.activePlayer !== playerId) {
      emitMatchError(session.sessionId, 'It is not your turn to choose a category.');
      return;
    }

    const category = match.categories.find((entry) => entry.id === categoryId);

    if (!category || category.capturedBy) {
      emitMatchError(session.sessionId, 'That category is not available.');
      return;
    }

    match.activeCategoryId = categoryId;
    match.phase = 'prompt_entry';
    match.previewSelections = {
      player_1: null,
      player_2: null,
    };
    match.promptDrafts = {
      player_1: '',
      player_2: '',
    };
    match.promptLockedPlayers = [];
    match.typingPlayers = [];
    match.systemMessage = `Both players are writing for ${category.name}. Lock in when you are ready.`;
    emitMatchUpdate(match);
  });

  socket.on('prompt:update', ({ draft }) => {
    const context = getMatchAndPlayer(socket);

    if (!context) {
      return;
    }

    const { match, playerId } = context;

    if (match.phase !== 'prompt_entry' || match.promptLockedPlayers.includes(playerId)) {
      return;
    }

    match.promptDrafts[playerId] = typeof draft === 'string' ? draft.slice(0, 1200) : '';
    emitMatchUpdate(match);
  });

  socket.on('prompt:typing', ({ isTyping }) => {
    const context = getMatchAndPlayer(socket);

    if (!context) {
      return;
    }

    const { match, playerId } = context;

    if (match.phase !== 'prompt_entry' || match.promptLockedPlayers.includes(playerId)) {
      return;
    }

    if (isTyping) {
      if (!match.typingPlayers.includes(playerId)) {
        match.typingPlayers.push(playerId);
      }
    } else {
      match.typingPlayers = match.typingPlayers.filter((entry) => entry !== playerId);
    }

    emitMatchUpdate(match);
  });

  socket.on('prompt:lock', async () => {
    const context = getMatchAndPlayer(socket);

    if (!context) {
      return;
    }

    const { match, playerId, session } = context;

    if (match.phase !== 'prompt_entry' || match.promptLockedPlayers.includes(playerId)) {
      return;
    }

    if (!match.promptDrafts[playerId]?.trim()) {
      emitMatchError(session.sessionId, 'Write your prompt before locking in.');
      return;
    }

    match.promptLockedPlayers.push(playerId);
    match.typingPlayers = match.typingPlayers.filter((entry) => entry !== playerId);
    emitMatchUpdate(match);

    if (match.promptLockedPlayers.length !== 2) {
      return;
    }

    const activeCategory = match.categories.find((category) => category.id === match.activeCategoryId);

    if (!activeCategory) {
      match.phase = 'battle_path';
      resetRoundState(match);
      emitMatchUpdate(match);
      return;
    }

    match.phase = 'resolving';
    match.systemMessage = 'The Overseer is judging the round.';
    emitMatchUpdate(match);

    try {
      const previousLog = activeCategory.isTie && activeCategory.history.length > 0
        ? activeCategory.history[activeCategory.history.length - 1]
        : null;
      const judgingResult = await judgeMatchTurn({
        categoryName: activeCategory.name,
        categoryDescription: activeCategory.description,
        playerOneText: match.promptDrafts.player_1,
        playerTwoText: match.promptDrafts.player_2,
        modelId: match.modelId,
        isTieBreaker: activeCategory.isTie,
        previousLog,
      });
      const promptLog = {
        player1Text: match.promptDrafts.player_1,
        player2Text: match.promptDrafts.player_2,
        judgingLog: judgingResult,
      };

      activeCategory.history = [...activeCategory.history, promptLog];
      activeCategory.capturedBy = judgingResult.winner_id === 'tie' ? null : judgingResult.winner_id;
      activeCategory.isTie = judgingResult.winner_id === 'tie';

      match.currentResultLog = promptLog;
      match.resultLockedPlayers = [];
      match.typingPlayers = [];
      match.promptLockedPlayers = [];
      match.promptDrafts = {
        player_1: '',
        player_2: '',
      };
      match.activePlayer = otherPlayerId(match.activePlayer);

      // Only allow win if at least one round has been played (at least one category captured)
      if (getScore(match, 'player_1') >= 3 && match.categories.some(c => c.capturedBy === 'player_1')) {
        finishMatchWithWinner(match, 'player_1', `${match.players.player_1.name} has seized three categories and taken the crown.`);
      } else if (getScore(match, 'player_2') >= 3 && match.categories.some(c => c.capturedBy === 'player_2')) {
        finishMatchWithWinner(match, 'player_2', `${match.players.player_2.name} has seized three categories and taken the crown.`);
      } else {
        match.phase = 'results';
        match.systemMessage = `${match.players[match.activePlayer].name} chooses the next category after this review.`;
      }

      emitMatchUpdate(match);
    } catch (error) {
      match.phase = 'prompt_entry';
      match.promptLockedPlayers = [];
      match.systemMessage = error instanceof Error ? error.message : 'Judging failed. Please try locking in again.';
      emitMatchUpdate(match);
    }
  });

  socket.on('results:continue', () => {
    const context = getMatchAndPlayer(socket);

    if (!context) {
      return;
    }

    const { match, playerId } = context;

    if (match.phase !== 'results' || match.resultLockedPlayers.includes(playerId)) {
      return;
    }

    match.resultLockedPlayers.push(playerId);
    emitMatchUpdate(match);

    if (match.resultLockedPlayers.length !== 2) {
      return;
    }

    match.phase = 'battle_path';
    match.resultLockedPlayers = [];
    match.currentResultLog = null;
    match.activeCategoryId = null;
    match.systemMessage = `${match.players[match.activePlayer].name} chooses the next category.`;
    emitMatchUpdate(match);
  });

  socket.on('match:leave', () => {
    const session = getSessionFromSocket(socket);

    if (!session) {
      return;
    }

    removeFromQueue(session.sessionId);

    if (session.matchId && session.playerId) {
      const match = matches.get(session.matchId);

      if (match && match.phase !== 'win') {
        finishMatchWithWinner(
          match,
          otherPlayerId(session.playerId),
          `${match.players[session.playerId].name} left the match.`,
        );
        emitMatchUpdate(match);
      }
    }
  });

  socket.on('disconnect', () => {
    const session = getSessionFromSocket(socket);

    socketToSession.delete(socket.id);

    if (!session) {
      return;
    }

    session.connected = false;

    if (session.queued) {
      removeFromQueue(session.sessionId);
      return;
    }

    if (!session.matchId || !session.playerId) {
      return;
    }

    const match = matches.get(session.matchId);

    if (!match || match.phase === 'win') {
      return;
    }

    match.players[session.playerId].connected = false;
    match.categoryTypingPlayers = match.categoryTypingPlayers.filter((entry) => entry !== session.playerId);
    match.typingPlayers = match.typingPlayers.filter((entry) => entry !== session.playerId);
    match.systemMessage = `${match.players[session.playerId].name} disconnected. They have 120 seconds to return before forfeiting.`;
    emitMatchUpdate(match);

    clearDisconnectTimer(session.sessionId);
    disconnectTimers.set(
      session.sessionId,
      setTimeout(() => {
        forfeitDisconnectedPlayer(session.sessionId);
      }, DISCONNECT_GRACE_MS),
    );
  });
});

httpServer.listen(PORT, () => {
  console.log(`Socket server listening on http://localhost:${PORT}`);
});