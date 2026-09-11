import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Share2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Edit3,
  Sparkles,
  Check,
  FileImage,
  PanelLeftClose,
  Save,
  PanelLeftOpen,
  Terminal,
  Zap,
  GitBranch,
} from 'lucide-react';
import {
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FlowCanvas } from '../components/FlowCanvas';
import { useGraphHistory } from '../hooks/useGraphHistory';
import { ImportDiagramPopup } from '../components/ImportDiagramPopup';
import { ImportRepoPopup } from '../components/ImportRepoPopup';
import { ReportView } from '../components/ReportView';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { DEFAULT_ARCHITECTURE_ICON, PRIMITIVE_ITEMS, iconForNode, resolvePrimitiveByText, type PrimitiveItem } from '../lib/architectureIcons';
import { authFetch, getUser, isTemporaryGuest } from '../../lib/auth';
import * as api from '../../lib/api';
import { toast } from 'sonner';
import { initCollaboration, destroyCollaboration, setLocalUser, setLocalCursor } from '../../lib/collaboration';
import * as Y from 'yjs';

// ─── Static data ──────────────────────────────────────────────────────────────

const initialNodes: Node[] = [];

const edgeBase = {
  type: 'smoothstep',
  animated: false,
  style: { stroke: 'rgba(148,163,184,0.75)', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 20, height: 20 },
};

const initialEdges: Edge[] = [];

type LibraryItem = {
  id: string;
  name: string;
  type: string;
  iconPath: string;
};

type LibraryCategory = {
  category: string;
  items: LibraryItem[];
};

const ICON_INITIAL_RENDER_COUNT = 40;
const ICON_LOAD_MORE_STEP = 40;

const normalizeIconPath = (rawPath?: string | null): string => {
  if (!rawPath || typeof rawPath !== 'string') {
    return DEFAULT_ARCHITECTURE_ICON;
  }

  const forwardSlashPath = rawPath.replace(/\\/g, '/').trim();
  if (!forwardSlashPath) {
    return DEFAULT_ARCHITECTURE_ICON;
  }

  if (forwardSlashPath.startsWith('/icons/')) {
    return `/Icons/${forwardSlashPath.slice('/icons/'.length)}`;
  }

  return forwardSlashPath;
};

const COMPONENT_LIBRARY: LibraryCategory[] = (() => {
  const grouped = PRIMITIVE_ITEMS.reduce<Record<string, LibraryItem[]>>((acc, item: PrimitiveItem) => {
    const category = item.section || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }

    acc[category].push({
      id: item.id,
      name: item.name,
      type: item.type,
      iconPath: normalizeIconPath(item.iconPath),
    });

    return acc;
  }, {});

  const categories: LibraryCategory[] = Object.entries(grouped).map(([category, items]) => ({
    category,
    items,
  }));

  categories.push({
    category: 'Layout',
    items: [
      { id: 'vpc', name: 'VPC', type: 'group', iconPath: '/Icons/aws/networking/Amazon-VPC.svg' },
      { id: 'cluster', name: 'Cluster', type: 'group', iconPath: '/Icons/generic/kubernetes.svg' },
      { id: 'container', name: 'Service Group', type: 'group', iconPath: DEFAULT_ARCHITECTURE_ICON },
    ],
  });

  return categories;
})();

const wsUrlFromEnv = (() => {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicit && explicit.trim()) {
    return explicit;
  }
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || '';
  if (apiBase) {
    return apiBase.replace(/^http/i, 'ws');
  }
  return 'ws://localhost:3001';
})();

/**
 * Collapses entries that share an id, keeping the last one seen.
 *
 * Both peers replace the whole shared Yjs array on every change, and a CRDT
 * merges two concurrent replacements by keeping both - so the same node
 * legitimately arrives twice. normalizeNodes renames a repeated id ("db" ->
 * "db-1"), which is right for a user pasting duplicates but turns a sync
 * artefact into a phantom component, so remote payloads are collapsed first.
 */
const dedupeById = <T,>(items: T[]): T[] => {
  if (!Array.isArray(items)) return [];
  const byId = new Map<string, T>();
  for (const item of items) {
    const id = String((item as { id?: unknown })?.id ?? '');
    if (!id) continue;
    byId.set(id, item);
  }
  return [...byId.values()];
};

const normalizeNodes = (input: any): Node[] => {
  if (!Array.isArray(input)) return [];
  const seenNodeIds = new Map<string, number>();
  return input
    .filter((n) => n && typeof n === 'object')
    .map((n: any, idx: number) => {
      const baseId = String(n.id ?? `node-${Date.now()}-${idx}`);
      const dupCount = seenNodeIds.get(baseId) ?? 0;
      seenNodeIds.set(baseId, dupCount + 1);
      const uniqueId = dupCount === 0 ? baseId : `${baseId}-${dupCount}`;

      const label = n.data?.label || n.label || `Service ${idx + 1}`;
      const type = n.data?.type || n.type || 'Node Service';
      const resolved = resolvePrimitiveByText(label, type, n.id);

      return {
        id: uniqueId,
        type: 'custom',
        position: {
          x: Number(n.position?.x ?? n.x ?? idx * 200),
          y: Number(n.position?.y ?? n.y ?? 120),
        },
        data: {
          ...(n.data || {}),
          label,
          type,
          iconPath: normalizeIconPath(n.data?.iconPath || resolved?.iconPath || iconForNode(label, type)),
          isActive: true,
        },
      };
    });
};

const normalizeEdges = (input: any): Edge[] => {
  if (!Array.isArray(input)) return [];
  const seenEdgeIds = new Map<string, number>();
  const seenConnections = new Set<string>();

  const normalizeSourceHandle = (value: unknown): string => {
    const handle = String(value || '').toLowerCase();
    if (handle === 'top' || handle === 'top-source') return 'top-source';
    if (handle === 'left' || handle === 'left-source') return 'left-source';
    if (handle === 'right' || handle === 'right-source') return 'right-source';
    if (handle === 'bottom-target') return 'bottom';
    return 'bottom';
  };

  const normalizeTargetHandle = (value: unknown): string => {
    const handle = String(value || '').toLowerCase();
    if (handle === 'top' || handle === 'top-source') return 'top';
    if (handle === 'left' || handle === 'left-source') return 'left';
    if (handle === 'right' || handle === 'right-source') return 'right';
    if (handle === 'bottom' || handle === 'bottom-source' || handle === 'bottom-target') return 'bottom-target';
    return 'top';
  };

  const normalizeEdgeType = (value: unknown): string => {
    const edgeType = String(value || '').toLowerCase();
    if (edgeType === 'straight') return 'straight';
    if (edgeType === 'smoothstep') return 'smoothstep';
    return 'smoothstep';
  };

  return input
    .filter((e) => e && typeof e === 'object' && e.source != null && e.target != null)
    .map((e: any, idx: number) => {
      const source = String(e.source);
      const target = String(e.target);
      const sourceHandle = normalizeSourceHandle(e.sourceHandle);
      const targetHandle = normalizeTargetHandle(e.targetHandle);

      const baseId = String(e.id ?? `e-${source}-${target}-${idx}`);
      const dupCount = seenEdgeIds.get(baseId) ?? 0;
      seenEdgeIds.set(baseId, dupCount + 1);
      const uniqueId = dupCount === 0 ? baseId : `${baseId}-${dupCount}`;

      const signature = `${source}:${sourceHandle}->${target}:${targetHandle}`;
      if (seenConnections.has(signature)) {
        return null;
      }
      seenConnections.add(signature);

      return {
        ...edgeBase,
        ...e,
        type: normalizeEdgeType(e.type),
        id: uniqueId,
        source,
        target,
        sourceHandle,
        targetHandle,
      } as Edge;
    })
    .filter((e): e is Edge => Boolean(e));
};

const edgeSignature = (edge: Edge): string => {
  return `${String(edge.source)}:${edge.sourceHandle || 'bottom'}->${String(edge.target)}:${edge.targetHandle || 'top'}`;
};

const sanitizeGraph = (rawNodes: any, rawEdges: any): { nodes: Node[]; edges: Edge[] } => {
  const normalizedNodes = normalizeNodes(rawNodes);
  const nodeIdSet = new Set(normalizedNodes.map((n) => n.id));
  const normalizedEdges = normalizeEdges(rawEdges).filter(
    (e) => nodeIdSet.has(String(e.source)) && nodeIdSet.has(String(e.target)),
  );

  return {
    nodes: normalizedNodes,
    edges: normalizedEdges,
  };
};

const resolveNodeOverlaps = (nodes: Node[]): Node[] => {
  if (nodes.length <= 1) {
    return nodes;
  }

  const CARD_WIDTH = 230;
  const CARD_HEIGHT = 130;
  const GAP_X = 26;
  const GAP_Y = 20;
  const MAX_ITERATIONS = 12;
  const EPSILON = 0.01;

  const adjusted = nodes.map((node) => ({
    ...node,
    position: {
      x: Number(node.position?.x ?? 0),
      y: Number(node.position?.y ?? 0),
    },
  }));

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    let moved = false;

    for (let i = 0; i < adjusted.length; i += 1) {
      for (let j = i + 1; j < adjusted.length; j += 1) {
        const a = adjusted[i];
        const b = adjusted[j];

        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const overlapX = CARD_WIDTH + GAP_X - Math.abs(dx);
        const overlapY = CARD_HEIGHT + GAP_Y - Math.abs(dy);

        if (overlapX <= 0 || overlapY <= 0) {
          continue;
        }

        moved = true;

        if (overlapX < overlapY) {
          const push = overlapX / 2;
          if (dx >= 0) {
            a.position.x -= push;
            b.position.x += push;
          } else {
            a.position.x += push;
            b.position.x -= push;
          }
        } else {
          const push = overlapY / 2;
          if (dy >= 0) {
            a.position.y -= push;
            b.position.y += push;
          } else {
            a.position.y += push;
            b.position.y -= push;
          }
        }
      }
    }

    if (!moved) {
      break;
    }

    // Snap tiny floating-point drift to keep deterministic stable layout.
    for (const node of adjusted) {
      if (Math.abs(node.position.x) < EPSILON) node.position.x = 0;
      if (Math.abs(node.position.y) < EPSILON) node.position.y = 0;
    }
  }

  return adjusted;
};

