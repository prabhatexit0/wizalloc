// Pane layout state: ratios and collapse toggles

let topBottomRatio = $state(0.5);
let leftRightRatio = $state(0.5);
let sidebarCollapsed = $state(false);
let bufferPoolCollapsed = $state(false);
let diskCollapsed = $state(false);
let inspectorCollapsed = $state(false);

const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

function clampRatio(v: number): number {
	return Math.min(MAX_RATIO, Math.max(MIN_RATIO, v));
}

export const layoutState = {
	get topBottomRatio() { return topBottomRatio; },
	get leftRightRatio() { return leftRightRatio; },
	get sidebarCollapsed() { return sidebarCollapsed; },
	get bufferPoolCollapsed() { return bufferPoolCollapsed; },
	get diskCollapsed() { return diskCollapsed; },
	get inspectorCollapsed() { return inspectorCollapsed; },

	setTopBottomRatio(v: number) { topBottomRatio = clampRatio(v); },
	setLeftRightRatio(v: number) { leftRightRatio = clampRatio(v); },

	toggleSidebar() { sidebarCollapsed = !sidebarCollapsed; },
	toggleBufferPool() { bufferPoolCollapsed = !bufferPoolCollapsed; },
	toggleDisk() { diskCollapsed = !diskCollapsed; },
	toggleInspector() { inspectorCollapsed = !inspectorCollapsed; },
};
