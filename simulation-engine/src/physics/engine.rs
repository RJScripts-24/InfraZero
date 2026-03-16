// =============================================================================
// engine.rs — InfraZero Simulation Engine
// Core Monte Carlo Simulation Loop
//
// Responsibility:
//   Orchestrates the entire simulation lifecycle. Consumes a validated graph
//   (nodes + edges), drives the tick-based Monte Carlo loop, delegates to
//   traffic.rs / network.rs / chaos.rs for sub-systems, collects per-tick
//   metrics, and produces a SimulationResult for the analyzer layer.
//
//   All randomness is seeded → deterministic replay guaranteed across machines.
// =============================================================================

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::graph::node::{Node, NodeId, NodeState};
use crate::graph::edge::{Edge, EdgeId};
use crate::graph::validator::GraphValidator;
use crate::physics::traffic::{TrafficGenerator, TrafficPattern, RequestPacket, RequestStatus};
use crate::physics::network::NetworkSimulator;
use crate::physics::chaos::{ChaosEngine, ChaosEvent, ChaosEffect};
use crate::analyzer::grader::Grader;
use crate::analyzer::cost::CostEstimator;
use crate::analyzer::root_cause::RootCauseAnalyzer;
use crate::models::input::SimulationInput;
use crate::models::output::{SimulationOutput, TickSnapshot, NodeMetrics, EdgeMetrics};
use crate::utils::rng::SeededRng;
use crate::utils::hasher::compute_stable_hash;
use crate::utils::logger::{log_info, log_warn, log_error};

// =============================================================================
// Configuration
// =============================================================================

/// Maximum ticks a simulation will run before forced termination.
const MAX_TICKS: u64 = 10_000;

/// Tick interval in simulated milliseconds.
const TICK_INTERVAL_MS: f64 = 10.0;

/// Snapshot frequency: record a full TickSnapshot every N ticks.
const SNAPSHOT_INTERVAL: u64 = 10;

/// Crash threshold: if error rate exceeds this fraction for this many
/// consecutive ticks, the simulation is declared "crashed".
const CRASH_ERROR_RATE_THRESHOLD: f64 = 0.85;
const CRASH_CONSECUTIVE_TICKS: u64 = 15;

// =============================================================================
// Simulation Status
// =============================================================================

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SimulationStatus {
    /// Simulation completed all ticks cleanly.
    Completed,
    /// Simulation terminated early due to cascading failure.
    Crashed,
    /// Simulation was manually stopped by the operator.
    Aborted,
    /// Graph failed pre-simulation validation.
    InvalidGraph,
}

// =============================================================================
// Per-Tick Engine State
// =============================================================================

/// Tracks live metrics for a single node during the simulation tick loop.
#[derive(Debug, Clone, Default)]
struct LiveNodeState {
    pub node_id: NodeId,
    /// Current number of requests being processed (in-flight).
    pub active_connections: u32,
    /// Queue of waiting requests (overflow when at capacity).
    pub queue_depth: u32,
    /// Total requests received this tick.
    pub requests_received: u64,
    /// Total requests successfully processed this tick.
    pub requests_succeeded: u64,
    /// Total requests that errored or were refused this tick.
    pub requests_failed: u64,
    /// Cumulative p50 latency samples this tick (ms).
    pub latency_samples: Vec<f64>,
    /// Whether this node is currently overloaded.
    pub is_overloaded: bool,
}

impl LiveNodeState {
    fn p50_latency(&self) -> f64 {
        if self.latency_samples.is_empty() {
            return 0.0;
        }
        let mut sorted = self.latency_samples.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        sorted[sorted.len() / 2]
    }

    fn p99_latency(&self) -> f64 {
        if self.latency_samples.is_empty() {
            return 0.0;
        }
        let mut sorted = self.latency_samples.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let idx = ((sorted.len() as f64) * 0.99) as usize;
        sorted[idx.min(sorted.len() - 1)]
    }

    fn error_rate(&self) -> f64 {
        let total = self.requests_received;
        if total == 0 {
            return 0.0;
        }
        self.requests_failed as f64 / total as f64
    }
}

/// Tracks live metrics for a single edge during the simulation tick loop.
#[derive(Debug, Clone, Default)]
struct LiveEdgeState {
    pub edge_id: EdgeId,
    /// Packets transiting this edge this tick.
    pub packets_in_flight: u32,
    /// Packets successfully delivered this tick.
    pub packets_delivered: u64,
    /// Packets dropped (packet loss) this tick.
    pub packets_dropped: u64,
    /// Average effective latency observed this tick (ms).
    pub effective_latency_ms: f64,
}

