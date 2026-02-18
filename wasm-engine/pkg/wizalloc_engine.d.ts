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

export class StorageEngine {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get the current engine configuration as JSON.
     */
    config(): string;
    /**
     * Create a table. Schema JSON:
     * ```json
     * { "columns": [
     *     { "name": "id", "type": "Int32", "nullable": false },
     *     { "name": "name", "type": { "VarChar": 255 }, "nullable": true }
     * ]}
     * ```
     */
    create_table(name: string, schema_json: string): boolean;
    /**
     * Delete a row by "page_id:slot_id".
     */
    delete(table_name: string, row_id_str: string): boolean;
    /**
     * Drop a table and free its pages.
     */
    drop_table(name: string): boolean;
    /**
     * Flush all dirty pages in the buffer pool.
     */
    flush_all(): void;
    /**
     * Flush a specific page.
     */
    flush_page(page_id: number): boolean;
    /**
     * Get a row by "page_id:slot_id". Returns values as JSON array.
     */
    get(table_name: string, row_id_str: string): string;
    /**
     * Insert a row. Values JSON:
     * ```json
     * [42, "Alice", 3.14, true, null]
     * ```
     * Returns RowId as "page_id:slot_id" string.
     */
    insert(table_name: string, values_json: string): string;
    /**
     * List table names as JSON array.
     */
    list_tables(): string;
    /**
     * Create a new storage engine with the given configuration JSON.
     *
     * Config JSON format:
     * ```json
     * { "page_size": 128, "pool_size": 8, "disk_capacity": 64, "overflow_threshold": 64 }
     * ```
     */
    constructor(config_json: string);
    /**
     * Scan all rows. Returns JSON array of { "row_id": "p:s", "values": [...] }.
     */
    scan(table_name: string): string;
    /**
     * Snapshot the buffer pool state as binary.
     */
    snapshot_buffer_pool(): Uint8Array;
    /**
     * Snapshot disk overview as binary.
     */
    snapshot_disk(): Uint8Array;
    /**
     * Snapshot a single page's details as binary.
     */
    snapshot_page(page_id: number): Uint8Array | undefined;
    /**
     * Snapshot table metadata as binary.
     */
    snapshot_table(table_name: string): Uint8Array | undefined;
    /**
     * Get table schema as JSON for the frontend.
     */
    table_schema(table_name: string): string | undefined;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_linkedlist_free: (a: number, b: number) => void;
    readonly __wbg_storageengine_free: (a: number, b: number) => void;
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
    readonly storageengine_config: (a: number) => [number, number];
    readonly storageengine_create_table: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly storageengine_delete: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly storageengine_drop_table: (a: number, b: number, c: number) => number;
    readonly storageengine_flush_all: (a: number) => void;
    readonly storageengine_flush_page: (a: number, b: number) => number;
    readonly storageengine_get: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly storageengine_insert: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly storageengine_list_tables: (a: number) => [number, number];
    readonly storageengine_new: (a: number, b: number) => [number, number, number];
    readonly storageengine_scan: (a: number, b: number, c: number) => [number, number, number, number];
    readonly storageengine_snapshot_buffer_pool: (a: number) => [number, number];
    readonly storageengine_snapshot_disk: (a: number) => [number, number];
    readonly storageengine_snapshot_page: (a: number, b: number) => [number, number];
    readonly storageengine_snapshot_table: (a: number, b: number, c: number) => [number, number];
    readonly storageengine_table_schema: (a: number, b: number, c: number) => [number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
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
