import { VideoCreateParams, VideoItem, AIProviderConfig, GenerationStage } from '../../types/videoStudio';
import { VideoProvider, ScriptAndStoryboard } from './types';

// Default Providers Metadata
export const AVAILABLE_PROVIDERS: AIProviderConfig[] = [
  {
    id: 'gemini-veo',
    name: 'GeminiVeo',
    displayName: 'Google Gemini & Veo 2.0 (Official Engine)',
    description: 'High fidelity cinematic video generator powered by Google DeepMind Gemini & Veo models.',
    isAvailable: true,
    isDefault: true,
    supportedResolutions: ['720p', '1080p', '2k', '4k'],
    supportedAspectRatios: ['9:16', '16:9', '1:1', '4:5'],
    maxDurationSeconds: 90,
  },
  {
    id: 'runway-gen3',
    name: 'RunwayGen3',
    displayName: 'Runway Gen-3 Alpha (Adapter)',
    description: 'Hyper-realistic video generation with dynamic camera controls & photorealistic motion.',
    isAvailable: true,
    isDefault: false,
    supportedResolutions: ['720p', '1080p', '4k'],
    supportedAspectRatios: ['9:16', '16:9', '1:1'],
    maxDurationSeconds: 60,
  },
  {
    id: 'kling-v1.5',
    name: 'KlingAI',
    displayName: 'Kling AI 1.5 Pro (Adapter)',
    description: 'High-speed action and high frame rate 3D video generation.',
    isAvailable: true,
    isDefault: false,
    supportedResolutions: ['1080p', '2k', '4k'],
    supportedAspectRatios: ['9:16', '16:9', '1:1', '4:5'],
    maxDurationSeconds: 60,
  },
  {
    id: 'luma-dream',
    name: 'LumaDreamMachine',
    displayName: 'Luma Dream Machine (Adapter)',
    description: 'Ultra-fast lighting rendering and realistic physics video generation.',
    isAvailable: true,
    isDefault: false,
    supportedResolutions: ['720p', '1080p', '4k'],
    supportedAspectRatios: ['9:16', '16:9'],
    maxDurationSeconds: 30,
  },
  {
    id: 'mock-simulator',
    name: 'MockSandbox',
    displayName: 'RYVO Studio Render Simulator (Instant Sandbox)',
    description: 'Real-time client/server sandbox renderer for testing video scenes without API credits.',
    isAvailable: true,
    isDefault: false,
    supportedResolutions: ['720p', '1080p', '2k', '4k', '8k'],
    supportedAspectRatios: ['9:16', '16:9', '1:1', '4:5'],
    maxDurationSeconds: 90,
  }
];

// Helper to construct enriched prompts for AI providers
export function buildMasterPrompt(params: VideoCreateParams): string {
  const parts: string[] = [];

  parts.push(`[CORE CONCEPT]: ${params.prompt}`);
  parts.push(`[TARGET PLATFORM]: ${params.platform.toUpperCase()} vertical reel format.`);
  parts.push(`[VIDEO DURATION]: ${params.duration}`);
  parts.push(`[ASPECT RATIO]: ${params.aspectRatio}`);
  parts.push(`[VISUAL STYLE]: ${params.style} aesthetic with ${params.tone} marketing tone.`);
  parts.push(`[RESOLUTION]: ${params.resolution} high clarity.`);
  parts.push(`[SCENE PACING]: ${params.speed} scene velocity.`);
  parts.push(`[TARGET AUDIENCE]: ${params.targetAudience} region.`);
  parts.push(`[PRIMARY CTA]: ${params.cta}`);

  if (params.product) {
    parts.push(`[FEATURED PRODUCT]: "${params.product.name}" | Price: $${params.product.price}`);
    if (params.product.description) parts.push(`[PRODUCT DESC]: ${params.product.description}`);
    if (params.product.features) parts.push(`[PRODUCT FEATURES]: ${params.product.features}`);
  }

  const activeOpts: string[] = [];
  if (params.options.voiceOver) activeOpts.push('VoiceOver Studio Script');
  if (params.options.autoCaptions || params.options.subtitles) activeOpts.push('Animated Kinetic Subtitles');
  if (params.options.backgroundMusic) activeOpts.push('Rhythmic Backing Beat');
  if (params.options.soundEffects) activeOpts.push('Immersive Foley SFX');
  if (params.options.cameraMovement) activeOpts.push('Cinematic Drone/Parallax Motion');
  if (params.options.motionBlur) activeOpts.push('High-Speed Motion Blur');
  if (params.options.colorGrading) activeOpts.push('Pro Color Grade');
  if (params.options.logoWatermark) activeOpts.push('RYVO Watermark Branding');
  if (params.options.autoHashtags) activeOpts.push('Viral Hashtag Suite');

  if (activeOpts.length > 0) {
    parts.push(`[ENHANCEMENTS]: ${activeOpts.join(', ')}`);
  }

  return parts.join('\n');
}

