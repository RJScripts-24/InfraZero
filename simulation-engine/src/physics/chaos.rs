// =============================================================================
// chaos.rs — InfraZero Simulation Engine
// Chaos Engineering: Failure Injection Module
//
// Responsibility:
//   Injects controlled failures into the running simulation graph.
//   Supports node kills, edge degradation, latency spikes, partition events,
//   and cascading failure scenarios. All randomness is driven by the seeded
//   RNG from utils::rng to ensure full reproducibility.
// =============================================================================

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::graph::node::{NodeId, NodeState};
use crate::graph::edge::{EdgeId, EdgeState};
use crate::utils::rng::SeededRng;
use crate::utils::logger::{log_info, log_warn, log_error};

// =============================================================================
// Public Types & Config
// =============================================================================

/// The type of chaos event to inject.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChaosEventKind {
    /// Immediately kills a node (sets it to Dead state).
    KillNode,
    /// Restarts a node after a recovery delay (simulates crash + reboot).
    RestartNode,
    /// Degrades a specific network edge (increases latency, packet loss).
    DegradeEdge,
    /// Completely severs a network edge (100% packet loss).
    PartitionEdge,
    /// Injects a CPU spike on a node, degrading its processing throughput.
    CpuSpike,
    /// Simulates a memory pressure event, increasing cold start latency.
    MemoryPressure,
    /// Injects an aggressive retry storm from a specific source node.
    RetryStorm,
    /// Simulates a cascading failure: kills a node and propagates pressure
    /// to all downstream dependencies.
    CascadeFailure,
    /// Randomly kills N% of nodes (Chaos Monkey style).
    RandomNodeKill,
    /// Randomly degrades N% of edges.
    RandomEdgeDegradation,
    /// Network partition: isolates a set of nodes from another set.
    NetworkPartition,
}

/// Parameters for a single chaos injection event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaosEvent {
    /// Unique event identifier (for log correlation).
    pub event_id: String,
    /// What kind of chaos to inject.
    pub kind: ChaosEventKind,
    /// The target node ID (if applicable).
    pub target_node: Option<NodeId>,
    /// The target edge ID (if applicable).
    pub target_edge: Option<EdgeId>,
    /// Simulation tick at which this event fires.
    pub trigger_tick: u64,
    /// Duration in ticks for sustained chaos (e.g., how long a CPU spike lasts).
    /// None = permanent until manually healed.
    pub duration_ticks: Option<u64>,
    /// Intensity as a 0.0–1.0 multiplier (e.g., 0.5 = 50% degradation).
    pub intensity: f64,
    /// For partition events: the isolated group of nodes.
    pub partition_group_a: Option<Vec<NodeId>>,
    pub partition_group_b: Option<Vec<NodeId>>,
    /// Optional: percentage of random targets (for RandomNodeKill etc.)
    pub random_target_pct: Option<f64>,
}

/// The outcome / effect produced after applying a ChaosEvent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaosEffect {
    pub event_id: String,
    pub kind: ChaosEventKind,
    pub affected_nodes: Vec<NodeId>,
    pub affected_edges: Vec<EdgeId>,
    pub description: String,
    pub applied_at_tick: u64,
    pub expires_at_tick: Option<u64>,
}

/// Runtime state of a node as modified by chaos.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeChaosState {
    pub node_id: NodeId,
    pub state: NodeState,
    /// Multiplier on processingPower. 1.0 = normal, 0.0 = completely degraded.
    pub throughput_multiplier: f64,
    /// Extra latency added on top of base coldStartLatency (ms).
    pub extra_latency_ms: f64,
    /// Whether aggressive retries are being generated from this node.
    pub is_retry_storming: bool,
    /// Tick at which this node will auto-recover (if RestartNode).
    pub recovery_at_tick: Option<u64>,
}

/// Runtime state of an edge as modified by chaos.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeChaosState {
    pub edge_id: EdgeId,
    pub state: EdgeState,
    /// Added latency on top of baseline (ms).
    pub extra_latency_ms: f64,
    /// Added jitter (ms).
    pub extra_jitter_ms: f64,
    /// Added packet loss (0.0–1.0, added on top of configured base).
    pub extra_packet_loss: f64,
    /// Added bandwidth throttle fraction (1.0 = fully throttled / partitioned).
    pub bandwidth_throttle: f64,
    /// Tick at which this edge auto-heals.
    pub heals_at_tick: Option<u64>,
}

// =============================================================================
// ChaosEngine
// =============================================================================

/// The ChaosEngine tracks all active chaos states and applies/expires them
/// each simulation tick. It is owned by the main SimulationEngine.
#[derive(Debug)]
pub struct ChaosEngine {
    /// Pending events scheduled but not yet applied.
    pending_events: Vec<ChaosEvent>,
    /// Active chaos effects currently in flight.
    active_effects: Vec<ChaosEffect>,
    /// Per-node overrides from chaos.
    pub node_states: HashMap<NodeId, NodeChaosState>,
    /// Per-edge overrides from chaos.
    pub edge_states: HashMap<EdgeId, EdgeChaosState>,
    /// Set of edges that are fully partitioned (both directions blocked).
    partitioned_edges: HashSet<EdgeId>,
    /// Seeded RNG (shared reference pattern — passed in per tick).
    rng_seed: u64,
}

