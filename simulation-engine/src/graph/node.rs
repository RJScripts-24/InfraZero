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

    /// How many instances this box represents. Defaults to 1 when absent.
    ///
    /// An architecture diagram draws *tiers*, not instances: the single box
    /// labelled "Netty Server" on Netflix's published diagram stands for a fleet
    /// of thousands. Without this field the engine has no way to know that, so
    /// killing that one box reports a total outage -- which is true of the
    /// drawing and false of the system. Measured consequence: Netflix scored a
    /// WORSE blast radius (0.306) than a twelve-service shared-database
    /// anti-pattern (0.162), purely because the anti-pattern's twelve parallel
    /// services each carry a twelfth of the traffic.
    ///
    /// Kubernetes manifests state this directly as `spec.replicas`, so for a
    /// scraped corpus it is recoverable rather than assumed.
    #[serde(default)]
    pub replicas: Option<u32>,

    // Visual layer metadata.
    pub x: f64,
    pub y: f64,
    pub provider_icon: Option<String>,
}
