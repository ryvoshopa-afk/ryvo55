import React, { useState, useEffect } from 'react';
import { 
  Store, 
  Mail, 
  Clock, 
  Send, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Eye, 
  Bell, 
  Sparkles, 
  Lock, 
  Server, 
  List, 
  Users,
  Search,
  Sliders,
  Calendar
} from 'lucide-react';
import { GlobalSettings, EmailLog, PrelaunchSubscriber } from '../types';

interface StoreSettingsPanelProps {
  settings: GlobalSettings;
  onSaveSettings: (newSettings: GlobalSettings) => Promise<void>;
  isRtl: boolean;
}

export default function StoreSettingsPanel({ settings, onSaveSettings, isRtl }: StoreSettingsPanelProps) {
  const [subTab, setSubTab] = useState<'store_mode' | 'email_settings' | 'email_logs' | 'prelaunch_subscribers'>('store_mode');

  // Store mode state
  const [storeMode, setStoreMode] = useState<'open' | 'pre_launch'>(
    settings.storeSettings?.storeMode || 'open'
  );
  const [preLaunchMessageAr, setPreLaunchMessageAr] = useState(
    settings.storeSettings?.preLaunchMessageAr || '🚀 ترقبوا افتتاح متجر RYVO قريباً - نجهز لكم تجربة شراء استثنائية!'
  );
  const [preLaunchMessageEn, setPreLaunchMessageEn] = useState(
    settings.storeSettings?.preLaunchMessageEn || '🚀 Stay tuned for the official launch of RYVO Store coming soon!'
  );
  const [preLaunchMessageFr, setPreLaunchMessageFr] = useState(
    settings.storeSettings?.preLaunchMessageFr || '🚀 Restez à l’écoute pour le lancement officiel du magasin RYVO !'
  );
  const [launchDate, setLaunchDate] = useState(
    settings.storeSettings?.launchDate ? new Date(settings.storeSettings.launchDate).toISOString().slice(0, 16) : new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 16)
  );
  const [showCountdown, setShowCountdown] = useState(
    settings.storeSettings?.showCountdown !== undefined ? settings.storeSettings.showCountdown : true
  );
  const [showTopBanner, setShowTopBanner] = useState(
    settings.storeSettings?.showTopBanner !== undefined ? settings.storeSettings.showTopBanner : true
  );
  const [showNotifyMe, setShowNotifyMe] = useState(
    settings.storeSettings?.showNotifyMe !== undefined ? settings.storeSettings.showNotifyMe : true
  );

  // Email Config State
  const [senderEmail, setSenderEmail] = useState(settings.emailConfig?.senderEmail || 'orders@ryvo.shop');
  const [senderName, setSenderName] = useState(settings.emailConfig?.senderName || 'متجر RYVO الرسمي');
  const [resendApiKey, setResendApiKey] = useState(settings.emailConfig?.resendApiKey || 're_9681892f-39e9-4bc1-88e6-c6eca8a771b9');
  const [smtpHost, setSmtpHost] = useState(settings.emailConfig?.smtpHost || 'smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(settings.emailConfig?.smtpPort || 465);
  const [smtpSecure, setSmtpSecure] = useState(settings.emailConfig?.smtpSecure !== undefined ? settings.emailConfig.smtpSecure : true);
  const [smtpUser, setSmtpUser] = useState(settings.emailConfig?.smtpUser || 'ryvo.shopa@gmail.com');
  const [smtpPass, setSmtpPass] = useState(settings.emailConfig?.smtpPass || '');

  // Modal / Toast states
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Test Email state
  const [showTestModal, setShowTestModal] = useState(false);
  const [testEmailInput, setTestEmailInput] = useState('ryvo.shopa@gmail.com');
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Email Logs State
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [logFilterStatus, setLogFilterStatus] = useState<'all' | 'Sent' | 'Failed'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState('');

  // Prelaunch & Bulk Email Subscribers state
  const [subscribers, setSubscribers] = useState<PrelaunchSubscriber[]>([]);
  const [isFetchingSubscribers, setIsFetchingSubscribers] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastSubject, setBroadcastSubject] = useState('🎉 تم افتتاح متجر RYVO رسمياً! ابدأ التسوق الآن');
  const [broadcastMessage, setBroadcastMessage] = useState('يسعدنا إعلان الانطلاق الرسمي لمتجر RYVO! تصفح أفضل المنتجات مع عروض الافتتاح الحصرية والفاخرة.');
  const [broadcastRecipientGroup, setBroadcastRecipientGroup] = useState<'all' | 'subscribers' | 'prelaunch' | 'registered_users'>('all');
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);

  useEffect(() => {
    if (subTab === 'email_logs') {
      fetchLogs();
    } else if (subTab === 'prelaunch_subscribers') {
      fetchSubscribers();
    }
  }, [subTab]);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSaveStoreModeAndEmail = async () => {
    setIsSaving(true);
    try {
      const updatedSettings: GlobalSettings = {
        ...settings,
        purchasingDisabled: storeMode === 'pre_launch',
        storeSettings: {
          storeMode,
          preLaunchMessageAr,
          preLaunchMessageEn,
          preLaunchMessageFr,
          launchDate: new Date(launchDate).toISOString(),
          showCountdown,
          showTopBanner,
          showNotifyMe
        },
        emailConfig: {
          senderEmail,
          senderName,
          resendApiKey,
          smtpHost,
          smtpPort: Number(smtpPort),
          smtpSecure,
          smtpUser,
          smtpPass
        }
      };

      await onSaveSettings(updatedSettings);
      showNotification('success', isRtl ? 'تم حفظ إعدادات المتجر والبريد الإلكتروني بنجاح! 🎉' : 'Store & Email settings saved successfully!');
    } catch (err: any) {
      showNotification('error', err.message || 'فشل حفظ الإعدادات');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailInput || !testEmailInput.includes('@')) {
      showNotification('error', isRtl ? 'يرجى إدخال بريد إلكتروني صحيح لاختبار الإرسال' : 'Please enter a valid test email');
      return;
    }

    setIsSendingTest(true);
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEmail: testEmailInput })
      });
      const data = await res.json();
      if (data.success) {
        showNotification('success', isRtl ? `تم إرسال البريد الاختباري بنجاح إلى ${testEmailInput}! ✉️` : `Test email sent successfully to ${testEmailInput}!`);
        setShowTestModal(false);
        fetchLogs();
      } else {
        showNotification('error', data.message || 'فشل إرسال البريد الاختباري');
      }
    } catch (err: any) {
      showNotification('error', err.message || 'حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setIsSendingTest(false);
    }
  };

  const fetchLogs = async () => {
    setIsFetchingLogs(true);
    try {
      const res = await fetch('/api/email/logs');
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        setEmailLogs(data.logs);
      }
    } catch (err) {
      console.error('Error fetching email logs:', err);
    } finally {
      setIsFetchingLogs(false);
    }
  };

  const fetchSubscribers = async () => {
    setIsFetchingSubscribers(true);
    try {
      const res = await fetch('/api/prelaunch/subscribers');
      const data = await res.json();
      if (data.success && Array.isArray(data.subscribers)) {
        setSubscribers(data.subscribers);
      }
    } catch (err) {
      console.error('Error fetching subscribers:', err);
    } finally {
      setIsFetchingSubscribers(false);
    }
  };

  const handleSendBroadcast = async () => {
    setIsSendingBroadcast(true);
    try {
      const res = await fetch('/api/admin/bulk-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: broadcastSubject,
          title: broadcastSubject,
          messageHtml: broadcastMessage,
          recipientGroup: broadcastRecipientGroup,
          ctaText: 'تصفح العروض الآن 🛍️',
          ctaUrl: 'https://ryvo.shop'
        })
      });
      const data = await res.json();
      if (data.success) {
        showNotification('success', isRtl ? `تم إرسال البريد الجماعي بنجاح إلى ${data.report?.successCount || 0} مستلم! 🎉` : `Broadcast sent successfully!`);
        setShowBroadcastModal(false);
        fetchLogs();
      } else {
        showNotification('error', data.error || 'فشل إرسال الإعلان الجماعي');
      }
    } catch (err: any) {
      showNotification('error', err.message || 'حدث خطأ أثناء الإرسال');
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  const filteredLogs = emailLogs.filter(log => {
    const matchesStatus = logFilterStatus === 'all' || log.status === logFilterStatus;
    const matchesSearch = !logSearchQuery || 
      log.to.toLowerCase().includes(logSearchQuery.toLowerCase()) || 
      log.subject.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      log.triggerEvent.toLowerCase().includes(logSearchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Toast alert */}
      {toast && (
        <div className={`p-4 rounded-xl text-white font-bold text-sm shadow-xl flex items-center justify-between transition-all animate-bounce ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            <span>{toast.text}</span>
          </div>
        </div>
      )}

      {/* Top Section Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setSubTab('store_mode')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer ${
            subTab === 'store_mode'
              ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>{isRtl ? 'حالة المتجر وما قبل الافتتاح' : 'Store Mode (Pre-Launch)'}</span>
        </button>

        <button
          onClick={() => setSubTab('email_settings')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer ${
            subTab === 'email_settings'
              ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>{isRtl ? 'إعدادات البريد الحقيقي (SMTP)' : 'Real Email Config'}</span>
        </button>

        <button
          onClick={() => setSubTab('email_logs')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer ${
            subTab === 'email_logs'
              ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
          }`}
        >
          <List className="w-4 h-4" />
          <span>{isRtl ? 'سجل الرسائل المرسلة' : 'Email Delivery Logs'}</span>
        </button>

        <button
          onClick={() => setSubTab('prelaunch_subscribers')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer ${
            subTab === 'prelaunch_subscribers'
              ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{isRtl ? 'قائمة انتظار الافتتاح (أخبرني)' : 'Pre-Launch Subscribers'}</span>
        </button>
      </div>

      {/* TAB 1: STORE MODE & PRE-LAUNCH */}
      {subTab === 'store_mode' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-sm">
              <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="p-3 bg-sky-500/10 text-sky-500 rounded-xl">
                  <Store className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    {isRtl ? 'حالة المتجر الرئيسية (Store Mode)' : 'Primary Store Mode'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isRtl ? 'التحكم في فتح المتجر للشراء أو إغلاقه مع تصفح المنتجات فقط' : 'Control open vs pre-launch browsing mode'}
                  </p>
                </div>
              </div>

              {/* Status Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setStoreMode('open')}
                  className={`p-4 rounded-2xl border-2 text-right transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    storeMode === 'open'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold shadow-md'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-2xl">🟢</span>
                    {storeMode === 'open' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                  </div>
                  <div>
                    <h4 className="font-black text-base">{isRtl ? 'المتجر مفتوح (Normal Operating)' : 'Store Open'}</h4>
                    <p className="text-xs opacity-80 font-normal mt-1">
                      {isRtl ? 'يستطيع الزائر التصفح وإضافة المنتجات وإتمام عملية الشراء بشكل طبيعي' : 'Full purchasing & checkout active'}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setStoreMode('pre_launch')}
                  className={`p-4 rounded-2xl border-2 text-right transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    storeMode === 'pre_launch'
                      ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-extrabold shadow-md'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-2xl">🔴</span>
                    {storeMode === 'pre_launch' && <CheckCircle className="w-5 h-5 text-rose-500" />}
                  </div>
                  <div>
                    <h4 className="font-black text-base">{isRtl ? 'المتجر مغلق - ما قبل الافتتاح (Pre-Launch)' : 'Pre-Launch Mode'}</h4>
                    <p className="text-xs opacity-80 font-normal mt-1">
                      {isRtl ? 'يتصفح الزائر كل شيء بالكامل، لكن يمنع الشراء وتظهر الرسالة المخصصة' : 'Browsing enabled, purchasing disabled with custom launch modal'}
                    </p>
                  </div>
                </button>
              </div>

              {/* Custom Closure Message */}
              <div className="space-y-4 pt-2">
                <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300">
                  {isRtl ? 'رسالة ما قبل الافتتاح المخصصة (تظهر للزوار عند الشراء وفي أعلى الموقع)' : 'Custom Pre-Launch Message'}
                </label>

                <div className="space-y-3">
                  <div>
                    <span className="text-[11px] text-slate-400 font-bold mb-1 block">🇸🇦 العربية:</span>
                    <textarea
                      value={preLaunchMessageAr}
                      onChange={(e) => setPreLaunchMessageAr(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                      placeholder="🚀 ترقبوا افتتاح متجر RYVO قريباً..."
                    />
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400 font-bold mb-1 block">🇺🇸 English:</span>
                    <textarea
                      value={preLaunchMessageEn}
                      onChange={(e) => setPreLaunchMessageEn(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Launch Date & Countdown Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    {isRtl ? 'تاريخ ووقت الافتتاح الرسمي' : 'Official Launch Date & Time'}
                  </label>
                  <input
                    type="datetime-local"
                    value={launchDate}
                    onChange={(e) => setLaunchDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>

                <div className="flex flex-col justify-end space-y-2">
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showCountdown}
                      onChange={(e) => setShowCountdown(e.target.checked)}
                      className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                    />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {isRtl ? 'عرض العداد التنازلي للافتتاح' : 'Show Countdown Timer'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Extra Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <label className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showTopBanner}
                    onChange={(e) => setShowTopBanner(e.target.checked)}
                    className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {isRtl ? 'إظهار شريط الإعلانات العلوي (بانر التجهيز)' : 'Show Top Pre-Launch Banner'}
                  </span>
                </label>

                <label className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showNotifyMe}
                    onChange={(e) => setShowNotifyMe(e.target.checked)}
                    className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {isRtl ? 'إظهار زر "أخبرني عند الافتتاح"' : 'Enable "Notify Me" Button'}
                  </span>
                </label>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleSaveStoreModeAndEmail}
                disabled={isSaving}
                className="w-full py-4 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-black text-sm shadow-xl shadow-sky-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                {isSaving ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>{isRtl ? 'حفظ إعدادات المتجر الآن' : 'Save Store Mode Settings'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Live Real-time Preview */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 text-white space-y-6 shadow-xl sticky top-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-sky-400" />
                  <h4 className="font-extrabold text-sm text-sky-400">
                    {isRtl ? 'معاينة حية لشكل المتجر عند الزائر' : 'Live Pre-Launch Visitor Preview'}
                  </h4>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                  storeMode === 'pre_launch' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                }`}>
                  {storeMode === 'pre_launch' ? (isRtl ? 'وضع ما قبل الافتتاح' : 'Pre-Launch') : (isRtl ? 'المتجر مفتوح' : 'Store Open')}
                </span>
              </div>

              {/* Preview Top Banner */}
              {showTopBanner && (
                <div className="bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 p-3 rounded-xl font-black text-xs text-center flex items-center justify-between gap-2 shadow-lg">
                  <div className="flex items-center gap-2 truncate">
                    <span>🚧</span>
                    <span className="truncate">{preLaunchMessageAr}</span>
                  </div>
                  {showNotifyMe && (
                    <button className="bg-slate-950 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 flex items-center gap-1">
                      <Bell className="w-3 h-3 text-amber-400" />
                      <span>{isRtl ? 'أخبرني عند الافتتاح' : 'Notify Me'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Modal Card Preview */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 text-center">
                <div className="w-12 h-12 bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-xl">
                  🚀
                </div>
                <div>
                  <h5 className="font-extrabold text-base text-white">{isRtl ? 'المتجر في مرحلة ما قبل الافتتاح' : 'Store Coming Soon'}</h5>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">{preLaunchMessageAr}</p>
                </div>

                {showCountdown && (
                  <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                    <p className="text-[11px] text-amber-400 font-bold mb-2">⏳ الموعد المتبقي للافتتاح الرسمي:</p>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                        <span className="block text-sm font-black text-white">12</span>
                        <span className="text-[9px] text-slate-400">أيام</span>
                      </div>
                      <div className="bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                        <span className="block text-sm font-black text-white">08</span>
                        <span className="text-[9px] text-slate-400">ساعات</span>
                      </div>
                      <div className="bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                        <span className="block text-sm font-black text-white">45</span>
                        <span className="text-[9px] text-slate-400">دقائق</span>
                      </div>
                      <div className="bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                        <span className="block text-sm font-black text-white">19</span>
                        <span className="text-[9px] text-slate-400">ثواني</span>
                      </div>
                    </div>
                  </div>
                )}

                {showNotifyMe && (
                  <div className="space-y-2 pt-2">
                    <input
                      type="email"
                      readOnly
                      placeholder="أدخل بريدك الإلكتروني ليصلك الإشعار..."
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400 font-bold text-center"
                    />
                    <button className="w-full py-2.5 bg-amber-500 text-slate-950 rounded-xl font-black text-xs flex items-center justify-center gap-1.5">
                      <Bell className="w-3.5 h-3.5" />
                      <span>{isRtl ? '🔔 أخبرني فور الافتتاح' : 'Notify Me At Launch'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: REAL EMAIL CONFIG (SMTP) */}
      {subTab === 'email_settings' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-sky-500/10 text-sky-500 rounded-xl">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {isRtl ? 'إعدادات البريد الإلكتروني الحقيقي (Sender & SMTP)' : 'Real Email Transport Setup'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isRtl ? 'تخصيص البريد الحقيقي لإرسال جميع رسائل النظام، الطلبات، وكلمات المرور للعميل' : 'Configure SMTP transport to deliver real emails to actual recipients'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowTestModal(true)}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-extrabold text-xs flex items-center gap-2 cursor-pointer shadow-md transition-all"
            >
              <Send className="w-4 h-4" />
              <span>{isRtl ? '🧪 إرسال بريد اختباري' : 'Send Test Email'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sender Name & Email */}
            <div className="space-y-4">
              <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">
                1. {isRtl ? 'هوية المرسل (Sender Identity)' : 'Sender Identity'}
              </h4>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'اسم المرسل (Sender Name)' : 'Sender Name'}
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                  placeholder="متجر RYVO الرسمي"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'البريد المرسل منه (Sender Email Address)' : 'Sender Email Address'}
                </label>
                <input
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                  placeholder="ryvo.shopa@gmail.com"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'مفتاح Resend API (Resend API Key)' : 'Resend API Key'}
                </label>
                <input
                  type="password"
                  value={resendApiKey}
                  onChange={(e) => setResendApiKey(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-sky-500/30 dark:border-sky-500/30 bg-sky-500/5 text-sky-400 font-mono font-bold text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                  placeholder="re_..."
                />
                <p className="text-[10px] text-sky-400/80 mt-1">
                  {isRtl ? '⚡ خدمة Resend API مفعلة لمعالجة الإرسال الفوري وتجاوز حظر المنافذ Timeout' : '⚡ Resend API active for zero-latency email dispatch'}
                </p>
              </div>
            </div>

            {/* SMTP Server Details */}
            <div className="space-y-4">
              <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">
                2. {isRtl ? 'خادم إرسال البريد (SMTP Server)' : 'SMTP Transport Credentials'}
              </h4>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'خادم SMTP (Host)' : 'SMTP Host'}
                </label>
                <input
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                  placeholder="e.g. smtp.gmail.com, smtp.resend.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isRtl ? 'المنفذ (Port)' : 'Port'}
                  </label>
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>

                <div className="flex items-end pb-3">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={smtpSecure}
                      onChange={(e) => setSmtpSecure(e.target.checked)}
                      className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                    />
                    <span>{isRtl ? 'تشفير SSL/TLS' : 'SSL/TLS'}</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'اسم المستخدم (SMTP User)' : 'SMTP Username'}
                </label>
                <input
                  type="text"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                  placeholder="e.g. ryvo.shopa@gmail.com"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'كلمة المرور أو API Key' : 'SMTP Password / API Key'}
                </label>
                <input
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveStoreModeAndEmail}
            disabled={isSaving}
            className="w-full py-4 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-black text-sm shadow-xl shadow-sky-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
          >
            {isSaving ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                <span>{isRtl ? 'حفظ إعدادات البريد الإلكتروني' : 'Save Email Transport Config'}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* TAB 3: EMAIL LOGS */}
      {subTab === 'email_logs' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                {isRtl ? 'سجل الرسائل المرسلة الحقيقية (Email Delivery Audit Logs)' : 'Email Audit Logs'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isRtl ? 'تسجيل جميع إشعارات النظام، كود التأكيد، الطلبات ورسائل الدعم مع حالة الإرسال' : 'Real-time record of all dispatched emails and delivery status'}
              </p>
            </div>

            <button
              onClick={fetchLogs}
              disabled={isFetchingLogs}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all self-start sm:self-auto"
            >
              <RefreshCw className={`w-4 h-4 ${isFetchingLogs ? 'animate-spin' : ''}`} />
              <span>{isRtl ? 'تحديث السجل' : 'Refresh Logs'}</span>
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3.5 top-3.5 text-slate-400" />
              <input
                type="text"
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                placeholder={isRtl ? 'بحث بالبريد المستلم أو الموضوع...' : 'Search recipient or subject...'}
                className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setLogFilterStatus('all')}
                className={`px-3 py-2 rounded-xl font-extrabold text-xs cursor-pointer ${
                  logFilterStatus === 'all' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {isRtl ? 'الكل' : 'All'}
              </button>
              <button
                onClick={() => setLogFilterStatus('Sent')}
                className={`px-3 py-2 rounded-xl font-extrabold text-xs cursor-pointer ${
                  logFilterStatus === 'Sent' ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {isRtl ? 'ناجح (Sent) 🟢' : 'Sent'}
              </button>
              <button
                onClick={() => setLogFilterStatus('Failed')}
                className={`px-3 py-2 rounded-xl font-extrabold text-xs cursor-pointer ${
                  logFilterStatus === 'Failed' ? 'bg-rose-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {isRtl ? 'فاشل (Failed) 🔴' : 'Failed'}
              </button>
            </div>
          </div>

          {/* Logs Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 font-extrabold">
                  <th className="p-3">#</th>
                  <th className="p-3">{isRtl ? 'البريد المستلم (To)' : 'Recipient'}</th>
                  <th className="p-3">{isRtl ? 'موضوع الرسالة (Subject)' : 'Subject'}</th>
                  <th className="p-3">{isRtl ? 'الحدث Trigger' : 'Trigger Event'}</th>
                  <th className="p-3">{isRtl ? 'حالة الإرسال' : 'Status'}</th>
                  <th className="p-3">{isRtl ? 'التاريخ والوقت' : 'Timestamp'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLogs.map((log, index) => (
                  <tr key={log.id || `log-${index}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-bold">
                    <td className="p-3 text-slate-400">{index + 1}</td>
                    <td className="p-3 text-sky-500 dark:text-sky-400 font-mono">{log.to}</td>
                    <td className="p-3 text-slate-900 dark:text-white font-extrabold">{log.subject}</td>
                    <td className="p-3">
                      <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[10px]">
                        {log.triggerEvent}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${
                        log.status === 'Sent'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                      }`}>
                        {log.status === 'Sent' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span>{log.status}</span>
                      </span>
                      {log.errorMessage && (
                        <p className="text-[10px] text-rose-500 font-normal mt-1 max-w-xs truncate">{log.errorMessage}</p>
                      )}
                    </td>
                    <td className="p-3 text-slate-400 text-[11px]">
                      {new Date(log.timestamp).toLocaleString(isRtl ? 'ar-SA' : 'en-US')}
                    </td>
                  </tr>
                ))}

                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400 font-bold">
                      {isRtl ? 'لا توجد رسائل مطابقة في السجل حتى الآن.' : 'No email logs recorded yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PRELAUNCH SUBSCRIBERS */}
      {subTab === 'prelaunch_subscribers' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                {isRtl ? 'قائمة انتظار الافتتاح (Pre-Launch Subscribers)' : 'Pre-Launch Waitlist'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isRtl ? 'الأشخاص الذين قاموا بالنقر على "أخبرني عند الافتتاح" وتسجيل إيميلهم الحقيقي' : 'Visitors who registered to be notified at store official opening'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBroadcastModal(true)}
                className="px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-extrabold text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-500/25 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isRtl ? '🎉 إرسال بريد الافتتاح الجماعي' : 'Send Mass Launch Email'}</span>
              </button>

              <button
                onClick={fetchSubscribers}
                className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isFetchingSubscribers ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 font-extrabold">
                  <th className="p-3">#</th>
                  <th className="p-3">{isRtl ? 'البريد الإلكتروني' : 'Email Address'}</th>
                  <th className="p-3">{isRtl ? 'تاريخ التسجيل' : 'Registration Date'}</th>
                  <th className="p-3">{isRtl ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {subscribers.map((sub, index) => (
                  <tr key={sub.id || `sub-${index}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all font-bold">
                    <td className="p-3 text-slate-400">{index + 1}</td>
                    <td className="p-3 text-sky-500 dark:text-sky-400 font-mono font-extrabold">{sub.email}</td>
                    <td className="p-3 text-slate-500">
                      {new Date(sub.createdAt).toLocaleString(isRtl ? 'ar-SA' : 'en-US')}
                    </td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                        sub.status === 'notified'
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                      }`}>
                        {sub.status === 'notified' ? (isRtl ? 'تم إشعاره بالافتتاح 🔔' : 'Notified') : (isRtl ? 'في الانتظار ⏳' : 'Pending')}
                      </span>
                    </td>
                  </tr>
                ))}

                {subscribers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-slate-400 font-bold">
                      {isRtl ? 'لا يوجد مشتركين في قائمة الانتظار حتى الآن.' : 'No subscribers in waitlist yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TEST EMAIL MODAL */}
      {showTestModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Send className="w-5 h-5 text-amber-500" />
              <span>{isRtl ? 'اختبار إرسال البريد الإلكتروني الحقيقي' : 'Test Email Dispatch'}</span>
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isRtl ? 'أدخل البريد الذي تريد إرسال رسالة الاختبار الحقيقية إليه للتأكد من سلامة الربط' : 'Enter recipient address to verify SMTP setup'}
            </p>

            <input
              type="email"
              value={testEmailInput}
              onChange={(e) => setTestEmailInput(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="e.g. user@gmail.com"
            />

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>

              <button
                type="button"
                onClick={handleSendTestEmail}
                disabled={isSendingTest}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg"
              >
                {isSendingTest ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>{isRtl ? 'إرسال بريد اختباري' : 'Send Test Email'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BROADCAST MODAL */}
      {showBroadcastModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-rose-500" />
              <span>{isRtl ? 'إرسال بريد الافتتاح الجماعي للمشتركين' : 'Send Opening Announcement Broadcast'}</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'الفئة المستهدفة للإرسال' : 'Target Recipient Audience'}
                </label>
                <select
                  value={broadcastRecipientGroup}
                  onChange={(e) => setBroadcastRecipientGroup(e.target.value as any)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs outline-none"
                >
                  <option value="all">{isRtl ? 'جميع القوائم المسجلة (المشتركين + قائمة الانتظار + العملاء)' : 'All Lists (Subscribers + Prelaunch + Customers)'}</option>
                  <option value="subscribers">{isRtl ? 'مشتركي النشرة البريدية فقط' : 'Newsletter Subscribers Only'}</option>
                  <option value="prelaunch">{isRtl ? 'قائمة انتظار الافتتاح فقط' : 'Prelaunch Subscribers Only'}</option>
                  <option value="registered_users">{isRtl ? 'العملاء المسجلين بالمتجر فقط' : 'Registered Customers Only'}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'عنوان الرسالة (Subject)' : 'Email Subject'}
                </label>
                <input
                  type="text"
                  value={broadcastSubject}
                  onChange={(e) => setBroadcastSubject(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'محتوى رسالة الإعلان' : 'Email Content'}
                </label>
                <textarea
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBroadcastModal(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>

              <button
                type="button"
                onClick={handleSendBroadcast}
                disabled={isSendingBroadcast}
                className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-500/25"
              >
                {isSendingBroadcast ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>{isRtl ? 'إرسال لجميع المشتركين' : 'Broadcast To All'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
