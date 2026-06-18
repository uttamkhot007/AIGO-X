use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use tracing::{info, warn};

/// Circuit breaker states following the standard pattern.
#[derive(Debug, Clone, PartialEq)]
pub enum CircuitState {
    Closed,
    Open { opened_at: Instant },
    HalfOpen,
}

#[derive(Debug)]
pub struct CircuitBreaker {
    name: String,
    state: Arc<RwLock<CircuitState>>,
    failure_count: Arc<RwLock<u32>>,
    failure_threshold: u32,
    recovery_timeout: Duration,
    success_threshold: u32,
    success_count: Arc<RwLock<u32>>,
}

#[derive(Debug, thiserror::Error)]
pub enum CircuitBreakerError {
    #[error("circuit breaker '{name}' is open — service unavailable")]
    Open { name: String },
    #[error("operation failed: {0}")]
    OperationFailed(String),
}

impl CircuitBreaker {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            state: Arc::new(RwLock::new(CircuitState::Closed)),
            failure_count: Arc::new(RwLock::new(0)),
            failure_threshold: 5,
            recovery_timeout: Duration::from_secs(30),
            success_threshold: 3,
            success_count: Arc::new(RwLock::new(0)),
        }
    }

    pub fn with_thresholds(mut self, failures: u32, timeout_secs: u64, successes: u32) -> Self {
        self.failure_threshold = failures;
        self.recovery_timeout = Duration::from_secs(timeout_secs);
        self.success_threshold = successes;
        self
    }

    pub fn is_available(&self) -> bool {
        let state = self.state.read().unwrap();
        match &*state {
            CircuitState::Closed | CircuitState::HalfOpen => true,
            CircuitState::Open { opened_at } => {
                opened_at.elapsed() >= self.recovery_timeout
            }
        }
    }

    pub fn record_success(&self) {
        let mut state = self.state.write().unwrap();
        match &*state {
            CircuitState::HalfOpen => {
                let mut sc = self.success_count.write().unwrap();
                *sc += 1;
                if *sc >= self.success_threshold {
                    info!(name = %self.name, "circuit breaker closed (recovered)");
                    *state = CircuitState::Closed;
                    *sc = 0;
                    *self.failure_count.write().unwrap() = 0;
                }
            }
            _ => {
                *self.failure_count.write().unwrap() = 0;
            }
        }
    }

    pub fn record_failure(&self, reason: &str) {
        let mut fc = self.failure_count.write().unwrap();
        *fc += 1;
        warn!(name = %self.name, failures = *fc, reason, "circuit breaker failure recorded");
        if *fc >= self.failure_threshold {
            let mut state = self.state.write().unwrap();
            if *state == CircuitState::Closed {
                warn!(name = %self.name, "circuit breaker OPEN — service suspended");
                *state = CircuitState::Open { opened_at: Instant::now() };
            }
        }
    }

    pub fn transition_to_half_open(&self) {
        let mut state = self.state.write().unwrap();
        if let CircuitState::Open { opened_at } = &*state {
            if opened_at.elapsed() >= self.recovery_timeout {
                info!(name = %self.name, "circuit breaker half-open — testing recovery");
                *state = CircuitState::HalfOpen;
                *self.success_count.write().unwrap() = 0;
            }
        }
    }

    pub fn try_call(&self) -> Result<(), CircuitBreakerError> {
        // Attempt transition to half-open if recovery timeout elapsed
        self.transition_to_half_open();

        if !self.is_available() {
            return Err(CircuitBreakerError::Open { name: self.name.clone() });
        }
        Ok(())
    }
}

/// ResourceProtector limits memory usage by tracking allocations.
#[derive(Debug)]
pub struct ResourceProtector {
    max_memory_mb: u64,
}

impl ResourceProtector {
    pub fn new(max_memory_mb: u64) -> Self {
        Self { max_memory_mb }
    }

    pub fn check_memory(&self) -> bool {
        // Read current RSS from /proc/self/status on Linux or use sysinfo
        #[cfg(target_os = "linux")]
        {
            if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
                for line in status.lines() {
                    if line.starts_with("VmRSS:") {
                        let kb: u64 = line.split_whitespace()
                            .nth(1).and_then(|v| v.parse().ok()).unwrap_or(0);
                        return (kb / 1024) < self.max_memory_mb;
                    }
                }
            }
        }
        true // assume OK on non-Linux
    }
}

/// DegradationManager determines service availability under load.
#[derive(Debug, Clone, PartialEq)]
pub enum DegradationLevel {
    Full,
    Reduced,
    Minimal,
    Emergency,
}

impl DegradationLevel {
    pub fn from_score(score: u8) -> Self {
        match score {
            80..=100 => DegradationLevel::Full,
            60..=79  => DegradationLevel::Reduced,
            40..=59  => DegradationLevel::Minimal,
            _        => DegradationLevel::Emergency,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            DegradationLevel::Full      => "full",
            DegradationLevel::Reduced   => "reduced",
            DegradationLevel::Minimal   => "minimal",
            DegradationLevel::Emergency => "emergency",
        }
    }
}
