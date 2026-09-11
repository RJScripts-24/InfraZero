import { useCallback, useEffect, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';

export interface GraphSnapshot {
  nodes: Node[];
  edges: Edge[];
}

/** Deepest undo stack we keep; beyond this the oldest entries are dropped. */
const HISTORY_LIMIT = 100;

/** How long the graph must sit still before the change becomes one undo step. */
const SETTLE_MS = 350;

/**
 * Identity of a graph for undo purposes.
 *
 * Deliberately excludes `selected`, `dragging` and `measured`: clicking a node
 * or letting React Flow measure it after mount are not edits, and treating them
 * as edits would fill the stack with steps that look like no-ops when undone.
 */
function signature(nodes: Node[], edges: Edge[]): string {
  const n = nodes.map((node) => {
    const data = (node.data ?? {}) as Record<string, unknown>;
    return [
      node.id,
      Math.round(node.position?.x ?? 0),
      Math.round(node.position?.y ?? 0),
      node.width ?? null,
      node.height ?? null,
      node.parentId ?? null,
      data.label ?? null,
      data.type ?? null,
      data.iconPath ?? null,
    ];
  });
  const e = edges.map((edge) => [
    edge.id,
    edge.source,
    edge.target,
    edge.sourceHandle ?? null,
    edge.targetHandle ?? null,
    edge.label ?? null,
  ]);
  return JSON.stringify({ n, e });
}

/**
 * Snapshots are stored detached from React Flow's live objects: `data` is
 * mutated in place when a node label is edited inline, which would otherwise
 * rewrite history entries that have already been recorded.
 */
function snapshotOf(nodes: Node[], edges: Edge[]): GraphSnapshot {
  return {
    nodes: nodes.map((node) => ({
      ...node,
      selected: false,
      dragging: false,
      position: { ...node.position },
      data: { ...(node.data ?? {}) },
    })),
    edges: edges.map((edge) => ({ ...edge })),
  };
}

interface Options {
  nodes: Node[];
  edges: Edge[];
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
}

export interface GraphHistory {
  undo: () => boolean;
  redo: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
  /**
   * Re-baselines history and clears both stacks. For graph replacements the user
   * did not perform as an edit - opening a saved project, joining a collaboration
   * session - so undo cannot rewind past the load and wipe the canvas.
   *
   * Pass the graph being loaded rather than relying on the one in state: this is
   * called in the same tick as setNodes/setEdges, before React has re-rendered.
   */
  reset: (nextNodes?: Node[], nextEdges?: Edge[]) => void;
}

export function useGraphHistory({ nodes, edges, setNodes, setEdges }: Options): GraphHistory {
  const past = useRef<GraphSnapshot[]>([]);
  const future = useRef<GraphSnapshot[]>([]);
  const present = useRef<GraphSnapshot>(snapshotOf(nodes, edges));
  const lastSignature = useRef<string>(signature(nodes, edges));

  /** Set while an undo/redo is being applied, holding the signature we expect. */
  const restoreTarget = useRef<string | null>(null);
  const restoreTimeout = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);
  const latest = useRef<GraphSnapshot>({ nodes, edges });
  latest.current = { nodes, edges };

  const [depth, setDepth] = useState({ undo: 0, redo: 0 });
  const syncDepth = useCallback(() => {
    setDepth({ undo: past.current.length, redo: future.current.length });
  }, []);

  useEffect(() => {
    const next = signature(nodes, edges);

    if (restoreTarget.current !== null) {
      // setNodes and setEdges can land in separate renders; ignore the
      // half-applied intermediate and wait for the state we asked for.
      if (next !== restoreTarget.current) return;
      restoreTarget.current = null;
      if (restoreTimeout.current) window.clearTimeout(restoreTimeout.current);
      restoreTimeout.current = null;
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
      lastSignature.current = next;
      present.current = snapshotOf(nodes, edges);
      return;
    }

    if (next === lastSignature.current) return;

    // A drag emits a position update per frame. Record the result, not the path.
    if (nodes.some((node) => node.dragging)) return;

    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      const current = latest.current;
      const settled = signature(current.nodes, current.edges);
      if (settled === lastSignature.current) return;

      past.current = [...past.current, present.current].slice(-HISTORY_LIMIT);
      future.current = [];
      present.current = snapshotOf(current.nodes, current.edges);
      lastSignature.current = settled;
      syncDepth();
    }, SETTLE_MS);
  }, [nodes, edges, syncDepth]);

  useEffect(() => () => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    if (restoreTimeout.current) window.clearTimeout(restoreTimeout.current);
  }, []);

  const apply = useCallback((snapshot: GraphSnapshot) => {
    restoreTarget.current = signature(snapshot.nodes, snapshot.edges);
    present.current = snapshot;

    // A collaborator's edit can land between our setNodes and setEdges, so the
    // signature we are waiting for may never arrive. Without this the latch would
    // stay armed and stop recording history for the rest of the session.
    if (restoreTimeout.current) window.clearTimeout(restoreTimeout.current);
    restoreTimeout.current = window.setTimeout(() => {
      restoreTimeout.current = null;
      if (restoreTarget.current === null) return;
      restoreTarget.current = null;
      present.current = snapshotOf(latest.current.nodes, latest.current.edges);
      lastSignature.current = signature(latest.current.nodes, latest.current.edges);
    }, 1000);

    // Hand out copies so later edits cannot reach back into the stored entry.
    setNodes(snapshot.nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...(node.data ?? {}) } })));
    setEdges(snapshot.edges.map((edge) => ({ ...edge })));
    syncDepth();
  }, [setNodes, setEdges, syncDepth]);

  const undo = useCallback(() => {
    const previous = past.current[past.current.length - 1];
    if (!previous) return false;
    past.current = past.current.slice(0, -1);
    future.current = [present.current, ...future.current].slice(0, HISTORY_LIMIT);
    apply(previous);
    return true;
  }, [apply]);

  const redo = useCallback(() => {
    const next = future.current[0];
    if (!next) return false;
    future.current = future.current.slice(1);
    past.current = [...past.current, present.current].slice(-HISTORY_LIMIT);
    apply(next);
    return true;
  }, [apply]);

  const reset = useCallback((nextNodes?: Node[], nextEdges?: Edge[]) => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = null;
    restoreTarget.current = null;
    past.current = [];
    future.current = [];
    const baseNodes = nextNodes ?? latest.current.nodes;
    const baseEdges = nextEdges ?? latest.current.edges;
    present.current = snapshotOf(baseNodes, baseEdges);
    lastSignature.current = signature(baseNodes, baseEdges);
    syncDepth();
  }, [syncDepth]);

  return { undo, redo, canUndo: depth.undo > 0, canRedo: depth.redo > 0, reset };
}
