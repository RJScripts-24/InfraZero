// =============================================================================
// network.rs — InfraZero Simulation Engine
// Network Simulation: Latency, Jitter, Packet Loss, Bandwidth Throttling
//
// Responsibility:
//   Models realistic network behavior for each edge traversal in the graph.
//   Computes effective latency (base + jitter + chaos overhead), determines
//   packet drop events, enforces bandwidth limits, and provides utilities
//   for network condition profiling.
//
//   All randomness is seeded via SeededRng → fully deterministic and
//   reproducible across machines given the same Universe Seed.
//
// Design Philosophy:
//   Edges in InfraZero are "first-class simulation entities." This module
//   treats every hop as a miniature network pipeline with its own:
//     - Propagation delay  (base latency)
//     - Transmission delay (bandwidth limit)
//     - Queuing delay      (congestion / throttle)
//     - Corruption/loss   (packet loss + chaos overlay)
//     - Jitter            (random variance on propagation delay)
// =============================================================================

use serde::{Deserialize, Serialize};

use crate::graph::edge::Edge;
use crate::utils::rng::SeededRng;
use crate::utils::logger::{log_info, log_warn, log_error};

// =============================================================================
// Constants
// =============================================================================

/// Assumed average packet size in KB for bandwidth calculations.
const AVG_PACKET_SIZE_KB: f64 = 64.0;

/// Minimum effective latency floor (ms). No traversal can be faster than this.
const MIN_LATENCY_MS: f64 = 0.1;

/// Maximum modeled latency before a traversal is considered a timeout (ms).
const TIMEOUT_LATENCY_MS: f64 = 30_000.0;

/// Jitter distribution: fraction of base latency used as 1-sigma for Gaussian jitter.
const JITTER_SIGMA_FRACTION: f64 = 0.3;

/// Bandwidth throttle: fraction at which severe congestion warnings are emitted.
const CONGESTION_WARN_THRESHOLD: f64 = 0.7;

// =============================================================================
// Public Types
// =============================================================================

/// The result of simulating a single packet traversal across one edge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraversalResult {
    /// Effective latency experienced by this packet (ms).
    pub latency_ms: f64,
    /// Whether the packet was dropped (packet loss or partition).
    pub dropped: bool,
    /// Whether the packet timed out (latency exceeded TIMEOUT_LATENCY_MS).
    pub timed_out: bool,
    /// The breakdown of latency components.
    pub breakdown: LatencyBreakdown,
    /// Network condition observed on this traversal.
    pub condition: NetworkCondition,
}

/// Detailed breakdown of how total latency was composed.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LatencyBreakdown {
    /// Base propagation delay from edge config (ms).
    pub propagation_ms: f64,
    /// Random jitter applied this traversal (ms).
    pub jitter_ms: f64,
    /// Transmission delay based on bandwidth limit (ms).
    pub transmission_ms: f64,
    /// Extra queuing/congestion delay from bandwidth throttle (ms).
    pub queuing_ms: f64,
    /// Extra latency injected by chaos (ms).
    pub chaos_ms: f64,
    /// Total (sum of all components).
    pub total_ms: f64,
}

/// High-level classification of the network condition observed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NetworkCondition {
    /// Clean traversal with low latency and no loss.
    Healthy,
    /// Elevated latency but no packet loss.
    Degraded,
    /// High latency, partial packet loss.
    Congested,
    /// Severe degradation — near total packet loss or timeout.
    Critical,
    /// Packet was lost.
    Lost,
    /// Latency exceeded the timeout threshold.
    TimedOut,
}

/// Snapshot of a network edge's aggregate health over a simulation window.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeHealthSnapshot {
    pub edge_id: String,
    pub sample_count: u64,
    pub avg_latency_ms: f64,
    pub p50_latency_ms: f64,
    pub p95_latency_ms: f64,
    pub p99_latency_ms: f64,
    pub packet_loss_rate: f64,
    pub timeout_rate: f64,
    pub condition: NetworkCondition,
}

/// Configuration for a specific network profile preset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkProfile {
    pub name: String,
    pub base_latency_ms: f64,
    pub jitter_ms: f64,
    pub packet_loss: f64,
    pub bandwidth_mbps: f64,
}

// =============================================================================
// NetworkSimulator
// =============================================================================

/// The NetworkSimulator is responsible for modeling realistic packet traversal
/// across graph edges. It is stateless between traversals (all state is in the
/// SeededRng) — making it safe to call from the engine's hot tick loop.
#[derive(Debug)]
pub struct NetworkSimulator {
    /// Seed used to initialize RNG (stored for diagnostics).
    seed: u64,
    /// Per-edge latency sample history for health snapshot computation.
    /// Key: edge_id, Value: vec of observed latencies (ms).
    latency_history: std::collections::HashMap<String, Vec<f64>>,
    /// Per-edge drop counter. Key: edge_id, Value: (total, dropped).
    drop_history: std::collections::HashMap<String, (u64, u64)>,
}

