import { useMemo } from 'react';

export interface DiagramNode {
  id: string;
  position?: { x: number; y: number };
  data?: { label?: string; type?: string };
}

export interface DiagramEdge {
  id?: string;
  source: string;
  target: string;
}

export interface DiagramAnnotation {
  /** Recommendation number shown in the badge, matching the recommendations list. */
  index: number;
  nodeIds: string[];
  edgeIds: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  action: string;
}

const PRIORITY_COLOR: Record<DiagramAnnotation['priority'], string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
};

const TYPE_COLOR: Record<string, string> = {
  Infrastructure: '#38bdf8',
  Gateway: '#a78bfa',
  'Node Service': '#34d399',
  Database: '#f472b6',
  Cache: '#fbbf24',
  RabbitMQ: '#fb923c',
  'Background Job': '#22d3ee',
  'Edge Network': '#818cf8',
};

const NODE_W = 150;
const NODE_H = 54;
const PAD = 70;

interface Props {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  annotations: DiagramAnnotation[];
  /** Set on the <svg> so the PDF exporter can find and serialise it. */
  svgId?: string;
  /** Cap on rendered height; tall portrait diagrams shrink to fit rather than letterbox. */
  maxHeight?: number;
}

/**
 * The uploaded/drawn architecture, redrawn as a static block diagram with the
 * recommendations pinned onto the components they apply to.
 *
 * Laid out from the canvas' own coordinates rather than re-running a layout
 * algorithm, so the diagram in the report is recognisably the same picture the
 * user drew. Nodes with no stored position fall back to a grid.
 */
