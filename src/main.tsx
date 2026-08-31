import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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
    <App />
  </StrictMode>,
);
