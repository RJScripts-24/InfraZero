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
use crate::utils::logger::{log_info, log_warn, log_error, TelemetryLogger};

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

/// Share of reads a cache serves without touching what sits behind it.
///
/// A single global figure is a simplification -- real hit ratios depend on
/// working-set size and eviction policy, neither of which a topology diagram
/// states. It is set deliberately below the 90-99% a well-tuned production
/// cache achieves, so the grader credits caching for shielding a backend
/// without treating a cache as a free pass.
const CACHE_HIT_RATIO: f64 = 0.75;

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
    /// Requests still waiting to be served, CARRIED ACROSS TICKS.
    ///
    /// This is what makes saturation possible. Previously the only queue state
    /// was `active_connections`, which was incremented and decremented inside a
    /// single call, so every arriving request found the node empty however much
    /// traffic was offered -- a 128x increase in load moved p99 by 5ms and no
    /// node ever reached its capacity. Backlog persists between ticks, so when
    /// arrivals outrun service the queue grows, latency grows with it, and the
    /// node eventually sheds load.
    pub backlog: f64,
    /// Requests that arrived during the current tick, before draining.
    pub arrivals_this_tick: u32,
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
    fn mean_latency_ms(&self) -> f64 {
        if self.latency_samples.is_empty() {
            return 0.0;
        }

        self.latency_samples.iter().sum::<f64>() / self.latency_samples.len() as f64
    }

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
    /// Requests issued, counted once per request rather than per node visit.
    packets_issued: u64,
    /// Requests that failed somewhere along their path.
    packets_failed: u64,
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
            packets_issued: 0,
            packets_failed: 0,
        })
    }

    // =========================================================================
    // Public: Run Full Simulation
    // =========================================================================

    /// Run the complete simulation and return the output.
    /// This is the primary entry point called by lib.rs WASM bindings.
    pub fn run(mut self, logger: &mut TelemetryLogger) -> SimulationOutput {
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

            // ── 4b. Drain each node's queue by one tick of capacity ──────────
            self.settle_tick_state();

            // ── 5. Check crash condition ─────────────────────────────────────
            self.record_tick_telemetry(tick, logger);

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
            state.arrivals_this_tick = 0;
            state.latency_samples.clear();
            state.is_overloaded = false;
            // `backlog` is deliberately NOT cleared. It is the only state that
            // carries load from one tick into the next, and therefore the only
            // reason an overloaded node behaves differently from an idle one.
        }
        for state in self.edge_live.values_mut() {
            state.packets_in_flight = 0;
            state.packets_delivered = 0;
            state.packets_dropped = 0;
            state.effective_latency_ms = 0.0;
        }
    }

    /// How many requests a node can finish in one tick.
    ///
    /// Derived from `processing_power` and the component's kind. The kind
    /// matters because throughput differs by orders of magnitude between tiers
    /// that a topology-only grader must be able to tell apart: an in-memory
    /// cache serves far more requests per second than a database doing durable
    /// writes, and a load balancer is mostly just forwarding bytes.
    ///
    /// Without this, "put a cache in front of the database" changes nothing in
    /// simulation, and the engine cannot express the single most common piece
    /// of architectural advice there is.
    fn capacity_per_tick(node: &Node, throughput_multiplier: f64) -> f64 {
        let kind_capacity = match node.node_type.as_deref() {
            Some("cache") => 40.0,
            Some("load_balancer") => 30.0,
            Some("edge") => 30.0,
            Some("api_gateway") => 18.0,
            Some("queue") => 25.0,
            Some("database") => 5.0,
            _ => 10.0, // compute / api / anything unrecognised
        };
        let replicas = Self::replica_count(node) as f64;
        (kind_capacity * replicas * node.processing_power.max(0.05)
            * throughput_multiplier.max(0.01))
            .max(0.05)
    }

    /// Instances behind one box on the diagram. At least one.
    fn replica_count(node: &Node) -> u32 {
        node.replicas.unwrap_or(1).max(1)
    }

    /// Whether losing this component takes the whole tier with it.
    ///
    /// A single-instance component dies outright. A replicated one loses one
    /// instance: the tier keeps serving at reduced capacity, which is the whole
    /// point of running more than one. Treating every killed box as a total
    /// outage is what made a serial chain of drawn-once tiers look more fragile
    /// than a wide fan-out of parallel services.
    fn kill_is_total(&self, node: &Node) -> bool {
        self.chaos.is_node_down(&node.id) && Self::replica_count(node) <= 1
    }

    /// Capacity still available at a component one of whose replicas is down.
    fn surviving_replica_fraction(&self, node: &Node) -> f64 {
        if !self.chaos.is_node_down(&node.id) {
            return 1.0;
        }
        let replicas = Self::replica_count(node);
        if replicas <= 1 {
            return 0.0;
        }
        (replicas - 1) as f64 / replicas as f64
    }

    /// Drain each node's queue by one tick's worth of service capacity.
    ///
    /// Runs after every packet for the tick has arrived. Below capacity the
    /// backlog stays at zero and latency is just service time; above it the
    /// backlog grows every tick, which is what produces a saturation knee
    /// rather than a flat latency curve.
    fn settle_tick_state(&mut self) {
        for node in &self.nodes {
            let throughput_multiplier = self.chaos.node_throughput_multiplier(&node.id)
                * self.surviving_replica_fraction(node);
            let capacity = Self::capacity_per_tick(node, throughput_multiplier);
            let queue_cap = node.queue_capacity.max(1) as f64;

            if let Some(state) = self.node_live.get_mut(&node.id) {
                let pending = state.backlog + state.arrivals_this_tick as f64;
                state.backlog = (pending - capacity).max(0.0);
                // A queue cannot grow past the buffer that holds it; anything
                // beyond that was already shed on arrival.
                state.backlog = state.backlog.min(queue_cap);
                state.queue_depth = state.backlog.round() as u32;
                // Sustained backlog past half the buffer is the operational
                // definition of an overloaded component.
                if state.backlog > queue_cap * 0.5 {
                    state.is_overloaded = true;
                }
            }
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
            // A replicated tier survives losing one instance; only a
            // single-instance component is taken out entirely.
            let node_is_gone = match self.nodes.iter().find(|n| n.id == *node_id) {
                Some(node) => self.kill_is_total(node),
                None => self.chaos.is_node_down(node_id),
            };
            if node_is_gone {
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
                        let edge = edge.clone();
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
                        let edge_extra_latency = self.chaos.edge_extra_latency(&edge_id);
                        let edge_extra_packet_loss = self.chaos.edge_extra_packet_loss(&edge_id);
                        let edge_bandwidth_throttle = self.chaos.edge_bandwidth_throttle(&edge_id);

                        let result = self.network.simulate_traversal(
                            &edge,
                            edge_extra_latency,
                            edge_extra_packet_loss,
                            edge_bandwidth_throttle,
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

            let throughput_mult = self.chaos.node_throughput_multiplier(node_id)
                * self.surviving_replica_fraction(&node);
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
        // Counted per REQUEST. The per-node tallies below cannot substitute:
        // they are summed over every hop a request makes, so one failure in a
        // ten-hop chain reads as a 10% error rate while the same failure in a
        // two-hop path reads as 50%. That dilution made long synchronous chains
        // look more reliable than short ones.
        self.packets_issued += 1;
        if failed {
            self.packets_failed += 1;
        }

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
        _tick: u64,
    ) -> (f64, bool) {
        // Effective processing power after chaos degradation.
        let effective_power = (node.processing_power * throughput_mult).max(0.001);
        let capacity = Self::capacity_per_tick(node, throughput_mult);
        let queue_cap = node.queue_capacity.max(1) as f64;

        // Service time is a property of the component, independent of load.
        let service_ms = node.cold_start_latency_ms + (50.0 / effective_power);

        // Draw the RNG before borrowing live state, so the borrow is short and
        // the sequence stays identical regardless of which branch is taken.
        let jitter = self.rng.next_gaussian(0.0, service_ms * 0.1);
        let failure_roll = self.rng.next_f64();

        let live = match self.node_live.get_mut(&node.id) {
            Some(l) => l,
            None => return (0.0, false),
        };

        // Where this request sits in line: everything still queued from
        // previous ticks, plus everything that arrived earlier in this one. A
        // retry storm multiplies the apparent pressure without adding real
        // work, which is exactly how a retry storm behaves.
        let position = (live.backlog + live.arrivals_this_tick as f64) * retry_multiplier;

        // The buffer is finite. Past it the node sheds load rather than
        // queueing without bound -- this is the error-rate spike that follows
        // the latency knee, and the thing that eventually trips crash
        // detection.
        if position >= queue_cap {
            live.is_overloaded = true;
            return (0.0, true);
        }

        live.arrivals_this_tick += 1;
        live.active_connections = live.arrivals_this_tick;

        // Queueing delay: how long the requests already in front of this one
        // take to clear at the node's service rate. This is the term that was
        // missing, and the only one that responds to offered load.
        let queueing_ms = (position / capacity.max(0.001)) * TICK_INTERVAL_MS;

        let final_latency = (service_ms + queueing_ms + jitter + extra_latency_ms).max(0.1);

        // Intrinsic failure, independent of load.
        let node_failed = failure_roll < node.failure_rate;

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
    fn resolve_path(&mut self, ingress_id: &NodeId, _packet: &RequestPacket) -> Vec<NodeId> {
        let mut path = vec![ingress_id.clone()];
        let mut current = ingress_id.clone();
        let mut visited = std::collections::HashSet::new();
        visited.insert(current.clone());

        loop {
            // A request served from cache does not travel any further. Without
            // this, a cache is just another hop and adding one in front of a
            // hot database changes nothing -- the database still sees every
            // request, so the most common piece of architectural advice there
            // is would be unmodellable.
            //
            // Whether a cache CAN serve the request depends on the call:
            //   read  -- cacheable, the ordinary case
            //   write -- never; it has to reach the store behind the cache
            //   unset -- treated as cacheable, which is the behaviour that
            //            existed before edges could state a kind at all
            let inbound_call_kind = if path.len() > 1 {
                let previous = &path[path.len() - 2];
                self.edges
                    .iter()
                    .find(|e| e.target == current && e.source == *previous)
                    .and_then(|e| e.call_kind.as_deref())
            } else {
                None
            };

            if let Some(node) = self.nodes.iter().find(|n| n.id == current) {
                let is_cache = node.node_type.as_deref() == Some("cache");
                let servable_from_cache = is_cache && inbound_call_kind != Some("write");
                if servable_from_cache && self.rng.next_f64() < CACHE_HIT_RATIO {
                    break;
                }

                match node.node_type.as_deref() {
                    // Handing work to a queue completes the caller's request --
                    // that is what "asynchronous" means, and it is the entire
                    // reason for decoupling a write. Walking on through the
                    // consumer would keep the caller waiting for the slowest
                    // thing behind the queue, which is precisely the coupling
                    // the queue was introduced to remove.
                    //
                    // Simplification worth stating: the consumer's own load is
                    // then not driven by this path, so the engine models the
                    // latency and availability benefit of decoupling but not
                    // the backlog that builds up behind a queue whose consumer
                    // is too slow.
                    Some("queue") => break,
                    _ => {}
                }
            }

            // An asynchronous handoff completes the caller's request, so it does
            // not extend the path. Dropping these from the candidate list --
            // rather than only stopping when EVERY way onward is asynchronous --
            // is what keeps a fire-and-forget dependency out of the synchronous
            // path when the caller also has synchronous work to do. A service
            // that writes metrics to a sink and reads from its database has one
            // of each: under the previous rule the walk could pick the sink,
            // which put telemetry in the user's request path competing for the
            // same capacity, and saturated a metrics store at ordinary load.
            //
            // Same simplification the queue case states above: the sink's own
            // load is then not driven by this path.
            let candidates: Vec<NodeId> = self
                .edges
                .iter()
                .filter(|e| e.source == current && !visited.contains(&e.target))
                .filter(|e| e.call_kind.as_deref() != Some("async"))
                .map(|e| e.target.clone())
                .collect();

            // Nothing synchronous left to do: either a leaf, or every way
            // onward was asynchronous.
            if candidates.is_empty() {
                break;
            }

            // Choose uniformly among the outbound branches rather than always
            // taking the first. Taking the first meant every packet followed an
            // identical path, so in a twenty-way fan-out nineteen services
            // received no traffic at all and the fan-out could not be told
            // apart from a single chain. Selection uses the seeded RNG, so
            // replay stays deterministic.
            let choice = (self.rng.next_f64() * candidates.len() as f64) as usize;
            let next = candidates[choice.min(candidates.len() - 1)].clone();

            visited.insert(next.clone());
            path.push(next.clone());
            current = next;
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

    fn record_tick_telemetry(&self, tick: u64, logger: &mut TelemetryLogger) {
        for node in &self.nodes {
            let Some(live) = self.node_live.get(&node.id) else {
                continue;
            };

            logger.record(
                tick,
                &node.id,
                node.node_type.as_deref().unwrap_or("unknown"),
                live.queue_depth as f64,
                live.requests_received as f64,
                live.requests_succeeded as f64,
                live.mean_latency_ms(),
                self.telemetry_node_state(&node.id, live),
            );
        }
    }

    fn telemetry_node_state(&self, node_id: &NodeId, live: &LiveNodeState) -> &'static str {
        if let Some(chaos_state) = self.chaos.node_states.get(node_id) {
            return match chaos_state.state {
                NodeState::Healthy => "HEALTHY",
                NodeState::Degraded | NodeState::Restarting => "DEGRADED",
                NodeState::Dead | NodeState::Partitioned => "FAILED",
            };
        }

        if live.is_overloaded || live.requests_failed > 0 {
            "DEGRADED"
        } else {
            "HEALTHY"
        }
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
    fn build_output(self, status: SimulationStatus, total_ticks: u64) -> SimulationOutput {
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

        let request_error_rate = if self.packets_issued > 0 {
            self.packets_failed as f64 / self.packets_issued as f64
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
            &self.snapshots,
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

        // ── Saturating component ──────────────────────────────────────────────
        // Walked in tick order, so the FIRST node to report itself overloaded
        // wins rather than the one that ends up worst. The earliest bottleneck
        // is the one a user has to fix; everything downstream of it is a
        // consequence, and reporting the loudest node instead would point at
        // the symptom.
        let mut saturating_component: Option<crate::models::output::SaturationPoint> = None;
        let mut overloaded_ticks: std::collections::HashMap<String, u64> =
            std::collections::HashMap::new();

        for snapshot in self.snapshots.iter() {
            for metric in snapshot.node_metrics.iter() {
                if !metric.is_overloaded {
                    continue;
                }
                *overloaded_ticks.entry(metric.node_id.clone()).or_insert(0) += 1;
                if saturating_component.is_none() {
                    let node_type = self
                        .nodes
                        .iter()
                        .find(|n| n.id == metric.node_id)
                        .and_then(|n| n.node_type.clone());
                    saturating_component = Some(crate::models::output::SaturationPoint {
                        node_id: metric.node_id.clone(),
                        node_type,
                        first_overloaded_tick: snapshot.tick,
                        queue_depth_at_saturation: metric.queue_depth,
                        fraction_of_run_overloaded: 0.0,
                    });
                }
            }
        }

        let snapshot_count = self.snapshots.len().max(1) as f64;
        if let Some(point) = saturating_component.as_mut() {
            let ticks = *overloaded_ticks.get(&point.node_id).unwrap_or(&0) as f64;
            point.fraction_of_run_overloaded = ticks / snapshot_count;
            log_info(&format!(
                "[Engine] First saturation: {} at tick {} ({:.0}% of run overloaded).",
                point.node_id, point.first_overloaded_tick,
                point.fraction_of_run_overloaded * 100.0
            ));
        }

        SimulationOutput {
            graph_hash: self.graph_hash,
            status,
            ticks_run,
            total_sim_time_ms: self.sim_time_ms,
            total_requests,
            total_failures,
            overall_error_rate,
            requests_issued: self.packets_issued,
            requests_failed: self.packets_failed,
            request_error_rate,
            avg_p99_latency_ms,
            snapshots: self.snapshots,
            chaos_effects: self.all_chaos_effects,
            crash_tick: self.crash_tick,
            grade: grade_result,
            cost: cost_result,
            root_cause,
            saturating_component,
            telemetry: Vec::new(),
        }
    }
}

// =============================================================================
// WASM Entry Point
// =============================================================================

pub fn run_simulation_output(input_json: &str) -> Result<SimulationOutput, String> {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();

    log_info("[WASM] run_simulation() called.");

    let input: SimulationInput = match serde_json::from_str(input_json) {
        Ok(i) => i,
        Err(e) => {
            let err = format!("{{\"error\": \"Failed to parse simulation input: {}\"}}", e);
            log_error(&err);
            return Err(err);
        }
    };

    let seed = input.config.seed;
    let engine = match SimulationEngine::new(input) {
        Ok(e) => e,
        Err(e) => {
            let err = format!("{{\"error\": \"Engine init failed: {}\"}}", e);
            log_error(&err);
            return Err(err);
        }
    };

    let mut logger = TelemetryLogger::new(seed);
    let mut output = engine.run(&mut logger);
    logger.finalise();
    output.telemetry = logger.rows;

    Ok(output)
}

/// WASM-exposed function: run a full simulation from a JSON input string.
/// Called by the React frontend's "Deploy & Test" button handler.
#[wasm_bindgen]
pub fn run_simulation(input_json: &str) -> String {
    let output = match run_simulation_output(input_json) {
        Ok(output) => output,
        Err(err) => return err,
    };

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
    use crate::utils::logger::TelemetryLogger;

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
                replicas: None,
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
                replicas: None,
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
                replicas: None,
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
                call_kind: None,
            },
            Edge {
                id: "api->db".to_string(),
                source: "api".to_string(),
                target: "db".to_string(),
                latency_ms: 5.0,
                jitter_ms: 1.0,
                packet_loss: 0.001,
                bandwidth_limit_mbps: 500.0,
                call_kind: None,
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
        let seed = input.config.seed;
        let engine = SimulationEngine::new(input).unwrap();
        let mut logger = TelemetryLogger::new(seed);
        let output = engine.run(&mut logger);
        assert_eq!(output.status, SimulationStatus::Completed);
        assert!(output.ticks_run > 0);
        assert!(output.total_requests > 0);
    }

    /// A fire-and-forget dependency must stay off the synchronous path even
    /// when the caller also has synchronous work to do.
    ///
    /// The earlier rule only stopped the walk when EVERY way onward was
    /// asynchronous, so a service with one async edge and one sync edge could
    /// still route a user request into the async target. On an imported
    /// repository that put a metrics store in the request path, where it
    /// competed for the same capacity and shed load at ordinary traffic.
    #[test]
    fn test_async_edge_target_receives_no_synchronous_traffic() {
        let mut input = make_simple_input();
        input.nodes.push(Node {
            id: "metrics".to_string(),
            label: "Metrics Sink".to_string(),
            node_type: Some("database".to_string()),
            processing_power: 0.8,
            cold_start_latency_ms: 5.0,
            queue_capacity: 50,
            failure_rate: 0.0,
            x: 200.0,
            y: 100.0,
            replicas: None,
            provider_icon: None,
        });
        // The API server both reads its database (synchronous) and writes
        // telemetry (asynchronous).
        input.edges.push(Edge {
            id: "api->metrics".to_string(),
            source: "api".to_string(),
            target: "metrics".to_string(),
            latency_ms: 5.0,
            jitter_ms: 1.0,
            packet_loss: 0.0,
            bandwidth_limit_mbps: 500.0,
            call_kind: Some("async".to_string()),
        });

        let seed = input.config.seed;
        let engine = SimulationEngine::new(input).unwrap();
        let mut logger = TelemetryLogger::new(seed);
        let output = engine.run(&mut logger);

        let received: u64 = output
            .snapshots
            .iter()
            .flat_map(|snapshot| snapshot.node_metrics.iter())
            .filter(|metric| metric.node_id == "metrics")
            .map(|metric| metric.requests_received)
            .sum();
        assert_eq!(received, 0, "An async target must not serve synchronous requests.");

        let db_received: u64 = output
            .snapshots
            .iter()
            .flat_map(|snapshot| snapshot.node_metrics.iter())
            .filter(|metric| metric.node_id == "db")
            .map(|metric| metric.requests_received)
            .sum();
        assert!(db_received > 0, "The synchronous branch must still carry traffic.");
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
        let seed_a = input_a.config.seed;
        let seed_b = input_b.config.seed;

        let engine_a = SimulationEngine::new(input_a).unwrap();
        let engine_b = SimulationEngine::new(input_b).unwrap();

        let mut logger_a = TelemetryLogger::new(seed_a);
        let mut logger_b = TelemetryLogger::new(seed_b);
        let out_a = engine_a.run(&mut logger_a);
        let out_b = engine_b.run(&mut logger_b);

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
        let chaos_seed = input.config.seed;
        let clean_seed = clean_input.config.seed;

        let engine_chaos = SimulationEngine::new(input).unwrap();
        let engine_clean = SimulationEngine::new(clean_input).unwrap();

        let mut chaos_logger = TelemetryLogger::new(chaos_seed);
        let mut clean_logger = TelemetryLogger::new(clean_seed);
        let out_chaos = engine_chaos.run(&mut chaos_logger);
        let out_clean = engine_clean.run(&mut clean_logger);

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
        let seed = input.config.seed;

        let engine = SimulationEngine::new(input).unwrap();
        let mut logger = TelemetryLogger::new(seed);
        let output = engine.run(&mut logger);

        // May crash or complete depending on exact RNG, but error rate should be high.
        //
        // Asserted on `request_error_rate`, not `overall_error_rate`. The latter
        // sums per-node tallies and is therefore divided by the number of hops a
        // request makes, so a three-hop path dilutes one node failing 99% of the
        // time down towards a third -- which is why this sat just under 0.5 and
        // failed. `request_error_rate` counts each request once, which is what
        // the assertion was always trying to say.
        assert!(
            output.request_error_rate > 0.5,
            "99% failure rate should produce high request error rate, got {}",
            output.request_error_rate
        );
    }

    #[test]
    fn test_snapshots_recorded_at_interval() {
        let input = make_simple_input();
        let seed = input.config.seed;
        let engine = SimulationEngine::new(input).unwrap();
        let mut logger = TelemetryLogger::new(seed);
        let output = engine.run(&mut logger);

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
        let mut engine = SimulationEngine::new(input).unwrap();
        let dummy_packet = RequestPacket::default();
        let path = engine.resolve_path(&"lb".to_string(), &dummy_packet);
        assert_eq!(path, vec!["lb", "api", "db"]);
    }
}
