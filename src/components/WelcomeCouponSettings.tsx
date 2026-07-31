import React, { useState, useEffect } from 'react';
import { Gift, Clock, Percent, Save, Sparkles, MessageSquare, Layout, Palette, Users, Settings } from 'lucide-react';

interface WelcomeCouponSettingsProps {
  settings: {
    enabled: boolean;
    code: string;
    discountPercent: number;
    durationMinutes: number;
    messageAr: string;
    messageEn: string;
    messageFr: string;
    gracePeriodMinutes?: number;
    autoApply?: boolean;
    cardColor?: string;
    timerColor?: string;
    position?: string;
    allowMinimize?: boolean;
    showTimer?: boolean;
    targetUsers?: string;
    ctaTextAr?: string;
    ctaTextEn?: string;
    ctaTextFr?: string;
  } | null;
  onSave: (newSettings: any) => Promise<void>;
  currentLanguage: 'ar' | 'en' | 'fr';
}

export default function WelcomeCouponSettings({ settings, onSave, currentLanguage }: WelcomeCouponSettingsProps) {
  const isRtl = currentLanguage === 'ar';
  
  const [enabled, setEnabled] = useState(true);
  const [code, setCode] = useState('WELCOME15');
  const [discountPercent, setDiscountPercent] = useState(15);
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [messageAr, setMessageAr] = useState('');
  const [messageEn, setMessageEn] = useState('');
  const [messageFr, setMessageFr] = useState('');
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(60);
  const [autoApply, setAutoApply] = useState(true);
  const [cardColor, setCardColor] = useState('#0f172a');
  const [timerColor, setTimerColor] = useState('#f59e0b');
  const [position, setPosition] = useState('bottom-right');
  const [allowMinimize, setAllowMinimize] = useState(true);
  const [showTimer, setShowTimer] = useState(true);
  const [targetUsers, setTargetUsers] = useState('new');
  const [ctaTextAr, setCtaTextAr] = useState('اشتري الآن واستفد من الخصم 🛍️');
  const [ctaTextEn, setCtaTextEn] = useState('Checkout & Save Now 🛍️');
  const [ctaTextFr, setCtaTextFr] = useState('Achetez et économisez 🛍️');

  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled !== undefined ? settings.enabled : true);
      setCode(settings.code || 'WELCOME15');
      setDiscountPercent(settings.discountPercent || 15);
      setDurationMinutes(settings.durationMinutes || 25);
      setMessageAr(settings.messageAr || '');
      setMessageEn(settings.messageEn || '');
      setMessageFr(settings.messageFr || '');
      setGracePeriodMinutes(settings.gracePeriodMinutes !== undefined ? settings.gracePeriodMinutes : 60);
      setAutoApply(settings.autoApply !== undefined ? settings.autoApply : true);
      setCardColor(settings.cardColor || '#0f172a');
      setTimerColor(settings.timerColor || '#f59e0b');
      setPosition(settings.position || 'bottom-right');
      setAllowMinimize(settings.allowMinimize !== undefined ? settings.allowMinimize : true);
      setShowTimer(settings.showTimer !== undefined ? settings.showTimer : true);
      setTargetUsers(settings.targetUsers || 'new');
      setCtaTextAr(settings.ctaTextAr || 'اشتري الآن واستفد من الخصم 🛍️');
      setCtaTextEn(settings.ctaTextEn || 'Checkout & Save Now 🛍️');
      setCtaTextFr(settings.ctaTextFr || 'Achetez et économisez 🛍️');
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setShowSuccess(false);
    try {
      await onSave({
        enabled,
        code: code.trim().toUpperCase(),
        discountPercent: Number(discountPercent),
        durationMinutes: Number(durationMinutes),
        messageAr: messageAr.trim(),
        messageEn: messageEn.trim(),
        messageFr: messageFr.trim(),
        gracePeriodMinutes: Number(gracePeriodMinutes),
        autoApply,
        cardColor,
        timerColor,
        position,
        allowMinimize,
        showTimer,
        targetUsers,
        ctaTextAr: ctaTextAr.trim(),
        ctaTextEn: ctaTextEn.trim(),
        ctaTextFr: ctaTextFr.trim(),
      });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const t = {
    ar: {
      title: 'محرك حملات الخصم الترحيبي والتخصيص',
      desc: 'قم بتهيئة كوبون الخصم التلقائي والرسالة الترحيبية وتخصيص المظهر ومواضع العرض بالكامل من السيرفر بشكل كامل ومحمي.',
      status: 'حالة النظام',
      active: 'مفعّل',
      inactive: 'معطّل',
      codeLabel: 'كود الكوبون',
      discountLabel: 'نسبة الخصم (%)',
      durationLabel: 'مدة العداد التنازلي (بالدقائق)',
      gracePeriodLabel: 'مدة الصلاحية بعد انتهاء العداد (بالدقائق)',
      autoApplyLabel: 'تطبيق تلقائي للكوبون بسلة المشتريات',
      targetUsersLabel: 'الشريحة المستهدفة',
      targetNew: 'الزوار والعملاء الجدد فقط',
      targetAll: 'جميع الزوار دون استثناء',
      cardColorLabel: 'لون خلفية البطاقة',
      timerColorLabel: 'لون أرقام العداد التنازلي',
      positionLabel: 'موضع ظهور البطاقة في المتجر',
      posBottomRight: 'أسفل اليمين',
      posBottomLeft: 'أسفل اليسار',
      posTopRight: 'أعلى اليمين',
      posTopLeft: 'أعلى اليسار',
      posBottomBar: 'شريط عريض أسفل الصفحة',
      allowMinimizeLabel: 'إتاحة تصغير أو إخفاء البطاقة من العميل',
      showTimerLabel: 'عرض العداد التنازلي التنافسي',
      msgArLabel: 'الرسالة الترحيبية (بالعربية)',
      msgEnLabel: 'الرسالة الترحيبية (بالإنجليزية)',
      msgFrLabel: 'الرسالة الترحيبية (بالفرنسية)',
      ctaArLabel: 'نص زر الشراء (بالعربية)',
      ctaEnLabel: 'نص زر الشراء (بالإنجليزية)',
      ctaFrLabel: 'نص زر الشراء (بالفرنسية)',
      save: 'حفظ الإعدادات بالكامل 💾',
      saved: 'تم حفظ إعدادات الحملة بنجاح وتفعيلها فوراً! ✨',
    },
    en: {
      title: 'Welcome Discount Campaign Engine',
      desc: 'Configure the automatic welcome coupon, custom layouts, color palettes, and server-side countdown rules securely.',
      status: 'System Status',
      active: 'Enabled',
      inactive: 'Disabled',
      codeLabel: 'Coupon Code',
      discountLabel: 'Discount Percent (%)',
      durationLabel: 'Countdown Duration (Minutes)',
      gracePeriodLabel: 'Expiry Grace Period (Minutes)',
      autoApplyLabel: 'Auto-apply discount to active cart',
      targetUsersLabel: 'Target Audience Segment',
      targetNew: 'New visitors & prospects only',
      targetAll: 'All visitors (universal campaign)',
      cardColorLabel: 'Card Background Color',
      timerColorLabel: 'Countdown Timer Numeric Color',
      positionLabel: 'Floating Position on Storefront',
      posBottomRight: 'Bottom Right Corner',
      posBottomLeft: 'Bottom Left Corner',
      posTopRight: 'Top Right Corner',
      posTopLeft: 'Top Left Corner',
      posBottomBar: 'Full Width Footer Ribbon',
      allowMinimizeLabel: 'Allow client to minimize / hide widget',
      showTimerLabel: 'Show high-conversion countdown timer',
      msgArLabel: 'Welcome Message (Arabic)',
      msgEnLabel: 'Welcome Message (English)',
      msgFrLabel: 'Welcome Message (French)',
      ctaArLabel: 'Call To Action Button (Arabic)',
      ctaEnLabel: 'Call To Action Button (English)',
      ctaFrLabel: 'Call To Action Button (French)',
      save: 'Save All Configurations 💾',
      saved: 'Campaign settings saved successfully! ✨',
    },
    fr: {
      title: 'Moteur de Campagne de Bienvenue',
      desc: 'Configurez le coupon automatique, la disposition, les thèmes de couleur et les règles d\'expiration côté serveur de façon sécurisée.',
      status: 'Statut du système',
      active: 'Activé',
      inactive: 'Désactivé',
      codeLabel: 'Code de Coupon',
      discountLabel: 'Taux de remise (%)',
      durationLabel: 'Durée du compte à rebours (Minutes)',
      gracePeriodLabel: 'Période de grâce après minuteur (Minutes)',
      autoApplyLabel: 'Appliquer automatiquement au panier',
      targetUsersLabel: 'Segment de visiteurs ciblé',
      targetNew: 'Nouveaux visiteurs uniquement',
      targetAll: 'Tous les visiteurs',
      cardColorLabel: 'Couleur de fond du badge',
      timerColorLabel: 'Couleur du minuteur numérique',
      positionLabel: 'Position d\'affichage',
      posBottomRight: 'En bas à droite',
      posBottomLeft: 'En bas à gauche',
      posTopRight: 'En haut à droite',
      posTopLeft: 'En haut à gauche',
      posBottomBar: 'Bandeau complet en bas de page',
      allowMinimizeLabel: 'Autoriser le masquage par l\'utilisateur',
      showTimerLabel: 'Afficher le compte à rebours',
      msgArLabel: 'Message de Bienvenue (Arabe)',
      msgEnLabel: 'Message de Bienvenue (Anglais)',
      msgFrLabel: 'Message de Bienvenue (Français)',
      ctaArLabel: 'Bouton d\'Action (Arabe)',
      ctaEnLabel: 'Bouton d\'Action (Anglais)',
      ctaFrLabel: 'Bouton d\'Action (Français)',
      save: 'Enregistrer la configuration 💾',
      saved: 'Paramètres de campagne enregistrés avec succès ! ✨',
    }
  }[currentLanguage] || {
    title: 'Welcome Discount Campaign Engine',
    desc: 'Configure the automatic welcome coupon, custom layouts, color palettes, and server-side countdown rules securely.',
    status: 'System Status',
    active: 'Enabled',
    inactive: 'Disabled',
    codeLabel: 'Coupon Code',
    discountLabel: 'Discount Percent (%)',
    durationLabel: 'Countdown Duration (Minutes)',
    gracePeriodLabel: 'Expiry Grace Period (Minutes)',
    autoApplyLabel: 'Auto-apply discount to active cart',
    targetUsersLabel: 'Target Audience Segment',
    targetNew: 'New visitors & prospects only',
    targetAll: 'All visitors (universal campaign)',
    cardColorLabel: 'Card Background Color',
    timerColorLabel: 'Countdown Timer Numeric Color',
    positionLabel: 'Floating Position on Storefront',
    posBottomRight: 'Bottom Right Corner',
    posBottomLeft: 'Bottom Left Corner',
    posTopRight: 'Top Right Corner',
    posTopLeft: 'Top Left Corner',
    posBottomBar: 'Full Width Footer Ribbon',
    allowMinimizeLabel: 'Allow client to minimize / hide widget',
    showTimerLabel: 'Show high-conversion countdown timer',
    msgArLabel: 'Welcome Message (Arabic)',
    msgEnLabel: 'Welcome Message (English)',
    msgFrLabel: 'Welcome Message (French)',
    ctaArLabel: 'Call To Action Button (Arabic)',
    ctaEnLabel: 'Call To Action Button (English)',
    ctaFrLabel: 'Call To Action Button (French)',
    save: 'Save All Configurations 💾',
    saved: 'Campaign settings saved successfully! ✨',
  };

  return (
    <div id="welcome-coupon-settings-card" className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden transition-all duration-300">
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-sky-500/5 rounded-full blur-2xl pointer-events-none" />
      
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400">
          <Gift className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
            {t.title}
            <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
          </h3>
          <p className="text-xs text-slate-450 mt-1 max-w-2xl leading-relaxed">
            {t.desc}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 mt-6">
        {/* Toggle Switch */}
        <div className="flex items-center justify-between p-4 bg-slate-950/40 rounded-xl border border-slate-800/80">
          <div className="space-y-0.5">
            <span className="text-sm font-semibold text-slate-200 block">{t.status}</span>
            <span className="text-xs text-slate-400">
              {enabled ? t.active : t.inactive}
            </span>
          </div>
          <button
            id="welcome-coupon-enabled-toggle"
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none cursor-pointer ${
              enabled ? 'bg-amber-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                enabled ? (isRtl ? '-translate-x-6' : 'translate-x-6') : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Campaign segment and timing rules heading */}
        <div className="border-t border-slate-800/60 pt-4">
          <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <Users className="w-4 h-4" />
            <span>{isRtl ? 'قواعد الاستهداف وتوقيت الصلاحية' : 'Targeting & Expiry Parameters'}</span>
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">{t.targetUsersLabel}</label>
              <select
                value={targetUsers}
                onChange={(e) => setTargetUsers(e.target.value)}
                disabled={!enabled}
                className="w-full bg-slate-950/60 border border-slate-850 rounded-xl py-2.5 px-3 text-xs text-white focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
              >
                <option value="new">{t.targetNew}</option>
                <option value="all">{t.targetAll}</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">{t.gracePeriodLabel}</label>
              <div className="relative">
                <Clock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="number"
                  min="0"
                  max="10080"
                  value={gracePeriodMinutes}
                  onChange={(e) => setGracePeriodMinutes(Number(e.target.value))}
                  required
                  disabled={!enabled}
                  className="w-full bg-slate-950/60 border border-slate-850 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Inputs row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-800/60 pt-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">{t.codeLabel}</label>
            <div className="relative">
              <Gift className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
              <input
                id="welcome-coupon-code-input"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                placeholder="WELCOME15"
                disabled={!enabled}
                className="w-full bg-slate-950/60 border border-slate-850 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">{t.discountLabel}</label>
            <div className="relative">
              <Percent className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
              <input
                id="welcome-coupon-discount-input"
                type="number"
                min="1"
                max="100"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
                required
                disabled={!enabled}
                className="w-full bg-slate-950/60 border border-slate-850 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">{t.durationLabel}</label>
            <div className="relative">
              <Clock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
              <input
                id="welcome-coupon-duration-input"
                type="number"
                min="1"
                max="1440"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                required
                disabled={!enabled}
                className="w-full bg-slate-950/60 border border-slate-850 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* Interactive styling and placement controls */}
        <div className="border-t border-slate-800/60 pt-4">
          <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <Palette className="w-4 h-4" />
            <span>{isRtl ? 'ألوان وقنوات ظهور العرض الترويجي' : 'Visual Identity & Placements'}</span>
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">{t.cardColorLabel}</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={cardColor}
                  onChange={(e) => setCardColor(e.target.value)}
                  disabled={!enabled}
                  className="w-10 h-9 bg-slate-950/60 border border-slate-850 rounded-xl focus:outline-none cursor-pointer p-1"
                />
                <input
                  type="text"
                  value={cardColor}
                  onChange={(e) => setCardColor(e.target.value)}
                  disabled={!enabled}
                  className="flex-1 bg-slate-950/60 border border-slate-850 rounded-xl py-1.5 px-3 text-xs text-white uppercase"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">{t.timerColorLabel}</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={timerColor}
                  onChange={(e) => setTimerColor(e.target.value)}
                  disabled={!enabled}
                  className="w-10 h-9 bg-slate-950/60 border border-slate-850 rounded-xl focus:outline-none cursor-pointer p-1"
                />
                <input
                  type="text"
                  value={timerColor}
                  onChange={(e) => setTimerColor(e.target.value)}
                  disabled={!enabled}
                  className="flex-1 bg-slate-950/60 border border-slate-850 rounded-xl py-1.5 px-3 text-xs text-white uppercase"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">{t.positionLabel}</label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                disabled={!enabled}
                className="w-full bg-slate-950/60 border border-slate-850 rounded-xl py-2.5 px-3 text-xs text-white focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
              >
                <option value="bottom-right">{t.posBottomRight}</option>
                <option value="bottom-left">{t.posBottomLeft}</option>
                <option value="top-right">{t.posTopRight}</option>
                <option value="top-left">{t.posTopLeft}</option>
                <option value="bottom-bar">{t.posBottomBar}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-805">
              <span className="text-xs font-semibold text-slate-300">{t.allowMinimizeLabel}</span>
              <button
                type="button"
                onClick={() => setAllowMinimize(!allowMinimize)}
                disabled={!enabled}
                className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer ${
                  allowMinimize ? 'bg-amber-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform duration-200 ${
                    allowMinimize ? (isRtl ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-805">
              <span className="text-xs font-semibold text-slate-300">{t.showTimerLabel}</span>
              <button
                type="button"
                onClick={() => setShowTimer(!showTimer)}
                disabled={!enabled}
                className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer ${
                  showTimer ? 'bg-amber-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform duration-200 ${
                    showTimer ? (isRtl ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-805">
              <span className="text-xs font-semibold text-slate-300">{t.autoApplyLabel}</span>
              <button
                type="button"
                onClick={() => setAutoApply(!autoApply)}
                disabled={!enabled}
                className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer ${
                  autoApply ? 'bg-amber-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform duration-200 ${
                    autoApply ? (isRtl ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Textareas */}
        <div className="space-y-4 border-t border-slate-800/60 pt-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
              {t.msgArLabel}
            </label>
            <textarea
              id="welcome-coupon-msg-ar"
              value={messageAr}
              onChange={(e) => setMessageAr(e.target.value)}
              required
              rows={2}
              disabled={!enabled}
              className="w-full bg-slate-950/60 border border-slate-850 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500/50 resize-none leading-relaxed"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
              {t.msgEnLabel}
            </label>
            <textarea
              id="welcome-coupon-msg-en"
              value={messageEn}
              onChange={(e) => setMessageEn(e.target.value)}
              required
              rows={2}
              disabled={!enabled}
              className="w-full bg-slate-950/60 border border-slate-850 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500/50 resize-none leading-relaxed"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
              {t.msgFrLabel}
            </label>
            <textarea
              id="welcome-coupon-msg-fr"
              value={messageFr}
              onChange={(e) => setMessageFr(e.target.value)}
              required
              rows={2}
              disabled={!enabled}
              className="w-full bg-slate-950/60 border border-slate-850 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500/50 resize-none leading-relaxed"
            />
          </div>
        </div>

        {/* CTA custom button labels */}
        <div className="space-y-4 border-t border-slate-800/60 pt-4">
          <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layout className="w-4 h-4" />
            <span>{isRtl ? 'تخصيص نصوص أزرار الإجراء (CTA)' : 'Call To Action (CTA) Buttons Labeling'}</span>
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">{t.ctaArLabel}</label>
              <input
                type="text"
                value={ctaTextAr}
                onChange={(e) => setCtaTextAr(e.target.value)}
                required
                disabled={!enabled}
                className="w-full bg-slate-950/60 border border-slate-850 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">{t.ctaEnLabel}</label>
              <input
                type="text"
                value={ctaTextEn}
                onChange={(e) => setCtaTextEn(e.target.value)}
                required
                disabled={!enabled}
                className="w-full bg-slate-950/60 border border-slate-850 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">{t.ctaFrLabel}</label>
              <input
                type="text"
                value={ctaTextFr}
                onChange={(e) => setCtaTextFr(e.target.value)}
                required
                disabled={!enabled}
                className="w-full bg-slate-950/60 border border-slate-850 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-800/60">
          <div className="text-xs font-semibold">
            {showSuccess && (
              <span className="text-emerald-400 animate-pulse">{t.saved}</span>
            )}
          </div>
          <button
            id="welcome-coupon-save-btn"
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-150 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {t.save}
          </button>
        </div>
      </form>
    </div>
  );
}
