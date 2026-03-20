/* @ts-self-types="./simulation_engine.d.ts" */

/**
 * JS-friendly wrapper to schedule chaos events from the frontend "Chaos Mode" UI.
 */
class ChaosBridge {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ChaosBridgeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_chaosbridge_free(ptr, 0);
    }
    /**
     * Schedule a "Cascade Failure" from the JS UI.
     * @param {string} origin_node
     * @param {number} intensity
     * @param {bigint} trigger_tick
     */
    cascade_failure(origin_node, intensity, trigger_tick) {
        const ptr0 = passStringToWasm0(origin_node, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.chaosbridge_cascade_failure(this.__wbg_ptr, ptr0, len0, intensity, trigger_tick);
    }
    /**
     * Schedule a "CPU Spike" event from the JS UI.
     * @param {string} node_id
     * @param {number} intensity
     * @param {bigint} trigger_tick
     * @param {bigint | null} [duration_ticks]
     */
    cpu_spike(node_id, intensity, trigger_tick, duration_ticks) {
        const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.chaosbridge_cpu_spike(this.__wbg_ptr, ptr0, len0, intensity, trigger_tick, !isLikeNone(duration_ticks), isLikeNone(duration_ticks) ? BigInt(0) : duration_ticks);
    }
    /**
     * Schedule a "Kill Node" event from the JS UI.
     * @param {string} node_id
     * @param {bigint} trigger_tick
     * @param {bigint | null} [duration_ticks]
     */
    kill_node(node_id, trigger_tick, duration_ticks) {
        const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.chaosbridge_kill_node(this.__wbg_ptr, ptr0, len0, trigger_tick, !isLikeNone(duration_ticks), isLikeNone(duration_ticks) ? BigInt(0) : duration_ticks);
    }
    constructor() {
        const ret = wasm.chaosbridge_new();
        this.__wbg_ptr = ret >>> 0;
        ChaosBridgeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Schedule a "Partition Edge" event from the JS UI.
     * @param {string} edge_id
     * @param {bigint} trigger_tick
     * @param {bigint | null} [duration_ticks]
     */
    partition_edge(edge_id, trigger_tick, duration_ticks) {
        const ptr0 = passStringToWasm0(edge_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.chaosbridge_partition_edge(this.__wbg_ptr, ptr0, len0, trigger_tick, !isLikeNone(duration_ticks), isLikeNone(duration_ticks) ? BigInt(0) : duration_ticks);
    }
    /**
     * Serializes scheduled events to JSON for transfer to the SimulationEngine.
     * @returns {string}
     */
    to_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.chaosbridge_to_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) ChaosBridge.prototype[Symbol.dispose] = ChaosBridge.prototype.free;
exports.ChaosBridge = ChaosBridge;

/**
 * WASM-exposed function: compute the stable SHA-256 hash of a graph.
 * Used by the frontend to verify two peers have identical graph state.
 * @param {string} input_json
 * @returns {string}
 */
function get_graph_hash(input_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(input_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.get_graph_hash(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}
exports.get_graph_hash = get_graph_hash;

/**
 * WASM-exposed function: run a full simulation from a JSON input string.
 * Called by the React frontend's "Deploy & Test" button handler.
 * @param {string} input_json
 * @returns {string}
 */
function run_simulation(input_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(input_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.run_simulation(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}
exports.run_simulation = run_simulation;

/**
 * WASM-exposed function: validate a graph without running the simulation.
 * Used by the frontend to show topology errors before committing a run.
 * @param {string} input_json
 * @returns {string}
 */
function validate_graph(input_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(input_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.validate_graph(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}
exports.validate_graph = validate_graph;

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_6ddd609b62940d55: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_error_290af79b8e525933: function(arg0, arg1) {
            console.error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_log_9a13975ab8935ef2: function(arg0, arg1) {
            console.log(getStringFromWasm0(arg0, arg1));
        },
        __wbg_warn_6fe5cfa059b1a9e4: function(arg0, arg1) {
            console.warn(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./simulation_engine_bg.js": import0,
    };
}

const ChaosBridgeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_chaosbridge_free(ptr >>> 0, 1));

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
function decodeText(ptr, len) {
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

const wasmPath = `${__dirname}/simulation_engine_bg.wasm`;
const wasmBytes = require('fs').readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBytes);
let wasm = new WebAssembly.Instance(wasmModule, __wbg_get_imports()).exports;
wasm.__wbindgen_start();
