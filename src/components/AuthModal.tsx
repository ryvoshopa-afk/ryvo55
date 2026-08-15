import React, { useState } from 'react';
import { Language, User, SimulatedEmail } from '../types';
import { TRANSLATIONS } from '../constants/translations';
import { X, ShieldAlert, Key, Mail, Sparkles, UserCheck, Eye, EyeOff } from 'lucide-react';
import { loginWithProvider, OAuthProviderType } from '../lib/firebase';

// Seeding standard registered users helper
const getRegisteredUsers = (): User[] => {
  const saved = localStorage.getItem('ryvo_registered_users');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
  }
  const defaultUsers: User[] = [
    {
      email: 'ryvo.shopa@gmail.com',
      name: 'أدمن رايفو',
      role: 'admin',
      favorites: []
    }
  ];
  localStorage.setItem('ryvo_registered_users', JSON.stringify(defaultUsers));
  return defaultUsers;
};

const saveRegisteredUsers = (users: User[]) => {
  localStorage.setItem('ryvo_registered_users', JSON.stringify(users));
};

const sendSimulatedEmail = (to: string, subject: string, body: string) => {
  const saved = localStorage.getItem('ryvo_customer_emails');
  let emails: SimulatedEmail[] = [];
  if (saved) {
    try {
      emails = JSON.parse(saved);
    } catch (e) {
      // ignore
    }
  }
  const newEmail: SimulatedEmail = {
    id: `EMAIL-${Math.floor(1000 + Math.random() * 9000)}`,
    to: to.toLowerCase().trim(),
    subject,
    body,
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    read: false
  };
  emails.unshift(newEmail);
  localStorage.setItem('ryvo_customer_emails', JSON.stringify(emails));
};

interface AuthModalProps {
  currentLanguage: Language;
  onClose: () => void;
  onAuthSuccess: (user: User) => void;
}