export function ArchitectureDiagram({ nodes, edges, annotations, svgId = 'iz-architecture-diagram', maxHeight = 620 }: Props) {
  const layout = useMemo(() => {
    if (nodes.length === 0) {
      return { placed: [], width: 800, height: 300 };
    }

    const withPositions = nodes.map((node, index) => {
      const hasPosition =
        node.position && Number.isFinite(node.position.x) && Number.isFinite(node.position.y);
      return {
        id: String(node.id),
        label: node.data?.label || String(node.id),
        type: node.data?.type || 'Node Service',
        x: hasPosition ? node.position!.x : (index % 4) * 240,
        y: hasPosition ? node.position!.y : Math.floor(index / 4) * 170,
      };
    });

    const minX = Math.min(...withPositions.map((n) => n.x));
    const minY = Math.min(...withPositions.map((n) => n.y));
    const maxX = Math.max(...withPositions.map((n) => n.x));
    const maxY = Math.max(...withPositions.map((n) => n.y));

    const placed = withPositions.map((n) => ({
      ...n,
      x: n.x - minX + PAD,
      y: n.y - minY + PAD,
    }));

    return {
      placed,
      width: maxX - minX + NODE_W + PAD * 2,
      height: maxY - minY + NODE_H + PAD * 2,
    };
  }, [nodes]);

  const byId = useMemo(
    () => new Map(layout.placed.map((n) => [n.id, n])),
    [layout.placed],
  );

  /** Highest-priority annotation per node drives its outline colour. */
  const nodeAnnotations = useMemo(() => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    const map = new Map<string, DiagramAnnotation[]>();
    for (const annotation of annotations) {
      for (const nodeId of annotation.nodeIds) {
        const list = map.get(nodeId) ?? [];
        list.push(annotation);
        map.set(nodeId, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => rank[a.priority] - rank[b.priority]);
    }
    return map;
  }, [annotations]);

  const flaggedEdgeIds = useMemo(() => {
    const set = new Set<string>();
    for (const annotation of annotations) {
      for (const edgeId of annotation.edgeIds) set.add(edgeId);
    }
    return set;
  }, [annotations]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-sm text-zinc-500">
        No architecture to display.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        id={svgId}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          // Giving the element the viewBox's own aspect ratio is what removes the
          // letterboxing a fixed height would otherwise introduce. maxWidth keeps a
          // tall portrait topology from rendering metres high at full container width.
          width: '100%',
          aspectRatio: `${layout.width} / ${layout.height}`,
          maxWidth: layout.height > layout.width
            ? `${Math.round(maxHeight * (layout.width / layout.height))}px`
            : undefined,
          display: 'block',
          margin: '0 auto',
        }}
        role="img"
        aria-label="Architecture diagram with recommended changes highlighted"
      >
        {/* Explicit background: the PDF exporter rasterises this SVG on its own,
            where the page's dark background is not present. */}
        <rect x="0" y="0" width={layout.width} height={layout.height} fill="#08080c" rx="16" />

        <defs>
          <marker id="iz-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(148,163,184,0.75)" />
          </marker>
          <marker id="iz-arrow-flagged" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f97316" />
          </marker>
        </defs>

        {/* Edges first so nodes sit on top of them. */}
        {edges.map((edge, index) => {
          const from = byId.get(String(edge.source));
          const to = byId.get(String(edge.target));
          if (!from || !to) return null;

          const flagged = edge.id ? flaggedEdgeIds.has(String(edge.id)) : false;
          const x1 = from.x + NODE_W / 2;
          const y1 = from.y + NODE_H;
          const x2 = to.x + NODE_W / 2;
          const y2 = to.y;
          const midY = (y1 + y2) / 2;

          return (
            <path
              key={edge.id || `${edge.source}-${edge.target}-${index}`}
              d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
              fill="none"
              stroke={flagged ? '#f97316' : 'rgba(148,163,184,0.45)'}
              strokeWidth={flagged ? 2.5 : 1.5}
              strokeDasharray={flagged ? '6 4' : undefined}
              markerEnd={`url(#${flagged ? 'iz-arrow-flagged' : 'iz-arrow'})`}
            />
          );
        })}

        {layout.placed.map((node) => {
          const flags = nodeAnnotations.get(node.id) ?? [];
          const top = flags[0];
          const outline = top ? PRIORITY_COLOR[top.priority] : 'rgba(255,255,255,0.16)';
          const accent = TYPE_COLOR[node.type] || '#94a3b8';

          return (
            <g key={node.id}>
              {top && (
                <rect
                  x={node.x - 4}
                  y={node.y - 4}
                  width={NODE_W + 8}
                  height={NODE_H + 8}
                  rx="14"
                  fill="none"
                  stroke={outline}
                  strokeWidth="1.5"
                  opacity="0.35"
                />
              )}
              <rect
                x={node.x}
                y={node.y}
                width={NODE_W}
                height={NODE_H}
                rx="11"
                fill="rgba(24,24,27,0.95)"
                stroke={outline}
                strokeWidth={top ? 2 : 1}
              />
              <rect x={node.x} y={node.y} width="3.5" height={NODE_H} rx="1.75" fill={accent} />

              <text
                x={node.x + 14}
                y={node.y + 23}
                fill="#f4f4f5"
                fontSize="12.5"
                fontWeight="600"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {node.label.length > 19 ? `${node.label.slice(0, 18)}…` : node.label}
              </text>
              <text
                x={node.x + 14}
                y={node.y + 40}
                fill="#71717a"
                fontSize="9"
                fontWeight="700"
                letterSpacing="0.9"
                fontFamily="ui-monospace, monospace"
              >
                {node.type.toUpperCase()}
              </text>

              {/* Numbered badges tie the component back to the recommendations list. */}
              {flags.slice(0, 3).map((flag, i) => (
                <g key={`${node.id}-${flag.index}`}>
                  <circle
                    cx={node.x + NODE_W - 12 - i * 21}
                    cy={node.y - 5}
                    r="10.5"
                    fill={PRIORITY_COLOR[flag.priority]}
                    stroke="#08080c"
                    strokeWidth="2"
                  />
                  <text
                    x={node.x + NODE_W - 12 - i * 21}
                    y={node.y - 1}
                    fill="#0a0a0a"
                    fontSize="11"
                    fontWeight="800"
                    textAnchor="middle"
                    fontFamily="Inter, system-ui, sans-serif"
                  >
                    {flag.index}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export { PRIORITY_COLOR };
