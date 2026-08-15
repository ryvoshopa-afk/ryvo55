import React from 'react';
import { Product, Language } from '../types';
import { TRANSLATIONS } from '../constants/translations';
import { Star, Heart, Eye, ArrowLeftRight, Share2, Check } from 'lucide-react';
import { formatPrice } from '../utils/price';

interface ProductCardProps {
  product: Product;
  currentLanguage: Language;
  isFavorite: boolean;
  onFavoriteToggle: () => void;
  onViewDetails: () => void;
  onQuickAdd: () => void;
  onBuyNow?: () => void;
  key?: any;
}

export default function ProductCard({
  product,
  currentLanguage,
  isFavorite,
  onFavoriteToggle,
  onViewDetails,
  onQuickAdd,
  onBuyNow
}: ProductCardProps) {
  const t = TRANSLATIONS[currentLanguage];
  const isRtl = currentLanguage === 'ar';

  const [copied, setCopied] = React.useState(false);
  const [timeLeft, setTimeLeft] = React.useState({ hours: 4, minutes: 19, seconds: 45 });

  React.useEffect(() => {
    if (!product.is_featured) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        } else if (prev.hours > 0) {
          return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        } else {
          return { hours: 4, minutes: 19, seconds: 45 };
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [product.is_featured]);

  // Get translations based on language
  const name = currentLanguage === 'ar' ? product.name_ar : currentLanguage === 'fr' ? product.name_fr : product.name_en;
  const tag = currentLanguage === 'ar' ? product.tag_ar : currentLanguage === 'fr' ? product.tag_fr : product.tag_en;
  const categoryLabel = t[product.category] || product.category;

  // Calculate rating average and discount
  const ratingAvg = product.rating_count > 0 ? (product.rating_sum / product.rating_count).toFixed(1) : '5.0';
  const hasDiscount = product.is_featured || (product.supplier_profit_margin && product.supplier_profit_margin > 20);
  const originalPrice = hasDiscount ? Math.round(product.price * 1.22) : null;
  const discountPercent = originalPrice ? Math.round(((originalPrice - product.price) / originalPrice) * 100) : 0;

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const productUrl = `${window.location.origin}/product/${product.id}`;
    
    if (navigator.share) {
      navigator.share({
        title: name,
        text: `${isRtl ? 'تفقد هذا المنتج الرائع:' : 'Check out this awesome product:'} ${name}`,
        url: productUrl,
      })
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.log('Error sharing:', err);
        // Fallback copy if sharing canceled/failed
        navigator.clipboard.writeText(productUrl).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      });
    } else {
      navigator.clipboard.writeText(productUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div
      id={`product-card-${product.id}`}
      className="group bg-white dark:bg-[#121622] rounded-2xl overflow-hidden border border-slate-200 dark:border-[var(--border-dark)] shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col relative hover:border-slate-300 dark:hover:border-[var(--primary-color)]/50"
    >
      {/* Corner Tag/Badge & Discount Tag */}
      <div className={`absolute top-3 ${isRtl ? 'left-3' : 'right-3'} z-10 flex flex-col gap-1 items-end`}>
        {discountPercent > 0 && (
          <span className="px-2 py-0.5 text-[10px] font-black rounded-lg bg-[var(--primary-color)] text-white shadow-md">
            -{discountPercent}%
          </span>
        )}
        {tag && (
          <span className="px-2.5 py-1 text-[10px] font-black rounded-lg uppercase tracking-wider bg-slate-900/90 text-white dark:bg-slate-800/90 border border-white/10 shadow-md">
            {tag}
          </span>
        )}
      </div>

      {/* Product Image & Hover Action Overlay */}
      <div 
        onClick={onViewDetails}
        className="relative aspect-square w-full bg-slate-50 dark:bg-slate-900/60 overflow-hidden cursor-pointer flex items-center justify-center p-2"
      >
        <img
          src={product.image}
          alt={name}
          width={400}
          height={400}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="object-cover w-full h-full transform scale-100 group-hover:scale-105 transition-transform duration-700 rounded-xl"
        />

        {/* Quick Share / Copy Link Button */}
        <button
          id={`btn-card-share-${product.id}`}
          onClick={handleShare}
          className={`absolute top-3 ${isRtl ? 'right-3' : 'left-3'} z-10 p-2.5 rounded-full shadow-lg transition-all active:scale-90 flex items-center justify-center ${
            copied 
              ? 'bg-emerald-500 text-white animate-bounce' 
              : 'bg-white/90 hover:bg-white text-slate-800 dark:bg-slate-900/95 dark:hover:bg-slate-900 dark:text-slate-200 border border-slate-200/80 dark:border-slate-800/80 shadow-md'
          }`}
          title={isRtl ? 'مشاركة ونسخ الرابط 🔗' : 'Share & Copy Product Link 🔗'}
        >
          {copied ? <Check className="w-3.5 h-3.5 font-bold" /> : <Share2 className="w-3.5 h-3.5" />}
        </button>
        
        {/* Hover buttons overlay */}
        <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
          <button
            id={`btn-card-view-details-${product.id}`}
            onClick={(e) => { e.stopPropagation(); onViewDetails(); }}
            className="p-3 bg-white hover:bg-[var(--primary-color)] hover:text-white dark:bg-slate-800 dark:hover:bg-[var(--primary-color)] dark:hover:text-white text-slate-800 dark:text-slate-100 rounded-full shadow-lg hover:scale-110 active:scale-95 transition-all"
            title={t.view_details}
          >
            <Eye className="w-5 h-5" />
          </button>
          
          <button
            id={`btn-card-toggle-favorite-${product.id}`}
            onClick={(e) => { e.stopPropagation(); onFavoriteToggle(); }}
            className={`p-3 rounded-full shadow-lg hover:scale-110 active:scale-95 transition-all ${
              isFavorite ? 'bg-rose-500 text-white' : 'bg-white text-rose-500 dark:bg-slate-800 dark:hover:bg-rose-500/10 hover:bg-rose-50 border border-slate-200 dark:border-white/10'
            }`}
            title={t.favorites}
          >
            <Heart className="w-5 h-5" fill={isFavorite ? "currentColor" : "none"} />
          </button>
        </div>

        {/* Flash Deal Ticking Timer overlay for Featured Products */}
        {product.is_featured && (
          <div className="absolute bottom-2 left-2 right-2 bg-slate-900/90 backdrop-blur-md text-white px-2.5 py-1.5 rounded-xl flex items-center justify-between text-[10px] font-black tracking-wide border border-white/10 shadow-md">
            <span className="text-amber-400 animate-pulse flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              <span>{isRtl ? 'عرض فلاش محدود 🔥' : 'FLASH DEAL 🔥'}</span>
            </span>
            <span className="font-mono text-white tracking-widest">
              {String(timeLeft.hours).padStart(2, '0')}:{String(timeLeft.minutes).padStart(2, '0')}:{String(timeLeft.seconds).padStart(2, '0')}
            </span>
          </div>
        )}
      </div>

      {/* Content details */}
      <div className={`p-5 flex-1 flex flex-col justify-between ${isRtl ? 'text-right' : 'text-left'}`}>
        <div>
          {/* Category label */}
          <span className="text-[10px] uppercase tracking-widest font-black text-amber-500 dark:text-[var(--primary-color)] mb-1.5 block">
            {categoryLabel}
          </span>

          {/* Title */}
          <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base line-clamp-2 leading-snug group-hover:text-[var(--primary-color)] transition-colors mb-2">
            {name}
          </h3>

          {/* Rating stars & stock indicator */}
          <div className={`flex items-center gap-1.5 mb-3 text-xs ${isRtl ? 'flex-row-reverse justify-end' : 'flex-row'}`}>
            <div className="flex text-amber-400">
              <Star className="w-3.5 h-3.5 fill-current" />
            </div>
            <span className="font-bold text-slate-600 dark:text-slate-400">{ratingAvg}</span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className={`font-semibold ${product.stock > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
              {product.stock > 0 ? `${product.stock} ${t.stock_count}` : t.out_of_stock}
            </span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-slate-100 dark:border-white/10 pt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className={`flex flex-col ${isRtl ? 'items-end' : 'items-start'}`}>
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{t.price}</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-sans">
                  {formatPrice(product.price, currentLanguage)}
                </span>
                {originalPrice && (
                  <span className="text-xs text-slate-400 line-through font-normal">
                    {formatPrice(originalPrice, currentLanguage)}
                  </span>
                )}
              </div>
            </div>
            
            <span className={`text-[10px] font-bold px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800/80 ${product.stock > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
              {product.stock > 0 ? `${product.stock} ${t.stock_count}` : t.out_of_stock}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-1">
            {/* Add to Cart button */}
            <button
              id={`btn-card-quick-add-${product.id}`}
              onClick={onQuickAdd}
              disabled={product.stock === 0}
              className={`py-2.5 px-1 rounded-xl text-[11px] font-black cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                product.stock > 0
                  ? 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white border border-slate-200 dark:border-white/10 active:scale-95'
                  : 'bg-slate-50 dark:bg-[#0E1116] text-slate-400 dark:text-slate-600 border border-transparent cursor-not-allowed'
              }`}
              title={t.quick_add}
            >
              <span>🛒</span>
              <span>{isRtl ? 'السلة' : 'Add to Cart'}</span>
            </button>

            {/* Buy Now button */}
            <button
              id={`btn-card-buy-now-${product.id}`}
              onClick={onBuyNow}
              disabled={product.stock === 0}
              className={`py-2.5 px-1 rounded-xl text-[11px] font-black cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                product.stock > 0
                  ? 'bg-[var(--primary-color)] hover:brightness-110 text-white font-black shadow-sm active:scale-95'
                  : 'bg-slate-50 dark:bg-[#0E1116] text-slate-400 dark:text-slate-600 border border-transparent cursor-not-allowed'
              }`}
              title={t.buy_now}
            >
              <span>⚡</span>
              <span>{isRtl ? 'شراء الآن' : 'Buy Now'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
