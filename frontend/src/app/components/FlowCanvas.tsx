import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  Panel,
  Handle,
  NodeResizer,
  Position,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CanvasToolbar } from './CanvasToolbar';
import { DEFAULT_ARCHITECTURE_ICON } from '../lib/architectureIcons';

const normalizeIconPath = (rawPath?: string | null): string => {
  if (!rawPath || typeof rawPath !== 'string') {
    return DEFAULT_ARCHITECTURE_ICON;
  }

  const normalized = rawPath.replace(/\\/g, '/').trim();
  if (!normalized) {
    return DEFAULT_ARCHITECTURE_ICON;
  }

  if (normalized.startsWith('/icons/')) {
    return `/Icons/${normalized.slice('/icons/'.length)}`;
  }

  return normalized;
};

const ICON_MAP: Record<string, string> = {
  Infrastructure: '/Icons/aws/networking/Elastic-Load-Balancing.svg',
  'Load Balancer': '/Icons/aws/networking/Elastic-Load-Balancing.svg',
  Gateway: '/Icons/aws/networking/Amazon-API-Gateway.svg',
  Database: '/Icons/aws/database/Amazon-RDS.svg',
  PostgreSQL: '/Icons/generic/postgresql.svg',
  Cache: '/Icons/aws/database/Amazon-ElastiCache.svg',
  'Node Service': '/Icons/aws/compute/Amazon-EC2.svg',
  Service: '/Icons/aws/compute/AWS-Lambda.svg',
  RabbitMQ: '/Icons/generic/rabbitmq.svg',
  'Background Job': '/Icons/aws/compute/AWS-Batch.svg',
  'Edge Network': '/Icons/aws/networking/Amazon-CloudFront.svg',
  Kafka: '/Icons/generic/kafka.svg',
  Kubernetes: '/Icons/generic/kubernetes.svg',
  Docker: '/Icons/generic/docker.svg',
};

const NODE_PALETTE = [
  { bg: 'rgba(99,102,241,0.30)', border: 'rgba(99,102,241,0.85)', glow: '#6366f1' },
  { bg: 'rgba(16,185,129,0.28)', border: 'rgba(16,185,129,0.85)', glow: '#10b981' },
  { bg: 'rgba(245,158,11,0.28)', border: 'rgba(245,158,11,0.85)', glow: '#f59e0b' },
  { bg: 'rgba(236,72,153,0.28)', border: 'rgba(236,72,153,0.85)', glow: '#ec4899' },
  { bg: 'rgba(20,184,166,0.28)', border: 'rgba(20,184,166,0.85)', glow: '#14b8a6' },
  { bg: 'rgba(249,115,22,0.28)', border: 'rgba(249,115,22,0.85)', glow: '#f97316' },
  { bg: 'rgba(139,92,246,0.28)', border: 'rgba(139,92,246,0.85)', glow: '#8b5cf6' },
  { bg: 'rgba(6,182,212,0.28)', border: 'rgba(6,182,212,0.85)', glow: '#06b6d4' },
  { bg: 'rgba(132,204,22,0.28)', border: 'rgba(132,204,22,0.85)', glow: '#84cc16' },
  { bg: 'rgba(239,68,68,0.28)', border: 'rgba(239,68,68,0.85)', glow: '#ef4444' },
];

// Node box. Height is bounded by the 150px row pitch the layout engine and the
// saved graphs use - taller than ~120 and stacked rows start touching.
const NODE_MIN_W = 200;
const NODE_MIN_H = 112;

const getNodeAccent = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NODE_PALETTE[Math.abs(hash) % NODE_PALETTE.length];
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

// ── Handle style: brand blue ──────────────────────────────────────────────
const handleStyleBase = {
  background: '#3B82F6',
  width: 9,
  height: 9,
  border: '2px solid #000000',
  transition: 'opacity 0.2s ease, transform 0.2s ease',
};
const handleHidden  = { ...handleStyleBase, opacity: 0 };
const handleVisible = { ...handleStyleBase, opacity: 1 };

