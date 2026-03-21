use serde::{Deserialize, Serialize};

use crate::graph::edge::Edge;
use crate::graph::node::Node;
use crate::models::output::TickSnapshot;
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
        snapshots: &[TickSnapshot],
    ) -> GradeResult {
        let mut rationale: Vec<String> = Vec::new();

        // In-degree and out-degree maps
        let mut in_degree: std::collections::HashMap<&str, usize> =
            std::collections::HashMap::new();
        let mut out_degree: std::collections::HashMap<&str, usize> =
            std::collections::HashMap::new();
        for edge in edges {
            *in_degree.entry(edge.target.as_str()).or_insert(0) += 1;
            *out_degree.entry(edge.source.as_str()).or_insert(0) += 1;
        }

        // Node type helpers
        let has_cache = nodes.iter().any(|n| n.node_type.as_deref() == Some("cache"));
        let has_lb = nodes.iter().any(|n| {
            n.node_type.as_deref() == Some("load_balancer")
                || n.node_type.as_deref() == Some("api_gateway")
        });
        let has_queue = nodes.iter().any(|n| n.node_type.as_deref() == Some("queue"));
        let has_db = nodes.iter().any(|n| n.node_type.as_deref() == Some("database"));
        let db_nodes: Vec<&Node> = nodes
            .iter()
            .filter(|n| n.node_type.as_deref() == Some("database"))
            .collect();
        let compute_nodes: Vec<&Node> = nodes
            .iter()
            .filter(|n| matches!(n.node_type.as_deref(), Some("compute") | Some("api")))
            .collect();

        // Runtime metrics from snapshots
        let all_node_metrics: Vec<&crate::models::output::NodeMetrics> = snapshots
            .iter()
            .flat_map(|s| s.node_metrics.iter())
            .collect();

        // Peak queue depth per node across all ticks
        let mut peak_queue: std::collections::HashMap<String, u32> =
            std::collections::HashMap::new();
        for m in &all_node_metrics {
            let entry = peak_queue.entry(m.node_id.clone()).or_insert(0);
            if m.queue_depth > *entry {
                *entry = m.queue_depth;
            }
        }

        // Number of ticks each node spent overloaded
        let mut overload_ticks: std::collections::HashMap<String, u64> =
            std::collections::HashMap::new();
        for m in &all_node_metrics {
            if m.is_overloaded {
                *overload_ticks.entry(m.node_id.clone()).or_insert(0) += 1;
            }
        }

        // Total ticks run
        let total_ticks = snapshots.len() as f64;

        // Per-node peak error rate across all ticks
        let mut peak_error_per_node: std::collections::HashMap<String, f64> =
            std::collections::HashMap::new();
        for m in &all_node_metrics {
            let entry = peak_error_per_node.entry(m.node_id.clone()).or_insert(0.0);
            if m.error_rate > *entry {
                *entry = m.error_rate;
            }
        }

        // Edge metrics
        let avg_packet_loss = if edges.is_empty() {
            0.0
        } else {
            edges.iter().map(|e| e.packet_loss).sum::<f64>() / edges.len() as f64
        };
        let avg_edge_latency = if edges.is_empty() {
            0.0
        } else {
            edges.iter().map(|e| e.latency_ms).sum::<f64>() / edges.len() as f64
        };

        // ━━━ PILLAR 1: Availability (20 points) ━━━
        let availability_pct = (1.0 - overall_error_rate).clamp(0.0, 1.0) * 100.0;
        let p1: i32 = if availability_pct >= 99.99 {
            20
        } else if availability_pct >= 99.9 {
            16
        } else if availability_pct >= 99.5 {
            11
        } else if availability_pct >= 99.0 {
            6
        } else if availability_pct >= 95.0 {
            2
        } else {
            0
        };
        rationale.push(format!("Availability: {:.3}% → {}/20", availability_pct, p1));

        // ━━━ PILLAR 2: Latency (12 points) ━━━
        let p2: i32 = if avg_p99_latency_ms < 100.0 {
            12
        } else if avg_p99_latency_ms < 250.0 {
            9
        } else if avg_p99_latency_ms < 500.0 {
            6
        } else if avg_p99_latency_ms < 1_000.0 {
            3
        } else if avg_p99_latency_ms < 2_000.0 {
            1
        } else {
            0
        };
        rationale.push(format!("P99 latency: {:.0}ms → {}/12", avg_p99_latency_ms, p2));

        // ━━━ PILLAR 3: Runtime stability (15 points) ━━━
        let mut p3: i32 = 15;

        let mut overload_penalty = 0;
        for node in nodes {
            let ticks = *overload_ticks.get(node.id.as_str()).unwrap_or(&0) as f64;
            let overload_fraction = if total_ticks > 0.0 {
                ticks / total_ticks
            } else {
                0.0
            };
            if overload_fraction > 0.5 && overload_penalty < 8 {
                overload_penalty += 4;
                rationale.push(format!(
                    "Node '{}' overloaded {:.0}% of run → penalty",
                    node.label,
                    overload_fraction * 100.0
                ));
            } else if overload_fraction > 0.2 && overload_penalty < 8 {
                overload_penalty += 2;
                rationale.push(format!(
                    "Node '{}' overloaded {:.0}% of run → penalty",
                    node.label,
                    overload_fraction * 100.0
                ));
            }
            if overload_penalty >= 8 {
                break;
            }
        }
        p3 -= overload_penalty.min(8);

        let mut queue_penalty = 0;
        for node in nodes {
            if queue_penalty >= 4 || node.queue_capacity == 0 {
                continue;
            }
            let peak = *peak_queue.get(node.id.as_str()).unwrap_or(&0);
            let usage = peak as f64 / node.queue_capacity as f64;
            if usage > 0.9 {
                queue_penalty += 3;
                rationale.push(format!(
                    "Node '{}' queue peaked at {}/{} capacity",
                    node.label, peak, node.queue_capacity
                ));
            } else if usage > 0.7 {
                queue_penalty += 1;
                rationale.push(format!(
                    "Node '{}' queue peaked at {}/{} capacity",
                    node.label, peak, node.queue_capacity
                ));
            }
        }
        p3 -= queue_penalty.min(4);

        if matches!(status, SimulationStatus::Crashed) {
            p3 -= 6;
        }

        let all_nodes_stable = nodes.iter().all(|node| {
            let ticks = *overload_ticks.get(node.id.as_str()).unwrap_or(&0) as f64;
            let overload_fraction = if total_ticks > 0.0 {
                ticks / total_ticks
            } else {
                0.0
            };
            overload_fraction < 0.1
        });
        if matches!(status, SimulationStatus::Completed) && all_nodes_stable {
            p3 += 3;
            rationale.push("All nodes stable throughout".to_string());
        }
        let p3 = p3.clamp(0, 15);

        // ━━━ PILLAR 4: Fault tolerance (13 points) ━━━
        let mut p4: i32 = 6;
        let mut type_counts: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
        for node in nodes {
            let t = node.node_type.as_deref().unwrap_or("unknown");
            *type_counts.entry(t).or_insert(0) += 1;
        }

        for (node_type, count) in &type_counts {
            if *count != 1 {
                continue;
            }
            if let Some(node) = nodes
                .iter()
                .find(|n| n.node_type.as_deref().unwrap_or("unknown") == *node_type)
            {
                let indeg = *in_degree.get(node.id.as_str()).unwrap_or(&0);
                if indeg >= 2 {
                    p4 -= 4;
                    rationale.push(format!(
                        "SPOF: '{}' (type: {}) has no redundancy → -4",
                        node.label, node_type
                    ));
                    if *node_type == "database" {
                        p4 -= 2;
                    }
                }
            }
        }

        let has_redundancy = type_counts.values().any(|count| *count >= 2);
        if has_redundancy {
            p4 += 5;
            rationale.push("Horizontal redundancy present → +5".to_string());
        }

        if !chaos_effects.is_empty() && matches!(status, SimulationStatus::Completed) {
            p4 += 4;
            rationale.push("Survived chaos injection → +4".to_string());
        }
        let p4 = p4.clamp(0, 13);

        // ━━━ PILLAR 5: Anti-pattern detection (15 points) ━━━
        let mut p5: i32 = 15;

        if has_db && !has_cache && compute_nodes.len() >= 2 {
            p5 -= 4;
            rationale.push("ANTI-PATTERN: Thundering Herd — compute nodes hitting DB directly with no cache. Cache miss storms will collapse the database under load. (Netflix 2012, Reddit 2012)".to_string());
        }

        if db_nodes.len() == 1 {
            let db = db_nodes[0];
            if *in_degree.get(db.id.as_str()).unwrap_or(&0) >= 3 {
                p5 -= 4;
                rationale.push("ANTI-PATTERN: Database SPOF — single DB serving 3+ services. Any DB failure = total outage. Add read replicas + failover. (GitHub 2018)".to_string());
            }
        }

        if has_db
            && !has_cache
            && db_nodes
                .iter()
                .any(|n| *in_degree.get(n.id.as_str()).unwrap_or(&0) >= 4)
        {
            p5 -= 3;
            rationale.push("ANTI-PATTERN: N+1 Query risk — DB has 4+ direct callers, no cache. Individual queries multiply load quadratically.".to_string());
        }

        if compute_nodes.len() >= 2 && !has_lb {
            p5 -= 3;
            rationale.push("ANTI-PATTERN: No load balancer — multiple compute nodes with no traffic distribution. Hotspots will form. (Stripe 2019)".to_string());
        }

        if let Some((node, degree)) = nodes.iter().find_map(|n| {
            let deg = *out_degree.get(n.id.as_str()).unwrap_or(&0);
            if deg >= 5 {
                Some((n, deg))
            } else {
                None
            }
        }) {
            p5 -= 3;
            rationale.push(format!(
                "ANTI-PATTERN: Fan-out explosion — '{}' fans out to {} services. One request triggers {} downstream calls. (Twitter 2013)",
                node.label, degree, degree
            ));
        }

        if nodes.iter().any(|n| n.failure_rate > 0.05) && !has_queue {
            p5 -= 2;
            rationale.push("ANTI-PATTERN: Retry storm risk — high-failure-rate nodes with no async buffer. Retries will amplify load 3-5x during partial outages. (Amazon 2021)".to_string());
        }

        if let Some(_node) = nodes.iter().find(|n| {
            n.cold_start_latency_ms > 200.0 && *in_degree.get(n.id.as_str()).unwrap_or(&0) >= 2
        }) {
            p5 -= 2;
            rationale.push("ANTI-PATTERN: Cold start cascade — high cold-start node on critical path. Traffic spikes after idle = latency cascades.".to_string());
        }

        if !has_lb && nodes.len() >= 3 {
            p5 -= 1;
            rationale.push("ANTI-PATTERN: No traffic control layer — without a load balancer there is no rate limiting, circuit breaking, or DDoS protection.".to_string());
        }
        let p5 = p5.clamp(0, 15);

        // ━━━ PILLAR 6: Network resilience (8 points) ━━━
        let packet_loss_score: i32 = if avg_packet_loss < 0.001 {
            4
        } else if avg_packet_loss < 0.01 {
            2
        } else if avg_packet_loss < 0.05 {
            1
        } else {
            0
        };
        rationale.push(format!(
            "Avg packet loss: {:.3}% → {}/4",
            avg_packet_loss * 100.0,
            packet_loss_score
        ));

        let edge_latency_score: i32 = if avg_edge_latency < 5.0 {
            2
        } else if avg_edge_latency < 20.0 {
            1
        } else {
            0
        };

        let path_redundancy_score: i32 = if edges.len() > nodes.len() {
            rationale.push("Multiple network paths".to_string());
            2
        } else {
            0
        };
        let p6 = (packet_loss_score + edge_latency_score + path_redundancy_score).clamp(0, 8);

        // ━━━ PILLAR 7: Scalability (7 points) ━━━
        let node_count_score: i32 = if nodes.len() >= 10 {
            3
        } else if nodes.len() >= 5 {
            2
        } else if nodes.len() >= 3 {
            1
        } else {
            0
        };
        let queue_capacity_score: i32 = if nodes.iter().any(|n| n.queue_capacity >= 500) {
            3
        } else if nodes.iter().any(|n| n.queue_capacity >= 200) {
            2
        } else {
            0
        };
        let processing_balance_score: i32 = if nodes.is_empty() {
            0
        } else {
            let min_pp = nodes
                .iter()
                .map(|n| n.processing_power)
                .fold(f64::INFINITY, f64::min);
            let max_pp = nodes
                .iter()
                .map(|n| n.processing_power)
                .fold(0.0_f64, f64::max);
            if min_pp > 0.0 && (max_pp / min_pp) < 3.0 {
                1
            } else {
                0
            }
        };
        let p7 = (node_count_score + queue_capacity_score + processing_balance_score).clamp(0, 7);

        // ━━━ PILLAR 8: Operational excellence (5 points) ━━━
        let mut p8: i32 = 0;
        if has_lb && !compute_nodes.is_empty() && has_db {
            p8 += 2;
        }
        if has_cache {
            p8 += 2;
        }
        if has_queue {
            p8 += 1;
        }
        let p8 = p8.clamp(0, 5);

        // ━━━ PILLAR 9: Peak error node analysis (3 points) ━━━
        let nodes_over_10pct = peak_error_per_node.values().filter(|v| **v > 0.10).count();
        let p9: i32 = if nodes_over_10pct == 0 {
            rationale.push("All nodes error-stable".to_string());
            3
        } else if nodes_over_10pct == 1 {
            1
        } else {
            0
        };
        rationale.push(format!(
            "Peak per-node error rate: {:.1}% → {}/3",
            peak_error_per_node
                .values()
                .cloned()
                .fold(0.0_f64, f64::max)
                * 100.0,
            p9
        ));

        // ━━━ PILLAR 10: Failure configuration quality (2 points) ━━━
        let high_risk = nodes.iter().filter(|n| n.failure_rate > 0.05).count();
        let p10: i32 = if high_risk == 0 {
            2
        } else if high_risk == 1 {
            1
        } else {
            0
        };

        // ━━━ FINAL SCORE ━━━
        let total = (p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9 + p10).clamp(0, 100);
        rationale.push(format!(
            "Score breakdown — Avail:{}/20, Latency:{}/12, RuntimeStability:{}/15, FaultTol:{}/13, AntiPatterns:{}/15, Network:{}/8, Scalability:{}/7, Operations:{}/5, PeakErrors:{}/3, FailConfig:{}/2 = {}/100",
            p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, total
        ));

        let score = total as u32;
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
