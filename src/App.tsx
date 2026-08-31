import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Product, Language, Theme, CartItem, Order, User, Review, WheelSettings, WheelSegment, StoreSettings } from './types';
import PrelaunchBanner from './components/PrelaunchBanner';
import PrelaunchModal from './components/PrelaunchModal';
import { INITIAL_PRODUCTS } from './constants/initialProducts';
import { TRANSLATIONS } from './constants/translations';
import { updateSEO, generateSitemapXML, generateRobotsTXT } from './utils/seo';
import { formatPrice } from './utils/price';
import { ConfirmationProvider } from './components/ConfirmationDialog';
import socket from './utils/socket';
import { smartFetch } from './utils/smartFetch';
import { checkOAuthRedirectResult, logoutClientAuth, subscribeAuthState, clearClientAuthStorage } from './lib/firebase';

// Components (Critical Render Path - Loaded synchronously)
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import ProductCard from './components/ProductCard';
import { EmailVerificationModal } from './components/EmailVerificationModal';

// Components (Non-critical Render Path - Loaded dynamically via React.lazy)
const ProductDetailsModal = lazy(() => import('./components/ProductDetailsModal'));
const CartDrawer = lazy(() => import('./components/CartDrawer'));
const CheckoutModal = lazy(() => import('./components/CheckoutModal'));
const AuthModal = lazy(() => import('./components/AuthModal'));
const CustomerDashboard = lazy(() => import('./components/CustomerDashboard'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const SupportChat = lazy(() => import('./components/SupportChat'));
const OrderTrack = lazy(() => import('./components/OrderTrack'));
const SpinWheel = lazy(() => import('./components/SpinWheel'));
const LegalPagesModal = lazy(() => import('./components/LegalPagesModal'));
const BlogSection = lazy(() => import('./components/BlogSection'));

// Icons
import { ShieldCheck, Eye, Sparkles, AlertCircle, Heart, FileCode, CheckCircle, Search, Facebook, Twitter, Instagram, Youtube, Ghost, Music, Sliders, SlidersHorizontal, BookOpen, Share2, Award, Newspaper, Calendar, ArrowRight, Download, Server, RefreshCw, Linkedin, Send, MessageSquare, Phone, Globe, Bookmark, Play, Video, HelpCircle } from 'lucide-react';

function slugify(text: string): string {
  if (!text) return "";
  return text
    .toString()
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9 -]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function App() {
  // Theme & Language
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('ryvo_theme');
    return (saved as Theme) || 'light';
  });

  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('ryvo_lang');
    return (saved as Language) || 'ar';
  });

  // Database core states
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('ryvo_products');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return INITIAL_PRODUCTS;
  });

  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('ryvo_cart');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return [];
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('ryvo_orders');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return [];
  });

  const handleCancelOrder = (orderId: string) => {
    setOrders(prev => {
      const updated = prev.map(o => {
        if (o.id === orderId) {
          // Refund wallet balance if payment was made using wallet
          if (o.payment_method === 'wallet' && currentUser) {
            const refundedBalance = (currentUser.wallet_balance || 0) + o.total;
            const updatedUser = { ...currentUser, wallet_balance: refundedBalance };
            setCurrentUser(updatedUser);
            localStorage.setItem('ryvo_user', JSON.stringify(updatedUser));
          }
          return {
            ...o,
            status: 'cancelled' as const,
            status_history: [
              ...(o.status_history || []),
              { status: 'cancelled' as const, timestamp: new Date().toISOString() }
            ]
          };
        }
        return o;
      });
      localStorage.setItem('ryvo_orders', JSON.stringify(updated));
      return updated;
    });
  };

  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('ryvo_favorites');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return [];
  });

  // User state - initialized from persistent storage if available, strictly synchronized with Firebase Auth
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('ryvo_user');
      return saved ? JSON.parse(saved) : null;
    } catch (_) {
      return null;
    }
  });
  const authGenerationRef = useRef<number>(0);

  // Authentication Lifecycle: Source of Truth = Firebase Auth & Server Token Verification
  useEffect(() => {
    let isMounted = true;
    const currentGeneration = ++authGenerationRef.current;

    // 1. Subscribe to Firebase onAuthStateChanged as primary auth state observer
    const unsubscribeAuth = subscribeAuthState(async (firebaseUser) => {
      if (!isMounted || currentGeneration !== authGenerationRef.current) return;

      if (firebaseUser && firebaseUser.email) {
        const cleanEmail = firebaseUser.email.toLowerCase().trim();
        const isSuperAdmin = cleanEmail === 'ryvo.shopa@gmail.com';

        let savedUser: any = null;
        try {
          const raw = localStorage.getItem('ryvo_user');
          if (raw) savedUser = JSON.parse(raw);
        } catch (_) {}

        const activeUser: User = {
          ...(savedUser || {}),
          id: firebaseUser.uid || savedUser?.id || cleanEmail,
          uid: firebaseUser.uid || savedUser?.uid || cleanEmail,
          email: cleanEmail,
          name: firebaseUser.displayName || savedUser?.name || cleanEmail.split('@')[0],
          role: isSuperAdmin ? 'admin' : (savedUser?.role || 'customer'),
          favorites: savedUser?.favorites || [],
          points: savedUser?.points ?? 100
        };

        console.log("🔥 [FIREBASE AUTH RECOVERED ON REFRESH]:", activeUser.email, `(${activeUser.role})`);
        setCurrentUser(activeUser);
        localStorage.setItem('ryvo_user', JSON.stringify(activeUser));
        return;
      }

      // 2. If no Firebase user, check active server session token in localStorage
      const token = localStorage.getItem('ryvo_session_token');
      if (token) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'x-session-token': token
            }
          });
          if (!isMounted || currentGeneration !== authGenerationRef.current) return;
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.user) {
              const verifiedUser: User = data.user;
              console.log("👤 [AUTH SESSION SYNC]: Verified active user:", verifiedUser.email, `(${verifiedUser.role})`);
              setCurrentUser(verifiedUser);
              localStorage.setItem('ryvo_user', JSON.stringify(verifiedUser));
              return;
            }
          }
        } catch (fetchErr) {
          console.warn("⚠️ [AUTH SESSION ME FETCH FAILED]", fetchErr);
        }
      }

      // 3. Fallback: check if valid email user is cached in ryvo_user
      try {
        const savedRaw = localStorage.getItem('ryvo_user');
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          if (parsed && parsed.email) {
            console.log("💾 [LOCAL STORAGE SESSION PERSISTED]:", parsed.email);
            setCurrentUser(parsed);
            return;
          }
        }
      } catch (_) {}

      // If neither Firebase user nor saved session exists, user is guest
      setCurrentUser(null);
    });

    // 2. Check if user is returning from OAuth redirect
    checkOAuthRedirectResult().then((redirectRes) => {
      if (!isMounted || currentGeneration !== authGenerationRef.current) return;
      if (redirectRes && redirectRes.success && redirectRes.user) {
        console.log("🎉 [AUTH REDIRECT] Successfully signed in from OAuth Redirect:", redirectRes.user.email);
        setCurrentUser(redirectRes.user);
        localStorage.setItem('ryvo_user', JSON.stringify(redirectRes.user));
      }
    }).catch((err) => {
      console.warn("⚠️ [AUTH REDIRECT SYNC WARN]", err);
    });

    return () => {
      isMounted = false;
      unsubscribeAuth();
    };
  }, []);

   // UI Active visibility states
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeView, setActiveView] = useState<string>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // Advanced Filters State
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterPriceMin, setFilterPriceMin] = useState<number>(0);
  const [filterPriceMax, setFilterPriceMax] = useState<number>(20000);
  const [filterRating, setFilterRating] = useState<number>(0); // 0 = all
  const [filterAvailability, setFilterAvailability] = useState<string>('all'); // 'all' | 'instock' | 'outofstock'
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);

  // Legal Policies Modal State
  const [isLegalOpen, setIsLegalOpen] = useState<boolean>(false);
  const [legalTab, setLegalTab] = useState<'terms' | 'privacy' | 'returns' | 'shipping' | 'contact'>('terms');

  // Email Newsletter & Subscriber lists (Simulated)
  const [newsletterEmail, setNewsletterEmail] = useState<string>('');
  const [newsletterSubscribed, setNewsletterSubscribed] = useState<boolean>(false);

  // Dynamic 30 Suggestions states
  const [currency, setCurrency] = useState<'SAR' | 'USD' | 'AED' | 'EUR'>(() => {
    return (localStorage.getItem('ryvo_currency') as any) || 'SAR';
  });
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('ryvo_is_muted') === 'true';
  });
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ryvo_recently_viewed');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [wheelSettings, setWheelSettings] = useState<WheelSettings>(() => {
    try {
      const saved = localStorage.getItem('ryvo_wheel_settings');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {}
    return {
      isEnabled: true,
      segments: [
        { id: '1', textAr: 'خصم 5%', textEn: '5% OFF', type: 'coupon', value: 5, couponCode: 'LUCKY5', isAllowedWinner: true },
        { id: '2', textAr: 'حاول مجدداً 🔄', textEn: 'Try Again 🔄', type: 'retry', value: 0, couponCode: '', isAllowedWinner: true },
        { id: '3', textAr: 'ربح 50 نقطة 🪙', textEn: 'Win 50 Points 🪙', type: 'points', value: 50, couponCode: '', isAllowedWinner: true },
        { id: '4', textAr: 'خصم 10%', textEn: '10% OFF', type: 'coupon', value: 10, couponCode: 'LUCKY10', isAllowedWinner: true },
        { id: '5', textAr: 'خصم 15%', textEn: '15% OFF', type: 'coupon', value: 15, couponCode: 'LUCKY15', isAllowedWinner: true },
        { id: '6', textAr: 'حاول مجدداً 🔄', textEn: 'Try Again 🔄', type: 'retry', value: 0, couponCode: '', isAllowedWinner: true },
        { id: '7', textAr: 'ربح 100 نقطة 🪙', textEn: 'Win 100 Points 🪙', type: 'points', value: 100, couponCode: '', isAllowedWinner: true },
        { id: '8', textAr: 'خصم 25% 🔥', textEn: '25% OFF 🔥', type: 'coupon', value: 25, couponCode: 'LUCKY25', isAllowedWinner: true },
      ]
    };
  });

  const handleUpdateWheelSettings = (newSettings: WheelSettings) => {
    setWheelSettings(newSettings);
    localStorage.setItem('ryvo_wheel_settings', JSON.stringify(newSettings));
  };

  const handleCurrencyChange = (curr: 'SAR' | 'USD' | 'AED' | 'EUR') => {
    localStorage.setItem('ryvo_currency', curr);
    setCurrency(curr);
  };

  const handleMuteToggle = () => {
    const next = !isMuted;
    localStorage.setItem('ryvo_is_muted', String(next));
    setIsMuted(next);
    import('./utils/audio').then(m => m.setMuteState(next));
  };

  // Sync mute state on start
  useEffect(() => {
    import('./utils/audio').then(m => m.setMuteState(isMuted));
  }, [isMuted]);

  // Welcome Coupon States
  const [welcomeCouponSettings, setWelcomeCouponSettings] = useState<any>(null);
  const [welcomeCouponSession, setWelcomeCouponSession] = useState<any>(null);
  const [welcomeCouponSecondsLeft, setWelcomeCouponSecondsLeft] = useState<number>(0);

  // Fetch & sync Welcome Coupon Session on start or user changed
  useEffect(() => {
    let isSubscribed = true;
    const fetchWelcomeSession = async (retries = 2) => {
      try {
        const storedSessionId = localStorage.getItem('welcome_coupon_session_id') || '';
        const res = await fetch('/api/welcome-coupon/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            sessionId: storedSessionId,
            email: currentUser?.email || ''
          }),
        });
        if (!isSubscribed) return;
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.session) {
            setWelcomeCouponSession(data.session);
            localStorage.setItem('welcome_coupon_session_id', data.session.id);
            // Calculate remaining seconds based on server expiration and current server time
            const serverDiff = data.session.expiresAt - data.serverTime;
            const remaining = Math.max(0, Math.round(serverDiff / 1000));
            setWelcomeCouponSecondsLeft(remaining);

            // Track view statistics (once per session view)
            const alreadyWitnessed = sessionStorage.getItem('welcome_coupon_witnessed_' + data.session.id);
            if (!alreadyWitnessed) {
              fetch('/api/welcome-coupon/track-view', { method: 'POST' }).catch(() => {});
              sessionStorage.setItem('welcome_coupon_witnessed_' + data.session.id, 'true');
            }
          } else {
            setWelcomeCouponSession(null);
            setWelcomeCouponSecondsLeft(0);
          }
        }
      } catch (err) {
        if (isSubscribed && retries > 0) {
          setTimeout(() => fetchWelcomeSession(retries - 1), 1200);
        } else {
          console.warn('Welcome coupon session fetch currently unavailable:', err);
        }
      }
    };
    
    fetchWelcomeSession();
    return () => {
      isSubscribed = false;
    };
  }, [currentUser]);

  // Dynamic Language Detection Hierarchy (Country via Geolocation -> Browser Lang -> Default Settings)
  useEffect(() => {
    const detectLanguage = async () => {
      // If language was explicitly saved by the user previously, respect it!
      const savedLang = localStorage.getItem('ryvo_lang');
      if (savedLang) return;

      try {
        // 1. Try to detect country via Geolocation IP Lookup API (1s strict timeout)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        const geoRes = await fetch('https://ipapi.co/json/', { signal: controller.signal }).catch(() => null);
        clearTimeout(timeoutId);
        if (geoRes && geoRes.ok) {
          const geoData = await geoRes.json();
          const country = geoData.country_code ? geoData.country_code.toUpperCase() : '';
          
          // Arab countries default to Arabic
          const arCountries = ['SA', 'AE', 'EG', 'JO', 'KW', 'QA', 'OM', 'BH', 'IQ', 'YE', 'SY', 'LB', 'PS', 'LY', 'SD', 'MA', 'DZ', 'TN'];
          // Francophone countries default to French
          const frCountries = ['FR', 'CA', 'BE', 'CH', 'SN', 'CI', 'MG', 'CM', 'NE'];
          
          if (arCountries.includes(country)) {
            setLanguage('ar');
            localStorage.setItem('ryvo_lang', 'ar');
            return;
          } else if (frCountries.includes(country)) {
            setLanguage('fr');
            localStorage.setItem('ryvo_lang', 'fr');
            return;
          }
        }
      } catch (e) {
        console.warn('Geolocation lookup failed, falling back to browser language', e);
      }

      // 2. Fallback to Browser language
      const browserLang = navigator.language ? navigator.language.slice(0, 2).toLowerCase() : '';
      if (browserLang === 'ar') {
        setLanguage('ar');
        localStorage.setItem('ryvo_lang', 'ar');
      } else if (browserLang === 'fr') {
        setLanguage('fr');
        localStorage.setItem('ryvo_lang', 'fr');
      } else {
        // 3. Fallback to Default Store Language
        setLanguage('ar'); // Default store language is Arabic
        localStorage.setItem('ryvo_lang', 'ar');
      }
    };

    detectLanguage();
  }, []);

  // Run countdown timer
  useEffect(() => {
    if (welcomeCouponSecondsLeft <= 0) return;
    const interval = setInterval(() => {
      setWelcomeCouponSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [welcomeCouponSecondsLeft]);

  const handleUpdateWelcomeCoupon = async (wcSettings: any) => {
    setWelcomeCouponSettings(wcSettings);
    try {
      const response = await fetch('/api/global-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ welcomeCoupon: wcSettings }),
      });
      if (!response.ok) {
        console.error('Failed to update welcome coupon settings');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleViewProduct = (p: Product | null) => {
    setSelectedProduct(p);
    if (p) {
      setRecentlyViewed(prev => {
        const filtered = prev.filter(id => id !== p.id);
        const next = [p.id, ...filtered].slice(0, 4);
        localStorage.setItem('ryvo_recently_viewed', JSON.stringify(next));
        return next;
      });
    }
  };

  const handleWheelWinPrize = (segment: WheelSegment, generatedCode: string) => {
    if (segment.type === 'points') {
      if (currentUser) {
        const addedPoints = segment.value;
        const updatedUser = {
          ...currentUser,
          points: (currentUser.points || 0) + addedPoints,
          points_history: [
            {
              id: `pt-${Date.now()}`,
              reason_ar: `الفوز بعجلة الحظ 🎯`,
              reason_en: `Won from Lucky Spin Wheel 🎯`,
              points: addedPoints,
              date: new Date().toISOString()
            },
            ...(currentUser.points_history || [])
          ]
        };
        setCurrentUser(updatedUser);
        localStorage.setItem('ryvo_user', JSON.stringify(updatedUser));
      }
    } else if (segment.type === 'coupon') {
      try {
        const existing = localStorage.getItem('ryvo_points_coupons');
        const list = existing ? JSON.parse(existing) : [];
        if (!list.some((c: any) => c.code === generatedCode)) {
          list.push({ code: generatedCode, value: segment.value });
          localStorage.setItem('ryvo_points_coupons', JSON.stringify(list));
        }
      } catch (e) {}
    }
  };

  // Multi-Review rating sync list state
  const [reviews, setReviews] = useState<Review[]>(() => {
    const saved = localStorage.getItem('ryvo_product_reviews');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    // Default fallback reviews so shop displays credible customer validation from start
    return [
      {
        id: 'rev-1',
        product_id: 'prod-1',
        product_name: 'دراجة جبلية هوائية',
        name: 'فهد الحربي',
        rating: 5,
        text: 'مذهلة جداً وخاماتها ممتازة جداً للدفع والجبال الوعرة! أنصح بها بشدة.',
        date: '2026-06-15'
      },
      {
        id: 'rev-2',
        product_id: 'prod-2',
        product_name: 'ساعة يد ذكية فاخرة',
        name: 'سحر العتيبي',
        rating: 4,
        text: 'ساعة فخمة جداً، شاشتها واضحة ومقاومة للماء والخدش، التوصيل كان سريع.',
        date: '2026-06-18'
      }
    ];
  });

  // Customizable logo state
  const [shopLogo, setShopLogo] = useState<string>(() => {
    return localStorage.getItem('ryvo_shop_logo') || 'RYVO';
  });

  const [announcementTextAr, setAnnouncementTextAr] = useState<string>(() => {
    return localStorage.getItem('ryvo_announcement_text_ar') || 'تسوق بثقة تامة مع حماية وضمان متكامل لجميع المشتريات 🔒';
  });
  const [announcementTextEn, setAnnouncementTextEn] = useState<string>(() => {
    return localStorage.getItem('ryvo_announcement_text_en') || 'Shop with 100% confidence & guaranteed safety index 🔒';
  });
  const [announcementTextFr, setAnnouncementTextFr] = useState<string>(() => {
    return localStorage.getItem('ryvo_announcement_text_fr') || 'Achetez en toute confiance avec une sécurité garantie 🔒';
  });
  const [announcementLink, setAnnouncementLink] = useState<string>(() => {
    return localStorage.getItem('ryvo_announcement_link') || '';
  });

  // Customizable accent brand color state
  const [brandColor, setBrandColor] = useState<string>(() => {
    return localStorage.getItem('ryvo_brand_color') || '#E53E3E';
  });

  // Social media links state
  const [socialLinks, setSocialLinks] = useState(() => {
    try {
      const saved = localStorage.getItem('ryvo_social_links');
      return saved ? JSON.parse(saved) : {
        facebook: 'https://facebook.com',
        twitter: 'https://twitter.com',
        instagram: 'https://instagram.com',
        youtube: 'https://youtube.com',
        snapchat: '',
        tiktok: '',
      };
    } catch (e) {
      return {
        facebook: 'https://facebook.com',
        twitter: 'https://twitter.com',
        instagram: 'https://instagram.com',
        youtube: 'https://youtube.com',
        snapchat: '',
        tiktok: '',
      };
    }
  });

  // Customizable advertising slides (Hero section)
  const [heroSlides, setHeroSlides] = useState<any[] | null>(null);

  // Custom admins with specific allowed panels
  const [customAdmins, setCustomAdmins] = useState<any[]>([]);

  // Purchasing and Ordering controls
  const [purchasingDisabled, setPurchasingDisabled] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | undefined>(undefined);
  const [showPrelaunchModal, setShowPrelaunchModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [verificationParams, setVerificationParams] = useState<{ token?: string; email?: string; alreadyVerified?: boolean }>({});

  const [welcomeBarMinimized, setWelcomeBarMinimized] = useState(false);
  const [welcomeBarCopied, setWelcomeBarCopied] = useState(false);
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
  };

  // Auto-detect email verification tokens or routes in URL query params or pathname
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;
    const verified = urlParams.get('verified');
    const token = urlParams.get('token');
    const email = urlParams.get('email');

    const isVerificationRoute = 
      pathname.includes('/verify') || 
      pathname.includes('/confirm-email') || 
      pathname.includes('/confirm-account') || 
      Boolean(token) || 
      verified === 'true';

    if (isVerificationRoute) {
      setVerificationParams({
        token: token || undefined,
        email: email || undefined,
        alreadyVerified: verified === 'true'
      });
      setIsVerificationModalOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [language]);

  // Commercial Integrations (Stripe, Apple Pay, Aramex, SMSA, COD) state
  const [integrations, setIntegrations] = useState<{
    stripeEnabled: boolean;
    stripeSecretKey: string;
    stripePublishableKey: string;
    applePayEnabled: boolean;
    applePayMerchantId: string;
    aramexEnabled: boolean;
    aramexAccountNumber: string;
    aramexUsername: string;
    aramexPassword: string;
    smsaEnabled: boolean;
    smsaApiKey: string;
    codEnabled: boolean;
    cjApiKey: string;
  }>(() => {
    try {
      const saved = localStorage.getItem('ryvo_integrations');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return {
      stripeEnabled: false,
      stripeSecretKey: '',
      stripePublishableKey: '',
      applePayEnabled: false,
      applePayMerchantId: '',
      aramexEnabled: false,
      aramexAccountNumber: '',
      aramexUsername: '',
      aramexPassword: '',
      smsaEnabled: false,
      smsaApiKey: '',
      codEnabled: true,
      cjApiKey: '',
    };
  });

  // On-Demand and real-time fetch global configuration from the Express backend
  useEffect(() => {
    const fetchGlobalSettings = async () => {
      // Avoid network call if page is hidden
      if (document.visibilityState === 'hidden') return;

      try {
        const data = await smartFetch('/api/global-settings', {
          useCache: true, // Cache GET for 30s
          cacheTtl: 30000
        });

        if (data) {
          if (data.brandColor && data.brandColor !== brandColor) {
            setBrandColor(data.brandColor);
          }
          if (data.shopLogo && data.shopLogo !== shopLogo) {
            setShopLogo(data.shopLogo);
          }
          if (data.purchasingDisabled !== undefined) {
            setPurchasingDisabled(data.purchasingDisabled);
          }
          if (data.storeSettings) {
            setStoreSettings(data.storeSettings);
            if (data.storeSettings.storeMode === 'pre_launch') {
              setPurchasingDisabled(true);
            }
          }

          if (data.announcementTextAr !== undefined) {
            setAnnouncementTextAr(data.announcementTextAr);
            localStorage.setItem('ryvo_announcement_text_ar', data.announcementTextAr);
          }
          if (data.announcementTextEn !== undefined) {
            setAnnouncementTextEn(data.announcementTextEn);
            localStorage.setItem('ryvo_announcement_text_en', data.announcementTextEn);
          }
          if (data.announcementTextFr !== undefined) {
            setAnnouncementTextFr(data.announcementTextFr);
            localStorage.setItem('ryvo_announcement_text_fr', data.announcementTextFr);
          }
          if (data.announcementLink !== undefined) {
            setAnnouncementLink(data.announcementLink);
            localStorage.setItem('ryvo_announcement_link', data.announcementLink);
          }
          if (data.socialLinks) {
            setSocialLinks(data.socialLinks);
          }
          if (data.welcomeCoupon !== undefined) {
            setWelcomeCouponSettings(data.welcomeCoupon);
          }
          if (data.heroSlides !== undefined) {
            setHeroSlides(data.heroSlides);
          }
          if (data.customAdmins) {
            setCustomAdmins(data.customAdmins);
            
            // Sync with local registered users lists so custom admins can log in seamlessly
            const savedUsers = localStorage.getItem('ryvo_registered_users');
            if (savedUsers) {
              const parsed = JSON.parse(savedUsers);
              let changed = false;
              data.customAdmins.forEach((adm: any) => {
                const idx = parsed.findIndex((pu: any) => pu.email.toLowerCase() === adm.email.toLowerCase());
                if (idx > -1) {
                  if (
                    JSON.stringify(parsed[idx].allowedPanels) !== JSON.stringify(adm.allowedPanels) || 
                    parsed[idx].password !== adm.password ||
                    parsed[idx].name !== adm.name
                  ) {
                    parsed[idx].allowedPanels = adm.allowedPanels;
                    parsed[idx].password = adm.password;
                    parsed[idx].name = adm.name;
                    changed = true;
                  }
                } else {
                  parsed.push({
                    email: adm.email,
                    name: adm.name,
                    role: 'admin',
                    favorites: [],
                    password: adm.password || '',
                    allowedPanels: adm.allowedPanels
                  });
                  changed = true;
                }
              });
              if (changed) {
                localStorage.setItem('ryvo_registered_users', JSON.stringify(parsed));
                
                // Live sync current logged-in user if permissions changed
                const currentLogged = localStorage.getItem('ryvo_user');
                if (currentLogged) {
                  try {
                    const loggedObj = JSON.parse(currentLogged);
                    const matchedAdm = data.customAdmins.find((ca: any) => ca.email.toLowerCase() === loggedObj.email.toLowerCase());
                    if (matchedAdm) {
                      const updatedLogged = {
                        ...loggedObj,
                        name: matchedAdm.name,
                        allowedPanels: matchedAdm.allowedPanels
                      };
                      if (
                        JSON.stringify(loggedObj.allowedPanels) !== JSON.stringify(updatedLogged.allowedPanels) ||
                        loggedObj.name !== updatedLogged.name
                      ) {
                        setCurrentUser(updatedLogged);
                      }
                    }
                  } catch (e) {}
                }
              }
            }
          }
          if (data.integrations) {
            setIntegrations(data.integrations);
            localStorage.setItem('ryvo_integrations', JSON.stringify(data.integrations));
          }
        }
      } catch (err: any) {
        console.warn('Unable to fetch settings from API:', err.message || err);
      }
    };

    // Run initial settings load
    fetchGlobalSettings();

    // Re-fetch instantly when settings are updated globally on the server via sockets
    const handleGlobalSettingsUpdate = () => {
      fetchGlobalSettings();
    };
    socket.on('global_settings_updated', handleGlobalSettingsUpdate);

    // Re-fetch only when returning to the tab/window (Refocus)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchGlobalSettings();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      socket.off('global_settings_updated', handleGlobalSettingsUpdate);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Ads Promotional Popup State
  const [ads, setAds] = useState<any[]>([]);
  const [activeAd, setActiveAd] = useState<any | null>(null);
  const [showAdPopup, setShowAdPopup] = useState(false);
  const [adCloseSecondsLeft, setAdCloseSecondsLeft] = useState(0);
  const [canCloseAd, setCanCloseAd] = useState(false);

  // Fetch Ads & Run Scheduler
  useEffect(() => {
    let delayTimer: any;
    const fetchAndSetupAds = async () => {
      try {
        const adsList = await smartFetch('/api/ads', { useCache: true, cacheTtl: 30000, maxRetries: 2 });
        if (Array.isArray(adsList)) {
          setAds(adsList);
          
          // Determine the first eligible ad to display
          const now = new Date();
          const eligibleAd = adsList.find((ad: any) => {
            if (!ad.active) return false;
            
            // Check dates
            if (ad.startDate && new Date(ad.startDate) > now) return false;
            if (ad.endDate && new Date(ad.endDate) < now) return false;
            
            // Check if seen once
            if (ad.showOnce) {
              const seen = localStorage.getItem(`ryvo_ad_seen_${ad.id}`);
              if (seen) return false;
            }
            return true;
          });

          if (eligibleAd) {
            setActiveAd(eligibleAd);
            
            // Start delay timer
            const delayMs = (eligibleAd.delaySeconds || 0) * 1000;
            delayTimer = setTimeout(() => {
              setShowAdPopup(true);
              setAdCloseSecondsLeft(eligibleAd.closeDelaySeconds || 0);
              setCanCloseAd((eligibleAd.closeDelaySeconds || 0) <= 0);
              
              // If duration is defined and > 0, auto close after duration
              if (eligibleAd.durationSeconds > 0) {
                setTimeout(() => {
                  setShowAdPopup(false);
                  // Mark as seen
                  localStorage.setItem(`ryvo_ad_seen_${eligibleAd.id}`, 'true');
                }, eligibleAd.durationSeconds * 1000);
              }
            }, delayMs);
          }
        }
      } catch (err) {
        console.error('Error loading ads:', err);
      }
    };
    fetchAndSetupAds();
    return () => {
      if (delayTimer) clearTimeout(delayTimer);
    };
  }, []);

  // Close countdown timer
  useEffect(() => {
    if (showAdPopup && adCloseSecondsLeft > 0) {
      const interval = setInterval(() => {
        setAdCloseSecondsLeft((prev) => {
          if (prev <= 1) {
            setCanCloseAd(true);
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [showAdPopup, adCloseSecondsLeft]);

  // Toast message auto-dismiss effect
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Dynamic URL router parsing for SEO indexability & sitemap navigation support
  useEffect(() => {
    const handleUrlRouting = () => {
      const pathName = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      
      // Look for product ID in path (e.g. /product/prod-1) or in query (e.g. ?product=prod-1)
      const productPathMatch = pathName.match(/\/product\/([^/]+)/);
      const productQueryId = searchParams.get('product');
      const productId = productQueryId || (productPathMatch ? productPathMatch[1] : null);

      if (productId) {
        const decodedProductId = decodeURIComponent(productId);
        const matched = products.find(p => 
          p.id === decodedProductId || 
          decodedProductId.startsWith(p.id + '-') ||
          slugify(p.name_en) === decodedProductId ||
          slugify(p.name_ar) === decodedProductId
        );
        if (matched) {
          setSelectedProduct(matched);
          setActiveView('home');
          // Smooth scroll to top to see product details
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else {
        const category = searchParams.get('category');
        if (category) {
          setActiveCategory(category);
          setActiveView('home');
          setSelectedProduct(null);
        }
      }
    };

    handleUrlRouting();
    // Listen for state popstate events for backward/forward navigation
    window.addEventListener('popstate', handleUrlRouting);
    return () => window.removeEventListener('popstate', handleUrlRouting);
  }, [products]);

  // Synchronize browser URL history state when product is selected or dismissed
  useEffect(() => {
    const pathName = window.location.pathname;
    
    if (selectedProduct) {
      const slug = slugify(selectedProduct.name_en || selectedProduct.name_ar || '');
      const targetPath = `/product/${selectedProduct.id}-${slug}`;
      if (pathName !== targetPath && !decodeURIComponent(pathName).includes(`/product/${selectedProduct.id}-`)) {
        window.history.pushState({ productId: selectedProduct.id }, '', targetPath);
      }
    } else {
      // Revert back to homepage (root /) but keep category query if present
      const searchParams = new URLSearchParams(window.location.search);
      const category = searchParams.get('category') || (activeCategory !== 'all' ? activeCategory : null);
      const targetPath = category ? `/?category=${category}` : '/';
      
      if (pathName.includes('/product/')) {
        window.history.pushState({}, '', targetPath);
      }
    }
  }, [selectedProduct, activeCategory]);

  // Sync callbacks to save changes on backend
  const getAdminHeaders = () => {
    const token = localStorage.getItem('ryvo_session_token') || '';
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const handleUpdateLogo = async (logo: string) => {
    setShopLogo(logo);
    try {
      const res = await fetch('/api/settings/logo', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ shopLogo: logo, adminEmail: currentUser?.email || 'ryvo.shopa@gmail.com' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.shopLogo) {
          setShopLogo(data.shopLogo);
          localStorage.setItem('ryvo_shop_logo', data.shopLogo);
        }
      } else {
        await fetch('/api/global-settings', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ shopLogo: logo, adminEmail: currentUser?.email || 'ryvo.shopa@gmail.com' }),
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteLogo = async () => {
    try {
      const res = await fetch('/api/settings/logo', {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      if (res.ok) {
        setShopLogo('RYVO');
        localStorage.setItem('ryvo_shop_logo', 'RYVO');
      }
    } catch (e) {
      console.error(e);
      setShopLogo('RYVO');
      localStorage.setItem('ryvo_shop_logo', 'RYVO');
    }
  };

  const handleUpdateBrandColor = async (color: string) => {
    setBrandColor(color);
    try {
      await fetch('/api/global-settings', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ brandColor: color, adminEmail: currentUser?.email || 'ryvo.shopa@gmail.com' }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateAnnouncement = async (textAr: string, textEn: string, textFr: string, link: string) => {
    setAnnouncementTextAr(textAr);
    setAnnouncementTextEn(textEn);
    setAnnouncementTextFr(textFr);
    setAnnouncementLink(link);
    localStorage.setItem('ryvo_announcement_text_ar', textAr);
    localStorage.setItem('ryvo_announcement_text_en', textEn);
    localStorage.setItem('ryvo_announcement_text_fr', textFr);
    localStorage.setItem('ryvo_announcement_link', link);
    try {
      await fetch('/api/global-settings', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          adminEmail: currentUser?.email || 'ryvo.shopa@gmail.com',
          announcementTextAr: textAr,
          announcementTextEn: textEn,
          announcementTextFr: textFr,
          announcementLink: link
        }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdatePurchasingDisabled = async (disabled: boolean) => {
    setPurchasingDisabled(disabled);
    try {
      await fetch('/api/global-settings', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          adminEmail: currentUser?.email || 'ryvo.shopa@gmail.com',
          purchasingDisabled: disabled
        }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateSocialLinks = async (links: typeof socialLinks) => {
    setSocialLinks(links);
    localStorage.setItem('ryvo_social_links', JSON.stringify(links));
    try {
      await fetch('/api/global-settings', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          adminEmail: currentUser?.email || 'ryvo.shopa@gmail.com',
          socialLinks: links
        }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateHeroSlides = async (slides: any[] | null) => {
    setHeroSlides(slides);
    try {
      await fetch('/api/global-settings', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          adminEmail: currentUser?.email || 'ryvo.shopa@gmail.com',
          heroSlides: slides
        }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateCustomAdmins = async (admins: any[]) => {
    setCustomAdmins(admins);
    try {
      await fetch('/api/global-settings', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          adminEmail: currentUser?.email || 'ryvo.shopa@gmail.com',
          customAdmins: admins
        }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateIntegrations = async (newIntegrations: any) => {
    setIntegrations(newIntegrations);
    localStorage.setItem('ryvo_integrations', JSON.stringify(newIntegrations));
    try {
      await fetch('/api/global-settings', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          adminEmail: currentUser?.email || 'ryvo.shopa@gmail.com',
          integrations: newIntegrations
        }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Modals sliders managers
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // SEO modal viewer
  const [seoModalType, setSeoModalType] = useState<'sitemap' | 'robots' | null>(null);

  // Sync Storage & DOM Brand Favicons
  useEffect(() => {
    localStorage.setItem('ryvo_shop_logo', shopLogo);

    if (typeof window !== 'undefined') {
      const timestamp = Date.now();

      // Dynamic favicon & icon cache-busting updates
      const favIco = document.querySelector('link[rel="icon"][type="image/x-icon"]') || document.querySelector('link[rel="shortcut icon"]');
      if (favIco) favIco.setAttribute('href', `/favicon.ico?v=${timestamp}`);

      const fav16 = document.querySelector('link[rel="icon"][sizes="16x16"]');
      if (fav16) fav16.setAttribute('href', `/favicon-16x16.png?v=${timestamp}`);

      const fav32 = document.querySelector('link[rel="icon"][sizes="32x32"]');
      if (fav32) fav32.setAttribute('href', `/favicon-32x32.png?v=${timestamp}`);

      const appleTouch = document.querySelector('link[rel="apple-touch-icon"]');
      if (appleTouch) appleTouch.setAttribute('href', `/apple-touch-icon.png?v=${timestamp}`);

      const manifest = document.querySelector('link[rel="manifest"]');
      if (manifest) manifest.setAttribute('href', `/manifest.webmanifest?v=${timestamp}`);

      // Social & OpenGraph Meta
      const ogImg = document.querySelector('meta[property="og:image"]');
      const twImg = document.querySelector('meta[name="twitter:image"]');
      const absoluteLogo = shopLogo.startsWith('data:image') || shopLogo.startsWith('http')
        ? shopLogo
        : `${window.location.origin}${shopLogo.startsWith('/') ? shopLogo : `/${shopLogo}`}`;

      if (ogImg) ogImg.setAttribute('content', absoluteLogo);
      if (twImg) twImg.setAttribute('content', absoluteLogo);
    }
  }, [shopLogo]);

  useEffect(() => {
    localStorage.setItem('ryvo_brand_color', brandColor);
    const root = window.document.documentElement;
    root.style.setProperty('--primary-color', brandColor);
    
    try {
      let hex = brandColor.replace('#', '');
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        root.style.setProperty('--primary-color-rgb', `${r}, ${g}, ${b}`);
      }
    } catch (_) {}
  }, [brandColor]);

  useEffect(() => {
    localStorage.setItem('ryvo_product_reviews', JSON.stringify(reviews));
  }, [reviews]);

  useEffect(() => {
    localStorage.setItem('ryvo_theme', theme);
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('ryvo_lang', language);
    // Adjust layout direction HTML attribute
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    updateSEO({ product: selectedProduct || undefined, category: activeCategory, language });
  }, [language, selectedProduct, activeCategory]);

  useEffect(() => {
    localStorage.setItem('ryvo_products', JSON.stringify(products));
    // Synchronize with server for dynamic sitemap.xml updates using smartFetch
    if (products && products.length > 0) {
      smartFetch('/api/sync-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products }),
        maxRetries: 2
      }).catch(err => console.warn('Product sync with server paused:', err?.message || err));
    }
  }, [products]);

  useEffect(() => {
    localStorage.setItem('ryvo_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('ryvo_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('ryvo_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('ryvo_user', JSON.stringify(currentUser));
    }
  }, [currentUser]);

  // Load data from Firestore backend on mount
  useEffect(() => {
    const loadBackendData = async () => {
      try {
        const prodData = await smartFetch('/api/products', { useCache: true, cacheTtl: 10000, maxRetries: 2 });
        if (Array.isArray(prodData) && prodData.length > 0) {
          setProducts(prodData);
        }
      } catch (e: any) {
        console.warn('Unable to load products from server (server may be booting/restarting):', e.message || e);
      }

      try {
        const ordData = await smartFetch('/api/orders', { useCache: true, cacheTtl: 10000, maxRetries: 2 });
        if (Array.isArray(ordData) && ordData.length > 0) {
          setOrders(ordData);
        }
      } catch (e: any) {
        console.warn('Unable to load orders from server (server may be booting/restarting):', e.message || e);
      }

      try {
        const revData = await smartFetch('/api/reviews', { useCache: true, cacheTtl: 10000, maxRetries: 2 });
        if (Array.isArray(revData) && revData.length > 0) {
          setReviews(revData);
        }
      } catch (e: any) {
        console.warn('Unable to load reviews from server (server may be booting/restarting):', e.message || e);
      }
    };
    loadBackendData();
  }, []);

  // Core functions
  const handleThemeToggle = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
  };

  const handleCartAdd = (product: Product, quantity: number, color?: string) => {
    setCart(prev => {
      const idx = prev.findIndex(item => item.product.id === product.id && item.color === (color || 'أسود'));
      if (idx > -1) {
        const updated = [...prev];
        updated[idx].quantity = Math.min(product.stock, updated[idx].quantity + quantity);
        return updated;
      }
      return [...prev, { product, quantity, color: color || 'أسود' }];
    });
    setIsCartOpen(true);
  };

  const handleBuyNow = (product: Product, quantity: number, color?: string) => {
    if (purchasingDisabled || storeSettings?.storeMode === 'pre_launch') {
      setShowPrelaunchModal(true);
      return;
    }
    if (!currentUser) {

      triggerToast(language === 'ar' ? 'يجب تسجيل الدخول أولاً لإتمام الشراء!' : 'You must log in first to purchase!');
      setIsAuthOpen(true);
      return;
    }
    setCart(prev => {
      const idx = prev.findIndex(item => item.product.id === product.id && item.color === (color || 'أسود'));
      if (idx > -1) {
        return prev;
      }
      return [...prev, { product, quantity, color: color || 'أسود' }];
    });
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  const handleAddReview = async (productId: string, name: string, rating: number, text: string, attachedPhoto?: string) => {
    const prod = products.find(p => p.id === productId);
    const newReview: Review = {
      id: `rev-${Math.floor(1000 + Math.random() * 9000)}`,
      product_id: productId,
      product_name: prod ? (language === 'ar' ? prod.name_ar : prod.name_en) : 'منتج غير معروف',
      name,
      rating,
      text,
      date: new Date().toISOString().split('T')[0],
      attached_photo: attachedPhoto
    };
    setReviews(prev => [newReview, ...prev]);

    // Send to backend database
    try {
      await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReview)
      });
    } catch (e) {
      console.error('Error saving review to database:', e);
    }

    // Update catalog average rating count/sum dynamically in state
    setProducts(prevProducts => {
      const updated = prevProducts.map(p => {
        if (p.id === productId) {
          return {
            ...p,
            rating_sum: p.rating_sum + rating,
            rating_count: p.rating_count + 1
          };
        }
        return p;
      });

      // Let's also sync the updated rating_sum and rating_count for this product on the backend
      const updatedProd = updated.find(p => p.id === productId);
      if (updatedProd) {
        fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedProd)
        }).catch(err => console.error('Error syncing reviewed product rating:', err));
      }

      return updated;
    });

    // Award loyalty points to current user if logged in AND they purchased the product!
    if (currentUser) {
      const hasPurchased = orders.some(o => 
        o.user_email?.toLowerCase() === currentUser.email.toLowerCase() &&
        o.status !== 'cancelled' &&
        o.items.some(it => it.product_id === productId)
      );

      if (hasPurchased) {
        const isWithPhoto = !!attachedPhoto;
        const pointsAwarded = isWithPhoto ? 15 : 10;
        
        const updatedUser = {
          ...currentUser,
          points: (currentUser.points || 0) + pointsAwarded,
          points_history: [
            {
              id: `pt-rev-${Math.floor(Math.random() * 89999)}`,
              reason_ar: isWithPhoto 
                ? 'إضافة تقييم متميز مع صورة توضيحية للمنتج 📸🌟' 
                : 'شكر وتقدير لكتابة تعليق وتقييم للمنتج 🌟',
              reason_en: isWithPhoto 
                ? 'Premium product review with visual photo attached 📸🌟' 
                : 'Thank you reward for writing a helpful product review 🌟',
              points: pointsAwarded,
              date: new Date().toISOString().split('T')[0]
            },
            ...(currentUser.points_history || [])
          ]
        };
        
        setCurrentUser(updatedUser);
        // Synchronize in simulated registered users localStorage list
        const savedUserList = localStorage.getItem('ryvo_registered_users');
        if (savedUserList) {
          try {
            const parsed = JSON.parse(savedUserList);
            const idx = parsed.findIndex((u: any) => u.email.toLowerCase() === currentUser.email.toLowerCase());
            if (idx !== -1) {
              parsed[idx] = updatedUser;
              localStorage.setItem('ryvo_registered_users', JSON.stringify(parsed));
            }
          } catch (e) {
            // ignore
          }
        }
      }
    }
  };

  const handleDeleteReview = (reviewId: string) => {
    const rev = reviews.find(r => r.id === reviewId);
    if (!rev) return;
    setReviews(prev => prev.filter(r => r.id !== reviewId));

    // Restore updated rating count/sum
    setProducts(prevProducts => {
      return prevProducts.map(p => {
        if (p.id === rev.product_id) {
          return {
            ...p,
            rating_sum: Math.max(0, p.rating_sum - rev.rating),
            rating_count: Math.max(0, p.rating_count - 1)
          };
        }
        return p;
      });
    });
  };

  const handleUpdateCartQty = (pId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.product.id === pId) {
          const newQty = Math.max(1, Math.min(item.product.stock, item.quantity + delta));
          return { ...item, quantity: newQty };
        }
        return item;
      });
    });
  };

  const handleRemoveCartItem = (pId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== pId));
  };

  const handleFavoriteToggle = (pId: string) => {
    setFavorites(prev => {
      if (prev.includes(pId)) {
        return prev.filter(id => id !== pId);
      }
      return [...prev, pId];
    });
  };

  const sendSimulatedCustomerEmail = (toEmail: string, subject: string, body: string) => {
    let current: any[] = [];
    const saved = localStorage.getItem('ryvo_customer_emails');
    if (saved) {
      try { current = JSON.parse(saved); } catch (e) {}
    }
    const today = new Date();
    const formattedDate = today.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    const formattedTime = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newMail = {
      id: `email-${Math.floor(Math.random() * 9999999)}-${Date.now()}`,
      to: toEmail,
      subject,
      body,
      date: formattedDate,
      time: formattedTime
    };

    localStorage.setItem('ryvo_customer_emails', JSON.stringify([...current, newMail]));
  };

  const handleOrderSuccess = (newOrder: Order) => {
    // 1. Record completed order
    setOrders(prev => [newOrder, ...prev]);

    // 2. Subtract stocks from catalog database
    setProducts(prevProducts => {
      return prevProducts.map(prod => {
        const orderItem = newOrder.items.find(it => it.product_id === prod.id);
        if (orderItem) {
          return {
            ...prod,
            stock: Math.max(0, prod.stock - orderItem.quantity)
          };
        }
        return prod;
      });
    });

    // Award loyalty points on order completion!
    if (currentUser && currentUser.email.toLowerCase() === newOrder.user_email.toLowerCase()) {
      const userOrderCount = orders.filter(o => o.user_email.toLowerCase() === currentUser.email.toLowerCase()).length;
      let pointsAwarded = 0;
      let reasonAr = '';
      let reasonEn = '';

      if (userOrderCount < 6) {
        pointsAwarded = 10;
        reasonAr = `لكتابة وإتمام طلب الشراء رقم #${newOrder.id} (مكافأة لأول 6 طلبات) 🛍️`;
        reasonEn = `For completing checkout order #${newOrder.id} (Reward for first 6 transactions) 🛍️`;
      } else if (newOrder.total > 300) {
        pointsAwarded = 10;
        reasonAr = `لكتابة وإتمام طلب كبير بقيمة تتجاوز 300 دولار رقم #${newOrder.id} 💎`;
        reasonEn = `High-value transition order bonus #${newOrder.id} (total > $300) 💎`;
      }

      if (pointsAwarded > 0) {
        const updatedUser = {
          ...currentUser,
          points: (currentUser.points || 0) + pointsAwarded,
          points_history: [
            {
              id: `pt-ord-${Math.floor(Math.random() * 89999)}`,
              reason_ar: reasonAr,
              reason_en: reasonEn,
              points: pointsAwarded,
              date: new Date().toISOString().split('T')[0]
            },
            ...(currentUser.points_history || [])
          ]
        };

        setCurrentUser(updatedUser);

        // Synchronize in simulated registered users localStorage list
        const savedUserList = localStorage.getItem('ryvo_registered_users');
        if (savedUserList) {
          try {
            const parsed = JSON.parse(savedUserList);
            const idx = parsed.findIndex((u: any) => u.email.toLowerCase() === currentUser.email.toLowerCase());
            if (idx !== -1) {
              parsed[idx] = updatedUser;
              localStorage.setItem('ryvo_registered_users', JSON.stringify(parsed));
            }
          } catch (e) {
            // ignore
          }
        }
      }
    }

    // 3. Clear shopping cart
    setCart([]);
    setIsCheckoutOpen(false);

    // 4. Send automated Order Confirmation Email Receipt to Virtual Customer Inbox
    const emailSubject = language === 'ar' 
      ? 'تم استلام وتأكيد طلبك الفاخر بنجاح! 🛍️✨' 
      : 'Ryvo Store Order Confirmation Registered! 🛍️✨';
    
    const itemsDescription = newOrder.items.map(it => `${it.name} (x${it.quantity}) [${language === 'ar' ? 'اللون:' : 'Color:'} ${it.color || 'أسود'}]`).join('، ');
    
    const emailBody = language === 'ar'
      ? `عزيزنا العميل الفاخر ${newOrder.customer_name}،\n\nنود إبلاغك بأنه تم تأكيد استلام طلبك رقم (#${newOrder.id}) لدينا بنجاح ونعمل الآن على قدم وساق لتجهيزه!\n\nتفاصيل طلبك:\n• المنتجات: ${itemsDescription}\n• مجموع المنتجات المطلوبة الكلي: ${newOrder.items.reduce((acc, it) => acc + it.quantity, 0)} قطع\n• القيمة الكلية المدفوعة: ${newOrder.total} ريال سعودي\n• عنوان الشحن: ${newOrder.address}\n\nشكراً لتسوقكم وثقتكم بمتجر رايفو! 💎`
      : `Dear ${newOrder.customer_name},\n\nWe are delighted to confirm that your order (#${newOrder.id}) has been placed and received successfully! Our operations team is preparing your package.\n\nYour Order Details:\n• Items: ${itemsDescription}\n• Total quantity: ${newOrder.items.reduce((acc, it) => acc + it.quantity, 0)} units\n• Paid Amount: ${newOrder.total} SAR\n• Destination: ${newOrder.address}\n\nThank you for choosing Ryvo Store! 💎`;

    sendSimulatedCustomerEmail(newOrder.user_email, emailSubject, emailBody);
  };

  // Auth Callbacks
  const handleAuthSuccess = (user: User) => {
    authGenerationRef.current += 1;
    const cleanEmail = (user.email || '').toLowerCase().trim();
    const isAdmin = cleanEmail === 'ryvo.shopa@gmail.com' || user.role === 'admin' || user.role === 'super_admin';
    const finalUser = isAdmin ? { ...user, role: 'admin' as const } : user;

    console.log("==========================================");
    console.log("🔑 [HANDLE AUTH SUCCESS IN APP]:");
    console.log(" - Email:", finalUser.email);
    console.log(" - Role:", finalUser.role);
    console.log(" - IsAdmin:", isAdmin);
    console.log("==========================================");

    setCurrentUser(finalUser);
    localStorage.setItem('ryvo_user', JSON.stringify(finalUser));

    if (isAdmin) {
      setActiveView('admin');
    } else {
      setActiveView('dashboard');
    }
  };

  const handleLogout = async () => {
    console.log("🚪 [LOGOUT ACTION TRIGGERED] Terminating user session completely...");
    // 1. Invalidate current auth request generation to discard any in-flight async auth responses
    authGenerationRef.current += 1;

    // 2. Capture token before clearing
    const currentToken = localStorage.getItem('ryvo_session_token') || '';

    // 3. Immediately reset React state to logged out / guest
    setCurrentUser(null);
    setFavorites([]);
    setActiveView('home');

    // 4. Disconnect & cleanup Socket.IO user connection and listeners
    try {
      if (socket) {
        socket.emit('leave_conversation');
        socket.disconnect();
      }
    } catch (sockErr) {
      console.warn("⚠️ [SOCKET DISCONNECT WARN]", sockErr);
    }

    // 5. Notify server to invalidate and delete session from activeSessions & cookies
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': currentToken ? `Bearer ${currentToken}` : '',
          'x-session-token': currentToken
        },
        body: JSON.stringify({ token: currentToken })
      });
      console.log("✅ [SERVER LOGOUT] Session revoked on backend.");
    } catch (netErr) {
      console.warn('⚠️ [SERVER LOGOUT NETWORK WARN]', netErr);
    }

    // 6. Complete client-side Firebase Auth signOut & storage cleanup
    await logoutClientAuth();

    // 7. Feedback toast
    triggerToast(language === 'ar' ? 'تم تسجيل الخروج بنجاح 👋' : 'Signed out successfully 👋');
  };

  // Admin Callbacks
  const handleAddProduct = async (newProduct: Product) => {
    setProducts(prev => [newProduct, ...prev]);
    try {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
      });
    } catch (err) {
      console.error('Error adding product to backend:', err);
    }
  };

  const handleUpdateProduct = async (updatedProduct: Product) => {
    setProducts(prev => {
      const existingProduct = prev.find(p => p.id === updatedProduct.id);
      if (existingProduct) {
        const priceChanged = existingProduct.price !== updatedProduct.price;
        const costChanged = existingProduct.calculated_cost !== updatedProduct.calculated_cost;
        if (priceChanged || costChanged) {
          const logData = {
            productId: updatedProduct.id,
            productName: updatedProduct.name_ar || updatedProduct.name_en,
            oldPrice: existingProduct.price || 0,
            newPrice: updatedProduct.price || 0,
            oldCost: existingProduct.calculated_cost || existingProduct.cost_price || 0,
            newCost: updatedProduct.calculated_cost || updatedProduct.cost_price || 0,
            editedBy: currentUser?.email || 'admin@ryvo.shop',
            timestamp: new Date().toISOString()
          };
          fetch('/api/price-audit-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logData)
          }).catch(err => console.error('Error logging price audit:', err));
        }
      }
      return prev.map(p => (p.id === updatedProduct.id ? updatedProduct : p));
    });

    try {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProduct)
      });
    } catch (err) {
      console.error('Error updating product on backend:', err);
    }
  };

  const handleDeleteProduct = async (pId: string) => {
    setProducts(prev => prev.filter(p => p.id !== pId));
    try {
      await fetch(`/api/products/${pId}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.error('Error deleting product from backend:', err);
    }
  };

  const handleUpdateOrderStatus = async (ordId: string, status: Order['status']) => {
    setOrders(prev => {
      const match = prev.find(o => o.id === ordId);
      if (match) {
        // Send status email dynamically
        let statusAr = 'تحت الإجراء';
        let statusEn = 'processing';
        
        if (status === 'shipped') {
          statusAr = 'تم شحنه وتسليمه لشركة التوصيل 🚚';
          statusEn = 'shipped & handed to carrier 🚚';
        } else if (status === 'delivered') {
          statusAr = 'تم التوصيل والاستلام بنجاح 🎉';
          statusEn = 'successfully delivered and received 🎉';
        } else if (status === 'cancelled') {
          statusAr = 'تم إلغاؤه ⛔';
          statusEn = 'cancelled ⛔';
        }

        const emailSubject = language === 'ar'
          ? `تحديث جديد بخصوص حالة طلبك (#${ordId})`
          : `New Update regarding your Ryvo order status (#${ordId})`;

        const emailBody = language === 'ar'
          ? `عزيزنا العميل الفاخر ${match.customer_name}،\n\nنود مسارعتك بالبشرى وتحديث حالة طلبك رقم (#${ordId}) لدينا.\n\nالحالة الجديدة المعتمدة الآن: [ ${statusAr} ]\n\nسنستمر في موافاتك بكل تحديث فوري فور حدوثه. طاب يومك بكل خير! ✨`
          : `Dear ${match.customer_name},\n\nWe would like to share an update about your ongoing order (#${ordId}).\n\nUpdated Status: [ ${statusEn} ]\n\nWe will keep notifying you immediately of any progress. Have a beautiful day! ✨`;

        sendSimulatedCustomerEmail(match.user_email, emailSubject, emailBody);
      }
      return prev.map(o => {
        if (o.id === ordId) {
          const history = o.status_history ? [...o.status_history] : [
            { status: 'pending', timestamp: new Date(o.date).toISOString() }
          ];
          // Append the new status with the current timestamp
          history.push({
            status,
            timestamp: new Date().toISOString()
          });
          return {
            ...o,
            status,
            status_history: history
          };
        }
        return o;
      });
    });

    try {
      await fetch('/api/orders/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ordId, status })
      });
    } catch (err) {
      console.error('Error updating order status on backend:', err);
    }
  };

  // Filter products for gallery grid with multi-criteria advanced filters
  const searchFilteredProducts = products.filter(p => {
    // 1. Category check
    const matchesCategory = activeCategory === 'all' || p.category === activeCategory;
    
    // 2. Search query check (title and desc)
    const translationTitle = language === 'ar' ? p.name_ar : language === 'fr' ? p.name_fr : p.name_en;
    const translationDesc = language === 'ar' ? p.description_ar : language === 'fr' ? p.description_fr : p.description_en;
    const matchesQuery = !searchQuery.trim() || 
      translationTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      translationDesc.toLowerCase().includes(searchQuery.toLowerCase());
    
    // 3. Price range check
    const matchesPrice = p.price >= filterPriceMin && p.price <= filterPriceMax;
    
    // 4. Brand filter check
    let matchesBrand = true;
    if (filterBrand !== 'all') {
      const bLower = filterBrand.toLowerCase();
      const inTitle = translationTitle.toLowerCase().includes(bLower);
      const inDesc = translationDesc.toLowerCase().includes(bLower);
      const inTags = (p.tag_en || '').toLowerCase().includes(bLower) || (p.tag_ar || '').includes(filterBrand);
      matchesBrand = inTitle || inDesc || inTags;
    }
    
    // 5. Rating filter check (Average rating calculation)
    const ratingAvg = p.rating_count > 0 ? (p.rating_sum / p.rating_count) : 5;
    const matchesRating = ratingAvg >= filterRating;
    
    // 6. Availability (Stock) check
    let matchesAvailability = true;
    if (filterAvailability === 'instock') {
      matchesAvailability = p.stock > 0;
    } else if (filterAvailability === 'outofstock') {
      matchesAvailability = p.stock === 0;
    }
    
    // 7. Hide if out of stock check
    const isOut = p.stock <= 0;
    const shouldHideOut = p.hide_if_out_of_stock && isOut;
    const isUserAdmin = currentUser?.role === 'admin';
    if (shouldHideOut && !isUserAdmin) {
      return false;
    }
    
    return matchesCategory && matchesQuery && matchesPrice && matchesBrand && matchesRating && matchesAvailability;
  });

  const t = TRANSLATIONS[language];
  const isRtl = language === 'ar';

  return (
    <ConfirmationProvider language={language}>
      <div className={`min-h-screen transition-colors duration-300 font-sans ${
        theme === 'dark' ? 'bg-[#090B0E] text-[#F8FAFC]' : 'bg-[#F8F9FA] text-[#0F172A]'
      }`}>
      
      {/* Pre-Launch Top Announcement Banner */}
      <PrelaunchBanner storeSettings={storeSettings} isRtl={isRtl} />

      {/* Top Warning Banner if user is on simulated credentials */}

      {currentUser && currentUser.role === 'admin' && (
        <div className="bg-gradient-to-r from-rose-500 to-amber-500 text-white py-2 text-center text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 px-4 shadow-sm">
          <ShieldCheck className="w-4 h-4 animate-bounce" />
          <span>{language === 'ar' ? 'أنت تتصفح حالياً كمدير مسؤول للمتجر !' : 'Active Administrative Dev Sandbox Session!'}</span>
        </div>
      )}

      {/* Navigation Header */}
      <Navbar
        currentLanguage={language}
        onLanguageChange={handleLanguageChange}
        currentTheme={theme}
        onThemeToggle={handleThemeToggle}
        favoritesCount={favorites.length}
        cartCount={cart.reduce((s, item) => s + item.quantity, 0)}
        currentUser={currentUser}
        onCartOpen={() => setIsCartOpen(true)}
        onAuthOpen={() => setIsAuthOpen(true)}
        shopLogo={shopLogo}
        socialLinks={socialLinks}
        announcementTextAr={announcementTextAr}
        announcementTextEn={announcementTextEn}
        announcementTextFr={announcementTextFr}
        announcementLink={announcementLink}
        onLogout={handleLogout}
        onNavigate={(view) => {
          setActiveView(view);
          if (view === 'home') {
            setActiveCategory('all');
            setSearchQuery('');
          }
        }}
        currentView={activeView}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onFavoritesOpen={() => {
          if (!currentUser) setIsAuthOpen(true);
          else setActiveView('dashboard');
        }}
        currentCurrency={currency}
        onCurrencyChange={handleCurrencyChange}
        allProducts={products}
        onProductClick={handleViewProduct}
        isMuted={isMuted}
        onMuteToggle={handleMuteToggle}
        triggerToast={triggerToast}
        welcomeCouponSession={welcomeCouponSession}
      />

      {/* Main Container Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-[calc(88px+max(8px,env(safe-area-inset-bottom)))] md:pb-12 min-h-[80vh]">
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <RefreshCw className="animate-spin text-emerald-500 w-8 h-8" />
            <p className="text-xs text-slate-400 font-medium">
              {language === 'ar' ? 'جاري التحميل...' : 'Loading components...'}
            </p>
          </div>
        }>
        
        {/* VIEW 1: ADMIN CONTROL PANEL PANEL */}
        {activeView === 'admin' && currentUser?.role === 'admin' ? (
          <AdminPanel
            currentUser={currentUser}
            currentLanguage={language}
            products={products}
            orders={orders}
            onAddProduct={handleAddProduct}
            onUpdateProduct={handleUpdateProduct}
            onDeleteProduct={handleDeleteProduct}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            reviews={reviews}
            onDeleteReview={handleDeleteReview}
            shopLogo={shopLogo}
            onUpdateLogo={handleUpdateLogo}
            onDeleteLogo={handleDeleteLogo}
            brandColor={brandColor}
            onUpdateBrandColor={handleUpdateBrandColor}
            socialLinks={socialLinks}
            onUpdateSocialLinks={handleUpdateSocialLinks}
            announcementTextAr={announcementTextAr}
            announcementTextEn={announcementTextEn}
            announcementTextFr={announcementTextFr}
            announcementLink={announcementLink}
            onUpdateAnnouncement={handleUpdateAnnouncement}
            heroSlides={heroSlides}
            onUpdateHeroSlides={handleUpdateHeroSlides}
            customAdmins={customAdmins}
            onUpdateCustomAdmins={handleUpdateCustomAdmins}
            wheelSettings={wheelSettings}
            onUpdateWheelSettings={handleUpdateWheelSettings}
            integrations={integrations}
            onUpdateIntegrations={handleUpdateIntegrations}
            purchasingDisabled={purchasingDisabled}
            onUpdatePurchasingDisabled={handleUpdatePurchasingDisabled}
            welcomeCouponSettings={welcomeCouponSettings}
            onUpdateWelcomeCoupon={handleUpdateWelcomeCoupon}
          />
        ) : activeView === 'chat' ? (
          /* VIEW 1.2: SUPPORT ONLINE CHAT PANEL */
          <SupportChat 
            currentLanguage={language} 
            currentUser={currentUser}
            onClose={() => setActiveView('home')}
          />
        ) : activeView === 'blog' ? (
          /* VIEW 1.4: OFFICIAL MOTORCYCLE BLOG SECTION */
          <BlogSection 
            currentLanguage={language} 
            onNavigateHome={() => setActiveView('home')} 
          />
        ) : activeView === 'track' ? (
          /* VIEW 1.3: ORDER TRACKING TIMELINE PANEL */
          <OrderTrack currentLanguage={language} orders={orders} currentUser={currentUser} />
        ) : activeView === 'dashboard' && currentUser ? (
          /* VIEW 2: CUSTOMER MY ACCOUNT PORTAL */
           <CustomerDashboard
             currentUser={currentUser}
             currentLanguage={language}
             orders={orders}
             allProducts={products}
             favorites={favorites}
             onFavoriteToggle={handleFavoriteToggle}
             onProductClick={handleViewProduct}
             onUpdateUserName={(newName) => {
               if (currentUser) {
                 setCurrentUser({ ...currentUser, name: newName });
               }
             }}
             onUpdateUser={(updated) => setCurrentUser(updated)}
             shopLogo={shopLogo}
             onCancelOrder={handleCancelOrder}
             onLogout={handleLogout}
           />
        ) : (
          /* VIEW 3: MAIN MARKET SHOWCASE */
          <div className="space-y-12 animate-in fade-in duration-300">
            {/* Carousel Promotional Header */}
            <Hero
              currentLanguage={language}
              heroSlides={heroSlides}
              shopLogo={shopLogo}
              onShopClick={() => {
                const galleryEl = document.getElementById('market-gallery-grid');
                if (galleryEl) galleryEl.scrollIntoView({ behavior: 'smooth' });
              }}
            />

            {/* Catalog Sectors Filters */}
            <div className="space-y-6">
              <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-200 pb-5 ${
                isRtl ? 'sm:flex-row-reverse text-right' : 'sm:flex-row text-left'
              }`}>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black">{t.products}</h2>
                  <p className="text-xs text-slate-400 font-bold tracking-wide">{t.tagline}</p>
                </div>

                {/* Categories tab pills list & Advanced Filters Trigger */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 bg-slate-150/10 dark:bg-[#121622] p-1.5 rounded-2xl border border-slate-100 dark:border-[var(--border-dark)]">
                    {[
                      { id: 'all', label: t.all },
                      { id: 'bikes', label: t.bikes },
                      { id: 'cars', label: t.cars },
                      { id: 'electronics', label: t.electronics },
                      { id: 'accessories', label: t.accessories },
                      { id: 'digital', label: t.digital || 'منتجات رقمية' }
                    ].map((cat, idx) => (
                      <button
                        key={`${cat.id}-${idx}`}
                        id={`btn-category-tab-${cat.id}`}
                        onClick={() => {
                          setActiveCategory(cat.id);
                          setSearchQuery('');
                        }}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-tight transition-all cursor-pointer ${
                          activeCategory === cat.id
                            ? 'bg-[var(--primary-color)] text-white shadow-md'
                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <button
                    id="btn-advanced-filters-toggle"
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-black flex items-center gap-1.5 transition-all border cursor-pointer ${
                      isFilterOpen
                        ? 'bg-[var(--primary-color)]/15 border-[var(--primary-color)] text-[var(--primary-color)] shadow-md'
                        : 'bg-white dark:bg-[#121622] border-slate-200 dark:border-[var(--border-dark)] text-slate-700 dark:text-slate-300 hover:border-slate-350'
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>{language === 'ar' ? 'تصفية متقدمة ⚡' : 'Advanced Filters ⚡'}</span>
                  </button>
                </div>
              </div>

              {/* Collapsible Advanced Filters Panel */}
              {isFilterOpen && (
                <div className="bg-slate-50/50 dark:bg-[#121622]/80 border border-slate-150 dark:border-[var(--border-dark)] rounded-3xl p-6 sm:p-8 animate-in slide-in-from-top-4 duration-300 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Filter Col 1: Brand/Manufacturer */}
                    <div className="space-y-2">
                      <label className="block text-xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                        {language === 'ar' ? 'العلامة التجارية / الماركة' : 'Brand / Manufacturer'}
                      </label>
                      <select
                        value={filterBrand}
                        onChange={(e) => setFilterBrand(e.target.value)}
                        className="w-full text-xs p-3 rounded-xl border bg-white dark:bg-[#090B0E] text-slate-850 dark:text-white border-slate-200 dark:border-[var(--border-dark)] outline-none"
                      >
                        <option value="all">{language === 'ar' ? 'جميع الماركات 🏍️' : 'All Brands 🏍️'}</option>
                        <option value="Yamaha">Yamaha</option>
                        <option value="Honda">Honda</option>
                        <option value="Kawasaki">Kawasaki</option>
                        <option value="Suzuki">Suzuki</option>
                        <option value="Helix">Helix</option>
                        <option value="Cyber">Cyber</option>
                        <option value="Quantum">Quantum</option>
                        <option value="Royal">Royal</option>
                        <option value="NeoCarbon">NeoCarbon</option>
                      </select>
                    </div>

                    {/* Filter Col 2: Max Price */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                        <span>{language === 'ar' ? 'السعر الأقصى' : 'Max Price'}</span>
                        <span className="text-amber-500 font-mono text-[11px] font-black">{filterPriceMax} SAR</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="20000"
                        step="50"
                        value={filterPriceMax}
                        onChange={(e) => setFilterPriceMax(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                      <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                        <span>0 SAR</span>
                        <span>20,000 SAR</span>
                      </div>
                    </div>

                    {/* Filter Col 3: Customer Rating */}
                    <div className="space-y-2">
                      <label className="block text-xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                        {language === 'ar' ? 'تقييم العملاء' : 'Customer Rating'}
                      </label>
                      <select
                        value={filterRating}
                        onChange={(e) => setFilterRating(Number(e.target.value))}
                        className="w-full text-xs p-3 rounded-xl border bg-white dark:bg-[#090B0E] text-slate-850 dark:text-white border-slate-200 dark:border-[var(--border-dark)] outline-none"
                      >
                        <option value="0">{language === 'ar' ? 'أي تقييم ⭐' : 'Any Rating ⭐'}</option>
                        <option value="5">5 {language === 'ar' ? 'نجوم كاملة ⭐' : 'Stars Only ⭐'}</option>
                        <option value="4">4 {language === 'ar' ? 'نجوم فأكثر ⭐⭐⭐⭐' : 'Stars & Up ⭐⭐⭐⭐'}</option>
                        <option value="3">3 {language === 'ar' ? 'نجوم فأكثر ⭐⭐⭐' : 'Stars & Up ⭐⭐⭐'}</option>
                      </select>
                    </div>

                    {/* Filter Col 4: Availability */}
                    <div className="space-y-2">
                      <label className="block text-xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                        {language === 'ar' ? 'حالة التوفر' : 'Availability / Stock'}
                      </label>
                      <select
                        value={filterAvailability}
                        onChange={(e) => setFilterAvailability(e.target.value)}
                        className="w-full text-xs p-3 rounded-xl border bg-white dark:bg-[#090B0E] text-slate-850 dark:text-white border-slate-200 dark:border-[var(--border-dark)] outline-none"
                      >
                        <option value="all">{language === 'ar' ? 'الكل 🛍️' : 'All 🛍_'}</option>
                        <option value="instock">{language === 'ar' ? 'متوفر بالمخزن فقط ✅' : 'In Stock Only ✅'}</option>
                        <option value="outofstock">{language === 'ar' ? 'غير متوفر / نفذت الكمية 🚫' : 'Out of Stock 🚫'}</option>
                      </select>
                    </div>
                  </div>

                  {/* Reset Actions Row */}
                  <div className={`flex justify-between items-center border-t border-slate-200/55 dark:border-[var(--border-dark)] pt-4 ${isRtl ? 'flex-row' : 'flex-row-reverse'}`}>
                    <span className="text-xs text-slate-450 font-bold">
                      {language === 'ar' 
                        ? `تم العثور على ${searchFilteredProducts.length} منتج مطابق لفلاترك.` 
                        : `Found ${searchFilteredProducts.length} matched products.`}
                    </span>
                    <button
                      id="btn-filters-reset"
                      onClick={() => {
                        setFilterBrand('all');
                        setFilterPriceMin(0);
                        setFilterPriceMax(20000);
                        setFilterRating(0);
                        setFilterAvailability('all');
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-650 dark:text-slate-300 transition-all cursor-pointer"
                    >
                      {language === 'ar' ? 'إعادة ضبط الفلاتر 🔄' : 'Reset Filters 🔄'}
                    </button>
                  </div>
                </div>
              )}

              {/* Grid cards showcase */}
              <div id="market-gallery-grid">
                {searchFilteredProducts.length === 0 ? (
                  /* Empty state catalog */
                  <div className="bg-white dark:bg-[#111827] rounded-3xl p-16 text-center border border-slate-100 dark:border-slate-200 max-w-xl mx-auto space-y-4">
                    <AlertCircle className="w-12 h-12 text-slate-800 dark:text-slate-650 mx-auto animate-pulse" />
                    <p className="text-xs font-bold font-sans text-slate-450 leading-relaxed">
                      {language === 'ar' 
                        ? 'عذراً، لم يتم العثور على أي منتجات مطابقة لبحثك في المتجر حالياً.' 
                        : 'No matched products found matching search query.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {searchFilteredProducts.map((prod, idx) => (
                      <ProductCard
                        key={`${prod.id}-${idx}`}
                        product={prod}
                        currentLanguage={language}
                        isFavorite={favorites.includes(prod.id)}
                        onFavoriteToggle={() => handleFavoriteToggle(prod.id)}
                        onViewDetails={() => handleViewProduct(prod)}
                        onQuickAdd={() => handleCartAdd(prod, 1)}
                        onBuyNow={() => handleBuyNow(prod, 1)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recently Viewed Carousel */}
            {recentlyViewed.length > 0 && (
              <div className="space-y-6 mt-12 animate-in fade-in duration-300">
                <div className={isRtl ? 'text-right' : 'text-left'}>
                  <h3 className="text-lg font-black flex items-center gap-2 justify-start">
                    <span>🕒</span>
                    <span>{language === 'ar' ? 'منتجات شاهدتها مؤخراً' : 'Recently Viewed'}</span>
                  </h3>
                  <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider mt-0.5">
                    {language === 'ar' ? 'المنتجات التي قمت بتصفحها مؤخراً لتسهيل الوصول إليها' : 'Products you recently inspected for quick retrieval'}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {Array.from(new Set(recentlyViewed))
                    .map(prodId => products.find(p => p.id === prodId))
                    .filter((prod): prod is Product => !!prod)
                    .map((prod, idx) => {
                      const name = language === 'ar' ? prod.name_ar : language === 'fr' ? prod.name_fr : prod.name_en;
                      return (
                        <div 
                          key={`${prod.id}-recent-${idx}`} 
                          onClick={() => handleViewProduct(prod)}
                          className="group bg-white dark:bg-[#121622] rounded-2xl p-4 border border-slate-150 dark:border-[var(--border-dark)] hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer text-center flex flex-col justify-between"
                        >
                          <div className="aspect-square w-full rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900/60 p-1 mb-3">
                            <img 
                              src={prod.image} 
                              alt={name}
                              width={150}
                              height={150}
                              loading="lazy"
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" 
                              referrerPolicy="no-referrer" 
                            />
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 line-clamp-1 group-hover:text-[var(--primary-color)] transition-colors">{name}</h4>
                            <span className="text-[10px] font-black text-[var(--primary-color)] font-sans block">{formatPrice(prod.price, language)}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* About & Trust indicators banner */}
            <div className="bg-white dark:bg-[#121622] rounded-3xl p-6 sm:p-12 text-slate-900 dark:text-white relative overflow-hidden border border-slate-200 dark:border-[var(--border-dark)] shadow-xs mt-12">
              <div className="absolute right-0 top-0 w-96 h-96 bg-gradient-to-br from-[var(--primary-color)]/10 to-transparent rounded-full blur-3xl -mr-32 -mt-32"></div>
              
              <div className="relative max-w-2xl space-y-4">
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[var(--primary-color)]/10 text-[var(--primary-color)] border border-[var(--primary-color)]/20 rounded-full text-[10px] font-black uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t.store_name}</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black leading-snug">
                  {language === 'ar' ? 'من نحن - RYVO 🏍️' : 'About RYVO 🏍️'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-sans leading-relaxed">
                  {language === 'ar' 
                    ? 'RYVO هو متجرك المتخصص لعشاق الدراجات النارية، نوفر الدراجات والإكسسوارات والمستلزمات المختارة بعناية مع تجربة شراء احترافية تجمع بين الجودة، الشغف، والابتكار.' 
                    : 'RYVO is your specialized store for motorcycle enthusiasts. We provide carefully selected bikes, accessories, and supplies with a professional shopping experience that combines quality, passion, and innovation.'}
                </p>
              </div>
            </div>

          </div>
        )}

        </Suspense>
      </main>

      {/* Footer Area */}
      <footer className="bg-slate-100 dark:bg-[#090B0E] border-t border-slate-200 dark:border-[var(--border-dark)] py-16 mt-20 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 text-right">
            
            {/* Column 1: Store Intro (Col span 4) */}
            <div className={`md:col-span-4 space-y-4 ${isRtl ? 'text-right' : 'text-left'}`}>
              <div className="flex items-center gap-2">
                {shopLogo && (shopLogo.startsWith('data:image') || shopLogo.includes('http') || shopLogo.includes('/')) ? (
                  <img src={shopLogo} alt="RYVO" className="h-8 object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-xl font-black uppercase text-slate-900 dark:text-white tracking-wider">{shopLogo || 'RYVO'}</span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                {language === 'ar' 
                  ? 'رايفو هو وجهتك المتخصصة الأولى للحصول على الدراجات النارية عالية الأداء، الخوذات الذكية الكاربون، والإكسسوارات الفاخرة المعتمدة دولياً لضمان سلامتك وراحتك.'
                  : 'Ryvo is your ultimate specialized hub for high-performance motorcycles, smart carbon helmets, and internationally certified premium accessories.'}
              </p>
              
              {/* Social Icons row */}
              <div className="flex flex-wrap items-center gap-2.5 pt-2">
                {socialLinks && Object.entries(socialLinks)
                  .map(([platform, value]) => {
                    let url = '';
                    let isEnabled = true;
                    if (value && typeof value === 'object' && value !== null) {
                      url = (value as any).url || '';
                      isEnabled = (value as any).isEnabled !== false;
                    } else if (typeof value === 'string') {
                      url = value;
                    }
                    return { platform, url, isEnabled };
                  })
                  .filter(item => item.isEnabled && item.url && item.url.trim() !== '')
                  .map(({ platform, url }) => {
                    // Dynamic platform config mapper
                    const getPlatformConfig = (key: string) => {
                      const norm = key.toLowerCase().trim();
                      switch (norm) {
                        case 'facebook':
                          return { Icon: Facebook, color: 'text-blue-600 hover:bg-blue-600 hover:text-white border-blue-200 dark:border-blue-900/30' };
                        case 'twitter':
                        case 'x':
                          return { Icon: Twitter, color: 'text-sky-500 hover:bg-sky-500 hover:text-white border-sky-250 dark:border-sky-900/30' };
                        case 'instagram':
                          return { Icon: Instagram, color: 'text-pink-600 hover:bg-pink-600 hover:text-white border-pink-200 dark:border-pink-900/30' };
                        case 'youtube':
                          return { Icon: Youtube, color: 'text-red-600 hover:bg-red-600 hover:text-white border-red-200 dark:border-red-900/30' };
                        case 'snapchat':
                          return { Icon: Ghost, color: 'text-yellow-600 hover:bg-yellow-500 hover:text-black border-yellow-200 dark:border-yellow-900/30' };
                        case 'tiktok':
                          return { Icon: Music, color: 'text-slate-800 dark:text-white hover:bg-black dark:hover:bg-white hover:text-white dark:hover:text-black border-slate-250 dark:border-slate-800' };
                        case 'whatsapp':
                          return { Icon: Phone, color: 'text-emerald-500 hover:bg-emerald-500 hover:text-white border-emerald-200 dark:border-emerald-900/30' };
                        case 'telegram':
                          return { Icon: Send, color: 'text-sky-600 hover:bg-sky-600 hover:text-white border-sky-200 dark:border-sky-900/30' };
                        case 'discord':
                          return { Icon: MessageSquare, color: 'text-indigo-600 hover:bg-indigo-600 hover:text-white border-indigo-200 dark:border-indigo-900/30' };
                        case 'linkedin':
                          return { Icon: Linkedin, color: 'text-blue-700 hover:bg-blue-700 hover:text-white border-blue-200 dark:border-blue-900/30' };
                        case 'pinterest':
                          return { Icon: Bookmark, color: 'text-red-700 hover:bg-red-700 hover:text-white border-red-200 dark:border-red-900/30' };
                        default:
                          return { Icon: Globe, color: 'text-indigo-550 hover:bg-indigo-500 hover:text-white border-indigo-200 dark:border-indigo-900/30' };
                      }
                    };
                    
                    const conf = getPlatformConfig(platform);
                    const IconComp = conf.Icon;
                    const finalHref = url.startsWith('http') ? url : `https://${url}`;
                    
                    return (
                      <a
                        key={platform}
                        href={finalHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={platform.charAt(0).toUpperCase() + platform.slice(1)}
                        className={`w-8 h-8 rounded-full bg-slate-200/50 dark:bg-slate-900 border flex items-center justify-center transition-all shadow-sm ${conf.color}`}
                      >
                        <IconComp className="w-3.5 h-3.5" />
                      </a>
                    );
                  })}
              </div>
            </div>

            {/* Column 2: Legal & Support links (Col span 4) */}
            <div className={`md:col-span-4 space-y-4 ${isRtl ? 'text-right' : 'text-left'}`}>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {language === 'ar' ? 'السياسات والروابط القانونية' : 'Legal Policies & Support'}
              </h4>
              <ul className="space-y-2 text-xs font-black">
                <li>
                  <button 
                    onClick={() => { setLegalTab('terms'); setIsLegalOpen(true); }}
                    className="text-slate-600 dark:text-slate-400 hover:text-[var(--primary-color)] dark:hover:text-[var(--primary-color)] transition-all cursor-pointer"
                  >
                    {language === 'ar' ? '📜 الشروط والأحكام العامة' : '📜 General Terms & Conditions'}
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => { setLegalTab('privacy'); setIsLegalOpen(true); }}
                    className="text-slate-600 dark:text-slate-400 hover:text-[var(--primary-color)] dark:hover:text-[var(--primary-color)] transition-all cursor-pointer"
                  >
                    {language === 'ar' ? '🔒 سياسة الخصوصية وبينات المشترين' : '🔒 Privacy Policy & Data Protection'}
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => { setLegalTab('returns'); setIsLegalOpen(true); }}
                    className="text-slate-600 dark:text-slate-400 hover:text-[var(--primary-color)] dark:hover:text-[var(--primary-color)] transition-all cursor-pointer"
                  >
                    {language === 'ar' ? '🔄 سياسة الاسترجاع والاستبدال المرنة' : '🔄 Returns & Refund Guidelines'}
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => { setLegalTab('shipping'); setIsLegalOpen(true); }}
                    className="text-slate-600 dark:text-slate-400 hover:text-[var(--primary-color)] dark:hover:text-[var(--primary-color)] transition-all cursor-pointer"
                  >
                    {language === 'ar' ? '🚚 سياسة الشحن والتوصيل السريع' : '🚚 Express Shipping & Delivery'}
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => { setLegalTab('contact'); setIsLegalOpen(true); }}
                    className="text-slate-600 dark:text-slate-400 hover:text-[var(--primary-color)] dark:hover:text-[var(--primary-color)] transition-all cursor-pointer"
                  >
                    {language === 'ar' ? '📞 معلومات الاتصال والدعم الفني 24/7' : '📞 Technical Support & Contact'}
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3: Newsletter & Marketing (Col span 4) */}
            <div className={`md:col-span-4 space-y-4 ${isRtl ? 'text-right' : 'text-left'}`}>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {language === 'ar' ? 'النشرة البريدية والعروض' : 'Newsletter & Coupons'}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                {language === 'ar'
                  ? 'اشترك للحصول على كوبونات خصم حصرية تصل إلى 25% وتنبيهات فورية عند إضافة دراجات أو إكسسوارات جديدة للمخزن.'
                  : 'Subscribe to get instant custom coupon codes up to 25% off and first alerts on high-performance product restocks.'}
              </p>

              <div className="flex gap-1.5 max-w-sm">
                <input
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder={language === 'ar' ? 'بريدك الإلكتروني...' : 'your.email@example.com'}
                  className="flex-1 text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121622] text-slate-900 dark:text-white outline-none focus:border-[var(--primary-color)] transition-colors"
                />
                <button
                  onClick={() => {
                    if (newsletterEmail.trim()) {
                      setNewsletterSubscribed(true);
                      setNewsletterEmail('');
                      // Save to localStorage list of subscribers
                      const savedList = JSON.parse(localStorage.getItem('ryvo_subscribers') || '[]');
                      if (!savedList.includes(newsletterEmail)) {
                        savedList.push(newsletterEmail);
                        localStorage.setItem('ryvo_subscribers', JSON.stringify(savedList));
                      }
                      setTimeout(() => setNewsletterSubscribed(false), 4000);
                    }
                  }}
                  className="px-4 py-3 bg-[var(--primary-color)] hover:brightness-110 text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-sm"
                >
                  {newsletterSubscribed 
                    ? (language === 'ar' ? 'تم الاشتراك بنجاح! 🚀' : 'Subscribed! 🚀') 
                    : (language === 'ar' ? 'اشترك ⚡' : 'Subscribe ⚡')}
                </button>
              </div>
            </div>

          </div>

          {/* Bottom Copyright and apple copyright statement */}
          <div className="pt-8 border-t border-slate-200/55 dark:border-[var(--border-dark)] text-center space-y-4">
            
            {/* Exact required statement of copyright */}
            <div className="text-xs text-slate-500 dark:text-slate-400 font-bold leading-relaxed space-y-1.5">
              <p>
                حقوق الطبع والنشر © 2026 شركة Apple Inc. جميع الحقوق محفوظة. 
                <button onClick={() => { setLegalTab('privacy'); setIsLegalOpen(true); }} className="mx-1.5 hover:text-sky-500 underline transition-all">سياسة الخصوصية</button>| 
                <button onClick={() => { setLegalTab('terms'); setIsLegalOpen(true); }} className="mx-1.5 hover:text-sky-500 underline transition-all">شروط الاستخدام</button>| 
                <button onClick={() => { setLegalTab('returns'); setIsLegalOpen(true); }} className="mx-1.5 hover:text-sky-500 underline transition-all">المبيعات والاسترداد</button>| 
                <button onClick={() => { setLegalTab('contact'); setIsLegalOpen(true); }} className="mx-1.5 hover:text-sky-500 underline transition-all">التفاصيل القانونية</button>
              </p>
            </div>

            {/* Dynamic Google SEO Audits (Toggle Sitemap/Robots modal dynamically) */}
            <div className="flex flex-wrap items-center justify-center gap-4 text-[10px] font-extrabold uppercase text-slate-450">
              <span className="flex items-center gap-1 hover:text-amber-500 cursor-pointer" onClick={() => setSeoModalType('sitemap')}>
                <FileCode className="w-3.5 h-3.5 text-emerald-500" />
                <span>Sitemap.xml (Google SEO)</span>
              </span>
              <span className="text-slate-200 dark:text-slate-800">|</span>
              <span className="flex items-center gap-1 hover:text-amber-500 cursor-pointer" onClick={() => setSeoModalType('robots')}>
                <FileCode className="w-3.5 h-3.5 text-sky-500" />
                <span>Robots.txt (Search Console)</span>
              </span>
            </div>

          </div>

        </div>
      </footer>

      {/* ALL MODALS & FLYOUTS DIALOGS INJECTS */}
      <Suspense fallback={null}>

      {/* MODAL 1: Product detail view modal */}
      {selectedProduct && (
        <ProductDetailsModal
          product={selectedProduct}
          currentLanguage={language}
          onClose={() => setSelectedProduct(null)}
          isFavorite={favorites.includes(selectedProduct.id)}
          onFavoriteToggle={() => handleFavoriteToggle(selectedProduct.id)}
          onAddToCart={(quantity, color) => {
            handleCartAdd(selectedProduct, quantity, color);
            setSelectedProduct(null);
          }}
          onBuyNow={(quantity, color) => {
            handleCartAdd(selectedProduct, quantity, color);
            setSelectedProduct(null);
            setIsCheckoutOpen(true);
          }}
          reviews={reviews}
          onAddReview={handleAddReview}
          hasPurchased={
            !!currentUser &&
            orders.some(o => 
              o.user_email?.toLowerCase() === currentUser.email.toLowerCase() &&
              o.status !== 'cancelled' &&
              o.items.some(it => it.product_id === selectedProduct.id)
            )
          }
        />
      )}

      {/* MODAL 2: Cart drawer flying from side */}
      {isCartOpen && (
        <CartDrawer
          cart={cart}
          currentLanguage={language}
          onClose={() => setIsCartOpen(false)}
          onUpdateQty={handleUpdateCartQty}
          onRemoveItem={handleRemoveCartItem}
          shopLogo={shopLogo}
          onCheckout={() => {
            setIsCartOpen(false);
            if (purchasingDisabled) {
              triggerToast(language === 'ar' ? 'عذراً، لم يتم الافتتاح حتى الآن!' : 'Sorry, we are not open yet!');
              return;
            }
            if (!currentUser) {
              triggerToast(language === 'ar' ? 'يجب تسجيل الدخول أولاً لإتمام الشراء!' : 'You must log in first to purchase!');
              setIsAuthOpen(true);
            } else {
              setIsCheckoutOpen(true);
            }
          }}
        />
      )}

      {/* MODAL 3: Secure Checkout / billing checkout modal */}
      {isCheckoutOpen && cart.length > 0 && (
        <CheckoutModal
          cart={cart}
          currentLanguage={language}
          onClose={() => setIsCheckoutOpen(false)}
          onOrderSuccess={handleOrderSuccess}
          userEmail={currentUser?.email || ''}
          userName={currentUser?.name || ''}
          currentUser={currentUser}
          onUpdateUser={(updated) => setCurrentUser(updated)}
          shopLogo={shopLogo}
          integrations={integrations}
          welcomeCouponSession={welcomeCouponSession}
          welcomeCouponSecondsLeft={welcomeCouponSecondsLeft}
        />
      )}

      {/* MODAL 4: User sign-in authenticator modal */}
      {isAuthOpen && (
        <AuthModal
          currentLanguage={language}
          onClose={() => setIsAuthOpen(false)}
          onAuthSuccess={handleAuthSuccess}
          shopLogo={shopLogo}
        />
      )}

      {/* MODAL 4.5: Email Verification Modal */}
      <EmailVerificationModal
        isOpen={isVerificationModalOpen}
        onClose={() => setIsVerificationModalOpen(false)}
        token={verificationParams.token}
        email={verificationParams.email}
        alreadyVerified={verificationParams.alreadyVerified}
        language={language}
        onOpenAuth={() => setIsAuthOpen(true)}
      />

      {/* MODAL 5: Google SEO XML & TXT audit inspect dialog */}
      {seoModalType && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div onClick={() => setSeoModalType(null)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm"></div>
          
          <div className="bg-white dark:bg-[#121622] rounded-3xl p-6 sm:p-8 w-full max-w-2xl border border-slate-150 dark:border-[var(--border-dark)] text-left font-sans text-xs relative select-all flex flex-col justify-between">
            <button onClick={() => setSeoModalType(null)} className="absolute top-4 right-4 p-2.5 rounded-full bg-slate-50 dark:bg-slate-800"><XIcon /></button>
            
            <div className="space-y-4">
              <h3 className="font-extrabold text-sm uppercase text-[var(--primary-color)] tracking-wider flex items-center gap-1.5 border-b pb-3 border-slate-100 dark:border-[var(--border-dark)]">
                <FileCode className="w-4 h-4" />
                <span>Google Search Console Metadata Parser Tool</span>
              </h3>
              <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                This contains the live compiled compliant SEO outputs Google robots index:
              </p>
              
              <pre className="p-4 bg-slate-50 dark:bg-[#141d30] rounded-2xl overflow-x-auto text-[10px] font-mono border border-slate-150 text-slate-320 dark:text-amber-400 max-h-64">
                {seoModalType === 'sitemap' ? generateSitemapXML(products) : generateRobotsTXT()}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Legal Policies & Official Terms Modal */}
      <LegalPagesModal
        isOpen={isLegalOpen}
        onClose={() => setIsLegalOpen(false)}
        currentLanguage={language}
        initialTab={legalTab}
      />

      {/* Lucky Spin Wheel Component */}
      <SpinWheel 
        isRtl={language === 'ar'} 
        onWinPrize={handleWheelWinPrize} 
        settings={wheelSettings} 
      />

      {/* Dynamic Advertisement Modal Popup */}
      {showAdPopup && activeAd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            onClick={() => {
              if (canCloseAd) {
                setShowAdPopup(false);
                localStorage.setItem(`ryvo_ad_seen_${activeAd.id}`, 'true');
              }
            }} 
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm transition-opacity"
          ></div>
          
          <div className="bg-white dark:bg-[#121622] rounded-3xl overflow-hidden shadow-2xl w-full max-w-lg border border-slate-150 dark:border-[var(--border-dark)] relative animate-in fade-in zoom-in-95 duration-300 flex flex-col">
            
            {/* Countdown / Status Indicator Badge */}
            {!canCloseAd && adCloseSecondsLeft > 0 && (
              <div className="absolute top-4 left-4 z-10 bg-slate-950/85 text-white px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider font-mono shadow-md flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                <span>{language === 'ar' ? `انتظر ${adCloseSecondsLeft} ثوانٍ` : `Wait ${adCloseSecondsLeft}s`}</span>
              </div>
            )}

            {/* Close Button */}
            {canCloseAd && (
              <button 
                onClick={() => {
                  setShowAdPopup(false);
                  localStorage.setItem(`ryvo_ad_seen_${activeAd.id}`, 'true');
                }}
                className="absolute top-4 right-4 z-10 p-2.5 rounded-full bg-slate-950/80 text-white hover:bg-slate-950 hover:scale-105 transition-all shadow-md cursor-pointer"
              >
                <XIcon />
              </button>
            )}

            {/* Media Area */}
            <a 
              href={activeAd.clickUrl || '#'} 
              onClick={(e) => {
                if (!activeAd.clickUrl) {
                  e.preventDefault();
                } else {
                  localStorage.setItem(`ryvo_ad_seen_${activeAd.id}`, 'true');
                  setShowAdPopup(false);
                }
              }}
              target={activeAd.clickUrl?.startsWith('http') ? '_blank' : '_self'}
              className="relative aspect-[4/3] sm:aspect-video w-full overflow-hidden block group"
            >
              {activeAd.type === 'video' ? (
                <video 
                  src={activeAd.mediaUrl} 
                  autoPlay 
                  loop 
                  muted 
                  playsInline 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
              ) : (
                <img 
                  src={activeAd.mediaUrl} 
                  alt={language === 'ar' ? activeAd.title_ar : activeAd.title_en} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  referrerPolicy="no-referrer"
                />
              )}
              {activeAd.clickUrl && (
                <div className="absolute inset-0 bg-slate-950/20 group-hover:bg-slate-950/10 transition-colors flex items-center justify-center">
                  <span className="bg-white/95 text-slate-950 text-[10px] font-black tracking-wider uppercase px-4 py-2 rounded-full opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 shadow-lg">
                    {language === 'ar' ? 'اكتشف المزيد 🚀' : 'Explore Now 🚀'}
                  </span>
                </div>
              )}
            </a>

            {/* Ad Content Row */}
            <div className="p-5 text-center space-y-2 select-none">
              <h3 className="text-sm font-black text-slate-900 dark:text-white leading-snug">
                {language === 'ar' ? activeAd.title_ar : activeAd.title_en}
              </h3>
              {activeAd.clickUrl && (
                <div className="pt-2">
                  <a 
                    href={activeAd.clickUrl}
                    onClick={() => {
                      localStorage.setItem(`ryvo_ad_seen_${activeAd.id}`, 'true');
                      setShowAdPopup(false);
                    }}
                    target={activeAd.clickUrl.startsWith('http') ? '_blank' : '_self'}
                    className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-2xl text-xs font-black text-white hover:brightness-110 transition-all shadow-md"
                    style={{ backgroundColor: brandColor }}
                  >
                    <span>{language === 'ar' ? 'انقر للذهاب للعرض' : 'Click to View Offer'}</span>
                    <ArrowRight className="w-3.5 h-3.5 animate-bounce-horizontal" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Welcome Coupon FOMO Floating Card & Countdown Widget */}
      {welcomeCouponSession && welcomeCouponSecondsLeft > 0 && (() => {
        const pos = welcomeCouponSession.position || 'bottom-right';
        let posClasses = '';
        if (welcomeBarMinimized) {
          if (pos === 'bottom-left' || pos === 'top-left') {
            posClasses = 'bottom-[calc(76px+max(8px,env(safe-area-inset-bottom)))] md:bottom-6 left-4 md:left-6';
          } else {
            posClasses = 'bottom-[calc(76px+max(8px,env(safe-area-inset-bottom)))] md:bottom-6 right-4 md:right-6';
          }
        } else {
          if (pos === 'bottom-left') {
            posClasses = 'bottom-[calc(76px+max(8px,env(safe-area-inset-bottom)))] md:bottom-6 left-4 md:left-6 md:w-96 p-4 sm:p-0';
          } else if (pos === 'top-right') {
            posClasses = 'top-24 right-4 md:right-6 md:w-96 p-4 sm:p-0';
          } else if (pos === 'top-left') {
            posClasses = 'top-24 left-4 md:left-6 md:w-96 p-4 sm:p-0';
          } else if (pos === 'bottom-bar') {
            posClasses = 'bottom-[calc(68px+max(8px,env(safe-area-inset-bottom)))] md:bottom-0 left-0 right-0 w-full p-0 rounded-none z-45';
          } else {
            posClasses = 'bottom-[calc(76px+max(8px,env(safe-area-inset-bottom)))] md:bottom-6 right-4 md:right-6 md:w-96 p-4 sm:p-0';
          }
        }

        const handleTrackClick = () => {
          fetch('/api/welcome-coupon/track-click', { method: 'POST' }).catch(() => {});
        };

        const activeMsg = language === 'ar' 
          ? (welcomeCouponSession.messageAr || 'يسعدنا تقديم خصم ترحيبي حصري مطبق تلقائياً في سلة مشترياتك!')
          : language === 'fr'
            ? (welcomeCouponSession.messageFr || 'Bienvenue ! Nous sommes ravis de vous offrir une réduction exclusive appliquée automatiquement au paiement.')
            : (welcomeCouponSession.messageEn || 'We are pleased to offer you an exclusive welcome discount automatically applied at checkout!');

        const activeCta = language === 'ar'
          ? (welcomeCouponSession.ctaTextAr || 'اشتري الآن واستفد من الخصم 🛍️')
          : language === 'fr'
            ? (welcomeCouponSession.ctaTextFr || 'Achetez et économisez 🛍️')
            : (welcomeCouponSession.ctaTextEn || 'Checkout & Save Now 🛍️');

        return (
          <div className={`fixed z-45 transition-all duration-300 ${posClasses}`}>
            {welcomeBarMinimized ? (
              /* Minimized Golden Pill */
              <button
                onClick={() => {
                  setWelcomeBarMinimized(false);
                  handleTrackClick();
                }}
                style={{ backgroundColor: welcomeCouponSession.timerColor || '#f59e0b' }}
                className="flex items-center gap-2 px-4 py-2.5 text-slate-950 font-black rounded-full shadow-lg shadow-amber-500/35 hover:scale-105 active:scale-95 transition-all text-xs border border-amber-400"
              >
                <span className="animate-pulse">🎁</span>
                <span>
                  {language === 'ar' ? 'خصم الترحيب الحصري' : 'Exclusive Welcome Discount'}
                </span>
                <span className="font-mono bg-slate-950/20 px-2 py-0.5 rounded-full text-[10px]">
                  {(() => {
                    const mins = Math.floor(welcomeCouponSecondsLeft / 60);
                    const secs = welcomeCouponSecondsLeft % 60;
                    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                  })()}
                </span>
              </button>
            ) : (
              /* Fully Expanded Elegant Card */
              <div 
                style={{ backgroundColor: welcomeCouponSession.cardColor || '#0f172a' }}
                className={`text-white p-5 border shadow-2xl relative overflow-hidden transition-all duration-300 ${
                  pos === 'bottom-bar' ? 'rounded-none border-t border-amber-500/30 w-full' : 'rounded-3xl border-amber-500/30'
                }`}
              >
                {/* Gold decorative border top */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600"></div>
                
                {/* Header with Title and Minimize */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎁</span>
                    <span 
                      style={{ color: welcomeCouponSession.timerColor || '#f59e0b' }}
                      className="font-black text-xs uppercase tracking-wider"
                    >
                      {language === 'ar' ? 'هدية ترحيبية خاصة ومطبقة تلقائياً!' : 'Welcome Gift Applied Automatically!'}
                    </span>
                  </div>
                  {welcomeCouponSession.allowMinimize !== false && (
                    <button 
                      onClick={() => setWelcomeBarMinimized(true)}
                      className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all text-xs"
                      title={language === 'ar' ? 'تصغير' : 'Minimize'}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Message */}
                <p className="text-[11px] text-slate-300 font-medium leading-relaxed mb-4">
                  {activeMsg}
                </p>

                {/* Promo details grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {/* Coupon Code Block */}
                  <div className="bg-slate-950/40 rounded-2xl p-3 border border-slate-800/80 flex flex-col justify-between gap-1.5">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">
                      {language === 'ar' ? 'كود الكوبون (للنسخ)' : 'Coupon Code (Copyable)'}
                    </span>
                    <div className="flex items-center justify-between gap-1.5">
                      <span 
                        style={{ color: welcomeCouponSession.timerColor || '#f59e0b' }}
                        className="font-mono font-black text-sm tracking-wider"
                      >
                        {welcomeCouponSession.code}
                      </span>
                      <button
                        onClick={() => {
                          handleTrackClick();
                          navigator.clipboard.writeText(welcomeCouponSession.code).then(() => {
                            setWelcomeBarCopied(true);
                            triggerToast(language === 'ar' ? '📋 تم نسخ الكود بنجاح!' : '📋 Code copied successfully!');
                            setTimeout(() => setWelcomeBarCopied(false), 2000);
                          });
                        }}
                        style={{ color: welcomeCouponSession.timerColor || '#f59e0b', borderColor: (welcomeCouponSession.timerColor || '#f59e0b') + '20' }}
                        className="p-1.5 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer bg-white/5 hover:bg-white/10 border"
                      >
                        {welcomeBarCopied ? (language === 'ar' ? 'تم نسخ' : 'Copied') : (language === 'ar' ? 'نسخ' : 'Copy')}
                      </button>
                    </div>
                  </div>

                  {/* Live Countdown Block */}
                  {welcomeCouponSession.showTimer !== false ? (
                    <div 
                      style={{ borderColor: (welcomeCouponSession.timerColor || '#f59e0b') + '30' }}
                      className="bg-white/5 rounded-2xl p-3 border flex flex-col justify-between gap-1"
                    >
                      <span 
                        style={{ color: welcomeCouponSession.timerColor || '#f59e0b' }}
                        className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-1"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                        <span>{language === 'ar' ? 'ينتهي الخصم خلال:' : 'Discount Expires In:'}</span>
                      </span>
                      <div 
                        style={{ color: welcomeCouponSession.timerColor || '#f59e0b' }}
                        className="font-mono font-black text-xl tracking-wider text-center py-0.5"
                      >
                        {(() => {
                          const mins = Math.floor(welcomeCouponSecondsLeft / 60);
                          const secs = welcomeCouponSecondsLeft % 60;
                          return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white/5 rounded-2xl p-3 border border-slate-800/80 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center leading-relaxed">
                        ✨ {language === 'ar' ? 'عرض ترويجي محدود' : 'Limited Time Special'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Status footer with Checkout CTA button */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-900">
                  <div className="text-[9px] text-slate-400 font-bold flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>
                      {language === 'ar' 
                        ? `تم تطبيق خصم بقيمة ${welcomeCouponSession.discountPercent}% تلقائياً!` 
                        : `${welcomeCouponSession.discountPercent}% Discount applied automatically!`}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      handleTrackClick();
                      setIsCheckoutOpen(true);
                    }}
                    style={{ backgroundColor: welcomeCouponSession.timerColor || '#f59e0b' }}
                    className="px-3 py-1.5 text-slate-950 font-black rounded-xl text-[10px] transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-md"
                  >
                    {activeCta}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {toastMessage && (
        <div className="fixed bottom-[calc(76px+max(8px,env(safe-area-inset-bottom)))] md:bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-slate-900/95 dark:bg-white/95 text-white dark:text-slate-900 px-6 py-3.5 rounded-2xl shadow-xl font-bold text-xs flex items-center gap-2 border border-slate-700/50 dark:border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <span>🔔</span>
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-75 font-bold cursor-pointer">✕</button>
        </div>
      )}

      {/* Pre-Launch Purchase Guard Modal */}
      <PrelaunchModal
        isOpen={showPrelaunchModal}
        onClose={() => setShowPrelaunchModal(false)}
        storeSettings={storeSettings}
        isRtl={isRtl}
      />

      </Suspense>

    </div>
    </ConfirmationProvider>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}
