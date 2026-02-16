'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body style={{ backgroundColor: '#1a1a2e', margin: 0 }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          fontFamily: 'system-ui, sans-serif',
          color: '#e0e0e0',
        }}>
          <div style={{
            maxWidth: '28rem',
            width: '100%',
            padding: '2rem',
            textAlign: 'center',
            border: '2px solid #5a5a3c',
            borderRadius: '0.5rem',
            backgroundColor: '#2a2a1e',
          }}>
            <div style={{ marginBottom: '1rem' }}>
              <AlertCircle style={{ width: 48, height: 48, color: '#ef4444', margin: '0 auto' }} />
            </div>
            <h2 style={{ color: '#ff981f', marginBottom: '0.75rem', fontSize: '1.1rem' }}>
              Critical Error
            </h2>
            <p style={{ color: '#b0b0b0', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              The application encountered a critical error. Please try refreshing the page.
            </p>
            <button
              onClick={reset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                border: '2px solid #5a5a3c',
                borderRadius: '0.375rem',
                backgroundColor: '#3a3a2e',
                color: '#ff981f',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              <RefreshCw style={{ width: 16, height: 16 }} />
              Refresh Page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