const CustomNode = memo(({ id, data, selected }: { id: string; data: any; selected?: boolean }) => {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [localLabel, setLocalLabel] = useState(data.label || 'Service');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [nodeSize, setNodeSize] = useState({ width: NODE_MIN_W, height: NODE_MIN_H });
  const accent = getNodeAccent(id);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.max(1, Math.round(entry.contentRect.width));
        const height = Math.max(1, Math.round(entry.contentRect.height));
        setNodeSize({ width, height });
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setLocalLabel(data.label || 'Service');
  }, [data.label]);

  const currentSnapshot = data.simulationSnapshots?.[data.currentTick];
  const nodeMetrics = currentSnapshot?.nodeMetrics || currentSnapshot?.node_metrics || [];
  const nodeMetric = nodeMetrics.find((m: any) => {
    const metricNodeId = m?.nodeId ?? m?.node_id ?? m?.id;
    return String(metricNodeId) === String(id);
  });
  const metricState = String(nodeMetric?.state ?? nodeMetric?.nodeState ?? '').toLowerCase();
  const metricErrorRate = Number(nodeMetric?.errorRate ?? nodeMetric?.error_rate ?? 0);
  const metricIsOverloaded = Boolean(nodeMetric?.isOverloaded ?? nodeMetric?.is_overloaded);
  const metricQueueDepth = Number(nodeMetric?.queueDepth ?? nodeMetric?.queue_depth ?? 0);
  const ghostRisk = typeof data.ghostRisk === 'number' ? data.ghostRisk : undefined;
  const hasSimulationSnapshots = (data.simulationSnapshots?.length ?? 0) > 0;
  const showGhostRisk = typeof ghostRisk === 'number' && !hasSimulationSnapshots;

  const nodeColor = useMemo(() => {
    if (nodeMetric) {
      if (metricState === 'dead' || metricState === 'failed' || metricIsOverloaded) return 'rgba(239,68,68,0.25)';
      if (metricErrorRate > 0.1 || metricState === 'degraded' || metricState === 'restarting') return 'rgba(245,158,11,0.25)';
      return 'rgba(16,185,129,0.20)';
    }

    return accent.bg;
  }, [nodeMetric, metricState, metricErrorRate, metricIsOverloaded, accent.bg]);

  const nodeBorderColor = useMemo(() => {
    if (nodeMetric) {
      if (metricState === 'dead' || metricState === 'failed' || metricIsOverloaded) return 'rgba(239,68,68,0.8)';
      if (metricErrorRate > 0.1 || metricState === 'degraded' || metricState === 'restarting') return 'rgba(245,158,11,0.8)';
      return 'rgba(16,185,129,0.6)';
    }

    return accent.border;
  }, [nodeMetric, metricState, metricErrorRate, metricIsOverloaded, accent.border]);

  let statusColor = '#3F3F46'; // Zinc-600
  if (data.isActive)     statusColor = accent.glow;
  if (data.isOverloaded) statusColor = '#EF4444';

  const isSelected = Boolean(selected || data.selected);

  const borderColor = showGhostRisk && ghostRisk > 0.6
    ? 'rgba(245,158,11,0.8)'
    : showGhostRisk && ghostRisk > 0.3
      ? 'rgba(245,158,11,0.55)'
      : nodeBorderColor;

  const shadow = isSelected
    ? `0 0 0 1px ${accent.glow}50, 0 0 25px ${accent.glow}35, 0 8px 30px rgba(0,0,0,0.8)`
    : hovered
    ? '0 0 0 1px rgba(59,130,246,0.15), 0 0 15px rgba(59,130,246,0.1), 0 5px 22px rgba(0,0,0,0.7)'
    : `0 0 0 1px ${accent.border}, 0 4px 20px rgba(0,0,0,0.7)`;
  const combinedShadow = showGhostRisk && ghostRisk > 0.6
    ? `${shadow}, 0 0 12px rgba(245,158,11,0.6)`
    : shadow;

  const hs = hovered ? handleVisible : handleHidden;
  const nodeClassName = [
    data.isKilled ? 'ring-2 ring-red-500 opacity-40' : '',
    !data.isKilled && data.isDegraded ? 'ring-2 ring-amber-500 opacity-70' : '',
  ].filter(Boolean).join(' ');
  const resolvedIcon = normalizeIconPath(data.iconPath || ICON_MAP[data.label] || ICON_MAP[data.type] || DEFAULT_ARCHITECTURE_ICON);
  // Sized from width alone, deliberately. Height is driven by the content, so
  // deriving the icon from min(width, height) fed the icon back into the box it
  // was measured from; the loop settled, but at a size neither constant chose.
  // ResizeObserver reports the *content* box: a default 200px node measures 166.
  const iconSize = Math.max(44, Math.min(80, Math.floor(nodeSize.width * 0.28)));

  const commitLabel = () => {
    const nextLabel = localLabel.trim() || 'Service';
    data.label = nextLabel;
    if (typeof data.onLabelChange === 'function') {
      data.onLabelChange(String(id), nextLabel);
    }
    setEditing(false);
  };

  return (
    <div
      ref={rootRef}
      className={nodeClassName}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'rgba(24, 24, 27, 0.4)', // bg-zinc-900/40
        backgroundColor: nodeColor,
        backdropFilter: 'blur(16px)',
        borderColor,
        borderWidth: isSelected ? '2px' : '1px',
        borderStyle: 'solid',
        padding: '10px 16px',
        minWidth: `${NODE_MIN_W}px`,
        minHeight: `${NODE_MIN_H}px`,
        boxShadow: combinedShadow,
        borderRadius: '10px',
        transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        position: 'relative',
        overflow: 'visible',
        width: '100%',
        height: '100%',
      }}
    >
      <NodeResizer
        minWidth={NODE_MIN_W}
        minHeight={NODE_MIN_H}
        keepAspectRatio={false}
        isVisible={isSelected}
        lineStyle={{ borderColor: 'rgba(148,163,184,0.45)' }}
        handleStyle={{ width: 9, height: 9 }}
      />

      {showGhostRisk && ghostRisk > 0.3 && (
        <div className="absolute left-3 top-3 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
          Risk: {Math.round(ghostRisk * 100)}%
        </div>
      )}

      {metricIsOverloaded && (
        <div className="absolute inset-0 rounded-2xl animate-ping border-2 border-red-500/40 pointer-events-none" />
      )}

      {/* Subtle blue top-edge highlight */}
      <div style={{
        position: 'absolute', top: 0, left: '10%', right: '10%',
        height: '1px',
        background: isSelected
          ? `linear-gradient(90deg, transparent, ${accent.glow}60, transparent)`
          : `linear-gradient(90deg, transparent, ${accent.glow}25, transparent)`,
      }} />

      <Handle type="target" position={Position.Top}    id="top"           style={hs} />
      <Handle type="target" position={Position.Left}   id="left"          style={hs} />
      <Handle type="target" position={Position.Right}  id="right"         style={hs} />
      <Handle type="target" position={Position.Bottom} id="bottom-target" style={hs} />

      <div className="absolute right-3 top-3" style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: statusColor,
        boxShadow: data.isActive ? `0 0 10px ${statusColor}` : 'none',
        transition: 'all 0.4s ease',
      }} />

      <div className="flex h-full w-full flex-col items-center justify-center text-center gap-1.5">
        <div
          className="flex items-center justify-center rounded-md border border-white/15 overflow-hidden shadow-[0_0_12px_rgba(255,255,255,0.08)]"
          style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
        >
          <img
            src={resolvedIcon}
            alt={localLabel || 'service icon'}
            className="rounded-md p-1 object-contain"
            style={{
              width: `${iconSize}px`,
              height: `${iconSize}px`,
              backgroundColor: `${accent.glow}40`,
              filter: 'brightness(1.22) saturate(1.15) contrast(1.05)',
            }}
            draggable={false}
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

        {editing ? (
          <input
            autoFocus
            value={localLabel}
            onChange={(event) => setLocalLabel(event.target.value)}
            onBlur={commitLabel}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitLabel();
              }
            }}
            className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-center text-[15px] font-semibold text-white outline-none focus:border-blue-500/50"
          />
        ) : (
          <div
            onDoubleClick={() => setEditing(true)}
            title={localLabel}
            style={{
              color: isSelected ? '#FFFFFF' : '#E4E4E7',
              fontSize: '15px',
              fontWeight: isSelected ? 700 : 600,
              fontFamily: 'Inter, sans-serif',
              letterSpacing: '-0.01em',
              textDecoration: data.isKilled ? 'line-through' : 'none',
              cursor: 'text',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {localLabel}
          </div>
        )}

        <div style={{
          color: isSelected ? '#93C5FD' : '#A1A1AA',
          fontSize: '11.5px',
          fontFamily: 'JetBrains Mono, monospace',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 700,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {data.type}
        </div>

        {data.isSimulating && nodeMetric && (
          <div
            className="text-[10.5px] font-mono opacity-70"
            style={{ color: metricQueueDepth > 50 ? '#ef4444' : '#6b7280' }}
          >
            Q:{metricQueueDepth}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Top}    id="top-source"   style={hs} />
      <Handle type="source" position={Position.Left}   id="left-source"  style={hs} />
      <Handle type="source" position={Position.Right}  id="right-source" style={hs} />
      <Handle type="source" position={Position.Bottom} id="bottom"       style={hs} />
    </div>
  );
});

CustomNode.displayName = 'CustomNode';

const GroupNode = memo(({ data, selected }: { data: any; selected?: boolean }) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      border: '2px dashed rgba(59,130,246,0.4)',
      borderRadius: '12px',
      backgroundColor: 'rgba(59,130,246,0.03)',
      position: 'relative',
    }}
  >
    <NodeResizer
      minWidth={200}
      minHeight={150}
      keepAspectRatio={false}
      isVisible={Boolean(selected)}
      lineStyle={{ borderColor: 'rgba(148,163,184,0.45)' }}
      handleStyle={{ width: 9, height: 9 }}
    />
    <div
      style={{
        position: 'absolute',
        top: -12,
        left: 12,
        background: '#000',
        padding: '2px 10px',
        borderRadius: '6px',
        border: '1px solid rgba(59,130,246,0.3)',
        color: '#60a5fa',
        fontSize: '11px',
        fontWeight: 700,
        fontFamily: 'JetBrains Mono, monospace',
        textTransform: 'uppercase',
      }}
    >
      {data.label || 'Group'}
    </div>
  </div>
));

