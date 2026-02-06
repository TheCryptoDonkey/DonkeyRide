import { useState } from 'react';

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = { sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl' };

export function StarRating({ value, onChange, readonly = false, size = 'md' }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);

  const displayValue = hovered || value;

  return (
    <div className="flex gap-1" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          className={`${SIZES[size]} transition-colors ${
            readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'
          } ${star <= displayValue ? 'text-donkey-orange' : 'text-donkey-border'}`}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => !readonly && setHovered(star)}
        >
          {star <= displayValue ? '\u2605' : '\u2606'}
        </button>
      ))}
    </div>
  );
}
