import os
import sys
import json
import hashlib
import random
import yaml as pyyaml
from pathlib import Path
from collections import defaultdict
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv('../.env')

sys.path.append(os.path.dirname(__file__))
from label_graphs import classify_graph


COMPOSE_FILENAMES = {
    'docker-compose.yml',
    'docker-compose.yaml',
    'docker-compose.prod.yml',
    'docker-compose.prod.yaml',
    'docker-compose.dev.yml',
    'docker-compose.dev.yaml',
    'docker-compose.override.yml',
    'docker-compose.override.yaml',
    'docker-compose.test.yml',
    'docker-compose.test.yaml',
    'compose.yml',
    'compose.yaml',
}

SKIP_DIRS = {'.git', 'node_modules', 'vendor', '__pycache__',
             '.idea', '.vscode', 'dist', 'build', 'target'}


def infer_node_type(name: str, image: str) -> tuple[str, int, int]:
    combined = (name + ' ' + image).lower()

    if any(x in combined for x in ['postgres', 'mysql', 'mongo',
           'mariadb', 'cockroach', 'cassandra', 'oracle',
           'mssql', 'sqlite', 'database', '-db', '_db', 'db-']):
        return 'PostgreSQL', 80, 3

    if any(x in combined for x in ['redis', 'memcach', 'hazelcast',
           'varnish', 'cache', 'ehcache']):
        return 'Cache', 10, 2

    if any(x in combined for x in ['rabbit', 'kafka', 'zookeeper',
           'nats', 'pulsar', 'activemq', 'sqs', 'queue',
           'broker', 'topic', 'amqp']):
        return 'RabbitMQ', 30, 3

    if any(x in combined for x in ['nginx', 'gateway', 'proxy',
           'ingress', 'traefik', 'haproxy', 'envoy', 'istio',
           'kong', 'ambassador', 'apigee', 'api-gw']):
        return 'Gateway', 20, 2

    if any(x in combined for x in ['frontend', 'ui', 'web',
           'client', 'react', 'angular', 'vue', 'next',
           'nuxt', 'svelte', 'static']):
        return 'Service', 50, 5

    if any(x in combined for x in ['load', 'balancer', 'lb',
           'infrastructure', 'edge', 'cdn', 'cloudfront']):
        return 'Infrastructure', 15, 2

    return 'Service', random.randint(50, 300), random.randint(3, 12)


def parse_compose_data(compose: dict, repo_name: str) -> dict | None:
    services = compose.get('services', {})
    if not services or not isinstance(services, dict):
        return None
    if len(services) < 2:
        return None

    nodes = []
    edges = []
    service_names = set(str(k) for k in services.keys())

    for svc_name, svc_config in services.items():
        svc_name = str(svc_name)
        if not svc_config or not isinstance(svc_config, dict):
            svc_config = {}

        image = str(svc_config.get('image', '')).lower()
        node_type, proc_ms, failure_rate = infer_node_type(svc_name, image)

        label = svc_name.replace('-', ' ').replace('_', ' ').title()

        nodes.append({
            'id': svc_name,
            'data': {
                'label': label,
                'type': node_type,
                'processingPowerMs': proc_ms,
                'failureRatePercent': failure_rate,
                'coldStartLatencyMs': random.randint(100, 500),
                'isActive': True,
            }
        })

        # Edges from depends_on
        depends = svc_config.get('depends_on', [])
        if isinstance(depends, dict):
            depends = list(depends.keys())
        elif isinstance(depends, str):
            depends = [depends]
        elif not isinstance(depends, list):
            depends = []

        for dep in depends:
            dep = str(dep)
            if dep in service_names and dep != svc_name:
                edges.append({
                    'id': f'e-{dep}-{svc_name}',
                    'source': dep,
                    'target': svc_name,
                    'latencyMs': random.randint(10, 100),
                    'packetLossPercent': round(random.uniform(0.5, 3.0), 2),
                    'bandwidthLimitMbps': random.randint(50, 1000),
                })

        # Edges from links
        links = svc_config.get('links', [])
        if isinstance(links, list):
            for link in links:
                linked = str(link).split(':')[0]
                if linked in service_names and linked != svc_name:
                    eid = f'e-{linked}-{svc_name}'
                    if not any(e['id'] == eid for e in edges):
                        edges.append({
                            'id': eid,
                            'source': linked,
                            'target': svc_name,
                            'latencyMs': random.randint(10, 100),
                            'packetLossPercent': round(random.uniform(0.5, 3.0), 2),
                            'bandwidthLimitMbps': random.randint(50, 1000),
                        })

    # If no edges found, infer from service types
    if len(edges) == 0:
        gateway_nodes = [n for n in nodes
                         if n['data']['type'] in ('Gateway', 'Infrastructure')]
        db_nodes = [n for n in nodes
                    if n['data']['type'] in ('PostgreSQL', 'Cache', 'RabbitMQ')]
        svc_nodes = [n for n in nodes if n['data']['type'] == 'Service']

        for gw in gateway_nodes[:2]:
            for svc in svc_nodes[:8]:
                edges.append({
                    'id': f'e-{gw["id"]}-{svc["id"]}',
                    'source': gw['id'],
                    'target': svc['id'],
                    'latencyMs': random.randint(20, 80),
                    'packetLossPercent': round(random.uniform(0.5, 2.0), 2),
                    'bandwidthLimitMbps': random.randint(100, 1000),
                })
        for svc in svc_nodes[:8]:
            for db in db_nodes[:3]:
                edges.append({
                    'id': f'e-{svc["id"]}-{db["id"]}',
                    'source': svc['id'],
                    'target': db['id'],
                    'latencyMs': random.randint(5, 50),
                    'packetLossPercent': round(random.uniform(0.1, 1.0), 2),
                    'bandwidthLimitMbps': random.randint(200, 2000),
                })

    if len(nodes) < 2:
        return None

    return {'nodes': nodes, 'edges': edges}


