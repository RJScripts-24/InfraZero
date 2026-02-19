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

// ── Handle style: only visible on hover ──────────────────────────────────────
const handleStyleBase = {
  background: '#00FFA3',
  width: 9,
  height: 9,
  border: '2px solid #030E0D',
  transition: 'opacity 0.2s ease, transform 0.2s ease',
};
const handleHidden  = { ...handleStyleBase, opacity: 0 };
const handleVisible = { ...handleStyleBase, opacity: 1 };

// ── Per-type border accent colours ───────────────────────────────────────────
const TYPE_ACCENT: Record<string, string> = {
  'Load Balancer': 'rgba(0,255,170,0.42)',
  'Node Service':  'rgba(60,200,255,0.38)',
  'Database':      'rgba(160,90,255,0.38)',
  'Cache':         'rgba(255,200,50,0.38)',
  'Background Job':'rgba(255,140,0,0.35)',
  'RabbitMQ':      'rgba(255,80,80,0.35)',
  'Edge Network':  'rgba(80,210,255,0.35)',
  'Gateway':       'rgba(0,255,170,0.42)',
};

const getAccent = (type: string) => TYPE_ACCENT[type] ?? 'rgba(0,255,170,0.28)';

const CustomNode = memo(({ data }: { data: any }) => {
  const [hovered, setHovered] = useState(false);

  let statusColor = '#4A7A72';
  if (data.isActive)     statusColor = '#00FFA3';
  if (data.isOverloaded) statusColor = '#FF3B3B';

  const accent     = getAccent(data.type);
  const isSelected = !!data.selected;

  const borderColor = isSelected
    ? '#00FFA3'
    : hovered
    ? accent.replace(/,[^,]+\)$/, ',0.7)')
    : accent;

  const shadow = isSelected
    ? '0 0 0 1px rgba(0,255,170,0.25), 0 0 20px rgba(0,255,170,0.16), 0 6px 20px rgba(0,0,0,0.7)'
    : hovered
    ? '0 0 0 1px rgba(0,255,170,0.1), 0 0 14px rgba(0,255,170,0.07), 0 5px 22px rgba(0,0,0,0.6)'
    : '0 2px 10px rgba(0,0,0,0.55)';

  const hs = hovered ? handleVisible : handleHidden;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'linear-gradient(155deg, #081A18 0%, #040F0E 55%, #030C0C 100%)',
        borderColor,
        borderWidth: isSelected ? '1.5px' : '1px',
        borderStyle: 'solid',
        padding: '12px 16px',
        minWidth: '180px',
        boxShadow: shadow,
        borderRadius: '3px',
        transition: 'box-shadow 0.22s ease, border-color 0.22s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle inner top-edge highlight */}
      <div style={{
        position: 'absolute', top: 0, left: '15%', right: '15%',
        height: '1px',
        background: isSelected
          ? 'linear-gradient(90deg, transparent, rgba(0,255,170,0.25), transparent)'
          : 'linear-gradient(90deg, transparent, rgba(0,255,170,0.1), transparent)',
      }} />

      <Handle type="target" position={Position.Top}    id="top"           style={hs} />
      <Handle type="target" position={Position.Left}   id="left"          style={hs} />
      <Handle type="target" position={Position.Right}  id="right"         style={hs} />
      <Handle type="target" position={Position.Bottom} id="bottom-target" style={hs} />

      <div className="flex items-start justify-between mb-2">
        <div style={{
          color: isSelected ? '#FFFFFF' : '#DFF0EC',
          fontSize: '14px',
          fontWeight: isSelected ? 600 : 500,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: isSelected ? '0.01em' : '0',
          transition: 'color 0.2s',
        }}>
          {data.label}
        </div>
        <div style={{
          width: '7px', height: '7px', borderRadius: '50%',
          backgroundColor: statusColor,
          marginTop: '3px', flexShrink: 0,
          boxShadow: data.isActive ? `0 0 7px ${statusColor}` : 'none',
        }} />
      </div>

      <div style={{
        color: '#5A8880',
        fontSize: '11px',
        fontFamily: 'JetBrains Mono, monospace',
        letterSpacing: '0.02em',
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

// Stable reference — never recreated on render
const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

// Noise texture SVG (data URI) for subtle canvas grain
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
}: FlowCanvasProps) => {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        style={{ backgroundColor: '#030E0D' }}
        onInit={onInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        {/* Dot grid — slightly reduced opacity for softer base */}
        <Background gap={22} size={1} color="rgba(0,255,170,0.045)" />
        <Controls
          style={{
            backgroundColor: '#040F0E',
            border: '1px solid rgba(0,255,170,0.18)',
            borderRadius: '3px',
          }}
        />
        <MiniMap
          nodeColor={() => '#00FFA3'}
          maskColor="rgba(2,9,8,0.8)"
          style={{
            backgroundColor: '#040F0E',
            border: '1px solid rgba(0,255,170,0.18)',
            borderRadius: '3px',
          }}
        />
      </ReactFlow>

      {/* Layer 1 — Radial centre glow (subtle warm spot at centre) */}
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
          background: 'radial-gradient(ellipse 55% 55% at 50% 46%, rgba(0,255,170,0.025) 0%, transparent 70%)',
        }}
      />

      {/* Layer 2 — Radial depth falloff (centre brighter, edges darker) */}
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
          background: 'radial-gradient(ellipse 75% 75% at 50% 50%, transparent 35%, rgba(2,9,8,0.45) 100%)',
        }}
      />

      {/* Layer 3 — Edge vignette (inset shadow feel) */}
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
          boxShadow: 'inset 0 0 90px rgba(2,9,8,0.55)',
        }}
      />

      {/* Layer 4 — Subtle noise grain texture */}
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
          opacity: 0.028,
          backgroundImage: NOISE_SVG,
          backgroundSize: '200px 200px',
          backgroundRepeat: 'repeat',
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  );
});

FlowCanvas.displayName = 'FlowCanvas';