impl ChaosEngine {
    /// Create a new ChaosEngine with a given seed for reproducible randomness.
    pub fn new(seed: u64) -> Self {
        log_info("[Chaos] ChaosEngine initialized.");
        ChaosEngine {
            pending_events: Vec::new(),
            active_effects: Vec::new(),
            node_states: HashMap::new(),
            edge_states: HashMap::new(),
            partitioned_edges: HashSet::new(),
            rng_seed: seed,
        }
    }

    /// Schedule a chaos event for future injection.
    pub fn schedule_event(&mut self, event: ChaosEvent) {
        log_info(&format!(
            "[Chaos] Scheduled event '{}' ({:?}) at tick {}.",
            event.event_id, event.kind, event.trigger_tick
        ));
        self.pending_events.push(event);
    }

    /// Schedule multiple events at once.
    pub fn schedule_events(&mut self, events: Vec<ChaosEvent>) {
        for event in events {
            self.schedule_event(event);
        }
    }

    /// Called every tick by the SimulationEngine.
    /// Applies newly due events, expires old ones, and returns a list of
    /// effects applied this tick (for log streaming to the terminal).
    pub fn tick(
        &mut self,
        current_tick: u64,
        all_node_ids: &[NodeId],
        all_edge_ids: &[EdgeId],
    ) -> Vec<ChaosEffect> {
        let mut applied_this_tick: Vec<ChaosEffect> = Vec::new();

        // 1. Expire effects that have run their course.
        self.expire_effects(current_tick);

        // 2. Drain pending events due at or before this tick.
        let pending = std::mem::take(&mut self.pending_events);
        let mut due: Vec<ChaosEvent> = Vec::new();
        let mut future: Vec<ChaosEvent> = Vec::new();
        for event in pending {
            if event.trigger_tick <= current_tick {
                due.push(event);
            } else {
                future.push(event);
            }
        }
        self.pending_events = future;

        let mut rng = SeededRng::new(self.rng_seed.wrapping_add(current_tick));

        for event in due {
            let effect = self.apply_event(&event, current_tick, all_node_ids, all_edge_ids, &mut rng);
            if let Some(eff) = effect {
                log_info(&format!(
                    "[Chaos] Applied '{}': {}",
                    eff.event_id, eff.description
                ));
                self.active_effects.push(eff.clone());
                applied_this_tick.push(eff);
            }
        }

        applied_this_tick
    }

    /// Returns true if an edge is currently fully partitioned.
    pub fn is_partitioned(&self, edge_id: &EdgeId) -> bool {
        self.partitioned_edges.contains(edge_id)
    }

    /// Returns the chaos-modified throughput multiplier for a node (default 1.0).
    pub fn node_throughput_multiplier(&self, node_id: &NodeId) -> f64 {
        self.node_states
            .get(node_id)
            .map(|s| s.throughput_multiplier)
            .unwrap_or(1.0)
    }

    /// Returns extra latency added to a node by chaos (ms).
    pub fn node_extra_latency(&self, node_id: &NodeId) -> f64 {
        self.node_states
            .get(node_id)
            .map(|s| s.extra_latency_ms)
            .unwrap_or(0.0)
    }

    /// Returns whether a node is currently dead/down.
    pub fn is_node_down(&self, node_id: &NodeId) -> bool {
        self.node_states
            .get(node_id)
            .map(|s| s.state == NodeState::Dead || s.state == NodeState::Restarting)
            .unwrap_or(false)
    }

    /// Returns true if a node is generating a retry storm.
    pub fn is_retry_storming(&self, node_id: &NodeId) -> bool {
        self.node_states
            .get(node_id)
            .map(|s| s.is_retry_storming)
            .unwrap_or(false)
    }

    /// Returns extra packet loss for an edge.
    pub fn edge_extra_packet_loss(&self, edge_id: &EdgeId) -> f64 {
        self.edge_states
            .get(edge_id)
            .map(|s| s.extra_packet_loss.min(1.0))
            .unwrap_or(0.0)
    }

    /// Returns extra latency for an edge.
    pub fn edge_extra_latency(&self, edge_id: &EdgeId) -> f64 {
        self.edge_states
            .get(edge_id)
            .map(|s| s.extra_latency_ms)
            .unwrap_or(0.0)
    }

    /// Returns total bandwidth throttle (0.0 = free, 1.0 = fully blocked).
    pub fn edge_bandwidth_throttle(&self, edge_id: &EdgeId) -> f64 {
        self.edge_states
            .get(edge_id)
            .map(|s| s.bandwidth_throttle.min(1.0))
            .unwrap_or(0.0)
    }

    /// Heal a node manually (e.g., operator clicks "Restore Node").
    pub fn heal_node(&mut self, node_id: &NodeId) {
        if let Some(state) = self.node_states.get_mut(node_id) {
            state.state = NodeState::Healthy;
            state.throughput_multiplier = 1.0;
            state.extra_latency_ms = 0.0;
            state.is_retry_storming = false;
            state.recovery_at_tick = None;
            log_info(&format!("[Chaos] Node '{}' manually healed.", node_id));
        }
    }

