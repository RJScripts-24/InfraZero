import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Share2,
  ChevronDown,
  ChevronUp,
  Edit3,
  Sparkles,
  Check,
  FileImage,
  PanelLeftClose,
  PanelLeftOpen,
  Terminal,
  Zap,
} from 'lucide-react';
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
import { ImportDiagramPopup } from '../components/ImportDiagramPopup';
import { ReportView } from '../components/ReportView';
import { authFetch, isTemporaryGuest } from '../../lib/auth';

// ─── Static data ──────────────────────────────────────────────────────────────

const initialNodes: Node[] = [
  { id: '1', type: 'custom', position: { x: 250, y: 100 }, data: { label: 'API Gateway',   type: 'Load Balancer', isActive: true } },
  { id: '2', type: 'custom', position: { x: 100, y: 250 }, data: { label: 'Auth Service',  type: 'Node Service' } },
  { id: '3', type: 'custom', position: { x: 400, y: 250 }, data: { label: 'API Service',   type: 'Node Service',  isActive: true } },
  { id: '4', type: 'custom', position: { x: 250, y: 400 }, data: { label: 'PostgreSQL',    type: 'Database' } },
];

const edgeBase = {
  type: 'smoothstep',
  animated: false,
  style: { stroke: 'rgba(59,130,246,0.5)', strokeWidth: 2.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#3B82F6', width: 16, height: 16 },
};

const initialEdges: Edge[] = [
  { ...edgeBase, id: 'e1-2', source: '1', target: '2', sourceHandle: 'bottom', targetHandle: 'top' },
  { ...edgeBase, id: 'e1-3', source: '1', target: '3', sourceHandle: 'bottom', targetHandle: 'top' },
  { ...edgeBase, id: 'e2-4', source: '2', target: '4', sourceHandle: 'bottom', targetHandle: 'top' },
  { ...edgeBase, id: 'e3-4', source: '3', target: '4', sourceHandle: 'bottom', targetHandle: 'top' },
];

const componentList = [
  { id: 'load-balancer', name: 'Load Balancer',  type: 'Infrastructure' },
  { id: 'api-gateway',   name: 'API Gateway',    type: 'Gateway' },
  { id: 'auth-service',  name: 'Auth Service',   type: 'Service' },
  { id: 'database',      name: 'Database',       type: 'PostgreSQL' },
  { id: 'redis-cache',   name: 'Redis Cache',    type: 'Cache' },
  { id: 'queue',         name: 'Queue',          type: 'RabbitMQ' },
  { id: 'worker',        name: 'Worker',         type: 'Background Job' },
  { id: 'cdn',           name: 'CDN',            type: 'Edge Network' },
];

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const [projectName, setProjectName]     = useState('velocis-architecture-v3');
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
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [currentTick, setCurrentTick] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [chaosEvents, setChaosEvents] = useState<any[]>([]);
  const [killedNodes, setKilledNodes] = useState<Set<string>>(new Set());
  const [degradedNodes, setDegradedNodes] = useState<Set<string>>(new Set());
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [peerCursors, setPeerCursors] = useState<Map<string, {x:number,y:number}>>(new Map());
  const [libraryItems, setLibraryItems] = useState<any[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

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
      if (msg.type === 'cursor_update') setPeerCursors(prev => new Map(prev).set(msg.userId, {x: msg.x, y: msg.y}));
      if (msg.type === 'node_moved') setNodes(nds => nds.map(n => n.id === msg.nodeId ? {...n, position: {x: msg.x, y: msg.y}} : n));
      if (msg.type === 'graph_updated') { setNodes(msg.nodes); setEdges(msg.edges); }
    };

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [projectName, sendWsMessage, setNodes, setEdges]);

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

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            style: { stroke: 'rgba(59,130,246,0.5)', strokeWidth: 2.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#3B82F6', width: 16, height: 16 },
            animated: mode === 'sim',
          },
          eds,
        ),
      );
    },
    [setEdges, mode],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!rfInstance) return;
      const type          = e.dataTransfer.getData('application/reactflow');
      const componentData = JSON.parse(e.dataTransfer.getData('application/json'));
      if (!type) return;
      const position = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setNodes((nds) =>
        nds.concat({
          id: `${Date.now()}`,
          type: 'custom',
          position,
          data: { label: componentData.name, type: componentData.type, isActive: false },
        }),
      );
    },
    [rfInstance, setNodes],
  );

  const onDragStart = (e: React.DragEvent, component: (typeof componentList)[0]) => {
    e.dataTransfer.setData('application/reactflow', 'custom');
    e.dataTransfer.setData('application/json', JSON.stringify(component));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleGenerate = async () => {
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
      const graph = await response.json();
      if (graph.nodes?.length > 0) {
        setNodes(graph.nodes.map((n: any) => ({
          ...n,
          type: 'custom',
          data: { ...n.data, isActive: true },
        })));
      }
      if (graph.edges?.length > 0) {
        setEdges(graph.edges.map((e: any) => ({ ...edgeBase, ...e })));
      }
      sendWsMessage({ type: 'graph_replace', workspaceId: projectName, nodes: graph.nodes, edges: graph.edges });
      setAiPrompt('');
    } catch (err) {
      console.error('[AI Generate Error]', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShareClick = () => {
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

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
    setLogs(['[SYSTEM] Initializing simulation engine...']);
    try {
      const seed = Date.now() % 0xFFFFFFFF;
      const response = await authFetch('/api/simulations/run', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ nodes, edges, seed, chaosEnabled: chaosEvents.length > 0, chaosEvents }),
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
    const formattedNodes = importedNodes.map((node) => ({
      ...node,
      type: 'custom',
      data: { ...node.data, isActive: false },
    }));

    const formattedEdges = importedEdges.map((edge) => ({
      ...edgeBase,
      ...edge,
    }));

    setNodes((nds) => [...nds, ...formattedNodes]);
    setEdges((eds) => [...eds, ...formattedEdges]);

    setTerminalExpanded(true);
    const importLogs = [
      '[IMPORT] Vision API analysis complete',
      '[HASH] Stable Blue Hash verified',
      '[READY] Workspace re-synchronized',
    ];
    setLogs(importLogs);
  };

  return (
    <div className="h-screen flex flex-col relative overflow-hidden" style={{ backgroundColor: '#000000', fontFamily: 'Inter, sans-serif' }}>
      
      {/* ── Background Atmosphere ── */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
        <img src="/night-hero.png" alt="Atmosphere" className="absolute inset-0 object-cover w-full h-full mix-blend-screen" />
      </div>

      {/* Grid overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[1]"
        style={{
          backgroundImage: 'repeating-linear-gradient(to right, rgba(59,130,246,0.06) 0px, rgba(59,130,246,0.06) 1px, transparent 1px, transparent 80px), repeating-linear-gradient(to bottom, rgba(59,130,246,0.06) 0px, rgba(59,130,246,0.06) 1px, transparent 1px, transparent 80px)',
          backgroundSize: '80px 80px',
        }}
      />

      {/* ── HEADER ── */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b relative z-20 backdrop-blur-md bg-black/40 border-white/5"
        style={{ height: '70px' }}
      >
        <div className="h-full px-10 flex items-center justify-between">
          {/* Left: Project Branding */}
          <div className="flex items-center gap-6">
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
          <div className="p-1 bg-zinc-900/60 rounded-2xl border border-white/5 flex gap-1 shadow-2xl">
            {(['edit', 'sim'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-8 py-2 rounded-xl text-xs font-bold transition-all uppercase tracking-widest ${
                  mode === m ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'text-zinc-500 hover:text-white'
                }`}
              >
                {m === 'edit' ? 'Architect' : 'Simulator'}
              </button>
            ))}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleShareClick}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-xs hover:bg-white/10 transition-all"
            >
              {linkCopied ? <Check size={14} className="text-blue-400" /> : <Share2 size={14} />}
              <span className="tracking-widest uppercase">{linkCopied ? 'STABLE' : 'SHARE'}</span>
            </button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDeployTest}
              className="iz-btn-blue relative overflow-hidden py-2.5 px-8 rounded-xl text-white font-bold text-xs shadow-xl transition-all"
            >
              <span style={{ position:'absolute', top:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to left, rgba(30,58,138,0), #000000)', animation:'izAnimateTop 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
              <span style={{ position:'absolute', top:0, right:0, height:'100%', width:'2px', background:'linear-gradient(to top, rgba(30,58,138,0), #000000)', animation:'izAnimateRight 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
              <span style={{ position:'absolute', bottom:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to right, rgba(30,58,138,0), #000000)', animation:'izAnimateBottom 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
              <span style={{ position:'absolute', top:0, left:0, height:'100%', width:'2px', background:'linear-gradient(to bottom, rgba(30,58,138,0), #000000)', animation:'izAnimateLeft 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
              DEPLOY & TEST
            </motion.button>
          </div>
        </div>
      </motion.header>

      {/* ── BODY ── */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        
        {/* Left Sidebar: AI & Components (Glassmorphism) */}
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.aside
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="w-[320px] border-r border-white/5 bg-zinc-950/40 backdrop-blur-3xl flex flex-col relative z-20"
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
                    {tab === 'ai' ? 'Vision Prompt' : 'Primitives'}
                    {activeTab === tab && (
                      <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]" />
                    )}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
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
                  <div className="grid grid-cols-1 gap-3">
                    {componentList.map((component) => (
                      <motion.div
                        key={component.id}
                        whileHover={{ x: 4, scale: 1.02 }}
                        className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 cursor-grab active:cursor-grabbing hover:bg-white/[0.06] hover:border-blue-500/30 transition-all"
                        draggable
                        onDragStartCapture={(e) => onDragStart(e, component)}
                      >
                         <div className="text-zinc-200 font-bold text-sm mb-1">{component.name}</div>
                         <div className="text-zinc-600 text-[10px] uppercase font-bold tracking-widest">{component.type}</div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Canvas Area */}
        <div className="flex-1 relative z-10" ref={reactFlowWrapper} onMouseMove={(e) => sendWsMessage({ type: 'cursor_move', workspaceId: projectName, userId: 'local', x: e.clientX, y: e.clientY })}>
          
          {/* Toggle Sidebar Button */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute top-6 left-6 z-30 p-3 rounded-2xl bg-zinc-900/80 border border-white/10 text-white hover:bg-zinc-800 transition-all shadow-2xl"
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
            killedNodes={killedNodes}
            degradedNodes={degradedNodes}
            simulationSnapshots={snapshots}
            currentTick={currentTick}
            isSimulating={isSimulating}
          />

          {/* Canvas Labels / Overlays */}
          <div className="absolute bottom-8 left-8 z-30 pointer-events-none opacity-40 select-none">
             <div className="text-white font-mono text-[10px] font-bold tracking-[0.5em] uppercase mb-1">Canvas Replicated State</div>
             <div className="text-zinc-500 font-mono text-[8px] tracking-[0.2em] uppercase">Stable Snapshot_ v1.02.3 // Sector 7</div>
          </div>
        </div>

        {/* Right Inspector: Node Config (Glassmorphism) */}
        <AnimatePresence>
          {selectedNode && (
            <motion.aside
              initial={{ x: 340, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 340, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="w-[340px] border-l border-white/5 bg-zinc-950/40 backdrop-blur-3xl p-8 overflow-y-auto z-20 custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-8">
                 <div className="text-blue-500 text-[10px] font-bold uppercase tracking-[0.2em]">Node Inspector</div>
                 <button onClick={() => setSelectedNode(null)} className="text-zinc-600 hover:text-white transition-colors">
                    <X size={20} />
                 </button>
              </div>

              <div className="mb-10">
                 <h3 className="text-white text-xl font-bold tracking-tight mb-2">{(selectedNode.data as { label?: string }).label ?? 'Untitled Node'}</h3>
                 <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest">{(selectedNode.data as { type?: string }).type ?? 'Unknown'}</p>
              </div>

              <div className="space-y-8">
                 {/* Runtime Params */}
                 <div className="space-y-4">
                    <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest border-b border-white/5 pb-2">Runtime Vectors</div>
                    {(['processingPower', 'coldStartLatency', 'failureRate'].map((field) => (
                       <div key={field} className="space-y-2">
                          <label className="text-[11px] text-zinc-500 font-medium px-1">{field}</label>
                          <input
                            type="text"
                            defaultValue={field === 'failureRate' ? '0.01%' : '200ms'}
                            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/40 transition-all font-mono"
                          />
                       </div>
                    )))}
                 </div>

                 {/* Network Params */}
                 <div className="space-y-4">
                    <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest border-b border-white/5 pb-2">Network Latency</div>
                    {(['latency', 'jitter', 'bandwidthLimit'].map((field) => (
                       <div key={field} className="space-y-2">
                          <label className="text-[11px] text-zinc-500 font-medium px-1">{field}</label>
                          <input
                            type="text"
                            defaultValue={field === 'bandwidthLimit' ? '1Gbps' : '20ms'}
                            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/40 transition-all font-mono"
                          />
                       </div>
                    )))}
                 </div>

                 <div className="space-y-3 mt-6">
                   <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest border-b border-white/5 pb-2">
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
          className="h-12 flex items-center justify-between px-10 hover:bg-white/5 transition-colors group"
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

      <ReportView
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        projectName={projectName}
        reportData={simulationResult ? {
          simulationId: simulationResult.universeSeed || 'N/A',
          universeSeed: simulationResult.universeSeed || 'N/A',
          stableHash: simulationResult.graphHash || 'N/A',
          grade: simulationResult.grade || 'F',
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

      {Array.from(peerCursors.entries()).map(([uid, cursor]) => (
        <div key={uid} className="pointer-events-none fixed z-50" style={{ left: cursor.x, top: cursor.y }}>
          <div className="w-3 h-3 rounded-full bg-blue-400 shadow-lg" />
          <span className="text-blue-400 text-xs font-mono ml-1">{uid}</span>
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