use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::graph::edge::Edge;
use crate::graph::node::Node;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

pub struct GraphValidator<'a> {
    nodes: &'a [Node],
    edges: &'a [Edge],
}

impl<'a> GraphValidator<'a> {
    pub fn new(nodes: &'a [Node], edges: &'a [Edge]) -> Self {
        Self { nodes, edges }
    }

    pub fn validate(&self) -> ValidationResult {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        if self.nodes.is_empty() {
            errors.push("Graph has no nodes.".to_string());
        }
        if self.edges.is_empty() {
            warnings.push("Graph has no edges.".to_string());
        }

        let node_ids: HashSet<&str> = self.nodes.iter().map(|n| n.id.as_str()).collect();

        let mut seen_nodes = HashSet::new();
        for node in self.nodes {
            if !seen_nodes.insert(node.id.as_str()) {
                errors.push(format!("Duplicate node id '{}'.", node.id));
            }
        }

        let mut seen_edges = HashSet::new();
        for edge in self.edges {
            if !seen_edges.insert(edge.id.as_str()) {
                errors.push(format!("Duplicate edge id '{}'.", edge.id));
            }
            if !node_ids.contains(edge.source.as_str()) {
                errors.push(format!(
                    "Edge '{}' source '{}' does not exist.",
                    edge.id, edge.source
                ));
            }
            if !node_ids.contains(edge.target.as_str()) {
                errors.push(format!(
                    "Edge '{}' target '{}' does not exist.",
                    edge.id, edge.target
                ));
            }
            if edge.bandwidth_limit_mbps <= 0.0 {
                errors.push(format!(
                    "Edge '{}' bandwidth_limit_mbps must be > 0.",
                    edge.id
                ));
            }
            if !(0.0..=1.0).contains(&edge.packet_loss) {
                errors.push(format!(
                    "Edge '{}' packet_loss must be between 0.0 and 1.0.",
                    edge.id
                ));
            }
        }

        for node in self.nodes {
            if node.processing_power <= 0.0 {
                errors.push(format!("Node '{}' processing_power must be > 0.", node.id));
            }
            if !(0.0..=1.0).contains(&node.failure_rate) {
                errors.push(format!(
                    "Node '{}' failure_rate must be between 0.0 and 1.0.",
                    node.id
                ));
            }
        }

        ValidationResult {
            is_valid: errors.is_empty(),
            errors,
            warnings,
        }
    }
}