    /// Heal an edge manually.
    pub fn heal_edge(&mut self, edge_id: &EdgeId) {
        self.edge_states.remove(edge_id);
        self.partitioned_edges.remove(edge_id);
        log_info(&format!("[Chaos] Edge '{}' manually healed.", edge_id));
    }

    /// Snapshot all active chaos states for the Post-Mortem report.
    pub fn snapshot_active_effects(&self) -> Vec<ChaosEffect> {
        self.active_effects.clone()
    }

    // =========================================================================
    // Private: Application Logic
    // =========================================================================

    fn apply_event(
        &mut self,
        event: &ChaosEvent,
        current_tick: u64,
        all_node_ids: &[NodeId],
        all_edge_ids: &[EdgeId],
        rng: &mut SeededRng,
    ) -> Option<ChaosEffect> {
        let expires_at = event.duration_ticks.map(|d| current_tick + d);

        match &event.kind {
            ChaosEventKind::KillNode => {
                self.apply_kill_node(event, current_tick, expires_at)
            }
            ChaosEventKind::RestartNode => {
                self.apply_restart_node(event, current_tick, expires_at)
            }
            ChaosEventKind::DegradeEdge => {
                self.apply_degrade_edge(event, current_tick, expires_at)
            }
            ChaosEventKind::PartitionEdge => {
                self.apply_partition_edge(event, current_tick, expires_at)
            }
            ChaosEventKind::CpuSpike => {
                self.apply_cpu_spike(event, current_tick, expires_at)
            }
            ChaosEventKind::MemoryPressure => {
                self.apply_memory_pressure(event, current_tick, expires_at)
            }
            ChaosEventKind::RetryStorm => {
                self.apply_retry_storm(event, current_tick, expires_at)
            }
            ChaosEventKind::CascadeFailure => {
                self.apply_cascade_failure(event, current_tick, all_node_ids, all_edge_ids, expires_at)
            }
            ChaosEventKind::RandomNodeKill => {
                self.apply_random_node_kill(event, current_tick, all_node_ids, rng, expires_at)
            }
            ChaosEventKind::RandomEdgeDegradation => {
                self.apply_random_edge_degradation(event, current_tick, all_edge_ids, rng, expires_at)
            }
            ChaosEventKind::NetworkPartition => {
                self.apply_network_partition(event, current_tick, expires_at)
            }
        }
    }

    // -------------------------------------------------------------------------
    // KillNode
    // -------------------------------------------------------------------------

    fn apply_kill_node(
        &mut self,
        event: &ChaosEvent,
        current_tick: u64,
        expires_at: Option<u64>,
    ) -> Option<ChaosEffect> {
        let node_id = event.target_node.clone()?;
        log_warn(&format!(
            "[Chaos] [{}] Killing node '{}'.",
            event.event_id, node_id
        ));

        self.node_states.insert(
            node_id.clone(),
            NodeChaosState {
                node_id: node_id.clone(),
                state: NodeState::Dead,
                throughput_multiplier: 0.0,
                extra_latency_ms: 0.0,
                is_retry_storming: false,
                recovery_at_tick: expires_at,
            },
        );

        Some(ChaosEffect {
            event_id: event.event_id.clone(),
            kind: ChaosEventKind::KillNode,
            affected_nodes: vec![node_id.clone()],
            affected_edges: vec![],
            description: format!(
                "Node '{}' has been killed. All incoming requests will be refused.",
                node_id
            ),
            applied_at_tick: current_tick,
            expires_at_tick: expires_at,
        })
    }

    // -------------------------------------------------------------------------
    // RestartNode
    // -------------------------------------------------------------------------

    fn apply_restart_node(
        &mut self,
        event: &ChaosEvent,
        current_tick: u64,
        expires_at: Option<u64>,
    ) -> Option<ChaosEffect> {
        let node_id = event.target_node.clone()?;
        // Restart = brief Dead window, then auto-recover.
        // duration_ticks is the restart delay.
        let recovery_tick = expires_at.unwrap_or(current_tick + 10);

        log_warn(&format!(
            "[Chaos] [{}] Restarting node '{}'. Recovery at tick {}.",
            event.event_id, node_id, recovery_tick
        ));

        self.node_states.insert(
            node_id.clone(),
            NodeChaosState {
                node_id: node_id.clone(),
                state: NodeState::Restarting,
                throughput_multiplier: 0.0,
                extra_latency_ms: 0.0,
                is_retry_storming: false,
                recovery_at_tick: Some(recovery_tick),
            },
        );

        Some(ChaosEffect {
            event_id: event.event_id.clone(),
            kind: ChaosEventKind::RestartNode,
            affected_nodes: vec![node_id.clone()],
            affected_edges: vec![],
            description: format!(
                "Node '{}' is restarting. Will recover at tick {}.",
                node_id, recovery_tick
            ),
            applied_at_tick: current_tick,
            expires_at_tick: Some(recovery_tick),
        })
    }

    // -------------------------------------------------------------------------
    // DegradeEdge
    // -------------------------------------------------------------------------