impl NetworkSimulator {
    // =========================================================================
    // Construction
    // =========================================================================

    pub fn new(seed: u64) -> Self {
        log_info("[Network] NetworkSimulator initialized.");
        NetworkSimulator {
            seed,
            latency_history: std::collections::HashMap::new(),
            drop_history: std::collections::HashMap::new(),
        }
    }

    // =========================================================================
    // Primary API: simulate_traversal
    // =========================================================================

    /// Simulate a single packet traversal across a given edge.
    ///
    /// # Arguments
    /// - `edge`              — The graph edge being traversed (base config).
    /// - `chaos_latency_ms`  — Extra latency injected by the chaos engine (ms).
    /// - `chaos_packet_loss` — Extra packet loss rate from chaos (0.0–1.0).
    /// - `chaos_throttle`    — Bandwidth throttle fraction from chaos (0.0–1.0).
    /// - `rng`               — Seeded RNG passed in from the engine tick.
    ///
    /// # Returns
    /// A `TraversalResult` with latency, drop status, and condition.
    pub fn simulate_traversal(
        &mut self,
        edge: &Edge,
        chaos_latency_ms: f64,
        chaos_packet_loss: f64,
        chaos_throttle: f64,
        rng: &mut SeededRng,
    ) -> TraversalResult {
        // ── Step 1: Compute effective packet loss rate ─────────────────────────
        let effective_loss = self.compute_effective_loss(edge.packet_loss, chaos_packet_loss);

        // ── Step 2: Roll for packet drop ──────────────────────────────────────
        if self.roll_packet_drop(effective_loss, rng) {
            log_warn(&format!(
                "[Network] Packet dropped on edge '{}' (loss={:.2}%).",
                edge.id, effective_loss * 100.0
            ));
            self.record_drop(&edge.id, true);
            return TraversalResult {
                latency_ms: 0.0,
                dropped: true,
                timed_out: false,
                breakdown: LatencyBreakdown::default(),
                condition: NetworkCondition::Lost,
            };
        }

        self.record_drop(&edge.id, false);

        // ── Step 3: Compute propagation delay (base latency) ──────────────────
        let propagation_ms = edge.latency_ms.max(0.0);

        // ── Step 4: Compute jitter ─────────────────────────────────────────────
        // Jitter is modeled as Gaussian noise centered on 0 with sigma derived
        // from the configured edge jitter + chaos extra jitter.
        let jitter_sigma = edge.jitter_ms.max(0.0);
        let jitter_ms = self.compute_jitter(propagation_ms, jitter_sigma, rng);

        // ── Step 5: Compute transmission delay (bandwidth limit) ───────────────
        let effective_bandwidth_mbps = self.compute_effective_bandwidth(
            edge.bandwidth_limit_mbps,
            chaos_throttle,
        );
        let transmission_ms = self.compute_transmission_delay(effective_bandwidth_mbps);

        // ── Step 6: Compute queuing/congestion delay from throttle ────────────
        let queuing_ms = self.compute_queuing_delay(chaos_throttle, propagation_ms);

        // ── Step 7: Sum all latency components ────────────────────────────────
        let total_ms = (propagation_ms + jitter_ms + transmission_ms + queuing_ms + chaos_latency_ms)
            .max(MIN_LATENCY_MS);

        let breakdown = LatencyBreakdown {
            propagation_ms,
            jitter_ms,
            transmission_ms,
            queuing_ms,
            chaos_ms: chaos_latency_ms,
            total_ms,
        };

        // ── Step 8: Check for timeout ─────────────────────────────────────────
        if total_ms >= TIMEOUT_LATENCY_MS {
            log_error(&format!(
                "[Network] TIMEOUT on edge '{}': {:.0}ms exceeds threshold.",
                edge.id, total_ms
            ));
            self.record_latency(&edge.id, total_ms);
            return TraversalResult {
                latency_ms: total_ms,
                dropped: false,
                timed_out: true,
                breakdown,
                condition: NetworkCondition::TimedOut,
            };
        }

        // ── Step 9: Classify network condition ────────────────────────────────
        let condition = self.classify_condition(total_ms, effective_loss, chaos_throttle, edge.latency_ms);

        if matches!(condition, NetworkCondition::Congested | NetworkCondition::Critical) {
            log_warn(&format!(
                "[Network] Edge '{}' condition: {:?} ({:.0}ms, {:.1}% loss).",
                edge.id, condition, total_ms, effective_loss * 100.0
            ));
        }

        // ── Step 10: Record history for health snapshots ──────────────────────
        self.record_latency(&edge.id, total_ms);

        TraversalResult {
            latency_ms: total_ms,
            dropped: false,
            timed_out: false,
            breakdown,
            condition,
        }
    }

    // =========================================================================
    // Network Profile Presets
    // =========================================================================

