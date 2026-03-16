use serde::{Deserialize, Serialize};

pub type EdgeId = String;

/// Runtime health/state of an edge during simulation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeState {
    Healthy,
    Degraded,
    Partitioned,
}

/// Directed network edge in the logical graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub id: EdgeId,
    pub source: String,
    pub target: String,

    // Physical constraints used by the network simulator.
    pub latency_ms: f64,
    pub jitter_ms: f64,
    pub packet_loss: f64,
    pub bandwidth_limit_mbps: f64,
}
