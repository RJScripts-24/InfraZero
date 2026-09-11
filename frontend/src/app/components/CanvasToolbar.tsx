import { useReactFlow, useStore, useStoreApi, useViewport } from '@xyflow/react';
import { Lock, Maximize2, Redo2, Undo2, Unlock, ZoomIn, ZoomOut } from 'lucide-react';

interface Props {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const BTN = 'flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400';

/**
 * Floating canvas toolbar. Rendered inside <ReactFlow> so it can read the live
 * viewport - the zoom readout has to follow wheel and trackpad zooming, not just
 * presses of these buttons.
 */
export function CanvasToolbar({ onUndo, onRedo, canUndo, canRedo }: Props) {
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow();
  const { zoom } = useViewport();
  const store = useStoreApi();
  const isInteractive = useStore(
    (state) => state.nodesDraggable || state.nodesConnectable || state.elementsSelectable,
  );

  const toggleInteractive = () => {
    store.setState({
      nodesDraggable: !isInteractive,
      nodesConnectable: !isInteractive,
      elementsSelectable: !isInteractive,
    });
  };

  const modifier = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

  return (
    <div
      className="flex items-center gap-0.5 rounded-2xl border border-white/10 bg-zinc-900/80 p-1.5 shadow-2xl backdrop-blur-2xl"
      // The canvas swallows wheel/drag events; the toolbar must not pan the graph.
      onContextMenu={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className={BTN}
        title={`Undo (${modifier}+Z)`}
        aria-label="Undo"
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        className={BTN}
        title={`Redo (${modifier}+Shift+Z)`}
        aria-label="Redo"
      >
        <Redo2 size={16} />
      </button>

      <div className="mx-1 h-5 w-px bg-white/10" />

      <button type="button" onClick={() => zoomOut({ duration: 150 })} className={BTN} title="Zoom out" aria-label="Zoom out">
        <ZoomOut size={16} />
      </button>
      <button
        type="button"
        onClick={() => zoomTo(1, { duration: 200 })}
        className="min-w-[52px] rounded-lg px-2 py-1 text-center font-mono text-[11px] font-bold tabular-nums text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
        title="Reset zoom to 100%"
        aria-label="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" onClick={() => zoomIn({ duration: 150 })} className={BTN} title="Zoom in" aria-label="Zoom in">
        <ZoomIn size={16} />
      </button>
      <button
        type="button"
        onClick={() => fitView({ padding: 0.2, duration: 300 })}
        className={BTN}
        title="Fit view"
        aria-label="Fit view"
      >
        <Maximize2 size={16} />
      </button>

      <div className="mx-1 h-5 w-px bg-white/10" />

      <button
        type="button"
        onClick={toggleInteractive}
        className={BTN}
        title={isInteractive ? 'Lock canvas' : 'Unlock canvas'}
        aria-label={isInteractive ? 'Lock canvas' : 'Unlock canvas'}
      >
        {isInteractive ? <Unlock size={16} /> : <Lock size={16} />}
      </button>
    </div>
  );
}
