use std::sync::atomic::{AtomicU8, Ordering};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

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
