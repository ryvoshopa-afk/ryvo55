import React, { useState, useEffect } from 'react';
import { 
  Video, Layers, Sparkles, Settings, RefreshCw, Check, Plus, Film, BookOpen, Clock 
} from 'lucide-react';
import { Product, Language } from '../../types';
import { VideoItem, VideoCreateParams } from '../../types/videoStudio';
import { VideoCreationForm } from './VideoCreationForm';
import { VideoProgressCard } from './VideoProgressCard';
import { VideoLibrary } from './VideoLibrary';
import { VideoQueueManager } from './VideoQueueManager';
import { VideoProvidersSettings } from './VideoProvidersSettings';
import { VideoPlayerModal } from './VideoPlayerModal';
import { smartFetch } from '../../utils/smartFetch';

interface AiVideoStudioContainerProps {
  products: Product[];
  currentLanguage: Language;
  triggerToast: (msg: string) => void;
}

type StudioTab = 'studio' | 'library' | 'queue' | 'settings';

export const AiVideoStudioContainer: React.FC<AiVideoStudioContainerProps> = ({
  products,
  currentLanguage,
  triggerToast
}) => {
  const isRtl = currentLanguage === 'ar';

  const [activeTab, setActiveTab] = useState<StudioTab>('studio');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [activeVideoTask, setActiveVideoTask] = useState<VideoItem | null>(null);
  const [selectedVideoModal, setSelectedVideoModal] = useState<VideoItem | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Load existing videos from server endpoint
  const fetchVideosList = async () => {
    setIsLoadingList(true);
    try {
      const res = await smartFetch('/api/ai/video/list');
      if (res && res.success && Array.isArray(res.videos)) {
        setVideos(res.videos);
      }
    } catch (err) {
      console.warn('Failed to fetch AI video list:', err);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchVideosList();
  }, []);

  // Polling active generation task if running
  useEffect(() => {
    if (!activeVideoTask || activeVideoTask.status === 'completed' || activeVideoTask.status === 'failed' || activeVideoTask.status === 'cancelled') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await smartFetch(`/api/ai/video/${activeVideoTask.id}`);
        if (res && res.success && res.video) {
          const updated: VideoItem = res.video;
          setActiveVideoTask(updated);

          // Update item in list
          setVideos(prev => prev.map(v => v.id === updated.id ? updated : v));

          if (updated.status === 'completed') {
            setIsGenerating(false);
            triggerToast(isRtl ? '✨ اكتمل إنشاء الفيديو بالذكاء الاصطناعي بنجاح!' : '✨ AI Video Generation Complete!');
            setSelectedVideoModal(updated);
            fetchVideosList();
          } else if (updated.status === 'failed') {
            setIsGenerating(false);
            triggerToast(isRtl ? '❌ فشلت عملية إنشاء الفيديو' : '❌ Video Generation Failed');
          }
        }
      } catch (err) {
        console.warn('Error polling video task:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeVideoTask, isRtl, triggerToast]);

  // Handle Video Creation Submission
  const handleCreateVideo = async (params: VideoCreateParams) => {
    setIsGenerating(true);
    try {
      const res = await smartFetch('/api/ai/video/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      if (res && res.success && res.video) {
        const newVideo: VideoItem = res.video;
        setActiveVideoTask(newVideo);
        setVideos(prev => [newVideo, ...prev]);
        triggerToast(isRtl ? '🚀 تم إضافة أمر إنشاء الفيديو إلى Queue بنجاح!' : '🚀 Video creation job queued!');
      } else {
        throw new Error(res?.error || 'Failed to create video task');
      }
    } catch (err: any) {
      setIsGenerating(false);
      triggerToast(err.message || (isRtl ? 'حدث خطأ أثناء الاتصال بالسيرفر' : 'Server connection error'));
    }
  };

  // Enhance prompt helper
  const handleEnhancePrompt = async (prompt: string, params: Partial<VideoCreateParams>): Promise<string> => {
    try {
      const res = await smartFetch('/api/ai/video/prompt-enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...params })
      });
      if (res && res.enhancedPrompt) {
        return res.enhancedPrompt;
      }
    } catch (err) {
      console.warn('Prompt enhance error:', err);
    }
    return prompt;
  };

  // Actions
  const handleDeleteVideo = async (id: string) => {
    try {
      await smartFetch(`/api/ai/video/${id}`, { method: 'DELETE' });
      setVideos(prev => prev.filter(v => v.id !== id));
      if (selectedVideoModal?.id === id) setSelectedVideoModal(null);
      if (activeVideoTask?.id === id) setActiveVideoTask(null);
      triggerToast(isRtl ? '🗑️ تم حذف الفيديو بنجاح' : '🗑️ Video deleted');
    } catch (err: any) {
      triggerToast(err.message || 'Error deleting video');
    }
  };

  const handleCancelTask = async (id: string) => {
    try {
      await smartFetch(`/api/ai/video/${id}/cancel`, { method: 'POST' });
      if (activeVideoTask?.id === id) {
        setActiveVideoTask(prev => prev ? { ...prev, status: 'cancelled' } : null);
        setIsGenerating(false);
      }
      fetchVideosList();
      triggerToast(isRtl ? '🛑 تم إلغاء المهمة' : '🛑 Task cancelled');
    } catch (err: any) {
      triggerToast(err.message || 'Error cancelling task');
    }
  };

  const handleRetryTask = async (id: string) => {
    try {
      const res = await smartFetch(`/api/ai/video/${id}/retry`, { method: 'POST' });
      if (res && res.video) {
        setActiveVideoTask(res.video);
        setIsGenerating(true);
        fetchVideosList();
        triggerToast(isRtl ? '🔄 تم إعادة تشغيل المهمة' : '🔄 Task restarted');
      }
    } catch (err: any) {
      triggerToast(err.message || 'Error retrying task');
    }
  };

  const handleDuplicateVideo = (video: VideoItem) => {
    setActiveTab('studio');
    triggerToast(isRtl ? '📋 تم نسخ إعدادات الفيديو إلى الاستوديو' : '📋 Settings copied to creation form');
  };

  const handlePublishVideo = (video: VideoItem) => {
    triggerToast(isRtl ? `🚀 تم تجهيز الفيديو للنشر على منصة ${video.platform.toUpperCase()}!` : `🚀 Prepared for ${video.platform.toUpperCase()} publishing!`);
  };

  const handleToggleFavorite = (id: string) => {
    setVideos(prev => prev.map(v => v.id === id ? { ...v, isFavorite: !v.isFavorite } : v));
    triggerToast(isRtl ? '❤️ تم تحديث المفضلة' : '❤️ Favorites updated');
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      
      {/* STUDIO MAIN NAVIGATION TABS */}
      <div className="flex bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 backdrop-blur-md shadow-lg overflow-x-auto">
        <button
          onClick={() => setActiveTab('studio')}
          className={`flex-1 min-w-[140px] py-3 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'studio'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>{isRtl ? 'استوديو الإنشاء' : 'Video Creator'}</span>
        </button>

        <button
          onClick={() => setActiveTab('library')}
          className={`flex-1 min-w-[140px] py-3 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'library'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>{isRtl ? 'مكتبة الفيديوهات' : 'AI Video Library'}</span>
          {videos.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-950 text-emerald-400 font-mono">
              {videos.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('queue')}
          className={`flex-1 min-w-[140px] py-3 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'queue'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>{isRtl ? 'طابور المعالجة' : 'Queue Manager'}</span>
          {isGenerating && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 min-w-[140px] py-3 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>{isRtl ? 'محركات الذكاء (Providers)' : 'AI Providers'}</span>
        </button>
      </div>

      {/* ACTIVE GENERATION PROGRESS CARD */}
      {activeVideoTask && activeVideoTask.status !== 'completed' && activeVideoTask.status !== 'cancelled' && (
        <VideoProgressCard
          video={activeVideoTask}
          currentLanguage={currentLanguage}
          onCancel={() => handleCancelTask(activeVideoTask.id)}
          onRetry={() => handleRetryTask(activeVideoTask.id)}
        />
      )}

      {/* TAB CONTENT */}
      {activeTab === 'studio' && (
        <VideoCreationForm
          products={products}
          currentLanguage={currentLanguage}
          onSubmit={handleCreateVideo}
          isGenerating={isGenerating}
          onEnhancePrompt={handleEnhancePrompt}
        />
      )}

      {activeTab === 'library' && (
        <VideoLibrary
          videos={videos}
          currentLanguage={currentLanguage}
          onSelectVideo={setSelectedVideoModal}
          onDeleteVideo={handleDeleteVideo}
          onDuplicateVideo={handleDuplicateVideo}
          onPublishVideo={handlePublishVideo}
          onToggleFavorite={handleToggleFavorite}
          onRefresh={fetchVideosList}
          isLoading={isLoadingList}
        />
      )}

      {activeTab === 'queue' && (
        <VideoQueueManager
          queueItems={videos}
          currentLanguage={currentLanguage}
          onCancelTask={handleCancelTask}
          onRetryTask={handleRetryTask}
          onSelectVideo={setSelectedVideoModal}
        />
      )}

      {activeTab === 'settings' && (
        <VideoProvidersSettings
          currentLanguage={currentLanguage}
        />
      )}

      {/* MODAL PLAYER */}
      {selectedVideoModal && (
        <VideoPlayerModal
          video={selectedVideoModal}
          currentLanguage={currentLanguage}
          onClose={() => setSelectedVideoModal(null)}
          onDelete={handleDeleteVideo}
          onDuplicate={handleDuplicateVideo}
          onPublish={handlePublishVideo}
          onToggleFavorite={handleToggleFavorite}
        />
      )}

    </div>
  );
};
