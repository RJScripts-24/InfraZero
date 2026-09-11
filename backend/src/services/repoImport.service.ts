// backend/src/services/repoImport.service.ts
//
// Build an architecture graph from a repository's own deployment manifests.
//
// Why this exists
// ---------------
// Everything else in the product grades a drawing, and a drawing has two
// problems: somebody has to make it, and it starts going stale the moment they
// do. A repository already contains a precise, current description of the
// architecture in its Kubernetes manifests or its compose file. Reading that
// directly removes the transcription step entirely.
//
// It also recovers things a diagram almost never states:
//
//   * `spec.replicas` -- how many instances each component actually runs, which
//     is what separates "this gateway is a single point of failure" from "this
//     gateway is a three-instance tier";
//   * the real wiring, from environment variables and Service selectors rather
//     than from whichever arrows somebody remembered to draw.
//
// In Kubernetes one workload addresses another through a `Service` object, not
// by the Deployment's name, so `DATABASE_HOST=postgres-svc` only resolves to the
// Postgres StatefulSet if the Service definitions are read alongside the
// workloads. That is why this works at repository scope and not per file.
//
// This is a TypeScript port of `ml-pipeline/microservices/scrape_large_systems.py`,
// which was written first to build the training corpus. The two are kept
// behaviourally aligned deliberately: an architecture imported here should be
// described the same way as the ones the model was trained on.

import yaml from 'js-yaml';
import { CustomEdge, CustomNode } from '../types/graph';
import { logger } from '../utils/logger';

const GITHUB_API = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';

const MAX_MANIFESTS = 200;
const MAX_MANIFEST_BYTES = 400_000;
const MAX_COMPONENTS = 150;
const FETCH_TIMEOUT_MS = 20_000;

const K8S_WORKLOADS = new Set([
  'Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob',
]);

const MANIFEST_DIR_HINTS = [
  'k8s', 'kube', 'kubernetes', 'manifests', 'deploy', 'deployment',
  'charts', 'helm', 'overlays', 'base', 'infra', 'infrastructure',
  'ops', 'cluster', 'gitops', 'argocd', 'kustomize',
];

const SKIP_PATH_MARKERS = [
  '.github/', 'node_modules/', 'vendor/', '.gitlab', 'docs/',
  'test/', 'tests/', 'example/', 'examples/', 'values.yaml',
  'chart.yaml', 'kustomization.yaml', 'skaffold.yaml', 'openapi', 'swagger',
];

const COMPOSE_NAMES = [
  'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml',
];

/**
 * A compose file is very often not called exactly `docker-compose.yml`.
 *
 * `docker-compose.postgres.yml`, `docker-compose.prod.yaml` and
 * `compose.override.yml` are all ordinary, and matching only the four canonical
 * names reported "no manifests found" for repositories that plainly ship one.
 * The suffix is allowed to be anything; the stem and the extension are not.
 */
const COMPOSE_PATTERN = /(^|\/)(docker-)?compose(\.[^/]*)?\.(ya?ml)$/i;

const looksLikeCompose = (path: string): boolean => COMPOSE_PATTERN.test(path.toLowerCase());

const GO_TEMPLATE = /\{\{[^}]*\}\}/g;
const TOKEN = /[a-z0-9][a-z0-9._-]{2,}/g;

/**
 * Container image or workload name -> canvas component type.
 *
 * Mirrors `infer_node_type` in the scraper so an imported architecture uses the
 * same vocabulary the grader was trained to read.
 */
const TYPE_RULES: Array<[string[], string]> = [
  [['postgres', 'mysql', 'mongo', 'mariadb', 'cockroach', 'cassandra', 'oracle',
    'mssql', 'sqlite', 'couchdb', 'influx', 'clickhouse', 'elasticsearch',
    'opensearch', 'neo4j', 'dynamodb', 'database', '-db', '_db', 'db-'], 'PostgreSQL'],
  [['redis', 'memcach', 'hazelcast', 'varnish', 'cache', 'ehcache'], 'Cache'],
  [['rabbit', 'kafka', 'zookeeper', 'nats', 'pulsar', 'activemq', 'sqs',
    'queue', 'broker', 'amqp'], 'RabbitMQ'],
  [['nginx', 'traefik', 'haproxy', 'envoy', 'istio', 'kong', 'ambassador',
    'ingress', 'apisix', 'caddy'], 'Infrastructure'],
  [['gateway', 'api-gw', 'apigw', 'bff', 'zuul'], 'Gateway'],
  [['worker', 'celery', 'sidekiq', 'cron', 'batch', 'scheduler', 'consumer',
    'job', 'spark', 'hadoop', 'flink', 'airflow'], 'Background Job'],
  [['cdn', 'cloudfront', 'fastly', 'akamai'], 'Edge Network'],
  [['prometheus', 'grafana', 'jaeger', 'zipkin', 'kibana', 'logstash',
    'fluentd', 'loki', 'datadog'], 'Background Job'],
];

