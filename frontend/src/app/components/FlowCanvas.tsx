import { memo, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
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
  const breachAffected = Boolean(data.breachAffected);
  const breachSeverity = String(data.breachSeverity ?? '').toLowerCase();
  const hasSimulationSnapshots = (data.simulationSnapshots?.length ?? 0) > 0;
  const showGhostRisk = typeof ghostRisk === 'number' && !hasSimulationSnapshots && !breachAffected;

  const nodeColor = useMemo(() => {
    if (nodeMetric) {
      if (metricState === 'dead' || metricState === 'failed' || metricIsOverloaded) return 'rgba(239,68,68,0.25)';
      if (metricErrorRate > 0.1 || metricState === 'degraded' || metricState === 'restarting') return 'rgba(245,158,11,0.25)';
      return 'rgba(16,185,129,0.20)';
    }

    if (breachAffected) {
      if (breachSeverity === 'critical') return 'rgba(239,68,68,0.24)';
      if (breachSeverity === 'high') return 'rgba(239,68,68,0.18)';
      if (breachSeverity === 'medium') return 'rgba(245,158,11,0.18)';
      return 'rgba(245,158,11,0.12)';
    }

    return 'rgba(59,130,246,0.15)';
  }, [nodeMetric, metricState, metricErrorRate, metricIsOverloaded, breachAffected, breachSeverity]);

  const nodeBorderColor = useMemo(() => {
    if (nodeMetric) {
      if (metricState === 'dead' || metricState === 'failed' || metricIsOverloaded) return 'rgba(239,68,68,0.8)';
      if (metricErrorRate > 0.1 || metricState === 'degraded' || metricState === 'restarting') return 'rgba(245,158,11,0.8)';
      return 'rgba(16,185,129,0.6)';
    }

    if (breachAffected) {
      if (breachSeverity === 'critical') return 'rgba(239,68,68,0.95)';
      if (breachSeverity === 'high') return 'rgba(239,68,68,0.8)';
      if (breachSeverity === 'medium') return 'rgba(245,158,11,0.85)';
      return 'rgba(245,158,11,0.5)';
    }

    return 'rgba(59,130,246,0.4)';
  }, [nodeMetric, metricState, metricErrorRate, metricIsOverloaded, breachAffected, breachSeverity]);

  let statusColor = '#3F3F46'; // Zinc-600
  if (data.isActive)     statusColor = '#3B82F6';
  if (data.isOverloaded) statusColor = '#EF4444';

  const isSelected = Boolean(selected || data.selected);

  const borderColor = showGhostRisk && ghostRisk > 0.6
    ? 'rgba(245,158,11,0.8)'
    : showGhostRisk && ghostRisk > 0.3
      ? 'rgba(245,158,11,0.55)'
      : nodeBorderColor;

  const shadow = isSelected
    ? '0 0 0 1px rgba(59,130,246,0.3), 0 0 25px rgba(59,130,246,0.2), 0 8px 30px rgba(0,0,0,0.8)'
    : hovered
    ? '0 0 0 1px rgba(59,130,246,0.15), 0 0 15px rgba(59,130,246,0.1), 0 5px 22px rgba(0,0,0,0.7)'
    : '0 4px 15px rgba(0,0,0,0.6)';
  const combinedShadow = showGhostRisk && ghostRisk > 0.6
    ? `${shadow}, 0 0 12px rgba(245,158,11,0.6)`
    : shadow;
  const showCriticalBreachPulse = breachAffected && breachSeverity === 'critical' && !nodeMetric;

  const hs = hovered ? handleVisible : handleHidden;
  const nodeClassName = [
    data.isKilled ? 'ring-2 ring-red-500 opacity-40' : '',
    !data.isKilled && data.isDegraded ? 'ring-2 ring-amber-500 opacity-70' : '',
  ].filter(Boolean).join(' ');
  const resolvedIcon = normalizeIconPath(data.iconPath || ICON_MAP[data.label] || ICON_MAP[data.type] || DEFAULT_ARCHITECTURE_ICON);

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
        padding: '10px 14px',
        minWidth: '160px',
        minHeight: '80px',
        boxShadow: combinedShadow,
        borderRadius: '10px',
        transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <NodeResizer minWidth={160} minHeight={80} isVisible={isSelected} />

      {showGhostRisk && ghostRisk > 0.3 && (
        <div className="absolute left-3 top-3 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200">
          Risk: {Math.round(ghostRisk * 100)}%
        </div>
      )}

      {metricIsOverloaded && (
        <div className="absolute inset-0 rounded-2xl animate-ping border-2 border-red-500/40 pointer-events-none" />
      )}

      {showCriticalBreachPulse && (
        <div className="absolute inset-0 rounded-2xl animate-ping border-2 border-red-500/50 pointer-events-none" />
      )}

      {/* Subtle blue top-edge highlight */}
      <div style={{
        position: 'absolute', top: 0, left: '10%', right: '10%',
        height: '1px',
        background: isSelected
          ? 'linear-gradient(90deg, transparent, rgba(59,130,246,0.4), transparent)'
          : 'linear-gradient(90deg, transparent, rgba(59,130,246,0.1), transparent)',
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

      <div className="flex h-full w-full flex-col items-center justify-center text-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 bg-black/35 overflow-hidden">
          <img
            src={resolvedIcon}
            alt={localLabel || 'service icon'}
            className="h-6 w-6 object-contain"
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
            className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-center text-[13px] font-semibold text-white outline-none focus:border-blue-500/50"
          />
        ) : (
          <div
            onDoubleClick={() => setEditing(true)}
            style={{
              color: isSelected ? '#FFFFFF' : '#E4E4E7',
              fontSize: '13px',
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
          color: isSelected ? '#93C5FD' : '#71717A',
          fontSize: '10px',
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
            className="text-[9px] font-mono opacity-70"
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
    <NodeResizer minWidth={200} minHeight={150} isVisible={Boolean(selected)} />
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
  onInit: (instance: any) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onNodeContextMenu?: (event: React.MouseEvent, node: Node) => void;
  onPaneContextMenu?: (event: React.MouseEvent) => void;
  onNodeLabelChange?: (nodeId: string, label: string) => void;
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
  onInit,
  onDrop,
  onDragOver,
  onNodeContextMenu,
  onPaneContextMenu,
  onNodeLabelChange,
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

  const decoratedEdges = useMemo(() => edges.map((edge) => {
    if ((simulationSnapshots?.length ?? 0) > 0) {
      return edge;
    }

    const edgeRisk = edgeRiskById.get(edge.id);
    if (!edgeRisk) {
      return edge;
    }

    const isHighRisk = edgeRisk.riskScore > 0.6;
    const isMediumRisk = edgeRisk.riskScore > 0.3;

    if (!isHighRisk && !isMediumRisk) {
      return edge;
    }

    const stroke = isHighRisk ? 'rgba(245,158,11,0.9)' : 'rgba(245,158,11,0.5)';
    const strokeWidth = isHighRisk ? 3 : 2;

    return {
      ...edge,
      animated: edge.animated || isHighRisk,
      style: {
        ...(edge.style || {}),
        stroke,
        strokeWidth,
      },
      markerEnd: edge.markerEnd && typeof edge.markerEnd === 'object'
        ? { ...edge.markerEnd, color: stroke }
        : edge.markerEnd,
    };
  }), [edges, edgeRiskById, simulationSnapshots]);

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
        <Controls
          style={{
            backgroundColor: 'rgba(24, 24, 27, 0.4)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        />
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