    fn apply_degrade_edge(
        &mut self,
        event: &ChaosEvent,
        current_tick: u64,
        expires_at: Option<u64>,
    ) -> Option<ChaosEffect> {
        let edge_id = event.target_edge.clone()?;
        let intensity = event.intensity.clamp(0.0, 1.0);

        // Scale degradation: intensity=1.0 → +500ms latency, 50% packet loss.
        let extra_latency = 500.0 * intensity;
        let extra_jitter = 100.0 * intensity;
        let extra_loss = 0.5 * intensity;

        log_warn(&format!(
            "[Chaos] [{}] Degrading edge '{}' (intensity={:.2}): +{:.0}ms latency, +{:.0}% packet loss.",
            event.event_id, edge_id, intensity, extra_latency, extra_loss * 100.0
        ));

        self.edge_states.insert(
            edge_id.clone(),
            EdgeChaosState {
                edge_id: edge_id.clone(),
                state: EdgeState::Degraded,
                extra_latency_ms: extra_latency,
                extra_jitter_ms: extra_jitter,
                extra_packet_loss: extra_loss,
                bandwidth_throttle: intensity * 0.5,
                heals_at_tick: expires_at,
            },
        );

        Some(ChaosEffect {
            event_id: event.event_id.clone(),
            kind: ChaosEventKind::DegradeEdge,
            affected_nodes: vec![],
            affected_edges: vec![edge_id.clone()],
            description: format!(
                "Edge '{}' degraded: +{:.0}ms latency, +{:.0}% packet loss for {:?} ticks.",
                edge_id, extra_latency, extra_loss * 100.0, event.duration_ticks
            ),
            applied_at_tick: current_tick,
            expires_at_tick: expires_at,
        })
    }

    // -------------------------------------------------------------------------
    // PartitionEdge
    // -------------------------------------------------------------------------

    fn apply_partition_edge(
        &mut self,
        event: &ChaosEvent,
        current_tick: u64,
        expires_at: Option<u64>,
    ) -> Option<ChaosEffect> {
        let edge_id = event.target_edge.clone()?;

        log_error(&format!(
            "[Chaos] [{}] PARTITIONING edge '{}'. All traffic severed.",
            event.event_id, edge_id
        ));

        self.partitioned_edges.insert(edge_id.clone());
        self.edge_states.insert(
            edge_id.clone(),
            EdgeChaosState {
                edge_id: edge_id.clone(),
                state: EdgeState::Partitioned,
                extra_latency_ms: 0.0,
                extra_jitter_ms: 0.0,
                extra_packet_loss: 1.0, // Total loss
                bandwidth_throttle: 1.0,
                heals_at_tick: expires_at,
            },
        );

        Some(ChaosEffect {
            event_id: event.event_id.clone(),
            kind: ChaosEventKind::PartitionEdge,
            affected_nodes: vec![],
            affected_edges: vec![edge_id.clone()],
            description: format!(
                "NETWORK PARTITION on edge '{}'. 100% packet loss. No traffic can pass.",
                edge_id
            ),
            applied_at_tick: current_tick,
            expires_at_tick: expires_at,
        })
    }

    // -------------------------------------------------------------------------
    // CpuSpike
    // -------------------------------------------------------------------------

    fn apply_cpu_spike(
        &mut self,
        event: &ChaosEvent,
        current_tick: u64,
        expires_at: Option<u64>,
    ) -> Option<ChaosEffect> {
        let node_id = event.target_node.clone()?;
        let intensity = event.intensity.clamp(0.0, 1.0);
        // CPU spike reduces available throughput.
        let throughput_multiplier = 1.0 - (intensity * 0.9); // at 100% intensity, 10% throughput remains

        log_warn(&format!(
            "[Chaos] [{}] CPU spike on '{}': throughput reduced to {:.0}%.",
            event.event_id, node_id, throughput_multiplier * 100.0
        ));

        let entry = self.node_states.entry(node_id.clone()).or_insert_with(|| {
            NodeChaosState {
                node_id: node_id.clone(),
                state: NodeState::Degraded,
                throughput_multiplier: 1.0,
                extra_latency_ms: 0.0,
                is_retry_storming: false,
                recovery_at_tick: None,
            }
        });
        entry.state = NodeState::Degraded;
        entry.throughput_multiplier = throughput_multiplier;
        entry.recovery_at_tick = expires_at;

        Some(ChaosEffect {
            event_id: event.event_id.clone(),
            kind: ChaosEventKind::CpuSpike,
            affected_nodes: vec![node_id.clone()],
            affected_edges: vec![],
            description: format!(
                "CPU spike on '{}': processing throughput at {:.0}% for {:?} ticks.",
                node_id, throughput_multiplier * 100.0, event.duration_ticks
            ),
            applied_at_tick: current_tick,
            expires_at_tick: expires_at,
        })
    }

    // -------------------------------------------------------------------------
    // MemoryPressure
    // -------------------------------------------------------------------------

