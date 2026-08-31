import React, { StrictMode, Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<any, any> {
  state: any = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🚨 [ROOT ERROR BOUNDARY CAUGHT RUNTIME ERROR]:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0F17', color: '#FFFFFF', padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <div style={{ maxWidth: '500px', width: '100%', background: '#161D2A', borderRadius: '16px', padding: '32px', border: '1px solid #283548', textAlign: 'center' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px', color: '#F43F5E' }}>حدث خطأ غير متوقع أثناء تشغيل الصفحة</h2>
            <p style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '24px', lineHeight: '1.6' }}>
              واجه التطبيق استثناءً مؤقتاً أثناء التحميل. اضغط على الزر أدناه لإعادة تشغيل الصفحة بأمان.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  try { localStorage.removeItem('ryvo_user'); } catch (e) {}
                  window.location.reload();
                }}
                style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
              >
                إعادة تحميل المتجر
              </button>
            </div>
            {this.state.error && (
              <pre style={{ marginTop: '20px', padding: '12px', background: '#0F141E', borderRadius: '8px', fontSize: '11px', color: '#E2E8F0', overflowX: 'auto', textAlign: 'left', direction: 'ltr' }}>
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

// Gracefully catch and suppress benign Vite development WebSocket / HMR connection errors 
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || String(event.reason || '');
    if (
      msg.includes('WebSocket') ||
      msg.includes('vite') ||
      msg.includes('WS')
    ) {
      // Prevent browser console cluttering during live workspace development
      event.preventDefault();
    }
  });

  // Global fetch interceptor to support dynamic API URL prefixing for Next.js and Vite environments
  try {
    const originalFetch = window.fetch;
    const customFetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const meta = import.meta as any;
      const envUrl = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_API_URL) || (meta.env && (meta.env.VITE_API_URL || meta.env.NEXT_PUBLIC_API_URL)) || '';
      if (envUrl && typeof input === 'string' && input.startsWith('/api/')) {
        input = envUrl.replace(/\/$/, '') + input;
      }
      return originalFetch(input, init);
    };

    try {
      (window as any).fetch = customFetch;
    } catch (err) {
      Object.defineProperty(window, 'fetch', {
        value: customFetch,
        configurable: true,
        writable: true,
        enumerable: true
      });
    }
  } catch (e) {
    console.warn('Unable to intercept window.fetch, proceeding with default fetch:', e);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
);
