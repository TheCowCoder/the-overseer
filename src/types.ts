export type PlayerId = 'player_1' | 'player_2';

export type CategoryOwnerId = PlayerId | 'ai';

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
  connected?: boolean;
}

export interface MatchPlayer extends Player {
  connected: boolean;
  score: number;
}

export interface PromptLog {
  player1Text: string;
  player2Text: string;
  judgingLog: JudgingResult;
}

export interface Category {
  id: string;
  slotIndex: number;
  name: string;
  description: string;
  createdBy: CategoryOwnerId;
  ownerId: CategoryOwnerId;
  capturedBy: PlayerId | null;
  history: PromptLog[];
  isTie: boolean;
}

export interface RubricScores {
  wit: number;
  creativity: number;
  adherence_to_category: number;
  bonus_for_media_politics_references: number;
  effort: number;
  elegance_of_prose: number;
  impressiveness: number;
}

export interface JudgingResult {
  wit: string;
  creativity: string;
  adherence_to_category: string;
  bonus_for_media_politics_references: string;
  effort: string;
  elegance_of_prose: string;
  impressiveness: string;
  player_1_scores: RubricScores;
  player_2_scores: RubricScores;
  player_1_feedback: string;
  player_2_feedback: string;
  verdict_sentence: string;
  winner_id: PlayerId | 'tie';
}

export type MatchPhase =
  | 'queue'
  | 'category_setup'
  | 'category_review'
  | 'battle_path'
  | 'prompt_entry'
  | 'resolving'
  | 'results'
  | 'win';

export interface MatchView {
  matchId: string;
  modelId: string;
  phase: MatchPhase;
  selfId: PlayerId;
  players: MatchPlayer[];
  categories: Category[];
  activePlayer: PlayerId;
  activeCategoryId: string | null;
  previewSelections: Partial<Record<PlayerId, string | null>>;
  categorySetupLockedPlayers: PlayerId[];
  categoryTypingPlayers: PlayerId[];
  reviewLockedPlayers: PlayerId[];
  promptLockedPlayers: PlayerId[];
  resultLockedPlayers: PlayerId[];
  typingPlayers: PlayerId[];
  promptDraft: string;
  currentResultLog: PromptLog | null;
  winnerId: PlayerId | 'tie' | null;
  systemMessage: string | null;
  aiCategoryGenerationInFlight: boolean;
  aiCategoryGenerationAttempts: number;
  aiCategoryGenerationErrors: string[];
}