    fn apply_memory_pressure(
        &mut self,
        event: &ChaosEvent,
        current_tick: u64,
        expires_at: Option<u64>,
    ) -> Option<ChaosEffect> {
        let node_id = event.target_node.clone()?;
        let intensity = event.intensity.clamp(0.0, 1.0);
        // Memory pressure → GC pauses → extra latency
        let extra_latency = 300.0 * intensity;

        log_warn(&format!(
            "[Chaos] [{}] Memory pressure on '{}': +{:.0}ms latency (GC pauses).",
            event.event_id, node_id, extra_latency
        ));

        let entry = self.node_states.entry(node_id.clone()).or_insert_with(|| {
            NodeChaosState {
                node_id: node_id.clone(),
                state: NodeState::Degraded,
                throughput_multiplier: 1.0,
                extra_latency_ms: 0.0,
                is_retry_storming: false,
                recovery_at_tick: None,
            }
        });
        entry.state = NodeState::Degraded;
        entry.extra_latency_ms += extra_latency;
        entry.recovery_at_tick = expires_at;

        Some(ChaosEffect {
            event_id: event.event_id.clone(),
            kind: ChaosEventKind::MemoryPressure,
            affected_nodes: vec![node_id.clone()],
            affected_edges: vec![],
            description: format!(
                "Memory pressure on '{}': +{:.0}ms latency from GC pauses.",
                node_id, extra_latency
            ),
            applied_at_tick: current_tick,
            expires_at_tick: expires_at,
        })
    }

    // -------------------------------------------------------------------------
    // RetryStorm
    // -------------------------------------------------------------------------

    fn apply_retry_storm(
        &mut self,
        event: &ChaosEvent,
        current_tick: u64,
        expires_at: Option<u64>,
    ) -> Option<ChaosEffect> {
        let node_id = event.target_node.clone()?;

        log_warn(&format!(
            "[Chaos] [{}] RETRY STORM initiated from node '{}'.",
            event.event_id, node_id
        ));

        let entry = self.node_states.entry(node_id.clone()).or_insert_with(|| {
            NodeChaosState {
                node_id: node_id.clone(),
                state: NodeState::Healthy,
                throughput_multiplier: 1.0,
                extra_latency_ms: 0.0,
                is_retry_storming: false,
                recovery_at_tick: None,
            }
        });
        entry.is_retry_storming = true;
        entry.recovery_at_tick = expires_at;

        Some(ChaosEffect {
            event_id: event.event_id.clone(),
            kind: ChaosEventKind::RetryStorm,
            affected_nodes: vec![node_id.clone()],
            affected_edges: vec![],
            description: format!(
                "Retry storm from node '{}': aggressive retries will flood downstream services.",
                node_id
            ),
            applied_at_tick: current_tick,
            expires_at_tick: expires_at,
        })
    }

    // -------------------------------------------------------------------------
    // CascadeFailure
    // -------------------------------------------------------------------------

    fn apply_cascade_failure(
        &mut self,
        event: &ChaosEvent,
        current_tick: u64,
        all_node_ids: &[NodeId],
        all_edge_ids: &[EdgeId],
        expires_at: Option<u64>,
    ) -> Option<ChaosEffect> {
        let origin_node = event.target_node.clone()?;

        log_error(&format!(
            "[Chaos] [{}] CASCADE FAILURE originating at '{}'.",
            event.event_id, origin_node
        ));

        // Kill the origin node.
        self.node_states.insert(
            origin_node.clone(),
            NodeChaosState {
                node_id: origin_node.clone(),
                state: NodeState::Dead,
                throughput_multiplier: 0.0,
                extra_latency_ms: 0.0,
                is_retry_storming: true, // Dying node triggers retries upstream
                recovery_at_tick: expires_at,
            },
        );

        // Apply degradation to a subset of other nodes (simulate pressure wave).
        // In a real engine, this would walk the graph topology.
        // Here we degrade all other nodes at decreasing intensity (distance simulation).
        let mut affected = vec![origin_node.clone()];
        for (i, node_id) in all_node_ids.iter().enumerate() {
            if *node_id == origin_node {
                continue;
            }
            // Falloff: further nodes (by order) get less impact.
            let falloff = 1.0 / (1.0 + i as f64 * 0.4);
            let degraded_throughput = 1.0 - (event.intensity * falloff * 0.8);

            self.node_states
                .entry(node_id.clone())
                .and_modify(|s| {
                    s.state = NodeState::Degraded;
                    s.throughput_multiplier = s.throughput_multiplier.min(degraded_throughput);
                })
                .or_insert_with(|| NodeChaosState {
                    node_id: node_id.clone(),
                    state: NodeState::Degraded,
                    throughput_multiplier: degraded_throughput,
                    extra_latency_ms: 150.0 * falloff,
                    is_retry_storming: false,
                    recovery_at_tick: expires_at,
                });

            affected.push(node_id.clone());
        }

        // Degrade all edges as well.
        let mut affected_edges: Vec<EdgeId> = Vec::new();
        for edge_id in all_edge_ids {
            self.edge_states
                .entry(edge_id.clone())
                .and_modify(|s| {
                    s.extra_packet_loss = (s.extra_packet_loss + 0.2 * event.intensity).min(1.0);
                    s.extra_latency_ms += 100.0 * event.intensity;
                })
                .or_insert_with(|| EdgeChaosState {
                    edge_id: edge_id.clone(),
                    state: EdgeState::Degraded,
                    extra_latency_ms: 100.0 * event.intensity,
                    extra_jitter_ms: 50.0,
                    extra_packet_loss: 0.2 * event.intensity,
                    bandwidth_throttle: 0.3 * event.intensity,
                    heals_at_tick: expires_at,
                });
            affected_edges.push(edge_id.clone());
        }

        Some(ChaosEffect {
            event_id: event.event_id.clone(),
            kind: ChaosEventKind::CascadeFailure,
            affected_nodes: affected,
            affected_edges: affected_edges,
            description: format!(
                "CASCADE FAILURE: Origin node '{}' died. Failure wave propagating to all downstream nodes.",
                origin_node
            ),
            applied_at_tick: current_tick,
            expires_at_tick: expires_at,
        })
    }