// Base Provider implementation for Gemini/Veo Engine
export class GeminiVeoProvider implements VideoProvider {
  id = 'gemini-veo';
  config = AVAILABLE_PROVIDERS[0];

  async generate(params: VideoCreateParams): Promise<{ taskId: string; initialItem: VideoItem }> {
    const taskId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const masterPrompt = buildMasterPrompt(params);

    const initialItem: VideoItem = {
      id: taskId,
      prompt: params.prompt,
      enhancedPrompt: masterPrompt,
      provider: this.id,
      providerName: this.config.displayName,
      status: 'preparing',
      progress: 5,
      currentStepMessage: 'Preparing AI Video Pipeline & Allocating GPU resources...',
      duration: params.duration,
      resolution: params.resolution,
      aspectRatio: params.aspectRatio,
      language: params.language,
      style: params.style,
      tone: params.tone,
      platform: params.platform,
      targetAudience: params.targetAudience,
      cta: params.cta,
      productInfo: params.product,
      options: params.options,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      logs: [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString(),
          stage: 'preparing',
          message: 'Video creation job initialized with GeminiVeo engine.',
          type: 'info'
        }
      ]
    };

    return { taskId, initialItem };
  }

  async getStatus(taskId: string): Promise<Partial<VideoItem>> {
    return { id: taskId, updatedAt: new Date().toISOString() };
  }

  async cancel(taskId: string): Promise<boolean> {
    return true;
  }

  async downloadUrl(videoUrl: string, fileName: string): Promise<void> {
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

// Runway Gen-3 Adapter
export class RunwayProvider implements VideoProvider {
  id = 'runway-gen3';
  config = AVAILABLE_PROVIDERS[1];

  async generate(params: VideoCreateParams): Promise<{ taskId: string; initialItem: VideoItem }> {
    const taskId = `vid_rw_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const masterPrompt = buildMasterPrompt(params);

    const initialItem: VideoItem = {
      id: taskId,
      prompt: params.prompt,
      enhancedPrompt: masterPrompt,
      provider: this.id,
      providerName: this.config.displayName,
      status: 'preparing',
      progress: 5,
      currentStepMessage: 'Connecting to Runway Gen-3 Alpha Cloud cluster...',
      duration: params.duration,
      resolution: params.resolution,
      aspectRatio: params.aspectRatio,
      language: params.language,
      style: params.style,
      tone: params.tone,
      platform: params.platform,
      targetAudience: params.targetAudience,
      cta: params.cta,
      productInfo: params.product,
      options: params.options,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      logs: []
    };
    return { taskId, initialItem };
  }

  async getStatus(taskId: string): Promise<Partial<VideoItem>> {
    return { id: taskId, updatedAt: new Date().toISOString() };
  }

  async cancel(taskId: string): Promise<boolean> { return true; }
  async downloadUrl(videoUrl: string, fileName: string): Promise<void> {}
}

// Kling AI Adapter
export class KlingProvider implements VideoProvider {
  id = 'kling-v1.5';
  config = AVAILABLE_PROVIDERS[2];

  async generate(params: VideoCreateParams): Promise<{ taskId: string; initialItem: VideoItem }> {
    const taskId = `vid_kl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const masterPrompt = buildMasterPrompt(params);

    const initialItem: VideoItem = {
      id: taskId,
      prompt: params.prompt,
      enhancedPrompt: masterPrompt,
      provider: this.id,
      providerName: this.config.displayName,
      status: 'preparing',
      progress: 5,
      currentStepMessage: 'Dispatching payload to Kling AI 1.5 Pro rendering node...',
      duration: params.duration,
      resolution: params.resolution,
      aspectRatio: params.aspectRatio,
      language: params.language,
      style: params.style,
      tone: params.tone,
      platform: params.platform,
      targetAudience: params.targetAudience,
      cta: params.cta,
      productInfo: params.product,
      options: params.options,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      logs: []
    };
    return { taskId, initialItem };
  }

  async getStatus(taskId: string): Promise<Partial<VideoItem>> { return { id: taskId }; }
  async cancel(taskId: string): Promise<boolean> { return true; }
  async downloadUrl(videoUrl: string, fileName: string): Promise<void> {}
}

// Provider Factory
export class VideoProviderFactory {
  private static providers: Map<string, VideoProvider> = new Map();

  static register(provider: VideoProvider) {
    this.providers.set(provider.id, provider);
  }

  static getProvider(id?: string): VideoProvider {
    const targetId = id || 'gemini-veo';
    if (!this.providers.has(targetId)) {
      // Fallback to default GeminiVeo
      return new GeminiVeoProvider();
    }
    return this.providers.get(targetId)!;
  }

  static getAll(): AIProviderConfig[] {
    return AVAILABLE_PROVIDERS;
  }
}

// Register default providers
VideoProviderFactory.register(new GeminiVeoProvider());
VideoProviderFactory.register(new RunwayProvider());
VideoProviderFactory.register(new KlingProvider());
