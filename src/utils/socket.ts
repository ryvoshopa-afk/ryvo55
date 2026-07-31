import { io, Socket } from "socket.io-client";

// Connect to the API server origin dynamically supporting Next.js and Vite env prefixes
export const getApiUrl = (): string => {
  const meta = import.meta as any;
  
  // 1. Check explicit environment variables first
  const envUrl = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_API_URL) || 
                 (meta.env && (meta.env.VITE_API_URL || meta.env.NEXT_PUBLIC_API_URL)) || '';
  if (envUrl) return envUrl.replace(/\/$/, '');
  
  // 2. Fallback to smart detection based on current window domain
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const origin = window.location.origin;
    
    // If we are in local development, use localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return origin || 'http://localhost:3000';
    }
    
    // If we are on Vercel, Netlify, custom domain, or hosted preview, point directly to the persistent Render backend
    if (hostname.includes('ryvo.shop') || hostname.includes('vercel.app') || hostname.includes('netlify.app') || hostname.includes('onrender.com')) {
      return 'https://ryvo426.onrender.com';
    }
    
    // Otherwise fallback to the current host origin
    return origin;
  }
  
  return 'https://ryvo426.onrender.com';
};

const socketUrl = getApiUrl();

export const socket: Socket = io(socketUrl, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 15,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  transports: ['websocket', 'polling'],
  upgrade: true,
  rememberUpgrade: true
});
export default socket;