    // -------------------------------------------------------------------------
    // RandomNodeKill
    // -------------------------------------------------------------------------

    fn apply_random_node_kill(
        &mut self,
        event: &ChaosEvent,
        current_tick: u64,
        all_node_ids: &[NodeId],
        rng: &mut SeededRng,
        expires_at: Option<u64>,
    ) -> Option<ChaosEffect> {
        let pct = event.random_target_pct.unwrap_or(0.3).clamp(0.0, 1.0);
        let count = ((all_node_ids.len() as f64) * pct).ceil() as usize;

        log_warn(&format!(
            "[Chaos] [{}] Random node kill: targeting {:.0}% ({} nodes).",
            event.event_id, pct * 100.0, count
        ));

        let mut shuffled: Vec<NodeId> = all_node_ids.to_vec();
        rng.shuffle(&mut shuffled);
        let targets: Vec<NodeId> = shuffled.into_iter().take(count).collect();

        for node_id in &targets {
            self.node_states.insert(
                node_id.clone(),
                NodeChaosState {
                    node_id: node_id.clone(),
                    state: NodeState::Dead,
                    throughput_multiplier: 0.0,
                    extra_latency_ms: 0.0,
                    is_retry_storming: false,
                    recovery_at_tick: expires_at,
                },
            );
            log_error(&format!("[Chaos] Random kill: node '{}' killed.", node_id));
        }

        Some(ChaosEffect {
            event_id: event.event_id.clone(),
            kind: ChaosEventKind::RandomNodeKill,
            affected_nodes: targets.clone(),
            affected_edges: vec![],
            description: format!(
                "Chaos Monkey: randomly killed {} node(s) ({:.0}% of cluster).",
                targets.len(), pct * 100.0
            ),
            applied_at_tick: current_tick,
            expires_at_tick: expires_at,
        })
    }

    // -------------------------------------------------------------------------
    // RandomEdgeDegradation
    // -------------------------------------------------------------------------

    fn apply_random_edge_degradation(
        &mut self,
        event: &ChaosEvent,
        current_tick: u64,
        all_edge_ids: &[EdgeId],
        rng: &mut SeededRng,
        expires_at: Option<u64>,
    ) -> Option<ChaosEffect> {
        let pct = event.random_target_pct.unwrap_or(0.4).clamp(0.0, 1.0);
        let count = ((all_edge_ids.len() as f64) * pct).ceil() as usize;
        let intensity = event.intensity.clamp(0.0, 1.0);

        let mut shuffled: Vec<EdgeId> = all_edge_ids.to_vec();
        rng.shuffle(&mut shuffled);
        let targets: Vec<EdgeId> = shuffled.into_iter().take(count).collect();

        log_warn(&format!(
            "[Chaos] [{}] Random edge degradation: {} edges at intensity {:.2}.",
            event.event_id, targets.len(), intensity
        ));

        for edge_id in &targets {
            self.edge_states.insert(
                edge_id.clone(),
                EdgeChaosState {
                    edge_id: edge_id.clone(),
                    state: EdgeState::Degraded,
                    extra_latency_ms: 200.0 * intensity,
                    extra_jitter_ms: 50.0 * intensity,
                    extra_packet_loss: 0.3 * intensity,
                    bandwidth_throttle: 0.4 * intensity,
                    heals_at_tick: expires_at,
                },
            );
        }

        Some(ChaosEffect {
            event_id: event.event_id.clone(),
            kind: ChaosEventKind::RandomEdgeDegradation,
            affected_nodes: vec![],
            affected_edges: targets.clone(),
            description: format!(
                "Random edge degradation: {} edges ({:.0}% of network) degraded.",
                targets.len(), pct * 100.0
            ),
            applied_at_tick: current_tick,
            expires_at_tick: expires_at,
        })
    }

    // -------------------------------------------------------------------------
    // NetworkPartition
    // -------------------------------------------------------------------------

    fn apply_network_partition(
        &mut self,
        event: &ChaosEvent,
        current_tick: u64,
        expires_at: Option<u64>,
    ) -> Option<ChaosEffect> {
        let group_a = event.partition_group_a.clone().unwrap_or_default();
        let group_b = event.partition_group_b.clone().unwrap_or_default();

        log_error(&format!(
            "[Chaos] [{}] NETWORK PARTITION: {:?} isolated from {:?}.",
            event.event_id, group_a, group_b
        ));

        // Build synthetic edge IDs for cross-partition links.
        // In a real implementation, the engine would provide the actual edge IDs
        // between these node groups. Here we record the partition in node states.
        let mut affected_nodes: Vec<NodeId> = Vec::new();
        for node_id in group_a.iter().chain(group_b.iter()) {
            self.node_states
                .entry(node_id.clone())
                .and_modify(|s| {
                    // Mark as partitioned — traffic from the other group will be refused.
                    s.state = NodeState::Partitioned;
                })
                .or_insert_with(|| NodeChaosState {
                    node_id: node_id.clone(),
                    state: NodeState::Partitioned,
                    throughput_multiplier: 1.0, // Internal throughput fine
                    extra_latency_ms: 0.0,
                    is_retry_storming: false,
                    recovery_at_tick: expires_at,
                });
            affected_nodes.push(node_id.clone());
        }

        Some(ChaosEffect {
            event_id: event.event_id.clone(),
            kind: ChaosEventKind::NetworkPartition,
            affected_nodes,
            affected_edges: vec![],
            description: format!(
                "Network partition: group {:?} cannot communicate with group {:?}.",
                group_a, group_b
            ),
            applied_at_tick: current_tick,
            expires_at_tick: expires_at,
        })
    }