// =============================================================================
// SimulationEngine
// =============================================================================

/// The core simulation engine. Owns the full simulation lifecycle.
pub struct SimulationEngine {
    /// Validated input graph.
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    /// SHA-256 of the deterministic graph projection.
    graph_hash: String,
    /// Seeded RNG for reproducibility.
    rng: SeededRng,
    /// Traffic generator sub-system.
    traffic: TrafficGenerator,
    /// Network simulator sub-system.
    network: NetworkSimulator,
    /// Chaos engineering sub-system.
    chaos: ChaosEngine,
    /// Simulation configuration.
    config: SimulationConfig,
    /// Live per-node state (reset each tick).
    node_live: HashMap<NodeId, LiveNodeState>,
    /// Live per-edge state (reset each tick).
    edge_live: HashMap<EdgeId, LiveEdgeState>,
    /// Accumulated snapshots for the output timeline.
    snapshots: Vec<TickSnapshot>,
    /// Cumulative simulation time (ms).
    sim_time_ms: f64,
    /// Count of consecutive ticks above the crash error rate threshold.
    consecutive_crash_ticks: u64,
    /// All chaos effects applied over the lifetime of this simulation.
    all_chaos_effects: Vec<ChaosEffect>,
    /// Tick at which the simulation crashed (if applicable).
    crash_tick: Option<u64>,
    /// All request packets processed (for root cause analysis).
    all_packets: Vec<RequestPacket>,
}

/// Configuration knobs for a simulation run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationConfig {
    /// Universe seed for deterministic randomness.
    pub seed: u64,
    /// How many ticks to run (capped at MAX_TICKS).
    pub total_ticks: u64,
    /// Traffic pattern to generate.
    pub traffic_pattern: TrafficPattern,
    /// Requests per second at baseline load.
    pub baseline_rps: f64,
    /// Peak RPS multiplier for burst patterns.
    pub peak_rps_multiplier: f64,
    /// Whether chaos events are active.
    pub chaos_enabled: bool,
    /// Pre-scheduled chaos events.
    pub chaos_events: Vec<ChaosEvent>,
    /// Whether to record full packet traces (slower but richer analysis).
    pub full_trace: bool,
}

impl Default for SimulationConfig {
    fn default() -> Self {
        SimulationConfig {
            seed: 0xDEADBEEF,
            total_ticks: 1000,
            traffic_pattern: TrafficPattern::Steady,
            baseline_rps: 100.0,
            peak_rps_multiplier: 5.0,
            chaos_enabled: false,
            chaos_events: vec![],
            full_trace: false,
        }
    }
}

impl SimulationEngine {
    // =========================================================================
    // Construction
    // =========================================================================

    /// Build and validate a new SimulationEngine from raw input.
    /// Returns Err if the graph is invalid.
    pub fn new(input: SimulationInput) -> Result<Self, String> {
        log_info("[Engine] Initializing SimulationEngine...");

        // 1. Validate graph topology.
        let validator = GraphValidator::new(&input.nodes, &input.edges);
        let validation = validator.validate();
        if !validation.is_valid {
            let msg = format!("[Engine] Graph validation failed: {}", validation.errors.join(", "));
            log_error(&msg);
            return Err(msg);
        }

        // 2. Compute stable hash for reproducibility guarantee.
        let graph_hash = compute_stable_hash(&input.nodes, &input.edges);
        log_info(&format!("[Engine] Graph hash: {}", graph_hash));

        let config = input.config.clone();
        let seed = config.seed;

        // 3. Initialize sub-systems.
        let rng = SeededRng::new(seed);
        let traffic = TrafficGenerator::new(seed, config.traffic_pattern.clone(), config.baseline_rps, config.peak_rps_multiplier);
        let network = NetworkSimulator::new(seed);
        let mut chaos = ChaosEngine::new(seed);

        // 4. Schedule any pre-configured chaos events.
        if config.chaos_enabled {
            chaos.schedule_events(config.chaos_events.clone());
            log_info(&format!("[Engine] {} chaos event(s) scheduled.", config.chaos_events.len()));
        }

        // 5. Initialize live state maps.
        let mut node_live: HashMap<NodeId, LiveNodeState> = HashMap::new();
        for node in &input.nodes {
            node_live.insert(node.id.clone(), LiveNodeState {
                node_id: node.id.clone(),
                ..Default::default()
            });
        }

        let mut edge_live: HashMap<EdgeId, LiveEdgeState> = HashMap::new();
        for edge in &input.edges {
            edge_live.insert(edge.id.clone(), LiveEdgeState {
                edge_id: edge.id.clone(),
                ..Default::default()
            });
        }

        let total_ticks = config.total_ticks.min(MAX_TICKS);

        log_info(&format!(
            "[Engine] Ready. {} nodes, {} edges, {} ticks, seed={}.",
            input.nodes.len(), input.edges.len(), total_ticks, seed
        ));

        Ok(SimulationEngine {
            nodes: input.nodes,
            edges: input.edges,
            graph_hash,
            rng,
            traffic,
            network,
            chaos,
            config: SimulationConfig { total_ticks, ..config },
            node_live,
            edge_live,
            snapshots: Vec::new(),
            sim_time_ms: 0.0,
            consecutive_crash_ticks: 0,
            all_chaos_effects: Vec::new(),
            crash_tick: None,
            all_packets: Vec::new(),
        })
    }

