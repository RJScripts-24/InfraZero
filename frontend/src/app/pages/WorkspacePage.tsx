import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Share2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Shuffle,
  Edit3,
  Sparkles,
  Check,
  FileImage,
  PanelLeftClose,
  PanelLeftOpen,
  Terminal,
  Zap,
  Ghost,
  ShieldAlert,
} from 'lucide-react';
import { useLoaderData } from 'react-router';
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
import { GhostTracePanel } from '../components/GhostTracePanel';
import { BreachRoomImportModal, type IncidentTimeline } from '../components/BreachRoomImportModal';
import { BreachRoomPanel, type BreachRoomResult } from '../components/BreachRoomPanel';
import { ImportDiagramPopup } from '../components/ImportDiagramPopup';
import { ReportView } from '../components/ReportView';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { DEFAULT_ARCHITECTURE_ICON, PRIMITIVE_ITEMS, iconForNode, resolvePrimitiveByText, type PrimitiveItem } from '../lib/architectureIcons';
import { authFetch, getUser, isTemporaryGuest } from '../../lib/auth';
import { initCollaboration, destroyCollaboration, setLocalUser, setLocalCursor } from '../../lib/collaboration';
import type { WorkspaceLoaderData } from '../routes';
import * as Y from 'yjs';

// ─── Static data ──────────────────────────────────────────────────────────────

const initialNodes: Node[] = [];

