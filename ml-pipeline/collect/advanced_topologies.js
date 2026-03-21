const fs = require("fs");
const path = require("path");

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(values) {
  return values[randomInt(0, values.length - 1)];
}

function maybe(probability) {
  return Math.random() < probability;
}

function makeNode(id, type, metricRanges = {}) {
  const {
    processingMin = 80,
    processingMax = 220,
    failureMin = 2,
    failureMax = 9,
    coldStartMin = 120,
    coldStartMax = 320
  } = metricRanges;

  return {
    id,
    data: {
      label: id.replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
      type,
      processingPowerMs: randomInt(processingMin, processingMax),
      failureRatePercent: randomInt(failureMin, failureMax),
      coldStartLatencyMs: randomInt(coldStartMin, coldStartMax)
    }
  };
}

function makeEdge(source, target, latencyMs = 50, packetLossPercent = 1, idSuffix = "") {
  const suffix = idSuffix ? `-${idSuffix}` : "";
  return {
    id: `e-${source}-${target}${suffix}`,
    source,
    target,
    latencyMs,
    packetLossPercent
  };
}

function withBaseMeta(graph, label, graphIndex) {
  return {
    graph_id: `synthetic_advanced_${label}_${graphIndex}`,
    nodes: graph.nodes,
    edges: graph.edges,
    label,
    source: "synthetic-advanced"
  };
}

function generateThunderingHerdTopologies(count) {
  const graphs = [];
  const nonDbTypes = ["Gateway", "Service", "Infrastructure"];

  for (let i = 0; i < count; i += 1) {
    const entryId = `gateway_${i}`;
    const serviceCount = randomInt(4, 10);
    const intermediaryCount = randomInt(0, 2);
    const nodes = [
      makeNode(entryId, pick(nonDbTypes), {
        processingMin: 50,
        processingMax: 800,
        failureMin: 1,
        failureMax: 20,
        coldStartMin: 50,
        coldStartMax: 1000
      })
    ];
    const edges = [];
    const intermediates = [];

    for (let m = 0; m < intermediaryCount; m += 1) {
      const interId = `intermediate_${i}_${m}`;
      intermediates.push(interId);
      nodes.push(
        makeNode(interId, pick(nonDbTypes), {
          processingMin: 50,
          processingMax: 800,
          failureMin: 1,
          failureMax: 20,
          coldStartMin: 50,
          coldStartMax: 1000
        })
      );
      edges.push(makeEdge(entryId, interId, randomInt(10, 300), randomInt(0, 8), `${i}-${m}`));
    }

    for (let s = 0; s < serviceCount; s += 1) {
      const serviceId = `service_${i}_${s}`;
      nodes.push(
        makeNode(serviceId, pick(nonDbTypes), {
          processingMin: 50,
          processingMax: 800,
          failureMin: 1,
          failureMax: 20,
          coldStartMin: 50,
          coldStartMax: 1000
        })
      );

      const parent = intermediates.length > 0 ? pick([entryId, ...intermediates]) : entryId;
      edges.push(makeEdge(parent, serviceId, randomInt(10, 300), randomInt(0, 8), `${i}-${s}`));
    }

    if (maybe(0.3)) {
      const deadEndId = `dead_end_${i}`;
      nodes.push(
        makeNode(deadEndId, pick(nonDbTypes), {
          processingMin: 50,
          processingMax: 800,
          failureMin: 1,
          failureMax: 20,
          coldStartMin: 50,
          coldStartMax: 1000
        })
      );
      edges.push(makeEdge(entryId, deadEndId, randomInt(10, 300), randomInt(0, 8), `${i}-dead`));
    }

    if (maybe(0.2)) {
      const secondEntryId = `gateway_alt_${i}`;
      nodes.push(
        makeNode(secondEntryId, pick(nonDbTypes), {
          processingMin: 50,
          processingMax: 800,
          failureMin: 1,
          failureMax: 20,
          coldStartMin: 50,
          coldStartMax: 1000
        })
      );
      const secondFanOut = Math.max(2, Math.floor(serviceCount / 2));
      for (let s = 0; s < secondFanOut; s += 1) {
        edges.push(
          makeEdge(secondEntryId, `service_${i}_${s}`, randomInt(10, 300), randomInt(0, 8), `${i}-alt-${s}`)
        );
      }
    }

    graphs.push(withBaseMeta({ nodes, edges }, "thundering_herd", i));
  }

  return graphs;
}

