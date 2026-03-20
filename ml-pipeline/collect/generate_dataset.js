const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { stringify } = require("csv-stringify");

const initWasm = require("../../simulation-engine/pkg/simulation_engine.js");
const { topologyGenerators } = require("./topologies");

// SECTION 1 - WASM INIT
function hasWasmExports(candidate) {
  return Boolean(
    candidate &&
      typeof candidate.run_simulation === "function" &&
      typeof candidate.get_telemetry === "function"
  );
}

async function loadWasm() {
  if (hasWasmExports(initWasm)) {
    console.log("WASM loaded");
    return initWasm;
  }

  if (initWasm && typeof initWasm.initSync === "function") {
    const wasmPath = path.resolve(
      __dirname,
      "../../simulation-engine/pkg/simulation_engine_bg.wasm"
    );
    const wasmBytes = fs.readFileSync(wasmPath);
    const maybeExports = initWasm.initSync(wasmBytes);
    const resolved = hasWasmExports(maybeExports) ? maybeExports : initWasm;
    if (hasWasmExports(resolved)) {
      console.log("WASM loaded");
      return resolved;
    }
  }

  if (typeof initWasm === "function") {
    const maybeExports = await initWasm();
    const resolved = hasWasmExports(maybeExports) ? maybeExports : initWasm;
    if (hasWasmExports(resolved)) {
      console.log("WASM loaded");
      return resolved;
    }
  }

  if (initWasm && typeof initWasm.default === "function") {
    const maybeExports = await initWasm.default();
    const resolved = hasWasmExports(maybeExports) ? maybeExports : initWasm;
    if (hasWasmExports(resolved)) {
      console.log("WASM loaded");
      return resolved;
    }
  }

  throw new Error(
    "WASM module did not expose run_simulation/get_telemetry. Rebuild simulation-engine/pkg before collecting data."
  );
}

// SECTION 2 - PARAMETER SWEEP CONFIG
const sweep = {
  topologies: ["three_tier", "microservices", "event_driven", "no_redundancy"],
  traffic_patterns: ["UNIFORM", "BURSTY", "THUNDERING_HERD", "RAMP"],
  chaos_enabled: [true, false],
  failure_rate_multipliers: [0.5, 1.0, 2.0, 4.0],
  traffic_intensity: [0.5, 1.0, 1.5, 2.5]
};

const TOTAL_RUNS_TARGET = 15000;

const ENGINE_TRAFFIC_PATTERN = {
  UNIFORM: "steady",
  BURSTY: "burst",
  THUNDERING_HERD: "thundering_herd",
  RAMP: "burst"
};

function buildCombinations(config) {
  const combinations = [];
  for (const topologyType of config.topologies) {
    for (const trafficPattern of config.traffic_patterns) {
      for (const chaosEnabled of config.chaos_enabled) {
        for (const failureRateMultiplier of config.failure_rate_multipliers) {
          for (const trafficIntensity of config.traffic_intensity) {
            combinations.push({
              topologyType,
              trafficPattern,
              chaosEnabled,
              failureRateMultiplier,
              trafficIntensity
            });
          }
        }
      }
    }
  }
  return combinations;
}

function makeUniverseSeed(combo, runIndex) {
  const raw = [
    combo.topologyType,
    combo.trafficPattern,
    combo.chaosEnabled,
    combo.failureRateMultiplier,
    combo.trafficIntensity,
    runIndex
  ].join("|");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return parseInt(hash.slice(0, 12), 16);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyTrafficPattern(config, trafficPattern, trafficIntensity) {
  config.config.trafficPattern = ENGINE_TRAFFIC_PATTERN[trafficPattern] || "steady";

  switch (trafficPattern) {
    case "UNIFORM":
      config.config.peakRpsMultiplier = 1.1;
      break;
    case "BURSTY":
      config.config.peakRpsMultiplier = Number((2.5 + trafficIntensity).toFixed(2));
      break;
    case "THUNDERING_HERD":
      config.config.peakRpsMultiplier = Number((4.0 + trafficIntensity).toFixed(2));
      break;
    case "RAMP":
      config.config.baselineRps = Number((config.config.baselineRps * 0.8).toFixed(2));
      config.config.peakRpsMultiplier = Number((2.0 + trafficIntensity * 1.2).toFixed(2));
      break;
    default:
      break;
  }
}

function prepareRunConfig(combo, universeSeed) {
  const generator = topologyGenerators[combo.topologyType];
  if (!generator) {
    throw new Error(`Unknown topology '${combo.topologyType}'.`);
  }

  const config = cloneJson(
    generator(universeSeed, combo.failureRateMultiplier, combo.trafficIntensity)
  );

  config.config.seed = universeSeed;
  config.config.totalTicks = config.config.totalTicks || 240;
  config.config.chaosEnabled = combo.chaosEnabled;
  if (!combo.chaosEnabled) {
    config.config.chaosEvents = [];
  }

  applyTrafficPattern(config, combo.trafficPattern, combo.trafficIntensity);
  return config;
}

// SECTION 3 - MAIN LOOP
function parseEngineJson(jsonText, label) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.error) {
    throw new Error(`${label} error: ${parsed.error}`);
  }

  return parsed;
}

