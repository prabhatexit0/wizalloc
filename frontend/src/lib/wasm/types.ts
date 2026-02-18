/** Represents a single node in the linked list for rendering. */
export interface ListNode {
	/** Arena index of this node */
	index: number;
	/** The stored value */
	value: number;
	/** Arena index of the next node, or null if tail */
	next: number | null;
}

/** A single arena slot — includes both alive and dead entries. */
export interface ArenaSlot {
	/** Position in the arena array */
	index: number;
	/** Stored value (only meaningful when alive) */
	value: number;
	/** Next pointer (only meaningful when alive) */
	next: number | null;
	/** Whether this slot is currently in use */
	alive: boolean;
}

/** Action types for traversal animation steps. */
export const enum StepAction {
	Visit = 0,
	Insert = 1,
	Delete = 2,
	Found = 3
}

/** A single traversal step recorded by the engine. */
export interface TraversalStep {
	/** Arena index of the node involved */
	index: number;
	/** What happened at this node */
	action: StepAction;
}

/** Decoded snapshot of the linked list state. */
export interface LinkedListSnapshot {
	/** Number of live nodes */
	length: number;
	/** Arena index of the head node, or null */
	head: number | null;
	/** Real WASM linear memory address of the arena buffer */
	arenaBasePtr: number;
	/** Size of each Node struct in bytes (from Rust std::mem::size_of) */
	nodeSize: number;
	/** Live nodes in arena order */
	arena: ListNode[];
	/** Every slot in the arena (alive + dead) for memory layout view */
	allSlots: ArenaSlot[];
	/** Ordered list of live nodes by following next pointers from head */
	ordered: ListNode[];
	/** Traversal steps from the last operation */
	traversal: TraversalStep[];
}

const NULL = 0xFFFFFFFF; // u32::MAX

/**
 * Decode a flat Uint32Array snapshot from the WASM engine into
 * a structured TypeScript object.
 *
 * Layout:
 *   [total_nodes, head_index, arena_base_ptr, node_size,
 *    arena_len, (value, next, alive)×arena_len,
 *    traversal_len, (index, action)×traversal_len ]
 */
export function decodeSnapshot(buf: Uint32Array | number[]): LinkedListSnapshot {
	let i = 0;
	const length = buf[i++];
	const rawHead = buf[i++];
	const head = rawHead === NULL ? null : rawHead;
	const arenaBasePtr = buf[i++];
	const nodeSize = buf[i++];

	const arenaLen = buf[i++];
	const arena: ListNode[] = [];
	const allSlots: ArenaSlot[] = [];
	for (let a = 0; a < arenaLen; a++) {
		const value = buf[i++];
		const rawNext = buf[i++];
		const alive = buf[i++];
		const next = rawNext === NULL ? null : rawNext;
		allSlots.push({ index: a, value, next, alive: !!alive });
		if (alive) {
			arena.push({ index: a, value, next });
		}
	}

	// Build ordered list by walking from head
	const ordered: ListNode[] = [];
	if (head !== null) {
		const nodeMap = new Map<number, ListNode>();
		for (const node of arena) {
			nodeMap.set(node.index, node);
		}
		let cur: number | null = head;
		let safety = 0;
		while (cur !== null && safety < arenaLen + 1) {
			const node = nodeMap.get(cur);
			if (!node) break;
			ordered.push(node);
			cur = node.next;
			safety++;
		}
	}

	const travLen = buf[i++];
	const traversal: TraversalStep[] = [];
	for (let t = 0; t < travLen; t++) {
		const index = buf[i++];
		const action = buf[i++];
		traversal.push({ index, action: action as StepAction });
	}

	return { length, head, arenaBasePtr, nodeSize, arena, allSlots, ordered, traversal };
}
