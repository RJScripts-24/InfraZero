use std::sync::atomic::{AtomicU8, Ordering};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

use crate::models::output::TelemetryRow;

/// Logging severity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u8)]
pub enum LogLevel {
    Error = 1,
    Warn = 2,
    Info = 3,
}

static LOG_LEVEL: AtomicU8 = AtomicU8::new(LogLevel::Info as u8);

/// Override the global log level threshold.
pub fn set_log_level(level: LogLevel) {
    LOG_LEVEL.store(level as u8, Ordering::Relaxed);
}

/// Current active log level threshold.
pub fn get_log_level() -> LogLevel {
    match LOG_LEVEL.load(Ordering::Relaxed) {
        1 => LogLevel::Error,
        2 => LogLevel::Warn,
        _ => LogLevel::Info,
    }
}

/// Emit an info-level message.
pub fn log_info(message: &str) {
    emit(LogLevel::Info, "INFO", message);
}

/// Emit a warning-level message.
pub fn log_warn(message: &str) {
    emit(LogLevel::Warn, "WARN", message);
}

/// Emit an error-level message.
pub fn log_error(message: &str) {
    emit(LogLevel::Error, "ERROR", message);
}

fn emit(level: LogLevel, label: &str, message: &str) {
    if (level as u8) > LOG_LEVEL.load(Ordering::Relaxed) {
        return;
    }

    let line = format!("[{label}] {message}");

    #[cfg(target_arch = "wasm32")]
    {
        wasm_console_log(level, &line);
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        native_console_log(level, &line);
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn native_console_log(level: LogLevel, line: &str) {
    match level {
        LogLevel::Error | LogLevel::Warn => eprintln!("{line}"),
        LogLevel::Info => println!("{line}"),
    }
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn console_log(s: &str);
    #[wasm_bindgen(js_namespace = console, js_name = warn)]
    fn console_warn(s: &str);
    #[wasm_bindgen(js_namespace = console, js_name = error)]
    fn console_error(s: &str);
}

#[cfg(target_arch = "wasm32")]
fn wasm_console_log(level: LogLevel, line: &str) {
    match level {
        LogLevel::Error => console_error(line),
        LogLevel::Warn => console_warn(line),
        LogLevel::Info => console_log(line),
    }
}

pub struct TelemetryLogger {
    pub rows: Vec<TelemetryRow>,
    pub run_id: String,
}

impl TelemetryLogger {
    pub fn new(seed: u64) -> Self {
        Self {
            rows: Vec::new(),
            run_id: format!("run_{seed}"),
        }
    }

    pub fn record(
        &mut self,
        tick: u64,
        node_id: &str,
        node_type: &str,
        queue_depth: f64,
        arrival_rate: f64,
        processing_rate: f64,
        mean_latency_ms: f64,
        node_state: &str,
    ) {
        let utilisation = if processing_rate <= 0.0 {
            if arrival_rate > 0.0 { 1.0 } else { 0.0 }
        } else {
            (arrival_rate / processing_rate).clamp(0.0, 1.0)
        };

        self.rows.push(TelemetryRow {
            run_id: self.run_id.clone(),
            tick,
            node_id: node_id.to_string(),
            node_type: node_type.to_string(),
            queue_depth,
            arrival_rate,
            processing_rate,
            utilisation,
            mean_latency_ms,
            node_state: node_state.to_string(),
            cascade_label: false,
            ticks_to_failure: None,
        });
    }

    pub fn finalise(&mut self) {
        for idx in 0..self.rows.len() {
            let current_tick = self.rows[idx].tick;
            let node_id = self.rows[idx].node_id.clone();
            let mut same_node_seen = 0_u64;

            for future_idx in (idx + 1)..self.rows.len() {
                let future_node_id = self.rows[future_idx].node_id.clone();
                if future_node_id != node_id {
                    continue;
                }

                same_node_seen += 1;

                let future_failed = self.rows[future_idx].node_state == "FAILED";
                let future_tick = self.rows[future_idx].tick;

                if future_failed {
                    self.rows[idx].cascade_label = true;
                    self.rows[idx].ticks_to_failure = Some(future_tick.saturating_sub(current_tick));
                    break;
                }

                if same_node_seen >= 30 {
                    break;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_level_is_info() {
        set_log_level(LogLevel::Info);
        assert_eq!(get_log_level(), LogLevel::Info);
    }

    #[test]
    fn can_set_log_level() {
        set_log_level(LogLevel::Warn);
        assert_eq!(get_log_level(), LogLevel::Warn);

        set_log_level(LogLevel::Error);
        assert_eq!(get_log_level(), LogLevel::Error);

        set_log_level(LogLevel::Info);
        assert_eq!(get_log_level(), LogLevel::Info);
    }

    #[test]
    fn logging_functions_do_not_panic() {
        set_log_level(LogLevel::Info);
        log_info("info");
        log_warn("warn");
        log_error("error");
    }
}
