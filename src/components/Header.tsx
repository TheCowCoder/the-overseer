import type { ModelOption } from '../../shared/modelOptions.js';
import { ChevronDown } from 'lucide-react';
import type { MatchPlayer, PlayerId } from '../types';
import { cn } from "./Button";

interface HeaderProps {
  players: MatchPlayer[];
  spinnerPlayerIds?: PlayerId[];
  lockedPlayerIds?: PlayerId[];
  disconnectedPlayerIds?: PlayerId[];
  centerLabel?: string;
  modelOptions?: ModelOption[];
  selectedModelId?: string;
  onModelChange?: (modelId: string) => void;
}

export const Header = ({
  players,
  spinnerPlayerIds = [],
  lockedPlayerIds = [],
  disconnectedPlayerIds = [],
  centerLabel = "Live Match",
  modelOptions,
  selectedModelId,
  onModelChange,
}: HeaderProps) => {
  const leftPlayer = players[0];
  const rightPlayer = players[1];

  if (!leftPlayer) return null;

  const renderPlayer = (player: MatchPlayer | undefined, alignRight = false) => {
    if (!player) {
      return <div />;
    }

    const isLocked = lockedPlayerIds.includes(player.id);
    const isDisconnected = disconnectedPlayerIds.includes(player.id) || !player.connected;
    const showSpinner = spinnerPlayerIds.includes(player.id);
    const statusLabel = isDisconnected ? 'Offline' : isLocked ? 'Locked in' : null;

    return (
      <div className={cn("flex min-w-0 items-center gap-2", alignRight && "flex-row-reverse justify-self-end text-right")}>
        <div className="relative shrink-0">
          {showSpinner && (
            <div className="absolute -inset-1 rounded-full border-[3px] border-transparent border-r-gray-600 border-t-gray-600 animate-spin" />
          )}
          <div
            className="relative h-10 w-10 rounded-full border-2 border-white shadow-sm"
            style={{
              backgroundColor: player.color,
              opacity: isDisconnected ? 0.45 : 1,
            }}
          />
        </div>

        <div className={cn("min-w-0", alignRight && "text-right")}>
          <div className={cn("flex items-center gap-2", alignRight && "flex-row-reverse")}>
            <span className="truncate text-sm font-bold text-gray-700">{player.name}</span>
          </div>

          {statusLabel && (
            <span className={cn(
              "mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em]",
              isDisconnected ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700",
            )}>
              {statusLabel}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed top-0 z-40 w-full max-w-md rounded-b-[2rem] border-b-2 border-gray-100 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        {renderPlayer(leftPlayer)}

        {modelOptions && selectedModelId && onModelChange ? (
          <div className="relative justify-self-center">
            <select
              value={selectedModelId}
              onChange={(event) => onModelChange(event.target.value)}
              className="w-auto appearance-none rounded-full border border-gray-200 bg-white py-1.5 pl-2.5 pr-7 text-[10px] font-black tracking-[0.14em] text-gray-600 shadow-sm outline-none transition-all hover:border-gray-300 focus:border-duo-blue"
            >
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        ) : (
          <div className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-center text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 shadow-sm">
            {centerLabel}
          </div>
        )}

        {renderPlayer(rightPlayer, true)}
      </div>
    </div>
  );
};