def parse_kubernetes_dir(repo_path: str, repo_name: str) -> dict | None:
    deployments = {}
    services = {}

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS
                   and not d.startswith('.')]
        for filename in files:
            if not filename.endswith(('.yaml', '.yml')):
                continue
            filepath = os.path.join(root, filename)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                for doc in pyyaml.safe_load_all(content):
                    if not isinstance(doc, dict):
                        continue
                    kind = str(doc.get('kind', ''))
                    name = str(doc.get('metadata', {}).get('name', ''))
                    if not name:
                        continue
                    if kind == 'Deployment':
                        containers = (doc.get('spec', {})
                                         .get('template', {})
                                         .get('spec', {})
                                         .get('containers', []))
                        image = ''
                        if containers and isinstance(containers, list):
                            image = str(containers[0].get('image', ''))
                        deployments[name] = {'image': image.lower()}
                    elif kind == 'Service':
                        selector = doc.get('spec', {}).get('selector', {}) or {}
                        services[name] = {'selector': selector}
            except Exception:
                continue

    if len(deployments) < 2:
        return None

    nodes = []
    for dep_name, dep_info in deployments.items():
        image = dep_info.get('image', '')
        node_type, proc_ms, failure_rate = infer_node_type(dep_name, image)
        nodes.append({
            'id': dep_name,
            'data': {
                'label': dep_name.replace('-', ' ').title(),
                'type': node_type,
                'processingPowerMs': proc_ms,
                'failureRatePercent': failure_rate,
                'coldStartLatencyMs': random.randint(100, 600),
                'isActive': True,
            }
        })

    dep_names = set(deployments.keys())
    edges = []

    for svc_name, svc_info in services.items():
        selector = svc_info.get('selector', {}) or {}
        app_label = str(
            selector.get('app') or
            selector.get('app.kubernetes.io/name') or
            selector.get('name') or ''
        ).lower()

        for dep_name in dep_names:
            if (app_label and
                (app_label in dep_name.lower() or
                 dep_name.lower() in app_label) and
                svc_name in dep_names and
                svc_name != dep_name):
                eid = f'e-{svc_name}-{dep_name}'
                if not any(e['id'] == eid for e in edges):
                    edges.append({
                        'id': eid,
                        'source': svc_name,
                        'target': dep_name,
                        'latencyMs': random.randint(5, 50),
                        'packetLossPercent': round(random.uniform(0.1, 1.5), 2),
                        'bandwidthLimitMbps': random.randint(100, 2000),
                    })

    # Fallback edge inference if nothing found
    if len(edges) == 0 and len(nodes) >= 3:
        gw_nodes = [n for n in nodes
                    if n['data']['type'] in ('Gateway', 'Infrastructure')]
        db_nodes = [n for n in nodes
                    if n['data']['type'] in ('PostgreSQL', 'Cache', 'RabbitMQ')]
        svc_nodes = [n for n in nodes if n['data']['type'] == 'Service']

        for gw in gw_nodes[:2]:
            for svc in svc_nodes[:6]:
                edges.append({
                    'id': f'e-{gw["id"]}-{svc["id"]}',
                    'source': gw['id'],
                    'target': svc['id'],
                    'latencyMs': random.randint(20, 80),
                    'packetLossPercent': round(random.uniform(0.5, 2.0), 2),
                    'bandwidthLimitMbps': random.randint(100, 1000),
                })
        for svc in svc_nodes[:6]:
            for db in db_nodes[:3]:
                edges.append({
                    'id': f'e-{svc["id"]}-{db["id"]}',
                    'source': svc['id'],
                    'target': db['id'],
                    'latencyMs': random.randint(5, 50),
                    'packetLossPercent': round(random.uniform(0.1, 1.0), 2),
                    'bandwidthLimitMbps': random.randint(200, 2000),
                })

    if len(nodes) < 2:
        return None

    return {'nodes': nodes, 'edges': edges}


