import type { ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: string;
  badge?: string;
  description?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export default function CollapsibleSection({
  title,
  badge,
  description,
  open,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className="flex flex-col bg-white/[0.03] border border-white/[0.06] rounded-md overflow-hidden">
      <button
        className="flex items-center gap-1.5 px-2 py-1.5 bg-transparent border-0 cursor-pointer text-left font-mono hover:bg-white/[0.04]"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="text-[8px] text-white/40 w-2.5 shrink-0">
          {open ? '\u25BC' : '\u25B6'}
        </span>
        <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">
          {title}
        </span>
        {badge && (
          <span className="ml-auto text-[9px] px-1.5 py-px rounded-full bg-[#007acc]/20 text-[#00b4ff]/80 font-medium">
            {badge}
          </span>
        )}
      </button>
      {description && open && (
        <p className="m-0 px-2 pb-1 text-[10px] italic text-white/35 leading-snug">
          {description}
        </p>
      )}
      {open && (
        <div className="flex flex-col gap-1.5 px-2 pt-1 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}
