import React from 'react';
import { 
  Layers, RefreshCw, XCircle, CheckCircle2, AlertCircle, Play, Sparkles, Clock, Trash2 
} from 'lucide-react';
import { VideoItem } from '../../types/videoStudio';
import { Language } from '../../types';

interface VideoQueueManagerProps {
  queueItems: VideoItem[];
  currentLanguage: Language;
  onCancelTask: (id: string) => void;
  onRetryTask: (id: string) => void;
  onClearCompleted?: () => void;
  onSelectVideo?: (video: VideoItem) => void;
}

export const VideoQueueManager: React.FC<VideoQueueManagerProps> = ({
  queueItems,
  currentLanguage,
  onCancelTask,
  onRetryTask,
  onClearCompleted,
  onSelectVideo
}) => {
  const isRtl = currentLanguage === 'ar';

  const activeTasks = queueItems.filter(i => i.status !== 'completed' && i.status !== 'failed' && i.status !== 'cancelled');
  const finishedTasks = queueItems.filter(i => i.status === 'completed' || i.status === 'failed' || i.status === 'cancelled');

  return (
    <div className="space-y-6">
      
      {/* QUEUE SUMMARY HEADER */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-teal-500/10 text-teal-400 rounded-xl border border-teal-500/20">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-white via-emerald-200 to-emerald-400 bg-clip-text text-transparent">
              {isRtl ? 'نظام طابور المعالجة (AI Video Queue Manager)' : 'AI Video Background Queue'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isRtl 
                ? `يتم تنفيذ جميع عمليات الرندر الثقيلة في الخلفية (Background Workers) دون إيقاف السيرفر` 
                : `Heavy video rendering tasks process asynchronously in non-blocking background jobs`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">{isRtl ? 'مهام نشطة:' : 'Active Tasks:'} </span>
            <span className="font-bold text-emerald-400 font-mono ml-1">{activeTasks.length}</span>
          </div>

          {onClearCompleted && finishedTasks.length > 0 && (
            <button
              onClick={onClearCompleted}
              className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 text-xs font-semibold transition cursor-pointer"
            >
              {isRtl ? 'مسح المكتمل' : 'Clear Finished'}
            </button>
          )}
        </div>
      </div>

      {/* ACTIVE QUEUE ITEMS */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
          {isRtl ? 'المهام جاري معالجتها حالياً' : 'Active Processing Queue'}
        </h3>

        {activeTasks.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-8 text-center text-xs text-slate-500">
            {isRtl ? 'لا توجد مهام رندر في الانتظار حالياً.' : 'No active rendering jobs in queue.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {activeTasks.map((item, index) => (
              <div
                key={item.id}
                className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-5 shadow-lg space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center border border-emerald-500/30">
                      #{index + 1}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-white truncate max-w-md">
                        {item.productInfo?.name || item.prompt}
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        {item.providerName} • {item.platform} • {item.resolution}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black font-mono text-emerald-400">
                      {item.progress}%
                    </span>

                    <button
                      onClick={() => onCancelTask(item.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold transition cursor-pointer"
                    >
                      {isRtl ? 'إلغاء' : 'Cancel'}
                    </button>
                  </div>
                </div>

                {/* PROGRESS BAR */}
                <div className="relative w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                    style={{ width: `${Math.max(5, item.progress)}%` }}
                  />
                </div>

                <p className="text-[11px] text-slate-400 italic">
                  {item.currentStepMessage || (isRtl ? 'جاري معالجة الكادرات وتأثيرات الإضاءة...' : 'Processing keyframes and lighting effects...')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FINISHED QUEUE HISTORY */}
      {finishedTasks.length > 0 && (
        <div className="space-y-4 pt-4">
          <h3 className="text-sm font-bold text-slate-200">
            {isRtl ? 'سجل المهام المنتهية' : 'Completed & Past Queue Tasks'}
          </h3>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800">
            {finishedTasks.map((item) => (
              <div key={item.id} className="p-4 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  {item.status === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  )}
                  <div>
                    <span className="font-semibold text-slate-200 block truncate max-w-sm">
                      {item.productInfo?.name || item.prompt}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {item.providerName} • {new Date(item.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    item.status === 'completed'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {item.status}
                  </span>

                  {item.status === 'failed' && (
                    <button
                      onClick={() => onRetryTask(item.id)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-bold transition cursor-pointer"
                    >
                      {isRtl ? 'إعادة' : 'Retry'}
                    </button>
                  )}

                  {item.status === 'completed' && onSelectVideo && (
                    <button
                      onClick={() => onSelectVideo(item)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                    >
                      {isRtl ? 'عرض' : 'View'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
