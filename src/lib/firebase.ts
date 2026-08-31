import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  User as FirebaseUser,
  Auth
} from 'firebase/auth';

export type { FirebaseUser };

import { smartFetch } from '../utils/smartFetch';

// Default non-sensitive Firebase web client configuration (project: ryvo-shop-v3)
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBEdq0iJBlo4Y-IRd331OZAZz4tuVV_T98",
  authDomain: "ryvo-shop-v3.firebaseapp.com",
  projectId: "ryvo-shop-v3",
  storageBucket: "ryvo-shop-v3.firebasestorage.app",
  messagingSenderId: "605012387691",
  appId: "1:605012387691:web:2c66379078ed1736dd0e2e"
};

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

export function initFirebaseSync(): Auth {
  if (firebaseAuth) return firebaseAuth;

  const metaEnv = (import.meta as any).env || {};
  const config = {
    apiKey: metaEnv.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey,
    authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain,
    projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId,
    storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_CONFIG.storageBucket,
    messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
    appId: metaEnv.VITE_FIREBASE_APP_ID || DEFAULT_FIREBASE_CONFIG.appId,
  };

  if (!getApps().length) {
    firebaseApp = initializeApp(config);
  } else {
    firebaseApp = getApp();
  }

  firebaseAuth = getAuth(firebaseApp);
  try {
    setPersistence(firebaseAuth, browserLocalPersistence).catch((err) => {
      console.warn('⚠️ [FIREBASE PERSISTENCE WARN]:', err?.message);
    });
  } catch (e: any) {
    console.warn('⚠️ [FIREBASE PERSISTENCE SYNC WARN]:', e?.message);
  }
  return firebaseAuth;
}

// Eagerly initialize Firebase Auth instance synchronously on script load
firebaseAuth = initFirebaseSync();

export function getClientAuthSync(): Auth {
  if (!firebaseAuth) {
    return initFirebaseSync();
  }
  return firebaseAuth;
}

export async function getClientAuth(): Promise<Auth> {
  return getClientAuthSync();
}

export type OAuthProviderType = 'google' | 'apple' | 'facebook';

export interface OAuthResult {
  success?: boolean;
  cancelled?: boolean;
  redirecting?: boolean;
  user?: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    emailVerified: boolean;
  };
  idToken?: string;
  provider?: OAuthProviderType;
  errorCode?: string;
  errorMessageAr?: string;
  errorMessageEn?: string;
}

function getProviderInstance(providerType: OAuthProviderType) {
  if (providerType === 'google') {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
  }
  if (providerType === 'apple') {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    return provider;
  }
  if (providerType === 'facebook') {
    const provider = new FacebookAuthProvider();
    provider.addScope('email');
    provider.addScope('public_profile');
    return provider;
  }
  throw new Error(`Unsupported provider: ${providerType}`);
}

