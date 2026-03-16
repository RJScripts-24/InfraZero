use serde::{Deserialize, Serialize};

use crate::utils::rng::SeededRng;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrafficPattern {
    Steady,
    Burst,
    ThunderingHerd,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequestStatus {
    Pending,
    Success,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestPacket {
    pub id: String,
    pub created_at_ms: f64,
    pub status: RequestStatus,
    pub total_latency_ms: f64,
    pub path: Vec<String>,
    pub error: Option<String>,
}

impl Default for RequestPacket {
    fn default() -> Self {
        Self {
            id: "req-0".to_string(),
            created_at_ms: 0.0,
            status: RequestStatus::Pending,
            total_latency_ms: 0.0,
            path: Vec::new(),
            error: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct TrafficGenerator {
    _seed: u64,
    pattern: TrafficPattern,
    baseline_rps: f64,
    peak_rps_multiplier: f64,
    counter: u64,
}

impl TrafficGenerator {
    pub fn new(
        seed: u64,
        pattern: TrafficPattern,
        baseline_rps: f64,
        peak_rps_multiplier: f64,
    ) -> Self {
        Self {
            _seed: seed,
            pattern,
            baseline_rps: baseline_rps.max(0.0),
            peak_rps_multiplier: peak_rps_multiplier.max(1.0),
            counter: 0,
        }
    }

    pub fn generate_tick(
        &mut self,
        tick: u64,
        sim_time_ms: f64,
        rng: &mut SeededRng,
    ) -> Vec<RequestPacket> {
        let tick_rps = self.tick_rps(tick);
        let expected_per_tick = (tick_rps / 100.0).max(0.0);

        let mut request_count = expected_per_tick.floor() as u64;
        let fractional = expected_per_tick - request_count as f64;
        if rng.next_f64() < fractional {
            request_count += 1;
        }

        let mut packets = Vec::with_capacity(request_count as usize);
        for _ in 0..request_count {
            self.counter += 1;
            packets.push(RequestPacket {
                id: format!("req-{}", self.counter),
                created_at_ms: sim_time_ms,
                status: RequestStatus::Pending,
                total_latency_ms: 0.0,
                path: Vec::new(),
                error: None,
            });
        }
        packets
    }

    fn tick_rps(&self, tick: u64) -> f64 {
        match self.pattern {
            TrafficPattern::Steady => self.baseline_rps,
            TrafficPattern::Burst => {
                // Burst every 50 ticks for 10 ticks.
                if tick % 50 < 10 {
                    self.baseline_rps * self.peak_rps_multiplier
                } else {
                    self.baseline_rps
                }
            }
            TrafficPattern::ThunderingHerd => {
                // Frequent sharper bursts.
                if tick % 25 < 8 {
                    self.baseline_rps * (self.peak_rps_multiplier * 1.5)
                } else {
                    self.baseline_rps
                }
            }
        }
    }
}
