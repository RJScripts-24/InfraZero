import { memo, useState } from 'react';
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

// ── Per-type border accent colours (Unified Blue/Silver) ─────────────────────
const TYPE_ACCENT: Record<string, string> = {
  'Load Balancer': 'rgba(59,130,246,0.6)',
  'Node Service':  'rgba(96,165,250,0.5)',
  'Database':      'rgba(147,197,253,0.5)',
  'Cache':         'rgba(191,219,254,0.5)',
  'Background Job':'rgba(59,130,246,0.5)',
  'RabbitMQ':      'rgba(30,64,175,0.5)',
  'Edge Network':  'rgba(96,165,250,0.5)',
  'Gateway':       'rgba(59,130,246,0.6)',
};

const getAccent = (type: string) => TYPE_ACCENT[type] ?? 'rgba(59,130,246,0.4)';

const CustomNode = memo(({ data }: { data: any }) => {
  const [hovered, setHovered] = useState(false);

  let statusColor = '#3F3F46'; // Zinc-600
  if (data.isActive)     statusColor = '#3B82F6';
  if (data.isOverloaded) statusColor = '#EF4444';

  const accent     = getAccent(data.type);
  const isSelected = !!data.selected;

  const borderColor = isSelected
    ? '#3B82F6'
    : hovered
    ? accent.replace(/,[^,]+\)$/, ',0.8)')
    : accent;

  const shadow = isSelected
    ? '0 0 0 1px rgba(59,130,246,0.3), 0 0 25px rgba(59,130,246,0.2), 0 8px 30px rgba(0,0,0,0.8)'
    : hovered
    ? '0 0 0 1px rgba(59,130,246,0.15), 0 0 15px rgba(59,130,246,0.1), 0 5px 22px rgba(0,0,0,0.7)'
    : '0 4px 15px rgba(0,0,0,0.6)';

  const hs = hovered ? handleVisible : handleHidden;

  return (
    <div
      className={data.isKilled ? 'ring-2 ring-red-500 opacity-50' : ''}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'rgba(24, 24, 27, 0.4)', // bg-zinc-900/40
        backdropFilter: 'blur(16px)',
        borderColor,
        borderWidth: isSelected ? '2px' : '1px',
        borderStyle: 'solid',
        padding: '16px 20px',
        minWidth: '200px',
        boxShadow: shadow,
        borderRadius: '16px',
        transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
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
        }}>
          {data.label}
        </div>
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
}: FlowCanvasProps) => {
  const decoratedNodes = nodes.map((node) => ({
    ...node,
    data: {
      ...(node.data || {}),
      isKilled: killedNodes?.has(node.id) ?? false,
    },
  }));

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={decoratedNodes}
        edges={edges}
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
