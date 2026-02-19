// backend/src/config/constants.ts

/**
 * AI & API Security Limits
 * Protects your Groq Llama 3 API credits from abuse.
 */
export const AI_RATE_LIMITS = {
    MAX_REQUESTS_PER_HOUR: 50, // Max AI generations per user per hour
    MAX_PROMPT_LENGTH: 2000,   // Prevents massive token consumption
};

/**
 * Graph & Topology Constraints
 * Prevents malicious users from saving infinitely large graphs
 * that could crash the browser or bloat the Supabase database.
 */
export const GRAPH_CONSTRAINTS = {
    MAX_NODES_PER_GRAPH: 100,
    MAX_EDGES_PER_GRAPH: 250,
};

/**
 * Simulation Engine Caps
 * Matches the hardcoded 10,000 requests defined in your frontend test runner.
 */
export const SIMULATION_CAPS = {
    MAX_TRAFFIC_REQUESTS: 10000, // Represents "The Thundering Herd" cap
    MAX_SIMULATION_TIME_MS: 30000, // Failsafe timeout for the WASM engine
};

/**
 * Valid Node Types (Actor Models)
 * Used to strictly type-check AI-generated JSON before sending it to the frontend.
 * Must match the `componentList` types in your frontend `WorkspacePage.tsx`.
 */
export const VALID_NODE_TYPES = [
    'Infrastructure', // Load Balancer
    'Gateway',        // API Gateway
    'Service',        // Auth Service
    'PostgreSQL',     // Database
    'Cache',          // Redis Cache
    'RabbitMQ',       // Queue
    'Background Job', // Worker
    'Edge Network',   // CDN
] as const;

export type ValidNodeType = typeof VALID_NODE_TYPES[number];

/**
 * Node Hardware & Lifecycle Defaults
 * Syncs perfectly with the "Node Configuration" right-sidebar in WorkspacePage.tsx.
 * Used to populate missing data if the AI fails to generate specific fields.
 */
export const DEFAULT_NODE_CONFIG = {
    PROCESSING_POWER_MS: 1000,
    COLD_START_LATENCY_MS: 200,
    FAILURE_RATE_PERCENT: 0.01,
    RECOVERY_TIME_MS: 500,
};

/**
 * Network Edge Link Defaults
 * Syncs perfectly with the "Network Edge Config" right-sidebar in WorkspacePage.tsx.
 */
export const DEFAULT_EDGE_CONFIG = {
    LATENCY_MS: 50,
    JITTER_MS: 10,
    PACKET_LOSS_PERCENT: 0.1,
    BANDWIDTH_LIMIT_MBPS: 100,
};

/**
 * WebSocket / Real-Time Collaboration Settings
 * Controls the Yjs & WebRTC signaling server bounds.
 */
export const WEBSOCKET_CONFIG = {
    PING_INTERVAL_MS: 30000,
    MAX_CLIENTS_PER_ROOM: 10, // Max users editing a single graph simultaneously
};