const extractGraphPayload = (payload: any): { nodes: Node[]; edges: Edge[] } => {
  const candidate = payload?.graph || payload?.data || payload;
  return sanitizeGraph(candidate?.nodes, candidate?.edges);
};

interface EdgeRiskScore {
  edgeId: string;
  source: string;
  target: string;
  riskScore: number;
  reasons: string[];
}

interface NodeRiskScore {
  nodeId: string;
  label: string;
  riskScore: number;
  reasons: string[];
}

interface SyntheticSpan {
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  serviceName: string;
  operationName: string;
  startTimeMs: number;
  durationMs: number;
  status: 'ok' | 'error' | 'timeout';
  tags: Record<string, string>;
}

interface ArchitectureGrade {
  riskClass: string;
  letter: string;
  confidence: number;
  classProbabilities: Record<string, number>;
}

interface GhostTraceResult {
  graphHash: string;
  topologyEmbedding: number[];
  edgeRisks: EdgeRiskScore[];
  nodeRisks: NodeRiskScore[];
  overallRisk: number;
  predictedAnomalyClass: string;
  architectureGrade?: ArchitectureGrade | null;
  syntheticSpans: SyntheticSpan[];
  analysisNarrative: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  // What the workspace is currently editing. `projectId` is null for an unsaved
  // scratch canvas; everything that persists is gated on it being set.
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [projectId, setProjectId] = useState<string | null>(() => initialParams.get('project'));
  const [inviteToken] = useState<string | null>(() => initialParams.get('invite'));
  const [projectName, setProjectName] = useState('Untitled Architecture');
  const [isProjectLoading, setIsProjectLoading] = useState<boolean>(
    Boolean(initialParams.get('project') || initialParams.get('invite')),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  /**
   * The collaboration room is keyed on the project's immutable id, never on its
   * name: two people renaming a project must not end up in different rooms, and
   * two unrelated projects that happen to share a title must not end up in the
   * same one.
   */
  const [roomId, setRoomId] = useState<string>(() => {
    const pid = initialParams.get('project');
    return pid ? `infrazero-project-${pid}` : 'infrazero-scratch';
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [mode, setMode]                   = useState<'edit' | 'sim'>('edit');
  const [activeTab, setActiveTab]         = useState<'ai' | 'components'>('ai');
  const [terminalExpanded, setTerminalExpanded] = useState(false);
  const [aiPrompt, setAiPrompt]           = useState('');
  const [isGenerating, setIsGenerating]   = useState(false);
  const [linkCopied, setLinkCopied]       = useState(false);
  const [selectedNode, setSelectedNode]   = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge]   = useState<Edge | null>(null);
  const [logs, setLogs]                   = useState<string[]>([]);
  const reactFlowWrapper                  = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance]       = useState<any>(null);
  const [isImportPopupOpen, setIsImportPopupOpen] = useState(false);
  const [isRepoImportOpen, setIsRepoImportOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [ghostTraceRisks, setGhostTraceRisks] = useState<{ edgeRisks: EdgeRiskScore[]; nodeRisks: NodeRiskScore[] }>({
    edgeRisks: [],
    nodeRisks: [],
  });
  const [currentTick, setCurrentTick] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [chaosEvents, setChaosEvents] = useState<any[]>([]);
  const [killedNodes, setKilledNodes] = useState<Set<string>>(new Set());
  const [degradedNodes, setDegradedNodes] = useState<Set<string>>(new Set());
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [peerCursors, setPeerCursors] = useState<Map<number, { x: number; y: number; name: string; color: string }>>(new Map());
  const providerRef = useRef<any>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const isApplyingRemoteNodesRef = useRef(false);
  const isApplyingRemoteEdgesRef = useRef(false);
  const nodesCountRef = useRef(initialNodes.length);
  const edgesCountRef = useRef(initialEdges.length);
  const [iconSearch, setIconSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [categoryVisibleCounts, setCategoryVisibleCounts] = useState<Record<string, number>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const history = useGraphHistory({ nodes, edges, setNodes, setEdges });
  const filteredLibrary = useMemo(
    () => COMPONENT_LIBRARY
      .map((category) => ({
        ...category,
        items: category.items.filter((item) =>
          item.name.toLowerCase().includes(iconSearch.toLowerCase()),
        ),
      }))
      .filter((category) => category.items.length > 0),
    [iconSearch],
  );

  useEffect(() => {
    // Reset progressive rendering window when search changes to keep the panel snappy.
    setCategoryVisibleCounts({});
  }, [iconSearch]);

  useEffect(() => {
    nodesCountRef.current = nodes.length;
  }, [nodes.length]);

  useEffect(() => {
    edgesCountRef.current = edges.length;
  }, [edges.length]);

  const sendWsMessage = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  }, []);

  useEffect(() => {
    wsRef.current = new WebSocket(wsUrlFromEnv);
    wsRef.current.onopen = () => sendWsMessage({
      type: 'join_workspace', workspaceId: roomId, userId: `user-${Date.now()}`, userName: 'You'
    });
    wsRef.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'cursor_update') {
        setPeerCursors((prev) =>
          new Map(prev).set(Number(msg.userId), {
            x: msg.x,
            y: msg.y,
            name: msg.userName || 'Peer',
            color: msg.color || '#3b82f6',
          }),
        );
      }
      if (msg.type === 'node_moved') setNodes(nds => nds.map(n => n.id === msg.nodeId ? {...n, position: {x: msg.x, y: msg.y}} : n));
      if (msg.type === 'graph_updated') {
        const syncedGraph = sanitizeGraph(msg.nodes, msg.edges);
        if (syncedGraph.nodes.length === 0 && nodesCountRef.current > 0) {
          return;
        }
        setNodes(syncedGraph.nodes);
        setEdges(syncedGraph.edges);
      }
    };

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [roomId, sendWsMessage, setNodes, setEdges]);

  useEffect(() => {
    const { ydoc, provider } = initCollaboration(roomId);
    ydocRef.current = ydoc;
    providerRef.current = provider;

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    setLocalUser(provider, {
      name: getUser()?.name || 'Anonymous',
      color: randomColor,
    });

    provider.awareness.on('change', () => {
      const states = provider.awareness.getStates();
      const cursors = new Map<number, { x: number; y: number; name: string; color: string }>();
      states.forEach((state, clientId) => {
        if (clientId !== provider.awareness.clientID && state.cursor && state.user) {
          cursors.set(clientId, {
            x: state.cursor.x,
            y: state.cursor.y,
            name: state.user.name,
            color: state.user.color,
          });
        }
      });
      setPeerCursors(cursors);
    });

    const yNodes = ydoc.getArray('nodes');
    const yEdges = ydoc.getArray('edges');

    // Hydrate from shared doc if room already has state.
    if (yNodes.length > 0) {
      isApplyingRemoteNodesRef.current = true;
      setNodes(normalizeNodes(dedupeById(yNodes.toArray())));
    }
    if (yEdges.length > 0) {
      isApplyingRemoteEdgesRef.current = true;
      setEdges(normalizeEdges(dedupeById(yEdges.toArray())));
    }

    yNodes.observe((_, transaction) => {
      if (transaction.origin === 'local-nodes-sync') {
        return;
      }
      const remoteNodes = yNodes.toArray();
      if (remoteNodes.length === 0 && nodesCountRef.current > 0) {
        return;
      }
      isApplyingRemoteNodesRef.current = true;
      setNodes(normalizeNodes(dedupeById(remoteNodes)));
    });

    yEdges.observe((_, transaction) => {
      if (transaction.origin === 'local-edges-sync') {
        return;
      }
      const remoteEdges = yEdges.toArray();
      if (remoteEdges.length === 0 && edgesCountRef.current > 0) {
        return;
      }
      isApplyingRemoteEdgesRef.current = true;
      setEdges(normalizeEdges(dedupeById(remoteEdges)));
    });

    return () => destroyCollaboration();
  }, [roomId, setNodes, setEdges]);

  useEffect(() => {
    if (isApplyingRemoteNodesRef.current) {
      isApplyingRemoteNodesRef.current = false;
      return;
    }

    const ydoc = ydocRef.current;
    if (!ydoc || nodes.length === 0) return;
    if (nodes.some((node: any) => Boolean(node.dragging))) return;
    const yNodes = ydoc.getArray('nodes');
    ydoc.transact(() => {
      yNodes.delete(0, yNodes.length);
      yNodes.insert(0, nodes as any[]);
    }, 'local-nodes-sync');
  }, [nodes]);

