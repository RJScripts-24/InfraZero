// simulation-engine/benches/engine_bench.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};

// We will build these structs and functions in src/lib.rs next!
use infrazero_simulation_engine::{GraphTopology, SimulationEngine};

/**
 * Benchmarks the core Monte Carlo simulation loop.
 * * Why this matters:
 * WebAssembly runs on the same JavaScript main thread as your React Flow canvas 
 * (unless we offload it to a Web Worker later). If our deterministic physics engine 
 * takes too long to calculate traffic flows and hardware failures, the entire 
 * user interface will completely freeze. 
 * * This benchmark acts as a strict performance gate, ensuring the Rust engine can 
 * crunch 10,000+ synthetic network requests in mere milliseconds.
 */
fn bench_monte_carlo_loop(c: &mut Criterion) {
    // 1. Setup a massive synthetic graph state to stress-test the engine
    let mut engine = SimulationEngine::new();
    
    // Generate a mock architecture with 10,000 active nodes/edges
    let mock_topology = GraphTopology::generate_synthetic(10_000); 

    let mut group = c.benchmark_group("Monte Carlo Physics Engine");
    
    // Configure the sample size for statistically significant results
    group.sample_size(100);

    // 2. Run the benchmark against our core simulation tick
    group.bench_function("Process 10,000 Requests", |b| {
        b.iter(|| {
            // black_box prevents the aggressive Rust compiler (our -O3 flag) 
            // from optimizing away the simulation just because we don't print the result.
            // It forces the CPU to actually do the heavy lifting every single loop.
            engine.tick(black_box(&mock_topology), black_box(10_000));
        })
    });

    group.finish();
}

// Register the benchmark group and generate the main execution harness
criterion_group!(benches, bench_monte_carlo_loop);
criterion_main!(benches);