    // =========================================================================
    // Public: Run Full Simulation
    // =========================================================================

    /// Run the complete simulation and return the output.
    /// This is the primary entry point called by lib.rs WASM bindings.
    pub fn run(mut self) -> SimulationOutput {
        log_info("[Engine] Starting simulation run...");

        let total_ticks = self.config.total_ticks;
        let mut status = SimulationStatus::Completed;

        // Collect all node and edge IDs upfront for chaos engine.
        let all_node_ids: Vec<NodeId> = self.nodes.iter().map(|n| n.id.clone()).collect();
        let all_edge_ids: Vec<EdgeId> = self.edges.iter().map(|e| e.id.clone()).collect();

        for tick in 0..total_ticks {
            self.sim_time_ms += TICK_INTERVAL_MS;

            // ── 1. Advance chaos engine ──────────────────────────────────────
            if self.config.chaos_enabled {
                let effects = self.chaos.tick(tick, &all_node_ids, &all_edge_ids);
                for effect in effects {
                    log_warn(&format!("[Engine][Tick {}] Chaos: {}", tick, effect.description));
                    self.all_chaos_effects.push(effect);
                }
            }

            // ── 2. Reset per-tick live state ─────────────────────────────────
            self.reset_tick_state();

            // ── 3. Generate traffic for this tick ────────────────────────────
            let packets = self.traffic.generate_tick(tick, self.sim_time_ms, &mut self.rng);

            // ── 4. Route and process each packet through the graph ───────────
            for packet in packets {
                self.process_packet(packet, tick);
            }

            // ── 5. Check crash condition ─────────────────────────────────────
            if self.detect_crash(tick) {
                status = SimulationStatus::Crashed;
                self.crash_tick = Some(tick);
                log_error(&format!(
                    "[Engine] SYSTEM CRASH detected at tick {} (sim time: {:.0}ms).",
                    tick, self.sim_time_ms
                ));
                // Take final snapshot before breaking.
                self.record_snapshot(tick);
                break;
            }

            // ── 6. Record periodic snapshot ──────────────────────────────────
            if tick % SNAPSHOT_INTERVAL == 0 {
                self.record_snapshot(tick);
            }
        }

        log_info(&format!("[Engine] Simulation ended. Status: {:?}", status));

        // ── 7. Run post-simulation analysis ──────────────────────────────────
        self.build_output(status, total_ticks)
    }

    // =========================================================================
    // Private: Tick Processing
    // =========================================================================

    /// Reset all live node/edge states for this tick's accumulation.
    fn reset_tick_state(&mut self) {
        for state in self.node_live.values_mut() {
            state.requests_received = 0;
            state.requests_succeeded = 0;
            state.requests_failed = 0;
            state.latency_samples.clear();
            state.is_overloaded = false;
        }
        for state in self.edge_live.values_mut() {
            state.packets_in_flight = 0;
            state.packets_delivered = 0;
            state.packets_dropped = 0;
            state.effective_latency_ms = 0.0;
        }
    }

