import React, { useState, useEffect } from 'react';
import { useConfirm } from './ConfirmationDialog';
import { Language, Theme, User } from '../types';
import { TRANSLATIONS } from '../constants/translations';
import { ShoppingBag, Heart, User as UserIcon, Sun, Moon, Settings, ShieldAlert, Languages, Search, Sliders, MessageSquare, Truck, Home, Facebook, Twitter, Instagram, Youtube, Music, Ghost, Volume2, VolumeX, Coins, BookOpen, Bell, Menu, X, Grid, Globe } from 'lucide-react';
import { formatPrice } from '../utils/price';
import socket from '../utils/socket';
import { smartFetch } from '../utils/smartFetch';

interface NavbarProps {
  currentLanguage: Language;
  onLanguageChange: (lang: Language) => void;
  currentTheme: Theme;
  onThemeToggle: () => void;
  favoritesCount: number;
  cartCount: number;
  currentUser: User | null;
  onCartOpen: () => void;
  onAuthOpen: () => void;
  onLogout: () => void;
  onNavigate: (view: 'home' | 'admin' | 'dashboard' | 'favorites' | 'chat' | 'track' | 'blog') => void;
  currentView: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onFavoritesOpen: () => void;
  shopLogo: string;
  socialLinks?: {
    facebook: string;
    twitter: string;
    instagram: string;
    youtube: string;
    snapchat: string;
    tiktok: string;
  };
  announcementTextAr?: string;
  announcementTextEn?: string;
  announcementTextFr?: string;
  announcementLink?: string;
  
  // Dynamic 30 Suggestions additions
  currentCurrency: string;
  onCurrencyChange: (curr: any) => void;
  allProducts: any[];
  onProductClick: (prod: any) => void;
  isMuted: boolean;
  onMuteToggle: () => void;
  triggerToast?: (msg: string) => void;
  welcomeCouponSession?: any;
}

