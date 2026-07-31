/**
 * Smart Fetch Utility with Exponential Backoff, Jitter, and Client-Side Caching.
 * Designed to prevent "Too Many Requests" (429) and "Failed to Fetch" errors.
 */

import { getApiUrl } from './socket';

interface FetchOptions extends RequestInit {
  maxRetries?: number;
  initialDelay?: number;
  useCache?: boolean;
  cacheTtl?: number; // Time-to-live in milliseconds
  forceRefresh?: boolean;
}

const cacheMap = new Map<string, { data: any; timestamp: number }>();

// Delay helper with random jitter to prevent thundering herd
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms + Math.random() * 200));

export async function smartFetch(url: string, options: FetchOptions = {}): Promise<any> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    useCache = false,
    cacheTtl = 30000, // Default 30s cache TTL
    forceRefresh = false,
    ...restOptions
  } = options;

  // Resolve target URL cleanly
  let targetUrl = url;
  if (url.startsWith('/api/') && typeof window !== 'undefined') {
    const baseUrl = getApiUrl();
    if (baseUrl && !baseUrl.startsWith(window.location.origin)) {
      targetUrl = `${baseUrl}${url}`;
    }
  }

  // Use simple memory cache for GET requests if specified
  const isGet = !restOptions.method || restOptions.method.toUpperCase() === 'GET';
  if (useCache && isGet && !forceRefresh) {
    const cached = cacheMap.get(targetUrl);
    if (cached && Date.now() - cached.timestamp < cacheTtl) {
      return cached.data;
    }
  }

  // Ensure we don't query if the tab is in the background (hidden)
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    // If we have cached data, return it even if slightly stale to avoid fetching in bg
    const cached = cacheMap.get(targetUrl);
    if (cached) return cached.data;
  }

  let attempt = 0;
  let currentDelay = initialDelay;

  while (attempt < maxRetries) {
    try {
      const response = await fetch(targetUrl, restOptions);

      // Handle Too Many Requests (429) specifically
      if (response.status === 429) {
        attempt++;
        if (attempt >= maxRetries) {
          throw new Error('Throttled: Too many requests after several retries.');
        }
        // Back off heavily for 429
        const backoffTime = 3000 * attempt;
        console.warn(`[smartFetch] 429 Throttled on ${url}. Retrying attempt ${attempt}/${maxRetries} after ${backoffTime}ms...`);
        await delay(backoffTime);
        continue;
      }

      // Handle Server Errors (5xx)
      if (response.status >= 500) {
        attempt++;
        if (attempt >= maxRetries) {
          throw new Error(`Server Error (${response.status}) on ${url} after several retries.`);
        }
        console.warn(`[smartFetch] Server error ${response.status} on ${url}. Retrying in ${currentDelay}ms...`);
        await delay(currentDelay);
        currentDelay *= 2; // Exponential backoff
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP Error: status ${response.status} on ${url}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let resultData: any;

      if (contentType.includes('application/json')) {
        resultData = await response.json();
      } else {
        resultData = await response.text();
      }

      // Cache the successful GET result
      if (useCache && isGet) {
        cacheMap.set(targetUrl, { data: resultData, timestamp: Date.now() });
      }

      return resultData;
    } catch (error: any) {
      attempt++;
      if (attempt >= maxRetries) {
        throw error;
      }
      console.warn(`[smartFetch] Connection failed on ${url}: ${error.message || error}. Retrying in ${currentDelay}ms...`);
      await delay(currentDelay);
      currentDelay *= 2; // Exponential backoff
    }
  }
}

// Clear client cache for specific endpoint (e.g. after POST/PUT update)
export function invalidateCache(url: string) {
  cacheMap.delete(url);
}