    // =========================================================================
    // Private: Expiry Logic
    // =========================================================================

    fn expire_effects(&mut self, current_tick: u64) {
        let expiring: Vec<String> = self
            .active_effects
            .iter()
            .filter(|e| e.expires_at_tick.map(|t| t <= current_tick).unwrap_or(false))
            .map(|e| e.event_id.clone())
            .collect();

        for event_id in &expiring {
            log_info(&format!("[Chaos] Effect '{}' expired at tick {}.", event_id, current_tick));
        }

        // Remove expired effects.
        self.active_effects
            .retain(|e| !e.expires_at_tick.map(|t| t <= current_tick).unwrap_or(false));

        // Heal nodes whose recovery_at_tick has passed.
        for chaos_state in self.node_states.values_mut() {
            if let Some(recovery_tick) = chaos_state.recovery_at_tick {
                if recovery_tick <= current_tick && chaos_state.state != NodeState::Healthy {
                    log_info(&format!(
                        "[Chaos] Node '{}' auto-recovered at tick {}.",
                        chaos_state.node_id, current_tick
                    ));
                    chaos_state.state = NodeState::Healthy;
                    chaos_state.throughput_multiplier = 1.0;
                    chaos_state.extra_latency_ms = 0.0;
                    chaos_state.is_retry_storming = false;
                    chaos_state.recovery_at_tick = None;
                }
            }
        }

        // Heal edges whose heals_at_tick has passed.
        let healed_edges: Vec<EdgeId> = self
            .edge_states
            .iter()
            .filter(|(_, s)| s.heals_at_tick.map(|t| t <= current_tick).unwrap_or(false))
            .map(|(id, _)| id.clone())
            .collect();

        for edge_id in healed_edges {
            log_info(&format!(
                "[Chaos] Edge '{}' auto-healed at tick {}.",
                edge_id, current_tick
            ));
            self.edge_states.remove(&edge_id);
            self.partitioned_edges.remove(&edge_id);
        }
    }
}

// =============================================================================
// WASM-Exposed Builder (for JS interop)
// =============================================================================

/// JS-friendly wrapper to schedule chaos events from the frontend "Chaos Mode" UI.
#[wasm_bindgen]
pub struct ChaosBridge {
    events: Vec<ChaosEvent>,
    next_id: u32,
}

#[wasm_bindgen]
impl ChaosBridge {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ChaosBridge {
        ChaosBridge {
            events: Vec::new(),
            next_id: 0,
        }
    }

    /// Schedule a "Kill Node" event from the JS UI.
    pub fn kill_node(&mut self, node_id: &str, trigger_tick: u64, duration_ticks: Option<u64>) {
        let id = self.next_id;
        self.next_id += 1;
        self.events.push(ChaosEvent {
            event_id: format!("chaos-kill-{}", id),
            kind: ChaosEventKind::KillNode,
            target_node: Some(node_id.to_string()),
            target_edge: None,
            trigger_tick,
            duration_ticks,
            intensity: 1.0,
            partition_group_a: None,
            partition_group_b: None,
            random_target_pct: None,
        });
    }

    /// Schedule a "Partition Edge" event from the JS UI.
    pub fn partition_edge(&mut self, edge_id: &str, trigger_tick: u64, duration_ticks: Option<u64>) {
        let id = self.next_id;
        self.next_id += 1;
        self.events.push(ChaosEvent {
            event_id: format!("chaos-partition-{}", id),
            kind: ChaosEventKind::PartitionEdge,
            target_node: None,
            target_edge: Some(edge_id.to_string()),
            trigger_tick,
            duration_ticks,
            intensity: 1.0,
            partition_group_a: None,
            partition_group_b: None,
            random_target_pct: None,
        });
    }

    /// Schedule a "CPU Spike" event from the JS UI.
    pub fn cpu_spike(
        &mut self,
        node_id: &str,
        intensity: f64,
        trigger_tick: u64,
        duration_ticks: Option<u64>,
    ) {
        let id = self.next_id;
        self.next_id += 1;
        self.events.push(ChaosEvent {
            event_id: format!("chaos-cpu-{}", id),
            kind: ChaosEventKind::CpuSpike,
            target_node: Some(node_id.to_string()),
            target_edge: None,
            trigger_tick,
            duration_ticks,
            intensity,
            partition_group_a: None,
            partition_group_b: None,
            random_target_pct: None,
        });
    }