  useEffect(() => {
    if (isApplyingRemoteEdgesRef.current) {
      isApplyingRemoteEdgesRef.current = false;
      return;
    }

    const ydoc = ydocRef.current;
    if (!ydoc) return;
    const yEdges = ydoc.getArray('edges');
    ydoc.transact(() => {
      yEdges.delete(0, yEdges.length);
      yEdges.insert(0, edges as any[]);
    }, 'local-edges-sync');
  }, [edges]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  /**
   * First sentence of a withheld-grade explanation, for a one-line terminal
   * entry. The full text belongs in the report, where there is room for it.
   */
  const shortReason = (reason: string | null | undefined): string => {
    if (!reason) return 'the model made no verdict.';
    const firstSentence = reason.split(/(?<=\.)\s/)[0];
    return firstSentence.length > 140 ? `${firstSentence.slice(0, 137)}...` : firstSentence;
  };

  /**
   * Name the components a line is about, without letting one line swallow the
   * terminal. A 56-component import can put every node in the same state.
   */
  const namesOf = (metrics: any[]): string => {
    const ids = metrics.map((m: any) => m.nodeId);
    if (ids.length <= 3) return ids.join(', ');
    return `${ids.slice(0, 3).join(', ')} and ${ids.length - 3} more`;
  };

  /**
   * One line of terminal output for one snapshot.
   *
   * Two things this gets from the data rather than assuming:
   *
   *   * the tick. Snapshots are recorded every tenth engine tick, so the array
   *     index is a tenth of the real tick and labelling with it understated
   *     every timestamp by 10x.
   *   * the reason. A component shedding work because its buffer is full and a
   *     component that lost a request to its own failure rate are different
   *     findings with different fixes, and printing both as "queue overflow"
   *     made a rare intrinsic failure read as a capacity problem.
   *
   * Engine states arrive snake_case (healthy | degraded | restarting | dead |
   * partitioned), which is why these compare lowercase -- the previous
   * uppercase comparisons never matched, so a dead component produced no line
   * at all.
   */
  const generateTickLog = (snapshot: any, index: number): string | null => {
    if (!snapshot) return null;
    const tick = Number(snapshot.tick ?? index);
    const metrics = snapshot.nodeMetrics || [];
    const stateOf = (m: any) => String(m.state || '').toLowerCase();

    const down = metrics.filter((m: any) => ['dead', 'partitioned'].includes(stateOf(m)));
    const saturated = metrics.filter((m: any) => m.isOverloaded);
    const failing = metrics.filter((m: any) => !m.isOverloaded && (m.errorRate || 0) > 0);
    const degraded = metrics.filter(
      (m: any) => ['degraded', 'restarting'].includes(stateOf(m)) && !m.isOverloaded,
    );

    if (down.length > 0) {
      return `[ERROR][Tick ${tick}] ${namesOf(down)} - unreachable, connections refused`;
    }
    if (saturated.length > 0) {
      const deepest = saturated.reduce(
        (worst: any, m: any) => ((m.queueDepth || 0) > (worst.queueDepth || 0) ? m : worst),
        saturated[0],
      );
      return `[ERROR][Tick ${tick}] ${namesOf(saturated)} - queue full (depth ${deepest.queueDepth || 0}), requests shed`;
    }
    if (failing.length > 0) {
      return `[WARN][Tick ${tick}] ${namesOf(failing)} - requests failing, queues within capacity`;
    }
    if (degraded.length > 0) {
      return `[WARN][Tick ${tick}] ${namesOf(degraded)} - degraded, elevated latency`;
    }
    if (tick % 500 === 0) {
      const totalReqs = metrics.reduce((sum: number, m: any) => sum + (m.requestsReceived || 0), 0);
      return `[INFO][Tick ${tick}] System nominal - ${totalReqs} requests processed this window`;
    }
    return null;
  };

  useEffect(() => {
    if (!simulationComplete || snapshots.length === 0) return;
    setIsSimulating(true);
    setCurrentTick(0);
    let tick = 0;
    // A component that saturates stays saturated for the rest of the run, so
    // the same finding would otherwise be printed on every snapshot and bury
    // everything else. Print it when it starts, and once in a while while it
    // persists, rather than hundreds of times.
    let lastFinding = '';
    let snapshotsSinceLast = 0;
    const interval = setInterval(() => {
      tick += 1;
      setCurrentTick(tick);
      const snapshot = snapshots[tick];
      const tickLog = generateTickLog(snapshot, tick);
      if (tickLog) {
        // Key on the finding itself: no tick prefix, and no digits, so a queue
        // depth drifting between 95 and 97 still reads as the same finding.
        const finding = tickLog.replace(/^\[[^\]]+\]\[Tick \d+\]\s*/, '').replace(/\d+/g, '#');
        snapshotsSinceLast += 1;
        if (finding !== lastFinding || snapshotsSinceLast >= 50) {
          setLogs(prev => [...prev, tickLog]);
          lastFinding = finding;
          snapshotsSinceLast = 0;
        }
      } else {
        lastFinding = '';
      }
      if (tick >= snapshots.length - 1) {
        clearInterval(interval);
        setIsSimulating(false);
        // Snapshots are every tenth engine tick, so their count is not a tick
        // count. Report the last tick the engine actually reached.
        const lastTick = Number((snapshots[snapshots.length - 1] as any)?.tick ?? snapshots.length);
        setLogs(prev => [...prev, `[SYSTEM] Simulation complete. ${lastTick} ticks analysed.`]);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [simulationComplete, snapshots]);

  const duplicateNode = useCallback((nodeId: string) => {
    const node = nodes.find((n) => String(n.id) === String(nodeId));
    if (!node) return;

    const newNode: Node = {
      ...node,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      selected: false,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: { ...(node.data || {}) },
    };

    setNodes((nds) => [...nds, newNode]);
    setContextMenu(null);
  }, [nodes, setNodes]);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => String(n.id) !== String(nodeId)));
    setEdges((eds) => eds.filter((e) => String(e.source) !== String(nodeId) && String(e.target) !== String(nodeId)));
    setContextMenu(null);
  }, [setNodes, setEdges]);