    /// Returns a built-in network profile by name.
    /// Profiles can be applied to edges for quick scenario setup.
    pub fn get_profile(name: &str) -> Option<NetworkProfile> {
        match name {
            // Ideal same-region cloud network.
            "lan" => Some(NetworkProfile {
                name: "LAN".to_string(),
                base_latency_ms: 0.5,
                jitter_ms: 0.1,
                packet_loss: 0.0001,
                bandwidth_mbps: 10_000.0,
            }),
            // Typical same-AZ cloud internal network.
            "same_az" => Some(NetworkProfile {
                name: "Same AZ".to_string(),
                base_latency_ms: 1.0,
                jitter_ms: 0.3,
                packet_loss: 0.0005,
                bandwidth_mbps: 5_000.0,
            }),
            // Cross-AZ within the same region.
            "cross_az" => Some(NetworkProfile {
                name: "Cross AZ".to_string(),
                base_latency_ms: 3.0,
                jitter_ms: 1.0,
                packet_loss: 0.001,
                bandwidth_mbps: 2_000.0,
            }),
            // Cross-region (e.g., us-east-1 to eu-west-1).
            "cross_region" => Some(NetworkProfile {
                name: "Cross Region".to_string(),
                base_latency_ms: 80.0,
                jitter_ms: 10.0,
                packet_loss: 0.005,
                bandwidth_mbps: 500.0,
            }),
            // Intercontinental WAN (e.g., US to APAC).
            "wan" => Some(NetworkProfile {
                name: "WAN".to_string(),
                base_latency_ms: 200.0,
                jitter_ms: 25.0,
                packet_loss: 0.01,
                bandwidth_mbps: 100.0,
            }),
            // Degraded network (poor connectivity, high loss).
            "degraded" => Some(NetworkProfile {
                name: "Degraded".to_string(),
                base_latency_ms: 150.0,
                jitter_ms: 50.0,
                packet_loss: 0.08,
                bandwidth_mbps: 50.0,
            }),
            // Satellite link (very high latency, moderate loss).
            "satellite" => Some(NetworkProfile {
                name: "Satellite".to_string(),
                base_latency_ms: 600.0,
                jitter_ms: 80.0,
                packet_loss: 0.03,
                bandwidth_mbps: 20.0,
            }),
            _ => None,
        }
    }

    /// Apply a profile's parameters to an edge's traversal configuration
    /// (returns adjusted parameters as a tuple for use in simulate_traversal).
    pub fn apply_profile(profile: &NetworkProfile) -> (f64, f64, f64) {
        // Returns (extra_latency_ms, extra_packet_loss, bandwidth_throttle)
        // A profile replaces base edge values; chaos overrides are additive on top.
        (profile.base_latency_ms, profile.packet_loss, 0.0)
    }

    // =========================================================================
    // Health Snapshot
    // =========================================================================

    /// Compute a health snapshot for a specific edge from accumulated history.
    pub fn edge_health(&self, edge_id: &str) -> Option<EdgeHealthSnapshot> {
        let latencies = self.latency_history.get(edge_id)?;
        if latencies.is_empty() {
            return None;
        }

        let (total, dropped) = self
            .drop_history
            .get(edge_id)
            .copied()
            .unwrap_or((0, 0));

        let mut sorted = latencies.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let avg = sorted.iter().sum::<f64>() / sorted.len() as f64;
        let p50 = percentile(&sorted, 50.0);
        let p95 = percentile(&sorted, 95.0);
        let p99 = percentile(&sorted, 99.0);

        let loss_rate = if total > 0 {
            dropped as f64 / total as f64
        } else {
            0.0
        };

        let timeout_count = latencies
            .iter()
            .filter(|&&l| l >= TIMEOUT_LATENCY_MS)
            .count() as u64;
        let timeout_rate = if total > 0 {
            timeout_count as f64 / total as f64
        } else {
            0.0
        };

        // Classify overall edge condition from aggregates.
        let condition = classify_edge_health(avg, loss_rate, timeout_rate);

        Some(EdgeHealthSnapshot {
            edge_id: edge_id.to_string(),
            sample_count: latencies.len() as u64,
            avg_latency_ms: avg,
            p50_latency_ms: p50,
            p95_latency_ms: p95,
            p99_latency_ms: p99,
            packet_loss_rate: loss_rate,
            timeout_rate,
            condition,
        })
    }

    /// Compute health snapshots for all tracked edges.
    pub fn all_edge_health(&self) -> Vec<EdgeHealthSnapshot> {
        self.latency_history
            .keys()
            .filter_map(|id| self.edge_health(id))
            .collect()
    }

    /// Clear accumulated history (e.g., at simulation reset).
    pub fn reset_history(&mut self) {
        self.latency_history.clear();
        self.drop_history.clear();
    }

    // =========================================================================
    // Network Condition Utilities (Public)
    // =========================================================================

    /// Estimate round-trip time for a given edge config (ms).
    /// Useful for timeout budget calculations in the analyzer.
    pub fn estimate_rtt(edge: &Edge) -> f64 {
        // RTT ≈ 2 × (propagation + transmission).
        let transmission_ms = compute_transmission_delay_static(edge.bandwidth_limit_mbps);
        (edge.latency_ms + transmission_ms) * 2.0
    }