const edgeBase = {
  type: 'smoothstep',
  animated: false,
  style: { stroke: 'rgba(59,130,246,0.5)', strokeWidth: 2.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#3B82F6', width: 16, height: 16 },
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

const ICON_RENDER_LIMIT_PER_CATEGORY = 80;

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

interface GhostTraceResult {
  graphHash: string;
  topologyEmbedding: number[];
  edgeRisks: EdgeRiskScore[];
  nodeRisks: NodeRiskScore[];
  overallRisk: number;
  predictedAnomalyClass: string;
  syntheticSpans: SyntheticSpan[];
  analysisNarrative: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const loaderData = useLoaderData() as WorkspaceLoaderData;
  const [projectName, setProjectName]     = useState(() => {
    const roomFromUrl = new URLSearchParams(window.location.search).get('room');
    return roomFromUrl?.trim() || 'velocis-architecture-v3';
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [mode, setMode]                   = useState<'edit' | 'sim'>('edit');
  const [activeTab, setActiveTab]         = useState<'ai' | 'components'>('ai');
  const [terminalExpanded, setTerminalExpanded] = useState(false);
  const [aiPrompt, setAiPrompt]           = useState('');
  const [isGenerating, setIsGenerating]   = useState(false);
  const [linkCopied, setLinkCopied]       = useState(false);
  const [selectedNode, setSelectedNode]   = useState<Node | null>(null);
  const [logs, setLogs]                   = useState<string[]>([]);
  const reactFlowWrapper                  = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance]       = useState<any>(null);
  const [isImportPopupOpen, setIsImportPopupOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [simulationMode, setSimulationMode] = useState<'deterministic' | 'randomized'>('deterministic');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [ghostTraceResult, setGhostTraceResult] = useState<GhostTraceResult | null>(null);
  const [ghostTraceLoading, setGhostTraceLoading] = useState(false);
  const [ghostPanelOpen, setGhostPanelOpen] = useState(false);
  const [breachRoomResult, setBreachRoomResult] = useState<BreachRoomResult | null>(null);
  const [breachRoomLoading, setBreachRoomLoading] = useState(false);
  const [breachPanelOpen, setBreachPanelOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [incidentTimeline, setIncidentTimeline] = useState<IncidentTimeline | null>(null);
  const [replayTick, setReplayTick] = useState(0);
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
  const [libraryItems, setLibraryItems] = useState<any[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [iconSearch, setIconSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
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
      type: 'join_workspace', workspaceId: projectName, userId: `user-${Date.now()}`, userName: 'You'
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
  }, [projectName, sendWsMessage, setNodes, setEdges]);

  useEffect(() => {
    const { ydoc, provider } = initCollaboration(projectName);
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
      setNodes(normalizeNodes(yNodes.toArray()));
    }
    if (yEdges.length > 0) {
      isApplyingRemoteEdgesRef.current = true;
      setEdges(normalizeEdges(yEdges.toArray()));
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
      setNodes(normalizeNodes(remoteNodes));
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
      setEdges(normalizeEdges(remoteEdges));
    });

    return () => destroyCollaboration();
  }, [projectName, setNodes, setEdges]);

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
    if (isTemporaryGuest()) {
      return;
    }

    authFetch('/api/projects/library-of-doom', { credentials: 'include' })
      .then(r => r.json()).then(setLibraryItems).catch(console.error);
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const generateTickLog = (snapshot: any, tick: number): string | null => {
    if (!snapshot) return null;
    const metrics = snapshot.nodeMetrics || [];
    const failed = metrics.filter((m: any) => m.state === 'FAILED' || m.isOverloaded);
    const degraded = metrics.filter((m: any) => m.state === 'DEGRADED');

    if (failed.length > 0) {
      return `[ERROR][Tick ${tick}] ${failed.map((m: any) => m.nodeId).join(', ')} - queue overflow, requests refused`;
    }
    if (degraded.length > 0) {
      return `[WARN][Tick ${tick}] ${degraded.map((m: any) => m.nodeId).join(', ')} - degraded, elevated latency`;
    }
    if (tick % 50 === 0) {
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
    const interval = setInterval(() => {
      tick += 1;
      setCurrentTick(tick);
      const snapshot = snapshots[tick];
      const tickLog = generateTickLog(snapshot, tick);
      if (tickLog) setLogs(prev => [...prev, tickLog]);
      if (tick >= snapshots.length - 1) {
        clearInterval(interval);
        setIsSimulating(false);
        setLogs(prev => [...prev, `[SYSTEM] Simulation complete. ${snapshots.length} ticks analysed.`]);
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

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedIds = nodes.filter((n) => n.selected).map((n) => String(n.id));
        if (selectedIds.length === 0) return;

        setNodes((nds) => nds.filter((n) => !selectedIds.includes(String(n.id))));
        setEdges((eds) => eds.filter((edge) => !selectedIds.includes(String(edge.source)) && !selectedIds.includes(String(edge.target))));
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
  }, [nodes, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        normalizeEdges(
          addEdge(
            {
              ...params,
              id: `e-${params.source}-${params.target}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'smoothstep',
              style: { stroke: 'rgba(59,130,246,0.5)', strokeWidth: 2.5 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#3B82F6', width: 16, height: 16 },
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
  }, []);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId: String(node.id),
    });
  }, []);

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

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

      sendWsMessage({ type: 'graph_replace', workspaceId: projectName, nodes: graph.nodes, edges: graph.edges });
      setAiPrompt('');
    } catch (err) {
      setLogs((prev) => [...prev, `[AI ERROR] ${err instanceof Error ? err.message : 'Unknown generation error'}`]);
      setTerminalExpanded(true);
      console.error('[AI Generate Error]', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShareClick = () => {
    const inviteUrl = new URL('/workspace', window.location.origin);
    inviteUrl.searchParams.set('room', projectName);
    const link = inviteUrl.toString();

    navigator.clipboard.writeText(link).catch(() => {
      const textArea = document.createElement('textarea');
      textArea.value = link;
      textArea.setAttribute('readonly', '');
      textArea.style.position = 'absolute';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    });

    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', projectName);
    window.history.replaceState({}, '', url.toString());
  }, [projectName]);

  useEffect(() => {
    if (!loaderData?.autoOpenBreachRoom) {
      return;
    }
    setBreachPanelOpen(true);
  }, [loaderData?.autoOpenBreachRoom]);

  useEffect(() => {
    if (!incidentTimeline) return;
    const eventsUpToTick = incidentTimeline.events.filter((_, i) => i <= replayTick);
    const affectedNow = new Set(eventsUpToTick.map((event) => event.affectedNodeId));

    setNodes((nds) => nds.map((node) => ({
      ...node,
      data: {
        ...node.data,
        breachAffected: affectedNow.has(node.id),
        breachSeverity: eventsUpToTick.find((event) => event.affectedNodeId === node.id)?.severity,
      },
    })));
  }, [replayTick, incidentTimeline, setNodes]);

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

  const handleDeployTest = async () => {
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
    setLogs([
      '[SYSTEM] Initializing simulation engine...',
      `[MODE] ${simulationMode === 'deterministic' ? 'Deterministic Baseline' : 'Randomized Stress Test'}`,
    ]);
    try {
      const cleanGraph = sanitizeGraph(nodes, edges);
      if (cleanGraph.nodes.length !== nodes.length || cleanGraph.edges.length !== edges.length) {
        setNodes(cleanGraph.nodes);
        setEdges(cleanGraph.edges);
        setLogs((prev) => [
          ...prev,
          '[SANITIZER] Invalid or duplicate graph entries were removed before simulation.',
        ]);
      }

      const runSeed = simulationMode === 'randomized' ? Date.now() % 0xFFFFFFFF : undefined;
      const payload: Record<string, unknown> = {
        nodes: cleanGraph.nodes,
        edges: cleanGraph.edges,
        chaosEnabled: chaosEvents.length > 0,
        chaosEvents,
      };
      if (typeof runSeed === 'number') {
        payload.seed = runSeed;
      }

      const response = await authFetch('/api/simulations/run', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Simulation failed: ${response.statusText}`);
      const result = await response.json();
      setSnapshots(result.snapshots || []);
      setLogs(prev => [
        ...prev,
        '[SYSTEM] Simulation engine initialized.',
        `[INFO] Universe Seed: ${result.universeSeed}`,
        `[HASH] Graph hash: ${result.graphHash?.slice(0, 16)}...`,
        `[INFO] Processing ${result.totalRequests?.toLocaleString()} requests...`,
      ]);
      setSimulationResult({ ...result, groqReview: result.groqReview || '' });
      setEdges(eds => eds.map(e => ({ ...e, animated: true })));
      setSimulationComplete(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setLogs(prev => [...prev, `[ERROR] ${msg}`]);
      setSimulationComplete(true);
    }
  };

  const handleImportDiagram = (importedNodes: any[], importedEdges: any[]) => {
    const importedGraph = sanitizeGraph(importedNodes, importedEdges);
    const separatedNodes = resolveNodeOverlaps(importedGraph.nodes);
    setNodes(separatedNodes.map((node) => ({
      ...node,
      data: { ...node.data, isActive: false },
    })));
    setEdges(importedGraph.edges);
    setTimeout(() => rfInstance?.fitView?.({ padding: 0.2, duration: 500 }), 50);

    setTerminalExpanded(true);
    const importLogs = [
      '[IMPORT] Vision API analysis complete',
      `[GRAPH] Loaded ${importedGraph.nodes.length} components and ${importedGraph.edges.length} flows`,
      '[READY] Workspace re-synchronized',
    ];
    setLogs(importLogs);
  };

  const runGhostTrace = async () => {
    if (isTemporaryGuest()) {
      setLogs(prev => [...prev, '[GHOSTTRACE] GhostTrace analysis requires authenticated account.']);
      setTerminalExpanded(true);
      return;
    }

    setGhostTraceLoading(true);
    try {
      const cleanGraph = sanitizeGraph(nodes, edges);
      const response = await authFetch('/api/ghosttrace/analyze', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          nodes: cleanGraph.nodes,
          edges: cleanGraph.edges,
        }),
      });

      if (!response.ok) {
        throw new Error(`GhostTrace failed: ${response.statusText}`);
      }

      const data = await response.json() as GhostTraceResult;
      setGhostTraceResult(data);
      setGhostTraceRisks({
        edgeRisks: data.edgeRisks || [],
        nodeRisks: data.nodeRisks || [],
      });
      setNodes(nds => nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          ghostRisk: data.nodeRisks.find((risk) => risk.nodeId === node.id)?.riskScore,
        },
      })));
      setLogs(prev => [
        ...prev,
        `[GHOSTTRACE] ${data.predictedAnomalyClass} detected.`,
        `[GHOSTTRACE] Overall risk ${(data.overallRisk * 100).toFixed(0)}% across ${data.edgeRisks.length} edges and ${data.nodeRisks.length} nodes.`,
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown GhostTrace error';
      setLogs(prev => [...prev, `[GHOSTTRACE ERROR] ${message}`]);
    } finally {
      setGhostTraceLoading(false);
    }
  };

  const runBreachRoomAnalysis = async (timeline: IncidentTimeline) => {
    if (!ghostTraceResult) {
      setLogs((prev) => [...prev, '[BREACHROOM] Run GhostTrace before incident recall analysis.']);
      setTerminalExpanded(true);
      return;
    }

    setBreachRoomLoading(true);
    setBreachPanelOpen(true);
    setImportModalOpen(false);

    try {
      const cleanGraph = sanitizeGraph(nodes, edges);
      const response = await authFetch('/api/breachroom/analyze', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          nodes: cleanGraph.nodes,
          edges: cleanGraph.edges,
          ghostTraceResult,
          incidentSource: timeline.source,
          manualEvents: timeline.events,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || 'BreachRoom analysis failed.');
      }

      const rawResult = (payload?.result || payload) as Partial<BreachRoomResult> & {
        analysisNarrative?: string;
      };
      const rawRecall = rawResult.recallScore || ({} as BreachRoomResult['recallScore']);
      const result: BreachRoomResult = {
        recallScore: {
          ...rawRecall,
          recall: rawRecall.recall ?? 0,
          precision: rawRecall.precision ?? 0,
          f1Score: rawRecall.f1Score ?? 0,
          truePositives: rawRecall.truePositives ?? 0,
          falseNegatives: rawRecall.falseNegatives ?? 0,
          actualAffectedEdges: rawRecall.actualAffectedEdges ?? [],
          predictedEdgeRisks: rawRecall.predictedEdgeRisks?.length
            ? rawRecall.predictedEdgeRisks
            : ghostTraceResult.edgeRisks.map((edgeRisk) => ({
                edgeId: edgeRisk.edgeId,
                riskScore: edgeRisk.riskScore,
              })),
        },
        revisionSuggestions: rawResult.revisionSuggestions || [],
        aiNarrative: rawResult.aiNarrative || rawResult.analysisNarrative || '',
      };
      setBreachRoomResult(result);
      setIncidentTimeline(timeline);
      setReplayTick(0);
      setNodes((nds) => nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          breachAffected: timeline.affectedNodeIds.includes(String(node.id)),
        },
      })));

      setLogs((prev) => [
        ...prev,
        `[BREACHROOM] Recall ${(result.recallScore.recall * 100).toFixed(0)}% | Precision ${(result.recallScore.precision * 100).toFixed(0)}%.`,
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown BreachRoom error';
      setLogs((prev) => [...prev, `[BREACHROOM ERROR] ${message}`]);
    } finally {
      setBreachRoomLoading(false);
    }
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
                  onBlur={() => setIsEditingName(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
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
                {mode === 'sim' ? 'Engine Hot_ Replications Running' : 'Synchronized Locally'}
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

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDeployTest}
              className="iz-btn-blue relative overflow-hidden py-2 px-5 rounded-xl text-white font-bold text-xs shadow-xl transition-all"
            >
              DEPLOY & TEST
            </motion.button>

            <Tooltip>
              <TooltipTrigger asChild>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setGhostPanelOpen(true);
                    void runGhostTrace();
                  }}
                  className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-amber-100 shadow-xl transition-all hover:bg-amber-500/15"
                >
                  <Ghost size={14} />
                  GhostTrace
                </motion.button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-zinc-900 text-zinc-100">
                GhostTrace Analysis
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <motion.button
                    whileHover={{ scale: ghostTraceResult ? 1.02 : 1 }}
                    whileTap={{ scale: ghostTraceResult ? 0.98 : 1 }}
                    onClick={() => setImportModalOpen(true)}
                    disabled={!ghostTraceResult}
                    className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-red-100 shadow-xl transition-all hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ShieldAlert size={14} />
                    BreachRoom
                  </motion.button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-zinc-900 text-zinc-100">
                {!ghostTraceResult ? 'Run GhostTrace first' : 'BreachRoom'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setSimulationMode((prev) => (prev === 'deterministic' ? 'randomized' : 'deterministic'))}
                  className="h-9 flex items-center gap-2 rounded-full border border-white/10 px-3 text-white/80 hover:text-white hover:bg-white/5 transition-all text-[10px] font-bold uppercase tracking-wide"
                >
                  <Shuffle size={14} />
                  {simulationMode === 'deterministic' ? 'Deterministic' : 'Randomized'}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-zinc-900 text-zinc-100">
                {simulationMode === 'deterministic' ? 'Deterministic mode' : 'Randomized mode'}
              </TooltipContent>
            </Tooltip>
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
                    <div className="relative">
                       <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder={'Enter technical prompt...\ne.g. "Microservices with distributed cache"'}
                        className="w-full bg-black/40 border border-white/10 rounded-[20px] p-6 resize-none outline-none text-white text-sm font-medium tracking-tight placeholder:text-zinc-700 focus:border-blue-500/50 transition-all custom-scrollbar"
                        rows={8}
                      />
                      <div className="absolute right-4 bottom-4 text-[9px] font-mono text-zinc-700 tracking-wider font-bold">ALPHA_v0.9</div>
                    </div>
                    
                    <motion.button
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-blue-500 text-white font-bold text-sm shadow-xl shadow-blue-500/20 hover:bg-blue-600 transition-all"
                    >
                      <Sparkles size={18} className={isGenerating ? 'animate-spin' : ''} />
                      {isGenerating ? 'COMPUTING...' : 'GENERATE TOPOLOGY'}
                    </motion.button>
                    
                    <div className="pt-6 border-t border-white/5">
                      <button
                        onClick={() => setIsImportPopupOpen(true)}
                        className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl border border-white/5 bg-white/5 text-zinc-400 font-bold text-sm hover:text-white hover:bg-white/10 transition-all"
                      >
                        <FileImage size={18} />
                        IMPORT VISION DATA
                      </button>

                      <button onClick={() => setShowLibrary(!showLibrary)}
                        className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-400 font-bold text-sm hover:bg-red-500/10 transition-all mt-3">
                        LIBRARY OF DOOM
                      </button>

                      {showLibrary && libraryItems.map(item => (
                        <div key={item.id} onClick={() => {
                          if (item.graph_json) {
                            const g = JSON.parse(item.graph_json);
                            setNodes(g.nodes || []); setEdges(g.edges || []);
                            setShowLibrary(false);
                            setLogs([`[DOOM] Loaded: ${item.name}`, '[WARN] This architecture contains known failure patterns.']);
                            setTerminalExpanded(true);
                          }
                        }} className="p-4 rounded-2xl bg-red-500/5 border border-red-500/10 cursor-pointer hover:bg-red-500/10 transition-all mt-2">
                          <div className="text-red-400 font-bold text-sm">{item.name}</div>
                          <div className="text-zinc-600 text-xs mt-1">{item.description}</div>
                        </div>
                      ))}
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
                      const visibleItems = category.items.slice(0, ICON_RENDER_LIMIT_PER_CATEGORY);
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
                                  <div className="w-9 h-9 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden">
                                    <img
                                      src={normalizeIconPath(item.iconPath)}
                                      alt={item.name}
                                      className="w-8 h-8 object-contain"
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
                                  <div className="text-zinc-200 font-semibold text-[11px] text-center leading-tight line-clamp-2">{item.name}</div>
                                </motion.div>
                              ))}
                              {hiddenCount > 0 && (
                                <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                                  Showing first {ICON_RENDER_LIMIT_PER_CATEGORY} items. Refine search to narrow {hiddenCount} more.
                                </div>
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

        {/* Canvas Area */}
        <div className="flex-1 relative z-10" ref={reactFlowWrapper} onMouseMove={(e) => {
          sendWsMessage({ type: 'cursor_move', workspaceId: projectName, userId: 'local', x: e.clientX, y: e.clientY });
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
            onInit={setRfInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeContextMenu={onNodeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            onNodeLabelChange={handleNodeLabelChange}
            killedNodes={killedNodes}
            degradedNodes={degradedNodes}
            simulationSnapshots={snapshots}
            currentTick={currentTick}
            isSimulating={isSimulating}
            ghostTraceRisks={ghostTraceRisks}
          />

          {contextMenu && (
            <div
              className="fixed z-50 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl py-1 min-w-[160px]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onMouseLeave={() => setContextMenu(null)}
            >
              {contextMenu.nodeId ? (
                <>
                  <button
                    onClick={() => duplicateNode(contextMenu.nodeId!)}
                    className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() => deleteNode(contextMenu.nodeId!)}
                    className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleSelectAll}
                    className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
                  >
                    Select all
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

          <AnimatePresence>
            {ghostPanelOpen && (
              <GhostTracePanel
                isOpen={ghostPanelOpen}
                onClose={() => setGhostPanelOpen(false)}
                result={ghostTraceResult}
                isLoading={ghostTraceLoading}
                nodes={nodes.map((node) => ({
                  id: String(node.id),
                  data: {
                    label: (node.data as { label?: string } | undefined)?.label,
                  },
                }))}
              />
            )}
          </AnimatePresence>

          <BreachRoomPanel
            isOpen={breachPanelOpen}
            onClose={() => setBreachPanelOpen(false)}
            result={breachRoomResult}
            isLoading={breachRoomLoading}
            nodes={nodes}
            timeline={incidentTimeline}
            currentReplayTick={replayTick}
            onTickChange={(tick) => setReplayTick(tick)}
            totalTicks={Math.max((incidentTimeline?.events.length ?? 1) - 1, 0)}
          />

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
                 {/* Runtime Params */}
                  <div className="space-y-4">
                    <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest border-b border-white/5 pb-2 mb-1">Runtime Vectors</div>
                    {(['processingPower', 'coldStartLatency', 'failureRate'].map((field) => (
                       <div key={field} className="space-y-2">
                          <label className="text-[11px] text-zinc-500 font-medium px-1">{field}</label>
                          <input
                            type="text"
                            defaultValue={field === 'failureRate' ? '0.01%' : '200ms'}
                            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/40 transition-all font-mono"
                          />
                       </div>
                    )))}
                 </div>

                 {/* Network Params */}
                  <div className="space-y-4">
                    <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest border-b border-white/5 pb-2 mb-1">Network Latency</div>
                    {(['latency', 'jitter', 'bandwidthLimit'].map((field) => (
                       <div key={field} className="space-y-2">
                          <label className="text-[11px] text-zinc-500 font-medium px-1">{field}</label>
                          <input
                            type="text"
                            defaultValue={field === 'bandwidthLimit' ? '1Gbps' : '20ms'}
                            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500/40 transition-all font-mono"
                          />
                       </div>
                    )))}
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

      <BreachRoomImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={(timeline) => {
          void runBreachRoomAnalysis(timeline);
        }}
      />

      <ReportView
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        projectName={projectName}
        reportData={simulationResult ? {
          simulationId: simulationResult.universeSeed || 'N/A',
          universeSeed: simulationResult.universeSeed || 'N/A',
          stableHash: simulationResult.graphHash || 'N/A',
          grade: simulationResult.grade || 'F',
          gradeScore: simulationResult.gradeScore ?? 0,
          gradeRationale: simulationResult.gradeRationale || [],
          gradeColor: simulationResult.grade === 'A' ? '#10b981' : simulationResult.grade?.startsWith('B') ? '#3B82F6' : '#ef4444',
          status: simulationResult.status || 'UNKNOWN',
          statusColor: simulationResult.status?.includes('PASS') ? '#10b981' : '#ef4444',
          totalRequests: simulationResult.totalRequests || 0,
          failedRequests: simulationResult.totalFailures || 0,
          peakLatency: simulationResult.peakLatency || 0,
          collapseTime: simulationResult.collapseTime || '—',
          rootCause: {
            summary: simulationResult.rootCause?.summary || 'Simulation completed.',
            details: simulationResult.rootCause?.details || [],
          },
          recommendations: simulationResult.recommendations || [],
          latencyData: simulationResult.latencyData || [],
          groqReview: simulationResult.groqReview || '',
        } : {
          simulationId: '847293',
          universeSeed: '783492',
          stableHash: 'a7c4f9d2e8b3f1a588b2c45...',
          grade: 'B+',
          gradeScore: 82,
          gradeRationale: ['Score breakdown — Availability: 35/35, Latency: 11/20, Fault Tolerance: 20/25, Scalability: 8/10, Operations: 8/10'],
          gradeColor: '#3B82F6',
          status: 'STABLE — PASS',
          statusColor: '#3B82F6',
          totalRequests: 10000,
          failedRequests: 142,
          peakLatency: 323,
          collapseTime: '—',
          rootCause: { summary: 'Run a simulation to see results.', details: [] },
          recommendations: ['Run a simulation to see real recommendations.'],
          latencyData: [],
          groqReview: '',
        }}
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
