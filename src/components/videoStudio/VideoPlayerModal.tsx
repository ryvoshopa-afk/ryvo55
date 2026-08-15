import React, { useState } from 'react';
import { 
  X, Download, RefreshCw, CopyCheck, Trash2, Share2, Play, Pause, Volume2, 
  VolumeX, Sparkles, Check, CornerRightDown, Tag, Clock, Globe, ShieldCheck, Heart
} from 'lucide-react';
import { VideoItem } from '../../types/videoStudio';
import { Language } from '../../types';

interface VideoPlayerModalProps {
  video: VideoItem;
  currentLanguage: Language;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onRegenerate?: (video: VideoItem) => void;
  onDuplicate?: (video: VideoItem) => void;
  onPublish?: (video: VideoItem) => void;
  onToggleFavorite?: (id: string) => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  video,
  currentLanguage,
  onClose,
  onDelete,
  onRegenerate,
  onDuplicate,
  onPublish,
  onToggleFavorite
}) => {
  const isRtl = currentLanguage === 'ar';
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isCopiedScript, setIsCopiedScript] = useState(false);
  const [activeTab, setActiveTab] = useState<'video' | 'script' | 'prompt' | 'details'>('video');

  const videoRef = React.useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleCopyScript = () => {
    if (video.scriptText) {
      navigator.clipboard.writeText(video.scriptText);
      setIsCopiedScript(true);
      setTimeout(() => setIsCopiedScript(false), 2000);
    }
  };

  const handleDownloadVideo = () => {
    if (video.videoUrl) {
      const a = document.createElement('a');
      a.href = video.videoUrl;
      a.download = `ryvo_ai_video_${video.id}.mp4`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        
        {/* MODAL HEADER */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white truncate max-w-md">
                {video.productInfo?.name || video.prompt.substring(0, 45) + '...'}
              </h3>
              <p className="text-xs text-slate-400">
                {video.providerName} • {video.resolution} • {video.duration} • {video.aspectRatio}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onToggleFavorite && (
              <button
                onClick={() => onToggleFavorite(video.id)}
                className={`p-2 rounded-xl border transition ${
                  video.isFavorite
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                    : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                }`}
              >
                <Heart className={`w-4 h-4 ${video.isFavorite ? 'fill-rose-400' : ''}`} />
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* LEFT: VIDEO PLAYER PREVIEW */}
          <div className="md:col-span-7 flex flex-col items-center justify-center bg-slate-950 rounded-2xl p-4 border border-slate-800 relative group overflow-hidden min-h-[320px]">
            {video.videoUrl ? (
              <div className="relative w-full flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={video.videoUrl}
                  poster={video.thumbnailUrl}
                  autoPlay
                  loop
                  muted={isMuted}
                  playsInline
                  className="rounded-xl max-h-[420px] object-contain shadow-2xl"
                />

                {/* WATERMARK OVERLAY */}
                {video.options?.logoWatermark && (
                  <div className="absolute top-4 right-4 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-emerald-500/30 text-[11px] font-bold text-emerald-400 tracking-wider shadow-lg flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    RYVO STUDIO
                  </div>
                )}

                {/* PLAYER CONTROLS OVERLAY */}
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between bg-slate-950/80 backdrop-blur-md p-2 rounded-xl border border-slate-800 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={togglePlay} className="p-1.5 hover:text-emerald-400 transition">
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button onClick={toggleMute} className="p-1.5 hover:text-emerald-400 transition">
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center p-8">
                <p className="text-slate-500 text-xs">{isRtl ? 'لا يوجد ملف فيديو متاح' : 'No video file available'}</p>
              </div>
            )}
          </div>

          {/* RIGHT: TABS AND DETAILS */}
          <div className="md:col-span-5 flex flex-col justify-between space-y-4">
            
            {/* TAB SELECTOR */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setActiveTab('video')}
                className={`flex-1 py-1.5 rounded-lg font-medium transition ${activeTab === 'video' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'}`}
              >
                {isRtl ? 'الفيديو' : 'Video'}
              </button>
              <button
                onClick={() => setActiveTab('script')}
                className={`flex-1 py-1.5 rounded-lg font-medium transition ${activeTab === 'script' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'}`}
              >
                {isRtl ? 'السيناريو' : 'Script'}
              </button>
              <button
                onClick={() => setActiveTab('prompt')}
                className={`flex-1 py-1.5 rounded-lg font-medium transition ${activeTab === 'prompt' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'}`}
              >
                {isRtl ? 'البرومبت' : 'Prompt'}
              </button>
            </div>

            {/* TAB CONTENT */}
            <div className="flex-1 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 text-xs space-y-3 overflow-y-auto max-h-[260px]">
              {activeTab === 'script' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-emerald-400">{isRtl ? 'السيناريو والتعليق الصوتي:' : 'Voiceover & Script:'}</span>
                    <button
                      onClick={handleCopyScript}
                      className="text-[10px] text-slate-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      {isCopiedScript ? <Check className="w-3 h-3 text-emerald-400" /> : <CopyCheck className="w-3 h-3" />}
                      {isCopiedScript ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className="text-slate-300 whitespace-pre-wrap font-sans text-xs leading-relaxed">
                    {video.scriptText || (isRtl ? 'لم يتم توليد نص سيناريو منفصل.' : 'No script text generated.')}
                  </pre>
                </div>
              )}

              {activeTab === 'prompt' && (
                <div>
                  <span className="font-bold text-emerald-400 block mb-2">{isRtl ? 'الوصف الأصلي للمستخدم:' : 'Original Prompt:'}</span>
                  <p className="text-slate-300 mb-4 italic">"{video.prompt}"</p>
                  {video.enhancedPrompt && (
                    <>
                      <span className="font-bold text-teal-400 block mb-1">{isRtl ? 'البرومبت المحسن:' : 'Enhanced AI Prompt:'}</span>
                      <pre className="text-slate-400 font-mono text-[11px] whitespace-pre-wrap">
                        {video.enhancedPrompt}
                      </pre>
                    </>
                  )}
                </div>
              )}

              {(activeTab === 'video' || activeTab === 'details') && (
                <div className="space-y-2">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-500">{isRtl ? 'المنصة:' : 'Platform:'}</span>
                    <span className="font-semibold text-slate-200 capitalize">{video.platform}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-500">{isRtl ? 'الأسلوب:' : 'Style:'}</span>
                    <span className="font-semibold text-slate-200 capitalize">{video.style}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-500">{isRtl ? 'النبرة:' : 'Tone:'}</span>
                    <span className="font-semibold text-slate-200 capitalize">{video.tone}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-500">{isRtl ? 'الدقة:' : 'Resolution:'}</span>
                    <span className="font-semibold text-emerald-400">{video.resolution}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-500">{isRtl ? 'الجمهور:' : 'Audience:'}</span>
                    <span className="font-semibold text-slate-200 capitalize">{video.targetAudience}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">{isRtl ? 'وقت الإنشاء:' : 'Created At:'}</span>
                    <span className="text-slate-400">{new Date(video.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>

            {/* MAIN ACTIONS BAR */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={handleDownloadVideo}
                className="py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4" />
                <span>{isRtl ? 'تحميل الفيديو (Download)' : 'Download Video'}</span>
              </button>

              {onPublish && (
                <button
                  onClick={() => onPublish(video)}
                  className="py-2.5 px-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg"
                >
                  <Share2 className="w-4 h-4" />
                  <span>{isRtl ? 'نشر (Publish)' : 'Publish Video'}</span>
                </button>
              )}

              {onRegenerate && (
                <button
                  onClick={() => onRegenerate(video)}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{isRtl ? 'إعادة إنشاء (Regenerate)' : 'Regenerate'}</span>
                </button>
              )}

              {onDuplicate && (
                <button
                  onClick={() => onDuplicate(video)}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isRtl ? 'نسخ الإعدادات (Duplicate)' : 'Duplicate'}</span>
                </button>
              )}
            </div>

            {onDelete && (
              <button
                onClick={() => onDelete(video.id)}
                className="w-full py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isRtl ? 'حذف الفيديو (Delete Video)' : 'Delete Video'}</span>
              </button>
            )}

          </div>

        </div>

      </div>
    </div>
  );
};
