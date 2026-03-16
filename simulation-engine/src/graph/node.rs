use serde::{Deserialize, Serialize};

pub type NodeId = String;

/// Runtime health/state of a node during simulation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeState {
    Healthy,
    Degraded,
    Restarting,
    Dead,
    Partitioned,
}

/// Provider-agnostic actor model used by the simulation engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: NodeId,
    pub label: String,
    pub node_type: Option<String>,

    // Logical layer traits used by physics/chaos.
    pub processing_power: f64,
    pub cold_start_latency_ms: f64,
    pub queue_capacity: u32,
    pub failure_rate: f64,

    // Visual layer metadata.
    pub x: f64,
    pub y: f64,
    pub provider_icon: Option<String>,
}
