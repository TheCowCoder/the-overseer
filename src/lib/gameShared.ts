import type { Category, MatchPlayer, Player, PlayerId } from '../types';

export const BOARD_WIDTH = 320;
export const BOARD_SWAY = 50;
export const BOARD_TOP_OFFSET = 120;
export const BOARD_STEP = 160;

export const buildBoardPath = (boardHeight: number) => {
  const points: string[] = [];

  for (let y = 0; y <= boardHeight; y += 5) {
    const yRelative = y - BOARD_TOP_OFFSET;
    // We use cos so that yRelative = 0 (the first card) starts at a peak (cos(0)=1)
    const x = BOARD_WIDTH / 2 + Math.cos((yRelative * Math.PI) / BOARD_STEP) * BOARD_SWAY;
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