function generateRetryStormTopologies(count) {
  const graphs = [];

  for (let i = 0; i < count; i += 1) {
    const cycleLength = randomInt(2, 5);
    const cycleCount = randomInt(1, 3);
    const nodes = [
      makeNode(`entry_${i}`, "Gateway", {
        processingMin: 100,
        processingMax: 600,
        failureMin: 2,
        failureMax: 16,
        coldStartMin: 80,
        coldStartMax: 700
      })
    ];
    const edges = [];
    let cycleEdgeIds = [];

    for (let c = 0; c < cycleCount; c += 1) {
      const cycleNodes = [];
      for (let n = 0; n < cycleLength; n += 1) {
        const nodeId = `cycle_${i}_${c}_${n}`;
        cycleNodes.push(nodeId);
        nodes.push(
          makeNode(nodeId, "Service", {
            processingMin: 100,
            processingMax: 600,
            failureMin: 2,
            failureMax: 18,
            coldStartMin: 80,
            coldStartMax: 700
          })
        );
      }

      edges.push(makeEdge(`entry_${i}`, cycleNodes[0], randomInt(40, 180), randomInt(2, 8), `${i}-${c}-entry`));

      for (let n = 0; n < cycleNodes.length - 1; n += 1) {
        edges.push(
          makeEdge(cycleNodes[n], cycleNodes[n + 1], randomInt(80, 220), randomInt(3, 15), `${i}-${c}-${n}`)
        );
        cycleEdgeIds.push(edges.length - 1);
      }

      edges.push(
        makeEdge(
          cycleNodes[cycleNodes.length - 1],
          cycleNodes[0],
          randomInt(90, 250),
          randomInt(3, 15),
          `${i}-${c}-back`
        )
      );
      cycleEdgeIds.push(edges.length - 1);

      if (maybe(0.4)) {
        const queueId = `queue_${i}_${c}`;
        nodes.push(
          makeNode(queueId, "Infrastructure", {
            processingMin: 100,
            processingMax: 600,
            failureMin: 2,
            failureMax: 14,
            coldStartMin: 80,
            coldStartMax: 700
          })
        );
        // Attach queue as side channel; cycle still exists unchanged.
        edges.push(makeEdge(cycleNodes[0], queueId, randomInt(120, 260), randomInt(3, 12), `${i}-${c}-q1`));
        edges.push(makeEdge(queueId, cycleNodes[1], randomInt(120, 260), randomInt(3, 12), `${i}-${c}-q2`));
      }
    }

    const peripheralCount = randomInt(0, 4);
    for (let p = 0; p < peripheralCount; p += 1) {
      const peripheralId = `peripheral_${i}_${p}`;
      nodes.push(
        makeNode(peripheralId, "Service", {
          processingMin: 100,
          processingMax: 600,
          failureMin: 2,
          failureMax: 16,
          coldStartMin: 80,
          coldStartMax: 700
        })
      );
      edges.push(makeEdge(`entry_${i}`, peripheralId, randomInt(40, 140), randomInt(1, 6), `${i}-p-${p}`));
    }

    const highLatencyFraction = randomInt(20, 60) / 100;
    const requiredHighLatency = Math.max(1, Math.ceil(edges.length * highLatencyFraction));
    const chosen = new Set();
    while (chosen.size < requiredHighLatency) {
      chosen.add(randomInt(0, edges.length - 1));
    }

    for (const idx of chosen) {
      edges[idx].latencyMs = randomInt(151, 500);
      if (cycleEdgeIds.includes(idx)) {
        edges[idx].packetLossPercent = randomInt(3, 15);
      }
    }

    graphs.push(withBaseMeta({ nodes, edges }, "retry_storm", i));
  }

  return graphs;
}

