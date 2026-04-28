import { CATEGORY_ADHERENCE_MULTIPLIER_LABEL } from '../../shared/judgingWeights.js';
import type { Category, Player, PromptLog, RubricScores } from "../types";
import { cn } from "./Button";

const RUBRIC_ROWS: Array<{ key: keyof RubricScores; label: string }> = [
  { key: "wit", label: "WIT" },
  { key: "creativity", label: "CREATIVE" },
  { key: "adherence_to_category", label: "CATEGORY" },
  { key: "bonus_for_media_politics_references", label: "MEDIA" },
  { key: "effort", label: "EFFORT" },
  { key: "elegance_of_prose", label: "PROSE" },
  { key: "impressiveness", label: "IMPRESS" },
];

interface JudgingLogPanelProps {
  category: Pick<Category, "name" | "description">;
  logs: PromptLog[];
  players: Player[];
  className?: string;
}

interface PromptBubbleProps {
  player: Player | undefined;
  text: string;
  isWinner: boolean;
  scores: RubricScores;
}

const getScoreFillColor = (value: number) => {
  const clampedValue = Math.max(0, Math.min(10, value));
  const hue = Math.round((clampedValue / 10) * 120);
  return `hsl(${hue} 82% 48%)`;
};

const PromptBubble = ({ player, text, isWinner, scores }: PromptBubbleProps) => (
  <div className="relative">
    {isWinner && <div className="absolute inset-2 rounded-[2rem] bg-[#ffd54a] opacity-75 blur-2xl" />}
    {isWinner && <div className="absolute inset-1 rounded-[2rem] border-2 border-[#fff0a6] opacity-90" />}

    <div
      className={cn(
        "relative overflow-hidden rounded-[2rem] border-2 bg-white p-5 shadow-sm",
        isWinner ? "border-[#ffe27a]" : "border-gray-100",
      )}
      style={isWinner ? { boxShadow: "0 0 0 2px rgba(255, 234, 143, 0.9)" } : undefined}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: player?.color ?? "#d1d5db" }} />
          <span className="text-xs font-black uppercase tracking-[0.22em] text-gray-400">{player?.name ?? "Player"}</span>
        </div>

        {isWinner && (
          <span className="rounded-full bg-[#ffd84d] px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#7a4b00]">
            Winner
          </span>
        )}
      </div>

      <p className="whitespace-pre-wrap break-words font-bold leading-relaxed text-gray-800">{text}</p>

      <div className="mt-4 space-y-2 rounded-[1.5rem] bg-gray-50 p-4">
        {RUBRIC_ROWS.map(({ key, label }) => {
          const isWeightedCategory = key === 'adherence_to_category';
          const value = Math.max(0, Math.min(10, scores[key]));
          return (
            <div key={key} className="grid grid-cols-[max-content_1fr] items-center gap-3">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em]',
                  isWeightedCategory ? 'border border-red-300 bg-red-500/10 text-red-600' : 'text-gray-400',
                )}
              >
                <span>{label}</span>
                {isWeightedCategory && <span className="text-[9px] text-red-500">{CATEGORY_ADHERENCE_MULTIPLIER_LABEL}</span>}
              </span>
              <div className={cn('h-1.5 overflow-hidden rounded-full bg-gray-200', isWeightedCategory && 'bg-red-100')}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${value * 10}%`,
                    backgroundColor: getScoreFillColor(value),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

export const JudgingLogPanel = ({ category, logs, players, className }: JudgingLogPanelProps) => {
  if (logs.length === 0) {
    return null;
  }

  const playerOne = players[0];
  const playerTwo = players[1];

  return (
    <div className={cn("space-y-6", className)}>
      <div className="rounded-[2rem] border-2 border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-gray-400">Category</p>
        <h3 className="mt-2 break-words text-2xl font-black leading-tight text-gray-800">{category.name}</h3>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed text-gray-500">{category.description}</p>
      </div>

      {logs.map((log, index) => (
        <section key={`${category.name}-${index}`} className="space-y-4">
          {logs.length > 1 && (
            <div className="text-center text-xs font-black uppercase tracking-[0.24em] text-gray-400">Round {index + 1}</div>
          )}

          <PromptBubble
            player={playerOne}
            text={log.player1Text}
            isWinner={log.judgingLog.winner_id === "player_1"}
            scores={log.judgingLog.player_1_scores}
          />

          <PromptBubble
            player={playerTwo}
            text={log.player2Text}
            isWinner={log.judgingLog.winner_id === "player_2"}
            scores={log.judgingLog.player_2_scores}
          />

          <div className="overflow-hidden rounded-[2rem] bg-gray-900 shadow-xl">
            <div className="h-2 w-full bg-duo-purple" />
            <div className="space-y-4 p-5">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-duo-purple">The Overseer Speaks</p>

              <div className="space-y-3">
                <div className="rounded-[1.25rem] bg-white/5 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-duo-purple">{playerOne?.name ?? "Player 1"}</p>
                  <p className="mt-1 break-words font-bold leading-relaxed text-white">{log.judgingLog.player_1_feedback}</p>
                </div>

                <div className="rounded-[1.25rem] bg-white/5 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-duo-purple">{playerTwo?.name ?? "Player 2"}</p>
                  <p className="mt-1 break-words font-bold leading-relaxed text-white">{log.judgingLog.player_2_feedback}</p>
                </div>
              </div>

              <div className="rounded-[1.5rem] bg-white/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-duo-yellow">Verdict</p>
                <p className="mt-2 break-words text-lg font-black leading-snug text-duo-yellow">{log.judgingLog.verdict_sentence}</p>
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
};