import { useMemo } from 'react';
import { getModules, modulesToPath, type EccLevel } from '../../utils/qr';

interface QrCodeSvgProps {
  /** The text to encode (e.g. a `lightning:<bolt11>` deeplink) */
  value: string;
  /** Rendered pixel size (square) */
  size?: number;
  /** Error-correction level; 'M' is a good default for on-screen scanning */
  ecl?: EccLevel;
  className?: string;
}

/**
 * Renders a scannable QR code as inline SVG. The matrix is produced by the
 * dependency-free encoder in utils/qr.ts — no external library, no network,
 * so it is safe under the built app's strict CSP. Drawn as a single <path>
 * for efficiency (thousands of modules would be too many <rect> elements).
 */
export function QrCodeSvg({ value, size = 220, ecl = 'M', className }: QrCodeSvgProps) {
  const rendered = useMemo(() => {
    try {
      const modules = getModules(value, ecl);
      const margin = 2;
      const dim = modules.length + margin * 2;
      return { path: modulesToPath(modules, margin), dim };
    } catch {
      return null;
    }
  }, [value, ecl]);

  if (!rendered) {
    return (
      <p className="text-xs text-donkey-red text-center">
        Could not render a QR code — use the invoice text below.
      </p>
    );
  }

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${rendered.dim} ${rendered.dim}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Payment QR code"
    >
      <rect width={rendered.dim} height={rendered.dim} fill="#ffffff" />
      <path d={rendered.path} fill="#000000" />
    </svg>
  );
}
