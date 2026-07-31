import React, { useState, useEffect } from 'react';
import { Bell, Clock, CheckCircle, RefreshCw, X, AlertCircle } from 'lucide-react';
import { StoreSettings } from '../types';

interface PrelaunchBannerProps {
  storeSettings?: StoreSettings;
  isRtl: boolean;
}

export default function PrelaunchBanner({ storeSettings, isRtl }: PrelaunchBannerProps) {
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subscribedSuccess, setSubscribedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Time remaining calculation
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    if (!storeSettings?.launchDate || !storeSettings?.showCountdown) return;

    const targetDate = new Date(storeSettings.launchDate).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diff = targetDate - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ days, hours, minutes, seconds });
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [storeSettings?.launchDate, storeSettings?.showCountdown]);

  if (!storeSettings || storeSettings.storeMode !== 'pre_launch' || !storeSettings.showTopBanner) {
    return null;
  }

  const message = isRtl
    ? storeSettings.preLaunchMessageAr || '🚀 ترقبوا افتتاح متجر RYVO قريباً!'
    : storeSettings.preLaunchMessageEn || '🚀 Stay tuned for the official launch of RYVO Store coming soon!';

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !emailInput.includes('@')) {
      setErrorMessage(isRtl ? 'يرجى إدخال بريد إلكتروني صحيح' : 'Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/prelaunch/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput })
      });
      const data = await res.json();
      if (data.success) {
        setSubscribedSuccess(true);
      } else {
        setErrorMessage(data.error || 'فشل تسجيل البريد الإلكتروني');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ في الشبكة');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Top Banner Bar */}
      <div className="bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 text-white shadow-xl border-b border-amber-400/30 relative z-30">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 font-extrabold truncate">
            <span className="text-base animate-bounce">🚧</span>
            <span className="truncate">{message}</span>
          </div>

          {/* Countdown & Notify Button */}
          <div className="flex items-center gap-3 shrink-0">
            {storeSettings.showCountdown && timeLeft && (
              <div className="hidden md:flex items-center gap-1.5 font-black text-[11px] bg-slate-950/30 px-3 py-1 rounded-full border border-white/20">
                <Clock className="w-3.5 h-3.5 text-amber-300" />
                <span>
                  {timeLeft.days}d : {timeLeft.hours}h : {timeLeft.minutes}m : {timeLeft.seconds}s
                </span>
              </div>
            )}

            {storeSettings.showNotifyMe && (
              <button
                onClick={() => {
                  setShowNotifyModal(true);
                  setSubscribedSuccess(false);
                  setErrorMessage(null);
                }}
                className="bg-slate-950 text-white hover:bg-black px-3 py-1.5 rounded-xl font-extrabold text-[11px] flex items-center gap-1.5 shadow-md transition-all cursor-pointer border border-amber-400/30"
              >
                <Bell className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>{isRtl ? '🔔 أخبرني عند الافتتاح' : 'Notify Me at Launch'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notify Me Modal */}
      {showNotifyModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl relative">
            <button
              onClick={() => setShowNotifyModal(false)}
              className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full bg-slate-100 dark:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {subscribedSuccess ? (
              <div className="text-center space-y-4 py-4">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30 animate-scale">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {isRtl ? 'تم تسجيل بريدك بنجاح! 🎉' : 'Subscribed Successfully!'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {isRtl
                    ? `سنقوم بإرسال إشعار فوري إلى بريدك الحقيقي (${emailInput}) فور الانطلاق الرسمي لمتجر RYVO مع كود خصم خاص!`
                    : `We will send a notification to (${emailInput}) as soon as RYVO Store launches officially!`}
                </p>
                <button
                  onClick={() => setShowNotifyModal(false)}
                  className="w-full py-3 bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-lg cursor-pointer"
                >
                  {isRtl ? 'إغلاق النافذة' : 'Close'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="space-y-4 text-center">
                <div className="w-14 h-14 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/30">
                  <Bell className="w-7 h-7" />
                </div>

                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    {isRtl ? 'كن أول من يعلم عند الافتتاح! 🔔' : 'Be First To Know At Launch!'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {isRtl
                      ? 'سجل بريدك الإلكتروني ليصلك إشعار فوري لحظة انطلاق المتجر والاستفادة من عروض الافتتاح الحصرية.'
                      : 'Enter your email to receive an instant notification right at launch with launch deals.'}
                  </p>
                </div>

                {errorMessage && (
                  <div className="p-3 bg-rose-500/10 text-rose-500 rounded-xl text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="space-y-3 pt-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    required
                    placeholder={isRtl ? 'أدخل بريدك الإلكتروني الحقيقي...' : 'Enter your email address...'}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs outline-none focus:ring-2 focus:ring-amber-500 text-center"
                  />

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Bell className="w-4 h-4" />
                        <span>{isRtl ? 'أشعرني فور الافتتاح' : 'Notify Me At Launch'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