GroupNode.displayName = 'GroupNode';

const nodeTypes: NodeTypes = {
  custom: CustomNode,
  group: GroupNode,
};

interface FlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  /**
   * Selecting an edge is how `callKind` gets set, and until now there was no
   * way to select one at all -- the field existed end to end in the types, the
   * bridge and the engine, with no UI able to reach it.
   */
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
  onInit: (instance: any) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onNodeContextMenu?: (event: React.MouseEvent, node: Node) => void;
  onPaneContextMenu?: (event: React.MouseEvent) => void;
  onNodeLabelChange?: (nodeId: string, label: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  killedNodes?: Set<string>;
  degradedNodes?: Set<string>;
  simulationSnapshots?: Array<{
    tick: number;
    nodeMetrics: Array<{
      nodeId: string;
      errorRate: number;
      isOverloaded: boolean;
      queueDepth: number;
      state: string;
    }>;
  }>;
  currentTick?: number;
  isSimulating?: boolean;
  ghostTraceRisks?: {
    edgeRisks: EdgeRiskScore[];
    nodeRisks: NodeRiskScore[];
  };
}

export const FlowCanvas = memo(({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onEdgeClick,
  onInit,
  onDrop,
  onDragOver,
  onNodeContextMenu,
  onPaneContextMenu,
  onNodeLabelChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  killedNodes,
  degradedNodes,
  simulationSnapshots,
  currentTick,
  isSimulating,
  ghostTraceRisks,
}: FlowCanvasProps) => {
  const SimPacketDots = ({ edges, isSimulating }: { edges: any[]; isSimulating: boolean }) => {
    const [, setDots] = useState<Array<{ id: string; edgeId: string; progress: number }>>([]);

    useEffect(() => {
      if (!isSimulating) {
        setDots([]);
        return;
      }
      const interval = setInterval(() => {
        setDots((prev) => {
          const moved = prev
            .map((d) => ({ ...d, progress: d.progress + 0.05 }))
            .filter((d) => d.progress < 1);
          if (Math.random() < 0.4 && edges.length > 0) {
            const edge = edges[Math.floor(Math.random() * edges.length)];
            moved.push({ id: `dot-${Date.now()}-${Math.random()}`, edgeId: edge.id, progress: 0 });
          }
          return moved.slice(-30);
        });
      }, 50);
      return () => clearInterval(interval);
    }, [isSimulating, edges]);

    return null;
  };

  const nodeRiskById = useMemo(
    () => new Map((ghostTraceRisks?.nodeRisks || []).map((risk) => [risk.nodeId, risk.riskScore])),
    [ghostTraceRisks],
  );

  const edgeRiskById = useMemo(
    () => new Map((ghostTraceRisks?.edgeRisks || []).map((risk) => [risk.edgeId, risk])),
    [ghostTraceRisks],
  );

  const decoratedNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    data: {
      ...(node.data || {}),
      ghostRisk: (node.data as { ghostRisk?: number } | undefined)?.ghostRisk ?? nodeRiskById.get(node.id),
      isKilled: killedNodes?.has(node.id) ?? false,
      isDegraded: degradedNodes?.has(node.id) ?? false,
      iconPath: (node.data as { iconPath?: string } | undefined)?.iconPath
        || ICON_MAP[(node.data as { label?: string } | undefined)?.label || '']
        || ICON_MAP[(node.data as { type?: string } | undefined)?.type || '']
        || DEFAULT_ARCHITECTURE_ICON,
      onLabelChange: onNodeLabelChange,
      simulationSnapshots,
      currentTick,
      isSimulating,
    },
  })), [nodes, nodeRiskById, killedNodes, degradedNodes, simulationSnapshots, currentTick, isSimulating, onNodeLabelChange]);

  const sourceAccentByNodeId = useMemo(
    () => new Map(nodes.map((node) => [String(node.id), getNodeAccent(String(node.id)).glow])),
    [nodes],
  );

  const decoratedEdges = useMemo(() => edges.map((edge) => {
    const sourceGlow = sourceAccentByNodeId.get(String(edge.source)) || '#94a3b8';
    const brightStroke = `${sourceGlow}cc`;

    const baseEdge: Edge = {
      ...edge,
      style: {
        ...(edge.style || {}),
        stroke: brightStroke,
        strokeWidth: 2.4,
        filter: `drop-shadow(0 0 4px ${sourceGlow}aa)`,
      },
      markerEnd: edge.markerEnd && typeof edge.markerEnd === 'object'
        ? { ...edge.markerEnd, color: sourceGlow, width: 22, height: 22 }
        : { type: 'arrowclosed', color: sourceGlow, width: 22, height: 22 },
    };

    if ((simulationSnapshots?.length ?? 0) > 0) {
      return baseEdge;
    }

    const edgeRisk = edgeRiskById.get(edge.id);
    if (!edgeRisk) {
      return baseEdge;
    }

    const isHighRisk = edgeRisk.riskScore > 0.6;
    const isMediumRisk = edgeRisk.riskScore > 0.3;

    if (!isHighRisk && !isMediumRisk) {
      return baseEdge;
    }

    const stroke = isHighRisk ? 'rgba(245,158,11,0.9)' : 'rgba(245,158,11,0.5)';
    const strokeWidth = isHighRisk ? 3 : 2;

    return {
      ...baseEdge,
      animated: baseEdge.animated || isHighRisk,
      style: {
        ...(baseEdge.style || {}),
        stroke,
        strokeWidth,
      },
      markerEnd: baseEdge.markerEnd && typeof baseEdge.markerEnd === 'object'
        ? { ...baseEdge.markerEnd, color: stroke }
        : baseEdge.markerEnd,
    };
  }), [edges, edgeRiskById, simulationSnapshots, sourceAccentByNodeId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <SimPacketDots edges={edges} isSimulating={!!isSimulating} />
      <ReactFlow
        nodes={decoratedNodes}
        edges={decoratedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={(event, edge) => onEdgeClick?.(event as unknown as React.MouseEvent, edge)}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          onNodeContextMenu?.(event as unknown as React.MouseEvent, node);
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          onPaneContextMenu?.(event as unknown as React.MouseEvent);
        }}
        nodeTypes={nodeTypes}
        fitView
        style={{ backgroundColor: '#0a0a0f' }}
        onInit={onInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <Background gap={32} size={1} color="rgba(59,130,246,0.10)" />
        {/* Replaces the default bottom-left <Controls>: zoom lives up here now,
            alongside undo/redo, rather than being split across two widgets. */}
        <Panel position="top-center" className="!m-0 !mt-4">
          <CanvasToolbar
            onUndo={() => onUndo?.()}
            onRedo={() => onRedo?.()}
            canUndo={Boolean(canUndo)}
            canRedo={Boolean(canRedo)}
          />
        </Panel>
        <MiniMap
          nodeColor={() => '#3B82F6'}
          maskColor="rgba(0,0,0,0.6)"
          style={{
            backgroundColor: 'rgba(24, 24, 27, 0.4)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
          }}
        />
      </ReactFlow>
    </div>
  );
});

FlowCanvas.displayName = 'FlowCanvas';
