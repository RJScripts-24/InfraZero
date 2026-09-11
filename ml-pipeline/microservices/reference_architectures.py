"""Real published architectures, and synthetic controls, as graded fixtures.

These exist because held-out accuracy on Alibaba topologies did not catch the
defect that mattered. A model scoring 76.4% on the test split graded the
published Uber and Netflix architectures F, and graded a deliberately terrible
30-node design A. Test-split accuracy cannot see that, because the test split
contains neither a 30-node reference architecture nor a control pair built to
isolate one variable.

Two kinds of fixture live here.

**Reference architectures** are transcriptions of published diagrams from
companies that demonstrably serve enormous traffic. They are not a benchmark --
there are too few of them to measure accuracy, and transcription involves
judgement. What they *can* do is falsify: an architecture that has served
hundreds of millions of users grading F means the grader is wrong, not that
Netflix is wrong.

**Controls** are synthetic pairs that hold everything constant except the one
property under test. `scaled_excellent(width)` grows a design whose quality does
not change with size, so any grade drift across it is size confounding and
nothing else. `scaled_terrible(width)` is its opposite at matched size.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

Graph = Tuple[List[Dict], List[Dict]]


def node(node_id: str, label: str, node_type: str) -> Dict:
    return {"id": node_id, "data": {"label": label, "type": node_type}}


def edge(source: str, target: str) -> Dict:
    return {"source": source, "target": target}


# --------------------------------------------------------------------------- #
# Published reference architectures
# --------------------------------------------------------------------------- #


def uber() -> Graph:
    """Uber's dispatch architecture: WAF/LB edge, DISCO cell-sharded matching,
    a Kafka fan-out into an offline batch tier, and a separate logging pipeline.

    The batch tier is the point of interest. Hadoop, Spark, the ML fraud
    detector and the ETA calculator hang off Kafka, entirely off the request
    path -- a grader that reads them as request-path services sees a six-way
    synchronous fan-out that does not exist.
    """

    nodes = [
        node("cab", "Cab Driver App", "Service"),
        node("rider", "Rider App", "Service"),
        node("waf", "WAF", "Infrastructure"),
        node("lb", "Load Balancer", "Infrastructure"),
        node("kafka_rest", "Kafka REST API", "Service"),
        node("http_rest", "HTTP REST", "Service"),
        node("ws", "WebSockets Node", "Service"),
        node("kafka_main", "Kafka", "RabbitMQ"),
        node("hadoop", "Hadoop Hive HDFS Pig", "Background Job"),
        node("ml_fraud", "ML Fraud Detection Routing", "Background Job"),
        node("maps", "Maps Creation ETA Calculation", "Background Job"),
        node("pricing", "Pricing Surging", "Background Job"),
        node("spark", "Spark and Storm", "Background Job"),
        node("analytics", "Analytics ELK Jupyter", "Background Job"),
        node("backup_dc", "Backup Datacenter", "Infrastructure"),
        node("disco", "DISCO Supply Demand Dispatch", "Service"),
        node("r1", "Region 1", "Service"),
        node("r2", "Region 2", "Service"),
        node("r3", "Region 3", "Service"),
        node("r4", "Region 4", "Service"),
        node("r5", "Region 5", "Service"),
        node("rdbms", "RDBMS", "PostgreSQL"),
        node("nr1", "Node Region 1", "PostgreSQL"),
        node("nr2", "Node Region 2", "PostgreSQL"),
        node("nr3", "Node Region 3", "PostgreSQL"),
        node("nr4", "Node Region 4", "PostgreSQL"),
        node("kafka_logs", "Kafka Logs", "RabbitMQ"),
        node("elk", "ELK Logstash Log Analysis", "Background Job"),
        node("dashboard", "Analytics Dashboard", "Service"),
    ]
    edges = [
        edge("cab", "waf"), edge("rider", "waf"), edge("waf", "lb"),
        edge("lb", "kafka_rest"), edge("lb", "http_rest"), edge("lb", "ws"),
        edge("kafka_rest", "kafka_main"),
        edge("kafka_main", "hadoop"), edge("kafka_main", "ml_fraud"),
        edge("kafka_main", "maps"), edge("kafka_main", "pricing"),
        edge("kafka_main", "spark"), edge("kafka_main", "analytics"),
        edge("kafka_main", "backup_dc"),
        edge("ws", "disco"), edge("http_rest", "disco"),
        edge("disco", "r1"), edge("disco", "r5"), edge("disco", "r4"),
        edge("r1", "r2"), edge("r5", "r2"), edge("r5", "r3"),
        edge("r1", "r4"), edge("r4", "r5"),
        edge("rdbms", "disco"), edge("rdbms", "r4"),
        edge("nr1", "nr2"), edge("nr1", "nr3"), edge("nr3", "nr4"),
        edge("nr2", "nr4"), edge("nr2", "r4"),
        edge("disco", "kafka_logs"), edge("http_rest", "kafka_logs"),
        edge("ws", "kafka_logs"), edge("kafka_logs", "elk"), edge("elk", "dashboard"),
    ]
    return nodes, edges


def netflix() -> Graph:
    """Netflix: Open Connect CDN, ELB into Zuul's filter chain, Hystrix-guarded
    microservices over EV Cache and Cassandra, plus the transcoding pipeline and
    the Chukwa/Kafka/Samza event pipeline.

    Nearly every component that makes this architecture survivable -- the CDN,
    the circuit breaker, the cache tier, the async transcoder pool -- is exactly
    what a five-role vocabulary erases.
    """

    nodes = [
        node("tv", "Smart TV", "Service"),
        node("laptop", "Laptop", "Service"),
        node("console", "Game Console", "Service"),
        node("phone", "Mobile App", "Service"),
        node("elb", "ELB", "Infrastructure"),
        node("oc", "Open Connect CDN", "Edge Network"),
        node("netty", "Netty Server", "Service"),
        node("inbound", "Zuul Inbound Filter", "Gateway"),
        node("endpoint", "Zuul Endpoint Filter", "Gateway"),
        node("outbound", "Zuul Outbound Filter", "Gateway"),
        node("hystrix", "Hystrix", "Service"),
        node("ms", "Microservices", "Service"),
        node("critical", "Critical Microservices", "Service"),
        node("svc_client", "Service Client", "Service"),
        node("evcache", "EV Cache", "Cache"),
        node("cassandra", "Cassandra", "PostgreSQL"),
        node("mysql", "MySQL Billing", "PostgreSQL"),
        node("chaos", "Chaos Monkey", "Background Job"),
        node("titus", "Titus", "Background Job"),
        node("validate", "New Video Validation Transcoding", "Service"),
        node("queue", "Queue", "RabbitMQ"),
        node("transcoder", "Transcoder async workers", "Background Job"),
        node("s3_video", "S3 Video Store", "PostgreSQL"),
        node("chukwa", "Chukwa", "Background Job"),
        node("s3_logs", "S3 Logs", "PostgreSQL"),
        node("emr", "Amazon EMR", "Background Job"),
        node("kafka1", "Kafka", "RabbitMQ"),
        node("router", "Message Router Samza", "Service"),
        node("kafka2", "Kafka Events Data", "RabbitMQ"),
        node("es", "Elastic Search", "PostgreSQL"),
        node("spark", "Spark", "Background Job"),
    ]
    edges = [
        edge("tv", "elb"), edge("laptop", "elb"), edge("console", "elb"),
        edge("phone", "elb"), edge("oc", "laptop"), edge("elb", "netty"),
        # Zuul's filter chain. The published diagram also draws an arrow from
        # the outbound filter back to Netty, but that is the RESPONSE travelling
        # home, not a call dependency. Transcribing it as an edge would close a
        # cycle that does not exist and make the grader report a retry loop in
        # what is really a request pipeline.
        edge("netty", "inbound"), edge("inbound", "endpoint"),
        edge("endpoint", "outbound"),
        edge("endpoint", "hystrix"), edge("hystrix", "evcache"),
        edge("hystrix", "svc_client"), edge("hystrix", "ms"),
        edge("svc_client", "ms"), edge("ms", "critical"),
        edge("critical", "evcache"), edge("critical", "cassandra"),
        edge("critical", "mysql"), edge("ms", "cassandra"),
        edge("chaos", "netty"), edge("titus", "ms"),
        edge("inbound", "validate"), edge("validate", "queue"),
        edge("queue", "transcoder"), edge("transcoder", "s3_video"),
        edge("ms", "chukwa"), edge("chukwa", "s3_logs"), edge("s3_logs", "emr"),
        edge("inbound", "kafka1"), edge("chukwa", "kafka1"),
        edge("kafka1", "router"), edge("router", "kafka2"),
        edge("kafka2", "es"), edge("kafka2", "spark"),
    ]
    return nodes, edges


# --------------------------------------------------------------------------- #
# Synthetic controls -- one variable at a time
# --------------------------------------------------------------------------- #


def scaled_excellent(width: int) -> Graph:
    """A design whose quality is INDEPENDENT of `width`.

    Every vertical is self-contained: its own cache, its own database, writes
    decoupled through its own queue to its own worker. Nothing is shared, so
    there is no contention point and no cycle, and adding a vertical adds no
    coupling. Grade drift across this family is therefore pure size confounding.
    """

    nodes = [
        node("lb", "Load Balancer", "Infrastructure"),
        node("gw", "API Gateway", "Gateway"),
    ]
    edges = [edge("lb", "gw")]
    for index in range(width):
        nodes += [
            node(f"s{index}", f"Service {index}", "Service"),
            node(f"c{index}", f"Cache {index}", "Cache"),
            node(f"d{index}", f"DB {index}", "PostgreSQL"),
            node(f"q{index}", f"Queue {index}", "RabbitMQ"),
            node(f"w{index}", f"Worker {index}", "Background Job"),
        ]
        edges += [
            edge("gw", f"s{index}"), edge(f"s{index}", f"c{index}"),
            edge(f"c{index}", f"d{index}"), edge(f"s{index}", f"q{index}"),
            edge(f"q{index}", f"w{index}"), edge(f"w{index}", f"d{index}"),
        ]
    return nodes, edges


def scaled_terrible(width: int) -> Graph:
    """The anti-pattern at matched size: every service synchronously hammering
    one shared database, no cache anywhere, and a retry cycle through the chain.
    """

    nodes = [
        node("gw", "API Gateway", "Gateway"),
        node("db", "Shared Primary DB", "PostgreSQL"),
    ]
    edges: List[Dict] = []
    for index in range(width):
        nodes.append(node(f"s{index}", f"Service {index}", "Service"))
        edges += [edge("gw", f"s{index}"), edge(f"s{index}", "db")]
        if index:
            edges.append(edge(f"s{index}", f"s{index - 1}"))
    if width > 1:
        edges.append(edge("s0", f"s{width - 1}"))  # closes the retry cycle
    return nodes, edges


REFERENCE_ARCHITECTURES = {
    "uber": uber,
    "netflix": netflix,
}
