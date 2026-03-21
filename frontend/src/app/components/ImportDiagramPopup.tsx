import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, ChevronDown, ChevronRight } from 'lucide-react';
import { authFetch } from '../../lib/auth';

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
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [showMappingControls, setShowMappingControls] = useState(false);
  const [, setHasError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectionData = {
    confidence: analysisResult?.confidence || 0,
    nodes: analysisResult?.componentSummary || [],
    relationships: analysisResult?.edges || [],
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.match(/^image\/(png|jpeg|jpg|svg\+xml)$/)) {
      setHasError(true);
      return;
    }

    setHasError(false);
    setUploadedFile(file);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Real logs that show as image is being sent to AI
    const logs = [
      '[VISION] Encoding image for analysis...',
      '[AI] Sending to vision model...',
      '[GRAPH] Extracting topology clusters...',
      '[SEED] Mapping to simulation primitives...',
    ];

    setExtractionLogs([]);
    setAnalysisResult(null);

    // Show first two logs immediately
    setTimeout(() => setExtractionLogs([logs[0]]), 100);
    setTimeout(() => setExtractionLogs(prev => [...prev, logs[1]]), 600);

    // Convert file to base64 and call backend
    const reader2 = new FileReader();
    reader2.onload = async (e2) => {
      const dataUrl = e2.target?.result as string;
      // Extract base64 part after "data:image/png;base64,"
      const base64 = dataUrl.split(',')[1];
      const mimeType = file.type;

      const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = dataUrl;
      });

      try {
        const response = await authFetch('/api/ai/analyse-image', {
          method: 'POST',
          body: JSON.stringify({ imageBase64: base64, mimeType, imageWidth: dimensions.width, imageHeight: dimensions.height }),
        });

        if (!response.ok) throw new Error('Vision analysis failed');
        const result = await response.json();

        setAnalysisResult(result);
        setExtractionLogs(prev => [
          ...prev,
          logs[2],
          `[SEED] Found ${result.nodeCount} components, ${result.edgeCount} connections`,
        ]);
      } catch (err) {
        setExtractionLogs(prev => [...prev, '[ERROR] Analysis failed. Try a clearer image.']);
        setHasError(true);
      } finally {
        setIsProcessing(false);
      }
    };
    reader2.readAsDataURL(file);
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
    if (!analysisResult) return;
    onImport(analysisResult.nodes, analysisResult.edges);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Popup Wrapper */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-xl bg-zinc-900/40 backdrop-blur-3xl border border-white/10 rounded-[32px] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Accent */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

            {/* Header */}
            <div className="px-10 pt-10 pb-6 flex items-start justify-between">
              <div>
                <h2 className="text-white text-2xl font-bold tracking-tight mb-2">Import Architecture</h2>
                <p className="text-zinc-500 text-sm leading-relaxed max-w-[320px]">
                  Convert diagrams into high-fidelity simulation nodes using technical vision analysis.
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/5 text-zinc-500 hover:text-white transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto px-10 pb-10 space-y-6">
              
              {!uploadedFile ? (
                /* Upload Area */
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  className="group relative border-2 border-dashed border-white/10 rounded-3xl p-12 text-center cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/5 transition-all"
                >
                  <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                    <Upload className="text-blue-500" size={28} />
                  </div>
                  <p className="text-white font-bold text-lg mb-1">Upload Diagram Image</p>
                  <p className="text-zinc-500 text-sm">PNG, JPG, or SVG supported. Max 10MB.</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  />
                </motion.div>
              ) : (
                /* Preview & Processing Area */
                <div className="space-y-6">
                  {/* Image Preview Container */}
                  <div className="relative rounded-2xl border border-white/10 bg-black/40 p-3 overflow-hidden">
                    <img
                      src={previewUrl!}
                      alt="Diagram Preview"
                      className="w-full h-auto max-h-[220px] object-contain rounded-xl"
                    />
                    {!isProcessing && (
                      <div className="absolute top-6 right-6 px-3 py-1.5 rounded-full bg-blue-500/20 backdrop-blur-md border border-blue-500/30">
                        <span className="text-blue-400 font-mono text-[10px] font-bold tracking-widest uppercase">
                          {detectionData.confidence}% Confidence
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Processing Logs (Terminal Style) */}
                  <div className="rounded-2xl bg-black/60 border border-white/5 p-5 font-mono text-[11px] leading-6 h-[120px] overflow-hidden relative">
                    <div className="absolute top-3 right-5 flex gap-2">
                       <div className="w-1.5 h-1.5 rounded-full bg-blue-500/30" />
                       <div className="w-1.5 h-1.5 rounded-full bg-blue-500/30" />
                    </div>
                    {extractionLogs.map((log, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={log.includes('[GRAPH]') ? 'text-blue-400' : 'text-zinc-500'}
                      >
                        {log}
                      </motion.div>
                    ))}
                    {isProcessing && (
                      <motion.div animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.8 }} className="text-blue-400 inline-block">_</motion.div>
                    )}
                  </div>

                  {/* Result Summary */}
                  {!isProcessing && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                       <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                             <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1">Topology</div>
                             <div className="text-white font-bold">{detectionData.nodes.length} Components</div>
                          </div>
                          <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                             <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1">Flows</div>
                             <div className="text-white font-bold">{detectionData.relationships.length} Edges</div>
                          </div>
                       </div>

                       {/* Mapping Disclosure */}
                       <div>
                          <button
                            onClick={() => setShowMappingControls(!showMappingControls)}
                            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-wider"
                          >
                            {showMappingControls ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            Verify component mappings
                          </button>
                          {showMappingControls && (
                            <div className="mt-4 p-5 rounded-2xl border border-white/5 bg-white/[0.02] space-y-4">
                               {detectionData.nodes.map((node: any, i: number) => (
                                 <div key={i} className="flex items-center justify-between text-xs">
                                    <span className="text-zinc-500 font-mono tracking-tight">{node.label}</span>
                                    <span className="text-blue-500 font-bold uppercase tracking-tighter">Recognized</span>
                                 </div>
                               ))}
                            </div>
                          )}
                       </div>
                    </motion.div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="px-10 py-8 border-t border-white/10 bg-black/20 flex items-center justify-between">
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-white font-bold text-sm transition-colors py-2"
              >
                DISCARD
              </button>

              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                disabled={!uploadedFile || isProcessing}
                onClick={handleImportClick}
                className={`iz-btn-blue relative overflow-hidden py-3 px-8 rounded-xl text-white font-bold text-sm shadow-xl transition-all ${
                  (!uploadedFile || isProcessing) ? 'opacity-30 grayscale cursor-not-allowed' : 'opacity-100'
                }`}
              >
                {/* Border Animation */}
                {uploadedFile && !isProcessing && (
                   <>
                    <span style={{ position:'absolute', top:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to left, rgba(30,58,138,0), #000000)', animation:'izAnimateTop 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                    <span style={{ position:'absolute', top:0, right:0, height:'100%', width:'2px', background:'linear-gradient(to top, rgba(30,58,138,0), #000000)', animation:'izAnimateRight 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                    <span style={{ position:'absolute', bottom:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to right, rgba(30,58,138,0), #000000)', animation:'izAnimateBottom 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                    <span style={{ position:'absolute', top:0, left:0, height:'100%', width:'2px', background:'linear-gradient(to bottom, rgba(30,58,138,0), #000000)', animation:'izAnimateLeft 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                   </>
                )}
                Compile to Canvas
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}