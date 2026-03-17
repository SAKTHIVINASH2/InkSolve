import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState, useCallback, createRef } from 'react';
import axios from 'axios';
import Draggable from 'react-draggable';
import { MathJax } from 'better-react-mathjax';
import { SWATCHES } from '@/constants';

// --- Types ---

interface ApiResponse {
    expr: string;
    result: string;
    assign: boolean;
}

interface Point { x: number; y: number }

interface Stroke {
    points: Point[];
    color: string;
    width: number;
}

interface HistoryEntry {
    expr: string;
    result: string;
    timestamp: number;
}

interface LatexItem {
    id: number;
    latex: string;
    rawExpr: string;
    rawResult: string;
    position: Point;
    nodeRef: React.RefObject<HTMLDivElement | null>;
}

// --- Constants ---

const BRUSH_SIZES = [2, 4, 6, 8];
const ERASER_RADIUS = 18;
const HISTORY_KEY = 'inksolve_history';
const VARS_KEY = 'inksolve_vars';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8900';

// --- Helpers (outside component) ---

function loadFromStorage<T>(key: string, fallback: T): T {
    try { return JSON.parse(localStorage.getItem(key) || '') as T; }
    catch { return fallback; }
}

function getBoundingBox(strokes: Stroke[]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of strokes) {
        for (const p of s.points) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
    }
    return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

function cropCanvas(canvas: HTMLCanvasElement, strokes: Stroke[], pad = 40): string {
    const box = getBoundingBox(strokes);
    if (!box) return canvas.toDataURL('image/png');
    const r = window.devicePixelRatio || 1;
    const x = Math.max(0, (box.minX - pad) * r);
    const y = Math.max(0, (box.minY - pad) * r);
    const w = Math.min(canvas.width - x, (box.maxX - box.minX + pad * 2) * r);
    const h = Math.min(canvas.height - y, (box.maxY - box.minY + pad * 2) * r);
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const ctx = tmp.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
    return tmp.toDataURL('image/jpeg', 0.85);
}

function cloneStrokes(strokes: Stroke[]): Stroke[] {
    return strokes.map(s => ({ ...s, points: s.points.slice() }));
}

let nextLatexId = Date.now();

// --- Component ---

