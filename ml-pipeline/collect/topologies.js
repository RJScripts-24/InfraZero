const DEFAULT_TICKS = 240;

function clampFailureRate(value) {
  return Math.min(0.95, Number(value.toFixed(6)));
}

function scaledPower(base, trafficIntensity) {
  return Number((base * trafficIntensity).toFixed(4));
}

function scaledFailureRate(base, failureRateMultiplier) {
  return clampFailureRate(base * failureRateMultiplier);
}

function createNode(
  id,
  label,
  nodeType,
  processingPower,
  failureRate,
  coldStartLatencyMs,
  queueCapacity,
  x,
  y,
  providerIcon
) {
  return {
    id,
    label,
    nodeType,
    processingPower,
    failureRate,
    coldStartLatencyMs,
    queueCapacity,
    x,
    y,
    providerIcon
  };
}

function createEdge(id, source, target, latencyMs, jitterMs, packetLoss, bandwidthLimitMbps) {
  return {
    id,
    source,
    target,
    latencyMs,
    jitterMs,
    packetLoss,
    bandwidthLimitMbps
  };
}

function buildInput(seed, trafficIntensity, nodes, edges, chaosEvents, baselineRps, peakRpsMultiplier) {
  return {
    nodes,
    edges,
    config: {
      seed,
      totalTicks: DEFAULT_TICKS,
      trafficPattern: "steady",
      baselineRps: Number((baselineRps * trafficIntensity).toFixed(2)),
      peakRpsMultiplier: Number(peakRpsMultiplier.toFixed(2)),
      chaosEnabled: false,
      chaosEvents,
      fullTrace: false
    }
  };
}

function topology_three_tier(seed, fm, ti) {
  const nodes = [
    createNode("client", "Client", "client", scaledPower(0.8, ti), scaledFailureRate(0.002, fm), 3, 800, 0, 0, "user"),
    createNode("load_balancer", "Load Balancer", "load_balancer", scaledPower(2.1, ti), scaledFailureRate(0.004, fm), 6, 1500, 120, 0, "aws-alb"),
    createNode("web_server_1", "Web Server 1", "compute", scaledPower(1.5, ti), scaledFailureRate(0.012, fm), 18, 320, 260, -80, "aws-ec2"),
    createNode("web_server_2", "Web Server 2", "compute", scaledPower(1.45, ti), scaledFailureRate(0.012, fm), 20, 320, 260, 80, "aws-ec2"),
    createNode("database", "Database", "database", scaledPower(1.25, ti), scaledFailureRate(0.009, fm), 12, 180, 420, 0, "aws-rds")
  ];

  const edges = [
    createEdge("client->load_balancer", "client", "load_balancer", 8, 1.5, 0.001, 1200),
    createEdge("load_balancer->web_server_1", "load_balancer", "web_server_1", 6, 1.2, 0.001, 950),
    createEdge("load_balancer->web_server_2", "load_balancer", "web_server_2", 6, 1.2, 0.001, 950),
    createEdge("web_server_1->database", "web_server_1", "database", 14, 2.5, 0.003, 650)
  ];

  const chaosEvents = [
    {
      event_id: "three-tier-cpu-spike",
      kind: "cpu_spike",
      target_node: "load_balancer",
      target_edge: null,
      trigger_tick: 40,
      duration_ticks: 45,
      intensity: 0.55,
      partition_group_a: null,
      partition_group_b: null,
      random_target_pct: null
    },
    {
      event_id: "three-tier-db-pressure",
      kind: "memory_pressure",
      target_node: "database",
      target_edge: null,
      trigger_tick: 120,
      duration_ticks: 50,
      intensity: 0.45,
      partition_group_a: null,
      partition_group_b: null,
      random_target_pct: null
    }
  ];

  return buildInput(seed, ti, nodes, edges, chaosEvents, 140, 3.0);
}

function topology_microservices(seed, fm, ti) {
  const nodes = [
    createNode("client", "Client", "client", scaledPower(0.9, ti), scaledFailureRate(0.002, fm), 3, 700, 0, 0, "user"),
    createNode("api_gateway", "API Gateway", "api_gateway", scaledPower(2.2, ti), scaledFailureRate(0.006, fm), 5, 1400, 120, 0, "aws-apigateway"),
    createNode("auth_service", "Auth Service", "compute", scaledPower(1.15, ti), scaledFailureRate(0.011, fm), 18, 260, 260, -120, "aws-lambda"),
    createNode("user_service", "User Service", "compute", scaledPower(1.2, ti), scaledFailureRate(0.012, fm), 18, 260, 260, 0, "aws-lambda"),
    createNode("order_service", "Order Service", "compute", scaledPower(1.05, ti), scaledFailureRate(0.015, fm), 24, 240, 260, 120, "aws-lambda"),
    createNode("cache", "Cache", "cache", scaledPower(1.55, ti), scaledFailureRate(0.008, fm), 8, 700, 400, -20, "aws-elasticache"),
    createNode("database", "Database", "database", scaledPower(1.3, ti), scaledFailureRate(0.01, fm), 14, 180, 540, -20, "aws-rds")
  ];

  const edges = [
    createEdge("client->api_gateway", "client", "api_gateway", 7, 1.0, 0.001, 1400),
    createEdge("api_gateway->auth_service", "api_gateway", "auth_service", 5, 0.8, 0.001, 900),
    createEdge("api_gateway->user_service", "api_gateway", "user_service", 5, 0.8, 0.001, 900),
    createEdge("api_gateway->order_service", "api_gateway", "order_service", 6, 0.9, 0.0015, 850),
    createEdge("order_service->cache", "order_service", "cache", 9, 1.5, 0.002, 700),
    createEdge("cache->database", "cache", "database", 11, 2.0, 0.003, 620)
  ];

  const chaosEvents = [
    {
      event_id: "microservices-retry-storm",
      kind: "retry_storm",
      target_node: "api_gateway",
      target_edge: null,
      trigger_tick: 35,
      duration_ticks: 40,
      intensity: 0.65,
      partition_group_a: null,
      partition_group_b: null,
      random_target_pct: null
    },
    {
      event_id: "microservices-cache-partition",
      kind: "partition_edge",
      target_node: null,
      target_edge: "cache->database",
      trigger_tick: 110,
      duration_ticks: 35,
      intensity: 1.0,
      partition_group_a: null,
      partition_group_b: null,
      random_target_pct: null
    }
  ];

  return buildInput(seed, ti, nodes, edges, chaosEvents, 170, 3.4);
}

