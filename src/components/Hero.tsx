import { Language } from '../types';
import { TRANSLATIONS } from '../constants/translations';
import { Sparkles, ArrowLeft, ArrowRight, ShieldCheck, Zap, RotateCcw } from 'lucide-react';
import { useState, useEffect } from 'react';

interface HeroProps {
  currentLanguage: Language;
  onShopClick: () => void;
  shopLogo?: string;
  heroSlides?: Array<{
    category: string;
    title_ar: string;
    title_en: string;
    title_fr: string;
    desc_ar: string;
    desc_en: string;
    desc_fr: string;
    bg: string;
    image: string;
  }> | null;
}

export default function Hero({ currentLanguage, onShopClick, shopLogo, heroSlides }: HeroProps) {
  const t = TRANSLATIONS[currentLanguage];
  const isRtl = currentLanguage === 'ar';

  const defaultSlides = [
    {
      category: t.bikes,
      title_ar: 'دراجات الكربون المجهزة للمستقبل 🚴‍♀️',
      title_en: 'Carbon Bikes Configured for Future Speeds 🚴‍♀️',
      title_fr: 'Vélos en Carbone Conçus pour le Futur 🚴‍♀️',
      desc_ar: 'قوة خفة الوزن المدهشة مع مكابح هيدروليكية وحماية إنسيابية لمغامرات جبلية وطرقات وعرة.',
      desc_en: 'Incredible lightweight performance with hydraulic brakes and streamlined protection for mountain and city cruising.',
      desc_fr: 'Performance légère incroyable avec freins hydrauliques et protection profilée pour la montagne et la ville.',
      bg: 'from-amber-500/20 to-orange-600/10',
      image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80'
    },
    {
      category: t.cars,
      title_ar: 'سيارات كوانتوم الكهربائية الذكية ⚡',
      title_en: 'Quantum Smart Electric Roadster ⚡',
      title_fr: 'Voitures Électriques Intelligentes Quantum ⚡',
      desc_ar: 'رفاهية كاملة مع دفع رباعي، ركن ذاتي ذكي، وحماية متكاملة تعزز سلامة السائقين.',
      desc_en: 'Complete luxury with AWD performance, autonomous parking, and fully integrated driver assist safety suites.',
      desc_fr: 'Luxe complet avec performance quatre roues motrices, stationnement autonome et assistance de sécurité.',
      bg: 'from-rose-500/10 to-purple-600/20',
      image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80'
    },
    {
      category: t.electronics,
      title_ar: 'أجهزة ذكية وساعات مصفحة ⌚',
      title_en: 'Armored Wearables & Smart Gadgets ⌚',
      title_fr: 'Montres Blindées et Gadgets Intelligents ⌚',
      desc_ar: 'مقاومة كاملة للمياه والضغوطات العالية مع شاشات ريتنا وتتبع حيوي متطور لمعدل الصحة.',
      desc_en: 'Military-grade water resistance, always-on Retina displays, and pro-active heart health monitoring.',
      desc_fr: 'Résistance à l\'eau de qualité militaire, écrans Retina toujours allumés et surveillance de la fréquence cardiaque.',
      bg: 'from-emerald-500/25 to-teal-600/10',
      image: 'https://images.unsplash.com/photo-1523275335684-87898b6baf30?auto=format&fit=crop&w=800&q=80'
    }
  ];

  const slides = heroSlides && heroSlides.length > 0 ? heroSlides : defaultSlides;

  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const slide = slides[activeSlide] || slides[0];
  const slideTitle = currentLanguage === 'ar' ? slide.title_ar : currentLanguage === 'fr' ? slide.title_fr : slide.title_en;
  const slideDesc = currentLanguage === 'ar' ? slide.desc_ar : currentLanguage === 'fr' ? slide.desc_fr : slide.desc_en;

  return (
    <div className={`relative overflow-hidden bg-white dark:bg-[#121622] rounded-3xl p-6 sm:p-12 mb-12 shadow-xs border border-slate-200 dark:border-[var(--border-dark)] transition-all duration-300`}>
      
      {/* Cyber Grid Pattern Overlay for Sleek Interface Theme */}
      <div className="absolute inset-0 opacity-[0.05] dark:opacity-15 pointer-events-none">
        <svg width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" stroke="var(--primary-color)" strokeWidth="1" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Background blobs */}
      <div className={`absolute top-0 right-0 w-96 h-96 bg-gradient-to-br ${slide.bg} rounded-full blur-3xl opacity-40 -mr-20 -mt-20 transition-all duration-1000`}></div>

      <div className="relative max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-12">
        
        {/* Texts */}
        <div className={`flex-1 space-y-6 ${isRtl ? 'text-right' : 'text-left'}`}>
          {shopLogo && (
            <div className="flex items-center gap-2 mb-2 animate-in fade-in duration-300">
              {shopLogo.startsWith('data:image') || shopLogo.includes('http') || shopLogo.includes('/') ? (
                <img src={shopLogo} alt="Logo" width={140} height={36} className="h-9 max-w-[140px] object-contain rounded-lg" referrerPolicy="no-referrer" />
              ) : (
                <span className="text-sm font-black tracking-widest text-[var(--primary-color)] uppercase font-sans">
                  {shopLogo}
                </span>
              )}
              <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">OFFICIAL BOUTIQUE</span>
            </div>
          )}

          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--primary-color)]/10 text-[var(--primary-color)] border border-[var(--primary-color)]/20 rounded-full text-xs font-bold uppercase tracking-widest w-fit">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{slide.category}</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black font-sans leading-[1.1] tracking-tight text-slate-900 dark:text-white transition-opacity duration-300">
            {slideTitle}
          </h1>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl transition-opacity duration-300">
            {slideDesc}
          </p>

          {/* Call to actions */}
          <div className="flex flex-wrap items-center gap-4 pt-4">
            <button
              id="hero-cta-shop"
              onClick={onShopClick}
              className="px-6 py-4 bg-[var(--primary-color)] hover:brightness-110 text-white font-black rounded-xl shadow-lg hover:shadow-red-500/20 active:scale-95 transition-all text-xs uppercase cursor-pointer"
            >
              {t.shop_now}
            </button>
            <div className="hidden sm:flex items-center gap-6 text-xs font-bold text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>100% Safe</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-[var(--primary-color)]" />
                <span>Lightning Shipping</span>
              </div>
            </div>
          </div>

          {/* Quick slider indicators */}
          <div className={`flex items-center gap-2 pt-6 ${isRtl ? 'justify-start' : 'justify-start'}`}>
            {slides.map((_, idx) => (
              <button
                key={`hero-slide-${idx}`}
                id={`btn-hero-slide-${idx}`}
                onClick={() => setActiveSlide(idx)}
                className="p-3 -m-1 flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] rounded-full"
                aria-label={`Slide ${idx + 1}`}
              >
                <span className={`h-2 rounded-full transition-all duration-300 ${
                  idx === activeSlide ? 'w-8 bg-[var(--primary-color)]' : 'w-2 bg-slate-300 dark:bg-slate-700'
                }`} />
              </button>
            ))}
          </div>

        </div>

        {/* Big picture preview */}
        <div className="flex-1 relative w-full max-w-md lg:max-w-xl flex items-center justify-center">
          <div className="relative group overflow-hidden rounded-3xl shadow-xl shadow-slate-900/10 aspect-video w-full bg-slate-200 dark:bg-slate-800">
            <img
              src={slide.image}
              alt="slide product showcase"
              width={600}
              height={400}
              loading="eager"
              fetchPriority="high"
              referrerPolicy="no-referrer"
              className="object-cover w-full h-full transform scale-100 group-hover:scale-105 transition-all duration-[2000ms]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent"></div>
          </div>
        </div>

      </div>

    </div>
  );
}