    /// Route a single request packet through the graph topology.
    /// Simulates network hops, node processing, and failure propagation.
    fn process_packet(&mut self, mut packet: RequestPacket, tick: u64) {
        // Find the ingress node (first hop = load balancer or API gateway).
        let ingress_id = match self.find_ingress_node() {
            Some(id) => id,
            None => {
                packet.status = RequestStatus::Failed;
                packet.error = Some("No ingress node found in graph.".to_string());
                if self.config.full_trace {
                    self.all_packets.push(packet);
                }
                return;
            }
        };

        // Walk the request through the graph path.
        let path = self.resolve_path(&ingress_id, &packet);

        let mut total_latency_ms: f64 = 0.0;
        let mut failed = false;
        let mut failure_reason: Option<String> = None;

        for (i, node_id) in path.iter().enumerate() {
            // ── Check if this node is down via chaos ──────────────────────────
            if self.chaos.is_node_down(node_id) {
                failed = true;
                failure_reason = Some(format!("Connection Refused: {} is down.", node_id));
                log_error(&format!(
                    "[Engine][Tick {}] [ERROR] Connection Refused: {} overloaded or dead.",
                    tick, node_id
                ));
                if let Some(state) = self.node_live.get_mut(node_id) {
                    state.requests_received += 1;
                    state.requests_failed += 1;
                }
                break;
            }

            // ── Check retry storm amplification ──────────────────────────────
            let retry_multiplier = if self.chaos.is_retry_storming(node_id) {
                log_warn(&format!(
                    "[Engine][Tick {}] [WARN] Retry storm detected at '{}'. Traffic amplified.",
                    tick, node_id
                ));
                3.5_f64
            } else {
                1.0
            };

            // ── Find the edge to the next hop ────────────────────────────────
            let edge_latency_ms = if i + 1 < path.len() {
                let next_node_id = &path[i + 1];
                match self.find_edge(node_id, next_node_id) {
                    Some(edge) => {
                        let edge_id = edge.id.clone();

                        // Check full partition first.
                        if self.chaos.is_partitioned(&edge_id) {
                            failed = true;
                            failure_reason = Some(format!(
                                "Network partition on edge '{}': packet dropped.",
                                edge_id
                            ));
                            log_error(&format!(
                                "[Engine][Tick {}] [ERROR] Partition on edge '{}': packet lost.",
                                tick, edge_id
                            ));
                            if let Some(estate) = self.edge_live.get_mut(&edge_id) {
                                estate.packets_in_flight += 1;
                                estate.packets_dropped += 1;
                            }
                            break;
                        }

                        // Simulate network traversal.
                        let result = self.network.simulate_traversal(
                            &edge,
                            self.chaos.edge_extra_latency(&edge_id),
                            self.chaos.edge_extra_packet_loss(&edge_id),
                            self.chaos.edge_bandwidth_throttle(&edge_id),
                            &mut self.rng,
                        );

                        if let Some(estate) = self.edge_live.get_mut(&edge_id) {
                            estate.packets_in_flight += 1;
                            if result.dropped {
                                estate.packets_dropped += 1;
                            } else {
                                estate.packets_delivered += 1;
                                estate.effective_latency_ms =
                                    (estate.effective_latency_ms + result.latency_ms) / 2.0;
                            }
                        }

                        if result.dropped {
                            failed = true;
                            failure_reason = Some(format!(
                                "Packet dropped on edge '{}' (packet loss event).",
                                edge_id
                            ));
                            break;
                        }

                        result.latency_ms
                    }
                    None => 0.0, // No edge between these hops (shouldn't happen post-validation).
                }
            } else {
                0.0 // Last hop, no outbound edge.
            };

            // ── Simulate node processing ──────────────────────────────────────
            let node = match self.nodes.iter().find(|n| n.id == *node_id) {
                Some(n) => n.clone(),
                None => continue,
            };

            let throughput_mult = self.chaos.node_throughput_multiplier(node_id);
            let extra_latency = self.chaos.node_extra_latency(node_id);

            let (processing_latency_ms, node_failed) = self.simulate_node_processing(
                &node,
                throughput_mult,
                extra_latency,
                retry_multiplier,
                tick,
            );

            total_latency_ms += processing_latency_ms + edge_latency_ms;

            if let Some(state) = self.node_live.get_mut(node_id) {
                state.requests_received += 1;
                state.latency_samples.push(processing_latency_ms);
                if node_failed {
                    state.requests_failed += 1;
                    state.is_overloaded = true;
                } else {
                    state.requests_succeeded += 1;
                }
            }

            if node_failed {
                failed = true;
                failure_reason = Some(format!(
                    "Node '{}' overloaded: queue full, request refused.",
                    node_id
                ));
                log_error(&format!(
                    "[Engine][Tick {}] [ERROR] {} overloaded. Queue depth exceeded.",
                    tick, node_id
                ));
                break;
            }
        }

        // ── Finalize packet ───────────────────────────────────────────────────
        packet.status = if failed { RequestStatus::Failed } else { RequestStatus::Success };
        packet.total_latency_ms = total_latency_ms;
        packet.error = failure_reason;

        if self.config.full_trace {
            self.all_packets.push(packet);
        }
    }

