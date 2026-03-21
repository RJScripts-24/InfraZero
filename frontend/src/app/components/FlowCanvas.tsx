import { memo, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

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

const CustomNode = memo(({ id, data }: { id: string; data: any }) => {
  const [hovered, setHovered] = useState(false);

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
    if (!nodeMetric) return 'rgba(59,130,246,0.15)';
    if (metricState === 'dead' || metricState === 'failed' || metricIsOverloaded) return 'rgba(239,68,68,0.25)';
    if (metricErrorRate > 0.1 || metricState === 'degraded' || metricState === 'restarting') return 'rgba(245,158,11,0.25)';
    return 'rgba(16,185,129,0.20)';
  }, [nodeMetric, metricState, metricErrorRate, metricIsOverloaded]);

  const nodeBorderColor = useMemo(() => {
    if (!nodeMetric) return 'rgba(59,130,246,0.4)';
    if (metricState === 'dead' || metricState === 'failed' || metricIsOverloaded) return 'rgba(239,68,68,0.8)';
    if (metricErrorRate > 0.1 || metricState === 'degraded' || metricState === 'restarting') return 'rgba(245,158,11,0.8)';
    return 'rgba(16,185,129,0.6)';
  }, [nodeMetric, metricState, metricErrorRate, metricIsOverloaded]);

  let statusColor = '#3F3F46'; // Zinc-600
  if (data.isActive)     statusColor = '#3B82F6';
  if (data.isOverloaded) statusColor = '#EF4444';

  const isSelected = !!data.selected;

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

  const hs = hovered ? handleVisible : handleHidden;
  const nodeClassName = [
    data.isKilled ? 'ring-2 ring-red-500 opacity-40' : '',
    !data.isKilled && data.isDegraded ? 'ring-2 ring-amber-500 opacity-70' : '',
  ].filter(Boolean).join(' ');

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
        padding: '16px 20px',
        minWidth: '200px',
        boxShadow: combinedShadow,
        borderRadius: '16px',
        transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {showGhostRisk && ghostRisk > 0.3 && (
        <div className="absolute right-9 top-3 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200">
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
          ? 'linear-gradient(90deg, transparent, rgba(59,130,246,0.4), transparent)'
          : 'linear-gradient(90deg, transparent, rgba(59,130,246,0.1), transparent)',
      }} />

      <Handle type="target" position={Position.Top}    id="top"           style={hs} />
      <Handle type="target" position={Position.Left}   id="left"          style={hs} />
      <Handle type="target" position={Position.Right}  id="right"         style={hs} />
      <Handle type="target" position={Position.Bottom} id="bottom-target" style={hs} />

      <div className="flex items-start justify-between mb-3">
        <div style={{
          color: isSelected ? '#FFFFFF' : '#E4E4E7', // Zinc-200
          fontSize: '15px',
          fontWeight: isSelected ? 700 : 600,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: '-0.01em',
          textDecoration: data.isKilled ? 'line-through' : 'none',
        }}>
          {data.label}
        </div>
        {data.isSimulating && nodeMetric && (
          <div
            className="text-[9px] font-mono mt-1 opacity-70"
            style={{ color: metricQueueDepth > 50 ? '#ef4444' : '#6b7280' }}
          >
            Q:{metricQueueDepth}
          </div>
        )}
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          backgroundColor: statusColor,
          marginTop: '4px', flexShrink: 0,
          boxShadow: data.isActive ? `0 0 10px ${statusColor}` : 'none',
          transition: 'all 0.4s ease',
        }} />
      </div>

      <div style={{
        color: isSelected ? '#93C5FD' : '#71717A', // Blue-300 : Zinc-400
        fontSize: '11px',
        fontFamily: 'JetBrains Mono, monospace',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        fontWeight: 600,
      }}>
        {data.type}
      </div>

      <Handle type="source" position={Position.Top}    id="top-source"   style={hs} />
      <Handle type="source" position={Position.Left}   id="left-source"  style={hs} />
      <Handle type="source" position={Position.Right}  id="right-source" style={hs} />
      <Handle type="source" position={Position.Bottom} id="bottom"       style={hs} />
    </div>
  );
});

CustomNode.displayName = 'CustomNode';

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

// Subtle canvas grain
const NOISE_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

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
      simulationSnapshots,
      currentTick,
      isSimulating,
    },
  })), [nodes, nodeRiskById, killedNodes, degradedNodes, simulationSnapshots, currentTick, isSimulating]);

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
        nodeTypes={nodeTypes}
        fitView
        style={{ backgroundColor: '#000000' }}
        onInit={onInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <Background gap={32} size={1} color="rgba(59,130,246,0.06)" />
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

      {/* Layer 1 — Radial blue glow */}
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
          background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(59,130,246,0.04) 0%, transparent 80%)',
        }}
      />

      {/* Layer 2 — Radial depth falloff */}
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
          background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.5) 100%)',
        }}
      />

      {/* Layer 3 — Grain */}
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
          opacity: 0.03,
          backgroundImage: NOISE_SVG,
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  );
});

FlowCanvas.displayName = 'FlowCanvas';