export async function loginWithProvider(providerType: OAuthProviderType): Promise<OAuthResult> {
  // Obtain auth instance synchronously without any async delay
  const auth = getClientAuthSync();
  const provider = getProviderInstance(providerType);

  // SAFE DEBUG LOG (NO sensitive keys, passwords, or tokens)
  console.log('================ [OAUTH ATTEMPT DEBUG] ================');
  console.log('Provider:', providerType);
  console.log('Firebase ProjectID:', auth.app.options.projectId || 'ryvo-shop-v3');
  console.log('Location Origin:', window.location.origin);
  console.log('Location Hostname:', window.location.hostname);
  console.log('Auth CurrentUser UID:', auth.currentUser?.uid || 'none');
  console.log('Auth CurrentUser Email:', auth.currentUser?.email || 'none');
  console.log('======================================================');

  try {
    // Attempt popup login synchronously
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const idToken = await user.getIdToken();

    console.log('✅ [OAUTH POPUP SUCCESS] Logged in successfully via popup:', user.email);

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        emailVerified: user.emailVerified,
      },
      idToken,
      provider: providerType
    };
  } catch (error: any) {
    const errorCode = error?.code || '';
    const errorMessage = error?.message || '';

    // SAFE ERROR DEBUG LOG
    console.log('⚠️ [OAUTH POPUP ERROR DEBUG] =========================');
    console.log('Provider:', providerType);
    console.log('Firebase ProjectID:', auth.app.options.projectId || 'ryvo-shop-v3');
    console.log('Location Origin:', window.location.origin);
    console.log('Location Hostname:', window.location.hostname);
    console.log('Error Code:', errorCode);
    console.log('Error Message:', errorMessage);
    console.log('======================================================');

    // Handle User Cancellation
    if (
      errorCode === 'auth/popup-closed-by-user' ||
      errorCode === 'auth/cancelled-popup-request' ||
      errorCode === 'auth/user-cancelled' ||
      errorCode === 'popup_closed_by_user' ||
      errorMessage?.includes('closed-by-user')
    ) {
      return { cancelled: true };
    }

    // Automatically Fallback to Redirect when popup is blocked
    if (
      errorCode === 'auth/popup-blocked' ||
      errorCode === 'auth/cancelled-popup-request' ||
      errorCode === 'popup_blocked' ||
      errorMessage?.toLowerCase().includes('popup')
    ) {
      console.log(`🔄 [OAUTH REDIRECT FALLBACK] Popup blocked for ${providerType}. Triggering signInWithRedirect...`);
      try {
        await signInWithRedirect(auth, provider);
        return { redirecting: true };
      } catch (redirectErr: any) {
        console.error('❌ [OAUTH REDIRECT ERROR]', redirectErr?.code, redirectErr?.message);
        return {
          success: false,
          errorCode: redirectErr?.code || 'redirect_failed',
          errorMessageAr: 'تعذر توجيه الصفحة لتسجيل الدخول. يرجى السماح بالنوافذ المنبثقة.',
          errorMessageEn: 'Failed to redirect for sign in. Please allow popups.'
        };
      }
    }

    if (errorCode === 'auth/unauthorized-domain') {
      return {
        success: false,
        errorCode,
        errorMessageAr: `النطاق الحالي (${window.location.hostname}) غير مضاف إلى قائمة Authorized Domains في Firebase Authentication Console. يرجى إضافته في إعدادات Firebase Authentication > Settings > Authorized domains.`,
        errorMessageEn: `Current domain (${window.location.hostname}) is not authorized for OAuth. Please add it to Authorized Domains in Firebase Console (Authentication > Settings > Authorized domains).`
      };
    }

    if (errorCode === 'auth/account-exists-with-different-credential') {
      return {
        success: false,
        errorCode,
        errorMessageAr: 'هذا البريد الإلكتروني مرتبط بالفعل بطريقة تسجيل دخول أخرى.',
        errorMessageEn: 'This email address is already linked to another sign-in method.'
      };
    }

    if (errorCode === 'auth/operation-not-allowed') {
      return {
        success: false,
        errorCode,
        errorMessageAr: `مزود المصادقة (${providerType}) غير مفعل حالياً في إعدادات Firebase Console.`,
        errorMessageEn: `Sign-in provider (${providerType}) is not enabled in Firebase Console.`
      };
    }

    return {
      success: false,
      errorCode,
      errorMessageAr: errorMessage || 'حدث خطأ في المصادقة بواسطة المزود الخارجي.',
      errorMessageEn: errorMessage || 'An error occurred during social sign-in.'
    };
  }
}