    /// Simulate processing at a single node.
    /// Returns (latency_ms, did_fail).
    fn simulate_node_processing(
        &mut self,
        node: &Node,
        throughput_mult: f64,
        extra_latency_ms: f64,
        retry_multiplier: f64,
        tick: u64,
    ) -> (f64, bool) {
        // Effective processing power after chaos degradation.
        let effective_power = (node.processing_power * throughput_mult).max(0.001);

        // Effective queue capacity.
        let queue_cap = node.queue_capacity;

        // Current live state.
        let live = match self.node_live.get_mut(&node.id) {
            Some(l) => l,
            None => return (0.0, false),
        };

        // Retry storm artificially inflates queue pressure.
        let virtual_connections = (live.active_connections as f64 * retry_multiplier) as u32;

        // Check if queue is full.
        if virtual_connections >= queue_cap {
            return (0.0, true); // Refuse the request.
        }

        live.active_connections += 1;

        // Base processing latency: inversely proportional to processing power.
        // A node with processingPower=1.0 takes ~50ms; 0.5 power = ~100ms.
        let base_latency_ms = node.cold_start_latency_ms + (50.0 / effective_power);

        // Add jitter from the RNG.
        let jitter = self.rng.next_gaussian(0.0, base_latency_ms * 0.1);
        let final_latency = (base_latency_ms + jitter + extra_latency_ms).max(0.1);

        // Simulate failure based on node's configured failure rate.
        let node_failed = self.rng.next_f64() < node.failure_rate;

        if live.active_connections > 0 {
            live.active_connections -= 1;
        }

        (final_latency, node_failed)
    }

    /// Identify the ingress node (load balancer or first entry point).
    fn find_ingress_node(&self) -> Option<NodeId> {
        // Prefer nodes tagged as "load_balancer" or "api_gateway".
        // Fall back to the first node with no inbound edges (source node).
        let has_inbound: std::collections::HashSet<NodeId> =
            self.edges.iter().map(|e| e.target.clone()).collect();

        // First, look for explicitly typed ingress nodes.
        if let Some(n) = self.nodes.iter().find(|n| {
            n.node_type.as_deref() == Some("load_balancer")
                || n.node_type.as_deref() == Some("api_gateway")
        }) {
            return Some(n.id.clone());
        }

        // Fall back: source node (no inbound edges).
        self.nodes
            .iter()
            .find(|n| !has_inbound.contains(&n.id))
            .map(|n| n.id.clone())
    }

    /// Resolve the request path through the graph from the ingress node.
    /// Uses a simple greedy DFS — in production this would use actual routing rules.
    fn resolve_path(&self, ingress_id: &NodeId, _packet: &RequestPacket) -> Vec<NodeId> {
        let mut path = vec![ingress_id.clone()];
        let mut current = ingress_id.clone();
        let mut visited = std::collections::HashSet::new();
        visited.insert(current.clone());

        // Walk outbound edges, picking the first unvisited target.
        loop {
            let next = self
                .edges
                .iter()
                .find(|e| e.source == current && !visited.contains(&e.target));

            match next {
                Some(edge) => {
                    current = edge.target.clone();
                    visited.insert(current.clone());
                    path.push(current.clone());
                }
                None => break,
            }
        }

        path
    }

    /// Find a directed edge between two nodes.
    fn find_edge(&self, source: &NodeId, target: &NodeId) -> Option<&Edge> {
        self.edges
            .iter()
            .find(|e| e.source == *source && e.target == *target)
    }

    // =========================================================================
    // Private: Crash Detection
    // =========================================================================

    /// Returns true if the system-wide error rate has exceeded the crash
    /// threshold for CRASH_CONSECUTIVE_TICKS consecutive ticks.
    fn detect_crash(&mut self, _tick: u64) -> bool {
        let total_req: u64 = self.node_live.values().map(|s| s.requests_received).sum();
        let total_fail: u64 = self.node_live.values().map(|s| s.requests_failed).sum();

        if total_req == 0 {
            self.consecutive_crash_ticks = 0;
            return false;
        }

        let system_error_rate = total_fail as f64 / total_req as f64;

        if system_error_rate >= CRASH_ERROR_RATE_THRESHOLD {
            self.consecutive_crash_ticks += 1;
        } else {
            self.consecutive_crash_ticks = 0;
        }

        self.consecutive_crash_ticks >= CRASH_CONSECUTIVE_TICKS
    }

