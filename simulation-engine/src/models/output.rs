use serde::{Deserialize, Serialize};

use crate::analyzer::cost::CostEstimate;
use crate::analyzer::grader::GradeResult;
use crate::analyzer::root_cause::RootCauseReport;
use crate::graph::node::NodeState;
use crate::physics::chaos::ChaosEffect;
use crate::physics::engine::SimulationStatus;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeMetrics {
    pub node_id: String,
    pub active_connections: u32,
    pub queue_depth: u32,
    pub requests_received: u64,
    pub requests_succeeded: u64,
    pub requests_failed: u64,
    pub p50_latency_ms: f64,
    pub p99_latency_ms: f64,
    pub error_rate: f64,
    pub is_overloaded: bool,
    pub state: NodeState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeMetrics {
    pub edge_id: String,
    pub packets_in_flight: u32,
    pub packets_delivered: u64,
    pub packets_dropped: u64,
    pub effective_latency_ms: f64,
    pub is_partitioned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TickSnapshot {
    pub tick: u64,
    pub sim_time_ms: f64,
    pub node_metrics: Vec<NodeMetrics>,
    pub edge_metrics: Vec<EdgeMetrics>,
    pub chaos_effects_this_tick: Vec<ChaosEffect>,
}

/// The component that runs out of headroom first, and when.
///
/// An aggregate p99 says a system is slow; it does not say what to fix. This
/// names the node that saturated earliest in the run, so a report can say "your
/// database saturates first at your stated peak" instead of quoting a number
/// about nothing in particular.
///
/// `None` when nothing saturated -- which is itself worth reporting, because it
/// means the offered load never found a bottleneck.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaturationPoint {
    pub node_id: String,
    pub node_type: Option<String>,
    /// The first tick at which this node reported itself overloaded.
    pub first_overloaded_tick: u64,
    /// Queue depth at that tick -- how much work had already piled up.
    pub queue_depth_at_saturation: u32,
    /// Share of the run this node spent overloaded, 0-1.
    pub fraction_of_run_overloaded: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationOutput {
    pub graph_hash: String,
    pub status: SimulationStatus,
    pub ticks_run: u64,
    pub total_sim_time_ms: f64,
    pub total_requests: u64,
    pub total_failures: u64,
    pub overall_error_rate: f64,
    /// Requests issued, counted once per request rather than per node visit.
    pub requests_issued: u64,
    /// Requests that failed somewhere along their path.
    pub requests_failed: u64,
    /// requests_failed / requests_issued.
    ///
    /// Prefer this over `overall_error_rate` for anything that compares
    /// architectures. That field sums per-node tallies, so it is divided by the
    /// number of hops a request makes and systematically flatters long chains.
    pub request_error_rate: f64,
    pub avg_p99_latency_ms: f64,
    pub snapshots: Vec<TickSnapshot>,
    pub chaos_effects: Vec<ChaosEffect>,
    pub crash_tick: Option<u64>,
    pub grade: GradeResult,
    pub cost: CostEstimate,
    pub root_cause: RootCauseReport,
    /// Which component ran out of headroom first. See `SaturationPoint`.
    pub saturating_component: Option<SaturationPoint>,
    pub telemetry: Vec<TelemetryRow>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TelemetryRow {
    pub run_id: String,
    pub tick: u64,
    pub node_id: String,
    pub node_type: String,
    pub queue_depth: f64,
    pub arrival_rate: f64,
    pub processing_rate: f64,
    pub utilisation: f64,
    pub mean_latency_ms: f64,
    pub node_state: String,
    pub cascade_label: bool,
    pub ticks_to_failure: Option<u64>,
}
