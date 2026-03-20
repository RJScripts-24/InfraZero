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
