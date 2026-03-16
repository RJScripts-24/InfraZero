use serde::{Deserialize, Serialize};

use crate::graph::edge::Edge;
use crate::graph::node::Node;
use crate::physics::chaos::ChaosEffect;
use crate::physics::engine::SimulationStatus;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GradeResult {
    pub grade: String,
    pub score: u32,
    pub rationale: Vec<String>,
}

pub struct Grader;

impl Grader {
    pub fn grade(
        nodes: &[Node],
        edges: &[Edge],
        overall_error_rate: f64,
        avg_p99_latency_ms: f64,
        status: &SimulationStatus,
        chaos_effects: &[ChaosEffect],
    ) -> GradeResult {
        let mut score: i32 = 100;
        let mut rationale: Vec<String> = Vec::new();

        if matches!(status, SimulationStatus::Crashed) {
            score -= 35;
            rationale.push("Simulation crashed under load.".to_string());
        }

        let err_penalty = (overall_error_rate * 60.0).round() as i32;
        if err_penalty > 0 {
            score -= err_penalty;
            rationale.push(format!(
                "High error rate penalty: -{} (error rate {:.1}%).",
                err_penalty,
                overall_error_rate * 100.0
            ));
        }

        if avg_p99_latency_ms > 2_000.0 {
            score -= 20;
            rationale.push("Very high p99 latency (>2000ms).".to_string());
        } else if avg_p99_latency_ms > 750.0 {
            score -= 10;
            rationale.push("Elevated p99 latency (>750ms).".to_string());
        }

        if nodes.len() <= 2 {
            score -= 8;
            rationale.push("Small topology with limited redundancy.".to_string());
        }
        if edges.is_empty() {
            score -= 12;
            rationale.push("No network paths were modeled.".to_string());
        }
        if !chaos_effects.is_empty() && matches!(status, SimulationStatus::Completed) {
            score += 4;
            rationale.push("Recovered from injected chaos events.".to_string());
        }

        let score = score.clamp(0, 100) as u32;
        let grade = match score {
            90..=100 => "A",
            80..=89 => "B",
            70..=79 => "C",
            60..=69 => "D",
            _ => "F",
        }
        .to_string();

        GradeResult {
            grade,
            score,
            rationale,
        }
    }
}
