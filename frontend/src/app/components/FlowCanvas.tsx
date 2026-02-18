import { memo } from 'react';
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

// All statics defined at module level — never recreated on any render
const handleStyle = {
  background: '#00FFA3',
  width: 8,
  height: 8,
  border: '2px solid #040F0E',
};

const CustomNode = memo(({ data }: { data: any }) => {
  let statusColor = '#8FA9A3';
  if (data.isActive) statusColor = '#00FFA3';
  if (data.isOverloaded) statusColor = '#FF3B3B';

  return (
    <div
      className="border"
      style={{
        backgroundColor: '#040F0E',
        borderColor: data.selected ? '#00FFA3' : 'rgba(0,255,170,0.25)',
        borderWidth: data.selected ? '2px' : '1px',
        padding: '12px 16px',
        minWidth: '180px',
        boxShadow: data.selected ? '0 0 12px rgba(0,255,170,0.3)' : 'none',
        borderRadius: '2px',
      }}
    >
      <Handle type="target" position={Position.Top}    id="top"           style={handleStyle} />
      <Handle type="target" position={Position.Left}   id="left"          style={handleStyle} />
      <Handle type="target" position={Position.Right}  id="right"         style={handleStyle} />
      <Handle type="target" position={Position.Bottom} id="bottom-target" style={handleStyle} />

      <div className="flex items-start justify-between mb-2">
        <div style={{ color: '#E6F1EF', fontSize: '14px', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
          {data.label}
        </div>
        <div className="rounded-full" style={{ width: '8px', height: '8px', backgroundColor: statusColor }} />
      </div>
      <div style={{ color: '#8FA9A3', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}>
        {data.type}
      </div>

      <Handle type="source" position={Position.Top}    id="top-source"   style={handleStyle} />
      <Handle type="source" position={Position.Left}   id="left-source"  style={handleStyle} />
      <Handle type="source" position={Position.Right}  id="right-source" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom"       style={handleStyle} />
    </div>
  );
});

CustomNode.displayName = 'CustomNode';

// Defined here at module level — stable reference forever
const nodeTypes: NodeTypes = {
  custom: CustomNode,
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
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      nodeTypes={nodeTypes}
      fitView
      style={{ backgroundColor: '#041615' }}
      onInit={onInit}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <Background gap={16} size={1} color="rgba(0,255,170,0.06)" />
      <Controls
        style={{
          backgroundColor: '#040F0E',
          border: '1px solid rgba(0,255,170,0.2)',
        }}
      />
      <MiniMap
        nodeColor={() => '#00FFA3'}
        maskColor="rgba(2,9,8,0.8)"
        style={{
          backgroundColor: '#040F0E',
          border: '1px solid rgba(0,255,170,0.2)',
        }}
      />
    </ReactFlow>
  );
});

FlowCanvas.displayName = 'FlowCanvas';
