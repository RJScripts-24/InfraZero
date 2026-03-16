use serde::{Deserialize, Serialize};

use crate::graph::edge::Edge;
use crate::graph::node::Node;
use crate::models::output::TickSnapshot;
use crate::physics::chaos::ChaosEffect;
use crate::physics::engine::SimulationStatus;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RootCauseReport {
    pub summary: String,
    pub primary_cause: String,
    pub contributing_factors: Vec<String>,
    pub recommendations: Vec<String>,
}

pub struct RootCauseAnalyzer;

impl RootCauseAnalyzer {
    pub fn analyze(
        snapshots: &[TickSnapshot],
        chaos_effects: &[ChaosEffect],
        nodes: &[Node],
        _edges: &[Edge],
        status: &SimulationStatus,
        crash_tick: Option<u64>,
    ) -> RootCauseReport {
        let mut contributing_factors = Vec::new();
        let mut recommendations = Vec::new();

        let max_error = snapshots
            .iter()
            .flat_map(|s| s.node_metrics.iter())
            .map(|m| m.error_rate)
            .fold(0.0_f64, f64::max);

        let max_queue = snapshots
            .iter()
            .flat_map(|s| s.node_metrics.iter())
            .map(|m| m.queue_depth)
            .max()
            .unwrap_or(0);

        let primary_cause = if matches!(status, SimulationStatus::Crashed) && max_error > 0.8 {
            "Cascading failures due to high sustained error rate.".to_string()
        } else if max_queue > 1_000 {
            "Queue saturation and backpressure collapse.".to_string()
        } else if !chaos_effects.is_empty() {
            "Injected chaos event(s) destabilized critical path.".to_string()
        } else {
            "No dominant single failure mode detected.".to_string()
        };

        if !chaos_effects.is_empty() {
            contributing_factors.push(format!("{} chaos event(s) were active.", chaos_effects.len()));
        }

        if max_error > 0.5 {
            contributing_factors.push(format!(
                "Peak per-node error rate reached {:.1}%.",
                max_error * 100.0
            ));
            recommendations.push(
                "Reduce retry amplification and add circuit breakers for failing dependencies."
                    .to_string(),
            );
        }

        if max_queue > 200 {
            contributing_factors.push(format!("Peak queue depth reached {}.", max_queue));
            recommendations.push(
                "Increase queue capacity or scale consumers to absorb bursts.".to_string(),
            );
        }

        let db_count = nodes
            .iter()
            .filter(|n| n.node_type.as_deref() == Some("database"))
            .count();
        if db_count == 1 {
            contributing_factors.push("Single database detected (possible SPOF).".to_string());
            recommendations.push("Add read replicas or failover for the data tier.".to_string());
        }

        if recommendations.is_empty() {
            recommendations.push("Run chaos scenarios with higher traffic to expose weak links.".to_string());
        }

        let summary = match crash_tick {
            Some(tick) => format!("Simulation crashed at tick {}.", tick),
            None => "Simulation completed without crash.".to_string(),
        };

        RootCauseReport {
            summary,
            primary_cause,
            contributing_factors,
            recommendations,
        }
    }
}