  const handleSelectAll = useCallback(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
    setContextMenu(null);
  }, [setNodes]);

  const handleClearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setContextMenu(null);
  }, [setNodes, setEdges]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement?.tagName;
      if (active === 'INPUT' || active === 'TEXTAREA') return;

      const modifier = e.ctrlKey || e.metaKey;

      // Undo/redo. Ctrl+Y is the Windows convention, Ctrl+Shift+Z the portable one.
      if (modifier && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (modifier && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        history.redo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedIds = nodes.filter((n) => n.selected).map((n) => String(n.id));
        const selectedEdgeIds = edges.filter((edge) => edge.selected).map((edge) => String(edge.id));
        if (selectedIds.length === 0 && selectedEdgeIds.length === 0) return;

        if (selectedIds.length > 0) {
          setNodes((nds) => nds.filter((n) => !selectedIds.includes(String(n.id))));
        }
        setEdges((eds) => eds.filter((edge) =>
          !selectedEdgeIds.includes(String(edge.id))
          && !selectedIds.includes(String(edge.source))
          && !selectedIds.includes(String(edge.target))));
      }

      if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const selected = nodes.filter((n) => n.selected);
        if (selected.length === 0) return;

        const duplicates: Node[] = selected.map((n) => ({
          ...n,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          position: { x: n.position.x + 40, y: n.position.y + 40 },
          selected: false,
          data: { ...(n.data || {}) },
        }));
        setNodes((nds) => [...nds, ...duplicates]);
      }

      if (e.key.toLowerCase() === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
      }

      if (e.key === 'Escape') {
        setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
        setContextMenu(null);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nodes, edges, setNodes, setEdges, history]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        normalizeEdges(
          addEdge(
            {
              ...params,
              id: `e-${params.source}-${params.target}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'smoothstep',
              style: { stroke: 'rgba(148,163,184,0.75)', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 20, height: 20 },
              animated: mode === 'sim',
            },
            eds,
          ),
        ),
      );
    },
    [setEdges, mode],
  );

  useEffect(() => {
    const deduped = normalizeEdges(edges);
    const hasLengthChange = deduped.length !== edges.length;
    const hasIdChange = !hasLengthChange && deduped.some((edge, idx) => edge.id !== edges[idx]?.id);
    const hasShapeChange = !hasLengthChange && !hasIdChange && deduped.some((edge, idx) => edgeSignature(edge) !== edgeSignature(edges[idx] as Edge));

    if (hasLengthChange || hasIdChange || hasShapeChange) {
      setEdges(deduped);
    }
  }, [edges, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

  /**
   * Write one field of a node's data and keep the inspector's copy in step.
   *
   * The inspector previously rendered `defaultValue` inputs with no onChange,
   * so every control in it was decorative -- nothing it showed was ever read
   * back by the analysis. These two writers are what make it real.
   */
  const updateNodeData = useCallback((nodeId: string, patch: Record<string, unknown>) => {
    setNodes((nds) => nds.map((node) => (
      String(node.id) === String(nodeId)
        ? { ...node, data: { ...(node.data || {}), ...patch } }
        : node
    )));
    setSelectedNode((current) => (
      current && String(current.id) === String(nodeId)
        ? { ...current, data: { ...(current.data || {}), ...patch } }
        : current
    ));
  }, [setNodes]);

  const updateEdgeCallKind = useCallback((edgeId: string, callKind: 'read' | 'write' | 'async' | undefined) => {
    setEdges((eds) => eds.map((edge) => {
      if (String(edge.id) !== String(edgeId)) return edge;
      const next: Record<string, unknown> = { ...edge };
      if (callKind) next.callKind = callKind;
      else delete next.callKind;
      // An async handoff is drawn as a dashed line: the caller does not wait,
      // and that is worth seeing on the canvas rather than only in a panel.
      next.animated = callKind === 'async';
      return next as Edge;
    }));
    setSelectedEdge((current) => {
      if (!current || String(current.id) !== String(edgeId)) return current;
      const next: Record<string, unknown> = { ...current };
      if (callKind) next.callKind = callKind;
      else delete next.callKind;
      next.animated = callKind === 'async';
      return next as Edge;
    });
  }, [setEdges]);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    // Select it too, so the menu's target is unambiguous on screen.
    setNodes((nds) => nds.map((n) => ({ ...n, selected: String(n.id) === String(node.id) })));
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId: String(node.id),
    });
  }, [setNodes]);

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  // Without this the menu only closed on mouse-leave, so clicking elsewhere on
  // the canvas left it hanging over the graph.
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
    };
  }, [contextMenu]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!rfInstance) return;
      const type = e.dataTransfer.getData('application/reactflow') || 'custom';
      const rawPayload = e.dataTransfer.getData('application/json');
      if (!rawPayload) return;

      let componentData: { name?: string; type?: string; icon?: string; iconPath?: string };
      try {
        componentData = JSON.parse(rawPayload);
      } catch {
        return;
      }

      const position = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });

      const nodeType = componentData.type === 'group' ? 'group' : type;
      const resolvedLabel = componentData.name || 'Service';
      const resolvedKind = componentData.type || 'Node Service';
      const resolvedIcon = normalizeIconPath(componentData.icon || componentData.iconPath || iconForNode(resolvedLabel, resolvedKind));

      setNodes((nds) =>
        nds.concat({
          id: `${Date.now()}`,
          type: nodeType,
          position,
          ...(nodeType === 'group' ? { style: { width: 300, height: 200 } } : {}),
          data: {
            label: resolvedLabel,
            type: resolvedKind,
            iconPath: resolvedIcon,
            isActive: false,
          },
        }),
      );
    },
    [rfInstance, setNodes],
  );

  const onDragStart = (e: React.DragEvent, component: LibraryItem) => {
    e.dataTransfer.setData('application/reactflow', 'custom');
    e.dataTransfer.setData('application/json', JSON.stringify({
      name: component.name,
      type: component.type,
      iconPath: normalizeIconPath(component.iconPath),
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleNodeLabelChange = useCallback((nodeId: string, label: string) => {
    setNodes((nds) => nds.map((node) => (
      String(node.id) === String(nodeId)
        ? { ...node, data: { ...(node.data || {}), label } }
        : node
    )));
  }, [setNodes]);

  const handleGenerate = async () => {
    if (!getUser()) {
      setLogs(prev => [...prev, '[AUTH] Please sign in to use AI generation.']);
      setTerminalExpanded(true);
      return;
    }

    if (isTemporaryGuest()) {
      setLogs(prev => [...prev, '[GUEST] AI generation requires authenticated account.']);
      setTerminalExpanded(true);
      return;
    }

    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const response = await authFetch('/api/ai/generate', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      if (!response.ok) throw new Error('AI generation failed');
      const responsePayload = await response.json();
      const graph = extractGraphPayload(responsePayload);

      if (graph.nodes.length === 0) {
        setLogs((prev) => [...prev, '[AI] No nodes generated. Try a more specific prompt.']);
        setTerminalExpanded(true);
        return;
      }

      setNodes(graph.nodes);
      setEdges(graph.edges);
      setLogs((prev) => [...prev, `[AI] Generated ${graph.nodes.length} nodes and ${graph.edges.length} edges.`]);
      setTerminalExpanded(true);
      setTimeout(() => rfInstance?.fitView?.({ padding: 0.2, duration: 500 }), 50);

      sendWsMessage({ type: 'graph_replace', workspaceId: roomId, nodes: graph.nodes, edges: graph.edges });
      setAiPrompt('');
    } catch (err) {
      setLogs((prev) => [...prev, `[AI ERROR] ${err instanceof Error ? err.message : 'Unknown generation error'}`]);
      setTerminalExpanded(true);
      console.error('[AI Generate Error]', err);
    } finally {
      setIsGenerating(false);
    }
  };

  /** Point the workspace at a saved project and put its id in the URL. */
  /**
   * The single in-flight creation of this canvas's project row, shared by every
   * caller that needs one. See `handleSaveProject`.
   */
  const projectCreationRef = useRef<Promise<string> | null>(null);

  const adoptProject = useCallback((id: string, title: string) => {
    setProjectId(id);
    setProjectName(title);
    setRoomId(`infrazero-project-${id}`);
    const url = new URL(window.location.href);
    url.searchParams.set('project', id);
    url.searchParams.delete('invite');
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  }, []);

  /**
   * Loads the project named in the URL - either directly by id, or via an invite
   * token when a collaborator followed a share link.
   */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        if (inviteToken) {
          const invite = await api.resolveInvite(inviteToken);
          if (cancelled) return;
          const graph = sanitizeGraph(invite.nodes || [], invite.edges || []);
          setNodes(graph.nodes);
          setEdges(graph.edges);
          history.reset(graph.nodes, graph.edges);
          setProjectId(invite.id);
          setProjectName(invite.title);
          setRoomId(invite.roomId);
          setLogs((prev) => [...prev, `[COLLAB] Joined "${invite.title}" as a collaborator.`]);
          setTimeout(() => rfInstance?.fitView?.({ padding: 0.2, duration: 400 }), 80);
          return;
        }

        const id = initialParams.get('project');
        if (!id) return;

        const project = await api.getProject(id);
        if (cancelled) return;
        const graph = sanitizeGraph(project.nodes || [], project.edges || []);
        setNodes(graph.nodes);
        setEdges(graph.edges);
        history.reset(graph.nodes, graph.edges);
        setProjectName(project.title);
        setRoomId(`infrazero-project-${project.id}`);
        setTimeout(() => rfInstance?.fitView?.({ padding: 0.2, duration: 400 }), 80);
      } catch (err) {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : 'Could not open that project.');
      } finally {
        if (!cancelled) setIsProjectLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
    // Runs once for the id/token the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Persists the current graph. Creates the project first if this is a scratch canvas. */
  const handleSaveProject = useCallback(async (options: { silent?: boolean } = {}) => {
    if (isTemporaryGuest()) {
      if (!options.silent) toast.error('Sign in to save your work.');
      return null;
    }

    // A transient empty canvas - a load that failed, a collaboration sync that
    // arrived empty - must never overwrite a saved graph. Clearing a project on
    // purpose still saves, but only when the user asked for it explicitly.
    if (nodes.length === 0 && projectId) {
      if (options.silent) {
        return projectId;
      }
      const confirmed = window.confirm(
        'This saves an empty architecture and replaces the components currently stored for this project. Continue?',
      );
      if (!confirmed) {
        return projectId;
      }
    }

    setIsSaving(true);
    try {
      let id = projectId;
      if (!id) {
        // Two callers can arrive here at once: Run Sim saves silently before it
        // runs, and an explicit Save or a share can still be in flight. Both
        // would read the same null projectId and create a row of their own,
        // leaving a duplicate on the dashboard. They share one creation
        // instead, and the promise is cleared on failure so a later attempt can
        // still try.
        if (!projectCreationRef.current) {
          projectCreationRef.current = api
            .createProject(projectName)
            .then((created) => {
              adoptProject(created.id, projectName);
              return created.id;
            })
            .catch((err) => {
              projectCreationRef.current = null;
              throw err;
            });
        }
        id = await projectCreationRef.current;
      }
      await api.saveProjectGraph(id, nodes, edges);
      setLastSavedAt(Date.now());
      if (!options.silent) toast.success('Project saved.');
      return id;
    } catch (err) {
      if (!options.silent) toast.error(err instanceof Error ? err.message : 'Could not save the project.');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [projectId, projectName, nodes, edges, adoptProject]);

  /** Commits a rename. The room id is unaffected, so live sessions survive it. */
  const commitProjectName = useCallback(async (nextName: string) => {
    const trimmed = nextName.trim();
    setIsEditingName(false);
    if (!trimmed || trimmed === projectName) {
      setProjectName(projectName);
      return;
    }
    setProjectName(trimmed);

    if (!projectId || isTemporaryGuest()) return;
    try {
      await api.renameProject(projectId, trimmed);
      toast.success('Project renamed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not rename the project.');
    }
  }, [projectId, projectName]);

  /**
   * Issues a real, server-minted invite link.
   *
   * A scratch canvas has no project row to share, so it is saved first - a link
   * to an unsaved graph would open an empty workspace for the recipient.
   */
  const handleShareClick = async () => {
    if (isTemporaryGuest()) {
      toast.error('Sign in to share a project for live collaboration.');
      return;
    }

    // Routed through the ordinary save rather than creating a row of its own.
    // A second creation path is a second way to end up with two projects for
    // one canvas, which is exactly what used to happen.
    let id = projectId;
    if (!id) {
      id = await handleSaveProject({ silent: true });
      if (!id) {
        toast.error('Could not save the project, so there is nothing to share yet.');
        return;
      }
      toast.success('Project saved so it can be shared.');
    }

    try {
      const { inviteLink } = await api.createInviteLink(id);
      await navigator.clipboard.writeText(inviteLink).catch(() => {
        // Clipboard is unavailable on insecure origins; show the link instead.
        window.prompt('Copy this invite link:', inviteLink);
      });
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      toast.success('Invite link copied. Anyone with it can edit live.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create an invite link.');
    }
  };

  const handleKillNode = (nodeId: string) => {
    setChaosEvents(prev => [...prev, {
      event_id: `kill-${nodeId}-${Date.now()}`,
      kind: 'KillNode',
      target_node: nodeId,
      target_edge: null,
      trigger_tick: 30,
      duration_ticks: null,
      intensity: 1.0,
      partition_group_a: null,
      partition_group_b: null,
      random_target_pct: null,
    }]);
    setKilledNodes(prev => new Set([...prev, nodeId]));
    setLogs(prev => [...prev, `[CHAOS] Node '${nodeId}' scheduled for kill at tick 30`]);
  };

  const handleDegradeNode = (nodeId: string) => {
    setChaosEvents(prev => [...prev, {
      event_id: `degrade-${nodeId}-${Date.now()}`,
      kind: 'DegradeNode',
      target_node: nodeId,
      target_edge: null,
      trigger_tick: 20,
      duration_ticks: 200,
      intensity: 0.5,
      partition_group_a: null,
      partition_group_b: null,
      random_target_pct: null,
    }]);
    setDegradedNodes(prev => new Set([...prev, nodeId]));
    setLogs(prev => [...prev, `[CHAOS] Node '${nodeId}' will be degraded from tick 20`]);
  };

  const handleResetChaos = () => {
    setChaosEvents([]);
    setKilledNodes(new Set());
    setDegradedNodes(new Set());
    setLogs(prev => [...prev, '[CHAOS] All chaos events cleared.']);
  };

  const [applyingRecommendationId, setApplyingRecommendationId] = useState<string | null>(null);

  /**
   * Apply one recommendation to the canvas, then re-run the analysis.
   *
   * The edits mirror the intervention catalogue the model scored in
   * `recommend.py` -- a cache absorbing the reads into a store, a shared store
   * split per consumer, a synchronous call replaced by a queue hop, a replica
   * behind a balancer, a cycle-closing edge removed. They have to match, or the
   * change the user applies is not the change that was ranked.
   *
   * The re-run is the point. A ranking whose absolute numbers are not
   * predictions is still useful if you can test it in one click and watch the
   * ordering move.
   */
  const handleApplyChange = useCallback((recommendationId: string) => {
    const recommendation = (simulationResult?.recommendations ?? [])
      .find((item: { id: string }) => item.id === recommendationId);
    if (!recommendation?.kind) return;

    const targets: string[] = (recommendation.targetNodeIds ?? []).map(String);
    if (targets.length === 0) return;

    const labelOf = (nodeId: string): string => {
      const found = nodes.find((n) => String(n.id) === nodeId);
      return String((found?.data as { label?: string } | undefined)?.label ?? nodeId);
    };

    let nextNodes: Node[] = nodes.map((n) => ({ ...n }));
    let nextEdges: Edge[] = edges.map((e) => ({ ...e }));
    const stamp = Date.now();
    const primary = targets[0];

    const positionNear = (nodeId: string, dx: number, dy: number) => {
      const anchor = nodes.find((n) => String(n.id) === nodeId);
      return {
        x: (anchor?.position?.x ?? 0) + dx,
        y: (anchor?.position?.y ?? 0) + dy,
      };
    };

    if (recommendation.kind === 'add_cache') {
      const cacheId = `cache-${stamp}`;
      nextNodes.push({
        id: cacheId,
        type: 'custom',
        position: positionNear(primary, -180, -60),
        data: { label: `Cache for ${labelOf(primary)}`, type: 'Cache', isActive: true },
      } as Node);
      nextEdges = nextEdges.map((edge) => (
        String(edge.target) === primary
          ? { ...edge, target: cacheId, id: `${edge.id}-via-cache` }
          : edge
      ));
      nextEdges.push({ id: `e-${cacheId}-${primary}`, source: cacheId, target: primary, callKind: 'read' } as Edge);
    } else if (recommendation.kind === 'partition_database') {
      const callers = edges.filter((e) => String(e.target) === primary);
      nextEdges = nextEdges.filter((e) => String(e.target) !== primary);
      callers.forEach((caller, index) => {
        if (index === 0) {
          nextEdges.push({ ...caller });
          return;
        }
        const shardId = `shard-${stamp}-${index}`;
        nextNodes.push({
          id: shardId,
          type: 'custom',
          position: positionNear(primary, index * 220, 130),
          data: { label: `${labelOf(primary)} shard ${index}`, type: 'PostgreSQL', isActive: true },
        } as Node);
        nextEdges.push({ id: `e-${caller.source}-${shardId}`, source: caller.source, target: shardId } as Edge);
      });
    } else if (recommendation.kind === 'decouple_with_queue' && targets.length >= 2) {
      const [source, target] = targets;
      const queueId = `queue-${stamp}`;
      nextNodes.push({
        id: queueId,
        type: 'custom',
        position: positionNear(target, -160, -70),
        data: { label: `Queue ${labelOf(source)} to ${labelOf(target)}`, type: 'RabbitMQ', isActive: true },
      } as Node);
      nextEdges = nextEdges.filter((e) => !(String(e.source) === source && String(e.target) === target));
      nextEdges.push({ id: `e-${source}-${queueId}`, source, target: queueId, callKind: 'async', animated: true } as Edge);
      nextEdges.push({ id: `e-${queueId}-${target}`, source: queueId, target } as Edge);
    } else if (recommendation.kind === 'replicate') {
      // The canvas already models a replicated tier as an instance count, which
      // is both truer to how these are deployed and something the simulator
      // reads directly -- so this raises `replicas` rather than drawing a
      // second box and a balancer beside it.
      nextNodes = nextNodes.map((node) => {
        if (String(node.id) !== primary) return node;
        const current = Number((node.data as { replicas?: number })?.replicas ?? 1);
        return { ...node, data: { ...(node.data || {}), replicas: Math.max(2, current + 1) } };
      });
    } else if (recommendation.kind === 'break_cycle' && targets.length >= 2) {
      const [source, target] = targets;
      nextEdges = nextEdges.filter((e) => !(String(e.source) === source && String(e.target) === target));
    } else {
      toast.error('That change cannot be applied to the canvas automatically.');
      return;
    }

    setApplyingRecommendationId(recommendationId);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setLogs((prev) => [...prev, `[APPLY] ${recommendation.title} - re-running analysis...`]);

    void handleDeployTest({ nodes: nextNodes, edges: nextEdges })
      .finally(() => setApplyingRecommendationId(null));
    // handleDeployTest is declared below and is stable for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulationResult, nodes, edges, setNodes, setEdges]);

  const handleDeployTest = async (
    override?: { nodes: Node[]; edges: Edge[] },
  ) => {
    if (isTemporaryGuest()) {
      setLogs(prev => [...prev, '[GUEST] Simulation run requires authenticated account.']);
      setTerminalExpanded(true);
      return;
    }

    setMode('sim');
    setTerminalExpanded(true);
    setSimulationComplete(false);
    setIsSimulating(false);
    setCurrentTick(0);
    setSnapshots([]);
    setLogs(['[SYSTEM] Initializing simulation engine...']);
    try {
      // An applied recommendation passes its mutated graph in directly: React
      // state has not committed yet at that point, so reading `nodes` here
      // would re-run the analysis on the graph as it was before the change.
      const sourceNodes = override?.nodes ?? nodes;
      const sourceEdges = override?.edges ?? edges;
      const cleanGraph = sanitizeGraph(sourceNodes, sourceEdges);
      if (cleanGraph.nodes.length !== sourceNodes.length || cleanGraph.edges.length !== sourceEdges.length) {
        setNodes(cleanGraph.nodes);
        setEdges(cleanGraph.edges);
        setLogs((prev) => [
          ...prev,
          '[SANITIZER] Invalid or duplicate graph entries were removed before simulation.',
        ]);
      }

      if (cleanGraph.nodes.length === 0) {
        setLogs((prev) => [
          ...prev,
          '[ERROR] There are no components on the canvas to simulate. Add components, or reopen the project if it failed to load.',
        ]);
        setSimulationComplete(true);
        return;
      }

      // Saving first means the run is attributed to a real project row, which is
      // what allows the report to be reopened and exported later.
      const savedProjectId = await handleSaveProject({ silent: true });

      const payload: Record<string, unknown> = {
        nodes: cleanGraph.nodes,
        edges: cleanGraph.edges,
        chaosEnabled: chaosEvents.length > 0,
        chaosEvents,
        projectId: savedProjectId ?? projectId,
        projectName,
      };

      const response = await authFetch('/api/simulations/run', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Simulation failed: ${response.statusText}`);
      const result = await response.json();
      setSnapshots(result.snapshots || []);

      const intelligence = result.intelligence ?? {};
      const nodeFindings = intelligence.nodeFindings ?? [];
      const edgeFindings = intelligence.edgeFindings ?? [];

      setLogs(prev => [
        ...prev,
        '[SYSTEM] Simulation engine initialized.',
        `[INFO] Universe Seed: ${result.universeSeed}`,
        `[HASH] Stable hash: ${result.stableHash?.slice(0, 16)}...`,
        `[INFO] Processing ${result.metrics?.totalRequests?.toLocaleString() ?? 0} requests...`,
        intelligence.model
          ? `[MODEL] ${intelligence.model.riskClass} risk at ${(intelligence.model.confidence * 100).toFixed(0)}% confidence.`
          : '[MODEL] Inference server unreachable - report falls back to rule-based analysis.',
        `[ANALYSIS] ${intelligence.predictedFailureMode ?? 'No failure mode predicted'}.`,
        // The simulation reports what it measures. It no longer issues a letter
        // of its own: two letters from two graders disagreed in the same log.
        `[SIM] Simulated resilience ${result.simulatedResilienceScore ?? 0}/100 at the load this run used.`,
        result.grade
          ? `[RESULT] Grade ${result.grade}, ${result.recommendations?.length ?? 0} recommendations.`
          : `[RESULT] Grade withheld - ${shortReason(result.gradeWithheldReason)} ${result.recommendations?.length ?? 0} recommendations still apply.`,
      ]);

      // The architecture analysis now arrives with the simulation, so the canvas
      // risk shading is fed from the same run rather than a separate pass.
      setGhostTraceRisks({
        edgeRisks: edgeFindings.map((finding: any) => ({
          edgeId: finding.edgeId,
          source: finding.source,
          target: finding.target,
          riskScore: finding.riskScore,
          reasons: finding.reasons ?? [],
        })),
        nodeRisks: nodeFindings.map((finding: any) => ({
          nodeId: finding.nodeId,
          label: finding.label,
          riskScore: finding.riskScore,
          reasons: finding.reasons ?? [],
        })),
      });
      setNodes(nds => nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          ghostRisk: nodeFindings.find((finding: any) => finding.nodeId === node.id)?.riskScore,
        },
      })));

      setSimulationResult(result);
      setEdges(eds => eds.map(e => ({ ...e, animated: true })));
      setSimulationComplete(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setLogs(prev => [...prev, `[ERROR] ${msg}`]);
      setSimulationComplete(true);
    }
  };

  /**
   * Dashboard deep links: `?run=1` starts a simulation as soon as the project's
   * graph has loaded, `?report=1` opens the most recent stored report.
   */
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || isProjectLoading) return;

    const wantsRun = initialParams.get('run') === '1';
    const wantsReport = initialParams.get('report') === '1';
    if (!wantsRun && !wantsReport) return;

    deepLinkHandled.current = true;

    const url = new URL(window.location.href);
    url.searchParams.delete('run');
    url.searchParams.delete('report');
    window.history.replaceState({}, '', url.toString());

    if (wantsRun) {
      if (nodes.length === 0) {
        toast.error('This project has no components to simulate yet.');
        return;
      }
      void handleDeployTest();
      return;
    }

    if (!projectId) return;
    api
      .getLatestReport(projectId)
      .then((report) => {
        setSimulationResult(report);
        setIsReportOpen(true);
      })
      .catch(() => toast.error('No report yet - run a simulation first.'));
    // Fires once, after the project finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProjectLoading, nodes.length]);

  /**
   * Load an imported architecture onto the canvas.
   *
   * Shared by both import paths. `source` only changes what the terminal says --
   * it used to be hard-coded to the vision importer, which meant a repository
   * import reported "Vision API analysis complete" and gave the user no way to
   * tell which path had actually run.
   */
  const handleImportDiagram = (
    importedNodes: any[],
    importedEdges: any[],
    source: 'vision' | 'repository' = 'vision',
  ) => {
    const importedGraph = sanitizeGraph(importedNodes, importedEdges);
    const separatedNodes = resolveNodeOverlaps(importedGraph.nodes);
    setNodes(separatedNodes.map((node) => ({
      ...node,
      data: { ...node.data, isActive: false },
    })));
    setEdges(importedGraph.edges);
    setTimeout(() => rfInstance?.fitView?.({ padding: 0.2, duration: 500 }), 50);

    setTerminalExpanded(true);
    // Instance counts only arrive from a repository, and they change the
    // analysis, so the terminal states whether any were recovered.
    const replicated = importedGraph.nodes.filter(
      (node: any) => Number(node.data?.replicas ?? 1) > 1,
    ).length;
    const importLogs = [
      source === 'repository'
        ? '[IMPORT] Repository manifests parsed'
        : '[IMPORT] Vision API analysis complete',
      `[GRAPH] Loaded ${importedGraph.nodes.length} components and ${importedGraph.edges.length} flows`,
      ...(source === 'repository'
        ? [replicated > 0
            ? `[SCALE] ${replicated} components declare more than one instance`
            : '[SCALE] No instance counts declared; every component analysed as a single instance']
        : []),
      '[READY] Workspace re-synchronized',
    ];
    setLogs(importLogs);
  };

  return (
    <div className="h-screen flex flex-col relative overflow-hidden" style={{ backgroundColor: '#0a0a0f', fontFamily: 'Inter, sans-serif' }}>

      {/* ── HEADER ── */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b relative z-20 backdrop-blur-md bg-black/40 border-white/5"
        style={{ height: '52px' }}
      >
        <div className="h-full px-5 flex items-center">
          {/* Left: Project Branding */}
          <div className="flex items-center gap-3 shrink-0">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/10 border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.15)]"
              onClick={() => window.location.href = '/dashboard'}
              style={{ cursor: 'pointer' }}
            >
               <Zap size={20} className="text-blue-500" />
            </div>
            
            <div>
              {isEditingName ? (
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onBlur={(e) => void commitProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitProjectName((e.target as HTMLInputElement).value);
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  maxLength={120}
                  autoFocus
                  className="bg-transparent border-b border-blue-500 outline-none text-white font-bold text-lg tracking-tight w-[280px]"
                />
              ) : (
                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingName(true)}>
                  <span className="text-white text-lg font-bold tracking-tight">{projectName}</span>
                  <Edit3 size={14} className="text-zinc-500 group-hover:text-blue-400 transition-colors" />
                </div>
              )}
              <div className="mt-0.5 text-[10px] font-mono font-bold tracking-[0.2em] text-blue-500/60 flex items-center gap-2 uppercase">
                <div className={`w-1 h-1 rounded-full ${mode === 'sim' ? 'bg-blue-500 animate-pulse' : 'bg-zinc-700'}`} />
                {mode === 'sim'
                  ? 'Engine Hot_ Replications Running'
                  : isSaving
                    ? 'Saving...'
                    : lastSavedAt
                      ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}`
                      : projectId
                        ? 'Saved project'
                        : 'Unsaved draft'}
              </div>
            </div>
          </div>

          {/* Center: Mode Switch (Glassmorphism) */}
          <div className="flex-1 flex justify-center">
          <div className="p-1 bg-zinc-900/60 rounded-2xl border border-white/5 flex gap-1 shadow-2xl">
            {(['edit', 'sim'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-5 py-1.5 rounded-xl text-[10px] font-bold transition-all uppercase tracking-widest ${
                  mode === m ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'text-zinc-500 hover:text-white'
                }`}
              >
                {m === 'edit' ? 'Architect' : 'Simulator'}
              </button>
            ))}
          </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleShareClick}
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
                >
                  {linkCopied ? <Check size={14} className="text-blue-400" /> : <Share2 size={14} />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-zinc-900 text-zinc-100">
                {linkCopied ? 'Link copied' : 'Share'}
              </TooltipContent>
            </Tooltip>

            <div className="flex items-center gap-1">
              {Array.from(peerCursors.entries()).map(([clientId, peer]) => (
                <div
                  key={clientId}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2 border-black"
                  style={{ backgroundColor: peer.color }}
                  title={peer.name}
                >
                  {peer.name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => void handleSaveProject()}
                  disabled={isSaving}
                  className="h-9 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-white/80 hover:text-white hover:bg-white/10 transition-all text-[10px] font-bold uppercase tracking-wide disabled:opacity-40"
                >
                  <Save size={14} />
                  {isSaving ? 'Saving' : 'Save'}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-zinc-900 text-zinc-100">
                Save this architecture to your projects
              </TooltipContent>
            </Tooltip>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDeployTest}
              className="iz-btn-blue relative overflow-hidden py-2 px-5 rounded-xl text-white font-bold text-xs shadow-xl transition-all"
            >
              DEPLOY & TEST
            </motion.button>

          </div>
        </div>
      </motion.header>

      {/* ── BODY ── */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        
        {/* Left Sidebar: AI & Components (Glassmorphism) */}
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.aside
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="w-[280px] border-r border-white/5 bg-zinc-950/40 backdrop-blur-3xl flex flex-col relative z-20"
            >
              <div className="flex border-b border-white/5">
                {(['ai', 'components'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-4 text-[10px] font-bold tracking-[0.2em] uppercase transition-colors relative ${
                      activeTab === tab ? 'text-blue-500' : 'text-zinc-600 hover:text-zinc-400'
                    }`}
                  >
                    {tab === 'ai' ? 'AI Generate' : 'Shapes'}
                    {activeTab === tab && (
                      <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]" />
                    )}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {activeTab === 'ai' ? (
                  <div className="space-y-6">
                    {/*
                      Ordered by how much the analysis can actually trust the
                      input, not by how impressive it looks.

                      A repository carries instance counts, real wiring and
                      resilience configuration, and never goes stale. A picture
                      of a diagram carries none of those, so it sits last with
                      the caveat attached rather than presented as an equal.
                    */}
                    <div>
                      <motion.button
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setIsRepoImportOpen(true)}
                        className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-blue-500 text-white font-bold text-sm shadow-xl shadow-blue-500/20 hover:bg-blue-600 transition-all"
                      >
                        <GitBranch size={18} />
                        IMPORT FROM REPOSITORY
                      </motion.button>
                      <p className="mt-2 px-1 text-[10px] text-zinc-600 leading-relaxed">
                        Reads your manifests: components, wiring, and instance counts.
                      </p>
                    </div>

                    <div className="pt-5 border-t border-white/5 space-y-3">
                      <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                        Or start from nothing
                      </div>
                      <div className="relative">
                        <textarea
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          placeholder={'Enter technical prompt...\ne.g. "Microservices with distributed cache"'}
                          className="w-full bg-black/40 border border-white/10 rounded-[20px] p-5 resize-none outline-none text-white text-sm font-medium tracking-tight placeholder:text-zinc-700 focus:border-blue-500/50 transition-all custom-scrollbar"
                          rows={5}
                        />
                        <div className="absolute right-4 bottom-4 text-[9px] font-mono text-zinc-700 tracking-wider font-bold">ALPHA_v0.9</div>
                      </div>

                      <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="w-full flex items-center justify-center gap-3 py-3 rounded-2xl border border-white/10 bg-white/5 text-zinc-300 font-bold text-sm hover:text-white hover:bg-white/10 transition-all"
                      >
                        <Sparkles size={16} className={isGenerating ? 'animate-spin' : ''} />
                        {isGenerating ? 'COMPUTING...' : 'GENERATE TOPOLOGY'}
                      </button>
                    </div>

                    <div className="pt-5 border-t border-white/5">
                      <button
                        onClick={() => setIsImportPopupOpen(true)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/5 text-zinc-500 font-bold text-xs hover:text-zinc-300 hover:bg-white/5 transition-all"
                      >
                        <FileImage size={14} />
                        IMPORT DIAGRAM IMAGE
                      </button>
                      <p className="mt-2 px-1 text-[10px] text-zinc-600 leading-relaxed">
                        A picture cannot state instance counts or call types, so everything
                        is treated as one synchronous instance.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <input
                      value={iconSearch}
                      onChange={(e) => setIconSearch(e.target.value)}
                      placeholder="Search components..."
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-blue-500/50 mb-1"
                    />

                    {filteredLibrary.map((category) => {
                      const isCollapsed = collapsedCategories[category.category] ?? true;
                      const visibleCount = categoryVisibleCounts[category.category] ?? ICON_INITIAL_RENDER_COUNT;
                      const visibleItems = category.items.slice(0, visibleCount);
                      const hiddenCount = Math.max(0, category.items.length - visibleItems.length);
                      return (
                        <div key={category.category} className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
                          <button
                            onClick={() => setCollapsedCategories((prev) => ({
                              ...prev,
                              [category.category]: !isCollapsed,
                            }))}
                            className="w-full flex items-center justify-between px-4 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400 hover:text-white hover:bg-white/[0.03]"
                          >
                            <span>{category.category}</span>
                            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          </button>

                          {!isCollapsed && (
                            <div className="p-3 grid grid-cols-2 gap-2">
                              {visibleItems.map((item) => (
                                <motion.div
                                  key={item.id}
                                  whileHover={{ scale: 1.05 }}
                                  className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-black/30 border border-white/5 cursor-grab active:cursor-grabbing hover:bg-white/[0.06] hover:border-blue-500/30 transition-all"
                                  draggable
                                  onDragStartCapture={(e) => onDragStart(e, item)}
                                >
                                  <div className="w-12 h-12 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden">
                                    <img
                                      src={normalizeIconPath(item.iconPath)}
                                      alt={item.name}
                                      className="w-11 h-11 object-contain"
                                      loading="lazy"
                                      onError={(event) => {
                                        const current = event.currentTarget;
                                        if (current.src.endsWith(DEFAULT_ARCHITECTURE_ICON)) {
                                          current.style.display = 'none';
                                          return;
                                        }
                                        current.src = DEFAULT_ARCHITECTURE_ICON;
                                      }}
                                    />
                                  </div>
                                  <div className="text-zinc-200 font-semibold text-[12.5px] text-center leading-tight line-clamp-2" title={item.name}>{item.name}</div>
                                </motion.div>
                              ))}
                              {hiddenCount > 0 && (
                                <button
                                  onClick={() => setCategoryVisibleCounts((prev) => ({
                                    ...prev,
                                    [category.category]: (prev[category.category] ?? ICON_INITIAL_RENDER_COUNT) + ICON_LOAD_MORE_STEP,
                                  }))}
                                  className="col-span-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-zinc-400 hover:text-white hover:border-blue-500/40 transition-all"
                                >
                                  Load more ({hiddenCount} remaining)
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/*
          Link inspector. `callKind` has existed in the graph types, the
          simulation bridge and the Rust engine the whole time, and no part of
          the UI could set it -- so an async handoff was always analysed as a
          blocking call, and decoupling could never change a result.
        */}
        <AnimatePresence>
          {selectedEdge && (
            <motion.aside
              initial={{ x: 340, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 340, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="w-[300px] border-l border-white/5 bg-zinc-950/40 backdrop-blur-3xl p-5 overflow-y-auto z-20 custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="text-blue-500 text-[10px] font-bold uppercase tracking-[0.2em]">Link Inspector</div>
                <button onClick={() => setSelectedEdge(null)} className="text-zinc-600 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="mb-6">
                <h3 className="text-white text-sm font-bold tracking-tight mb-1 break-words">
                  {String((nodes.find((n) => String(n.id) === String(selectedEdge.source))?.data as { label?: string } | undefined)?.label ?? selectedEdge.source)}
                  <span className="text-zinc-600 mx-2">&rarr;</span>
                  {String((nodes.find((n) => String(n.id) === String(selectedEdge.target))?.data as { label?: string } | undefined)?.label ?? selectedEdge.target)}
                </h3>
              </div>

              <div className="space-y-3">
                <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest border-b border-white/5 pb-2">
                  Call type
                </div>
                {([
                  { value: undefined, label: 'Synchronous (default)', hint: 'The caller waits. The conservative reading.' },
                  { value: 'read' as const, label: 'Read', hint: 'Cacheable, and contends less than a write.' },
                  { value: 'write' as const, label: 'Write', hint: 'Contends on a shared store.' },
                  { value: 'async' as const, label: 'Async', hint: 'The caller does not wait at all.' },
                ]).map((option) => {
                  const current = (selectedEdge as unknown as { callKind?: string }).callKind;
                  const isActive = current === option.value;
                  return (
                    <button
                      key={option.label}
                      onClick={() => updateEdgeCallKind(selectedEdge.id, option.value)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                        isActive
                          ? 'border-blue-500/50 bg-blue-500/10 text-white'
                          : 'border-white/5 bg-black/20 text-zinc-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold">{option.label}</div>
                      <div className="text-[10px] text-zinc-600 mt-0.5 leading-relaxed">{option.hint}</div>
                    </button>
                  );
                })}
                <p className="text-[10px] text-zinc-600 leading-relaxed px-1 pt-2">
                  The engine honours this: an async edge ends the caller&apos;s wait, which
                  is what makes decoupling show up as a lower simulated tail latency.
                </p>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Canvas Area */}
        <div className="flex-1 relative z-10" ref={reactFlowWrapper} onMouseMove={(e) => {
          sendWsMessage({ type: 'cursor_move', workspaceId: roomId, userId: 'local', x: e.clientX, y: e.clientY });
          if (providerRef.current) {
            setLocalCursor(providerRef.current, e.clientX, e.clientY);
          }
        }}>
          
          {/* Toggle Sidebar Button */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute top-6 left-0 z-30 p-3 rounded-r-2xl bg-zinc-900/80 border border-white/10 border-l-0 text-white hover:bg-zinc-800 transition-all shadow-2xl"
          >
            {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
          </button>

          <FlowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onInit={setRfInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeContextMenu={onNodeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            onNodeLabelChange={handleNodeLabelChange}
            onUndo={history.undo}
            onRedo={history.redo}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            killedNodes={killedNodes}
            degradedNodes={degradedNodes}
            simulationSnapshots={snapshots}
            currentTick={currentTick}
            isSimulating={isSimulating}
            ghostTraceRisks={ghostTraceRisks}
          />

          {contextMenu && (
            <div
              className="fixed z-50 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl py-1 min-w-[190px]"
              style={{
                // Near the right/bottom edge the menu would otherwise open off-screen.
                left: Math.min(contextMenu.x, window.innerWidth - 210),
                top: Math.min(contextMenu.y, window.innerHeight - 130),
              }}
            >
              {contextMenu.nodeId ? (
                <>
                  <button
                    onClick={() => duplicateNode(contextMenu.nodeId!)}
                    className="flex w-full items-center justify-between gap-6 px-4 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
                  >
                    Duplicate
                    <span className="font-mono text-[10px] text-zinc-600">Ctrl+D</span>
                  </button>
                  <button
                    onClick={() => deleteNode(contextMenu.nodeId!)}
                    className="flex w-full items-center justify-between gap-6 px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
                  >
                    Delete node
                    <span className="font-mono text-[10px] text-red-400/50">Del</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { history.undo(); setContextMenu(null); }}
                    disabled={!history.canUndo}
                    className="flex w-full items-center justify-between gap-6 px-4 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent"
                  >
                    Undo
                    <span className="font-mono text-[10px] text-zinc-600">Ctrl+Z</span>
                  </button>
                  <button
                    onClick={() => { history.redo(); setContextMenu(null); }}
                    disabled={!history.canRedo}
                    className="flex w-full items-center justify-between gap-6 px-4 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent"
                  >
                    Redo
                    <span className="font-mono text-[10px] text-zinc-600">Ctrl+Shift+Z</span>
                  </button>
                  <div className="my-1 h-px bg-white/10" />
                  <button
                    onClick={handleSelectAll}
                    className="flex w-full items-center justify-between gap-6 px-4 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
                  >
                    Select all
                    <span className="font-mono text-[10px] text-zinc-600">Ctrl+A</span>
                  </button>
                  <button
                    onClick={handleClearCanvas}
                    className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
                  >
                    Clear canvas
                  </button>
                </>
              )}
            </div>
          )}

        </div>

        {/* Right Inspector: Node Config (Glassmorphism) */}
        <AnimatePresence>
          {selectedNode && (
            <motion.aside
              initial={{ x: 340, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 340, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="w-[300px] border-l border-white/5 bg-zinc-950/40 backdrop-blur-3xl p-5 overflow-y-auto z-20 custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-5">
                 <div className="text-blue-500 text-[10px] font-bold uppercase tracking-[0.2em]">Node Inspector</div>
                 <button onClick={() => setSelectedNode(null)} className="text-zinc-600 hover:text-white transition-colors">
                    <X size={20} />
                 </button>
              </div>

              <div className="mb-6">
                 <h3 className="text-white text-xl font-bold tracking-tight mb-2">{(selectedNode.data as { label?: string }).label ?? 'Untitled Node'}</h3>
                 <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest">{(selectedNode.data as { type?: string }).type ?? 'Unknown'}</p>
              </div>

              <div className="space-y-5">
                 {/*
                   The two fields that decide the answer.

                   Both already existed end to end -- in the graph types, in the
                   simulation bridge and in the Rust engine -- with no way for a
                   user to set either by hand. Only a repository import could
                   fill them in, so a hand-drawn diagram was always analysed as
                   if every component were a single instance serving an
                   arbitrary reference load.
                 */}
                 <div className="space-y-4">
                   <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest border-b border-white/5 pb-2 mb-1">
                     Capacity
                   </div>

                   <div className="space-y-2">
                     <label className="text-[11px] text-zinc-400 font-medium px-1 flex items-center justify-between">
                       <span>Instances</span>
                       <span className="text-zinc-600 font-mono">
                         {Number((selectedNode.data as { replicas?: number }).replicas ?? 1)}
                       </span>
                     </label>
                     <input
                       type="number"
                       min={1}
                       max={500}
                       value={Number((selectedNode.data as { replicas?: number }).replicas ?? 1)}
                       onChange={(e) => {
                         const parsed = Math.max(1, Math.min(500, Math.round(Number(e.target.value) || 1)));
                         updateNodeData(selectedNode.id, { replicas: parsed });
                       }}
                       className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/40 transition-all font-mono"
                     />
                     <p className="text-[10px] text-zinc-600 leading-relaxed px-1">
                       One instance is a single point of failure; a replicated tier is not.
                       Changes both the SPOF findings and the simulated capacity.
                     </p>
                   </div>

                   <div className="space-y-2">
                     <label className="text-[11px] text-zinc-400 font-medium px-1">Expected peak RPS</label>
                     <input
                       type="number"
                       min={0}
                       step={100}
                       placeholder="unset - a reference load is used"
                       value={
                         (selectedNode.data as { expectedPeakRps?: number }).expectedPeakRps ?? ''
                       }
                       onChange={(e) => {
                         const raw = e.target.value.trim();
                         updateNodeData(selectedNode.id, {
                           expectedPeakRps: raw === '' ? undefined : Math.max(0, Math.round(Number(raw) || 0)),
                         });
                       }}
                       className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/40 transition-all font-mono placeholder:text-zinc-700 placeholder:text-xs"
                     />
                     <p className="text-[10px] text-zinc-600 leading-relaxed px-1">
                       Only meaningful on an entry point. Turns &quot;saturates at 900 rps&quot;
                       into &quot;saturates below your stated peak&quot;.
                     </p>
                   </div>
                 </div>

                 {/* Runtime params -- these feed the engine per-node model. */}
                 <div className="space-y-4">
                   <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest border-b border-white/5 pb-2 mb-1">
                     Runtime Vectors
                   </div>
                   {([
                     { key: 'processingPowerMs', label: 'processing time (ms)', fallback: 200, step: 10 },
                     { key: 'coldStartLatencyMs', label: 'cold start (ms)', fallback: 0, step: 10 },
                     { key: 'failureRatePercent', label: 'failure rate (%)', fallback: 0.01, step: 0.01 },
                   ] as const).map((field) => (
                     <div key={field.key} className="space-y-2">
                       <label className="text-[11px] text-zinc-500 font-medium px-1">{field.label}</label>
                       <input
                         type="number"
                         min={0}
                         step={field.step}
                         value={
                           (selectedNode.data as Record<string, number | undefined>)[field.key]
                             ?? field.fallback
                         }
                         onChange={(e) => updateNodeData(selectedNode.id, {
                           [field.key]: Math.max(0, Number(e.target.value) || 0),
                         })}
                         className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/40 transition-all font-mono"
                       />
                     </div>
                   ))}
                 </div>

                 <div className="space-y-3 mt-6">
                   <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest border-b border-white/5 pb-2 mb-1">
                     Chaos Controls
                   </div>
                   <button
                     onClick={() => selectedNode && handleKillNode(selectedNode.id)}
                     disabled={killedNodes.has(selectedNode?.id || '')}
                     className="w-full py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-xs uppercase tracking-widest hover:bg-red-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                   >
                     {killedNodes.has(selectedNode?.id || '') ? '⬛ Kill Scheduled' : '☠ Kill Node'}
                   </button>
                   <button
                     onClick={() => selectedNode && handleDegradeNode(selectedNode.id)}
                     disabled={degradedNodes.has(selectedNode?.id || '')}
                     className="w-full py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs uppercase tracking-widest hover:bg-amber-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                   >
                     {degradedNodes.has(selectedNode?.id || '') ? '⚠ Degrade Scheduled' : '⚡ Degrade Node'}
                   </button>
                   {(chaosEvents.length > 0) && (
                     <button
                       onClick={handleResetChaos}
                       className="w-full py-2 rounded-xl border border-white/10 text-zinc-500 font-bold text-xs uppercase tracking-widest hover:text-white hover:border-white/20 transition-all"
                     >
                       Reset All Chaos ({chaosEvents.length})
                     </button>
                   )}
                 </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ── TERMINAL (Glassmorphism) ── */}
      <motion.div
        animate={{ height: terminalExpanded ? '35vh' : '48px' }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/60 backdrop-blur-3xl border-t border-white/10 flex flex-col"
      >
        <button
          onClick={() => setTerminalExpanded(!terminalExpanded)}
          className="h-12 flex items-center justify-between px-5 hover:bg-white/5 transition-colors group"
        >
          <div className="flex items-center gap-3">
             <Terminal size={16} className="text-blue-500" />
             <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 group-hover:text-blue-400 transition-colors">Simulation Runtime Log</span>
             {logs.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />}
             {isSimulating && (
               <span className="text-[9px] font-mono text-blue-400 tracking-widest">
                 TICK {currentTick}/{snapshots.length}
               </span>
             )}
          </div>
          <div className="text-zinc-600">
             {terminalExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </div>
        </button>

        <div className="flex-1 overflow-hidden p-10 pt-4">
          <div className="h-full bg-black/40 rounded-3xl border border-white/5 p-8 overflow-y-auto custom-scrollbar font-mono text-xs leading-relaxed">
            {logs.map((log, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`mb-2 font-mono text-xs ${
                  log.includes('[ERROR]') ? 'text-red-400' :
                  log.includes('[WARN]')  ? 'text-amber-400' :
                  log.includes('[CHAOS]') ? 'text-purple-400' :
                  log.includes('[RESULT]')? 'text-blue-300 font-bold' :
                  log.includes('[SYSTEM]')? 'text-white' :
                  'text-zinc-500'
                }`}
              >
                <span className="text-zinc-800 mr-4 select-none">[{i+1}]</span>
                {log}
              </motion.div>
            ))}
            <div ref={terminalEndRef} />
            
            {logs.length > 0 && !simulationComplete && (
              <motion.div
                animate={{ opacity: [1, 0] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="w-1.5 h-4 bg-blue-500 inline-block ml-1"
              />
            )}

            {simulationComplete && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 pt-8 border-t border-white/5 flex items-center gap-6"
              >
                 <div className="text-zinc-500 text-sm">Simulation terminated successfully. Deterministic hash stable.</div>
                 <button
                   onClick={() => setIsReportOpen(true)}
                   className="iz-btn-blue relative overflow-hidden py-3 px-10 rounded-2xl text-white font-bold text-sm shadow-2xl"
                 >
                    <span style={{ position:'absolute', top:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to left, rgba(30,58,138,0), #000000)', animation:'izAnimateTop 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                    <span style={{ position:'absolute', top:0, right:0, height:'100%', width:'2px', background:'linear-gradient(to top, rgba(30,58,138,0), #000000)', animation:'izAnimateRight 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                    <span style={{ position:'absolute', bottom:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to right, rgba(30,58,138,0), #000000)', animation:'izAnimateBottom 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                    <span style={{ position:'absolute', top:0, left:0, height:'100%', width:'2px', background:'linear-gradient(to bottom, rgba(30,58,138,0), #000000)', animation:'izAnimateLeft 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                    View Detailed Report Analysis
                 </button>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Popups */}
      <ImportDiagramPopup
        isOpen={isImportPopupOpen}
        onClose={() => setIsImportPopupOpen(false)}
        onImport={handleImportDiagram}
      />

      <ImportRepoPopup
        isOpen={isRepoImportOpen}
        onClose={() => setIsRepoImportOpen(false)}
        onImport={(nodes, edges) => handleImportDiagram(nodes, edges, 'repository')}
      />

      <ReportView
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        projectName={projectName}
        reportData={simulationResult}
        onApplyChange={handleApplyChange}
        applyingRecommendationId={applyingRecommendationId}
      />
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(59, 130, 246, 0.2);
        }
      `}</style>

      {Array.from(peerCursors.entries()).map(([clientId, cursor]) => (
        <div
          key={clientId}
          className="pointer-events-none fixed z-50 transition-all duration-75"
          style={{ left: cursor.x, top: cursor.y }}
        >
          <div
            className="w-3 h-3 rounded-full shadow-lg"
            style={{ backgroundColor: cursor.color }}
          />
          <div
            className="mt-1 px-2 py-0.5 rounded text-[10px] font-bold text-white font-mono"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.name}
          </div>
        </div>
      ))}
    </div>
  );
}

const X = ({ size, className, onClick }: { size?: number, className?: string, onClick?: () => void }) => (
  <svg 
    width={size || 24} 
    height={size || 24} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
    onClick={onClick}
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
