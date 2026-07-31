import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  signInWithPopup,
  Auth
} from 'firebase/auth';

let firebaseApp: any = null;
let firebaseAuth: Auth | null = null;

export async function getClientAuth(): Promise<Auth> {
  if (firebaseAuth) return firebaseAuth;

  let config: any = null;

  // Try Vite env variables first if present
  const metaEnv = (import.meta as any).env || {};
  const envApiKey = metaEnv.VITE_FIREBASE_API_KEY;
  if (envApiKey) {
    config = {
      apiKey: metaEnv.VITE_FIREBASE_API_KEY,
      authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: metaEnv.VITE_FIREBASE_PROJECT_ID,
      storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: metaEnv.VITE_FIREBASE_APP_ID,
    };
  } else {
    // Fetch public non-sensitive config from backend endpoint
    try {
      const res = await fetch('/api/auth/firebase-config');
      if (res.ok) {
        config = await res.json();
      }
    } catch (err) {
      console.warn('Failed fetching backend firebase-config:', err);
    }
  }

  if (!config || !config.apiKey) {
    throw new Error('CONFIG_MISSING');
  }

  if (!getApps().length) {
    firebaseApp = initializeApp(config);
  } else {
    firebaseApp = getApp();
  }

  firebaseAuth = getAuth(firebaseApp);
  return firebaseAuth;
}

export type OAuthProviderType = 'google' | 'apple' | 'facebook';

export interface OAuthResult {
  success?: boolean;
  cancelled?: boolean;
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

export async function loginWithProvider(providerType: OAuthProviderType): Promise<OAuthResult> {
  try {
    const auth = await getClientAuth();
    let provider: any;

    if (providerType === 'google') {
      provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
    } else if (providerType === 'apple') {
      provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');
    } else if (providerType === 'facebook') {
      provider = new FacebookAuthProvider();
      provider.addScope('email');
      provider.addScope('public_profile');
    } else {
      throw new Error(`Unsupported provider: ${providerType}`);
    }

    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const idToken = await user.getIdToken();

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

    // Gracefully handle user cancellation without displaying error banner
    if (
      errorCode === 'auth/popup-closed-by-user' ||
      errorCode === 'auth/cancelled-popup-request' ||
      errorCode === 'auth/user-cancelled' ||
      errorCode === 'popup_closed_by_user' ||
      error?.message?.includes('closed-by-user')
    ) {
      return { cancelled: true };
    }

    if (errorCode === 'auth/account-exists-with-different-credential') {
      return {
        success: false,
        errorCode,
        errorMessageAr: 'هذا البريد الإلكتروني مرتبط بالفعل بطريقة تسجيل دخول أخرى. يرجى استخدام طريقة تسجيل الدخول الأولى الحساب.',
        errorMessageEn: 'This email address is already linked to another sign-in method. Please use your original sign-in method.'
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

    if (error?.message === 'CONFIG_MISSING') {
      return {
        success: false,
        errorCode: 'CONFIG_MISSING',
        errorMessageAr: 'تعذر الاتصال بخدمة التوثيق (إعدادات Firebase غير متوفرة).',
        errorMessageEn: 'Authentication service unavailable (Firebase config missing).'
      };
    }

    return {
      success: false,
      errorCode,
      errorMessageAr: error?.message || 'حدث خطأ في المصادقة بواسطة المزود الخارجي.',
      errorMessageEn: error?.message || 'An error occurred during social sign-in.'
    };
  }
}