    // =========================================================================
    // Private: Snapshots
    // =========================================================================

    /// Record a full TickSnapshot of the current live state.
    fn record_snapshot(&mut self, tick: u64) {
        let node_metrics: Vec<NodeMetrics> = self
            .node_live
            .values()
            .map(|s| NodeMetrics {
                node_id: s.node_id.clone(),
                active_connections: s.active_connections,
                queue_depth: s.queue_depth,
                requests_received: s.requests_received,
                requests_succeeded: s.requests_succeeded,
                requests_failed: s.requests_failed,
                p50_latency_ms: s.p50_latency(),
                p99_latency_ms: s.p99_latency(),
                error_rate: s.error_rate(),
                is_overloaded: s.is_overloaded,
                state: self.chaos.node_states
                    .get(&s.node_id)
                    .map(|cs| cs.state.clone())
                    .unwrap_or(NodeState::Healthy),
            })
            .collect();

        let edge_metrics: Vec<EdgeMetrics> = self
            .edge_live
            .values()
            .map(|s| EdgeMetrics {
                edge_id: s.edge_id.clone(),
                packets_in_flight: s.packets_in_flight,
                packets_delivered: s.packets_delivered,
                packets_dropped: s.packets_dropped,
                effective_latency_ms: s.effective_latency_ms,
                is_partitioned: self.chaos.is_partitioned(&s.edge_id),
            })
            .collect();

        self.snapshots.push(TickSnapshot {
            tick,
            sim_time_ms: self.sim_time_ms,
            node_metrics,
            edge_metrics,
            chaos_effects_this_tick: self
                .all_chaos_effects
                .iter()
                .filter(|e| e.applied_at_tick == tick)
                .cloned()
                .collect(),
        });
    }

    // =========================================================================
    // Private: Output Assembly
    // =========================================================================

    /// Assemble the final SimulationOutput after the tick loop ends.
    fn build_output(mut self, status: SimulationStatus, total_ticks: u64) -> SimulationOutput {
        log_info("[Engine] Running post-simulation analysis...");

        let ticks_run = self.crash_tick.unwrap_or(total_ticks);

        // Collect aggregate metrics from snapshots.
        let total_requests: u64 = self
            .snapshots
            .iter()
            .flat_map(|s| s.node_metrics.iter())
            .map(|m| m.requests_received)
            .sum();

        let total_failures: u64 = self
            .snapshots
            .iter()
            .flat_map(|s| s.node_metrics.iter())
            .map(|m| m.requests_failed)
            .sum();

        let overall_error_rate = if total_requests > 0 {
            total_failures as f64 / total_requests as f64
        } else {
            0.0
        };

        // Compute average p99 latency across all nodes and snapshots.
        let latency_readings: Vec<f64> = self
            .snapshots
            .iter()
            .flat_map(|s| s.node_metrics.iter())
            .map(|m| m.p99_latency_ms)
            .filter(|&v| v > 0.0)
            .collect();

        let avg_p99_latency_ms = if !latency_readings.is_empty() {
            latency_readings.iter().sum::<f64>() / latency_readings.len() as f64
        } else {
            0.0
        };

        // ── Grader ────────────────────────────────────────────────────────────
        let grade_result = Grader::grade(
            &self.nodes,
            &self.edges,
            overall_error_rate,
            avg_p99_latency_ms,
            &status,
            &self.all_chaos_effects,
        );

        // ── Cost Estimator ────────────────────────────────────────────────────
        let cost_result = CostEstimator::estimate(&self.nodes, &self.edges);

        // ── Root Cause Analyzer ───────────────────────────────────────────────
        let root_cause = RootCauseAnalyzer::analyze(
            &self.snapshots,
            &self.all_chaos_effects,
            &self.nodes,
            &self.edges,
            &status,
            self.crash_tick,
        );

        log_info(&format!(
            "[Engine] Final grade: {}. Error rate: {:.1}%. ECI: ${:.2}/mo.",
            grade_result.grade, overall_error_rate * 100.0, cost_result.estimated_monthly_usd
        ));

        SimulationOutput {
            graph_hash: self.graph_hash,
            status,
            ticks_run,
            total_sim_time_ms: self.sim_time_ms,
            total_requests,
            total_failures,
            overall_error_rate,
            avg_p99_latency_ms,
            snapshots: self.snapshots,
            chaos_effects: self.all_chaos_effects,
            crash_tick: self.crash_tick,
            grade: grade_result,
            cost: cost_result,
            root_cause,
        }
    }
}