    /// Compute the maximum safe queue depth for a node given its
    /// downstream edge bandwidth and expected request size.
    pub fn safe_queue_depth(bandwidth_mbps: f64, target_latency_ms: f64) -> u32 {
        // Bandwidth (KB/ms) × target latency (ms) / packet size (KB).
        let bandwidth_kb_per_ms = (bandwidth_mbps * 1024.0) / (8.0 * 1000.0);
        let safe_depth = (bandwidth_kb_per_ms * target_latency_ms / AVG_PACKET_SIZE_KB) as u32;
        safe_depth.max(1)
    }

    /// Check if an edge is congested based on throttle fraction.
    pub fn is_congested(chaos_throttle: f64) -> bool {
        chaos_throttle >= CONGESTION_WARN_THRESHOLD
    }

    /// Compute throughput efficiency fraction for an edge under current conditions.
    /// Returns 0.0 (no throughput) to 1.0 (full throughput).
    pub fn throughput_efficiency(edge: &Edge, chaos_throttle: f64, chaos_packet_loss: f64) -> f64 {
        let effective_bandwidth = compute_effective_bandwidth_static(edge.bandwidth_limit_mbps, chaos_throttle);
        let bandwidth_fraction = (effective_bandwidth / edge.bandwidth_limit_mbps).clamp(0.0, 1.0);
        let delivery_fraction = 1.0 - (edge.packet_loss + chaos_packet_loss).clamp(0.0, 1.0);
        bandwidth_fraction * delivery_fraction
    }

    // =========================================================================
    // Private: Computation Helpers
    // =========================================================================

    /// Compute the combined effective packet loss rate (base + chaos overlay).
    fn compute_effective_loss(&self, base_loss: f64, chaos_loss: f64) -> f64 {
        // Combined using the complement rule to avoid double-counting:
        // P(drop) = 1 - (1 - base) × (1 - chaos)
        let effective = 1.0 - (1.0 - base_loss.clamp(0.0, 1.0)) * (1.0 - chaos_loss.clamp(0.0, 1.0));
        effective.clamp(0.0, 1.0)
    }

    /// Roll whether a packet is dropped given an effective loss rate.
    fn roll_packet_drop(&self, effective_loss: f64, rng: &mut SeededRng) -> bool {
        if effective_loss <= 0.0 {
            return false;
        }
        if effective_loss >= 1.0 {
            return true;
        }
        rng.next_f64() < effective_loss
    }

    /// Compute jitter contribution to latency.
    /// Models jitter as Gaussian noise with sigma = configured jitter_ms.
    /// The result is clamped so it never subtracts more than half the base latency.
    fn compute_jitter(&self, base_latency_ms: f64, jitter_sigma_ms: f64, rng: &mut SeededRng) -> f64 {
        if jitter_sigma_ms <= 0.0 {
            return 0.0;
        }
        // Gaussian jitter: can be negative (lower than base) or positive (higher).
        let raw = rng.next_gaussian(0.0, jitter_sigma_ms);
        // Clamp: jitter cannot reduce latency below 50% of base, or add more than 3× sigma.
        raw.clamp(-(base_latency_ms * 0.5), jitter_sigma_ms * 3.0)
    }

    /// Compute effective bandwidth after chaos throttle is applied.
    fn compute_effective_bandwidth(&self, base_mbps: f64, chaos_throttle: f64) -> f64 {
        compute_effective_bandwidth_static(base_mbps, chaos_throttle)
    }

    /// Compute transmission delay: time to push packet onto the wire.
    /// Formula: (packet_size_kb × 8) / bandwidth_kbps
    fn compute_transmission_delay(&self, effective_bandwidth_mbps: f64) -> f64 {
        compute_transmission_delay_static(effective_bandwidth_mbps)
    }

    /// Compute queuing/congestion delay introduced by bandwidth throttling.
    /// At throttle=0.0 → no queuing delay.
    /// At throttle=1.0 → severe queuing delay (proportional to base latency).
    fn compute_queuing_delay(&self, chaos_throttle: f64, base_latency_ms: f64) -> f64 {
        if chaos_throttle <= 0.0 {
            return 0.0;
        }
        // Exponential queuing model: delay grows non-linearly near saturation.
        // This mimics M/D/1 queue behavior near utilization = 1.
        let utilization = chaos_throttle.clamp(0.0, 0.999);
        let queuing_factor = utilization / (1.0 - utilization);
        // Scale by base latency: a high-latency link accumulates queue delay faster.
        (queuing_factor * base_latency_ms * 0.5).min(TIMEOUT_LATENCY_MS)
    }

