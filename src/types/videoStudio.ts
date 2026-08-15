export type VideoPlatform = 
  | 'tiktok' 
  | 'reels' 
  | 'shorts' 
  | 'facebook_reels' 
  | 'snapchat' 
  | 'x';

export type VideoDuration = '10s' | '15s' | '20s' | '30s' | '45s' | '60s' | '90s';

export type VideoAspectRatio = '9:16' | '16:9' | '1:1' | '4:5';

export type VideoLanguage = 'ar' | 'en' | 'auto';

export type VideoStyle = 
  | 'luxury' 
  | 'cinematic' 
  | 'dark' 
  | 'minimal' 
  | 'modern' 
  | 'action' 
  | 'pov' 
  | 'product_showcase' 
  | 'lifestyle' 
  | 'commercial' 
  | 'epic' 
  | 'funny' 
  | 'asmr' 
  | 'storytelling' 
  | 'comparison' 
  | 'problem_solution' 
  | 'unboxing' 
  | 'review' 
  | 'tutorial' 
  | 'behind_scenes' 
  | 'viral' 
  | 'trending';

export type VideoResolution = '720p' | '1080p' | '2k' | '4k' | '8k';

export type SceneSpeed = 'slow' | 'normal' | 'fast' | 'dynamic';

export type AdTone = 
  | 'luxury' 
  | 'premium' 
  | 'aggressive' 
  | 'friendly' 
  | 'funny' 
  | 'professional' 
  | 'minimal' 
  | 'emotional' 
  | 'motivational' 
  | 'luxury_commercial';

export type TargetAudienceRegion = 
  | 'saudi_arabia' 
  | 'gcc' 
  | 'middle_east' 
  | 'europe' 
  | 'usa' 
  | 'global';

export type CallToAction = 
  | 'shop_now' 
  | 'order_now' 
  | 'learn_more' 
  | 'limited_stock' 
  | 'visit_website' 
  | 'ride_beyond_limits';

export interface AdvancedVideoOptions {
  voiceOver: boolean;
  autoCaptions: boolean;
  backgroundMusic: boolean;
  soundEffects: boolean;
  cameraMovement: boolean;
  motionBlur: boolean;
  transitions: boolean;
  colorGrading: boolean;
  subtitles: boolean;
  logoWatermark: boolean;
  autoCta: boolean;
  autoHashtags: boolean;
  autoSeo: boolean;
  thumbnail: boolean;
}

export interface VideoProductInput {
  name: string;
  price: number;
  link: string;
  description: string;
  features: string;
  images: string[];
  videos?: string[];
}

export interface VideoCreateParams {
  prompt: string;
  platform: VideoPlatform;
  duration: VideoDuration;
  aspectRatio: VideoAspectRatio;
  language: VideoLanguage;
  style: VideoStyle;
  resolution: VideoResolution;
  speed: SceneSpeed;
  variantCount: number; // 1 to 5
  options: AdvancedVideoOptions;
  tone: AdTone;
  targetAudience: TargetAudienceRegion;
  product?: VideoProductInput;
  cta: CallToAction;
  providerId?: string; // e.g. 'gemini-veo', 'runway-gen3', 'kling-v1.5', 'luma-dream'
}

export type GenerationStage = 
  | 'preparing' 
  | 'writing_script' 
  | 'generating_storyboard' 
  | 'creating_scenes' 
  | 'rendering_video' 
  | 'adding_voice' 
  | 'adding_music' 
  | 'finalizing' 
  | 'completed' 
  | 'failed' 
  | 'queued' 
  | 'cancelled';

export interface GenerationStepProgress {
  stage: GenerationStage;
  messageAr: string;
  messageEn: string;
  percentage: number;
}

export interface VideoItem {
  id: string;
  prompt: string;
  enhancedPrompt?: string;
  provider: string; // Provider ID
  providerName: string;
  status: GenerationStage;
  progress: number;
  currentStepMessage?: string;
  duration: VideoDuration;
  resolution: VideoResolution;
  aspectRatio: VideoAspectRatio;
  language: VideoLanguage;
  style: VideoStyle;
  tone: AdTone;
  platform: VideoPlatform;
  targetAudience: TargetAudienceRegion;
  cta: CallToAction;
  productInfo?: VideoProductInput;
  options: AdvancedVideoOptions;
  
  thumbnailUrl?: string;
  videoUrl?: string;
  scriptText?: string;
  voiceoverAudioUrl?: string;
  
  createdAt: string;
  updatedAt: string;
  generationTimeMs?: number;
  costTokens?: number;
  estimatedCostUsd?: number;
  error?: string;
  
  isFavorite?: boolean;
  tags?: string[];
  logs?: VideoGenerationLog[];
}

export interface VideoGenerationLog {
  id: string;
  timestamp: string;
  stage: GenerationStage;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  metadata?: Record<string, any>;
}

export interface AIProviderConfig {
  id: string;
  name: string;
  displayName: string;
  description: string;
  isAvailable: boolean;
  isDefault: boolean;
  supportedResolutions: VideoResolution[];
  supportedAspectRatios: VideoAspectRatio[];
  maxDurationSeconds: number;
  iconName?: string;
}