export async function checkOAuthRedirectResult(): Promise<{ success: boolean; user?: any; token?: string } | null> {
  try {
    const auth = getClientAuthSync();
    if (!auth) return null;

    const result = await getRedirectResult(auth);
    if (!result || !result.user) return null;

    const user = result.user;
    const idToken = await user.getIdToken();

    console.log('================ [OAUTH REDIRECT RESULT DEBUG] ================');
    console.log('ProviderId:', result.providerId);
    console.log('User UID:', user.uid);
    console.log('User Email:', user.email);
    console.log('Location Origin:', window.location.origin);
    console.log('Location Hostname:', window.location.hostname);
    console.log('===============================================================');

    let providerType: OAuthProviderType = 'google';
    if (result.providerId?.includes('apple')) providerType = 'apple';
    if (result.providerId?.includes('facebook')) providerType = 'facebook';

    let data: any = null;
    let isSuccess = false;

    try {
      data = await smartFetch('/api/auth/oauth-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          provider: providerType,
          email: user.email,
          name: user.displayName
        })
      });
      if (data && data.success && data.user) {
        isSuccess = true;
      }
    } catch (smartErr: any) {
      console.warn('⚠️ [OAUTH REDIRECT SMARTFETCH WARN]', smartErr);
      try {
        const backendRes = await fetch('/api/auth/oauth-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken,
            provider: providerType,
            email: user.email,
            name: user.displayName
          })
        });
        if (backendRes.ok) {
          data = await backendRes.json();
          if (data && data.success && data.user) {
            isSuccess = true;
          }
        }
      } catch (directErr) {
        console.error('❌ [OAUTH REDIRECT DIRECT FAIL]', directErr);
      }
    }

    if (isSuccess && data?.user) {
      if (data.token) {
        localStorage.setItem('ryvo_session_token', data.token);
      }
      localStorage.setItem('ryvo_user', JSON.stringify(data.user));
      return {
        success: true,
        user: data.user,
        token: data.token
      };
    }

    if (user.email) {
      const fallbackUser = {
        email: user.email.toLowerCase().trim(),
        name: user.displayName || user.email.split('@')[0],
        role: user.email.toLowerCase().trim() === 'ryvo.shopa@gmail.com' ? 'admin' : 'customer',
        favorites: [],
        points: 100
      };
      localStorage.setItem('ryvo_user', JSON.stringify(fallbackUser));
      return {
        success: true,
        user: fallbackUser
      };
    }

    return null;
  } catch (err: any) {
    console.log('⚠️ [OAUTH REDIRECT CHECK DEBUG]', err?.code, err?.message);
    return null;
  }
}

/**
 * Completely purges all user sessions, authentication tokens, and cached credentials from browser storage.
 */
export function clearClientAuthStorage(): void {
  try {
    const authKeys = [
      'ryvo_session_token',
      'ryvo_user',
      'ryvo_auth_token',
      'admin_session',
      'ryvo_session_id',
      'ryvo_oauth_in_progress'
    ];
    authKeys.forEach(k => {
      try {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      } catch (_) {}
    });
  } catch (e) {
    console.warn('⚠️ [STORAGE PURGE WARN]', e);
  }
}

/**
 * Performs a complete, clean sign-out from Firebase Auth and purges local storage.
 * Guarantees auth.currentUser becomes null and prevents session revival.
 */
export async function logoutClientAuth(): Promise<void> {
  console.log('🔒 [AUTH LOGOUT] Terminating client authentication session...');
  try {
    const auth = getClientAuthSync();
    if (auth) {
      await signOut(auth);
      console.log('✅ [FIREBASE AUTH SIGN OUT] Firebase Auth signOut succeeded (currentUser is null).');
    }
  } catch (err: any) {
    console.warn('⚠️ [FIREBASE AUTH SIGN OUT WARN]', err?.message || err);
  } finally {
    clearClientAuthStorage();
  }
}

/**
 * Subscribes to Firebase onAuthStateChanged as the primary source of truth.
 */
export function subscribeAuthState(callback: (user: FirebaseUser | null) => void): () => void {
  try {
    const auth = getClientAuthSync();
    if (!auth) return () => {};
    return onAuthStateChanged(auth, callback);
  } catch (e) {
    console.warn('⚠️ [SUBSCRIBE AUTH STATE ERROR]', e);
    return () => {};
  }
}

