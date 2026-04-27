import { Player } from "../types";
import { cn } from "./Button";

export const Header = ({ players, activePlayerId }: { players: Player[], activePlayerId?: string }) => {
  if (players.length === 0) return null;

  return (
    <div className="fixed top-0 w-full max-w-md flex justify-between p-4 z-40 bg-white/80 backdrop-blur-md border-b-2 border-gray-100">
      {players.map((p) => (
        <div key={p.id} className="flex items-center gap-3">
          <div 
            className={cn(
              "w-12 h-12 rounded-full transition-all border-4",
              activePlayerId === p.id ? "scale-110 shadow-lg" : "scale-100 border-transparent"
            )}
            style={{ 
              backgroundColor: p.color,
              borderColor: activePlayerId === p.id ? p.color : 'transparent',
              boxShadow: activePlayerId === p.id ? `0 0 15px ${p.color}80` : 'none'
            }}
          />
          <span className={cn(
            "font-bold text-lg", 
            activePlayerId === p.id ? "text-gray-900" : "text-gray-400"
          )}>
            {p.name}
          </span>
        </div>
      ))}
    </div>
  );
};