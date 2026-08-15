import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Copy, Check, Video, Wand2, Layers, Sliders, Play, Volume2, Globe, 
  Target, Music, Package, Type, RefreshCw, Zap, Settings, ShieldCheck, ArrowRight, CornerRightDown
} from 'lucide-react';
import { Product, Language } from '../../types';
import { 
  VideoCreateParams, VideoPlatform, VideoDuration, VideoAspectRatio, 
  VideoLanguage, VideoStyle, VideoResolution, SceneSpeed, AdvancedVideoOptions, 
  AdTone, TargetAudienceRegion, CallToAction, VideoProductInput 
} from '../../types/videoStudio';
import { AVAILABLE_PROVIDERS, buildMasterPrompt } from '../../services/videoProviders';

interface VideoCreationFormProps {
  products: Product[];
  currentLanguage: Language;
  onSubmit: (params: VideoCreateParams) => void;
  isGenerating: boolean;
  onEnhancePrompt?: (prompt: string, params: Partial<VideoCreateParams>) => Promise<string>;
}

export const VideoCreationForm: React.FC<VideoCreationFormProps> = ({
  products,
  currentLanguage,
  onSubmit,
  isGenerating,
  onEnhancePrompt
}) => {
  const isRtl = currentLanguage === 'ar';

  // Section 1: Prompt
  const [prompt, setPrompt] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Section 2: Platform
  const [platform, setPlatform] = useState<VideoPlatform>('tiktok');

  // Section 3: Duration
  const [duration, setDuration] = useState<VideoDuration>('30s');

  // Section 4: Aspect Ratio
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('9:16');

  // Section 5: Language
  const [language, setLanguage] = useState<VideoLanguage>('ar');

  // Section 6: Video Style
  const [style, setStyle] = useState<VideoStyle>('luxury');

  // Section 7: Resolution
  const [resolution, setResolution] = useState<VideoResolution>('1080p');

  // Section 8: Scene Speed
  const [speed, setSpeed] = useState<SceneSpeed>('normal');

  // Section 9: Number of Videos (Variants)
  const [variantCount, setVariantCount] = useState<number>(1);

  // Section 10: Advanced Options
  const [options, setOptions] = useState<AdvancedVideoOptions>({
    voiceOver: true,
    autoCaptions: true,
    backgroundMusic: true,
    soundEffects: true,
    cameraMovement: true,
    motionBlur: true,
    transitions: true,
    colorGrading: true,
    subtitles: true,
    logoWatermark: true,
    autoCta: true,
    autoHashtags: true,
    autoSeo: true,
    thumbnail: true,
  });

  // Section 11: Ad Tone
  const [tone, setTone] = useState<AdTone>('luxury');

  // Section 12: Target Audience
  const [targetAudience, setTargetAudience] = useState<TargetAudienceRegion>('saudi_arabia');

  // Section 13: Product
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productDetails, setProductDetails] = useState<VideoProductInput>({
    name: '',
    price: 0,
    link: '',
    description: '',
    features: '',
    images: []
  });

  // Section 14: CTA
  const [cta, setCta] = useState<CallToAction>('shop_now');

  // Section 15 & 16: Provider Selection
  const [providerId, setProviderId] = useState<string>('gemini-veo');

  // Auto-fill product when user picks from dropdown
  useEffect(() => {
    if (selectedProductId) {
      const p = products.find(prod => prod.id === selectedProductId);
      if (p) {
        setProductDetails({
          name: isRtl ? p.name_ar : p.name_en,
          price: p.price,
          link: `/product/${p.id}`,
          description: isRtl ? p.description_ar : p.description_en,
          features: isRtl ? p.features_ar : p.features_en,
          images: [p.image, ...(p.additional_images || [])],
          videos: p.video_url ? [p.video_url] : []
        });

        // Set default prompt if empty
        if (!prompt) {
          setPrompt(
            isRtl 
              ? `إعلان سينمائي فاخر لمنتج ${p.name_ar} إبراز ألياف الكربون الفاخرة والأداء العالي في الرياض.`
              : `Create a cinematic luxury commercial for ${p.name_en} showcasing carbon fiber features and elite road speed.`
          );
        }
      }
    }
  }, [selectedProductId, products, isRtl]);

  // Construct current parameters
  const currentCreateParams: VideoCreateParams = {
    prompt,
    platform,
    duration,
    aspectRatio,
    language,
    style,
    resolution,
    speed,
    variantCount,
    options,
    tone,
    targetAudience,
    product: productDetails.name ? productDetails : undefined,
    cta,
    providerId
  };

  const masterPromptText = buildMasterPrompt(currentCreateParams);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(masterPromptText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleEnhanceWithAi = async () => {
    if (!prompt) return;
    setIsEnhancing(true);
    try {
      if (onEnhancePrompt) {
        const enhanced = await onEnhancePrompt(prompt, currentCreateParams);
        if (enhanced) setPrompt(enhanced);
      } else {
        // Fallback enhancement
        setPrompt(
          isRtl
            ? `[مشهد سينمائي خارق 8K]: إعلان احترافي عالي الدقة يبرز ${productDetails.name || prompt}. إضاءة استوديو ثلاثية الأبعاد، تصوير بكاميرا درون سريعة بارتفاع متدرج، كواد كابشر لامتصاص الاهتزازات مع توجيه صوتي حماسي وموسيقى تصويرية تصاعدية.`
            : `[8K CINEMATIC MASTERPIECE]: High-energy commercial reel for ${productDetails.name || prompt}. Hyper-realistic volumetric studio lighting, 60fps drone camera tracking over sunset roads, carbon fiber highlights with energetic voiceover narration.`
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    onSubmit(currentCreateParams);
  };

  const toggleOption = (key: keyof AdvancedVideoOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <form onSubmit={handleSubmitForm} className="space-y-8 text-slate-100">
      
      {/* HEADER BAR & PROVIDER SELECTOR */}
      <div className="bg-slate-900/80 border border-emerald-500/20 rounded-2xl p-6 backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
            <Video className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-white via-emerald-200 to-emerald-400 bg-clip-text text-transparent">
              {isRtl ? 'استوديو إنشاء فيديو الذكاء الاصطناعي (AI Video Studio)' : 'AI Video Creation Studio'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isRtl 
                ? 'نظام هندسي متكامل لإنشاء إعلانات سينمائية ودعامية مع طبقة محولات المزود (Provider Adapter)' 
                : 'Enterprise visual production studio with Multi-Provider AI Engine Adapters'}
            </p>
          </div>
        </div>

        {/* PROVIDER SELECTOR */}
        <div className="flex items-center gap-2 bg-slate-950/70 p-2 rounded-xl border border-slate-800">
          <Zap className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-medium text-slate-300">
            {isRtl ? 'المزود (Engine):' : 'AI Engine:'}
          </span>
          <select 
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="bg-slate-900 text-xs font-semibold text-emerald-300 border border-emerald-500/30 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer"
          >
            {AVAILABLE_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SECTION 1: VIDEO DESCRIPTION / PROMPT */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-lg hover:border-slate-700 transition">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold flex items-center gap-2 text-slate-200">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">1</span>
            {isRtl ? 'وصف الفيديو (Video Prompt)' : 'Video Description Prompt'}
          </label>
          <button
            type="button"
            onClick={handleEnhanceWithAi}
            disabled={isEnhancing || !prompt}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 transition disabled:opacity-50"
          >
            <Wand2 className={`w-3.5 h-3.5 ${isEnhancing ? 'animate-spin' : ''}`} />
            {isEnhancing 
              ? (isRtl ? 'جاري التحسين...' : 'Enhancing...') 
              : (isRtl ? 'تحسين الوصف بالذكاء الاصطناعي' : 'AI Enhance Prompt')}
          </button>
        </div>

        <textarea
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={isRtl 
            ? 'اكتب وصف الفيديو هنا... مثال: إعلان سينمائي فاخر لدراجة هوائية مصنعة من ألياف الكربون تسير بروعة وقت الغروب بالرياض...' 
            : 'Create a cinematic motorcycle advertisement showcasing carbon fiber velocity in Riyadh under sunset rays...'}
          className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition leading-relaxed resize-y"
        />
        <div className="flex justify-between items-center text-[11px] text-slate-500 mt-2">
          <span>{isRtl ? 'يدعم اللغة العربية والإنجليزية بدون حد للأحرف' : 'Supports English & Arabic with unlimited characters'}</span>
          <span>{prompt.length} {isRtl ? 'حرف' : 'chars'}</span>
        </div>
      </div>

      {/* SECTION 13: PRODUCT SELECTOR & AUTO-FILL */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-lg">
        <label className="text-sm font-semibold flex items-center gap-2 text-slate-200 mb-4">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">2</span>
          <Package className="w-4 h-4 text-emerald-400" />
          {isRtl ? 'ربط منتج من المتجر (تعبئة تلقائية للبيانات)' : 'Product Integration & Autofill'}
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">{isRtl ? 'اختر منتجاً من كتالوج المتجر:' : 'Select Product from Catalog:'}</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
            >
              <option value="">{isRtl ? '-- اختيار منتج (اختياري) --' : '-- Choose Product (Optional) --'}</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {isRtl ? p.name_ar : p.name_en} - (${p.price})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">{isRtl ? 'اسم المنتج:' : 'Product Name:'}</label>
            <input
              type="text"
              value={productDetails.name}
              onChange={(e) => setProductDetails({ ...productDetails, name: e.target.value })}
              placeholder={isRtl ? 'اسم المنتج في الإعلان' : 'Product name for video'}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
            />
          </div>
        </div>

        {productDetails.name && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/50 p-3 rounded-xl border border-slate-800 text-xs">
            <div>
              <span className="text-slate-500 block">{isRtl ? 'السعر:' : 'Price:'}</span>
              <span className="font-semibold text-emerald-400">${productDetails.price}</span>
            </div>
            <div>
              <span className="text-slate-500 block">{isRtl ? 'الرابط:' : 'Link:'}</span>
              <span className="font-mono text-slate-300 truncate block">{productDetails.link || '/store'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">{isRtl ? 'المميزات:' : 'Features:'}</span>
              <span className="text-slate-300 truncate block">{productDetails.features || 'Carbon fiber'}</span>
            </div>
          </div>
        )}
      </div>

      {/* SECTIONS 2, 3, 4, 5: PLATFORM, DURATION, ASPECT RATIO, LANGUAGE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* SECTION 2: PLATFORM */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            {isRtl ? 'المنصة المستهدفة' : 'Platform'}
          </label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as VideoPlatform)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="tiktok">TikTok</option>
            <option value="reels">Instagram Reels</option>
            <option value="shorts">YouTube Shorts</option>
            <option value="facebook_reels">Facebook Reels</option>
            <option value="snapchat">Snapchat Spotlight</option>
            <option value="x">X (Twitter Video)</option>
          </select>
        </div>

        {/* SECTION 3: DURATION */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            {isRtl ? 'مدة الفيديو' : 'Duration'}
          </label>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value as VideoDuration)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="10s">10 sec</option>
            <option value="15s">15 sec</option>
            <option value="20s">20 sec</option>
            <option value="30s">30 sec</option>
            <option value="45s">45 sec</option>
            <option value="60s">60 sec</option>
            <option value="90s">90 sec</option>
          </select>
        </div>

        {/* SECTION 4: ASPECT RATIO */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            {isRtl ? 'نسبة الأبعاد' : 'Aspect Ratio'}
          </label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as VideoAspectRatio)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="9:16">9:16 (Vertical Reels/TikTok)</option>
            <option value="16:9">16:9 (Landscape YouTube)</option>
            <option value="1:1">1:1 (Square Feed Post)</option>
            <option value="4:5">4:5 (Portrait Feed Post)</option>
          </select>
        </div>

        {/* SECTION 5: LANGUAGE */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-emerald-400" />
            {isRtl ? 'اللغة' : 'Language'}
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as VideoLanguage)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="ar">Arabic (العربية)</option>
            <option value="en">English</option>
            <option value="auto">Auto Detect (تلقائي)</option>
          </select>
        </div>

      </div>

      {/* SECTIONS 6, 7, 8, 9: STYLE, RESOLUTION, SPEED, VARIANT COUNT */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* SECTION 6: VIDEO STYLE */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            {isRtl ? 'أسلوب الفيديو (Style)' : 'Video Style'}
          </label>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as VideoStyle)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="luxury">Luxury (فاخر)</option>
            <option value="cinematic">Cinematic (سينمائي)</option>
            <option value="dark">Dark (غريب وداكن)</option>
            <option value="minimal">Minimal (بسيط أنيق)</option>
            <option value="modern">Modern (حديث)</option>
            <option value="action">Action (أكشن وسرعة)</option>
            <option value="pov">POV (من منظور الشخص)</option>
            <option value="product_showcase">Product Showcase (استعراض منتج)</option>
            <option value="lifestyle">Lifestyle (أسلوب حياة)</option>
            <option value="commercial">Commercial (إعلان تجاري)</option>
            <option value="epic">Epic (ملحمي)</option>
            <option value="funny">Funny (كوميدي)</option>
            <option value="asmr">ASMR (مؤثرات صوتية هادئة)</option>
            <option value="storytelling">Storytelling (سرد قصصي)</option>
            <option value="comparison">Comparison (مقارنة)</option>
            <option value="problem_solution">Problem → Solution (مشكلة وحل)</option>
            <option value="unboxing">Unboxing (فتح صندوق)</option>
            <option value="review">Review (تقييم)</option>
            <option value="tutorial">Tutorial (تعليمي)</option>
            <option value="behind_scenes">Behind The Scenes (كواليس)</option>
            <option value="viral">Viral (تريند سريع)</option>
            <option value="trending">Trending (مواكب للموضة)</option>
          </select>
        </div>

        {/* SECTION 7: QUALITY / RESOLUTION */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            {isRtl ? 'جودة الفيديو (Resolution)' : 'Quality Resolution'}
          </label>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as VideoResolution)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="720p">720P HD</option>
            <option value="1080p">1080P Full HD</option>
            <option value="2k">2K Quad HD</option>
            <option value="4k">4K Ultra HD</option>
            <option value="8k">8K Ultra Cinema</option>
          </select>
        </div>

        {/* SECTION 8: SCENE SPEED */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            {isRtl ? 'سرعة المشاهد (Scene Speed)' : 'Scene Pacing Speed'}
          </label>
          <select
            value={speed}
            onChange={(e) => setSpeed(e.target.value as SceneSpeed)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="slow">Slow (بطيء هادئ)</option>
            <option value="normal">Normal (عادي متوازن)</option>
            <option value="fast">Fast (سريع وديناميكي)</option>
            <option value="dynamic">Dynamic (متغير الإيقاع)</option>
          </select>
        </div>

        {/* SECTION 9: NUMBER OF VIDEOS */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            {isRtl ? 'عدد الفيديوهات المطلوبة' : 'Number of Videos'}
          </label>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setVariantCount(n)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                  variantCount === n
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-500/20'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* SECTIONS 11, 12, 14: TONE, TARGET AUDIENCE, CTA */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* SECTION 11: AD TONE */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            {isRtl ? 'نبرة الإعلان (Ad Tone)' : 'Ad Tone'}
          </label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as AdTone)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="luxury">Luxury (فخامة وحصرية)</option>
            <option value="premium">Premium (جودة عالية)</option>
            <option value="aggressive">Aggressive (مباشر قوي)</option>
            <option value="friendly">Friendly (ودود وقريب)</option>
            <option value="funny">Funny (مرح وكوميدي)</option>
            <option value="professional">Professional (احترافي مؤكد)</option>
            <option value="minimal">Minimal (مبسط ومؤثر)</option>
            <option value="emotional">Emotional (عاطفي وملهم)</option>
            <option value="motivational">Motivational (حماسي تشجيعي)</option>
            <option value="luxury_commercial">Luxury Commercial (إعلان نخبوي فاخر)</option>
          </select>
        </div>

        {/* SECTION 12: TARGET AUDIENCE */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            {isRtl ? 'الجمهور المستهدف (Region)' : 'Target Audience'}
          </label>
          <select
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value as TargetAudienceRegion)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="saudi_arabia">Saudi Arabia (المملكة العربية السعودية 🇸🇦)</option>
            <option value="gcc">GCC (دول الخليج العربي 🇦🇪 🇰🇼 🇶🇦 🇧🇭 🇴🇲)</option>
            <option value="middle_east">Middle East (الشرق الأوسط)</option>
            <option value="europe">Europe (أوروبا)</option>
            <option value="usa">USA & North America (أمريكا الشمالية)</option>
            <option value="global">Global (العالمي)</option>
          </select>
        </div>

        {/* SECTION 14: CTA */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            {isRtl ? 'دعوة لاتخاذ إجراء (Call To Action)' : 'Call To Action (CTA)'}
          </label>
          <select
            value={cta}
            onChange={(e) => setCta(e.target.value as CallToAction)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="shop_now">Shop Now (تسوق الآن)</option>
            <option value="order_now">Order Now (اطلب الآن)</option>
            <option value="learn_more">Learn More (معرفة المزيد)</option>
            <option value="limited_stock">Limited Stock (المخزون محدود)</option>
            <option value="visit_website">Visit Website (زُر موقعنا)</option>
            <option value="ride_beyond_limits">Ride Beyond Limits (انطلق بلا حدود)</option>
          </select>
        </div>

      </div>

      {/* SECTION 10: ADVANCED OPTIONS CHECKBOXES */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-lg">
        <label className="text-sm font-semibold text-slate-200 mb-4 block flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-400" />
          {isRtl ? 'خيارات متقدمة (Advanced Features)' : 'Advanced AI Video Features'}
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {[
            { key: 'voiceOver', labelAr: 'التعليق الصوتي', labelEn: 'Voice Over' },
            { key: 'autoCaptions', labelAr: 'كتابة تلقائية', labelEn: 'Auto Captions' },
            { key: 'backgroundMusic', labelAr: 'موسيقى خلفية', labelEn: 'Background Music' },
            { key: 'soundEffects', labelAr: 'مؤثرات صوتية', labelEn: 'Sound Effects' },
            { key: 'cameraMovement', labelAr: 'حركة الكاميرا', labelEn: 'Camera Motion' },
            { key: 'motionBlur', labelAr: 'ضبابية الحركة', labelEn: 'Motion Blur' },
            { key: 'transitions', labelAr: 'انتقالات احترافية', labelEn: 'Transitions' },
            { key: 'colorGrading', labelAr: 'تصحيح الألوان', labelEn: 'Color Grading' },
            { key: 'subtitles', labelAr: 'ترجمة حركية', labelEn: 'Kinetic Subtitles' },
            { key: 'logoWatermark', labelAr: 'العلامة المائية', labelEn: 'Logo Watermark' },
            { key: 'autoCta', labelAr: 'زر CTA تلقائي', labelEn: 'Auto CTA' },
            { key: 'autoHashtags', labelAr: 'هاشتاجات تلقائية', labelEn: 'Auto Hashtags' },
            { key: 'autoSeo', labelAr: 'تحسين SEO', labelEn: 'Auto SEO' },
            { key: 'thumbnail', labelAr: 'غلاف المصغرة', labelEn: 'Auto Thumbnail' },
          ].map((opt) => {
            const isChecked = options[opt.key as keyof AdvancedVideoOptions];
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => toggleOption(opt.key as keyof AdvancedVideoOptions)}
                className={`p-3 rounded-xl text-xs flex items-center justify-between border transition text-left ${
                  isChecked
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-semibold'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>{isRtl ? opt.labelAr : opt.labelEn}</span>
                <div className={`w-4 h-4 rounded flex items-center justify-center text-[10px] border ${
                  isChecked ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-bold' : 'border-slate-700'
                }`}>
                  {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 15: PROMPT PREVIEW WITH COPY */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 relative shadow-inner">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            {isRtl ? 'معاينة البرومبت النهائي (Prompt Preview)' : 'Prompt Preview'}
          </span>
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-emerald-400 bg-slate-900 px-3 py-1 rounded-lg border border-slate-800 transition"
          >
            {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {isCopied ? (isRtl ? 'تم النسخ!' : 'Copied!') : (isRtl ? 'نسخ البرومبت' : 'Copy Prompt')}
          </button>
        </div>

        <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto pr-2">
          {masterPromptText}
        </pre>
      </div>

      {/* SECTION 16: GENERATE BUTTON */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isGenerating || !prompt.trim()}
          className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-base shadow-xl shadow-emerald-500/25 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin text-slate-950" />
              <span>{isRtl ? 'جاري بدء عملية إنشاء الفيديو بالذكاء الاصطناعي...' : 'Initializing AI Video Generation Engine...'}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 text-slate-950 fill-slate-950" />
              <span>{isRtl ? 'إنشاء الفيديو الآن (Generate AI Video)' : 'Generate AI Video Now'}</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </div>

    </form>
  );
};