export interface ImportedArchitecture {
  nodes: CustomNode[];
  edges: CustomEdge[];
  source: string;
  kind: 'kubernetes' | 'docker-compose';
  manifestsRead: number;
  /** Components whose replica count came from the manifest rather than a default. */
  replicasRecovered: number;
}

export class RepoImportError extends Error {}

const inferComponentType = (name: string, image = ''): string => {
  const combined = `${name} ${image}`.toLowerCase();
  for (const [needles, type] of TYPE_RULES) {
    if (needles.some((needle) => combined.includes(needle))) {
      return type;
    }
  }
  return 'Service';
};

const looksLikeManifest = (path: string): boolean => {
  const lowered = path.toLowerCase();
  if (!lowered.endsWith('.yaml') && !lowered.endsWith('.yml')) return false;
  if (SKIP_PATH_MARKERS.some((marker) => lowered.includes(marker))) return false;
  return MANIFEST_DIR_HINTS.some((hint) => `/${lowered}`.includes(`/${hint}/`));
};

/**
 * Neutralise Helm's Go templating so the YAML underneath can be parsed.
 *
 * A Helm template is not valid YAML until rendered, and rendering needs the
 * chart's values plus a Helm binary. Substituting a placeholder recovers the
 * structure -- names, images, env wiring -- which is all this reads. Control
 * flow lines are dropped, because a bare `{{- if .Values.x }}` otherwise leaves
 * a dangling fragment behind.
 */
const stripTemplating = (text: string): string =>
  text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{{')) return true;
      return !['if', 'end', 'range', 'else', 'with', 'define', 'toYaml', 'include']
        .some((keyword) => trimmed.includes(keyword));
    })
    .map((line) => line.replace(GO_TEMPLATE, 'placeholder'))
    .join('\n');

// --------------------------------------------------------------------------- //
// GitHub access
// --------------------------------------------------------------------------- //

export const parseRepoReference = (input: string): { owner: string; repo: string } => {
  const cleaned = input.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const match = cleaned.match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)$/);
  if (!match) {
    throw new RepoImportError(
      `Could not read "${input}" as a GitHub repository. Use owner/repo or a github.com URL.`,
    );
  }
  return { owner: match[1], repo: match[2] };
};

const githubHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'InfraZero-architecture-import',
  };
  // Optional: lifts the rate limit from 60/hour to 5000/hour, and is the only
  // way to read a private repository the user has granted access to.
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `token ${token}`;
  return headers;
};