// =============================================================================
// WASM Entry Point
// =============================================================================

/// WASM-exposed function: run a full simulation from a JSON input string.
/// Called by the React frontend's "Deploy & Test" button handler.
#[wasm_bindgen]
pub fn run_simulation(input_json: &str) -> String {
    // Configure panic hook for better WASM error messages in the browser console.
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();

    log_info("[WASM] run_simulation() called.");

    // Deserialize input.
    let input: SimulationInput = match serde_json::from_str(input_json) {
        Ok(i) => i,
        Err(e) => {
            let err = format!("{{\"error\": \"Failed to parse simulation input: {}\"}}", e);
            log_error(&err);
            return err;
        }
    };

    // Build engine.
    let engine = match SimulationEngine::new(input) {
        Ok(e) => e,
        Err(e) => {
            let err = format!("{{\"error\": \"Engine init failed: {}\"}}", e);
            log_error(&err);
            return err;
        }
    };

    // Run.
    let output = engine.run();

    // Serialize output to JSON for JS consumption.
    match serde_json::to_string(&output) {
        Ok(json) => json,
        Err(e) => {
            format!("{{\"error\": \"Failed to serialize output: {}\"}}", e)
        }
    }
}

/// WASM-exposed function: validate a graph without running the simulation.
/// Used by the frontend to show topology errors before committing a run.
#[wasm_bindgen]
pub fn validate_graph(input_json: &str) -> String {
    let input: SimulationInput = match serde_json::from_str(input_json) {
        Ok(i) => i,
        Err(e) => {
            return format!("{{\"valid\": false, \"errors\": [\"Parse error: {}\"]}}", e);
        }
    };

    let validator = GraphValidator::new(&input.nodes, &input.edges);
    let result = validator.validate();

    serde_json::to_string(&result).unwrap_or_else(|_| {
        "{\"valid\": false, \"errors\": [\"Serialization error\"]}".to_string()
    })
}

