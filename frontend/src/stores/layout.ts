import { create } from 'zustand';

const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

function clampRatio(v: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, v));
}

interface LayoutState {
  topBottomRatio: number;
  leftRightRatio: number;
  sidebarCollapsed: boolean;
  bufferPoolCollapsed: boolean;
  diskCollapsed: boolean;
  inspectorCollapsed: boolean;

  setTopBottomRatio: (v: number) => void;
  setLeftRightRatio: (v: number) => void;
  toggleSidebar: () => void;
  toggleBufferPool: () => void;
  toggleDisk: () => void;
  toggleInspector: () => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  topBottomRatio: 0.5,
  leftRightRatio: 0.5,
  sidebarCollapsed: false,
  bufferPoolCollapsed: false,
  diskCollapsed: false,
  inspectorCollapsed: false,

  setTopBottomRatio: (v) => set({ topBottomRatio: clampRatio(v) }),
  setLeftRightRatio: (v) => set({ leftRightRatio: clampRatio(v) }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleBufferPool: () => set((s) => ({ bufferPoolCollapsed: !s.bufferPoolCollapsed })),
  toggleDisk: () => set((s) => ({ diskCollapsed: !s.diskCollapsed })),
  toggleInspector: () => set((s) => ({ inspectorCollapsed: !s.inspectorCollapsed })),
}));