    /// Classify network condition based on observed latency, loss, and throttle.
    fn classify_condition(
        &self,
        total_latency_ms: f64,
        effective_loss: f64,
        chaos_throttle: f64,
        base_latency_ms: f64,
    ) -> NetworkCondition {
        // Latency ratio: how much worse is total latency vs. base?
        let latency_ratio = if base_latency_ms > 0.0 {
            total_latency_ms / base_latency_ms
        } else {
            1.0
        };

        if total_latency_ms >= TIMEOUT_LATENCY_MS {
            return NetworkCondition::TimedOut;
        }

        if effective_loss >= 0.5 || chaos_throttle >= 0.9 || latency_ratio >= 20.0 {
            return NetworkCondition::Critical;
        }

        if effective_loss >= 0.1 || chaos_throttle >= CONGESTION_WARN_THRESHOLD || latency_ratio >= 5.0 {
            return NetworkCondition::Congested;
        }

        if effective_loss > 0.01 || chaos_throttle > 0.2 || latency_ratio >= 2.0 {
            return NetworkCondition::Degraded;
        }

        NetworkCondition::Healthy
    }

    // =========================================================================
    // Private: History Recording
    // =========================================================================

    fn record_latency(&mut self, edge_id: &str, latency_ms: f64) {
        self.latency_history
            .entry(edge_id.to_string())
            .or_insert_with(Vec::new)
            .push(latency_ms);

        let (total, _) = self
            .drop_history
            .entry(edge_id.to_string())
            .or_insert((0, 0));
        *total += 1;
    }

    fn record_drop(&mut self, edge_id: &str, dropped: bool) {
        let entry = self
            .drop_history
            .entry(edge_id.to_string())
            .or_insert((0, 0));
        entry.0 += 1;
        if dropped {
            entry.1 += 1;
        }
    }
}

// =============================================================================
// Static Helpers (usable without NetworkSimulator instance)
// =============================================================================

/// Compute effective bandwidth after throttle without a NetworkSimulator instance.
fn compute_effective_bandwidth_static(base_mbps: f64, chaos_throttle: f64) -> f64 {
    let throttle = chaos_throttle.clamp(0.0, 1.0);
    // Throttle=0 → full bandwidth. Throttle=1 → near-zero (floor at 0.001 Mbps).
    let effective = base_mbps * (1.0 - throttle);
    effective.max(0.001)
}

/// Compute transmission delay from bandwidth.
fn compute_transmission_delay_static(effective_bandwidth_mbps: f64) -> f64 {
    if effective_bandwidth_mbps <= 0.0 {
        return TIMEOUT_LATENCY_MS;
    }
    // Convert Mbps to KB/ms: 1 Mbps = 1000 Kbps = 125 KB/s = 0.125 KB/ms
    let bandwidth_kb_per_ms = (effective_bandwidth_mbps * 1000.0) / (8.0 * 1000.0);
    if bandwidth_kb_per_ms <= 0.0 {
        return TIMEOUT_LATENCY_MS;
    }
    (AVG_PACKET_SIZE_KB / bandwidth_kb_per_ms).min(TIMEOUT_LATENCY_MS)
}

/// Classify aggregate edge health from snapshot-level metrics.
fn classify_edge_health(avg_latency_ms: f64, loss_rate: f64, timeout_rate: f64) -> NetworkCondition {
    if timeout_rate > 0.05 || loss_rate > 0.5 {
        return NetworkCondition::Critical;
    }
    if timeout_rate > 0.01 || loss_rate > 0.1 || avg_latency_ms > 5_000.0 {
        return NetworkCondition::Congested;
    }
    if loss_rate > 0.01 || avg_latency_ms > 500.0 {
        return NetworkCondition::Degraded;
    }
    NetworkCondition::Healthy
}

/// Compute a percentile value from a pre-sorted slice.
fn percentile(sorted: &[f64], pct: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((sorted.len() as f64) * (pct / 100.0)) as usize;
    sorted[idx.min(sorted.len() - 1)]
}

// =============================================================================
// NetworkConditionMonitor
// =============================================================================

/// A higher-level monitor that tracks network health across ALL edges in
/// the simulation and surfaces system-wide network statistics.
/// Intended to feed the Post-Mortem Report's "Latency Graphs" section.
#[derive(Debug, Default)]
pub struct NetworkConditionMonitor {
    /// Per-tick system-wide average latency samples.
    pub tick_avg_latency: Vec<f64>,
    /// Per-tick system-wide packet loss rate.
    pub tick_loss_rate: Vec<f64>,
    /// Per-tick system-wide timeout rate.
    pub tick_timeout_rate: Vec<f64>,
    /// Tick indices at which a Critical condition was detected.
    pub critical_ticks: Vec<u64>,
}

