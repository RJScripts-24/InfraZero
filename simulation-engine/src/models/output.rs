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
    pub avg_p99_latency_ms: f64,
    pub snapshots: Vec<TickSnapshot>,
    pub chaos_effects: Vec<ChaosEffect>,
    pub crash_tick: Option<u64>,
    pub grade: GradeResult,
    pub cost: CostEstimate,
    pub root_cause: RootCauseReport,
}
