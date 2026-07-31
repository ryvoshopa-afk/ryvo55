import React, { useState } from 'react';
import { Bell, AlertCircle, X, CheckCircle, RefreshCw, Clock } from 'lucide-react';
import { StoreSettings } from '../types';

interface PrelaunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeSettings?: StoreSettings;
  isRtl: boolean;
}

export default function PrelaunchModal({ isOpen, onClose, storeSettings, isRtl }: PrelaunchModalProps) {
  const [emailInput, setEmailInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const preLaunchMsg = isRtl
    ? storeSettings?.preLaunchMessageAr || '🚀 ترقبوا افتتاح متجر RYVO قريباً - نجهز لكم تجربة تسوق استثنائية!'
    : storeSettings?.preLaunchMessageEn || '🚀 Stay tuned for the official launch of RYVO Store coming soon!';

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !emailInput.includes('@')) {
      setErrorMessage(isRtl ? 'يرجى كتابة بريد إلكتروني صحيح' : 'Please enter a valid email address');
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
        setIsSuccess(true);
      } else {
        setErrorMessage(data.error || 'فشل التسجيل');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ في الاتصال');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl relative text-center">
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full bg-slate-100 dark:bg-slate-800 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-16 h-16 bg-rose-500/10 text-rose-500 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-2xl animate-pulse">
          🔒
        </div>

        <div>
          <span className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-500 text-[10px] font-black border border-rose-500/30 uppercase tracking-wider">
            {isRtl ? 'الشراء مغلق مؤقتاً - مرحلة التجهيز' : 'Pre-Launch Phase'}
          </span>
          <h3 className="text-xl font-black text-slate-900 dark:text-white mt-3">
            {isRtl ? 'عذراً، الشراء غير متاح حالياً 🚧' : 'Checkout Disabled During Pre-Launch'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            {preLaunchMsg}
          </p>
        </div>

        {isSuccess ? (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-2">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
            <h4 className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
              {isRtl ? 'تم تسجيل طلب إشعارك بنجاح! 🎉' : 'Waitlist Subscription Confirmed!'}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isRtl ? `سنرسل إشعاراً فورياً لبريدك الإلكتروني (${emailInput}) عند الانطلاق الرسمي!` : `We will email ${emailInput} on launch day!`}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubscribe} className="space-y-4 pt-2">
            {errorMessage && (
              <div className="p-3 bg-rose-500/10 text-rose-500 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-3">
              <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300">
                {isRtl ? '🔔 احصل على خصم خاص عند الافتتاح الرسمي:' : 'Get an exclusive discount at launch:'}
              </label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={isRtl ? 'أدخل بريدك الإلكتروني هنا...' : 'Enter your email...'}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs text-center outline-none focus:ring-2 focus:ring-rose-500"
              />

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-500/25 cursor-pointer transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Bell className="w-4 h-4" />
                    <span>{isRtl ? 'أخبرني فور الافتتاح' : 'Notify Me At Launch'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs cursor-pointer"
        >
          {isRtl ? 'متابعة تصفح المنتجات' : 'Continue Browsing Products'}
        </button>
      </div>
    </div>
  );
}