def crawl_benchmarks(benchmarks_dir: str, output_dir: str) -> int:
    os.makedirs(output_dir, exist_ok=True)

    # Remove old benchmark graphs so we start fresh
    removed = 0
    for f in os.listdir(output_dir):
        if f.startswith('benchmark_') and f.endswith('.json'):
            os.remove(os.path.join(output_dir, f))
            removed += 1
    if removed > 0:
        print(f'Cleared {removed} old benchmark graphs before re-parsing.')

    saved_count = 0
    repo_counts = {}
    seen_sigs = set()
    k8s_counters = {}

    repos = sorted(os.listdir(benchmarks_dir))

    for repo_name in tqdm(repos, desc='Parsing repos'):
        repo_path = os.path.join(benchmarks_dir, repo_name)
        if not os.path.isdir(repo_path):
            continue

        repo_graphs = 0

        # -- Pass 1: All docker-compose variants --------------------
        for root, dirs, files in os.walk(repo_path):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS
                       and not d.startswith('.')]
            for filename in files:
                if filename.lower() not in COMPOSE_FILENAMES:
                    continue
                filepath = os.path.join(root, filename)
                try:
                    with open(filepath, 'r',
                              encoding='utf-8', errors='ignore') as f:
                        compose = pyyaml.safe_load(f)
                    if not compose:
                        continue
                    graph = parse_compose_data(compose, repo_name)
                    if graph is None:
                        continue

                    # Dedup by sorted node IDs + edge pairs - not just counts
                    node_ids = sorted(n['id'] for n in graph['nodes'])
                    edge_pairs = sorted(
                        (e['source'], e['target']) for e in graph['edges']
                    )
                    sig_str = json.dumps({'nodes': node_ids, 'edges': edge_pairs},
                                         sort_keys=True)
                    sig = hashlib.md5(sig_str.encode()).hexdigest()

                    if sig in seen_sigs:
                        continue
                    seen_sigs.add(sig)

                    graph['label'] = classify_graph(
                        graph['nodes'], graph['edges'], relaxed=True
                    )
                    graph['source'] = f'benchmark-{repo_name}'

                    out_name = f'benchmark_{repo_name}_{repo_graphs}.json'
                    with open(os.path.join(output_dir, out_name), 'w') as f:
                        json.dump(graph, f, indent=2)

                    repo_graphs += 1
                    saved_count += 1

                except Exception:
                    continue

        # -- Pass 2: Kubernetes yaml ---------------------------------
        k8s = parse_kubernetes_dir(repo_path, repo_name)
        if k8s is not None and len(k8s['nodes']) >= 2:
            graph = k8s

            # Dedup by sorted node IDs + edge pairs - not just counts
            node_ids = sorted(n['id'] for n in graph['nodes'])
            edge_pairs = sorted(
                (e['source'], e['target']) for e in graph['edges']
            )
            sig_str = json.dumps({'nodes': node_ids, 'edges': edge_pairs},
                                 sort_keys=True)
            sig = hashlib.md5(sig_str.encode()).hexdigest()

            if sig not in seen_sigs:
                seen_sigs.add(sig)
                k8s['label'] = classify_graph(
                    k8s['nodes'], k8s['edges'], relaxed=True
                )
                k8s['source'] = f'benchmark-{repo_name}-k8s'
                k8s_idx = k8s_counters.get(repo_name, 0)
                k8s_counters[repo_name] = k8s_idx + 1
                out_name = f'benchmark_{repo_name}_k8s_{k8s_idx}.json'
                with open(os.path.join(output_dir, out_name), 'w') as f:
                    json.dump(k8s, f, indent=2)
                repo_graphs += 1
                saved_count += 1

        # ALSO try each immediate subdirectory as its own k8s graph
        for subdir in os.listdir(repo_path):
            subdir_path = os.path.join(repo_path, subdir)
            if not os.path.isdir(subdir_path):
                continue
            if subdir.startswith('.') or subdir in SKIP_DIRS:
                continue

            sub_k8s = parse_kubernetes_dir(subdir_path, repo_name)
            if sub_k8s is None:
                continue
            if len(sub_k8s['nodes']) < 2:
                continue

            # Dedup check (use same hash approach from Fix 1)
            node_ids = sorted(n['id'] for n in sub_k8s['nodes'])
            edge_pairs = sorted(
                (e['source'], e['target']) for e in sub_k8s['edges']
            )
            sig_str = json.dumps(
                {'nodes': node_ids, 'edges': edge_pairs}, sort_keys=True
            )
            sub_sig = hashlib.md5(sig_str.encode()).hexdigest()

            if sub_sig in seen_sigs:
                continue
            seen_sigs.add(sub_sig)

            sub_k8s['label'] = classify_graph(
                sub_k8s['nodes'], sub_k8s['edges'], relaxed=True
            )
            sub_k8s['source'] = f'benchmark-{repo_name}-k8s'

            k8s_idx = k8s_counters.get(repo_name, 0)
            k8s_counters[repo_name] = k8s_idx + 1
            out_name = f'benchmark_{repo_name}_k8s_{k8s_idx}.json'

            with open(os.path.join(output_dir, out_name), 'w') as f:
                json.dump(sub_k8s, f, indent=2)

            repo_graphs += 1
            saved_count += 1

        if repo_graphs > 0:
            repo_counts[repo_name] = repo_graphs

    print('\nBenchmark parse summary:')
    for repo, count in sorted(repo_counts.items(), key=lambda x: -x[1]):
        print(f'  {repo:45s}: {count} graphs')
    print(f'\n  Total benchmark graphs saved: {saved_count}')
    return saved_count


