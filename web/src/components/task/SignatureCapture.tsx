import { useRef, useState, useEffect, useCallback } from 'react';

interface SignatureCaptureProps {
  onSubmit: (dataUrl: string) => Promise<void>;
  label?: string;
}

/**
 * Canvas-based signature pad with touch and mouse support.
 * No external dependencies — keeps the bundle small.
 */
export function SignatureCapture({ onSubmit, label = 'Signature' }: SignatureCaptureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set up canvas size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;  // Retina
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(2, 2);
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, []);

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getPos]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStrokes(true);
  }, [drawing, getPos]);

  const endDraw = useCallback(() => {
    setDrawing(false);
  }, []);

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    setError(null);
  };

  const handleSubmit = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes) return;
    setSubmitting(true);
    setError(null);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      await onSubmit(dataUrl);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit signature');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="card text-center">
        <p className="text-donkey-green font-bold text-sm">{label} captured</p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="meta-label mb-2">{label}</p>

      <canvas
        ref={canvasRef}
        className="w-full h-32 rounded-lg border-2 border-donkey-border bg-donkey-bg cursor-crosshair touch-none"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />

      <div className="flex gap-3 mt-3">
        <button
          className="btn-secondary flex-1"
          onClick={handleClear}
          disabled={!hasStrokes}
        >
          Clear
        </button>
        <button
          className="btn-primary flex-1"
          onClick={handleSubmit}
          disabled={!hasStrokes || submitting}
        >
          {submitting ? 'Submitting...' : 'Confirm'}
        </button>
      </div>

      {error && <p className="text-donkey-red text-xs mt-2">{error}</p>}
    </div>
  );
}
