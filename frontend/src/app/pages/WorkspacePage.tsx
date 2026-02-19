import { useState, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
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
  style: { stroke: 'rgba(0,255,170,0.48)', strokeWidth: 2.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#00FFA3', width: 16, height: 16 },
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

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            style: { stroke: 'rgba(0,255,170,0.48)', strokeWidth: 2.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#00FFA3', width: 16, height: 16 },
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

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setNodes((nds) => [
        ...nds,
        {
          id: `${Date.now()}`,
          type: 'custom',
          position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
          data: { label: 'Redis Cache', type: 'Cache', isActive: false },
        },
      ]);
    }, 2000);
  };

  const handleShareClick = () => {
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleDeployTest = () => {
    setMode('sim');
    setTerminalExpanded(true);
    setSimulationComplete(false);
    const messages = [
      '[INFO] Starting Simulation...',
      '[INFO] Universe Seed: 783492',
      '[SYNC] Stable Hash Verified',
      '[INFO] Running 10,000 requests...',
      "[WARN] Service 'Auth' latency spike detected",
      '[INFO] Applying backpressure...',
      '[INFO] System stabilized',
      '[INFO] Simulation complete.',
      'ARCHITECTURE GRADE: B-',
      'ESTIMATED COST INDEX: 0.67',
      'ROOT CAUSE: Missing Redis cache layer',
    ];
    setLogs([]);
    messages.forEach((msg, i) => {
      setTimeout(() => {
        setLogs((p) => [...p, msg]);
        // Enable report button after last log
        if (i === messages.length - 1) {
          setTimeout(() => setSimulationComplete(true), 500);
        }
      }, i * 400);
    });
    setEdges((eds) => eds.map((edge) => ({ ...edge, animated: true })));
  };

  const handleImportDiagram = (importedNodes: any[], importedEdges: any[]) => {
    // Add imported nodes to canvas
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

    // Log to terminal
    setTerminalExpanded(true);
    const importLogs = [
      '[IMPORT] Diagram compiled',
      '[HASH] Stable SHA-256 verified',
      '[READY] Simulation parameters initialized',
    ];
    setLogs(importLogs);
  };

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: '#020908', fontFamily: 'Inter, sans-serif' }}>
      {/* Grid overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to right, rgba(0,255,170,0.06) 0px, rgba(0,255,170,0.06) 1px, transparent 1px, transparent 80px)',
          backgroundSize: '80px 100%',
          zIndex: 1,
        }}
      />

      {/* ── HEADER ── */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'linear' }}
        className="border-b relative z-10"
        style={{ height: '64px', backgroundColor: '#040F0E', borderColor: 'rgba(0,255,170,0.15)' }}
      >
        <div className="h-full px-6 flex items-center justify-between">
          {/* Left */}
          <div>
            {isEditingName ? (
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onBlur={() => setIsEditingName(false)}
                onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                autoFocus
                className="border-b outline-none"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: '#00FFA3',
                  color: '#E6F1EF',
                  fontSize: '16px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 500,
                  width: '300px',
                }}
              />
            ) : (
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsEditingName(true)}>
                <span style={{ color: '#E6F1EF', fontSize: '16px', fontWeight: 500 }}>{projectName}</span>
                <Edit3 style={{ width: '14px', height: '14px', color: '#8FA9A3' }} />
              </div>
            )}
            <div
              className="mt-1"
              style={{
                color: mode === 'sim' ? '#00FFA3' : '#8FA9A3',
                fontSize: '11px',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {mode === 'sim' ? 'SIMULATION RUNNING' : 'Saved locally'}
            </div>
          </div>

          {/* Center */}
          <div
            className="flex border"
            style={{ backgroundColor: '#020908', borderColor: 'rgba(0,255,170,0.25)', borderRadius: '2px' }}
          >
            {(['edit', 'sim'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="px-6 py-2 transition-all"
                style={{
                  backgroundColor: mode === m ? '#00FFA3' : 'transparent',
                  color: mode === m ? '#020908' : '#8FA9A3',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                {m === 'edit' ? 'Edit Mode' : 'Sim Mode'}
              </button>
            ))}
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {['A', 'B'].map((u, i) => (
                <div
                  key={i}
                  className="relative rounded-full border-2 flex items-center justify-center"
                  style={{ width: '32px', height: '32px', backgroundColor: '#040F0E', borderColor: '#00FFA3', color: '#00FFA3', fontSize: '12px' }}
                >
                  {u}
                  <div
                    className="absolute bottom-0 right-0 rounded-full border-2"
                    style={{ width: '8px', height: '8px', backgroundColor: '#00FFA3', borderColor: '#040F0E' }}
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handleShareClick}
              className="flex items-center gap-2 border px-4 py-2 transition-all"
              style={{ borderColor: 'rgba(0,255,170,0.3)', color: '#00FFA3', backgroundColor: 'transparent', borderRadius: '2px', fontSize: '13px' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#00FFA3')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(0,255,170,0.3)')}
            >
              {linkCopied ? <Check style={{ width: '16px', height: '16px' }} /> : <Share2 style={{ width: '16px', height: '16px' }} />}
              {linkCopied ? 'COPIED' : 'SHARE'}
            </button>

            <button
              onClick={handleDeployTest}
              className="flex items-center gap-2 px-5 py-2 transition-all"
              style={{ backgroundColor: '#00FFA3', color: '#020908', borderRadius: '2px', fontSize: '13px', fontWeight: 600 }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#00D98C')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00FFA3')}
            >
              DEPLOY &amp; TEST
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', opacity: 0.8 }}>SIM</span>
            </button>
          </div>
        </div>
      </motion.header>

      {/* ── BODY ── */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Left sidebar */}
        <motion.aside
          initial={{ opacity: 0, x: -10 }}
          animate={{ 
            opacity: isSidebarOpen ? 1 : 0,
            x: isSidebarOpen ? 0 : -10,
            width: isSidebarOpen ? '300px' : '0px',
          }}
          transition={{ duration: 0.3, ease: 'linear' }}
          className="border-r overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #071816 0%, #040F0E 40%, #030D0C 100%)',
            borderColor: 'rgba(0,255,170,0.15)',
            boxShadow: 'inset -1px 0 0 rgba(0,255,170,0.04)',
          }}
        >
          <div className="h-full flex flex-col" style={{ width: '300px' }}>
            <div className="flex border-b" style={{ borderColor: 'rgba(0,255,170,0.15)' }}>
              {(['ai', 'components'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="flex-1 py-3 text-center uppercase tracking-wider relative"
                  style={{ color: activeTab === tab ? '#00FFA3' : '#8FA9A3', fontSize: '11px', fontWeight: 600 }}
                >
                  {tab === 'ai' ? 'AI PROMPTER' : 'COMPONENTS'}
                  {activeTab === tab && (
                    <div className="absolute bottom-0 left-0 right-0" style={{ height: '2px', backgroundColor: '#00FFA3' }} />
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'ai' ? (
                <div className="space-y-4">
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder={'Paste README.md or type:\n"Build a Netflix-like microservices backend"'}
                    className="w-full border p-3 resize-none outline-none"
                    rows={8}
                    style={{
                      backgroundColor: '#020A09',
                      borderColor: 'rgba(0,255,170,0.2)',
                      color: '#DFF0EC',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '12px',
                      borderRadius: '3px',
                      boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.35)',
                      lineHeight: '1.6',
                      transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#00FFA3';
                      e.currentTarget.style.boxShadow = 'inset 0 2px 6px rgba(0,0,0,0.35), 0 0 0 2px rgba(0,255,170,0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(0,255,170,0.2)';
                      e.currentTarget.style.boxShadow = 'inset 0 2px 6px rgba(0,0,0,0.35)';
                    }}
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="w-full flex items-center justify-center gap-2 py-3 transition-all"
                    style={{
                      backgroundColor: '#00FFA3',
                      color: '#020908',
                      borderRadius: '3px',
                      fontSize: '13px',
                      fontWeight: 600,
                      opacity: isGenerating ? 0.6 : 1,
                      boxShadow: '0 2px 12px rgba(0,255,163,0.22)',
                      letterSpacing: '0.03em',
                    }}
                    onMouseEnter={(e) => {
                      if (!isGenerating) {
                        e.currentTarget.style.backgroundColor = '#00E895';
                        e.currentTarget.style.boxShadow = '0 3px 18px rgba(0,255,163,0.35)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isGenerating) {
                        e.currentTarget.style.backgroundColor = '#00FFA3';
                        e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,255,163,0.22)';
                      }
                    }}
                  >
                    <Sparkles style={{ width: '16px', height: '16px' }} />
                    {isGenerating ? 'GENERATING...' : 'GENERATE ARCHITECTURE'}
                  </button>
                  {isGenerating && (
                    <div style={{ color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}>
                      [AI] Groq Llama 3 generating topology...
                    </div>
                  )}

                  {/* Divider */}
                  <div className="border-t" style={{ borderColor: 'rgba(0,255,170,0.15)', margin: '16px 0' }} />

                  {/* Import Diagram Button */}
                  <button
                    onClick={() => setIsImportPopupOpen(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 border transition-all"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: 'rgba(0,255,170,0.28)',
                      color: '#00FFA3',
                      borderRadius: '3px',
                      fontSize: '13px',
                      fontWeight: 600,
                      letterSpacing: '0.03em',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(0,255,170,0.8)';
                      e.currentTarget.style.backgroundColor = 'rgba(0,255,170,0.06)';
                      e.currentTarget.style.boxShadow = '0 0 10px rgba(0,255,170,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(0,255,170,0.28)';
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <FileImage style={{ width: '16px', height: '16px' }} />
                    IMPORT DIAGRAM
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {componentList.map((component) => (
                    <div
                      key={component.id}
                      className="border cursor-move transition-all"
                      style={{
                        backgroundColor: '#020A09',
                        borderColor: 'rgba(0,255,170,0.18)',
                        borderRadius: '3px',
                        padding: '10px 12px 10px 14px',
                        position: 'relative',
                        overflow: 'hidden',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(0,255,170,0.55)';
                        e.currentTarget.style.backgroundColor = '#061410';
                        e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.4), inset 2px 0 0 rgba(0,255,170,0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(0,255,170,0.18)';
                        e.currentTarget.style.backgroundColor = '#020A09';
                        e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
                      }}
                      draggable
                      onDragStart={(e) => onDragStart(e, component)}
                    >
                      <div style={{ color: '#DFF0EC', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', marginBottom: '3px', fontWeight: 500 }}>
                        {component.name}
                      </div>
                      <div style={{ color: '#5A8880', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}>
                        {component.type}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.aside>

        {/* Canvas */}
        <div className="flex-1 relative" ref={reactFlowWrapper}>
          {/* Sidebar Toggle Button */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute top-4 left-4 z-20 p-2 border transition-all"
            style={{
              backgroundColor: '#040F0E',
              borderColor: 'rgba(0,255,170,0.3)',
              color: '#00FFA3',
              borderRadius: '2px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#00FFA3';
              e.currentTarget.style.backgroundColor = '#071512';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(0,255,170,0.3)';
              e.currentTarget.style.backgroundColor = '#040F0E';
            }}
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
          />
        </div>

        {/* Right inspector */}
        {selectedNode && (
          <motion.aside
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: 'linear' }}
            className="border-l overflow-y-auto"
            style={{ width: '320px', backgroundColor: '#040F0E', borderColor: 'rgba(0,255,170,0.15)' }}
          >
            <div className="p-6">
              <div
                className="uppercase mb-6 tracking-widest"
                style={{ color: '#00FFA3', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}
              >
                Node Configuration
              </div>
              <div className="space-y-4">
                {(['processingPower', 'coldStartLatency', 'failureRate', 'recoveryTime'] as const).map((field) => (
                  <div key={field}>
                    <label className="block mb-2" style={{ color: '#8FA9A3', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace' }}>
                      {field}
                    </label>
                    <input
                      type="text"
                      defaultValue={
                        field === 'processingPower' ? '1000ms' :
                        field === 'coldStartLatency' ? '200ms' :
                        field === 'failureRate' ? '0.01%' : '500ms'
                      }
                      className="w-full border px-3 py-2 outline-none"
                      style={{ backgroundColor: '#020908', borderColor: 'rgba(0,255,170,0.2)', color: '#E6F1EF', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', borderRadius: '2px' }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = '#00FFA3')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(0,255,170,0.2)')}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-6 border-t" style={{ borderColor: 'rgba(0,255,170,0.15)' }}>
                <div
                  className="uppercase mb-4 tracking-widest"
                  style={{ color: '#00FFA3', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}
                >
                  Network Edge Config
                </div>
                <div className="space-y-4">
                  {(['latency', 'jitter', 'packetLoss', 'bandwidthLimit'] as const).map((field) => (
                    <div key={field}>
                      <label className="block mb-2" style={{ color: '#8FA9A3', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace' }}>
                        {field}
                      </label>
                      <input
                        type="text"
                        defaultValue={
                          field === 'latency' ? '50ms' :
                          field === 'jitter' ? '10ms' :
                          field === 'packetLoss' ? '0.1%' : '100Mbps'
                        }
                        className="w-full border px-3 py-2 outline-none"
                      style={{ backgroundColor: '#020908', borderColor: 'rgba(0,255,170,0.2)', color: '#E6F1EF', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', borderRadius: '2px' }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = '#00FFA3')}
                        onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(0,255,170,0.2)')}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </div>

      {/* ── TERMINAL ── */}
      <motion.div
        animate={{ height: terminalExpanded ? '35vh' : '40px' }}
        transition={{ duration: 0.3, ease: 'linear' }}
        className="border-t relative z-10"
        style={{ backgroundColor: '#041615', borderColor: 'rgba(0,255,170,0.25)' }}
      >
        <button
          onClick={() => setTerminalExpanded(!terminalExpanded)}
          className="w-full h-10 flex items-center justify-between px-6 transition-colors"
          style={{ color: '#8FA9A3' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#00FFA3')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#8FA9A3')}
        >
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: 600 }}>TERMINAL</span>
            {logs.length > 0 && <div className="rounded-full" style={{ width: '6px', height: '6px', backgroundColor: '#00FFA3' }} />}
          </div>
          {terminalExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>

        {terminalExpanded && (
          <div className="px-6 pb-6 overflow-y-auto" style={{ height: 'calc(35vh - 40px)' }}>
            <div className="space-y-1" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>
              {logs.map((log, i) => {
                let color = '#8FA9A3';
                if (log.includes('[WARN]'))  color = '#00FFA3';
                if (log.includes('[ERROR]') || log.includes('[FATAL]')) color = '#FF3B3B';
                if (log.includes('GRADE') || log.includes('SYNCED')) color = '#00FFA3';
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, ease: 'linear' }}
                    style={{ color }}
                  >
                    {log}
                  </motion.div>
                );
              })}
              {logs.length > 0 && !simulationComplete && (
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  style={{ color: '#00FFA3' }}
                >
                  _
                </motion.span>
              )}
            </div>

            {/* View Report Button */}
            {simulationComplete && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'linear' }}
                className="mt-6"
              >
                <button
                  onClick={() => setIsReportOpen(true)}
                  className="px-5 py-3 flex items-center gap-2 transition-all"
                  style={{
                    backgroundColor: '#00FFA3',
                    color: '#020908',
                    borderRadius: '2px',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#00D98C')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00FFA3')}
                >
                  VIEW REPORT
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', opacity: 0.8 }}>
                    ANALYSIS
                  </span>
                </button>
              </motion.div>
            )}
          </div>
        )}
      </motion.div>

      {/* Import Diagram Popup */}
      <ImportDiagramPopup
        isOpen={isImportPopupOpen}
        onClose={() => setIsImportPopupOpen(false)}
        onImport={handleImportDiagram}
      />

      {/* Report View */}
      <ReportView
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        projectName={projectName}
        reportData={{
          simulationId: '847293',
          universeSeed: '783492',
          stableHash: 'a7c4f9d2e8b3f1a5...',
          grade: 'B-',
          gradeColor: '#00FFA3',
          status: 'PASS — System Stabilized',
          statusColor: '#00FFA3',
          totalRequests: 10000,
          failedRequests: 142,
          peakLatency: 1284,
          collapseTime: '00:02:14',
          rootCause: {
            summary: 'The architecture experienced minor performance degradation because of a Single Point of Failure at the Load Balancer. Under high concurrency, the Load Balancer exceeded its processing capacity, leading to request queue saturation and cascading downstream failures before stabilization.',
            details: [
              { label: 'Load Balancer capacity', value: '500 req/sec' },
              { label: 'Incoming traffic', value: '1,200 req/sec' },
              { label: 'Retry logic amplified failure rate', value: 'Yes' },
              { label: 'No horizontal scaling configured', value: 'True' },
            ],
          },
          recommendations: [
            'Introduce horizontal scaling for Load Balancer.',
            'Implement circuit breaker pattern at API gateway.',
            'Add Redis caching layer before database calls.',
            'Adjust retry backoff strategy to prevent amplification.',
          ],
          latencyData: [
            { time: 0, latency: 45 },
            { time: 10, latency: 52 },
            { time: 20, latency: 68 },
            { time: 30, latency: 95 },
            { time: 40, latency: 120 },
            { time: 50, latency: 185 },
            { time: 60, latency: 280 },
            { time: 70, latency: 450 },
            { time: 80, latency: 680 },
            { time: 90, latency: 920 },
            { time: 100, latency: 1150 },
            { time: 110, latency: 1284 },
            { time: 120, latency: 980 },
            { time: 130, latency: 620 },
            { time: 140, latency: 380 },
            { time: 150, latency: 210 },
            { time: 160, latency: 110 },
            { time: 170, latency: 72 },
            { time: 180, latency: 58 },
          ],
        }}
      />
    </div>
  );
}