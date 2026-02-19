interface PaneHeaderProps {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  vertical?: boolean;
}

export default function PaneHeader({ title, collapsed, onToggle, vertical = false }: PaneHeaderProps) {
  if (vertical) {
    return (
      <button
        className="w-6 h-full flex flex-col items-center gap-1.5 py-2 bg-white/[0.03] border-0 border-r border-white/[0.06] cursor-pointer select-none hover:bg-white/[0.06]"
        onClick={onToggle}
        aria-label={`Expand ${title}`}
      >
        <span className="text-white/40 text-[8px] leading-none">&#9654;</span>
        <span className="font-mono text-[10px] font-semibold tracking-wider text-white/50 uppercase [writing-mode:vertical-rl] rotate-180">
          {title}
        </span>
      </button>
    );
  }

  return (
    <button
      className="h-6 w-full flex items-center gap-1 px-2 bg-white/[0.03] border-0 border-b border-white/[0.06] shrink-0 select-none cursor-pointer hover:bg-white/[0.06]"
      onClick={onToggle}
      aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
    >
      <span className="text-white/40 text-[8px] leading-none">
        {collapsed ? '\u25B6' : '\u25BC'}
      </span>
      <span className="font-mono text-[10px] font-semibold tracking-wider text-white/50 uppercase">
        {title}
      </span>
    </button>
  );
}
