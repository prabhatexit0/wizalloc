import { useEffect, useState, useRef, useCallback } from 'react';
import { useStorageStore } from '@/stores/storage';
import { useLayoutStore } from '@/stores/layout';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import StorageControlPanel from '@/components/panels/StorageControlPanel';
import BufferPoolCanvas from '@/components/canvas/BufferPoolCanvas';
import DiskCanvas from '@/components/canvas/DiskCanvas';
import PageInspectorCanvas from '@/components/canvas/PageInspectorCanvas';
import PaneDivider from '@/components/layout/PaneDivider';
import PaneHeader from '@/components/layout/PaneHeader';

export default function App() {
  const initWasm = useStorageStore((s) => s.initWasm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const vizRef = useRef<HTMLDivElement>(null);
  const topRowRef = useRef<HTMLDivElement>(null);
  const [vizHeight, setVizHeight] = useState(0);
  const [topRowWidth, setTopRowWidth] = useState(0);

  const layout = useLayoutStore();

  useEffect(() => {
    initWasm()
      .then(() => setLoading(false))
      .catch((e) => setError(String(e)));
  }, [initWasm]);

  useEffect(() => {
    const el = vizRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setVizHeight(entries[0].contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  useEffect(() => {
    const el = topRowRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setTopRowWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, isMobile]);

  const handleHorizontalResize = useCallback(
    (delta: number) => {
      if (vizHeight === 0) return;
      layout.setTopBottomRatio(layout.topBottomRatio + delta / vizHeight);
    },
    [vizHeight, layout],
  );

  const handleVerticalResize = useCallback(
    (delta: number) => {
      if (topRowWidth === 0) return;
      layout.setLeftRightRatio(layout.leftRightRatio + delta / topRowWidth);
    },
    [topRowWidth, layout],
  );

  const topRowFlex = layout.inspectorCollapsed
    ? '1 1 0%'
    : `${layout.topBottomRatio} 1 0%`;
  const bottomRowFlex = layout.inspectorCollapsed
    ? '0 0 24px'
    : `${1 - layout.topBottomRatio} 1 0%`;
  const bpFlex = layout.diskCollapsed
    ? '1 1 0%'
    : `${layout.leftRightRatio} 1 0%`;
  const diskFlex = layout.bufferPoolCollapsed
    ? '1 1 0%'
    : `${1 - layout.leftRightRatio} 1 0%`;

  if (error) {
    return (
      <div className="h-dvh w-screen flex items-center justify-center text-red-400 font-mono text-sm">
        Failed to load WASM: {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-dvh w-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center gap-3 text-white/50 font-mono text-[13px]">
          <div className="w-4 h-4 border-2 border-white/10 border-t-[#007acc] rounded-full animate-spin" />
          <span>Loading WASM...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh w-screen flex flex-col overflow-hidden pt-[env(safe-area-inset-top,0px)]">
      <Header />
      <main className="flex-1 min-h-0 flex flex-col">
        <div className={`flex h-full min-h-0 ${isMobile ? 'flex-col' : ''}`}>
          {isMobile ? (
            <MobileLayout vizRef={vizRef} />
          ) : (
            <DesktopLayout
              vizRef={vizRef}
              topRowRef={topRowRef}
              topRowFlex={topRowFlex}
              bottomRowFlex={bottomRowFlex}
              bpFlex={bpFlex}
              diskFlex={diskFlex}
              handleHorizontalResize={handleHorizontalResize}
              handleVerticalResize={handleVerticalResize}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between h-9 px-4 pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))] border-b border-white/[0.06] shrink-0">
      <span className="font-mono text-[13px] font-semibold text-white/90 tracking-tight">
        wizalloc
      </span>
    </header>
  );
}

function MobileLayout({ vizRef }: { vizRef: React.RefObject<HTMLDivElement | null> }) {
  const layout = useLayoutStore();

  return (
    <>
      <aside className={`border-b border-white/[0.06] shrink-0 ${layout.sidebarCollapsed ? '' : 'max-h-[40vh]'}`}>
        <PaneHeader title="Controls" collapsed={layout.sidebarCollapsed} onToggle={layout.toggleSidebar} />
        {!layout.sidebarCollapsed && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <StorageControlPanel />
          </div>
        )}
      </aside>
      <div ref={vizRef} className="flex-1 min-w-0 flex flex-col overflow-y-auto">
        <MobilePane title="Buffer Pool" collapsed={layout.bufferPoolCollapsed} onToggle={layout.toggleBufferPool}>
          <BufferPoolCanvas />
        </MobilePane>
        <MobilePane title="Disk" collapsed={layout.diskCollapsed} onToggle={layout.toggleDisk}>
          <DiskCanvas />
        </MobilePane>
        <MobilePane title="Page Inspector" collapsed={layout.inspectorCollapsed} onToggle={layout.toggleInspector}>
          <PageInspectorCanvas />
        </MobilePane>
      </div>
    </>
  );
}

function MobilePane({
  title,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col overflow-hidden border-b border-white/[0.06] shrink-0 ${collapsed ? 'h-auto' : 'h-[50vh]'}`}>
      <PaneHeader title={title} collapsed={collapsed} onToggle={onToggle} />
      {!collapsed && <div className="flex-1 min-h-0 min-w-0">{children}</div>}
    </div>
  );
}

function DesktopLayout({
  vizRef,
  topRowRef,
  topRowFlex,
  bottomRowFlex,
  bpFlex,
  diskFlex,
  handleHorizontalResize,
  handleVerticalResize,
}: {
  vizRef: React.RefObject<HTMLDivElement | null>;
  topRowRef: React.RefObject<HTMLDivElement | null>;
  topRowFlex: string;
  bottomRowFlex: string;
  bpFlex: string;
  diskFlex: string;
  handleHorizontalResize: (delta: number) => void;
  handleVerticalResize: (delta: number) => void;
}) {
  const layout = useLayoutStore();

  return (
    <>
      {/* Sidebar */}
      {layout.sidebarCollapsed ? (
        <aside className="flex flex-row shrink-0">
          <PaneHeader title="Controls" collapsed={true} onToggle={layout.toggleSidebar} vertical={true} />
        </aside>
      ) : (
        <aside className="w-[300px] min-w-[260px] max-w-[340px] border-r border-white/[0.06] shrink-0 flex flex-col overflow-hidden">
          <PaneHeader title="Controls" collapsed={false} onToggle={layout.toggleSidebar} />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <StorageControlPanel />
          </div>
        </aside>
      )}

      {/* Viz area */}
      <div ref={vizRef} className="flex-1 min-w-0 flex flex-col">
        {/* Top row: Buffer Pool + Disk */}
        <div ref={topRowRef} className="flex min-h-0" style={{ flex: topRowFlex }}>
          {layout.bufferPoolCollapsed ? (
            <div className="flex flex-row" style={{ flex: '0 0 24px' }}>
              <PaneHeader title="Buffer Pool" collapsed={true} onToggle={layout.toggleBufferPool} vertical={true} />
            </div>
          ) : (
            <div className="min-w-0 min-h-0 relative flex flex-col overflow-hidden" style={{ flex: bpFlex }}>
              <PaneHeader title="Buffer Pool" collapsed={false} onToggle={layout.toggleBufferPool} />
              <div className="flex-1 min-h-0 min-w-0">
                <BufferPoolCanvas />
              </div>
            </div>
          )}

          {!layout.bufferPoolCollapsed && !layout.diskCollapsed && (
            <PaneDivider orientation="vertical" onResize={handleVerticalResize} />
          )}

          {layout.diskCollapsed ? (
            <div className="flex flex-row" style={{ flex: '0 0 24px' }}>
              <PaneHeader title="Disk" collapsed={true} onToggle={layout.toggleDisk} vertical={true} />
            </div>
          ) : (
            <div className="min-w-0 min-h-0 relative flex flex-col overflow-hidden" style={{ flex: diskFlex }}>
              <PaneHeader title="Disk" collapsed={false} onToggle={layout.toggleDisk} />
              <div className="flex-1 min-h-0 min-w-0">
                <DiskCanvas />
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        {!layout.inspectorCollapsed && (
          <PaneDivider orientation="horizontal" onResize={handleHorizontalResize} />
        )}

        {/* Bottom row: Page Inspector */}
        <div className="flex min-h-0" style={{ flex: bottomRowFlex }}>
          <div className="flex-1 min-w-0 min-h-0 relative flex flex-col overflow-hidden">
            <PaneHeader title="Page Inspector" collapsed={layout.inspectorCollapsed} onToggle={layout.toggleInspector} />
            {!layout.inspectorCollapsed && (
              <div className="flex-1 min-h-0 min-w-0">
                <PageInspectorCanvas />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