export default function Home() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawingRef = useRef(false);
    const strokesRef = useRef<Stroke[]>([]);
    const currentStrokeRef = useRef<Stroke | null>(null);
    const undoStackRef = useRef<Stroke[][]>([]);
    const redoStackRef = useRef<Stroke[][]>([]);
    const toastTimer = useRef<ReturnType<typeof setTimeout>>();
    const dpr = useRef(window.devicePixelRatio || 1);

    const [color, setColor] = useState('#ffffff');
    const [brushSize, setBrushSize] = useState(4);
    const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
    const [dictOfVars, setDictOfVars] = useState<Record<string, string>>(() => loadFromStorage(VARS_KEY, {}));
    const [latexItems, setLatexItems] = useState<LatexItem[]>([]);
    const [history, setHistory] = useState<HistoryEntry[]>(() => loadFromStorage(HISTORY_KEY, []));
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStep, setProcessingStep] = useState('');
    const [showToolbar, setShowToolbar] = useState(true);
    const [showHistory, setShowHistory] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [hasStrokes, setHasStrokes] = useState(false);

    // --- Persist ---
    useEffect(() => { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }, [history]);
    useEffect(() => { localStorage.setItem(VARS_KEY, JSON.stringify(dictOfVars)); }, [dictOfVars]);

    // --- Toast ---
    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ message, type });
        toastTimer.current = setTimeout(() => setToast(null), 2200);
    }, []);

    // --- Canvas ---
    const redrawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const r = dpr.current;
        ctx.setTransform(r, 0, 0, r, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const stroke of strokesRef.current) {
            if (stroke.points.length < 2) continue;
            ctx.beginPath();
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
            ctx.stroke();
        }
    }, []);

    const resizeCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const r = dpr.current;
        canvas.width = window.innerWidth * r;
        canvas.height = window.innerHeight * r;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        redrawCanvas();
    }, [redrawCanvas]);

    useEffect(() => {
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
    }, [resizeCanvas]);

    // --- Undo/Redo ---
    const pushUndo = useCallback(() => {
        undoStackRef.current.push(cloneStrokes(strokesRef.current));
        if (undoStackRef.current.length > 30) undoStackRef.current.shift();
        redoStackRef.current = [];
    }, []);

    const undo = useCallback(() => {
        if (!undoStackRef.current.length) return;
        redoStackRef.current.push(cloneStrokes(strokesRef.current));
        strokesRef.current = undoStackRef.current.pop()!;
        setHasStrokes(strokesRef.current.length > 0);
        redrawCanvas();
    }, [redrawCanvas]);

    const redo = useCallback(() => {
        if (!redoStackRef.current.length) return;
        undoStackRef.current.push(cloneStrokes(strokesRef.current));
        strokesRef.current = redoStackRef.current.pop()!;
        setHasStrokes(strokesRef.current.length > 0);
        redrawCanvas();
    }, [redrawCanvas]);

    // --- Eraser ---
    const findStrokeAt = useCallback((px: number, py: number): number => {
        for (let i = strokesRef.current.length - 1; i >= 0; i--) {
            const s = strokesRef.current[i];
            const t = (ERASER_RADIUS + s.width / 2) ** 2;
            for (const p of s.points) {
                if ((p.x - px) ** 2 + (p.y - py) ** 2 <= t) return i;
            }
        }
        return -1;
    }, []);

    // --- Download ---
    const downloadCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const tmp = document.createElement('canvas');
        tmp.width = canvas.width; tmp.height = canvas.height;
        const ctx = tmp.getContext('2d')!;
        ctx.fillStyle = '#0b1120';
        ctx.fillRect(0, 0, tmp.width, tmp.height);
        ctx.drawImage(canvas, 0, 0);
        const a = document.createElement('a');
        a.download = `inksolve-${Date.now()}.png`;
        a.href = tmp.toDataURL('image/png');
        a.click();
        showToast('Image saved', 'success');
    }, [showToast]);

    // --- Copy ---
    const copy = useCallback((text: string) => {
        navigator.clipboard.writeText(text).then(() => showToast('Copied', 'success'));
    }, [showToast]);

    // --- Clear ---
    const clearAll = useCallback(() => {
        pushUndo();
        strokesRef.current = [];
        setHasStrokes(false);
        redrawCanvas();
        setLatexItems([]);
        showToast('Cleared', 'info');
    }, [pushUndo, redrawCanvas, showToast]);

    // --- Keyboard shortcuts ---
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            const ctrl = e.ctrlKey || e.metaKey;
            if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
            else if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
            else if (ctrl && e.key === 's') { e.preventDefault(); downloadCanvas(); }
            else if (e.key === 'p' || e.key === 'P') setTool('pen');
            else if (e.key === 'e' || e.key === 'E') setTool('eraser');
            else if (ctrl && e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-calc')?.click(); }
            else if (e.key === 'Escape') { setShowHistory(false); setShowShortcuts(false); }
            else if (e.key === '?' && e.shiftKey) setShowShortcuts(v => !v);
            else if (e.key >= '1' && e.key <= '4') setBrushSize(BRUSH_SIZES[parseInt(e.key) - 1]);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [undo, redo, downloadCanvas]);

    // --- Pointer ---
    const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): Point => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        if ('touches' in e && e.touches.length > 0) {
            return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
        }
        const me = e as React.MouseEvent;
        return { x: me.clientX - rect.left, y: me.clientY - rect.top };
    };

    const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const pos = getPos(e);

        if (tool === 'eraser') {
            pushUndo();
            const idx = findStrokeAt(pos.x, pos.y);
            if (idx !== -1) { strokesRef.current.splice(idx, 1); setHasStrokes(strokesRef.current.length > 0); redrawCanvas(); }
            isDrawingRef.current = true;
            return;
        }

        pushUndo();
        currentStrokeRef.current = { points: [pos], color, width: brushSize };
        isDrawingRef.current = true;

        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const r = dpr.current;
                ctx.setTransform(r, 0, 0, r, 0, 0);
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
                ctx.lineWidth = brushSize;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            }
        }
    }, [brushSize, color, tool, findStrokeAt, redrawCanvas, pushUndo]);

    const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current) return;
        e.preventDefault();
        const pos = getPos(e);

        if (tool === 'eraser') {
            const idx = findStrokeAt(pos.x, pos.y);
            if (idx !== -1) { strokesRef.current.splice(idx, 1); setHasStrokes(strokesRef.current.length > 0); redrawCanvas(); }
            return;
        }

        if (currentStrokeRef.current) currentStrokeRef.current.points.push(pos);
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) { ctx.strokeStyle = color; ctx.lineTo(pos.x, pos.y); ctx.stroke(); }
        }
    }, [color, tool, findStrokeAt, redrawCanvas]);

    const stopDrawing = useCallback(() => {
        if (tool === 'pen' && currentStrokeRef.current && currentStrokeRef.current.points.length > 0) {
            strokesRef.current.push(currentStrokeRef.current);
            currentStrokeRef.current = null;
            setHasStrokes(true);
        }
        isDrawingRef.current = false;
    }, [tool]);

    // --- Calculate ---
    const runRoute = async () => {
        const canvas = canvasRef.current;
        if (!canvas || strokesRef.current.length === 0) {
            showToast('Draw something first', 'error');
            return;
        }

        setIsProcessing(true);
        setProcessingStep('Preparing image...');

        try {
            const cropped = cropCanvas(canvas, strokesRef.current);
            setProcessingStep('Sending to AI...');

            const response = await axios.post(`${API_URL}/calculate`, {
                image: cropped,
                dict_of_vars: dictOfVars,
            }, { timeout: 30000 });

            setProcessingStep('Processing results...');
            const resp = response.data;

            if (!resp.data || !Array.isArray(resp.data)) {
                showToast('Unexpected response format', 'error');
                return;
            }

            if (resp.data.length === 0) {
                showToast('Could not recognize expression — try writing more clearly', 'error');
                return;
            }

            // Update variables
            const newVars = { ...dictOfVars };
            resp.data.forEach((d: ApiResponse) => {
                if (d.assign && d.expr && d.result != null) {
                    newVars[d.expr] = String(d.result);
                }
            });
            setDictOfVars(newVars);

            // History
            const entries: HistoryEntry[] = resp.data.map((d: ApiResponse) => ({
                expr: String(d.expr || ''),
                result: String(d.result ?? ''),
                timestamp: Date.now(),
            }));
            setHistory(prev => [...entries, ...prev].slice(0, 100));

            // Position near drawing
            const box = getBoundingBox(strokesRef.current);
            const cx = box ? (box.minX + box.maxX) / 2 : window.innerWidth / 2;
            const cy = box ? (box.minY + box.maxY) / 2 : window.innerHeight / 2;

            // Clear canvas
            strokesRef.current = [];
            undoStackRef.current = [];
            redoStackRef.current = [];
            setHasStrokes(false);
            redrawCanvas();

            // Add results
            const items: LatexItem[] = resp.data.map((d: ApiResponse, i: number) => ({
                id: ++nextLatexId,
                latex: `${d.expr} = ${d.result}`,
                rawExpr: String(d.expr),
                rawResult: String(d.result),
                position: { x: cx - 50, y: cy + i * 60 },
                nodeRef: createRef<HTMLDivElement>(),
            }));
            setLatexItems(prev => [...prev, ...items]);
            showToast(`Solved ${resp.data.length} expression${resp.data.length > 1 ? 's' : ''}!`, 'success');

        } catch (err: unknown) {
            let msg = 'Something went wrong';
            if (axios.isAxiosError(err)) {
                if (err.code === 'ECONNABORTED') msg = 'Request timed out — try a simpler expression';
                else if (!err.response) msg = 'Cannot reach server — is the backend running?';
                else if (err.response.status === 400) msg = err.response.data?.detail || 'Bad request';
                else if (err.response.status === 429) msg = 'Rate limit — wait a few seconds and try again';
                else if (err.response.status === 502) msg = err.response.data?.detail || 'AI processing failed';
                else msg = `Server error (${err.response.status})`;
            }
            showToast(msg, 'error');
        } finally {
            setIsProcessing(false);
            setProcessingStep('');
        }
    };

    const fmt = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // --- Render ---
    return (
        <div className="relative w-screen h-screen overflow-hidden bg-[#0b1120] select-none">
            {/* Canvas */}
            <canvas
                ref={canvasRef}
                id="canvas"
                role="img"
                aria-label="Drawing canvas — draw mathematical expressions here"
                className={`absolute inset-0 ${tool === 'eraser' ? 'canvas-eraser' : 'canvas-drawing'}`}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseOut={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                onTouchCancel={stopDrawing}
            />

            {/* Grid */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03]" aria-hidden="true" style={{
                backgroundImage: 'radial-gradient(circle, hsl(var(--muted-foreground)) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
            }} />

            {/* Header */}
            <header className="absolute top-0 left-0 right-0 z-30 glass bg-background/80 border-b border-white/[0.08]">
                <div className="flex items-center justify-between px-3 sm:px-4 h-12 sm:h-14">
                    {/* Logo */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-teal-500/20 to-cyan-600/20 ring-1 ring-teal-500/25">
                            <svg width="16" height="16" viewBox="0 0 512 512" fill="none" aria-hidden="true">
                                <path d="M340 108L404 172L216 360L136 384L160 304Z" fill="url(#logoGrad)" opacity="0.95"/>
                                <path d="M340 108L404 172L380 196L316 132Z" fill="#5eead4"/>
                                <path d="M136 384L160 304L184 328Z" fill="#ccfbf1" opacity="0.7"/>
                                <rect x="220" y="200" width="120" height="18" rx="9" fill="#ccfbf1" opacity="0.85"/>
                                <rect x="240" y="234" width="100" height="18" rx="9" fill="#ccfbf1" opacity="0.5"/>
                                <defs><linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#14b8a6"/><stop offset="100%" stopColor="#0891b2"/></linearGradient></defs>
                            </svg>
                        </div>
                        <div className="hidden sm:block">
                            <h1 className="text-sm font-bold text-foreground tracking-tight leading-none">InkSolve</h1>
                            <p className="text-[9px] text-muted-foreground leading-none mt-0.5">Draw math, get answers</p>
                        </div>
                    </div>

                    {/* Center tools */}
                    <nav className="flex items-center gap-0.5 sm:gap-1" aria-label="Canvas tools">
                        <Button onClick={undo} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-9 p-0" aria-label="Undo">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                        </Button>
                        <Button onClick={redo} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-9 p-0" aria-label="Redo">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
                        </Button>
                        <div className="w-px h-4 bg-white/10 mx-0.5 sm:mx-1" aria-hidden="true" />
                        <Button onClick={downloadCanvas} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-9 p-0" aria-label="Download image">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                        </Button>
                        <Button onClick={() => setShowHistory(v => !v)} variant="ghost" size="sm" className={`h-8 w-8 sm:h-9 sm:w-9 p-0 ${showHistory ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`} aria-label="Toggle history panel">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </Button>
                        <Button onClick={() => setShowShortcuts(v => !v)} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-9 p-0 hidden sm:flex" aria-label="Keyboard shortcuts">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M7 16h10"/></svg>
                        </Button>
                    </nav>

                    {/* Right */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Button onClick={() => setShowToolbar(v => !v)} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-9 p-0 sm:hidden" aria-label="Toggle toolbar">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
                        </Button>
                        <Button onClick={clearAll} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive h-8 sm:h-9 gap-1 px-2 sm:px-3 text-[10px] sm:text-xs" aria-label="Clear canvas">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            <span className="hidden sm:inline">Clear</span>
                        </Button>
                        <Button id="btn-calc" onClick={runRoute} disabled={isProcessing} size="sm" aria-label="Calculate expression"
                            className="h-8 sm:h-9 gap-1 sm:gap-1.5 px-3 sm:px-4 text-[10px] sm:text-xs font-medium bg-primary hover:bg-primary/90 text-white glow-primary disabled:opacity-50 disabled:cursor-wait">
                            {isProcessing ? (
                                <><svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span className="hidden sm:inline">Analyzing...</span></>
                            ) : (
                                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg><span>Calculate</span></>
                            )}
                        </Button>
                    </div>
                </div>
                {isProcessing && <div className="h-0.5 w-full bg-white/5 overflow-hidden"><div className="h-full bg-primary animate-progress-bar" /></div>}
            </header>

            {/* Processing status */}
            {isProcessing && processingStep && (
                <div className="absolute top-[56px] sm:top-[68px] left-1/2 -translate-x-1/2 z-30 tooltip-animate" role="status" aria-live="polite">
                    <div className="glass bg-background/80 rounded-full px-3 py-1 border border-white/[0.08] text-[10px] text-muted-foreground">{processingStep}</div>
                </div>
            )}

            {/* Left Toolbar */}
            {showToolbar && (
                <aside className="absolute left-3 sm:left-4 top-[58px] sm:top-[64px] bottom-4 z-20 flex flex-col gap-2 sm:gap-3 overflow-y-auto overflow-x-hidden py-2 scrollbar-hide" aria-label="Drawing tools">
                    <div className="glass bg-background/80 rounded-xl sm:rounded-2xl p-1.5 sm:p-2.5 border border-white/[0.08] shadow-xl">
                        <div className="flex flex-col items-center gap-1">
                            <button onClick={() => setTool('pen')} className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg transition-all ${tool === 'pen' ? 'bg-primary/20 ring-1 ring-primary text-primary' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`} aria-label="Pen tool" aria-pressed={tool === 'pen'}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>
                            </button>
                            <button onClick={() => setTool('eraser')} className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg transition-all ${tool === 'eraser' ? 'bg-primary/20 ring-1 ring-primary text-primary' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`} aria-label="Eraser tool — removes entire stroke" aria-pressed={tool === 'eraser'}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
                            </button>
                        </div>
                    </div>
                    {tool === 'pen' && (
                        <div className="glass bg-background/80 rounded-xl sm:rounded-2xl p-1.5 sm:p-2.5 border border-white/[0.08] shadow-xl">
                            <div className="grid grid-cols-2 gap-1 sm:gap-1.5">
                                {SWATCHES.map(s => (
                                    <button key={s} onClick={() => setColor(s)} aria-label={`Color ${s}`} aria-pressed={color === s}
                                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md sm:rounded-lg transition-all hover:scale-110 ${color === s ? 'ring-2 ring-primary ring-offset-1 ring-offset-background scale-110' : 'ring-1 ring-white/10'}`}
                                        style={{ backgroundColor: s }} />
                                ))}
                            </div>
                        </div>
                    )}
                    {tool === 'pen' && (
                        <div className="glass bg-background/80 rounded-xl sm:rounded-2xl p-1.5 sm:p-2.5 border border-white/[0.08] shadow-xl">
                            <div className="flex flex-col items-center gap-1">
                                {BRUSH_SIZES.map((sz, i) => (
                                    <button key={sz} onClick={() => setBrushSize(sz)} aria-label={`Brush size ${sz}px`} aria-pressed={brushSize === sz}
                                        className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg transition-all ${brushSize === sz ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-white/5'}`}>
                                        <div className="rounded-full bg-foreground" style={{ width: sz + 2, height: sz + 2 }} />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </aside>
            )}

            {/* History */}
            {showHistory && (
                <aside className="absolute right-2 sm:right-4 top-[56px] sm:top-[64px] z-40 w-64 sm:w-72 max-h-[calc(100vh-72px)] glass bg-background/90 rounded-2xl border border-white/[0.08] shadow-2xl flex flex-col overflow-hidden tooltip-animate" aria-label="Calculation history">
                    <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-white/[0.08]">
                        <h2 className="text-[11px] sm:text-xs font-semibold text-foreground">History ({history.length})</h2>
                        <div className="flex items-center gap-1">
                            {history.length > 0 && <button onClick={() => { setHistory([]); showToast('History cleared', 'info'); }} className="text-[10px] text-muted-foreground hover:text-destructive px-1.5 py-0.5 rounded">Clear</button>}
                            <button onClick={() => setShowHistory(false)} className="text-muted-foreground hover:text-foreground p-0.5" aria-label="Close history">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1 p-1.5">
                        {history.length === 0 ? (
                            <p className="text-center text-xs text-muted-foreground py-8 opacity-50">No calculations yet</p>
                        ) : history.map((e, i) => (
                            <button key={`${e.timestamp}-${i}`} onClick={() => copy(`${e.expr} = ${e.result}`)} className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/5 transition-colors group mb-0.5">
                                <span className="text-[11px] font-mono text-foreground truncate block">{e.expr} = <span className="text-primary font-semibold">{e.result}</span></span>
                                <span className="text-[9px] text-muted-foreground flex justify-between mt-0.5"><span>{fmt(e.timestamp)}</span><span className="opacity-0 group-hover:opacity-100 transition-opacity">click to copy</span></span>
                            </button>
                        ))}
                    </div>
                </aside>
            )}

            {/* Shortcuts */}
            {showShortcuts && (
                <div className="absolute inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={() => setShowShortcuts(false)}>
                    <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
                    <div className="relative glass bg-background/95 rounded-2xl border border-white/10 shadow-2xl p-5 w-72 sm:w-80 tooltip-animate" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold text-foreground">Shortcuts</h2>
                            <button onClick={() => setShowShortcuts(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                        </div>
                        <div className="space-y-2">
                            {[['Ctrl+Enter','Calculate'],['Ctrl+Z / Y','Undo / Redo'],['Ctrl+S','Save image'],['P / E','Pen / Eraser'],['1-4','Brush size'],['Esc','Close panels']].map(([k,d]) => (
                                <div key={k} className="flex items-center justify-between">
                                    <span className="text-[11px] text-muted-foreground">{d}</span>
                                    <kbd className="text-[10px] font-mono bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-foreground">{k}</kbd>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Variables */}
            {Object.keys(dictOfVars).length > 0 && (
                <div className="absolute bottom-3 left-2 sm:bottom-4 sm:left-4 z-30 glass bg-background/80 rounded-xl p-2.5 border border-white/[0.08] shadow-xl max-w-[280px]">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-medium">Variables</p>
                        <button onClick={() => { setDictOfVars({}); showToast('Variables cleared', 'info'); }} className="text-[9px] text-muted-foreground hover:text-destructive">clear</button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {Object.entries(dictOfVars).map(([k, v]) => (
                            <span key={k} onClick={() => copy(`${k} = ${v}`)} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono cursor-pointer hover:bg-primary/20 transition-colors">{k}={v}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* Hint */}
            {latexItems.length === 0 && !hasStrokes && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 pointer-events-none tooltip-animate" aria-hidden="true">
                    <div className="glass bg-background/60 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 border border-white/[0.08] flex items-center gap-2">
                        <span className="text-[10px] sm:text-xs text-muted-foreground">Draw an expression, then <strong className="text-primary">Calculate</strong></span>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className="absolute top-[56px] sm:top-[68px] left-1/2 -translate-x-1/2 z-50 tooltip-animate" role="alert" aria-live="assertive">
                    <div className={`glass rounded-full px-3 py-1.5 border shadow-lg flex items-center gap-1.5 text-[11px] font-medium ${
                        toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400'
                        : 'bg-background/80 border-white/10 text-foreground'
                    }`}>
                        {toast.type === 'success' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>}
                        {toast.type === 'error' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>}
                        {toast.message}
                    </div>
                </div>
            )}

            {/* LaTeX Results */}
            {latexItems.map(item => (
                <Draggable key={item.id} nodeRef={item.nodeRef} defaultPosition={item.position} onStop={(_e, d) => setLatexItems(prev => prev.map(it => it.id === item.id ? { ...it, position: { x: d.x, y: d.y } } : it))}>
                    <div ref={item.nodeRef} className="absolute z-20 glass bg-background/85 pl-3 pr-8 py-2 rounded-xl border border-teal-500/20 shadow-lg shadow-teal-500/10 cursor-move hover:border-teal-500/40 transition-colors group">
                        <span className="text-white text-lg font-mono">{item.latex}</span>
                        <button onClick={() => copy(`${item.rawExpr} = ${item.rawResult}`)} aria-label="Copy result"
                            className="absolute top-1 right-6 w-5 h-5 rounded-full bg-white/5 text-muted-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10 hover:text-foreground">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        </button>
                        <button onClick={() => setLatexItems(prev => prev.filter(it => it.id !== item.id))} aria-label="Remove result"
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/5 text-muted-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 hover:text-red-400">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                    </div>
                </Draggable>
            ))}
        </div>
    );
}