function generateCascadingFailureTopologies(count) {
  const graphs = [];

  for (let i = 0; i < count; i += 1) {
    const fanIn = randomInt(3, 7);
    const hasReplicaTrap = maybe(0.5);
    const addPostCache = maybe(0.3);
    const peripheralCount = randomInt(0, 3);
    const centralType = Math.random() < 0.5 ? "PostgreSQL" : "Service";
    const centralId = `central_${i}`;
    const nodes = [
      makeNode(centralId, centralType, {
        processingMin: 120,
        processingMax: 480,
        failureMin: 15,
        failureMax: 40,
        coldStartMin: 100,
        coldStartMax: 800
      }),
      makeNode(`entry_${i}`, "Gateway", {
        processingMin: 120,
        processingMax: 480,
        failureMin: 2,
        failureMax: 10,
        coldStartMin: 100,
        coldStartMax: 800
      })
    ];
    const edges = [makeEdge(`entry_${i}`, `router_${i}`, randomInt(20, 120), randomInt(0, 6), `${i}-r`)];

    nodes.push(
      makeNode(`router_${i}`, "Service", {
        processingMin: 120,
        processingMax: 480,
        failureMin: 2,
        failureMax: 10,
        coldStartMin: 100,
        coldStartMax: 800
      })
    );

    for (let n = 0; n < fanIn; n += 1) {
      const callerId = `caller_${i}_${n}`;
      nodes.push(
        makeNode(callerId, "Service", {
          processingMin: 120,
          processingMax: 480,
          failureMin: 2,
          failureMax: 10,
          coldStartMin: 100,
          coldStartMax: 800
        })
      );
      edges.push(makeEdge(`router_${i}`, callerId, randomInt(20, 160), randomInt(0, 6), `${i}-f1-${n}`));
      edges.push(makeEdge(callerId, centralId, randomInt(30, 180), randomInt(1, 8), `${i}-f2-${n}`));
    }

    if (hasReplicaTrap) {
      const replicaId = `replica_${i}`;
      // Unreachable replica: no edges pointing to this node.
      nodes.push(
        makeNode(replicaId, centralType, {
          processingMin: 120,
          processingMax: 480,
          failureMin: 2,
          failureMax: 10,
          coldStartMin: 100,
          coldStartMax: 800
        })
      );
    }

    if (addPostCache) {
      const postCacheId = `post_cache_${i}`;
      nodes.push(
        makeNode(postCacheId, "Cache", {
          processingMin: 120,
          processingMax: 480,
          failureMin: 2,
          failureMax: 10,
          coldStartMin: 100,
          coldStartMax: 800
        })
      );
      edges.push(makeEdge(centralId, postCacheId, randomInt(40, 180), randomInt(0, 6), `${i}-cache`));
    }

    for (let p = 0; p < peripheralCount; p += 1) {
      const peripheralId = `peripheral_${i}_${p}`;
      nodes.push(
        makeNode(peripheralId, "Service", {
          processingMin: 120,
          processingMax: 480,
          failureMin: 2,
          failureMax: 10,
          coldStartMin: 100,
          coldStartMax: 800
        })
      );
      if (p > 0) {
        edges.push(
          makeEdge(`peripheral_${i}_${p - 1}`, peripheralId, randomInt(20, 160), randomInt(0, 6), `${i}-per-${p}`)
        );
      }
    }

    graphs.push(withBaseMeta({ nodes, edges }, "cascading_failure", i));
  }

  return graphs;
}

