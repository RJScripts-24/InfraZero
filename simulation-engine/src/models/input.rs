use serde::{Deserialize, Serialize};

use crate::graph::edge::Edge;
use crate::graph::node::Node;
use crate::physics::engine::SimulationConfig;

/// The full payload consumed by the simulation engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationInput {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub config: SimulationConfig,
}

impl SimulationInput {
    pub fn is_valid(&self) -> bool {
        !self.nodes.is_empty()
    }
}
