import React from 'react';
import { Sparkles, RefreshCw, CheckCircle2, AlertCircle, Video, FileText, Image as ImageIcon, Music, Volume2, Film } from 'lucide-react';
import { VideoItem, GenerationStage } from '../../types/videoStudio';
import { Language } from '../../types';

interface VideoProgressCardProps {
  video: VideoItem;
  currentLanguage: Language;
  onCancel?: () => void;
  onRetry?: () => void;
}

const STAGES_ORDER: { stage: GenerationStage; labelAr: string; labelEn: string; icon: any }[] = [
  { stage: 'preparing', labelAr: 'تجهيز بيئة العمل', labelEn: 'Preparing...', icon: Video },
  { stage: 'writing_script', labelAr: 'كتابة السيناريو والحوار', labelEn: 'Writing Script...', icon: FileText },
  { stage: 'generating_storyboard', labelAr: 'إنشاء القصص المصورة', labelEn: 'Generating Storyboard...', icon: ImageIcon },
  { stage: 'creating_scenes', labelAr: 'تكوين مشاهد الفيديو', labelEn: 'Creating Scenes...', icon: Film },
  { stage: 'rendering_video', labelAr: 'معالجة الفيديو والرندر', labelEn: 'Rendering Video...', icon: RefreshCw },
  { stage: 'adding_voice', labelAr: 'إضافة التعليق الصوتي', labelEn: 'Adding Voice...', icon: Volume2 },
  { stage: 'adding_music', labelAr: 'مكساج الموسيقى والمؤثرات', labelEn: 'Adding Music...', icon: Music },
  { stage: 'finalizing', labelAr: 'الإنهاء وتضمين العلامة المائية', labelEn: 'Finalizing...', icon: Sparkles },
  { stage: 'completed', labelAr: 'اكتمل إنشاء الفيديو', labelEn: 'Complete', icon: CheckCircle2 }
];

export const VideoProgressCard: React.FC<VideoProgressCardProps> = ({
  video,
  currentLanguage,
  onCancel,
  onRetry
}) => {
  const isRtl = currentLanguage === 'ar';
  const isFailed = video.status === 'failed';
  const isCompleted = video.status === 'completed';

  const currentStageIndex = STAGES_ORDER.findIndex(s => s.stage === video.status);

  return (
    <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-6 backdrop-blur-xl shadow-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${isFailed ? 'bg-red-500/10 text-red-400 border border-red-500/30' : isCompleted ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-teal-500/10 text-teal-400 border border-teal-500/30'}`}>
            {isFailed ? <AlertCircle className="w-6 h-6 animate-pulse" /> : isCompleted ? <CheckCircle2 className="w-6 h-6" /> : <RefreshCw className="w-6 h-6 animate-spin" />}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              {isFailed 
                ? (isRtl ? 'فشلت عملية إنشاء الفيديو' : 'Generation Failed')
                : isCompleted 
                ? (isRtl ? 'تم إنشاء الفيديو بنجاح!' : 'Video Generation Complete!')
                : (isRtl ? 'جاري إنشاء الفيديو بالذكاء الاصطناعي...' : 'AI Video Generation in Progress...')}
            </h3>
            <p className="text-xs text-slate-400">
              ID: <span className="font-mono text-emerald-400">{video.id}</span> • {video.providerName}
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-2xl font-black text-emerald-400 font-mono">
            {video.progress}%
          </span>
        </div>
      </div>

      {/* PROGRESS BAR */}
      <div className="relative w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
        <div 
          className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 transition-all duration-500 relative"
          style={{ width: `${Math.max(5, video.progress)}%` }}
        >
          <div className="absolute inset-0 bg-white/20 animate-pulse" />
        </div>
      </div>

      {/* CURRENT STEP MESSAGE */}
      <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
        <span className="text-slate-300 font-medium">
          {video.currentStepMessage || (isRtl ? 'جاري تنفيذ خطوات الذكاء الاصطناعي...' : 'Executing AI pipeline steps...')}
        </span>
        {isFailed && onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/40 text-xs font-semibold transition cursor-pointer"
          >
            {isRtl ? 'إعادة المحاولة (Retry)' : 'Retry Generation'}
          </button>
        )}
      </div>

      {/* STAGE STEPPER */}
      <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5 pt-2">
        {STAGES_ORDER.filter(s => s.stage !== 'completed').map((stg, idx) => {
          const isDone = currentStageIndex > idx || isCompleted;
          const isCurrent = currentStageIndex === idx && !isCompleted && !isFailed;
          const Icon = stg.icon;

          return (
            <div 
              key={stg.stage}
              className={`p-2 rounded-xl border text-center flex flex-col items-center justify-center gap-1 transition ${
                isDone 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : isCurrent
                  ? 'bg-teal-500/20 border-teal-400 text-teal-300 animate-pulse shadow-lg'
                  : 'bg-slate-950/40 border-slate-800/60 text-slate-600'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isCurrent ? 'animate-bounce' : ''}`} />
              <span className="text-[10px] leading-tight font-medium hidden sm:block truncate w-full">
                {isRtl ? stg.labelAr : stg.labelEn}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