    /// Schedule a "Cascade Failure" from the JS UI.
    pub fn cascade_failure(&mut self, origin_node: &str, intensity: f64, trigger_tick: u64) {
        let id = self.next_id;
        self.next_id += 1;
        self.events.push(ChaosEvent {
            event_id: format!("chaos-cascade-{}", id),
            kind: ChaosEventKind::CascadeFailure,
            target_node: Some(origin_node.to_string()),
            target_edge: None,
            trigger_tick,
            duration_ticks: None,
            intensity,
            partition_group_a: None,
            partition_group_b: None,
            random_target_pct: None,
        });
    }

    /// Serializes scheduled events to JSON for transfer to the SimulationEngine.
    pub fn to_json(&self) -> String {
        serde_json::to_string(&self.events).unwrap_or_else(|_| "[]".to_string())
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn make_engine() -> ChaosEngine {
        ChaosEngine::new(42)
    }

    fn node(id: &str) -> NodeId {
        id.to_string()
    }

    fn edge(id: &str) -> EdgeId {
        id.to_string()
    }

    #[test]
    fn test_kill_node_marks_dead() {
        let mut engine = make_engine();
        engine.schedule_event(ChaosEvent {
            event_id: "e1".to_string(),
            kind: ChaosEventKind::KillNode,
            target_node: Some(node("db-primary")),
            target_edge: None,
            trigger_tick: 1,
            duration_ticks: None,
            intensity: 1.0,
            partition_group_a: None,
            partition_group_b: None,
            random_target_pct: None,
        });

        let nodes = vec![node("db-primary"), node("api")];
        let edges = vec![];
        engine.tick(1, &nodes, &edges);

        assert!(engine.is_node_down(&node("db-primary")));
        assert!(!engine.is_node_down(&node("api")));
    }

    #[test]
    fn test_partition_edge_blocks_traffic() {
        let mut engine = make_engine();
        engine.schedule_event(ChaosEvent {
            event_id: "e2".to_string(),
            kind: ChaosEventKind::PartitionEdge,
            target_node: None,
            target_edge: Some(edge("api->db")),
            trigger_tick: 0,
            duration_ticks: Some(5),
            intensity: 1.0,
            partition_group_a: None,
            partition_group_b: None,
            random_target_pct: None,
        });

        engine.tick(0, &[], &[edge("api->db")]);
        assert!(engine.is_partitioned(&edge("api->db")));
        assert_eq!(engine.edge_extra_packet_loss(&edge("api->db")), 1.0);
    }

    #[test]
    fn test_edge_heals_after_duration() {
        let mut engine = make_engine();
        engine.schedule_event(ChaosEvent {
            event_id: "e3".to_string(),
            kind: ChaosEventKind::PartitionEdge,
            target_node: None,
            target_edge: Some(edge("svc->cache")),
            trigger_tick: 0,
            duration_ticks: Some(3),
            intensity: 1.0,
            partition_group_a: None,
            partition_group_b: None,
            random_target_pct: None,
        });

        engine.tick(0, &[], &[edge("svc->cache")]);
        assert!(engine.is_partitioned(&edge("svc->cache")));

        // Advance past expiry.
        engine.tick(3, &[], &[]);
        assert!(!engine.is_partitioned(&edge("svc->cache")));
    }

    #[test]
    fn test_cpu_spike_reduces_throughput() {
        let mut engine = make_engine();
        engine.schedule_event(ChaosEvent {
            event_id: "e4".to_string(),
            kind: ChaosEventKind::CpuSpike,
            target_node: Some(node("api-server")),
            target_edge: None,
            trigger_tick: 0,
            duration_ticks: Some(10),
            intensity: 0.8,
            partition_group_a: None,
            partition_group_b: None,
            random_target_pct: None,
        });

        engine.tick(0, &[node("api-server")], &[]);
        let mult = engine.node_throughput_multiplier(&node("api-server"));
        // intensity=0.8 → throughput = 1.0 - (0.8*0.9) = 0.28
        assert!(mult < 0.35 && mult > 0.20);
    }

    #[test]
    fn test_retry_storm_flagged() {
        let mut engine = make_engine();
        engine.schedule_event(ChaosEvent {
            event_id: "e5".to_string(),
            kind: ChaosEventKind::RetryStorm,
            target_node: Some(node("payment-svc")),
            target_edge: None,
            trigger_tick: 0,
            duration_ticks: None,
            intensity: 1.0,
            partition_group_a: None,
            partition_group_b: None,
            random_target_pct: None,
        });

        engine.tick(0, &[node("payment-svc")], &[]);
        assert!(engine.is_retry_storming(&node("payment-svc")));
    }

    #[test]
    fn test_manual_heal_node() {
        let mut engine = make_engine();
        engine.schedule_event(ChaosEvent {
            event_id: "e6".to_string(),
            kind: ChaosEventKind::KillNode,
            target_node: Some(node("cache")),
            target_edge: None,
            trigger_tick: 0,
            duration_ticks: None,
            intensity: 1.0,
            partition_group_a: None,
            partition_group_b: None,
            random_target_pct: None,
        });

        engine.tick(0, &[node("cache")], &[]);
        assert!(engine.is_node_down(&node("cache")));

        engine.heal_node(&node("cache"));
        assert!(!engine.is_node_down(&node("cache")));
    }
}
