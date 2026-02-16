'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--osrs-bg)' }}>
      <div className="osrs-panel max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-[var(--osrs-panel-dark)] flex items-center justify-center">
          <AlertCircle className="w-10 h-10 text-red-500" />
        </div>
        <h2
          className="text-[var(--osrs-orange)] mb-3"
          style={{
            fontFamily: 'var(--font-press-start)',
            fontSize: '14px',
            textShadow: '2px 2px 0 #000',
          }}
        >
          Something went wrong!
        </h2>
        <p className="text-gray-300 mb-6 text-sm">
          An unexpected error occurred. This has been logged for investigation.
        </p>
        <button
          onClick={reset}
          className="osrs-button px-6 py-3 rounded flex items-center gap-2 mx-auto"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    </div>
  );
}
