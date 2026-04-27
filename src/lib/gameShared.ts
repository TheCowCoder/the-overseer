import type { Category, MatchPlayer, Player, PlayerId } from '../types';

export const BOARD_WIDTH = 320;
export const BOARD_SWAY = 38;
export const BOARD_TOP_OFFSET = 100;
export const BOARD_STEP = 160;

export const buildBoardPath = (boardHeight: number) => {
  const points: string[] = [];

  for (let y = 0; y <= boardHeight; y += 5) {
    const x = BOARD_WIDTH / 2 + Math.sin((y - 20) / 50) * BOARD_SWAY;
    points.push(`${x},${y}`);
  }

  return points.length > 0 ? `M ${points.join(' L ')}` : '';
};

export const otherPlayerId = (playerId: PlayerId) => (playerId === 'player_1' ? 'player_2' : 'player_1');

export const getCapturedScore = (categories: Category[], playerId: PlayerId) =>
  categories.filter((category) => category.capturedBy === playerId).length;

export const toConnectedMatchPlayers = (players: Player[], categories: Category[]): MatchPlayer[] =>
  players.map((player) => ({
    ...player,
    connected: true,
    score: getCapturedScore(categories, player.id),
  }));