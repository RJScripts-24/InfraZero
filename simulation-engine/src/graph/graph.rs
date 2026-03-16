use serde::{Deserialize, Serialize};

use crate::graph::edge::Edge;
use crate::graph::node::Node;

/// Canonical graph container used for deterministic hashing and validation.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GraphTopology {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

impl GraphTopology {
    pub fn get_outgoing_edges(&self, node_id: &str) -> Vec<&Edge> {
        self.edges.iter().filter(|e| e.source == node_id).collect()
    }

    pub fn has_entry_point(&self) -> bool {
        self.nodes.iter().any(|n| {
            matches!(
                n.node_type.as_deref(),
                Some("client") | Some("cdn") | Some("api_gateway") | Some("load_balancer")
            )
        })
    }
}