function topology_event_driven(seed, fm, ti) {
  const nodes = [
    createNode("producer", "Producer", "producer", scaledPower(1.0, ti), scaledFailureRate(0.004, fm), 5, 600, 0, 0, "aws-lambda"),
    createNode("message_queue", "Message Queue", "queue", scaledPower(1.7, ti), scaledFailureRate(0.008, fm), 7, 1600, 140, 0, "aws-sqs"),
    createNode("consumer_1", "Consumer 1", "compute", scaledPower(1.25, ti), scaledFailureRate(0.013, fm), 15, 300, 280, -110, "aws-lambda"),
    createNode("consumer_2", "Consumer 2", "compute", scaledPower(1.2, ti), scaledFailureRate(0.013, fm), 15, 300, 280, 110, "aws-lambda"),
    createNode("database", "Database", "database", scaledPower(1.3, ti), scaledFailureRate(0.009, fm), 13, 220, 450, 0, "aws-rds"),
    createNode("dead_letter_queue", "Dead Letter Queue", "queue", scaledPower(0.95, ti), scaledFailureRate(0.006, fm), 6, 1200, 140, 120, "aws-sqs")
  ];

  const edges = [
    createEdge("producer->message_queue", "producer", "message_queue", 6, 1.1, 0.001, 1000),
    createEdge("message_queue->consumer_1", "message_queue", "consumer_1", 8, 1.4, 0.0015, 820),
    createEdge("message_queue->consumer_2", "message_queue", "consumer_2", 8, 1.4, 0.0015, 820),
    createEdge("consumer_1->database", "consumer_1", "database", 12, 2.2, 0.0025, 650),
    createEdge("consumer_2->database", "consumer_2", "database", 12, 2.2, 0.0025, 650)
  ];

  const chaosEvents = [
    {
      event_id: "event-driven-queue-cpu",
      kind: "cpu_spike",
      target_node: "message_queue",
      target_edge: null,
      trigger_tick: 45,
      duration_ticks: 55,
      intensity: 0.6,
      partition_group_a: null,
      partition_group_b: null,
      random_target_pct: null
    },
    {
      event_id: "event-driven-consumer-kill",
      kind: "kill_node",
      target_node: "consumer_1",
      target_edge: null,
      trigger_tick: 130,
      duration_ticks: 20,
      intensity: 1.0,
      partition_group_a: null,
      partition_group_b: null,
      random_target_pct: null
    }
  ];

  return buildInput(seed, ti, nodes, edges, chaosEvents, 150, 3.2);
}

function topology_no_redundancy(seed, fm, ti) {
  const nodes = [
    createNode("client", "Client", "client", scaledPower(0.85, ti), scaledFailureRate(0.003, fm), 3, 500, 0, 0, "user"),
    createNode("single_server", "Single Server", "compute", scaledPower(1.0, ti), scaledFailureRate(0.02, fm), 22, 160, 180, 0, "aws-ec2"),
    createNode("database", "Database", "database", scaledPower(0.95, ti), scaledFailureRate(0.018, fm), 16, 140, 340, 0, "aws-rds")
  ];

  const edges = [
    createEdge("client->single_server", "client", "single_server", 7, 1.2, 0.0015, 700),
    createEdge("single_server->database", "single_server", "database", 15, 2.8, 0.004, 420)
  ];

  const chaosEvents = [
    {
      event_id: "no-redundancy-server-kill",
      kind: "kill_node",
      target_node: "single_server",
      target_edge: null,
      trigger_tick: 55,
      duration_ticks: 30,
      intensity: 1.0,
      partition_group_a: null,
      partition_group_b: null,
      random_target_pct: null
    },
    {
      event_id: "no-redundancy-db-edge-partition",
      kind: "partition_edge",
      target_node: null,
      target_edge: "single_server->database",
      trigger_tick: 125,
      duration_ticks: 35,
      intensity: 1.0,
      partition_group_a: null,
      partition_group_b: null,
      random_target_pct: null
    }
  ];

  return buildInput(seed, ti, nodes, edges, chaosEvents, 90, 2.8);
}

const topologyGenerators = {
  three_tier: topology_three_tier,
  microservices: topology_microservices,
  event_driven: topology_event_driven,
  no_redundancy: topology_no_redundancy
};

module.exports = {
  topology_three_tier,
  topology_microservices,
  topology_event_driven,
  topology_no_redundancy,
  topologyGenerators
};
