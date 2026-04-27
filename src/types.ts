export interface Player {
  id: 'player_1' | 'player_2';
  name: string;
  color: string;
}

export interface PromptLog {
  player1Text: string;
  player2Text: string;
  judgingLog: JudgingResult;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  createdBy: 'player_1' | 'player_2' | 'ai';
  capturedBy: 'player_1' | 'player_2' | null;
  history: PromptLog[]; 
  isTie: boolean;
}

export interface JudgingResult {
  wit: string;
  creativity: string;
  adherence_to_category: string;
  bonus_for_media_politics_references: string;
  effort: string;
  elegance_of_prose: string;
  impressiveness: string;
  player_1_feedback: string;
  player_2_feedback: string;
  verdict_sentence: string;
  winner_id: 'player_1' | 'player_2' | 'tie';
}

export type GameScreen = 
  | 'API_SETUP'
  | 'ONBOARDING'
  | 'CATEGORY_CREATION'
  | 'BATTLE_PATH'
  | 'HANDOFF'
  | 'PROMPT_ENTRY'
  | 'RESOLVING'
  | 'RESULTS_MODAL'
  | 'WIN_SCREEN';