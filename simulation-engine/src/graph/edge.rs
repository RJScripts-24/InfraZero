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

    /// What kind of call this edge carries: "read", "write", "async", "sync".
    ///
    /// Only `async` changes behaviour, and it changes it fundamentally: the
    /// caller's request completes at the handoff instead of waiting for
    /// everything downstream. Without this distinction, putting a queue between
    /// two services leaves the caller coupled to the slowest thing behind it,
    /// which is exactly the coupling the queue exists to remove.
    ///
    /// Absent means synchronous -- the conservative reading of an unlabelled
    /// arrow on a diagram.
    #[serde(default)]
    pub call_kind: Option<String>,
}
