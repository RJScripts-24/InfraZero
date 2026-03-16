use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use rand::seq::SliceRandom;

/// Deterministic RNG wrapper used across the simulation engine.
///
/// Given the same seed and the same sequence of method calls, output is
/// guaranteed to be reproducible.
#[derive(Debug)]
pub struct SeededRng {
    rng: StdRng,
}

impl SeededRng {
    /// Initialize a new deterministic RNG with a fixed seed.
    pub fn new(seed: u64) -> Self {
        Self {
            rng: StdRng::seed_from_u64(seed),
        }
    }

    /// Uniform random in [0.0, 1.0).
    pub fn next_f64(&mut self) -> f64 {
        self.rng.gen::<f64>()
    }

    /// Uniform random integer in [start, end).
    ///
    /// If `start >= end`, this returns `start`.
    pub fn next_u64_range(&mut self, start: u64, end: u64) -> u64 {
        if start >= end {
            return start;
        }
        self.rng.gen_range(start..end)
    }

    /// Uniform random integer in [start, end).
    ///
    /// If `start >= end`, this returns `start`.
    pub fn next_u32_range(&mut self, start: u32, end: u32) -> u32 {
        if start >= end {
            return start;
        }
        self.rng.gen_range(start..end)
    }

    /// Bernoulli trial with probability `p` in [0.0, 1.0].
    pub fn chance(&mut self, p: f64) -> bool {
        if p <= 0.0 {
            return false;
        }
        if p >= 1.0 {
            return true;
        }
        self.next_f64() < p
    }

    /// Gaussian sample using Box-Muller transform.
    ///
    /// Returns a value from N(mean, std_dev^2).
    /// If `std_dev <= 0`, returns `mean`.
    pub fn next_gaussian(&mut self, mean: f64, std_dev: f64) -> f64 {
        if std_dev <= 0.0 {
            return mean;
        }

        // Ensure u1 in (0, 1] for ln stability.
        let mut u1 = self.next_f64();
        while u1 <= f64::MIN_POSITIVE {
            u1 = self.next_f64();
        }
        let u2 = self.next_f64();

        let z0 = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
        mean + z0 * std_dev
    }

    /// Deterministically shuffle a mutable slice in place.
    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        items.shuffle(&mut self.rng);
    }
}

#[cfg(test)]
mod tests {
    use super::SeededRng;

    #[test]
    fn same_seed_same_sequence_for_uniform() {
        let mut a = SeededRng::new(42);
        let mut b = SeededRng::new(42);

        for _ in 0..100 {
            assert!((a.next_f64() - b.next_f64()).abs() < f64::EPSILON);
        }
    }

    #[test]
    fn same_seed_same_sequence_for_gaussian() {
        let mut a = SeededRng::new(777);
        let mut b = SeededRng::new(777);

        for _ in 0..100 {
            let x = a.next_gaussian(10.0, 2.5);
            let y = b.next_gaussian(10.0, 2.5);
            assert!((x - y).abs() < f64::EPSILON);
        }
    }

    #[test]
    fn shuffle_is_deterministic_for_same_seed() {
        let base = vec![1, 2, 3, 4, 5, 6, 7, 8, 9];

        let mut a = base.clone();
        let mut b = base.clone();

        let mut rng_a = SeededRng::new(9);
        let mut rng_b = SeededRng::new(9);

        rng_a.shuffle(&mut a);
        rng_b.shuffle(&mut b);

        assert_eq!(a, b);
    }

    #[test]
    fn chance_handles_edges() {
        let mut rng = SeededRng::new(1);
        assert!(!rng.chance(0.0));
        assert!(rng.chance(1.0));
    }
}