// Interactive text helper that matches URLs and promo codes, making them clickable or copyable
function renderInteractiveText(
  text: string, 
  isRtl: boolean, 
  onCopySuccess: (code: string) => void
) {
  if (!text) return null;

  const EXCLUDE_WORDS = new Set([
    'HTML', 'CSS', 'SAR', 'USD', 'AED', 'EUR', 'GMT', 'UTC', 'AM', 'PM', 'OK', 
    'INFO', 'AI', 'JSON', 'API', 'VITE', 'NODE', 'CJS', 'ESM', 'TODO', 'WIFI', 
    'FAQ', 'IP', 'URL', 'ID', 'PDF', 'JPEG', 'PNG', 'SVG', 'CJ', 'APP', 'CHAT', 'ADMIN'
  ]);

  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts = text.split(urlRegex);

  return (
    <>
      {parts.map((part, partIdx) => {
        if (part.match(urlRegex)) {
          let href = part;
          if (part.toLowerCase().startsWith('www.')) {
            href = 'https://' + part;
          }
          return (
            <a
              key={partIdx}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-sky-500 dark:text-sky-450 hover:underline font-bold break-all mx-1 px-1 py-0.5 bg-sky-500/5 dark:bg-sky-400/5 rounded border border-sky-500/10 cursor-pointer"
              title={isRtl ? 'افتح الرابط 🔗' : 'Open Link 🔗'}
              onClick={(e) => e.stopPropagation()}
            >
              <span>{part}</span>
              <svg className="w-3 h-3 shrink-0 inline ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          );
        }

        const codeRegex = /(`[^`]+`|\b[A-Z0-9_-]{4,15}\b)/g;
        const subParts = part.split(codeRegex);

        return (
          <span key={partIdx}>
            {subParts.map((subPart, subIdx) => {
              const isBacktick = subPart.startsWith('`') && subPart.endsWith('`');
              const cleanWord = isBacktick ? subPart.slice(1, -1) : subPart;
              const isCodePattern = isBacktick || (
                subPart.match(/^[A-Z0-9_-]{4,15}$/) && 
                !EXCLUDE_WORDS.has(subPart.toUpperCase()) &&
                /[A-Z]/.test(subPart)
              );

              if (isCodePattern && cleanWord.trim()) {
                const codeToCopy = cleanWord.trim();
                return (
                  <button
                    key={subIdx}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(codeToCopy).then(() => {
                        onCopySuccess(codeToCopy);
                      });
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono text-[11px] font-extrabold rounded border border-amber-500/25 cursor-pointer hover:bg-amber-500/20 dark:hover:bg-amber-500/30 active:scale-95 transition-all shadow-sm"
                    title={isRtl ? 'انقر لنسخ الكود 📋' : 'Click to copy code 📋'}
                  >
                    <span>{codeToCopy}</span>
                    <svg className="w-3 h-3 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  </button>
                );
              }

              return <span key={subIdx}>{subPart}</span>;
            })}
          </span>
        );
      })}
    </>
  );
}

export default function Navbar({
  currentLanguage,
  onLanguageChange,
  currentTheme,
  onThemeToggle,
  favoritesCount,
  cartCount,
  currentUser,
  onCartOpen,
  onAuthOpen,
  onLogout,
  onNavigate,
  currentView,
  searchQuery,
  onSearchChange,
  onFavoritesOpen,
  shopLogo,
  socialLinks,
  announcementTextAr,
  announcementTextEn,
  announcementTextFr,
  announcementLink,
  
  currentCurrency,
  onCurrencyChange,
  allProducts,
  onProductClick,
  isMuted,
  onMuteToggle,
  triggerToast,
  welcomeCouponSession
}: NavbarProps) {
  const t = TRANSLATIONS[currentLanguage];
  const isRtl = currentLanguage === 'ar';
  const { confirm } = useConfirm();

  const handleLogoutClick = async () => {
    const confirmed = await confirm({
      title: isRtl ? 'تسجيل الخروج من الحساب 🔒' : 'Sign Out of Account 🔒',
      description: isRtl 
        ? 'هل أنت متأكد من رغبتك في تسجيل الخروج من متجر رايفو؟ سيتعين عليك إدخال بياناتك مجدداً لاحقاً.'
        : 'Are you sure you want to sign out of Ryvo Store? You will need to re-authenticate to access your profile.',
      confirmText: isRtl ? 'تسجيل الخروج' : 'Log Out',
      cancelText: isRtl ? 'البقاء في الحساب' : 'Stay Connected',
      type: 'warning'
    });
    if (confirmed) {
      onLogout();
    }
  };

  const [notifications, setNotifications] = useState<any[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Lock background body scroll when mobile menu drawer is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const loadNotifs = () => {
      let titleText = isRtl ? 'أهلاً بك في متجر رايفو الفاخر! 🎉' : 'Welcome to Ryvo Premium Store! 🎉';
      let bodyText = isRtl 
        ? 'بمناسبة زيارتك الأولى، نوجه لك هذه الهدية الخاصة: خصم 15% فوري ومطبق تلقائياً عند الدفع!'
        : 'To celebrate your first visit, we are presenting you with a special gift: 15% instant discount applied automatically at checkout!';
        
      if (welcomeCouponSession) {
        titleText = isRtl ? 'هدية ترحيبية خاصة بانتظارك! 🎁' : 'Special Welcome Gift Awaiting You! 🎁';
        bodyText = isRtl 
          ? (welcomeCouponSession.messageAr || bodyText)
          : (welcomeCouponSession.messageEn || bodyText);
      }

      const defaultNotif = [
        {
          id: 'welcome-notif',
          title: titleText,
          body: bodyText,
          icon: '🎁',
          date: new Date().toLocaleDateString(isRtl ? 'ar-SA' : 'en-US'),
          time: new Date().toLocaleTimeString(isRtl ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' })
        }
      ];

      const saved = localStorage.getItem('ryvo_broadcast_notifications');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const hasWelcome = parsed.some((n: any) => n.id === 'welcome-notif');
          if (hasWelcome) {
            const updated = parsed.map((n: any) => n.id === 'welcome-notif' ? { ...n, title: titleText, body: bodyText } : n);
            setNotifications(updated);
            localStorage.setItem('ryvo_broadcast_notifications', JSON.stringify(updated));
            return;
          }
        } catch (e) {}
      }

      setNotifications(defaultNotif);
      localStorage.setItem('ryvo_broadcast_notifications', JSON.stringify(defaultNotif));
    };

    loadNotifs();
    const interval = setInterval(loadNotifs, 10000); // Check local storage cache every 10 seconds (no-network)
    return () => clearInterval(interval);
  }, [isRtl, welcomeCouponSession]);

  // NAVBAR LOGO VERIFICATION LOG
  useEffect(() => {
    console.log('NAVBAR LOGO VERIFICATION', {
      'Logo source': shopLogo,
      'Logo loaded': Boolean(shopLogo),
      'Logo element dimensions': 'auto x 48px max',
      'Object fit': 'contain',
      'Circular wrapper': false,
      'Hardcoded logo': false
    });
  }, [shopLogo]);

  // Real-time Socket.io and On-Demand Synchronization for system & support notifications
  useEffect(() => {
    const isGuest = !currentUser || !currentUser.email;
    const conversationId = (currentUser ? currentUser.email : (localStorage.getItem('ryvo_support_guest_id') || '')).toLowerCase().trim();
    if (!conversationId) return;

    // Connect to WebSocket dynamically
    socket.connect();
    socket.emit('join_conversation', { sessionId: conversationId });

    const fetchLiveNotifications = async () => {
      // STOP notification requests completely for guest users UNLESS notification panel is manually opened!
      if (isGuest && !isNotifOpen) return;
      if (!conversationId) return;

      // Avoid network call if page is hidden
      if (document.visibilityState === 'hidden') return;

      try {
        const data = await smartFetch(`/api/notifications?conversationId=${encodeURIComponent(conversationId)}`, {
          useCache: true,
          cacheTtl: 15000
        });

        if (data && data.success) {
          let hasNew = false;
          const savedNotifs = localStorage.getItem('ryvo_broadcast_notifications');
          let parsedNotifs: any[] = [];
          if (savedNotifs) {
            try { parsedNotifs = JSON.parse(savedNotifs); } catch (e) {}
          }

          // Sync Support Replies
          if (Array.isArray(data.supportNotifications)) {
            data.supportNotifications.forEach((msg: any) => {
              const notifId = `support-reply-${msg.id}`;
              const alreadyNotified = parsedNotifs.some((n: any) => n.id === notifId);
              const seenKey = `client_seen_support_msg_${notifId}`;

              if (!alreadyNotified && !localStorage.getItem(seenKey)) {
                localStorage.setItem(seenKey, 'true');
                parsedNotifs.unshift({
                  id: notifId,
                  title: isRtl ? msg.title : msg.titleEn,
                  body: msg.body,
                  icon: msg.icon || '💬',
                  date: new Date(msg.timestamp).toLocaleDateString(isRtl ? 'ar-SA' : 'en-US'),
                  time: msg.time || new Date(msg.timestamp).toLocaleTimeString(isRtl ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' }),
                  read: false,
                  type: 'support_reply'
                });
                hasNew = true;
              }
            });
          }

          // Sync System-wide Broadcast Announcements
          if (Array.isArray(data.systemNotifications)) {
            data.systemNotifications.forEach((sys: any) => {
              const alreadyNotified = parsedNotifs.some((n: any) => n.id === sys.id);
              if (!alreadyNotified) {
                parsedNotifs.unshift({
                  id: sys.id,
                  title: isRtl ? sys.title : sys.titleEn,
                  body: isRtl ? sys.body : sys.bodyEn,
                  icon: sys.icon || '🎉',
                  date: new Date(sys.timestamp).toLocaleDateString(isRtl ? 'ar-SA' : 'en-US'),
                  time: new Date(sys.timestamp).toLocaleTimeString(isRtl ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' }),
                  read: false,
                  type: 'system_broadcast'
                });
                hasNew = true;
              }
            });
          }

          if (hasNew) {
            const updatedList = parsedNotifs.slice(0, 30);
            localStorage.setItem('ryvo_broadcast_notifications', JSON.stringify(updatedList));
            setNotifications(updatedList);
            if (triggerToast) {
              triggerToast(isRtl ? '🔔 لديك رسائل وإشعارات جديدة متوفرة!' : '🔔 You have new messages and notifications!');
            }
          }
        }
      } catch (err) {
        console.error("Error fetching live notifications:", err);
      }
    };

    // WebSocket real-time incoming message receiver
    const handleSocketMessage = (msg: any) => {
      // Trigger notification if message is from Support/AI
      if (msg && (msg.sender === 'support' || msg.sender === 'ai' || msg.sender === 'agent')) {
        const notifId = `support-reply-${msg.id}`;
        const savedNotifs = localStorage.getItem('ryvo_broadcast_notifications');
        let parsedNotifs: any[] = [];
        if (savedNotifs) {
          try { parsedNotifs = JSON.parse(savedNotifs); } catch (e) {}
        }

        const alreadyNotified = parsedNotifs.some((n: any) => n.id === notifId);
        const seenKey = `client_seen_support_msg_${notifId}`;

        if (!alreadyNotified && !localStorage.getItem(seenKey)) {
          localStorage.setItem(seenKey, 'true');
          parsedNotifs.unshift({
            id: notifId,
            title: isRtl ? '💬 رسالة جديدة من الدعم الفني' : '💬 New Support Message',
            body: msg.text || '',
            icon: '💬',
            date: new Date().toLocaleDateString(isRtl ? 'ar-SA' : 'en-US'),
            time: msg.time || new Date().toLocaleTimeString(isRtl ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' }),
            read: false,
            type: 'support_reply'
          });

          const updatedList = parsedNotifs.slice(0, 30);
          localStorage.setItem('ryvo_broadcast_notifications', JSON.stringify(updatedList));
          setNotifications(updatedList);
          if (triggerToast) {
            triggerToast(isRtl ? '🔔 رسالة جديدة متوفرة من الدعم الفني!' : '🔔 New message from customer support!');
          }
        }
      }
    };

    // Run initial synchronization ONLY if user is logged in OR notification panel is open
    if (!isGuest || isNotifOpen) {
      fetchLiveNotifications();
    }

    // Listen to real-time events
    socket.on('message_received', handleSocketMessage);

    // Re-fetch only when user returns to the tab/window (Refocus) AND user is logged in OR panel is open
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (!isGuest || isNotifOpen)) {
        fetchLiveNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      socket.off('message_received', handleSocketMessage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser, isRtl, isNotifOpen, triggerToast]);

  const cycleLanguage = () => {
    if (currentLanguage === 'ar') onLanguageChange('en');
    else if (currentLanguage === 'en') onLanguageChange('fr');
    else onLanguageChange('ar');
  };

  const cycleCurrency = () => {
    const list = ['SAR', 'USD', 'AED', 'EUR'];
    const idx = list.indexOf(currentCurrency);
    const nextIdx = (idx + 1) % list.length;
    onCurrencyChange(list[nextIdx]);
  };


  return (
    <>
      {/* Top Custom Announcement Bar */}
      <div className="w-full bg-[#090B0E] text-white text-[11px] sm:text-xs py-2 border-b border-[#1E293B] font-sans relative z-40 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-center gap-2 text-center">
          <span className="w-2 h-2 rounded-full bg-[#E53E3E] shrink-0 animate-pulse"></span>
          <span className="font-bold tracking-tight text-white truncate max-w-[92vw]">
            {currentLanguage === 'ar' 
              ? (announcementTextAr || '🔒 تسوق بثقة تامة مع حماية وضمان متكامل لجميع المشتريات') 
              : currentLanguage === 'fr' 
              ? (announcementTextFr || '🔒 Achetez en toute confiance avec une protection complète') 
              : (announcementTextEn || '🔒 Shop with confidence with complete purchase protection')}
          </span>
          <span className="w-2 h-2 rounded-full bg-[#E53E3E] shrink-0"></span>
        </div>
      </div>

      <nav className="sticky top-0 z-40 w-full backdrop-blur-md bg-[#FFFFFF]/95 dark:bg-[#090B0E]/95 border-b border-[#E2E8F0] dark:border-[#1E293B] transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
          
          {/* Desktop Header View (hidden lg:flex) */}
          <div className="hidden lg:flex items-center justify-between h-20 gap-2 xl:gap-6">
            
            {/* Logo */}
            <div className="flex items-center gap-2 xl:gap-3 shrink-0">
              <button
                id="ryvo-brand"
                onClick={() => onNavigate('home')}
                className="group flex items-center transition-all duration-300 hover:opacity-90 cursor-pointer shrink-0"
              >
                {shopLogo.startsWith('data:image') || shopLogo.includes('http') || shopLogo.includes('/') ? (
                  <img 
                    src={shopLogo} 
                    alt="RYVO Logo" 
                    className="h-9 sm:h-11 md:h-12 w-auto max-w-[150px] xl:max-w-[220px] object-contain shrink-0" 
                    referrerPolicy="no-referrer" 
                  />
                ) : shopLogo.toUpperCase().includes('RYVO') ? (
                  <div className="flex items-center gap-1.5 text-lg xl:text-2xl font-black font-sans tracking-tight">
                    <span className="text-[var(--primary-color)] font-black">RYVO</span>
                    {shopLogo.toUpperCase().replace('RYVO', '').trim() && (
                      <span className="text-slate-900 dark:text-white">
                        {shopLogo.toUpperCase().replace('RYVO', '').trim()}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-lg xl:text-2xl font-black font-sans tracking-tight text-slate-900 dark:text-white">
                    <span className="text-[var(--primary-color)] font-black uppercase">
                      {shopLogo}
                    </span>
                  </div>
                )}
              </button>
            </div>

            {/* Quick Navigation Links (Desktop lg+) */}
            <div className="hidden lg:flex items-center gap-2.5 xl:gap-6 shrink-0">
              <button
                id="nav-link-home"
                data-testid="nav-link-1"
                onClick={() => onNavigate('home')}
                className={`text-xs xl:text-sm font-extrabold whitespace-nowrap transition-colors cursor-pointer ${
                  currentView === 'home'
                    ? 'text-[var(--primary-color)] font-black'
                    : 'text-slate-700 dark:text-slate-300 hover:text-[var(--primary-color)] dark:hover:text-white'
                }`}
              >
                {t.home}
              </button>

              <button
                id="nav-link-shop"
                data-testid="nav-link-shop"
                onClick={() => {
                  onNavigate('home');
                  setTimeout(() => {
                    document.getElementById('products-grid')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
                className={`flex items-center gap-1.5 text-xs xl:text-sm font-extrabold whitespace-nowrap transition-colors cursor-pointer ${
                  currentView === 'home'
                    ? 'text-slate-700 dark:text-slate-300 hover:text-[var(--primary-color)]'
                    : 'text-slate-700 dark:text-slate-300 hover:text-[var(--primary-color)]'
                }`}
              >
                <ShoppingBag className="w-4 h-4 text-[var(--primary-color)] shrink-0" />
                <span>{isRtl ? 'تسوق' : currentLanguage === 'fr' ? 'Boutique' : 'Shop'}</span>
              </button>

              <button
                id="nav-link-track"
                data-testid="nav-link-2"
                onClick={() => onNavigate('track')}
                className={`flex items-center gap-1.5 text-xs xl:text-sm font-extrabold whitespace-nowrap transition-colors cursor-pointer ${
                  currentView === 'track'
                    ? 'text-[var(--primary-color)] font-black'
                    : 'text-slate-700 dark:text-slate-300 hover:text-[var(--primary-color)]'
                }`}
              >
                <Truck className="w-4 h-4 text-[var(--primary-color)] shrink-0" />
                <span>{isRtl ? 'تتبع طلبك' : (t.track_tab ? t.track_tab.replace('🚚', '').trim() : 'Track Order')}</span>
              </button>

              <button
                id="nav-link-blog"
                data-testid="nav-link-3"
                onClick={() => onNavigate('blog')}
                className={`flex items-center gap-1.5 text-xs xl:text-sm font-extrabold whitespace-nowrap transition-colors cursor-pointer ${
                  currentView === 'blog'
                    ? 'text-[var(--primary-color)] font-black'
                    : 'text-slate-700 dark:text-slate-300 hover:text-[var(--primary-color)]'
                }`}
              >
                <BookOpen className="w-4 h-4 text-[var(--primary-color)] shrink-0" />
                <span>{isRtl ? 'المدونة' : 'Blog'}</span>
              </button>

              <button
                id="nav-link-chat"
                data-testid="nav-link-4"
                onClick={() => onNavigate('chat')}
                className={`flex items-center gap-1.5 text-xs xl:text-sm font-extrabold whitespace-nowrap transition-colors cursor-pointer ${
                  currentView === 'chat'
                    ? 'text-[var(--primary-color)] font-black'
                    : 'text-slate-700 dark:text-slate-300 hover:text-[var(--primary-color)]'
                }`}
              >
                <MessageSquare className="w-4 h-4 text-[var(--primary-color)] shrink-0" />
                <span>{isRtl ? 'الدردشة والدعم' : 'Support'}</span>
              </button>
            </div>

            {/* Global Search Bar (Takes remaining flex space on xl+) */}
            <div className="hidden xl:block flex-1 max-w-xs relative">
              <div className={`absolute inset-y-0 ${isRtl ? 'left-3' : 'right-3'} flex items-center pointer-events-none text-gray-400`}>
                <Search className="w-4 h-4" />
              </div>
              <input
                id="global-search"
                type="text"
                placeholder={t.search_placeholder}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className={`w-full py-2 px-4 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[var(--border-dark)] focus:border-[var(--primary-color)] focus:bg-white dark:focus:bg-[#090B0E] text-slate-800 dark:text-gray-100 outline-none transition-all ${
                  isRtl ? 'pr-4 pl-10 text-right' : 'pl-4 pr-10 text-left'
                }`}
              />

              {/* Suggestions Autocomplete List */}
              {searchQuery.trim().length > 0 && allProducts && (
                <div className={`absolute left-0 right-0 mt-2 bg-white dark:bg-[#121622] border border-slate-150 dark:border-[var(--border-dark)] rounded-2xl shadow-xl z-50 max-h-80 overflow-y-auto ${isRtl ? 'text-right' : 'text-left'}`}>
                  {(() => {
                    const q = searchQuery.toLowerCase().trim();
                    const filtered = allProducts.filter(p => 
                      p.name_ar.toLowerCase().includes(q) || 
                      p.name_en.toLowerCase().includes(q) || 
                      p.name_fr.toLowerCase().includes(q)
                    );
                    if (filtered.length === 0) {
                      return <div className="p-4 text-xs text-slate-400 dark:text-slate-500 font-bold text-center">{isRtl ? 'لا توجد نتائج مطابقة 🔍' : 'No matches found 🔍'}</div>;
                    }
                    return (
                      <div className="py-2 divide-y divide-slate-100 dark:divide-[#1E293B]">
                        {filtered.slice(0, 5).map((prod, idx) => {
                          const name = isRtl ? prod.name_ar : currentLanguage === 'fr' ? prod.name_fr : prod.name_en;
                          return (
                            <button
                              key={prod.id || `search-prod-${idx}`}
                              type="button"
                              onClick={() => {
                                onProductClick?.(prod);
                                onSearchChange('');
                              }}
                              className="w-full px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/60 flex items-center gap-3 transition-colors text-left cursor-pointer"
                            >
                              <img src={prod.image} className="w-8 h-8 rounded-lg object-cover bg-slate-150 p-0.5 flex-shrink-0" referrerPolicy="no-referrer" />
                              <div className="flex-1 min-w-0 text-left">
                                <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 truncate">{name}</h4>
                                <span className="text-[10px] font-black text-[var(--primary-color)] font-mono">{formatPrice(prod.price, currentLanguage)}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Accessories & Action Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              
              {/* Settings Dropdown Button */}
              <div className="relative">
                <button
                  id="navbar-settings-button"
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[var(--border-dark)] text-slate-700 dark:text-slate-300 hover:scale-105 transition-transform relative cursor-pointer flex items-center justify-center"
                  title={isRtl ? 'الإعدادات والخيارات ⚙️' : 'Settings & Options ⚙️'}
                >
                  <Settings className={`w-4 h-4 text-slate-600 dark:text-slate-400 ${isSettingsOpen ? 'animate-spin' : 'hover:rotate-45 transition-transform duration-300'}`} />
                </button>
              </div>

              {/* Dark & Light mode switch */}
              <button
                id="theme-toggler"
                onClick={onThemeToggle}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[var(--border-dark)] text-slate-700 dark:text-slate-300 hover:scale-105 transition-transform cursor-pointer"
                aria-label={currentLanguage === 'ar' ? 'تغيير المظهر الداكن والفاتح' : 'Toggle Theme'}
              >
                {currentTheme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>

              {/* Favorites Heart */}
              <button
                id="favorites-shortcut"
                onClick={onFavoritesOpen}
                className="hidden sm:flex p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[var(--border-dark)] text-rose-500 hover:scale-105 transition-transform relative cursor-pointer"
                aria-label={currentLanguage === 'ar' ? 'عرض المنتجات المفضلة' : 'View favorite products'}
              >
                <Heart className="w-4 h-4" />
                {favoritesCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center animate-pulse">
                    {favoritesCount}
                  </span>
                )}
              </button>

              {/* Notification Bell */}
              <div className="relative">
                <button
                  id="navbar-notification-bell"
                  onClick={() => setIsNotifOpen(!isNotifOpen)}
                  className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:scale-105 transition-transform relative cursor-pointer"
                  title={isRtl ? 'الإشعارات والتنبيهات 🔔' : 'Notifications 🔔'}
                >
                  <Bell className="w-4 h-4" />
                  {(() => {
                    const unreadCount = notifications.filter((n: any) => !n.read).length;
                    return unreadCount > 0 ? (
                      <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center animate-bounce">
                        {unreadCount}
                      </span>
                    ) : null;
                  })()}
                </button>

                {isNotifOpen && (
                  <>
                    <div 
                      className="fixed inset-0 bg-black/40 dark:bg-black/70 z-40 backdrop-blur-xs"
                      onClick={() => setIsNotifOpen(false)}
                    />
                    <div className="fixed top-[84px] left-1/2 -translate-x-1/2 w-[92%] sm:w-full max-w-lg md:max-w-xl bg-white dark:bg-[#121622] border border-slate-150 dark:border-[var(--border-dark)] rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200">
                      <div className="p-4 bg-slate-50 dark:bg-black/40 border-b border-slate-100 dark:border-white/5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-800 dark:text-amber-400">
                            🔔 {isRtl ? 'مركز إشعارات رايفو' : 'Ryvo Notification Hub'}
                          </span>
                          {notifications.filter((n: any) => !n.read).length > 0 && (
                            <span className="px-2 py-0.5 text-[9px] font-black bg-rose-500 text-white rounded-full animate-pulse">
                              {notifications.filter((n: any) => !n.read).length} {isRtl ? 'جديد' : 'new'}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {notifications.length > 0 && (
                            <button
                              onClick={() => {
                                const updated = notifications.map((n: any) => ({ ...n, read: true }));
                                setNotifications(updated);
                                localStorage.setItem('ryvo_broadcast_notifications', JSON.stringify(updated));
                                if (triggerToast) {
                                  triggerToast(isRtl ? '✅ تم تحديد الكل كمقروء' : '✅ Marked all as read');
                                } else {
                                  setCopyToast(isRtl ? 'تم تحديد الكل كمقروء' : 'Marked all as read');
                                  setTimeout(() => setCopyToast(null), 2000);
                                }
                              }}
                              className="text-[10px] text-amber-600 dark:text-amber-400 font-black bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                            >
                              {isRtl ? 'قراءة الكل' : 'Mark all as read'}
                            </button>
                          )}
                          <button 
                            onClick={() => setIsNotifOpen(false)}
                            className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            {isRtl ? 'إغلاق' : 'Close'}
                          </button>
                        </div>
                      </div>

                      <div className="max-h-[60vh] sm:max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-850">
                        {notifications.length === 0 ? (
                          <div className="p-10 text-center text-slate-400 text-xs font-semibold">
                            {isRtl ? 'لا توجد إشعارات حالياً.' : 'No active notifications.'}
                          </div>
                        ) : (
                          notifications.map((notif: any, notifIdx: number) => {
                            const handleNotifClick = () => {
                              if (!notif.read) {
                                const updated = notifications.map((n: any) => n.id === notif.id ? { ...n, read: true } : n);
                                setNotifications(updated);
                                localStorage.setItem('ryvo_broadcast_notifications', JSON.stringify(updated));
                              }
                              if (notif.type === 'support_reply') {
                                setIsNotifOpen(false);
                                onNavigate('chat');
                              }
                            };

                            return (
                              <div 
                                key={notif.id || `notif-${notifIdx}`} 
                                onClick={handleNotifClick}
                                className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors text-right flex gap-3 cursor-pointer ${
                                  !notif.read ? 'bg-amber-500/[0.02] dark:bg-amber-500/[0.03]' : ''
                                }`}
                              >
                                <span className="text-xl shrink-0 mt-0.5">{notif.icon || '📢'}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <h4 className="text-xs font-black text-slate-900 dark:text-white leading-snug">{notif.title}</h4>
                                    {!notif.read && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" title={isRtl ? 'غير مقروء' : 'Unread'} />
                                    )}
                                  </div>
                                  <p className="text-[10.5px] text-slate-500 dark:text-slate-450 mt-1 leading-relaxed font-medium font-sans whitespace-pre-wrap">
                                    {renderInteractiveText(notif.body, isRtl, (copiedCode) => {
                                      handleNotifClick();
                                      if (triggerToast) {
                                        triggerToast(isRtl ? `📋 تم نسخ كود الخصم: ${copiedCode}` : `📋 Copied discount code: ${copiedCode}`);
                                      } else {
                                        setCopyToast(copiedCode);
                                        setTimeout(() => setCopyToast(null), 2000);
                                      }
                                    })}
                                  </p>
                                  <span className="text-[8px] text-slate-400 font-mono mt-2 block">{notif.date} • {notif.time}</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Shopping Bag / Cart Button */}
              <button
                id="cart-trigger"
                onClick={onCartOpen}
                className="p-2.5 rounded-xl bg-[var(--primary-color)]/10 dark:bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/20 text-[var(--primary-color)] hover:scale-105 transition-transform relative cursor-pointer"
                aria-label={currentLanguage === 'ar' ? 'فتح سلة المشتريات' : 'Open shopping cart'}
              >
                <ShoppingBag className="w-4 h-4" />
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[var(--primary-color)] text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center animate-bounce shadow-sm">
                    {cartCount}
                  </span>
                )}
              </button>

              {/* Admin Panel Link - Guarded ONLY for currentUser.role === 'admin' */}
              {currentUser && currentUser.role === 'admin' && (
                <button
                  id="admin-panel-shortcut"
                  data-testid="nav-link-5"
                  onClick={() => onNavigate('admin')}
                  className={`hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all border cursor-pointer ${
                    currentView === 'admin'
                      ? 'bg-rose-500 text-white border-rose-500 shadow-md'
                      : 'bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500 hover:text-white'
                  }`}
                  aria-label={isRtl ? 'لوحة التحكم' : 'Admin Panel'}
                >
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{isRtl ? 'لوحة التحكم' : t.admin_panel}</span>
                </button>
              )}

              {/* User / Auth trigger Button */}
              {currentUser ? (
                <div className="flex items-center gap-1.5">
                  <button
                    id="user-profile-avatar"
                    onClick={() => onNavigate(currentUser.role === 'admin' ? 'admin' : 'dashboard')}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all border border-slate-200 dark:border-[var(--border-dark)] bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] cursor-pointer"
                    aria-label={currentLanguage === 'ar' ? 'لوحة التحكم الشخصية' : 'Go to user profile dashboard'}
                  >
                    <UserIcon className="w-4 h-4 shrink-0 text-[var(--primary-color)]" />
                    <span className="max-w-[85px] truncate hidden sm:inline">
                      {currentUser.name}
                    </span>
                  </button>
                  <button
                    id="auth-logout-btn"
                    onClick={handleLogoutClick}
                    className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[var(--border-dark)] text-slate-500 hover:text-rose-500 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                    title={isRtl ? 'تسجيل الخروج' : 'Logout'}
                  >
                    <span className="hidden sm:inline">{t.logout}</span>
                    <X className="w-4 h-4 sm:hidden" />
                  </button>
                </div>
              ) : (
                <button
                  id="auth-login-trigger"
                  data-testid="sign-in-button"
                  onClick={onAuthOpen}
                  className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 bg-[var(--primary-color)] hover:brightness-110 text-white font-black text-xs rounded-xl shadow-lg shadow-red-500/20 transition-all cursor-pointer whitespace-nowrap"
                  aria-label={currentLanguage === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
                >
                  <UserIcon className="w-4 h-4 shrink-0" />
                  <span>{t.login}</span>
                </button>
              )}

            </div>

          </div>

          {/* Mobile Header View (lg:hidden) */}
          <div className="lg:hidden w-full py-2 flex items-center justify-between gap-1.5 sm:gap-2">
            {/* Left Group: Menu Toggle ☰ + Perfectly Circular RYVO Logo */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                id="mobile-menu-toggle"
                data-testid="mobile-menu-button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-[var(--border-dark)] text-slate-800 dark:text-slate-100 flex items-center justify-center shrink-0 cursor-pointer hover:border-[var(--primary-color)] active:scale-95 transition-all shadow-xs"
                aria-label={isRtl ? 'فتح القائمة الجانبية' : 'Open mobile menu'}
              >
                {isMobileMenuOpen ? <X className="w-5 h-5 text-[var(--primary-color)]" /> : <Menu className="w-5 h-5" />}
              </button>

              {/* Perfectly Centered & Symmetrical Circular RYVO Brand Logo */}
              <button
                id="ryvo-brand-mobile"
                data-testid="mobile-brand-logo"
                onClick={() => onNavigate('home')}
                className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-white dark:bg-[#121622] border-2 border-slate-200 dark:border-[var(--border-dark)] hover:border-[var(--primary-color)] flex items-center justify-center p-1 shrink-0 cursor-pointer transition-all shadow-xs overflow-hidden active:scale-95"
                aria-label={isRtl ? 'الصفحة الرئيسية لـ RYVO' : 'RYVO Home'}
              >
                {shopLogo.startsWith('data:image') || shopLogo.includes('http') || shopLogo.includes('/') ? (
                  <img 
                    src={shopLogo} 
                    alt="RYVO" 
                    className="w-full h-full object-contain rounded-full" 
                    referrerPolicy="no-referrer" 
                  />
                ) : (
                  <span className="text-[var(--primary-color)] font-black text-xs tracking-tighter uppercase select-none">
                    {shopLogo || 'RYVO'}
                  </span>
                )}
              </button>
            </div>

            {/* Right Group: Actions (Settings, Theme, Notif, Cart, Login) with touch targets */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* Settings ⚙️ (Always visible on mobile & opens the comprehensive settings modal) */}
              <button
                id="mobile-settings-button"
                data-testid="mobile-settings-button"
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="w-9 h-9 sm:w-10 sm:h-10 min-w-[36px] sm:min-w-[40px] rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-[var(--border-dark)] text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0 cursor-pointer hover:border-[var(--primary-color)] active:scale-95 transition-all shadow-xs"
                aria-label={isRtl ? 'الإعدادات والخيارات (اللغة والعملة والصوت) ⚙️' : 'Settings (Language, Currency, Sound) ⚙️'}
                title={isRtl ? 'الإعدادات والخيارات ⚙️' : 'Settings ⚙️'}
              >
                <Settings className={`w-4 h-4 ${isSettingsOpen ? 'animate-spin text-[var(--primary-color)]' : 'text-slate-600 dark:text-slate-400'}`} />
              </button>

              {/* Theme ☀️/🌙 */}
              <button
                id="mobile-theme-button"
                data-testid="mobile-theme-toggle"
                onClick={onThemeToggle}
                className="w-9 h-9 sm:w-10 sm:h-10 min-w-[36px] sm:min-w-[40px] rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-[var(--border-dark)] text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0 cursor-pointer hover:border-[var(--primary-color)] active:scale-95 transition-all shadow-xs"
                aria-label={isRtl ? 'تغيير الوضع الداكن أو الفاتح' : 'Toggle Dark/Light Mode'}
                title={isRtl ? 'تغيير الوضع 🌙/☀️' : 'Toggle Theme 🌙/☀️'}
              >
                {currentTheme === 'light' ? <Moon className="w-4 h-4 text-slate-600" /> : <Sun className="w-4 h-4 text-amber-400" />}
              </button>

              {/* Notifications 🔔 */}
              <button
                id="mobile-notifications-button"
                data-testid="mobile-notifications-button"
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className="w-9 h-9 sm:w-10 sm:h-10 min-w-[36px] sm:min-w-[40px] rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-[var(--border-dark)] text-slate-700 dark:text-slate-300 flex items-center justify-center relative shrink-0 cursor-pointer hover:border-[var(--primary-color)] active:scale-95 transition-all shadow-xs"
                aria-label={isRtl ? 'الإشعارات والتنبيهات' : 'Notifications'}
                title={isRtl ? 'الإشعارات 🔔' : 'Notifications 🔔'}
              >
                <Bell className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                {(() => {
                  const unread = notifications.filter((n: any) => !n.read).length;
                  return unread > 0 ? (
                    <span className="absolute -top-1 -right-1 bg-[var(--primary-color)] text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-bounce shadow-xs">
                      {unread}
                    </span>
                  ) : null;
                })()}
              </button>

              {/* Cart 🛍 */}
              <button
                id="mobile-cart-button"
                data-testid="mobile-cart-button"
                onClick={onCartOpen}
                className="w-9 h-9 sm:w-10 sm:h-10 min-w-[36px] sm:min-w-[40px] rounded-xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-[var(--border-dark)] text-slate-700 dark:text-slate-300 flex items-center justify-center relative shrink-0 cursor-pointer hover:border-[var(--primary-color)] active:scale-95 transition-all shadow-xs"
                aria-label={isRtl ? 'سلة المشتريات' : 'Shopping Cart'}
              >
                <ShoppingBag className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[var(--primary-color)] text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-bounce shadow-xs">
                    {cartCount}
                  </span>
                )}
              </button>

              {/* Login / Account Button */}
              <button
                id="mobile-login-button"
                data-testid="sign-in-mobile-button"
                onClick={() => {
                  if (currentUser) {
                    onNavigate(currentUser.role === 'admin' ? 'admin' : 'dashboard');
                  } else {
                    onAuthOpen();
                  }
                }}
                aria-label={isRtl ? 'تسجيل الدخول' : t.login}
                className="h-9 sm:h-10 px-2.5 sm:px-3 min-h-[36px] sm:min-h-[40px] rounded-xl bg-[var(--primary-color)] hover:brightness-110 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1 shrink-0 cursor-pointer transition-all shadow-sm shadow-red-500/20"
              >
                <UserIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[55px] sm:max-w-[85px]">
                  {currentUser ? currentUser.name : (isRtl ? 'تسجيل الدخول' : t.login)}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Side Drawer Menu */}
        {isMobileMenuOpen && (
          <>
            <div 
              className="fixed inset-0 bg-black/60 z-[70] backdrop-blur-xs md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <div 
              id="mobile-drawer"
              data-testid="mobile-drawer"
              role="dialog"
              aria-label={isRtl ? 'قائمة RYVO الرئيسية' : 'RYVO Main Menu'}
              className={`fixed inset-y-0 ${isRtl ? 'right-0 border-l' : 'left-0 border-r'} z-[70] w-80 max-w-[85vw] h-[100dvh] max-h-[100dvh] bg-white dark:bg-[#121622] border-slate-200 dark:border-[var(--border-dark)] shadow-2xl flex flex-col justify-between md:hidden animate-in fade-in duration-200 overflow-hidden select-none`}
              style={{
                touchAction: 'pan-y'
              }}
            >
              {/* Drawer Fixed Header */}
              <div 
                className="shrink-0 px-5 pt-4 pb-3.5 border-b border-slate-100 dark:border-white/10 flex items-center justify-between"
                style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
              >
                <span className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--primary-color)]"></span>
                  <span>{isRtl ? 'قائمة RYVO الرئيسية' : 'RYVO Main Menu'}</span>
                </span>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl bg-slate-100 dark:bg-slate-800 transition-colors cursor-pointer"
                  aria-label={isRtl ? 'إغلاق القائمة' : 'Close menu'}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Scrollable Navigation Links (Full independent scrolling on all mobile viewports) */}
              <div 
                className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-1.5 overscroll-contain"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {/* Home */}
                <button
                  onClick={() => { onNavigate('home'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 py-2.5 px-3.5 rounded-xl font-bold text-xs transition-colors ${isRtl ? 'text-right' : 'text-left'} ${
                    currentView === 'home'
                      ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)] border border-[var(--primary-color)]/20'
                      : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <Home className="w-4 h-4 text-[var(--primary-color)] shrink-0" />
                  <span>{t.home || (isRtl ? 'الرئيسية' : 'Home')}</span>
                </button>

                {/* Store / Catalog */}
                <button
                  onClick={() => {
                    onNavigate('home');
                    setIsMobileMenuOpen(false);
                    setTimeout(() => {
                      document.getElementById('products-grid')?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }}
                  className={`w-full flex items-center gap-3 py-2.5 px-3.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 font-bold text-xs text-slate-800 dark:text-slate-200 transition-colors ${isRtl ? 'text-right' : 'text-left'}`}
                >
                  <ShoppingBag className="w-4 h-4 text-[var(--primary-color)] shrink-0" />
                  <span>{isRtl ? 'المتجر والمنتجات 🏍️' : 'Store & Products 🏍️'}</span>
                </button>

                {/* Categories */}
                <button
                  onClick={() => {
                    onNavigate('home');
                    setIsMobileMenuOpen(false);
                    setTimeout(() => {
                      document.getElementById('categories-section')?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }}
                  className={`w-full flex items-center gap-3 py-2.5 px-3.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 font-bold text-xs text-slate-800 dark:text-slate-200 transition-colors ${isRtl ? 'text-right' : 'text-left'}`}
                >
                  <Grid className="w-4 h-4 text-[var(--primary-color)] shrink-0" />
                  <span>{isRtl ? 'جميع الفئات والتصنيفات ⚡' : 'All Categories ⚡'}</span>
                </button>

                {/* Track Order */}
                <button
                  onClick={() => { onNavigate('track'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 py-2.5 px-3.5 rounded-xl font-bold text-xs transition-colors ${isRtl ? 'text-right' : 'text-left'} ${
                    currentView === 'track'
                      ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)] border border-[var(--primary-color)]/20'
                      : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <Truck className="w-4 h-4 text-[var(--primary-color)] shrink-0" />
                  <span>{t.track_tab || (isRtl ? 'تتبع الطلب 🚚' : 'Track Order 🚚')}</span>
                </button>

                {/* Wishlist / Favorites */}
                <button
                  onClick={() => { onFavoritesOpen(); setIsMobileMenuOpen(false); }}
                  className="w-full flex items-center justify-between py-2.5 px-3.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 font-bold text-xs text-slate-800 dark:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Heart className="w-4 h-4 text-[var(--primary-color)] shrink-0" />
                    <span>{t.favorites || (isRtl ? 'المفضلة ❤️' : 'Wishlist ❤️')}</span>
                  </div>
                  {favoritesCount > 0 && (
                    <span className="px-2 py-0.5 text-[10px] bg-[var(--primary-color)] text-white rounded-full font-black">
                      {favoritesCount}
                    </span>
                  )}
                </button>

                {/* Support Chat */}
                <button
                  onClick={() => { onNavigate('chat'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 py-2.5 px-3.5 rounded-xl font-bold text-xs transition-colors ${isRtl ? 'text-right' : 'text-left'} ${
                    currentView === 'chat'
                      ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)] border border-[var(--primary-color)]/20'
                      : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 text-[var(--primary-color)] shrink-0" />
                  <span>{t.support_tab || (isRtl ? 'الدردشة والدعم 💬' : 'Chat & Support 💬')}</span>
                </button>

                {/* Blog */}
                <button
                  onClick={() => { onNavigate('blog'); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 py-2.5 px-3.5 rounded-xl font-bold text-xs transition-colors ${isRtl ? 'text-right' : 'text-left'} ${
                    currentView === 'blog'
                      ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)] border border-[var(--primary-color)]/20'
                      : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <BookOpen className="w-4 h-4 text-[var(--primary-color)] shrink-0" />
                  <span>{isRtl ? 'المدونة والمقالات ✍️' : 'Blog & Articles ✍️'}</span>
                </button>

                {/* Account / Dashboard */}
                {currentUser && (
                  <button
                    onClick={() => { onNavigate(currentUser.role === 'admin' ? 'admin' : 'dashboard'); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 py-2.5 px-3.5 rounded-xl font-bold text-xs transition-colors ${isRtl ? 'text-right' : 'text-left'} ${
                      currentView === 'dashboard' || currentView === 'admin'
                        ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)] border border-[var(--primary-color)]/20'
                        : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    <UserIcon className="w-4 h-4 text-[var(--primary-color)] shrink-0" />
                    <span>{currentUser.role === 'admin' ? (isRtl ? 'لوحة تحكم المسؤول ⚙️' : 'Admin Panel ⚙️') : (isRtl ? 'حسابي الشخصي 👤' : 'My Account 👤')}</span>
                  </button>
                )}

                {/* Settings & Preferences Section (الإعدادات والتفضيلات) */}
                <div className="pt-3 pb-1 border-t border-slate-100 dark:border-white/10 mt-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block px-3.5 mb-2">
                    {isRtl ? 'الإعدادات والخيارات ⚙️' : 'Settings & Preferences ⚙️'}
                  </span>

                  <div className="space-y-1.5">
                    {/* Theme Toggle Button */}
                    <button
                      onClick={onThemeToggle}
                      className="w-full flex items-center justify-between py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all"
                      aria-label="Toggle Dark/Light Mode"
                    >
                      <div className="flex items-center gap-2.5">
                        {currentTheme === 'light' ? <Moon className="w-4 h-4 text-slate-600" /> : <Sun className="w-4 h-4 text-amber-400" />}
                        <span>{isRtl ? 'المظهر والوضع' : 'Theme Mode'}</span>
                      </div>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white dark:bg-slate-700 shadow-2xs">
                        {currentTheme === 'light' ? (isRtl ? 'النهاري ☀️' : 'Light ☀️') : (isRtl ? 'الليلي 🌙' : 'Dark 🌙')}
                      </span>
                    </button>

                    {/* Notifications Button */}
                    <button
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setIsNotifOpen(true);
                      }}
                      className="w-full flex items-center justify-between py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all"
                      aria-label="Open Notifications"
                    >
                      <div className="flex items-center gap-2.5">
                        <Bell className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <span>{isRtl ? 'الإشعارات والتنبيهات' : 'Notifications'}</span>
                      </div>
                      {(() => {
                        const unread = notifications.filter((n: any) => !n.read).length;
                        return unread > 0 ? (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-[var(--primary-color)] text-white shadow-2xs">
                            {unread} {isRtl ? 'جديد' : 'New'}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">{isRtl ? 'محدّثة' : 'Updated'}</span>
                        );
                      })()}
                    </button>

                    {/* Store Preferences / Settings Modal (Language, Currency, Sound) */}
                    <button
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setIsSettingsOpen(true);
                      }}
                      className="w-full flex items-center justify-between py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all"
                      aria-label="Open Store Settings"
                    >
                      <div className="flex items-center gap-2.5">
                        <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <span>{isRtl ? 'لوحة تخصيص الإعدادات ⚙️' : 'Customize Settings ⚙️'}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold">{isRtl ? 'فتح' : 'Open'}</span>
                    </button>

                    {/* Sound Audio Mute Toggle Button in Drawer */}
                    <button
                      onClick={onMuteToggle}
                      className={`w-full flex items-center justify-between py-2.5 px-3.5 rounded-xl transition-all ${
                        !isMuted 
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold' 
                          : 'bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold'
                      }`}
                      aria-label="Toggle Sound Effects"
                    >
                      <div className="flex items-center gap-2.5">
                        {isMuted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-emerald-500 animate-pulse" />}
                        <span>{isRtl ? 'المؤثرات الصوتية' : 'Sound Effects'}</span>
                      </div>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white dark:bg-slate-700 shadow-2xs">
                        {isMuted ? (isRtl ? 'مكتوم 🔇' : 'Muted 🔇') : (isRtl ? 'مفعل 🔊' : 'Active 🔊')}
                      </span>
                    </button>

                    {/* Quick Language & Currency Switcher Row */}
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <button
                        onClick={() => {
                          const nextLang = currentLanguage === 'ar' ? 'en' : currentLanguage === 'en' ? 'fr' : 'ar';
                          onLanguageChange(nextLang);
                        }}
                        className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all"
                        aria-label="Change Language"
                      >
                        <div className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-[var(--primary-color)]" />
                          <span className="text-[11px] font-bold">{isRtl ? 'اللغة:' : 'Lang:'}</span>
                        </div>
                        <span className="uppercase text-[11px] font-black px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 text-[var(--primary-color)]">
                          {currentLanguage === 'ar' ? 'العربية' : currentLanguage === 'fr' ? 'Français' : 'English'}
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          const nextCurr = currentCurrency === 'USD' ? 'SAR' : currentCurrency === 'SAR' ? 'EUR' : currentCurrency === 'EUR' ? 'AED' : 'USD';
                          onCurrencyChange(nextCurr);
                        }}
                        className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all"
                        aria-label="Change Currency"
                      >
                        <div className="flex items-center gap-1.5">
                          <Coins className="w-3.5 h-3.5 text-[var(--primary-color)]" />
                          <span className="text-[11px] font-bold">{isRtl ? 'العملة:' : 'Curr:'}</span>
                        </div>
                        <span className="uppercase text-[11px] font-black px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 text-[var(--primary-color)]">
                          {currentCurrency}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Drawer Fixed Footer / Actions (with bottom safe-area & Bottom Nav clearance) */}
              <div 
                className="shrink-0 p-4 border-t border-slate-100 dark:border-white/10 space-y-2 bg-slate-50/50 dark:bg-[#0E121A]/50"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              >
                {currentUser ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-white/5 rounded-xl">
                      <div className="flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-[var(--primary-color)] shrink-0" />
                        <span className="font-bold text-xs text-slate-900 dark:text-white truncate max-w-[140px]">{currentUser.name}</span>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-[var(--primary-color)]/20 text-[var(--primary-color)]">
                        {currentUser.role}
                      </span>
                    </div>
                    <button
                      onClick={() => { onLogout(); setIsMobileMenuOpen(false); }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      <span>{isRtl ? 'تسجيل الخروج 🚪' : 'Logout 🚪'}</span>
                    </button>
                  </div>
                ) : (
                  <button
                    id="mobile-drawer-login-btn"
                    data-testid="sign-in-mobile-button"
                    onClick={() => { onAuthOpen(); setIsMobileMenuOpen(false); }}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--primary-color)] text-white font-black text-xs rounded-xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
                  >
                    <UserIcon className="w-4 h-4" />
                    <span>{t.login}</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </nav>

      {/* Luxury Sticky Bottom Navigation Bar for Mobile screens */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-[#090B0E]/95 backdrop-blur-md border-t border-slate-200 dark:border-[var(--border-dark)] shadow-[0_-4px_25px_rgba(0,0,0,0.15)] md:hidden pb-safe pointer-events-auto select-none"
        style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
      >
        <div className="grid grid-cols-5 h-16 items-center px-1">
          {/* Col 1: Home */}
          <button
            id="mobile-nav-home"
            onClick={() => onNavigate('home')}
            aria-label={currentLanguage === 'ar' ? 'الذهاب للرئيسية' : 'Go to Home'}
            className={`flex flex-col items-center justify-center gap-1 w-full h-full text-[10px] font-black transition-all cursor-pointer ${
              currentView === 'home'
                ? 'text-[var(--primary-color)] scale-105 font-black'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Home className="w-5 h-5 shrink-0" />
            <span className="truncate max-w-full">{t.home}</span>
          </button>

          {/* Col 2: Track */}
          <button
            id="mobile-nav-track"
            onClick={() => onNavigate('track')}
            aria-label={currentLanguage === 'ar' ? 'تتبع طلبك' : 'Track your order'}
            className={`flex flex-col items-center justify-center gap-1 w-full h-full text-[10px] font-black transition-all cursor-pointer ${
              currentView === 'track'
                ? 'text-[var(--primary-color)] scale-105 font-black'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Truck className="w-5 h-5 shrink-0" />
            <span className="truncate max-w-full">{t.track_tab ? t.track_tab.replace('🚚', '').trim() : (isRtl ? 'تتبع طلبك' : 'Track')}</span>
          </button>

          {/* Col 3: Chat Support */}
          <button
            id="mobile-nav-chat"
            onClick={() => onNavigate('chat')}
            aria-label={currentLanguage === 'ar' ? 'الدعم والمساعدة بالذكاء الاصطناعي' : 'AI chat support'}
            className={`flex flex-col items-center justify-center gap-1 w-full h-full text-[10px] font-black transition-all cursor-pointer ${
              currentView === 'chat'
                ? 'text-[var(--primary-color)] scale-105 font-black'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MessageSquare className="w-5 h-5 shrink-0" />
            <span className="truncate max-w-full">{t.chat_tab ? t.chat_tab.replace('💬', '').trim() : (isRtl ? 'الدردشة والدعم' : 'Chat')}</span>
          </button>

          {/* Col 4: Favorites */}
          <button
            id="mobile-nav-favorites"
            onClick={onFavoritesOpen}
            aria-label={currentLanguage === 'ar' ? 'عرض المنتجات المفضلة' : 'View favorite products'}
            className={`flex flex-col items-center justify-center gap-1 w-full h-full text-[10px] font-black transition-all cursor-pointer relative ${
              currentView === 'favorites'
                ? 'text-[var(--primary-color)] scale-105 font-black'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Heart className="w-5 h-5 shrink-0" />
            <span className="truncate max-w-full">{t.favorites || (isRtl ? 'المفضلة' : 'Wishlist')}</span>
            {favoritesCount > 0 && (
              <span className="absolute top-1.5 right-2 bg-[var(--primary-color)] text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                {favoritesCount}
              </span>
            )}
          </button>

          {/* Col 5: Profile Dashboard / Admin / Login */}
          <button
            id="mobile-nav-profile"
            data-testid={!currentUser ? "login-button" : "mobile-nav-profile"}
            onClick={() => {
              if (currentUser) {
                onNavigate(currentUser.role === 'admin' ? 'admin' : 'dashboard');
              } else {
                onAuthOpen();
              }
            }}
            aria-label={currentUser ? (currentUser.role === 'admin' ? (currentLanguage === 'ar' ? 'لوحة تحكم المسؤول' : 'Admin Panel') : (currentLanguage === 'ar' ? 'لوحة التحكم الشخصية' : 'User Dashboard')) : (currentLanguage === 'ar' ? 'تسجيل الدخول أو إنشاء حساب' : 'Login or register')}
            className={`flex flex-col items-center justify-center gap-1 w-full h-full text-[10px] font-black transition-all cursor-pointer ${
              currentView === 'dashboard' || currentView === 'admin'
                ? 'text-[var(--primary-color)] scale-105 font-black'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <UserIcon className="w-5 h-5 shrink-0" />
            <span className="truncate max-w-full">{currentUser ? (currentUser.role === 'admin' ? (isRtl ? 'التحكم' : 'Admin') : currentUser.role === 'affiliate' ? (isRtl ? 'المسوق' : 'Affiliate') : (isRtl ? 'الحساب' : 'Account')) : (isRtl ? 'الحساب' : t.login)}</span>
          </button>
        </div>
      </div>

      {/* Global Responsive Settings Modal (تخصيص الإعدادات: اللغة، العملة، كتم الصوت) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop Blur */}
          <div 
            className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsSettingsOpen(false)}
          />

          {/* Modal Card */}
          <div 
            className="relative w-full max-w-sm bg-white dark:bg-[#121622] border border-slate-200 dark:border-[var(--border-dark)] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
            aria-label={isRtl ? 'إعدادات المتجر والتفضيلات' : 'Store Settings'}
          >
            {/* Header */}
            <div className="p-3.5 bg-slate-50 dark:bg-black/40 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-[var(--primary-color)] animate-spin" />
                <span className="text-xs font-black text-slate-800 dark:text-white">
                  {isRtl ? 'تخصيص الإعدادات والخيارات' : 'Customize Experience'}
                </span>
              </div>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                aria-label="Close Settings"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Language Selection */}
              <div className="space-y-1.5">
                <label className={`block text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider ${isRtl ? 'text-right' : 'text-left'}`}>
                  🌐 {isRtl ? 'اللغة المفضلة' : 'Preferred Language'}
                </label>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-[#090B0E] rounded-xl p-1 border dark:border-[var(--border-dark)]">
                  {([
                    { code: 'ar', label: 'العربية' },
                    { code: 'en', label: 'English' },
                    { code: 'fr', label: 'Français' }
                  ]).map((la) => (
                    <button
                      key={la.code}
                      onClick={() => onLanguageChange(la.code as Language)}
                      className={`py-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                        currentLanguage === la.code
                          ? 'bg-[var(--primary-color)] text-white shadow-sm font-black'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {la.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Currency Selection */}
              <div className="space-y-1.5">
                <label className={`block text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider ${isRtl ? 'text-right' : 'text-left'}`}>
                  🪙 {isRtl ? 'العملة المعروضة' : 'Display Currency'}
                </label>
                <div className="grid grid-cols-4 gap-1 bg-slate-100 dark:bg-[#090B0E] rounded-xl p-1 border dark:border-[var(--border-dark)]">
                  {(['SAR', 'USD', 'AED', 'EUR'] as const).map((curr) => (
                    <button
                      key={curr}
                      onClick={() => onCurrencyChange(curr)}
                      className={`py-2 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
                        currentCurrency === curr
                          ? 'bg-[var(--primary-color)] text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {curr}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sound Audio Toggle */}
              <div className="space-y-1.5">
                <label className={`block text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider ${isRtl ? 'text-right' : 'text-left'}`}>
                  🔊 {isRtl ? 'المؤثرات الصوتية للمتجر' : 'Sound Effects'}
                </label>
                <button
                  onClick={onMuteToggle}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                    !isMuted 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold' 
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-[var(--border-dark)] text-slate-600 dark:text-slate-400 font-medium'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isMuted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-emerald-500 animate-pulse" />}
                    <span className="text-xs font-bold">
                      {isMuted ? (isRtl ? 'الأصوات مكتومة' : 'Sounds Muted') : (isRtl ? 'الأصوات مفعلة ومسموعة' : 'Sounds Active')}
                    </span>
                  </div>
                  <span className="text-[10px] font-black px-2 py-1 rounded bg-white dark:bg-slate-800 shadow-2xs uppercase">
                    {isMuted ? (isRtl ? 'تشغيل 🔊' : 'Enable 🔊') : (isRtl ? 'كتم 🔇' : 'Mute 🔇')}
                  </span>
                </button>
              </div>

              {/* Done Button */}
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-full py-2.5 bg-[var(--primary-color)] text-white font-black text-xs rounded-xl shadow-md hover:brightness-110 active:scale-98 transition-all cursor-pointer"
              >
                {isRtl ? 'حفظ وإغلاق ✓' : 'Save & Close ✓'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
