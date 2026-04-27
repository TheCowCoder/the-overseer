import { cn } from './Button';

interface StickyStatusPillProps {
  label: string;
  value: string;
  color?: string;
  className?: string;
}

export const StickyStatusPill = ({ label, value, color, className }: StickyStatusPillProps) => (
  <div className={cn('sticky top-0 z-20 mb-4 flex justify-center pt-2', className)}>
    <div className="inline-flex items-center gap-2 rounded-full border border-[#f4d66f] bg-[#fff4b8]/95 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#8a5b00] shadow-[0_0_26px_rgba(255,212,74,0.45)] backdrop-blur-sm">
      <span className="text-[#a36a00]">{label}</span>
      {color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />}
      <span className="text-[11px] text-[#6c4700]">{value}</span>
    </div>
  </div>
);