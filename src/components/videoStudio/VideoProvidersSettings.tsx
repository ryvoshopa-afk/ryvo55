import React from 'react';
import { 
  Zap, ShieldCheck, CheckCircle2, AlertTriangle, Layers, Key, Server, Cpu, Globe, ArrowUpRight 
} from 'lucide-react';
import { AVAILABLE_PROVIDERS } from '../../services/videoProviders';
import { Language } from '../../types';

interface VideoProvidersSettingsProps {
  currentLanguage: Language;
}

export const VideoProvidersSettings: React.FC<VideoProvidersSettingsProps> = ({
  currentLanguage
}) => {
  const isRtl = currentLanguage === 'ar';

  return (
    <div className="space-y-6">
      
      {/* VENDOR LOCK-IN PROTECTION HEADER */}
      <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-6 backdrop-blur-xl shadow-xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-white via-emerald-200 to-emerald-400 bg-clip-text text-transparent">
              {isRtl ? 'نظام محولات الذكاء الاصطناعي (AI Provider Adapter Architecture)' : 'AI Provider Adapter Engine'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isRtl 
                ? 'الحماية الكاملة من ارتباط المزود الواحد (Vendor Lock-in). يمكنك التبديل بين أي محرك AI مستقبلاً بدون التعديل في كود لوحة التحكم.' 
                : 'Zero vendor lock-in modular architecture. Easily swap or chain AI video generation providers at runtime.'}
            </p>
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed font-mono">
          <span className="text-emerald-400 font-bold block mb-1">
            {isRtl ? '⚡ واجهة برمجة المزود الموحدة (Provider Interface):' : '⚡ Standard VideoProvider Interface:'}
          </span>
          <code>
            interface VideoProvider &#123;<br/>
            &nbsp;&nbsp;id: string;<br/>
            &nbsp;&nbsp;generate(params: VideoCreateParams): Promise&lt;VideoTask&gt;;<br/>
            &nbsp;&nbsp;getStatus(taskId: string): Promise&lt;VideoStatus&gt;;<br/>
            &nbsp;&nbsp;cancel(taskId: string): Promise&lt;boolean&gt;;<br/>
            &#125;
          </code>
        </div>
      </div>

      {/* PROVIDERS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {AVAILABLE_PROVIDERS.map((provider) => (
          <div
            key={provider.id}
            className={`bg-slate-900/80 border rounded-2xl p-6 shadow-xl space-y-4 transition ${
              provider.isDefault 
                ? 'border-emerald-500/40 bg-slate-900/90' 
                : 'border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${provider.isDefault ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-950 text-slate-300 border-slate-800'}`}>
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {provider.displayName}
                    {provider.isDefault && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500 text-slate-950 uppercase">
                        Default
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ID: <span className="font-mono text-emerald-400">{provider.id}</span>
                  </p>
                </div>
              </div>

              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {isRtl ? 'جاهز (Active)' : 'Active'}
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {provider.description}
            </p>

            {/* CAPABILITIES BADGES */}
            <div className="space-y-2 border-t border-slate-800/80 pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">{isRtl ? 'الدقة المدعومة:' : 'Supported Resolutions:'}</span>
                <span className="font-semibold text-slate-200 uppercase font-mono">
                  {provider.supportedResolutions.join(', ')}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">{isRtl ? 'الأبعاد المدعومة:' : 'Aspect Ratios:'}</span>
                <span className="font-semibold text-slate-200 font-mono">
                  {provider.supportedAspectRatios.join(', ')}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">{isRtl ? 'أقصى مدة معالجة:' : 'Max Duration:'}</span>
                <span className="font-semibold text-emerald-400 font-mono">
                  {provider.maxDurationSeconds}s
                </span>
              </div>
            </div>

          </div>
        ))}
      </div>

    </div>
  );
};