impl NetworkConditionMonitor {
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a tick's aggregated network metrics.
    pub fn record_tick(
        &mut self,
        tick: u64,
        traversal_results: &[TraversalResult],
    ) {
        if traversal_results.is_empty() {
            self.tick_avg_latency.push(0.0);
            self.tick_loss_rate.push(0.0);
            self.tick_timeout_rate.push(0.0);
            return;
        }

        let total = traversal_results.len() as f64;
        let dropped = traversal_results.iter().filter(|r| r.dropped).count() as f64;
        let timed_out = traversal_results.iter().filter(|r| r.timed_out).count() as f64;
        let total_latency: f64 = traversal_results
            .iter()
            .filter(|r| !r.dropped)
            .map(|r| r.latency_ms)
            .sum();
        let delivered = total - dropped;

        let avg_latency = if delivered > 0.0 { total_latency / delivered } else { 0.0 };
        let loss_rate = dropped / total;
        let timeout_rate = timed_out / total;

        self.tick_avg_latency.push(avg_latency);
        self.tick_loss_rate.push(loss_rate);
        self.tick_timeout_rate.push(timeout_rate);

        // Flag critical ticks.
        if loss_rate > 0.5 || timeout_rate > 0.05 || avg_latency > 5_000.0 {
            log_error(&format!(
                "[Network][Monitor] Critical network condition at tick {}: \
                avg={:.0}ms, loss={:.1}%, timeout={:.1}%.",
                tick, avg_latency, loss_rate * 100.0, timeout_rate * 100.0
            ));
            self.critical_ticks.push(tick);
        }
    }

    /// Peak observed average latency across all ticks.
    pub fn peak_latency_ms(&self) -> f64 {
        self.tick_avg_latency.iter().cloned().fold(0.0_f64, f64::max)
    }

    /// Overall average latency across the full simulation.
    pub fn overall_avg_latency_ms(&self) -> f64 {
        if self.tick_avg_latency.is_empty() {
            return 0.0;
        }
        self.tick_avg_latency.iter().sum::<f64>() / self.tick_avg_latency.len() as f64
    }

    /// Overall average packet loss rate.
    pub fn overall_loss_rate(&self) -> f64 {
        if self.tick_loss_rate.is_empty() {
            return 0.0;
        }
        self.tick_loss_rate.iter().sum::<f64>() / self.tick_loss_rate.len() as f64
    }

    /// Returns true if any critical network event was detected.
    pub fn had_critical_event(&self) -> bool {
        !self.critical_ticks.is_empty()
    }

    /// Returns the latency time series suitable for the Report's line chart.
    pub fn latency_series(&self) -> Vec<(u64, f64)> {
        self.tick_avg_latency
            .iter()
            .enumerate()
            .map(|(i, &v)| (i as u64, v))
            .collect()
    }