function generateStableTopologies(count) {
  const graphs = [];

  for (let i = 0; i < count; i += 1) {
    const serviceCount = randomInt(4, 14);
    const depth = randomInt(3, 7);
    const addCache = maybe(0.6);
    const addQueue = maybe(0.5);
    const addCdn = maybe(0.4);

    const nodes = [
      makeNode(`client_${i}`, "Service", {
        processingMin: 100,
        processingMax: 700,
        failureMin: 1,
        failureMax: 8,
        coldStartMin: 60,
        coldStartMax: 700
      }),
      makeNode(`lb_${i}`, "Gateway", {
        processingMin: 100,
        processingMax: 700,
        failureMin: 1,
        failureMax: 8,
        coldStartMin: 60,
        coldStartMax: 700
      }),
      makeNode(`db_primary_${i}`, "PostgreSQL", {
        processingMin: 100,
        processingMax: 700,
        failureMin: 1,
        failureMax: 8,
        coldStartMin: 60,
        coldStartMax: 700
      }),
      makeNode(`db_replica_${i}`, "PostgreSQL", {
        processingMin: 100,
        processingMax: 700,
        failureMin: 1,
        failureMax: 8,
        coldStartMin: 60,
        coldStartMax: 700
      })
    ];

    const edges = [];

    const firstHopId = addCdn ? `cdn_${i}` : `lb_${i}`;
    if (addCdn) {
      nodes.push(
        makeNode(`cdn_${i}`, "Infrastructure", {
          processingMin: 100,
          processingMax: 700,
          failureMin: 1,
          failureMax: 8,
          coldStartMin: 60,
          coldStartMax: 700
        })
      );
      edges.push(makeEdge(`client_${i}`, `cdn_${i}`, randomInt(10, 90), randomInt(0, 4), `${i}-cdn`));
      edges.push(makeEdge(`cdn_${i}`, `lb_${i}`, randomInt(10, 90), randomInt(0, 4), `${i}-cdnlb`));
    } else {
      edges.push(makeEdge(`client_${i}`, `lb_${i}`, randomInt(10, 90), randomInt(0, 4), `${i}-lb`));
    }

    const stageA = [];
    const stageB = [];
    for (let s = 0; s < serviceCount; s += 1) {
      const aId = `svc_${i}_${s}_a`;
      const bId = `svc_${i}_${s}_b`;
      stageA.push(aId);
      stageB.push(bId);
      nodes.push(
        makeNode(aId, "Service", {
          processingMin: 100,
          processingMax: 700,
          failureMin: 1,
          failureMax: 8,
          coldStartMin: 60,
          coldStartMax: 700
        })
      );
      nodes.push(
        makeNode(bId, "Service", {
          processingMin: 100,
          processingMax: 700,
          failureMin: 1,
          failureMax: 8,
          coldStartMin: 60,
          coldStartMax: 700
        })
      );
      edges.push(makeEdge(firstHopId, aId, randomInt(10, 120), randomInt(0, 4), `${i}-a-${s}`));
      edges.push(makeEdge(firstHopId, bId, randomInt(10, 120), randomInt(0, 4), `${i}-b-${s}`));
    }

    let previousLayer = [...stageA, ...stageB];
    for (let d = 2; d <= depth; d += 1) {
      const nextLayer = [];
      const width = Math.max(2, Math.floor(serviceCount / (d % 2 === 0 ? 1 : 2)));
      for (let n = 0; n < width; n += 1) {
        const nodeId = `depth_${i}_${d}_${n}`;
        nextLayer.push(nodeId);
        nodes.push(
          makeNode(nodeId, "Service", {
            processingMin: 100,
            processingMax: 700,
            failureMin: 1,
            failureMax: 8,
            coldStartMin: 60,
            coldStartMax: 700
          })
        );

        // Redundancy: each next-layer node receives from two previous peers when possible.
        const parent1 = previousLayer[n % previousLayer.length];
        const parent2 = previousLayer[(n + 1) % previousLayer.length];
        edges.push(makeEdge(parent1, nodeId, randomInt(15, 140), randomInt(0, 4), `${i}-d${d}-${n}-1`));
        if (parent2 !== parent1) {
          edges.push(makeEdge(parent2, nodeId, randomInt(15, 140), randomInt(0, 4), `${i}-d${d}-${n}-2`));
        }
      }
      previousLayer = nextLayer;
    }

    let dbIngressNodes = previousLayer;
    if (addQueue) {
      const queueId = `queue_${i}`;
      nodes.push(
        makeNode(queueId, "Infrastructure", {
          processingMin: 100,
          processingMax: 700,
          failureMin: 1,
          failureMax: 8,
          coldStartMin: 60,
          coldStartMax: 700
        })
      );
      for (const nodeId of previousLayer) {
        edges.push(makeEdge(nodeId, queueId, randomInt(20, 140), randomInt(0, 4), `${i}-q-${nodeId}`));
      }
      dbIngressNodes = [queueId];
    }

    let dbSourceNodes = dbIngressNodes;
    if (addCache) {
      const cacheId = `cache_${i}`;
      nodes.push(
        makeNode(cacheId, "Cache", {
          processingMin: 100,
          processingMax: 700,
          failureMin: 1,
          failureMax: 8,
          coldStartMin: 60,
          coldStartMax: 700
        })
      );
      for (const nodeId of dbIngressNodes) {
        edges.push(makeEdge(nodeId, cacheId, randomInt(20, 140), randomInt(0, 4), `${i}-cache-${nodeId}`));
      }
      dbSourceNodes = [cacheId];
    }

    for (const sourceNodeId of dbSourceNodes) {
      edges.push(makeEdge(sourceNodeId, `db_primary_${i}`, randomInt(20, 140), randomInt(0, 4), `${i}-db1`));
      edges.push(makeEdge(sourceNodeId, `db_replica_${i}`, randomInt(20, 140), randomInt(0, 4), `${i}-db2`));
    }

    edges.push(makeEdge(`db_primary_${i}`, `db_replica_${i}`, randomInt(20, 90), randomInt(0, 2), `${i}-sync`));

    graphs.push(withBaseMeta({ nodes, edges }, "stable", i));
  }

  return graphs;
}

