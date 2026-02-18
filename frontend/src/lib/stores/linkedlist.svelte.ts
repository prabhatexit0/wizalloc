import { initEngine, LinkedListEngine } from '$lib/wasm/engine.js';
import type { LinkedListSnapshot, TraversalStep } from '$lib/wasm/types.js';
import { StepAction } from '$lib/wasm/types.js';

export type OperationKind = 'push_front' | 'insert_sorted' | 'delete' | 'search' | 'sort' | 'clear' | 'generate';

export interface OperationResult {
	kind: OperationKind;
	value?: number;
	found?: boolean;
	foundIndex?: number | null;
}

const EMPTY_SNAPSHOT: LinkedListSnapshot = {
	length: 0,
	head: null,
	arenaBasePtr: 0,
	nodeSize: 12,
	arena: [],
	allSlots: [],
	ordered: [],
	traversal: []
};

/**
 * Reactive Svelte 5 store for the LinkedList WASM engine.
 * Uses $state runes for fine-grained reactivity.
 */
export function createLinkedListStore() {
	let engine: LinkedListEngine | null = null;
	let snapshot = $state<LinkedListSnapshot>(EMPTY_SNAPSHOT);
	let ready = $state(false);
	let lastOp = $state<OperationResult | null>(null);
	let animatingSteps = $state<TraversalStep[]>([]);
	let activeStepIndex = $state(-1);
	let animating = $state(false);
	let animationSpeed = $state(200); // ms per step
	let selectedIndex = $state<number | null>(null);
	let blinking = $state(false);

	async function initialize() {
		await initEngine();
		engine = new LinkedListEngine();
		snapshot = engine.snap();
		ready = true;
	}

	function animateTraversal(steps: TraversalStep[], onComplete?: () => void): Promise<void> {
		return new Promise((resolve) => {
			if (steps.length === 0) {
				onComplete?.();
				resolve();
				return;
			}
			animatingSteps = steps;
			animating = true;
			activeStepIndex = 0;

			const interval = setInterval(() => {
				activeStepIndex++;
				if (activeStepIndex >= steps.length) {
					clearInterval(interval);
					animating = false;
					onComplete?.();
					resolve();
				}
			}, animationSpeed);
		});
	}

	function pushFront(value: number) {
		if (!engine) return;
		const snap = engine.pushFront(value);
		snapshot = snap;
		lastOp = { kind: 'push_front', value };
		animateTraversal(snap.traversal);
	}

	function insertSorted(value: number) {
		if (!engine) return;
		const snap = engine.insertSorted(value);
		snapshot = snap;
		lastOp = { kind: 'insert_sorted', value };
		animateTraversal(snap.traversal);
	}

	function deleteValue(value: number) {
		if (!engine) return;
		// Capture pre-delete snapshot so the node stays visible during animation
		const preSnap = engine.snap();
		const { found, snapshot: postSnap } = engine.delete(value);
		lastOp = { kind: 'delete', value, found };

		if (!found || postSnap.traversal.length === 0) {
			snapshot = postSnap;
			animateTraversal(postSnap.traversal);
			return;
		}

		// Show pre-delete state (node still in ordered list) during traversal,
		// then blink the deleted node before removing it.
		snapshot = preSnap;
		animateTraversal(postSnap.traversal, () => {
			// Keep animating=true during blink phase
			animating = true;
			blinking = true;
			const lastIdx = postSnap.traversal.length - 1;
			let blinks = 0;
			const blinkInterval = setInterval(() => {
				activeStepIndex = blinks % 2 === 0 ? -1 : lastIdx;
				blinks++;
				if (blinks >= 6) {
					clearInterval(blinkInterval);
					animatingSteps = [];
					activeStepIndex = -1;
					animating = false;
					blinking = false;
					snapshot = postSnap;
				}
			}, 100);
		});
	}

	function searchValue(value: number) {
		if (!engine) return;
		const { foundIndex, snapshot: snap } = engine.search(value);
		snapshot = snap;
		lastOp = { kind: 'search', value, foundIndex };
		animateTraversal(snap.traversal);
	}

	function sortList() {
		if (!engine) return;
		animatingSteps = [];
		activeStepIndex = -1;
		animating = false;
		snapshot = engine.sort();
		lastOp = { kind: 'sort' };
	}

	function clear() {
		if (!engine) return;
		animatingSteps = [];
		activeStepIndex = -1;
		animating = false;
		snapshot = engine.clear();
		lastOp = { kind: 'clear' };
	}

	function generateRandom(count: number, maxValue: number = 999) {
		if (!engine) return;
		animatingSteps = [];
		activeStepIndex = -1;
		animating = false;
		snapshot = engine.generateRandom(count, maxValue);
		lastOp = { kind: 'generate' };
	}

	function setAnimationSpeed(ms: number) {
		animationSpeed = ms;
	}

	function selectNode(index: number | null) {
		selectedIndex = selectedIndex === index ? null : index;
	}

	function destroy() {
		engine?.destroy();
		engine = null;
	}

	return {
		initialize,
		pushFront,
		insertSorted,
		deleteValue,
		searchValue,
		sortList,
		clear,
		generateRandom,
		setAnimationSpeed,
		selectNode,
		destroy,
		get snapshot() { return snapshot; },
		get ready() { return ready; },
		get lastOp() { return lastOp; },
		get animatingSteps() { return animatingSteps; },
		get activeStepIndex() { return activeStepIndex; },
		get animating() { return animating; },
		get animationSpeed() { return animationSpeed; },
		get selectedIndex() { return selectedIndex; },
		get blinking() { return blinking; },
	};
}
