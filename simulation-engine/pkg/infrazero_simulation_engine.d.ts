/* tslint:disable */
/* eslint-disable */

/**
 * JS-friendly wrapper to schedule chaos events from the frontend "Chaos Mode" UI.
 */
export class ChaosBridge {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Schedule a "Cascade Failure" from the JS UI.
     */
    cascade_failure(origin_node: string, intensity: number, trigger_tick: bigint): void;
    /**
     * Schedule a "CPU Spike" event from the JS UI.
     */
    cpu_spike(node_id: string, intensity: number, trigger_tick: bigint, duration_ticks?: bigint | null): void;
    /**
     * Schedule a "Kill Node" event from the JS UI.
     */
    kill_node(node_id: string, trigger_tick: bigint, duration_ticks?: bigint | null): void;
    constructor();
    /**
     * Schedule a "Partition Edge" event from the JS UI.
     */
    partition_edge(edge_id: string, trigger_tick: bigint, duration_ticks?: bigint | null): void;
    /**
     * Serializes scheduled events to JSON for transfer to the SimulationEngine.
     */
    to_json(): string;
}

/**
 * WASM-exposed function: compute the stable SHA-256 hash of a graph.
 * Used by the frontend to verify two peers have identical graph state.
 */
export function get_graph_hash(input_json: string): string;

export function get_telemetry(input_json: string): string;

/**
 * WASM-exposed function: run a full simulation from a JSON input string.
 * Called by the React frontend's "Deploy & Test" button handler.
 */
export function run_simulation(input_json: string): string;

/**
 * WASM-exposed function: validate a graph without running the simulation.
 * Used by the frontend to show topology errors before committing a run.
 */
export function validate_graph(input_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_chaosbridge_free: (a: number, b: number) => void;
    readonly chaosbridge_cascade_failure: (a: number, b: number, c: number, d: number, e: bigint) => void;
    readonly chaosbridge_cpu_spike: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: bigint) => void;
    readonly chaosbridge_kill_node: (a: number, b: number, c: number, d: bigint, e: number, f: bigint) => void;
    readonly chaosbridge_new: () => number;
    readonly chaosbridge_partition_edge: (a: number, b: number, c: number, d: bigint, e: number, f: bigint) => void;
    readonly chaosbridge_to_json: (a: number) => [number, number];
    readonly get_graph_hash: (a: number, b: number) => [number, number];
    readonly get_telemetry: (a: number, b: number) => [number, number];
    readonly run_simulation: (a: number, b: number) => [number, number];
    readonly validate_graph: (a: number, b: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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
