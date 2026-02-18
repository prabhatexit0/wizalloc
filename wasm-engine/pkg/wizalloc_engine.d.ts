/* tslint:disable */
/* eslint-disable */

export class LinkedList {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Clear the entire list.
     */
    clear(): void;
    /**
     * Delete the first occurrence of `value`. Returns true if found.
     */
    delete(value: number): boolean;
    /**
     * Generate a random list of `count` elements.
     */
    generate_random(count: number, max_value: number): void;
    /**
     * Insert a value in sorted (ascending) order.
     */
    insert_sorted(value: number): void;
    length(): number;
    constructor();
    /**
     * Push a value to the front of the list.
     */
    push_front(value: number): void;
    /**
     * Search for a value. Returns the arena index or NULL.
     */
    search(value: number): number;
    /**
     * Snapshot the full list state as a flat Uint32Array.
     *
     * Layout:
     *   [total_nodes, head_index, arena_base_ptr, node_size,
     *    arena_len, (value, next, alive)×arena_len,
     *    traversal_len, (index, action)×traversal_len ]
     *
     * All values are u32.  `alive` is 0 or 1.
     * `arena_base_ptr` is the real WASM linear memory address of the arena.
     * `node_size` is `size_of::<Node>()` in bytes.
     */
    snapshot(): Uint32Array;
    /**
     * Sort the list in ascending order (bottom-up merge sort, O(n log n)).
     */
    sort(): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_linkedlist_free: (a: number, b: number) => void;
    readonly linkedlist_clear: (a: number) => void;
    readonly linkedlist_delete: (a: number, b: number) => number;
    readonly linkedlist_generate_random: (a: number, b: number, c: number) => void;
    readonly linkedlist_insert_sorted: (a: number, b: number) => void;
    readonly linkedlist_length: (a: number) => number;
    readonly linkedlist_new: () => number;
    readonly linkedlist_push_front: (a: number, b: number) => void;
    readonly linkedlist_search: (a: number, b: number) => number;
    readonly linkedlist_snapshot: (a: number) => [number, number];
    readonly linkedlist_sort: (a: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
