import React, { useEffect, useState } from 'react';
import { CheckCircle2, ShieldCheck, Sparkles, AlertCircle, Loader2, LogIn, ShoppingBag, X, RefreshCw, KeyRound } from 'lucide-react';

interface EmailVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  token?: string;
  email?: string;
  alreadyVerified?: boolean;
  language: 'ar' | 'en' | 'fr';
  onOpenAuth: () => void;
}

export const EmailVerificationModal: React.FC<EmailVerificationModalProps> = ({
  isOpen,
  onClose,
  token,
  email: initialEmail = '',
  alreadyVerified = false,
  language,
  onOpenAuth,
}) => {
  const isRtl = language === 'ar';
  const [status, setStatus] = useState<'otp_input' | 'loading' | 'success' | 'error'>(
    alreadyVerified ? 'success' : 'otp_input'
  );
  const [email, setEmail] = useState<string>(initialEmail);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [message, setMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  useEffect(() => {
    let timer: any;
    if (resendCooldown > 0) {
      timer = setInterval(() => setResendCooldown(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (!isOpen) return;

    if (alreadyVerified) {
      setStatus('success');
      setMessage(
        isRtl
          ? 'تم تأكيد وتفعيل بريدك الإلكتروني بنجاح!'
          : 'Your email has been verified successfully!'
      );
      return;
    }

    // Auto verify if token length is 6 digits or passed in URL
    if (token && token.length === 6 && !isNaN(Number(token))) {
      handleVerifyCode(token);
    }
  }, [isOpen, token, alreadyVerified, isRtl]);

  const handleDigitChange = (index: number, value: string) => {
    const val = value.replace(/\D/g, '');
    if (!val) {
      const nextDigits = [...otpDigits];
      nextDigits[index] = '';
      setOtpDigits(nextDigits);
      return;
    }

    const nextDigits = [...otpDigits];
    nextDigits[index] = val.slice(-1);
    setOtpDigits(nextDigits);

    // Auto focus next input
    if (index < 5 && val) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      const prevInput = document.getElementById(`otp-input-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleVerifyCode = async (codeToVerify?: string) => {
    const code = codeToVerify || otpDigits.join('');
    if (!code || code.length !== 6) {
      setMessage(isRtl ? 'يرجى إدخال كود التأكيد المكون من 6 أرقام كاملاً' : 'Please enter the full 6-digit code');
      return;
    }

    if (!email) {
      setMessage(isRtl ? 'البريد الإلكتروني مطلوب' : 'Email address is required');
      return;
    }

    setIsSubmitting(true);
    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim(), code, purpose: 'verification' })
      });
      const data = await res.json();

      if (data.success || data.verified) {
        setStatus('success');
        setMessage(data.message || (isRtl ? 'تم تأكيد وتفعيل الحساب بنجاح!' : 'Email verified successfully!'));
      } else {
        setStatus('otp_input');
        setMessage(data.error || (isRtl ? 'رمز التأكيد غير صحيح أو انتهت صلاحيته' : 'Invalid or expired OTP code'));
      }
    } catch (err) {
      setStatus('otp_input');
      setMessage(isRtl ? 'حدث خطأ في الاتصال، يرجى المحاولة مرة أخرى' : 'Network error, please try again');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (!email || resendCooldown > 0) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim(), purpose: 'verification' })
      });
      const data = await res.json();
      if (data.success) {
        setMessage(isRtl ? 'تم إرسال رمز أمان جديد إلى بريدك الإلكتروني 📩' : 'New OTP code sent to your inbox 📩');
        setResendCooldown(60);
      } else {
        setMessage(data.error || (isRtl ? 'تعذر إرسال الرمز' : 'Failed to send OTP'));
      }
    } catch (_) {
      setMessage(isRtl ? 'تعذر الاتصال بالخادم' : 'Server connection error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl text-slate-100 text-center overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-red-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-rose-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* STATE 1: OTP INPUT FORM */}
        {status === 'otp_input' && (
          <div className="py-4 flex flex-col items-center justify-center space-y-5 animate-fadeIn">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-red-600/20 via-rose-500/20 to-red-700/20 border-2 border-red-500 flex items-center justify-center shadow-lg shadow-red-500/20">
                <KeyRound className="w-10 h-10 text-red-500" />
              </div>
            </div>

            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-red-500/10 text-red-400 border border-red-500/30 mb-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                {isRtl ? 'توثيق البريد الإلكتروني (OTP)' : 'Email Verification (OTP)'}
              </span>
              <h2 className="text-2xl font-black text-white">
                {isRtl ? 'أدخل رمز الأمان المكون من 6 أرقام' : 'Enter 6-Digit Verification Code'}
              </h2>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                {isRtl 
                  ? `أرسلنا كود الأمان المكون من 6 أرقام إلى: ${email || 'بريدك الإلكتروني'}`
                  : `We sent a 6-digit security code to: ${email || 'your email'}`}
              </p>
            </div>

            {!initialEmail && (
              <div className="w-full">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isRtl ? 'البريد الإلكتروني' : 'Your Email Address'}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-center text-sm text-white focus:border-red-500 outline-none"
                />
              </div>
            )}

            {/* 6-Digit OTP Inputs */}
            <div className="flex items-center justify-center gap-2 dir-ltr my-2" dir="ltr">
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  id={`otp-input-${idx}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  className="w-11 h-13 md:w-12 md:h-14 text-center text-xl font-black font-mono bg-slate-950 border-2 border-slate-800 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 rounded-xl text-white outline-none transition-all"
                />
              ))}
            </div>

            {message && (
              <div className={`p-3 rounded-xl text-xs font-bold w-full text-center ${
                message.includes('نجاح') || message.includes('sent')
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {message}
              </div>
            )}

            <button
              onClick={() => handleVerifyCode()}
              disabled={isSubmitting || otpDigits.join('').length !== 6}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  {isRtl ? 'تأكيد الرمز وتفعيل الحساب 🔓' : 'Verify Code & Activate 🔓'}
                </>
              )}
            </button>

            <div className="flex items-center justify-between w-full text-xs pt-1">
              <button
                onClick={handleResendOtp}
                disabled={resendCooldown > 0 || isSubmitting}
                className="text-red-400 hover:text-red-300 font-bold disabled:opacity-50 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
                {resendCooldown > 0
                  ? (isRtl ? `إعادة الإرسال خلال (${resendCooldown}ث)` : `Resend in (${resendCooldown}s)`)
                  : (isRtl ? 'لم يصلك الرمز؟ إعادة الإرسال 📩' : 'Didn\'t receive code? Resend 📩')}
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                {isRtl ? 'تسجيل الدخول' : 'Sign In'}
              </button>
            </div>
          </div>
        )}

        {/* STATE 2: LOADING */}
        {status === 'loading' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-4">
            <div className="relative flex items-center justify-center w-20 h-20 bg-red-500/10 border border-red-500/30 rounded-full">
              <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
            </div>
            <h3 className="text-xl font-black text-red-400">
              {isRtl ? 'جاري التحقق والتفعيل...' : 'Verifying OTP code...'}
            </h3>
            <p className="text-sm text-slate-400 max-w-xs">
              {isRtl
                ? 'يرجى الانتظار لحظات، جاري المطابقة مع خوادم المتجر الرسمية.'
                : 'Please wait a moment while we validate your 6-digit code.'}
            </p>
          </div>
        )}

        {/* STATE 3: SUCCESS */}
        {status === 'success' && (
          <div className="py-4 flex flex-col items-center justify-center space-y-5 animate-scaleUp">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-red-600/20 via-emerald-500/20 to-red-700/20 border-2 border-red-500 flex items-center justify-center shadow-lg shadow-red-500/20">
                <ShieldCheck className="w-12 h-12 text-red-500" />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-slate-950 p-1.5 rounded-full border-2 border-slate-900 shadow">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-red-500/10 text-red-400 border border-red-500/20 mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                {isRtl ? 'تفعيل حساب رسمي' : 'Official Verification'}
              </span>
              <h2 className="text-2xl font-black text-white">
                {isRtl ? 'تم تفعيل البريد الإلكتروني بنجاح! 🎉' : 'Email Verified Successfully! 🎉'}
              </h2>
            </div>

            {email && (
              <div className="px-4 py-1.5 bg-slate-800/80 border border-slate-700/80 rounded-xl font-mono text-xs text-red-400 font-bold max-w-full truncate">
                {email}
              </div>
            )}

            <div className="w-full p-4 bg-slate-950/60 border border-slate-800/80 rounded-2xl text-right text-xs text-slate-300 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{isRtl ? 'حالة الحساب:' : 'Account Status:'}</span>
                <span className="font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {isRtl ? 'نشط ومُفعّل (Active)' : 'Active & Verified'}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-800/80 pt-2">
                <span className="text-slate-400">{isRtl ? 'هدية الانضمام:' : 'Welcome Bonus:'}</span>
                <span className="font-bold text-red-400">
                  {isRtl ? '100 نقطة ولاء مجانية 🎉' : '100 Free Loyalty Points'}
                </span>
              </div>
            </div>

            <div className="w-full pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-black text-sm shadow-lg shadow-red-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                {isRtl ? 'تسجيل الدخول الآن 🔓' : 'Log In Now 🔓'}
              </button>

              <button
                onClick={onClose}
                className="w-full py-3.5 px-6 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition-all flex items-center justify-center gap-2 border border-slate-700 cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                {isRtl ? 'تصفح المتجر 🛍️' : 'Browse Store 🛍️'}
              </button>
            </div>
          </div>
        )}

        {/* STATE 4: ERROR */}
        {status === 'error' && (
          <div className="py-6 flex flex-col items-center justify-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertCircle className="w-10 h-10" />
            </div>

            <h3 className="text-xl font-extrabold text-amber-400">
              {isRtl ? 'تعذر التحقق' : 'Verification Issue'}
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed max-w-sm">
              {message}
            </p>

            <div className="w-full pt-4 flex flex-col gap-2">
              <button
                onClick={() => setStatus('otp_input')}
                className="w-full py-3 px-6 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow transition-all cursor-pointer"
              >
                {isRtl ? 'إعادة المحاولة وإدخال الرمز' : 'Try Entering Code Again'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