    /// Returns the packet loss time series.
    pub fn loss_series(&self) -> Vec<(u64, f64)> {
        self.tick_loss_rate
            .iter()
            .enumerate()
            .map(|(i, &v)| (i as u64, v))
            .collect()
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::rng::SeededRng;

    fn make_edge(id: &str, latency: f64, jitter: f64, loss: f64, bw: f64) -> Edge {
        Edge {
            id: id.to_string(),
            source: "a".to_string(),
            target: "b".to_string(),
            latency_ms: latency,
            jitter_ms: jitter,
            packet_loss: loss,
            bandwidth_limit_mbps: bw,
        }
    }

    fn make_simulator() -> NetworkSimulator {
        NetworkSimulator::new(42)
    }

    fn make_rng() -> SeededRng {
        SeededRng::new(99)
    }

    // ── Core traversal ─────────────────────────────────────────────────────────

    #[test]
    fn test_healthy_edge_produces_valid_latency() {
        let mut sim = make_simulator();
        let mut rng = make_rng();
        let edge = make_edge("e1", 5.0, 1.0, 0.0, 1000.0);

        let result = sim.simulate_traversal(&edge, 0.0, 0.0, 0.0, &mut rng);
        assert!(!result.dropped, "Zero-loss edge should not drop.");
        assert!(!result.timed_out, "Low-latency edge should not timeout.");
        assert!(result.latency_ms >= MIN_LATENCY_MS, "Latency must be above floor.");
        assert!(result.latency_ms < 100.0, "Healthy edge should be fast.");
        assert_eq!(result.condition, NetworkCondition::Healthy);
    }

    #[test]
    fn test_full_packet_loss_always_drops() {
        let mut sim = make_simulator();
        let mut rng = make_rng();
        let edge = make_edge("e2", 5.0, 0.0, 1.0, 1000.0);

        for _ in 0..20 {
            let result = sim.simulate_traversal(&edge, 0.0, 0.0, 0.0, &mut rng);
            assert!(result.dropped, "100% packet loss must always drop.");
        }
    }

    #[test]
    fn test_zero_packet_loss_never_drops() {
        let mut sim = make_simulator();
        let mut rng = make_rng();
        let edge = make_edge("e3", 5.0, 0.5, 0.0, 1000.0);

        for _ in 0..100 {
            let result = sim.simulate_traversal(&edge, 0.0, 0.0, 0.0, &mut rng);
            assert!(!result.dropped, "0% packet loss must never drop.");
        }
    }

    #[test]
    fn test_chaos_latency_is_added() {
        let mut sim = make_simulator();
        let mut rng_a = SeededRng::new(1);
        let mut rng_b = SeededRng::new(1);
        let edge = make_edge("e4", 10.0, 0.0, 0.0, 1000.0);

        let clean = sim.simulate_traversal(&edge, 0.0, 0.0, 0.0, &mut rng_a);
        let chaotic = sim.simulate_traversal(&edge, 200.0, 0.0, 0.0, &mut rng_b);

        if !clean.dropped && !chaotic.dropped {
            assert!(
                chaotic.latency_ms > clean.latency_ms,
                "Chaos latency must increase total latency."
            );
            assert_eq!(chaotic.breakdown.chaos_ms, 200.0);
        }
    }

    #[test]
    fn test_chaos_packet_loss_stacks_with_base_loss() {
        let mut sim = make_simulator();
        let mut rng = SeededRng::new(7);
        // Base loss = 0.5, chaos loss = 0.5 → effective = 1 - (0.5 × 0.5) = 0.75
        let edge = make_edge("e5", 5.0, 0.0, 0.5, 1000.0);

        let mut drops = 0;
        let total = 100;
        for _ in 0..total {
            let result = sim.simulate_traversal(&edge, 0.0, 0.5, 0.0, &mut rng);
            if result.dropped {
                drops += 1;
            }
        }
        // With effective loss ~75%, expect well over 50% drops.
        assert!(drops > 50, "Stacked 75% loss should drop most packets. Got {}.", drops);
    }

    #[test]
    fn test_bandwidth_throttle_increases_latency() {
        let mut sim = make_simulator();
        let edge = make_edge("e6", 5.0, 0.0, 0.0, 100.0);

        // No throttle.
        let mut rng_a = SeededRng::new(3);
        let clean = sim.simulate_traversal(&edge, 0.0, 0.0, 0.0, &mut rng_a);

        // Heavy throttle.
        let mut rng_b = SeededRng::new(3);
        let throttled = sim.simulate_traversal(&edge, 0.0, 0.0, 0.8, &mut rng_b);

        if !clean.dropped && !throttled.dropped {
            assert!(
                throttled.latency_ms >= clean.latency_ms,
                "Throttle should increase latency."
            );
            assert!(throttled.breakdown.queuing_ms >= 0.0);
        }
    }

    #[test]
    fn test_condition_healthy_for_clean_edge() {
        let mut sim = make_simulator();
        let mut rng = make_rng();
        let edge = make_edge("e7", 2.0, 0.2, 0.0, 5000.0);
        let result = sim.simulate_traversal(&edge, 0.0, 0.0, 0.0, &mut rng);
        assert_eq!(result.condition, NetworkCondition::Healthy);
    }

    #[test]
    fn test_condition_critical_under_heavy_chaos() {
        let mut sim = make_simulator();
        let mut rng = make_rng();
        let edge = make_edge("e8", 5.0, 0.0, 0.0, 100.0);

        // 95% throttle → Critical condition (if packet not dropped).
        let result = sim.simulate_traversal(&edge, 5000.0, 0.0, 0.95, &mut rng);
        if !result.dropped {
            assert!(
                matches!(result.condition, NetworkCondition::Critical | NetworkCondition::TimedOut),
                "Heavy throttle+latency should be Critical or TimedOut, got {:?}.",
                result.condition
            );
        }
    }

    // ── Network profiles ───────────────────────────────────────────────────────

    #[test]
    fn test_profile_lan_has_low_latency() {
        let profile = NetworkSimulator::get_profile("lan").unwrap();
        assert!(profile.base_latency_ms < 5.0);
        assert!(profile.packet_loss < 0.001);
        assert!(profile.bandwidth_mbps > 1000.0);
    }

    #[test]
    fn test_profile_wan_has_high_latency() {
        let profile = NetworkSimulator::get_profile("wan").unwrap();
        assert!(profile.base_latency_ms > 100.0);
    }

    #[test]
    fn test_unknown_profile_returns_none() {
        assert!(NetworkSimulator::get_profile("nonexistent").is_none());
    }

    // ── Edge health snapshot ───────────────────────────────────────────────────

    #[test]
    fn test_edge_health_snapshot_after_traversals() {
        let mut sim = make_simulator();
        let mut rng = make_rng();
        let edge = make_edge("snap_edge", 10.0, 2.0, 0.01, 1000.0);

        for _ in 0..50 {
            sim.simulate_traversal(&edge, 0.0, 0.0, 0.0, &mut rng);
        }

        let snapshot = sim.edge_health("snap_edge");
        assert!(snapshot.is_some(), "Should have health data after traversals.");
        let snap = snapshot.unwrap();
        assert_eq!(snap.edge_id, "snap_edge");
        assert!(snap.sample_count > 0);
        assert!(snap.avg_latency_ms > 0.0);
        assert!(snap.p50_latency_ms <= snap.p99_latency_ms);
    }

    #[test]
    fn test_edge_health_returns_none_for_unknown_edge() {
        let sim = make_simulator();
        assert!(sim.edge_health("ghost_edge").is_none());
    }

    // ── Utilities ──────────────────────────────────────────────────────────────

    #[test]
    fn test_rtt_estimate_is_nonzero() {
        let edge = make_edge("rtt_edge", 20.0, 0.0, 0.0, 500.0);
        let rtt = NetworkSimulator::estimate_rtt(&edge);
        assert!(rtt > 40.0, "RTT must be at least 2× base latency.");
    }

    #[test]
    fn test_safe_queue_depth_scales_with_bandwidth() {
        let low_bw = NetworkSimulator::safe_queue_depth(10.0, 100.0);
        let high_bw = NetworkSimulator::safe_queue_depth(1000.0, 100.0);
        assert!(high_bw > low_bw, "Higher bandwidth should allow larger safe queue.");
    }

    #[test]
    fn test_throughput_efficiency_full_under_no_chaos() {
        let edge = make_edge("eff_edge", 5.0, 0.0, 0.0, 1000.0);
        let eff = NetworkSimulator::throughput_efficiency(&edge, 0.0, 0.0);
        assert!((eff - 1.0).abs() < 0.001, "No chaos → 100% efficiency.");
    }

    #[test]
    fn test_throughput_efficiency_low_under_full_throttle() {
        let edge = make_edge("eff_edge2", 5.0, 0.0, 0.0, 1000.0);
        let eff = NetworkSimulator::throughput_efficiency(&edge, 1.0, 0.0);
        assert!(eff < 0.01, "Full throttle → near-zero efficiency.");
    }

    // ── NetworkConditionMonitor ────────────────────────────────────────────────

    #[test]
    fn test_monitor_records_and_aggregates() {
        let mut monitor = NetworkConditionMonitor::new();

        let results = vec![
            TraversalResult {
                latency_ms: 10.0,
                dropped: false,
                timed_out: false,
                breakdown: LatencyBreakdown::default(),
                condition: NetworkCondition::Healthy,
            },
            TraversalResult {
                latency_ms: 20.0,
                dropped: false,
                timed_out: false,
                breakdown: LatencyBreakdown::default(),
                condition: NetworkCondition::Healthy,
            },
        ];

        monitor.record_tick(1, &results);

        assert_eq!(monitor.tick_avg_latency.len(), 1);
        assert!((monitor.tick_avg_latency[0] - 15.0).abs() < 0.01);
        assert_eq!(monitor.tick_loss_rate[0], 0.0);
    }

    #[test]
    fn test_monitor_flags_critical_tick() {
        let mut monitor = NetworkConditionMonitor::new();

        // 90% drops → critical.
        let results: Vec<TraversalResult> = (0..10)
            .map(|i| TraversalResult {
                latency_ms: 0.0,
                dropped: i < 9,
                timed_out: false,
                breakdown: LatencyBreakdown::default(),
                condition: if i < 9 { NetworkCondition::Lost } else { NetworkCondition::Healthy },
            })
            .collect();

        monitor.record_tick(5, &results);
        assert!(monitor.had_critical_event());
        assert_eq!(monitor.critical_ticks[0], 5);
    }

    #[test]
    fn test_latency_series_length_matches_ticks() {
        let mut monitor = NetworkConditionMonitor::new();
        for tick in 0..10 {
            monitor.record_tick(tick, &[]);
        }
        assert_eq!(monitor.latency_series().len(), 10);
    }

    // ── Determinism ────────────────────────────────────────────────────────────

    #[test]
    fn test_same_seed_produces_identical_results() {
        let edge = make_edge("det_edge", 10.0, 3.0, 0.05, 500.0);

        let mut sim_a = NetworkSimulator::new(42);
        let mut rng_a = SeededRng::new(100);
        let results_a: Vec<TraversalResult> = (0..20)
            .map(|_| sim_a.simulate_traversal(&edge, 0.0, 0.0, 0.0, &mut rng_a))
            .collect();

        let mut sim_b = NetworkSimulator::new(42);
        let mut rng_b = SeededRng::new(100);
        let results_b: Vec<TraversalResult> = (0..20)
            .map(|_| sim_b.simulate_traversal(&edge, 0.0, 0.0, 0.0, &mut rng_b))
            .collect();

        for (a, b) in results_a.iter().zip(results_b.iter()) {
            assert_eq!(a.dropped, b.dropped, "Drop result must be deterministic.");
            assert!(
                (a.latency_ms - b.latency_ms).abs() < 0.0001,
                "Latency must be deterministic."
            );
        }
    }

    // ── Latency breakdown integrity ────────────────────────────────────────────

    #[test]
    fn test_breakdown_total_matches_reported_latency() {
        let mut sim = make_simulator();
        let mut rng = make_rng();
        let edge = make_edge("bd_edge", 15.0, 3.0, 0.0, 500.0);

        for _ in 0..20 {
            let result = sim.simulate_traversal(&edge, 50.0, 0.0, 0.3, &mut rng);
            if !result.dropped && !result.timed_out {
                let expected = result.breakdown.total_ms;
                assert!(
                    (result.latency_ms - expected).abs() < 0.001,
                    "Reported latency must equal breakdown total."
                );
            }
        }
    }
}