if __name__ == '__main__':
    benchmarks_dir = os.getenv('BENCHMARKS_DIR', '../data/benchmarks')
    graphs_dir = os.getenv('GRAPHS_OUTPUT_DIR', '../data/graphs')

    if not os.path.exists(benchmarks_dir):
        print(f'ERROR: {benchmarks_dir} does not exist.')
        print('Run: git clone <repo> data/benchmarks/<name>')
        sys.exit(1)

    print(f'Benchmarks dir : {benchmarks_dir}')
    print(f'Output dir     : {graphs_dir}')
    print()

    total = crawl_benchmarks(benchmarks_dir, graphs_dir)

    # Count benchmark graphs in dataset
    benchmark_files = [
        f for f in os.listdir(graphs_dir)
        if f.startswith('benchmark_') and f.endswith('.json')
    ]
    print(f'\nTotal benchmark graphs in dataset: {len(benchmark_files)}')

    if len(benchmark_files) < 50:
        print('WARNING: Less than 50 benchmark graphs.')
        print('Clone more repos before retraining.')
    elif len(benchmark_files) < 100:
        print('ACCEPTABLE: 50-100 benchmark graphs.')
        print('Cross-dataset validation will work.')
    else:
        print('GOOD: 100+ benchmark graphs. Ready to retrain.')
