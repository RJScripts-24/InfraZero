import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, ChevronDown, ChevronRight } from 'lucide-react';

interface ImportDiagramPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (nodes: any[], edges: any[]) => void;
}

export function ImportDiagramPopup({ isOpen, onClose, onImport }: ImportDiagramPopupProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractionLogs, setExtractionLogs] = useState<string[]>([]);
  const [showMappingControls, setShowMappingControls] = useState(false);
  const [hasError, setHasError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mock detection data
  const detectionData = {
    confidence: 87,
    nodes: [
      { label: 'Load Balancer', count: 1 },
      { label: 'API Services', count: 3 },
      { label: 'Database', count: 1 },
      { label: 'Redis Cache', count: 1 },
      { label: 'Queue', count: 1 },
    ],
    relationships: [
      { from: 'LB', to: 'API' },
      { from: 'API', to: 'DB' },
      { from: 'API', to: 'Redis' },
      { from: 'API', to: 'Queue' },
    ],
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.match(/^image\/(png|jpeg|jpg|svg\+xml)$/)) {
      setHasError(true);
      return;
    }

    setHasError(false);
    setUploadedFile(file);
    setIsProcessing(true);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Simulate extraction process
    const logs = [
      '[OCR] Extracting labels...',
      '[AI] Normalizing topology...',
      '[GRAPH] Deterministic projection stable',
      '[SEED] Universe Seed assigned: 847293',
    ];

    setExtractionLogs([]);
    logs.forEach((log, i) => {
      setTimeout(() => {
        setExtractionLogs((prev) => [...prev, log]);
        if (i === logs.length - 1) {
          setIsProcessing(false);
        }
      }, i * 500);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleImportClick = () => {
    // Close popup
    onClose();

    // Generate mock nodes and edges from detection data
    const mockNodes = [
      { id: 'imported-1', type: 'custom', position: { x: 100, y: 50 }, data: { label: 'Load Balancer', type: 'Load Balancer', isActive: false } },
      { id: 'imported-2', type: 'custom', position: { x: 50, y: 200 }, data: { label: 'API Service 1', type: 'Node Service', isActive: false } },
      { id: 'imported-3', type: 'custom', position: { x: 200, y: 200 }, data: { label: 'API Service 2', type: 'Node Service', isActive: false } },
      { id: 'imported-4', type: 'custom', position: { x: 100, y: 350 }, data: { label: 'PostgreSQL', type: 'Database', isActive: false } },
      { id: 'imported-5', type: 'custom', position: { x: 300, y: 350 }, data: { label: 'Redis Cache', type: 'Cache', isActive: false } },
    ];

    const mockEdges = [
      { id: 'ie1', source: 'imported-1', target: 'imported-2' },
      { id: 'ie2', source: 'imported-1', target: 'imported-3' },
      { id: 'ie3', source: 'imported-2', target: 'imported-4' },
      { id: 'ie4', source: 'imported-3', target: 'imported-5' },
    ];

    onImport(mockNodes, mockEdges);
  };

  const handleReset = () => {
    setUploadedFile(null);
    setPreviewUrl(null);
    setExtractionLogs([]);
    setIsProcessing(false);
    setHasError(false);
    setShowMappingControls(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'linear' }}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: 'rgba(6, 27, 26, 0.8)' }}
            onClick={onClose}
          />

          {/* Popup */}
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.25, ease: 'linear' }}
            drag
            dragConstraints={{
              top: -window.innerHeight * 0.4,
              left: -window.innerWidth * 0.4,
              right: window.innerWidth * 0.4,
              bottom: window.innerHeight * 0.4,
            }}
            dragElastic={0}
            dragMomentum={false}
            className="fixed z-50 border overflow-hidden flex flex-col"
            style={{
              left: '50%',
              top: '50%',
              x: '-50%',
              y: '-50%',
              width: '450px',
              maxHeight: '70vh',
              backgroundColor: '#0F2E2B',
              borderColor: 'rgba(0,255,170,0.25)',
              borderRadius: '2px',
              cursor: 'move',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="px-6 py-4 border-b"
              style={{ borderColor: 'rgba(0,255,170,0.15)' }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 style={{ color: '#E6F1EF', fontSize: '16px', fontWeight: 500, marginBottom: '4px' }}>
                    Import Architecture Diagram
                  </h2>
                  <p style={{ color: '#8FA9A3', fontSize: '13px' }}>
                    Convert PNG, JPG, or SVG into simulation nodes.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="transition-colors"
                  style={{ color: '#8FA9A3', padding: '4px' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#00FFA3')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#8FA9A3')}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* File Input */}
              {!uploadedFile && (
                <div
                  className="border-dashed border-2 p-8 text-center cursor-pointer transition-all"
                  style={{
                    backgroundColor: '#061B1A',
                    borderColor: 'rgba(0,255,170,0.4)',
                    borderRadius: '2px',
                  }}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(0,255,170,0.6)';
                    e.currentTarget.style.backgroundColor = '#041615';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(0,255,170,0.4)';
                    e.currentTarget.style.backgroundColor = '#061B1A';
                  }}
                >
                  <Upload size={32} style={{ color: '#00FFA3', margin: '0 auto 12px' }} />
                  <p style={{ color: '#E6F1EF', fontSize: '14px', marginBottom: '4px' }}>
                    Drop diagram here or click to upload
                  </p>
                  <p style={{ color: '#8FA9A3', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace' }}>
                    PNG · JPG · SVG
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                    style={{ display: 'none' }}
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  />
                </div>
              )}

              {/* Error State */}
              {hasError && (
                <div className="border p-4" style={{ backgroundColor: '#061B1A', borderColor: '#FF3B3B', borderRadius: '2px' }}>
                  <p style={{ color: '#FF3B3B', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
                    Unable to detect structured topology.
                  </p>
                  <p style={{ color: '#8FA9A3', fontSize: '12px' }}>
                    Ensure labels are visible and nodes are clearly separated.
                  </p>
                </div>
              )}

              {/* Preview + Detection Summary */}
              {uploadedFile && previewUrl && !hasError && (
                <div className="space-y-4">
                  {/* Preview */}
                  <div className="relative border" style={{ backgroundColor: '#061B1A', borderColor: 'rgba(0,255,170,0.25)', borderRadius: '2px', padding: '12px' }}>
                    <img
                      src={previewUrl}
                      alt="Diagram preview"
                      style={{ width: '100%', height: 'auto', maxHeight: '180px', objectFit: 'contain' }}
                    />
                    {!isProcessing && (
                      <div
                        className="absolute top-4 right-4 px-2 py-1"
                        style={{
                          backgroundColor: 'rgba(6,27,26,0.95)',
                          border: '1px solid rgba(0,255,170,0.3)',
                          borderRadius: '2px',
                        }}
                      >
                        <span style={{ color: '#00FFA3', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                          {detectionData.confidence}% CONFIDENCE
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Extraction Summary */}
                  {!isProcessing && (
                    <div className="border p-4" style={{ backgroundColor: '#061B1A', borderColor: 'rgba(0,255,170,0.25)', borderRadius: '2px' }}>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>
                        <p style={{ color: '#8FA9A3', marginBottom: '8px' }}>Detected Nodes:</p>
                        <div className="space-y-1 mb-4">
                          {detectionData.nodes.map((node, i) => (
                            <div key={i} className="flex items-center justify-between">
                              <span style={{ color: '#8FA9A3' }}>{node.label}</span>
                              <span style={{ color: '#00FFA3' }}>({node.count})</span>
                            </div>
                          ))}
                        </div>
                        <p style={{ color: '#8FA9A3', marginBottom: '8px' }}>Detected Relationships:</p>
                        <div className="space-y-1">
                          {detectionData.relationships.map((rel, i) => (
                            <div key={i} style={{ color: '#00FFA3' }}>
                              {rel.from} → {rel.to}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mapping Controls */}
                  {!isProcessing && (
                    <div>
                      <button
                        onClick={() => setShowMappingControls(!showMappingControls)}
                        className="flex items-center gap-2 w-full transition-colors"
                        style={{ color: '#8FA9A3', fontSize: '13px', fontWeight: 500 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#00FFA3')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#8FA9A3')}
                      >
                        {showMappingControls ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        Adjust Component Mapping
                      </button>

                      {showMappingControls && (
                        <div className="mt-3 space-y-3 pl-6">
                          {[
                            { detected: 'EC2', mapped: 'Compute Service' },
                            { detected: 'RDS', mapped: 'Database Actor' },
                          ].map((mapping, i) => (
                            <div key={i} className="space-y-2">
                              <div style={{ color: '#8FA9A3', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}>
                                Detected: "{mapping.detected}"
                              </div>
                              <div style={{ color: '#8FA9A3', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}>
                                Mapped to:
                              </div>
                              <select
                                className="w-full border px-3 py-2 outline-none"
                                style={{
                                  backgroundColor: '#061B1A',
                                  borderColor: 'rgba(0,255,170,0.25)',
                                  color: '#E6F1EF',
                                  fontSize: '12px',
                                  fontFamily: 'JetBrains Mono, monospace',
                                  borderRadius: '2px',
                                }}
                                onFocus={(e) => (e.currentTarget.style.borderColor = '#00FFA3')}
                                onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(0,255,170,0.25)')}
                              >
                                <option>{mapping.mapped}</option>
                                <option>Load Balancer</option>
                                <option>API Gateway</option>
                                <option>Cache Service</option>
                              </select>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* AI Extraction Log */}
              {uploadedFile && extractionLogs.length > 0 && (
                <div className="border p-3" style={{ backgroundColor: '#041615', borderColor: 'rgba(0,255,170,0.2)', borderRadius: '2px' }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}>
                    {extractionLogs.map((log, i) => {
                      let color = '#8FA9A3';
                      if (log.includes('[GRAPH]') || log.includes('[SEED]')) color = '#00FFA3';
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.15, ease: 'linear' }}
                          style={{ color, marginBottom: '4px' }}
                        >
                          {log}
                        </motion.div>
                      );
                    })}
                    {isProcessing && (
                      <motion.span
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        style={{ color: '#00FFA3' }}
                      >
                        _
                      </motion.span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t px-6 py-4 flex items-center justify-between" style={{ borderColor: 'rgba(0,255,170,0.15)' }}>
              <button
                onClick={uploadedFile ? handleReset : onClose}
                className="transition-colors"
                style={{ color: '#8FA9A3', fontSize: '13px', fontWeight: 500 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#00FFA3')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#8FA9A3')}
              >
                {uploadedFile ? 'Reset' : 'Cancel'}
              </button>

              <button
                onClick={handleImportClick}
                disabled={!uploadedFile || isProcessing}
                className="px-4 py-2 flex items-center gap-2 transition-all"
                style={{
                  backgroundColor: uploadedFile && !isProcessing ? '#00FFA3' : '#0B2321',
                  color: uploadedFile && !isProcessing ? '#061B1A' : '#8FA9A3',
                  borderRadius: '2px',
                  fontSize: '13px',
                  fontWeight: 600,
                  opacity: uploadedFile && !isProcessing ? 1 : 0.5,
                  cursor: uploadedFile && !isProcessing ? 'pointer' : 'not-allowed',
                }}
                onMouseEnter={(e) => {
                  if (uploadedFile && !isProcessing) {
                    e.currentTarget.style.backgroundColor = '#00D98C';
                  }
                }}
                onMouseLeave={(e) => {
                  if (uploadedFile && !isProcessing) {
                    e.currentTarget.style.backgroundColor = '#00FFA3';
                  }
                }}
              >
                Import to Canvas
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', opacity: 0.8 }}>
                  COMPILE
                </span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}