const fetchWithTimeout = async (url: string, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

const listManifestPaths = async (
  owner: string,
  repo: string,
): Promise<{ branch: string; paths: string[]; treePaths: string[] }> => {
  let lastStatus = 0;
  for (const branch of ['main', 'master']) {
    const response = await fetchWithTimeout(
      `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers: githubHeaders() },
    );
    lastStatus = response.status;
    if (!response.ok) continue;

    const payload = (await response.json()) as {
      tree?: Array<{ path: string; type: string; size?: number }>;
    };
    const paths = (payload.tree ?? [])
      .filter((entry) =>
        entry.type === 'blob'
        && (entry.size ?? 0) < MAX_MANIFEST_BYTES
        && looksLikeManifest(entry.path))
      .map((entry) => entry.path)
      .slice(0, MAX_MANIFESTS);
    // The unfiltered tree is returned as well, so a compose file living in a
    // subdirectory can be found without a second API call.
    const treePaths = (payload.tree ?? [])
      .filter((entry) => entry.type === 'blob' && (entry.size ?? 0) < MAX_MANIFEST_BYTES)
      .map((entry) => entry.path);
    return { branch, paths, treePaths };
  }

  if (lastStatus === 404) {
    throw new RepoImportError(
      `Repository ${owner}/${repo} was not found, or is private and no GITHUB_TOKEN is configured.`,
    );
  }
  if (lastStatus === 403) {
    throw new RepoImportError(
      'GitHub rate limit reached. Set GITHUB_TOKEN in the backend environment to raise it.',
    );
  }
  throw new RepoImportError(`Could not read ${owner}/${repo} (HTTP ${lastStatus}).`);
};

const fetchRaw = async (
  owner: string, repo: string, branch: string, path: string,
): Promise<string | null> => {
  try {
    const response = await fetchWithTimeout(`${RAW_BASE}/${owner}/${repo}/${branch}/${path}`);
    if (!response.ok) return null;
    const text = await response.text();
    return text.length < MAX_MANIFEST_BYTES ? text : null;
  } catch {
    return null;
  }
};

// --------------------------------------------------------------------------- //
// Manifests -> architecture
// --------------------------------------------------------------------------- //

interface Workload {
  type: string;
  replicas: number;
  replicasDeclared: boolean;
  labels: Record<string, string>;
  tokens: Set<string>;
  image: string;
}

/**
 * Components that exist to receive telemetry.
 *
 * What flows into these is metrics, logs and traces: emitted alongside a
 * request rather than on the way to answering one, and written asynchronously
 * by every client that writes it. Treating those references as ordinary
 * synchronous calls put a metrics store in the user's request path, where it
 * competed for capacity with the work the user was actually waiting on -- which
 * is how a Kubernetes import reported its `monitoring-influxdb` shedding
 * requests continuously at ordinary load.
 *
 * Deliberately narrow. `elasticsearch` is absent because it is as often a
 * product's own search backend as a log sink, and `sentry` because a repository
 * that ships Sentry is running it as the product, not watching itself with it.
 */
const TELEMETRY_SINKS = [
  'prometheus', 'grafana', 'influx', 'telegraf', 'statsd', 'graphite',
  'jaeger', 'zipkin', 'tempo', 'loki', 'promtail', 'kibana', 'logstash',
  'fluentd', 'fluent-bit', 'filebeat', 'metricbeat', 'datadog', 'newrelic',
  'alertmanager', 'thanos', 'cadvisor', 'heapster', 'node-exporter',
  'opentelemetry', 'otel-collector', 'victoria-metrics',
];

const isTelemetrySink = (name: string, image = ''): boolean => {
  const combined = `${name} ${image}`.toLowerCase();
  return TELEMETRY_SINKS.some((needle) => combined.includes(needle));
};

const podTemplate = (spec: any): any => {
  if (spec?.template && typeof spec.template === 'object') return spec.template;
  const nested = spec?.jobTemplate?.spec?.template;
  return nested && typeof nested === 'object' ? nested : {};
};

const collectReferences = (containers: any[]): { image: string; tokens: string[] } => {
  let image = '';
  const blob: string[] = [];
  for (const container of containers) {
    if (!container || typeof container !== 'object') continue;
    image = image || String(container.image ?? '');
    for (const env of container.env ?? []) {
      if (env && typeof env === 'object') {
        blob.push(String(env.value ?? ''));
        for (const holder of Object.values(env.valueFrom ?? {})) {
          if (holder && typeof holder === 'object') blob.push(String((holder as any).name ?? ''));
        }
      }
    }
    for (const ref of container.envFrom ?? []) {
      for (const holder of Object.values(ref ?? {})) {
        if (holder && typeof holder === 'object') blob.push(String((holder as any).name ?? ''));
      }
    }
    // `args` and `command` are lists in the schema, but manifests in the wild
    // are not always schema-valid and stripping Helm templating can collapse a
    // list into a scalar. Coerce rather than trust.
    for (const field of ['args', 'command'] as const) {
      const value = container[field];
      if (Array.isArray(value)) blob.push(...value.map(String));
      else if (value != null) blob.push(String(value));
    }
  }
  return { image, tokens: blob };
};

export const buildFromKubernetes = (documents: any[], source: string): ImportedArchitecture | null => {
  const workloads = new Map<string, Workload>();
  const services: Array<{ name: string; selector: Record<string, string> }> = [];

  for (const document of documents) {
    if (!document || typeof document !== 'object') continue;
    const kind = document.kind;
    const name = String(document.metadata?.name ?? '').trim();
    const spec = document.spec;
    if (!name || !spec || typeof spec !== 'object') continue;

    if (kind === 'Service') {
      const selector = spec.selector;
      services.push({ name, selector: selector && typeof selector === 'object' ? selector : {} });
      continue;
    }
    if (!K8S_WORKLOADS.has(kind)) continue;

    const template = podTemplate(spec);
    const containers = Array.isArray(template?.spec?.containers) ? template.spec.containers : [];
    const { image, tokens } = collectReferences(containers);

    // The one piece of redundancy information a manifest states outright.
    // A DaemonSet has no replica count because it runs one pod per node; three
    // stands in for a cluster, and is flagged as inferred rather than declared.
    const declared = typeof spec.replicas === 'number' && spec.replicas > 0 ? spec.replicas : null;
    const replicas = declared ?? (kind === 'DaemonSet' ? 3 : 1);

    workloads.set(name, {
      type: inferComponentType(name, image),
      replicas,
      replicasDeclared: declared !== null,
      labels: (template?.metadata?.labels ?? {}) as Record<string, string>,
      tokens: new Set((tokens.join(' ').toLowerCase().match(TOKEN) ?? [])),
      image,
    });
  }

  if (workloads.size < 2 || workloads.size > MAX_COMPONENTS) return null;

  // Resolve each Service onto the workload its selector matches, so an env var
  // of DB_HOST=postgres-svc connects to the postgres StatefulSet.
  const aliasToWorkload = new Map<string, string>();
  for (const service of services) {
    let matched: string | null = null;
    const selectorEntries = Object.entries(service.selector);
    if (selectorEntries.length > 0) {
      for (const [workloadName, workload] of workloads) {
        if (selectorEntries.every(([key, value]) => workload.labels?.[key] === value)) {
          matched = workloadName;
          break;
        }
      }
    }
    if (!matched && workloads.has(service.name)) matched = service.name;
    if (matched) aliasToWorkload.set(service.name.toLowerCase(), matched);
  }
  for (const workloadName of workloads.keys()) {
    if (!aliasToWorkload.has(workloadName.toLowerCase())) {
      aliasToWorkload.set(workloadName.toLowerCase(), workloadName);
    }
  }

  const edges: CustomEdge[] = [];
  const seen = new Set<string>();
  for (const [name, workload] of workloads) {
    for (const token of workload.tokens) {
      // An env value is often a cluster DNS name; strip the suffix.
      const target = aliasToWorkload.get(token.split('.')[0]);
      const key = `${name}->${target}`;
      if (target && target !== name && !seen.has(key)) {
        seen.add(key);
        edges.push({
          id: `e-${edges.length}`,
          source: name,
          target,
          ...(isTelemetrySink(target, workloads.get(target)?.image ?? '')
            ? { callKind: 'async' as const }
            : {}),
        });
      }
    }
  }

  return {
    nodes: layOut([...workloads.entries()].map(([name, workload]) => ({
      name, type: workload.type, replicas: workload.replicas,
    }))),
    edges,
    source,
    kind: 'kubernetes',
    manifestsRead: documents.length,
    replicasRecovered: [...workloads.values()].filter((w) => w.replicasDeclared).length,
  };
};

export const buildFromCompose = (document: any, source: string): ImportedArchitecture | null => {
  const services = document?.services;
  if (!services || typeof services !== 'object') return null;

  const names = Object.keys(services);
  if (names.length < 2 || names.length > MAX_COMPONENTS) return null;

  const components = names.map((name) => {
    const spec = services[name] ?? {};
    const image = String(spec.image ?? (typeof spec.build === 'string' ? spec.build : spec.build?.context ?? ''));
    // Compose states scale as `deploy.replicas`, older files as `scale`.
    const replicas = Number(spec.deploy?.replicas ?? spec.scale ?? 1);
    return {
      name,
      type: inferComponentType(name, image),
      replicas: Number.isFinite(replicas) && replicas > 0 ? Math.round(replicas) : 1,
    };
  });

  const known = new Set(names);
  const edges: CustomEdge[] = [];
  for (const name of names) {
    const spec = services[name] ?? {};
    const dependencies: string[] = [];
    if (Array.isArray(spec.depends_on)) dependencies.push(...spec.depends_on.map(String));
    else if (spec.depends_on && typeof spec.depends_on === 'object') {
      dependencies.push(...Object.keys(spec.depends_on));
    }
    if (Array.isArray(spec.links)) dependencies.push(...spec.links.map((l: any) => String(l).split(':')[0]));

    for (const dependency of dependencies) {
      if (known.has(dependency) && dependency !== name) {
        const dependencySpec = services[dependency] ?? {};
        const dependencyImage = String(dependencySpec.image ?? '');
        edges.push({
          id: `e-${edges.length}`,
          source: name,
          target: dependency,
          ...(isTelemetrySink(dependency, dependencyImage) ? { callKind: 'async' as const } : {}),
        });
      }
    }
  }

  return {
    nodes: layOut(components),
    edges,
    source,
    kind: 'docker-compose',
    manifestsRead: 1,
    replicasRecovered: components.filter((c) => c.replicas > 1).length,
  };
};

/**
 * Place components on the canvas in dependency layers.
 *
 * An imported graph has no coordinates, and dropping every node at the origin
 * makes the canvas unusable on arrival. Layering by type puts entry points at
 * the top and data stores at the bottom, which is how people draw these anyway.
 */
const TYPE_LAYER: Record<string, number> = {
  'Edge Network': 0,
  Infrastructure: 1,
  Gateway: 2,
  Service: 3,
  'Background Job': 4,
  RabbitMQ: 4,
  Cache: 5,
  PostgreSQL: 6,
};

const layOut = (
  components: Array<{ name: string; type: string; replicas: number }>,
): CustomNode[] => {
  const byLayer = new Map<number, Array<{ name: string; type: string; replicas: number }>>();
  for (const component of components) {
    const layer = TYPE_LAYER[component.type] ?? 3;
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(component);
  }

  const nodes: CustomNode[] = [];
  for (const [layer, members] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    members.forEach((component, index) => {
      nodes.push({
        id: component.name,
        type: 'custom',
        position: { x: index * 280, y: layer * 200 },
        data: {
          label: component.name,
          type: component.type as any,
          isActive: true,
          replicas: component.replicas,
        },
      });
    });
  }
  return nodes;
};

// --------------------------------------------------------------------------- //
// Entry point
// --------------------------------------------------------------------------- //

export const importArchitectureFromRepo = async (
  reference: string,
): Promise<ImportedArchitecture> => {
  const { owner, repo } = parseRepoReference(reference);
  logger.info(`[RepoImport] Reading ${owner}/${repo}`);

  const { branch, paths, treePaths } = await listManifestPaths(owner, repo);

  // Kubernetes first: it carries replica counts and Service wiring, which a
  // compose file mostly does not.
  if (paths.length > 0) {
    const documents: any[] = [];
    const contents = await Promise.all(
      paths.map((path) => fetchRaw(owner, repo, branch, path)),
    );
    for (const content of contents) {
      if (!content) continue;
      try {
        const prepared = content.includes('{{') ? stripTemplating(content) : content;
        for (const document of yaml.loadAll(prepared)) {
          if (document && typeof document === 'object') documents.push(document);
        }
      } catch {
        // One unparseable manifest must not fail the import.
      }
    }
    const architecture = buildFromKubernetes(documents, `${owner}/${repo}`);
    if (architecture) {
      logger.info(
        `[RepoImport] ${owner}/${repo}: ${architecture.nodes.length} components, ` +
        `${architecture.edges.length} links, ${architecture.replicasRecovered} replica counts recovered`,
      );
      return architecture;
    }
  }

  // Compose files are not always at the repository root. A monorepo commonly
  // keeps one per component (`backend/docker-compose.yml`), and looking only at
  // the root reports "no manifests found" for a repo that plainly has one.
  const composeCandidates = [
    ...COMPOSE_NAMES,
    ...treePaths.filter(looksLikeCompose),
  ].filter((path, index, all) => all.indexOf(path) === index);

  for (const candidate of composeCandidates) {
    const content = await fetchRaw(owner, repo, branch, candidate);
    // An empty placeholder file is not a compose file. Skipping it here is what
    // stops the import stopping at the first zero-byte candidate it finds.
    if (!content || content.trim().length === 0) continue;
    try {
      const document = yaml.load(content);
      const architecture = buildFromCompose(document, `${owner}/${repo}`);
      if (architecture) {
        logger.info(
          `[RepoImport] ${owner}/${repo}: ${architecture.nodes.length} components from ${candidate}`,
        );
        return architecture;
      }
    } catch {
      // Fall through to the next candidate.
    }
  }

  throw new RepoImportError(
    `No deployment manifests found in ${owner}/${repo}. Looked for Kubernetes manifests under ` +
    `k8s/, deploy/, charts/ and similar, and for a docker-compose file at the repository root.`,
  );
};
