import init, { LinkedList } from 'wizalloc-engine';
import wasmUrl from 'wizalloc-engine/wizalloc_engine_bg.wasm?url';
import { decodeSnapshot, type LinkedListSnapshot } from './types.js';

let initialized = false;

/** Initialize the WASM module. Safe to call multiple times. */
export async function initEngine(): Promise<void> {
	if (initialized) return;
	await init({ module_or_path: wasmUrl });
	initialized = true;
}

/** Thin wrapper around the WASM LinkedList that handles decoding. */
export class LinkedListEngine {
	private inner: LinkedList;

	constructor() {
		this.inner = new LinkedList();
	}

	pushFront(value: number): LinkedListSnapshot {
		this.inner.push_front(value);
		return this.snap();
	}

	insertSorted(value: number): LinkedListSnapshot {
		this.inner.insert_sorted(value);
		return this.snap();
	}

	delete(value: number): { found: boolean; snapshot: LinkedListSnapshot } {
		const found = this.inner.delete(value);
		return { found, snapshot: this.snap() };
	}

	search(value: number): { foundIndex: number | null; snapshot: LinkedListSnapshot } {
		const raw = this.inner.search(value);
		const foundIndex = raw === 0xFFFFFFFF ? null : raw;
		return { foundIndex, snapshot: this.snap() };
	}

	sort(): LinkedListSnapshot {
		this.inner.sort();
		return this.snap();
	}

	clear(): LinkedListSnapshot {
		this.inner.clear();
		return this.snap();
	}

	generateRandom(count: number, maxValue: number = 999): LinkedListSnapshot {
		this.inner.generate_random(count, maxValue);
		return this.snap();
	}

	get length(): number {
		return this.inner.length();
	}

	snap(): LinkedListSnapshot {
		const buf = this.inner.snapshot();
		return decodeSnapshot(buf);
	}

	destroy(): void {
		this.inner.free();
	}
}