function writeGraphs(graphs, label, outputDir) {
  for (let i = 0; i < graphs.length; i += 1) {
    const graphPath = path.join(outputDir, `synthetic_advanced_${label}_${i + 1}.json`);
    fs.writeFileSync(graphPath, JSON.stringify(graphs[i], null, 2), "utf8");
  }
}

function main() {
  const outputDir = path.resolve(__dirname, "../data/graphs");
  fs.mkdirSync(outputDir, { recursive: true });

  const perClass = 500;
  const thunderingHerd = generateThunderingHerdTopologies(perClass);
  const retryStorm = generateRetryStormTopologies(perClass);
  const cascadingFailure = generateCascadingFailureTopologies(perClass);
  const stable = generateStableTopologies(perClass);

  writeGraphs(thunderingHerd, "thundering_herd", outputDir);
  writeGraphs(retryStorm, "retry_storm", outputDir);
  writeGraphs(cascadingFailure, "cascading_failure", outputDir);
  writeGraphs(stable, "stable", outputDir);

  console.log("Advanced topology generation summary:");
  console.log(`  thundering_herd: ${thunderingHerd.length}`);
  console.log(`  retry_storm: ${retryStorm.length}`);
  console.log(`  cascading_failure: ${cascadingFailure.length}`);
  console.log(`  stable: ${stable.length}`);
  console.log(`  total: ${thunderingHerd.length + retryStorm.length + cascadingFailure.length + stable.length}`);
  console.log("Run this after generate_dataset.js in the pipeline.");
}

module.exports = {
  generateThunderingHerdTopologies,
  generateRetryStormTopologies,
  generateCascadingFailureTopologies,
  generateStableTopologies,
  main
};

if (require.main === module) {
  main();
}