export default function AuthModal({
  currentLanguage,
  onClose,
  onAuthSuccess
}: AuthModalProps) {
  const t = TRANSLATIONS[currentLanguage];
  const isRtl = currentLanguage === 'ar';

  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot' | 'otp_verify'>('login');
  const [otpPurpose, setOtpPurpose] = useState<'verification' | 'reset'>('verification');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [fullname, setFullname] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success', text: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeOAuthProvider, setActiveOAuthProvider] = useState<OAuthProviderType | null>(null);

  const handleOAuthLogin = async (provider: OAuthProviderType) => {
    setFeedback(null);
    setIsLoading(true);
    setActiveOAuthProvider(provider);

    try {
      const oauthRes = await loginWithProvider(provider);

      if (oauthRes.redirecting) {
        // User is being redirected to the OAuth provider login page
        return;
      }

      if (oauthRes.cancelled) {
        setIsLoading(false);
        setActiveOAuthProvider(null);
        return;
      }

      if (!oauthRes.success || !oauthRes.idToken) {
        setFeedback({
          type: 'error',
          text: isRtl
            ? (oauthRes.errorMessageAr || 'تعذر تسجيل الدخول من خلال المزود الخارجي')
            : (oauthRes.errorMessageEn || 'Failed to sign in with social provider')
        });
        setIsLoading(false);
        setActiveOAuthProvider(null);
        return;
      }

      const backendRes = await fetch('/api/auth/oauth-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: oauthRes.idToken,
          provider,
          email: oauthRes.user?.email,
          name: oauthRes.user?.displayName
        })
      });

      const data = await backendRes.json();

      if (backendRes.ok && data.success && data.user) {
        if (data.token) {
          localStorage.setItem('ryvo_session_token', data.token);
        }
        setFeedback({
          type: 'success',
          text: isRtl ? 'تم تسجيل الدخول بنجاح! 🎉' : 'Signed in successfully! 🎉'
        });

        const registeredList = getRegisteredUsers();
        const existingIdx = registeredList.findIndex(u => u.email.toLowerCase() === data.user.email.toLowerCase());
        if (existingIdx > -1) {
          registeredList[existingIdx] = { ...registeredList[existingIdx], ...data.user };
        } else {
          registeredList.push(data.user);
        }
        saveRegisteredUsers(registeredList);

        setTimeout(() => {
          onAuthSuccess(data.user);
          onClose();
        }, 500);
      } else {
        setFeedback({
          type: 'error',
          text: data.error || (isRtl ? 'فشل إكمال عملية تسجيل الدخول' : 'Failed to complete login process')
        });
      }
    } catch (err: any) {
      console.error('OAuth error:', err);
      setFeedback({
        type: 'error',
        text: isRtl ? 'حدث خطأ في الاتصال أثناء تسجيل الدخول' : 'Connection error during OAuth login'
      });
    } finally {
      setIsLoading(false);
      setActiveOAuthProvider(null);
    }
  };

  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setIsLoading(true);

    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = otpCode.trim();

    if (!cleanCode || cleanCode.length !== 6) {
      setFeedback({ type: 'error', text: isRtl ? 'يرجى إدخال كود الأمان المكون من 6 أرقام كاملاً' : 'Please enter the complete 6-digit OTP code' });
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          code: cleanCode,
          purpose: otpPurpose,
          newPassword: otpPurpose === 'reset' ? (newPassword || password) : undefined
        })
      });
      const data = await res.json();

      if (data.success || data.verified) {
        setFeedback({
          type: 'success',
          text: isRtl ? 'تم التحقق من الكود وتأكيد الحساب بنجاح! 🔓' : 'Code verified and account activated successfully! 🔓'
        });

        const registeredList = getRegisteredUsers();
        let userToLog: User = data.user || {
          email: cleanEmail,
          name: fullname || cleanEmail.split('@')[0],
          role: cleanEmail === 'ryvo.shopa@gmail.com' ? 'admin' : 'customer',
          favorites: [],
          points: 100
        };

        const existingIdx = registeredList.findIndex(u => u.email.toLowerCase() === cleanEmail);
        if (existingIdx > -1) {
          registeredList[existingIdx] = { ...registeredList[existingIdx], ...userToLog };
        } else {
          registeredList.push(userToLog);
        }
        saveRegisteredUsers(registeredList);

        setTimeout(() => {
          onAuthSuccess(userToLog);
          onClose();
        }, 1000);
      } else {
        setFeedback({ type: 'error', text: data.error || (isRtl ? 'رمز التحقق المكون من 6 أرقام غير صحيح أو انتهت صلاحيته' : 'Invalid or expired OTP code') });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: isRtl ? 'حدث خطأ في الاتصال بالخادم' : 'Server connection error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === 'otp_verify') {
      return handleVerifyOtpSubmit(e);
    }

    setFeedback(null);
    const cleanEmail = email.toLowerCase().trim();

    if (authMode === 'forgot') {
      if (!cleanEmail) {
        setFeedback({ type: 'error', text: t.error_empty_fields });
        return;
      }

      setIsLoading(true);
      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail })
        });
        const data = await res.json();
        if (data.success) {
          setOtpPurpose('reset');
          setAuthMode('otp_verify');
          setFeedback({
            type: 'success',
            text: isRtl 
              ? 'تم إرسال كود استعادة كلمة المرور المكون من 6 أرقام إلى بريدك الإلكتروني بنجاح! 📩' 
              : 'A 6-digit recovery code has been sent directly to your email inbox! 📩'
          });
          setIsLoading(false);
          return;
        } else {
          setFeedback({ type: 'error', text: data.error || (isRtl ? 'تعذر إرسال الكود' : 'Failed to send recovery code') });
        }
      } catch (err) {
        console.error("Forgot password API error:", err);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!cleanEmail || !password || (authMode === 'register' && !fullname.trim())) {
      setFeedback({ type: 'error', text: t.error_empty_fields });
      return;
    }

    const registeredList = getRegisteredUsers();

    // Check credentials via backend API
    if (authMode === 'login') {
      setIsLoading(true);
      try {
        console.log("LOGIN REQUEST");
        console.log("Email:", cleanEmail);
        console.log("Password:", JSON.stringify(password));
        console.log("Password Length:", password.length);

        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email: cleanEmail, password })
        });

        if (response.ok) {
          const resData = await response.json();
          if (resData.token) {
            localStorage.setItem('ryvo_session_token', resData.token);
          }
          let loggedUser: User = resData.user;

          console.log("==========================================");
          console.log("🔑 [FRONTEND AUTH LOGIN SUCCESS DEBUG]:");
          console.log(" - user.id:", loggedUser.id || loggedUser.email);
          console.log(" - user.email:", loggedUser.email);
          console.log(" - user.role:", loggedUser.role);
          console.log(" - isAdmin:", loggedUser.role === 'admin');
          console.log("==========================================");

          // Update registered list in localStorage for offline reference without password
          const existingList = getRegisteredUsers();
          const userIndex = existingList.findIndex(u => u.email.toLowerCase() === cleanEmail);
          const safeLoggedUser = { ...loggedUser };
          delete (safeLoggedUser as any).password;

          if (userIndex > -1) {
            existingList[userIndex] = { ...existingList[userIndex], ...safeLoggedUser };
          } else {
            existingList.push(safeLoggedUser);
          }
          saveRegisteredUsers(existingList);

          setFeedback({
            type: 'success',
            text: loggedUser.role === 'admin'
              ? t.auth_success_admin
              : loggedUser.role === 'affiliate'
                ? (currentLanguage === 'ar' ? 'تم تسجيل دخول الشريك المسوق بنجاح! 💸' : 'Affiliate partner logged in successfully! 💸')
                : t.auth_success_customer
          });

          setTimeout(() => {
            onAuthSuccess(loggedUser);
            onClose();
            setIsLoading(false);
          }, 1000);
          return;
        } else {
          const resErr = await response.json().catch(() => ({}));
          const defaultArMsg = 'يبدو أن البريد الإلكتروني أو كلمة المرور غير صحيحة! يرجى التحقق وإعادة المحاولة أو استعادتها.';
          const errMsg = isRtl
            ? (resErr.error || defaultArMsg)
            : (resErr.error || 'Invalid email address or password');
          setFeedback({ type: 'error', text: errMsg });
          setIsLoading(false);
          return;
        }
      } catch (apiErr) {
        console.error("⚠️ API Login network error:", apiErr);
        setFeedback({
          type: 'error',
          text: isRtl 
            ? 'حدث خطأ بالاتصال بالخادم. يرجى التأكد من اتصال الإنترنت وإعادة المحاولة.' 
            : 'Connection error. Please check your network and try again.'
        });
        setIsLoading(false);
        return;
      }
    } else {
      // Sign-Up registration
      const dupe = registeredList.some(u => u.email.toLowerCase() === cleanEmail);
      if (dupe) {
        setFeedback({
          type: 'error',
          text: isRtl ? 'هذا البريد الإلكتروني مسجل بالفعل لمستخدم أخر!' : 'Email already linked to another active account!'
        });
        return;
      }

      setIsLoading(true);
      const roleType = cleanEmail === 'ryvo.shopa@gmail.com' ? 'admin' : 'customer';
      let newRegisteredUser: User = {
        email: cleanEmail,
        name: fullname,
        role: roleType,
        favorites: [],
        password: password,
        token: `token-user-${Math.floor(Math.random() * 8999)}`,
        points: roleType === 'customer' ? 100 : 0,
        points_history: roleType === 'customer' ? [
          {
            id: `pt-wel-${Math.floor(Math.random() * 89999)}`,
            reason_ar: 'الهدية الترحيبية لتسجيل حساب جديد بمتجر رايفو 🎉',
            reason_en: 'Welcome bonus gift for registering our new Ryvo account 🎉',
            points: 100,
            date: new Date().toISOString().split('T')[0]
          }
        ] : []
      };

      try {
        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, name: fullname, password })
        });
        const regData = await regRes.json();
        if (regData.error && regData.error.toLowerCase().includes('already registered')) {
          setFeedback({
            type: 'error',
            text: isRtl ? 'هذا البريد الإلكتروني مسجل بالفعل لمستخدم آخر!' : 'Email already linked to another active account!'
          });
          setIsLoading(false);
          return;
        }

        // Move to OTP verification
        setOtpPurpose('verification');
        setAuthMode('otp_verify');
        setFeedback({
          type: 'success',
          text: isRtl
            ? 'تم إرسال كود التفعيل المكون من 6 أرقام إلى بريدك الإلكتروني بنجاح! 📩 أدخل الكود لإكمال التسجيل:'
            : 'A 6-digit OTP verification code was sent to your email inbox! 📩 Enter the code to activate your account:'
        });

        const newList = [...registeredList, newRegisteredUser];
        saveRegisteredUsers(newList);
      } catch (err) {
        console.error("Backend register API error:", err);
        setOtpPurpose('verification');
        setAuthMode('otp_verify');
        setFeedback({
          type: 'success',
          text: isRtl ? 'تم إنشاء الحساب، يرجى إدخال رمز التأكيد المرسل لبريدك' : 'Account created, please enter your OTP code'
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div onClick={onClose} className="absolute inset-0 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm transition-opacity"></div>

      {/* Dialog container */}
      <div id="auth-form-dialog" className="relative z-10 bg-white dark:bg-[#121622] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 sm:p-8 border border-slate-200 dark:border-[var(--border-dark)] animate-in fade-in zoom-in-95 duration-200 text-slate-800 dark:text-gray-100">
        
        {/* Close button */}
        <button
          id="btn-auth-close"
          data-testid="auth-close-button"
          onClick={onClose}
          aria-label="Close modal"
          className={`absolute top-4 ${isRtl ? 'left-4' : 'right-4'} p-2 rounded-full bg-slate-100 hover:bg-[var(--primary-color)] hover:text-white dark:bg-slate-800 dark:hover:bg-[var(--primary-color)] dark:hover:text-white transition-all cursor-pointer`}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title */}
        <div className="space-y-2 text-center pb-4">
          <h2 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
            {authMode === 'login' 
              ? t.login 
              : authMode === 'register' 
                ? t.register 
                : authMode === 'otp_verify'
                  ? (isRtl ? 'تأكيد كود الأمان 🔐' : 'Enter 6-Digit OTP 🔐')
                  : (isRtl ? 'استعادة كلمة المرور' : 'Recover Password')}
          </h2>
          <p className="text-xs text-slate-400 max-w-[280px] mx-auto leading-relaxed">
            {authMode === 'forgot' 
              ? (isRtl ? 'أدخل بريدك الإلكتروني وسنرسل لك كود التوثيق فوراً' : 'Enter your registered email and we will send a 6-digit code')
              : authMode === 'otp_verify'
                ? (isRtl ? `أدخل الرمز المكون من 6 أرقام المرسل إلى ${email}` : `Enter the 6-digit code sent to ${email}`)
                : t.welcome_text}
          </p>
        </div>

        {/* Alert Feedback messaging */}
        {feedback && (
          <div
            id={feedback.type === 'error' ? 'auth-error-message' : 'auth-success-message'}
            data-testid={feedback.type === 'error' ? 'auth-error-message' : 'auth-success-message'}
            role={feedback.type === 'error' ? 'alert' : 'status'}
            aria-live="assertive"
            className={`p-4 rounded-xl text-xs font-bold ${
              feedback.type === 'error' 
                ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' 
                : 'bg-[var(--primary-color, #dc2626)]/10 text-[var(--primary-color, #dc2626)] border border-[var(--primary-color, #dc2626)]/20'
            } mb-4 text-center`}
          >
            {feedback.type === 'success' && <UserCheck className="w-4 h-4 inline-block align-middle me-1" />}
            <span data-testid="auth-error-text" className="inline-block">{feedback.text}</span>
          </div>
        )}

        {/* Social OAuth Providers */}
        {(authMode === 'login' || authMode === 'register') && (
          <div className="space-y-2.5 mb-4">
            {/* Google Button */}
            <button
              id="btn-oauth-google"
              data-testid="oauth-google-button"
              type="button"
              disabled={isLoading}
              onClick={() => handleOAuthLogin('google')}
              className="w-full py-2.5 px-4 bg-white dark:bg-[#1A1F2C] border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-800 dark:text-white font-semibold rounded-xl text-xs flex items-center justify-center transition-all cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/80 disabled:opacity-50 shadow-sm"
            >
              {activeOAuthProvider === 'google' ? (
                <span className="inline-block animate-pulse">
                  {isRtl ? 'جاري الاتصال بـ Google...' : 'Connecting to Google...'}
                </span>
              ) : (
                <>
                  <svg className="w-4 h-4 me-2.5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>{isRtl ? 'Continue with Google (المتابعة باستخدام Google)' : 'Continue with Google'}</span>
                </>
              )}
            </button>

            {/* Apple Button */}
            <button
              id="btn-oauth-apple"
              data-testid="oauth-apple-button"
              type="button"
              disabled={isLoading}
              onClick={() => handleOAuthLogin('apple')}
              className="w-full py-2.5 px-4 bg-slate-900 dark:bg-black text-white border border-slate-800 dark:border-slate-700 hover:bg-black font-semibold rounded-xl text-xs flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {activeOAuthProvider === 'apple' ? (
                <span className="inline-block animate-pulse">
                  {isRtl ? 'جاري الاتصال بـ Apple...' : 'Connecting to Apple...'}
                </span>
              ) : (
                <>
                  <svg className="w-4 h-4 me-2.5 shrink-0 fill-current" viewBox="0 0 24 24">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.32c.62-.75 1.04-1.8 1.93-2.32.11 1.15-.31 2.31-.97 3.07-.63.74-1.74 1.34-2.87 1.25-.13-1.15.34-2.29.91-3z" />
                  </svg>
                  <span>{isRtl ? 'Continue with Apple (المتابعة باستخدام Apple)' : 'Continue with Apple'}</span>
                </>
              )}
            </button>

            {/* Facebook Button */}
            <button
              id="btn-oauth-facebook"
              data-testid="oauth-facebook-button"
              type="button"
              disabled={isLoading}
              onClick={() => handleOAuthLogin('facebook')}
              className="w-full py-2.5 px-4 bg-[#1877F2] hover:bg-[#166fe5] text-white font-semibold rounded-xl text-xs flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {activeOAuthProvider === 'facebook' ? (
                <span className="inline-block animate-pulse">
                  {isRtl ? 'جاري الاتصال بـ Facebook...' : 'Connecting to Facebook...'}
                </span>
              ) : (
                <>
                  <svg className="w-4 h-4 me-2.5 shrink-0 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  <span>{isRtl ? 'Continue with Facebook (المتابعة باستخدام Facebook)' : 'Continue with Facebook'}</span>
                </>
              )}
            </button>

            {/* Divider line */}
            <div className="relative flex items-center justify-center pt-2 pb-1">
              <div className="border-t border-slate-200 dark:border-slate-800 w-full"></div>
              <span className="bg-white dark:bg-[#121622] px-3 text-[10px] uppercase font-bold text-slate-400 shrink-0">
                {isRtl ? 'أو تسجيل الدخول بالبريد الإلكتروني' : 'or sign in with email'}
              </span>
              <div className="border-t border-slate-200 dark:border-slate-800 w-full"></div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* OTP Mode 6-Digit Code Input */}
          {authMode === 'otp_verify' ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 block">
                  {isRtl ? 'البريد الإلكتروني' : 'Email Address'}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ryvo.shopa@gmail.com"
                  className="w-full text-xs py-2 px-3 rounded-lg border bg-slate-50 dark:bg-[#090B0E] border-slate-300 dark:border-slate-700 text-slate-800 dark:text-white outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 block text-center">
                  {isRtl ? 'رمز التأكيد المكون من 6 أرقام' : '6-Digit Verification OTP'}
                </label>
                <input
                  id="auth-otp-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full text-center text-2xl font-mono tracking-[0.5em] py-3.5 px-4 rounded-xl border bg-slate-50 dark:bg-[#090B0E] border-slate-300 dark:border-slate-700 focus:border-red-500 focus:bg-white dark:focus:bg-black text-slate-850 dark:text-white outline-none transition-all"
                />
              </div>

              {otpPurpose === 'reset' && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 block">
                    {isRtl ? 'كلمة المرور الجديدة' : 'New Password'}
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-sm py-2.5 px-3.5 rounded-xl border bg-slate-50 dark:bg-[#090B0E] border-slate-300 dark:border-slate-700 focus:border-red-500 text-slate-850 dark:text-white outline-none"
                  />
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Full Name for register */}
              {authMode === 'register' && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 block">{t.fullname_label}</label>
                  <input
                    id="auth-reg-fullname"
                    type="text"
                    required
                    value={fullname}
                    onChange={(e) => setFullname(e.target.value)}
                    className={`w-full text-base md:text-xs px-3.5 py-3 rounded-xl border bg-slate-50 dark:bg-[#090B0E] border-transparent focus:border-[var(--primary-color)] focus:bg-white dark:focus:bg-black text-slate-800 dark:text-white outline-none transition-all ${
                      isRtl ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
              )}

              {/* Email */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 block">{t.email_label}</label>
                <div className="relative">
                  <div className={`absolute inset-y-0 ${isRtl ? 'left-3' : 'right-3'} flex items-center pointer-events-none text-slate-400`}>
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="auth-email-input"
                    data-testid="email-input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full text-base md:text-xs py-3 px-3.5 pr-10 rounded-xl border bg-slate-50 dark:bg-[#090B0E] border-transparent focus:border-[var(--primary-color)] focus:bg-white dark:focus:bg-black text-slate-850 dark:text-white outline-none transition-all ${
                      isRtl ? 'text-right pr-3.5 pl-10' : 'text-left pr-10 pl-3.5'
                    }`}
                  />
                </div>
              </div>

              {/* Password */}
              {authMode !== 'forgot' && (
                <div className="space-y-1 font-sans">
                  <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 block">{t.password_label}</label>
                  <div className="relative font-sans">
                    <div className={`absolute inset-y-0 ${isRtl ? 'left-3' : 'right-3'} flex items-center pointer-events-none text-slate-400`}>
                      <Key className="w-4 h-4" />
                    </div>
                    <input
                      id="auth-password-input"
                      data-testid="password-input"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full text-base md:text-xs py-3 px-10 rounded-xl border bg-slate-50 dark:bg-[#090B0E] border-transparent focus:border-[var(--primary-color)] focus:bg-white dark:focus:bg-black text-slate-850 dark:text-white outline-none transition-all placeholder-slate-400 text-center"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={`absolute inset-y-0 ${isRtl ? 'right-3' : 'left-3'} flex items-center text-slate-400 hover:text-[var(--primary-color)] transition-colors`}
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Action button */}
          <button
            id="btn-auth-submit"
            data-testid="login-submit-button"
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-[var(--primary-color)] hover:brightness-110 text-white font-black rounded-xl transition-all cursor-pointer text-xs uppercase shadow-lg shadow-red-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span className="inline-block animate-pulse">{isRtl ? 'جاري المعالجة...' : 'Processing...'}</span>
            ) : (
              authMode === 'login' 
                ? t.login 
                : authMode === 'register' 
                  ? t.register 
                  : authMode === 'otp_verify'
                    ? (isRtl ? 'تأكيد الكود وتأكيد الحساب 🔓' : 'Verify Code & Continue 🔓')
                    : (isRtl ? 'إرسال كود الأمان 📩' : 'Send Recovery OTP 📩')
            )}
          </button>
        </form>

        {/* Change auth mode */}
        <div className="flex flex-col gap-2 items-center justify-center pt-5 border-t border-slate-100 dark:border-slate-200 mt-5">
          {authMode === 'login' && (
            <button
              id="btn-auth-forgot-trigger"
              onClick={() => { setFeedback(null); setAuthMode('forgot'); }}
              className="text-[10px] font-bold uppercase text-amber-500 hover:underline cursor-pointer"
            >
              {isRtl ? 'هل نسيت كلمة المرور؟ 🔑' : 'Forgot Password? 🔑'}
            </button>
          )}

          <button
            id="btn-auth-mode-swap"
            onClick={() => {
              setFeedback(null);
              if (authMode === 'forgot') {
                setAuthMode('login');
              } else {
                setAuthMode(authMode === 'login' ? 'register' : 'login');
              }
            }}
            className="text-[10px] font-black uppercase text-[var(--primary-color)] hover:underline cursor-pointer transition-colors"
          >
            {authMode === 'forgot'
              ? (isRtl ? 'العودة لتسجيل الدخول 🔙' : 'Back to Login 🔙')
              : authMode === 'login' ? t.dont_have_acc : t.already_have_acc}
          </button>
        </div>



      </div>
    </div>
  );
}
