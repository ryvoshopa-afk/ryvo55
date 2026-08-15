import { VideoCreateParams, VideoItem, GenerationStage, AIProviderConfig } from '../../types/videoStudio';

export interface VideoProvider {
  id: string;
  config: AIProviderConfig;
  generate(params: VideoCreateParams): Promise<{ taskId: string; initialItem: VideoItem }>;
  getStatus(taskId: string): Promise<Partial<VideoItem>>;
  cancel(taskId: string): Promise<boolean>;
  downloadUrl(videoUrl: string, fileName: string): Promise<void>;
}

export interface ScriptAndStoryboard {
  title: string;
  scriptAr: string;
  scriptEn: string;
  scenes: {
    sceneNumber: number;
    visualPrompt: string;
    narrationAr: string;
    narrationEn: string;
    cameraMovement: string;
    durationSeconds: number;
  }[];
  hashtags: string[];
  suggestedMusic: string;
}