function createCsvWriter(filePath, columns) {
  const stringifier = stringify({
    header: true,
    columns
  });
  const stream = fs.createWriteStream(filePath, { encoding: "utf8" });
  stringifier.pipe(stream);
  return { stringifier, stream };
}

function writeCsvRecord(stringifier, record) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      stringifier.off("drain", onDrain);
      reject(error);
    };
    const onDrain = () => {
      stringifier.off("error", onError);
      resolve();
    };

    stringifier.once("error", onError);
    const canContinue = stringifier.write(record, (error) => {
      stringifier.off("error", onError);
      if (error) {
        reject(error);
      } else if (canContinue) {
        resolve();
      }
    });

    if (!canContinue) {
      stringifier.once("drain", onDrain);
    }
  });
}

function closeCsvWriter(writer) {
  return new Promise((resolve, reject) => {
    writer.stream.once("finish", resolve);
    writer.stream.once("error", reject);
    writer.stringifier.end();
  });
}

// SECTION 4 - CSV SCHEMAS
const TELEMETRY_COLUMNS = [
  "run_id",
  "tick",
  "node_id",
  "node_type",
  "queue_depth",
  "arrival_rate",
  "processing_rate",
  "utilisation",
  "mean_latency_ms",
  "node_state",
  "cascade_label",
  "ticks_to_failure",
  "topology_type",
  "traffic_pattern"
];

const RUN_COLUMNS = [
  "run_id",
  "topology_type",
  "traffic_pattern",
  "chaos_enabled",
  "failure_rate_multiplier",
  "traffic_intensity",
  "cascade_occurred",
  "reliability_score",
  "total_ticks",
  "universe_seed"
];

