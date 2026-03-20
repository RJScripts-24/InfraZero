pub mod analyzer;
pub mod graph;
pub mod models;
pub mod physics;
pub mod utils;

use wasm_bindgen::prelude::*;

use crate::physics::engine::run_simulation_output;

pub use physics::engine::{get_graph_hash, run_simulation, validate_graph};

#[wasm_bindgen]
pub fn get_telemetry(input_json: &str) -> String {
    let output = match run_simulation_output(input_json) {
        Ok(output) => output,
        Err(err) => return err,
    };

    match serde_json::to_string(&output.telemetry) {
        Ok(json) => json,
        Err(e) => format!("{{\"error\": \"Failed to serialize telemetry: {}\"}}", e),
    }
}