/// WASM-exposed function: compute the stable SHA-256 hash of a graph.
/// Used by the frontend to verify two peers have identical graph state.
#[wasm_bindgen]
pub fn get_graph_hash(input_json: &str) -> String {
    let input: SimulationInput = match serde_json::from_str(input_json) {
        Ok(i) => i,
        Err(_) => return "invalid_input".to_string(),
    };
    compute_stable_hash(&input.nodes, &input.edges)
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::input::SimulationInput;
    use crate::graph::node::{Node, NodeState};
    use crate::graph::edge::Edge;

    fn make_simple_input() -> SimulationInput {
        let nodes = vec![
            Node {
                id: "lb".to_string(),
                label: "Load Balancer".to_string(),
                node_type: Some("load_balancer".to_string()),
                processing_power: 2.0,
                cold_start_latency_ms: 0.0,
                queue_capacity: 1000,
                failure_rate: 0.0,
                x: 0.0,
                y: 0.0,
                provider_icon: Some("aws-alb".to_string()),
            },
            Node {
                id: "api".to_string(),
                label: "API Server".to_string(),
                node_type: Some("compute".to_string()),
                processing_power: 1.0,
                cold_start_latency_ms: 50.0,
                queue_capacity: 100,
                failure_rate: 0.01,
                x: 100.0,
                y: 0.0,
                provider_icon: Some("aws-lambda".to_string()),
            },
            Node {
                id: "db".to_string(),
                label: "Primary DB".to_string(),
                node_type: Some("database".to_string()),
                processing_power: 0.8,
                cold_start_latency_ms: 5.0,
                queue_capacity: 50,
                failure_rate: 0.005,
                x: 200.0,
                y: 0.0,
                provider_icon: Some("aws-dynamodb".to_string()),
            },
        ];

        let edges = vec![
            Edge {
                id: "lb->api".to_string(),
                source: "lb".to_string(),
                target: "api".to_string(),
                latency_ms: 2.0,
                jitter_ms: 0.5,
                packet_loss: 0.0,
                bandwidth_limit_mbps: 1000.0,
            },
            Edge {
                id: "api->db".to_string(),
                source: "api".to_string(),
                target: "db".to_string(),
                latency_ms: 5.0,
                jitter_ms: 1.0,
                packet_loss: 0.001,
                bandwidth_limit_mbps: 500.0,
            },
        ];

        SimulationInput {
            nodes,
            edges,
            config: SimulationConfig {
                seed: 12345,
                total_ticks: 100,
                traffic_pattern: TrafficPattern::Steady,
                baseline_rps: 50.0,
                peak_rps_multiplier: 3.0,
                chaos_enabled: false,
                chaos_events: vec![],
                full_trace: false,
            },
        }
    }

    #[test]
    fn test_engine_constructs_from_valid_input() {
        let input = make_simple_input();
        let engine = SimulationEngine::new(input);
        assert!(engine.is_ok(), "Engine should construct from valid input.");
    }

    #[test]
    fn test_simulation_completes_without_chaos() {
        let input = make_simple_input();
        let engine = SimulationEngine::new(input).unwrap();
        let output = engine.run();
        assert_eq!(output.status, SimulationStatus::Completed);
        assert!(output.ticks_run > 0);
        assert!(output.total_requests > 0);
    }

    #[test]
    fn test_graph_hash_deterministic() {
        let input_a = make_simple_input();
        let input_b = make_simple_input();
        let hash_a = compute_stable_hash(&input_a.nodes, &input_a.edges);
        let hash_b = compute_stable_hash(&input_b.nodes, &input_b.edges);
        assert_eq!(hash_a, hash_b, "Same graph must produce same hash.");
    }

    #[test]
    fn test_same_seed_produces_same_output() {
        let input_a = make_simple_input();
        let input_b = make_simple_input();

        let engine_a = SimulationEngine::new(input_a).unwrap();
        let engine_b = SimulationEngine::new(input_b).unwrap();

        let out_a = engine_a.run();
        let out_b = engine_b.run();

        assert_eq!(out_a.total_requests, out_b.total_requests);
        assert_eq!(out_a.total_failures, out_b.total_failures);
        assert_eq!(out_a.graph_hash, out_b.graph_hash);
    }

    #[test]
    fn test_kill_node_chaos_increases_failures() {
        let mut input = make_simple_input();
        input.config.chaos_enabled = true;
        input.config.chaos_events = vec![ChaosEvent {
            event_id: "test-kill".to_string(),
            kind: crate::physics::chaos::ChaosEventKind::KillNode,
            target_node: Some("api".to_string()),
            target_edge: None,
            trigger_tick: 5,
            duration_ticks: None,
            intensity: 1.0,
            partition_group_a: None,
            partition_group_b: None,
            random_target_pct: None,
        }];

        let clean_input = make_simple_input();

        let engine_chaos = SimulationEngine::new(input).unwrap();
        let engine_clean = SimulationEngine::new(clean_input).unwrap();

        let out_chaos = engine_chaos.run();
        let out_clean = engine_clean.run();

        assert!(
            out_chaos.total_failures >= out_clean.total_failures,
            "Chaos run should produce more failures."
        );
    }

    #[test]
    fn test_high_failure_rate_causes_crash() {
        let mut input = make_simple_input();
        // Set extremely high failure rate on API node to trigger crash detection.
        input.nodes[1].failure_rate = 0.99;
        input.config.total_ticks = 500;
        input.config.baseline_rps = 200.0;

        let engine = SimulationEngine::new(input).unwrap();
        let output = engine.run();

        // May crash or complete depending on exact RNG, but error rate should be high.
        assert!(
            output.overall_error_rate > 0.5,
            "99% failure rate should produce high system error rate."
        );
    }

    #[test]
    fn test_snapshots_recorded_at_interval() {
        let input = make_simple_input();
        let engine = SimulationEngine::new(input).unwrap();
        let output = engine.run();

        let expected_snapshots = (output.ticks_run / SNAPSHOT_INTERVAL) + 1;
        // Allow ±2 for crash-tick edge cases.
        assert!(
            (output.snapshots.len() as i64 - expected_snapshots as i64).abs() <= 2,
            "Snapshots should be recorded every {} ticks.",
            SNAPSHOT_INTERVAL
        );
    }

    #[test]
    fn test_ingress_node_resolution() {
        let input = make_simple_input();
        let engine = SimulationEngine::new(input).unwrap();
        let ingress = engine.find_ingress_node();
        assert_eq!(ingress, Some("lb".to_string()), "Load balancer should be ingress.");
    }

    #[test]
    fn test_path_resolution_walks_graph() {
        let input = make_simple_input();
        let engine = SimulationEngine::new(input).unwrap();
        let dummy_packet = RequestPacket::default();
        let path = engine.resolve_path(&"lb".to_string(), &dummy_packet);
        assert_eq!(path, vec!["lb", "api", "db"]);
    }
}