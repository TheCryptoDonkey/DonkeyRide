interface LoadingProps {
  message?: string;
  className?: string;
}

export function Loading({ message = 'Loading...', className }: LoadingProps) {
  return (
    <div className={`flex items-center justify-center p-8 ${className || ''}`}>
      <div className="text-center">
        <div className="animate-spin h-6 w-6 border-2 border-donkey-purple border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-donkey-muted text-sm">{message}</p>
      </div>
    </div>
  );
}
