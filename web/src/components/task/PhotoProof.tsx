import { useState, useRef } from 'react';

interface PhotoProofProps {
  taskId: string;
  label?: string;
  onSubmit: (file: File) => Promise<void>;
}

/**
 * Camera/file input for photo proof collection.
 * Uses `capture="environment"` for mobile rear camera access.
 */
export function PhotoProof({ label = 'Photo proof', onSubmit }: PhotoProofProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError(null);

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(selected);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(file);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload proof');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  if (submitted) {
    return (
      <div className="card text-center">
        <p className="text-donkey-green font-bold text-sm">{label} submitted</p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="meta-label mb-2">{label}</p>

      {preview ? (
        <div className="mb-3">
          <img
            src={preview}
            alt="Proof preview"
            className="w-full h-40 object-cover rounded-lg border border-donkey-border"
          />
          <button
            className="text-xs text-donkey-muted underline mt-1"
            onClick={handleReset}
          >
            Retake
          </button>
        </div>
      ) : (
        <label className="block cursor-pointer mb-3">
          <div className="border-2 border-dashed border-donkey-border rounded-lg p-6 text-center hover:border-donkey-purple transition-colors">
            <p className="text-sm text-donkey-muted">Tap to take a photo or select from gallery</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      )}

      {file && !submitted && (
        <button
          className="btn-primary w-full"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Uploading...' : `Submit ${label}`}
        </button>
      )}

      {error && <p className="text-donkey-red text-xs mt-2">{error}</p>}
    </div>
  );
}