function formatBytes(size) {
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function getFileSizeSafe(filePath) {
  if (!fs.existsSync(filePath)) {
    return 0;
  }
  return fs.statSync(filePath).size;
}

async function main() {
  const wasm = await loadWasm();
  const combinations = buildCombinations(sweep);

  const dataDir = path.resolve(__dirname, "../data");
  fs.mkdirSync(dataDir, { recursive: true });

  const telemetryPath = path.join(dataDir, "ds1_telemetry.csv");
  const runsPath = path.join(dataDir, "ds1_runs.csv");

  const telemetryWriter = createCsvWriter(telemetryPath, TELEMETRY_COLUMNS);
  const runsWriter = createCsvWriter(runsPath, RUN_COLUMNS);

  let telemetryRowsWritten = 0;
  let cascadeLabelRows = 0;
  let completedRuns = 0;
  let cascadeRuns = 0;
  let stableRuns = 0;
  let erroredRuns = 0;
  const errors = [];

  try {
    for (let runIndex = 0; runIndex < TOTAL_RUNS_TARGET; runIndex += 1) {
      const combo = combinations[runIndex % combinations.length];
      const universeSeed = makeUniverseSeed(combo, runIndex);

      try {
        const config = prepareRunConfig(combo, universeSeed);
        const configJson = JSON.stringify(config);

        const telemetryRows = parseEngineJson(
          wasm.get_telemetry(configJson),
          "get_telemetry"
        );
        if (!Array.isArray(telemetryRows)) {
          throw new Error("get_telemetry did not return a JSON array.");
        }

        const simulationOutput = parseEngineJson(
          wasm.run_simulation(configJson),
          "run_simulation"
        );

        const runId =
          telemetryRows[0]?.run_id ||
          simulationOutput.telemetry?.[0]?.run_id ||
          `run_${universeSeed}`;
        const cascadeOccurred =
          telemetryRows.some((row) => Boolean(row.cascade_label)) ||
          simulationOutput.status === "crashed";
        const reliabilityScore = Number(
          simulationOutput.grade?.score ??
            Math.max(
              0,
              Math.round((1 - Number(simulationOutput.overallErrorRate || 0)) * 100)
            )
        );
        const totalTicks = Number(
          simulationOutput.ticksRun ?? config.config.totalTicks
        );

        for (const row of telemetryRows) {
          if (row.cascade_label) {
            cascadeLabelRows += 1;
          }
          await writeCsvRecord(telemetryWriter.stringifier, {
            run_id: row.run_id || runId,
            tick: row.tick,
            node_id: row.node_id,
            node_type: row.node_type,
            queue_depth: row.queue_depth,
            arrival_rate: row.arrival_rate,
            processing_rate: row.processing_rate,
            utilisation: row.utilisation,
            mean_latency_ms: row.mean_latency_ms,
            node_state: row.node_state,
            cascade_label: row.cascade_label,
            ticks_to_failure: row.ticks_to_failure ?? "",
            topology_type: combo.topologyType,
            traffic_pattern: combo.trafficPattern
          });
          telemetryRowsWritten += 1;
        }

        await writeCsvRecord(runsWriter.stringifier, {
          run_id: runId,
          topology_type: combo.topologyType,
          traffic_pattern: combo.trafficPattern,
          chaos_enabled: combo.chaosEnabled,
          failure_rate_multiplier: combo.failureRateMultiplier,
          traffic_intensity: combo.trafficIntensity,
          cascade_occurred: cascadeOccurred,
          reliability_score: reliabilityScore,
          total_ticks: totalTicks,
          universe_seed: universeSeed
        });

        completedRuns += 1;
        if (cascadeOccurred) {
          cascadeRuns += 1;
        } else {
          stableRuns += 1;
        }
      } catch (error) {
        erroredRuns += 1;
        errors.push({
          run: runIndex + 1,
          topology: combo.topologyType,
          seed: universeSeed,
          message: error.message
        });
        console.error(
          `Run ${runIndex + 1}/${TOTAL_RUNS_TARGET} failed | topology=${combo.topologyType} | seed=${universeSeed} | ${error.message}`
        );
      }

      if ((runIndex + 1) % 200 === 0) {
        const cascadePct =
          completedRuns === 0 ? 0 : (cascadeRuns / completedRuns) * 100;
        console.log(
          `Run ${runIndex + 1}/${TOTAL_RUNS_TARGET} | Rows: ${telemetryRowsWritten} | Cascades: ${cascadeRuns} (${cascadePct.toFixed(0)}%)`
        );
      }
    }
  } finally {
    await closeCsvWriter(telemetryWriter);
    await closeCsvWriter(runsWriter);
  }

  // SECTION 5 - COMPLETION SUMMARY
  const cascadeRate = completedRuns === 0 ? 0 : (cascadeRuns / completedRuns) * 100;
  const labelRate = telemetryRowsWritten === 0 ? 0 : (cascadeLabelRows / telemetryRowsWritten) * 100;
  const telemetryBytes = getFileSizeSafe(telemetryPath);
  const runsBytes = getFileSizeSafe(runsPath);

  console.log("");
  console.log("Dataset generation complete");
  console.log(`Total rows written: ${telemetryRowsWritten}`);
  console.log(`Cascade rate %: ${cascadeRate.toFixed(2)}`);
  console.log(
    `Class balance: cascades=${cascadeRuns}, stable=${stableRuns}, telemetry_positive_rows=${cascadeLabelRows} (${labelRate.toFixed(2)}%)`
  );
  console.log(`Telemetry schema: ${TELEMETRY_COLUMNS.join(", ")}`);
  console.log(`Runs schema: ${RUN_COLUMNS.join(", ")}`);
  console.log(`Errored runs: ${erroredRuns}`);
  if (errors.length > 0) {
    console.log("Error samples:");
    for (const item of errors.slice(0, 10)) {
      console.log(
        `  run=${item.run}, topology=${item.topology}, seed=${item.seed}, message=${item.message}`
      );
    }
  }
  console.log(
    `Estimated file sizes: ds1_telemetry.csv=${formatBytes(telemetryBytes)}, ds1_runs.csv=${formatBytes(runsBytes)}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
