use serde::{Deserialize, Serialize};

use crate::graph::edge::Edge;
use crate::graph::node::Node;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostEstimate {
    pub estimated_monthly_usd: f64,
    pub eci_score: u32,
    pub cost_tier: String,
}

pub struct CostEstimator;

impl CostEstimator {
    pub fn estimate(nodes: &[Node], edges: &[Edge]) -> CostEstimate {
        let mut monthly = 0.0_f64;

        for node in nodes {
            let base = if node.processing_power >= 2.0 {
                60.0
            } else if node.processing_power >= 1.0 {
                35.0
            } else {
                20.0
            };
            let queue_factor = (node.queue_capacity as f64 / 500.0).min(4.0);
            monthly += base + (8.0 * queue_factor);
        }

        for edge in edges {
            let bw_factor = (edge.bandwidth_limit_mbps / 500.0).min(20.0);
            let loss_factor = (1.0 + edge.packet_loss).max(1.0);
            monthly += 3.0 * bw_factor * loss_factor;
        }

        let eci_score = monthly.round() as u32;
        let cost_tier = match eci_score {
            0..=300 => "Low",
            301..=900 => "Moderate",
            901..=1800 => "High",
            _ => "Enterprise",
        }
        .to_string();

        CostEstimate {
            estimated_monthly_usd: monthly,
            eci_score,
            cost_tier,
        }
    }
}
