import React, { useState } from 'react';
import { 
  Search, Filter, SortAsc, Play, Download, Trash2, Heart, Share2, Sparkles, 
  Grid, List, RefreshCw, Eye, Tag, Calendar, Clock, Video, Zap, CheckCircle2, AlertCircle
} from 'lucide-react';
import { VideoItem, VideoPlatform, VideoStyle } from '../../types/videoStudio';
import { Language } from '../../types';

interface VideoLibraryProps {
  videos: VideoItem[];
  currentLanguage: Language;
  onSelectVideo: (video: VideoItem) => void;
  onDeleteVideo: (id: string) => void;
  onDuplicateVideo: (video: VideoItem) => void;
  onPublishVideo: (video: VideoItem) => void;
  onToggleFavorite: (id: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const VideoLibrary: React.FC<VideoLibraryProps> = ({
  videos,
  currentLanguage,
  onSelectVideo,
  onDeleteVideo,
  onDuplicateVideo,
  onPublishVideo,
  onToggleFavorite,
  onRefresh,
  isLoading
}) => {
  const isRtl = currentLanguage === 'ar';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'favorites'>('newest');

  // Filter & Search Logic
  const filteredVideos = videos.filter(v => {
    const matchesSearch = 
      v.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.productInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.providerName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesPlatform = selectedPlatform === 'all' || v.platform === selectedPlatform;
    const matchesProvider = selectedProvider === 'all' || v.provider === selectedProvider;
    const matchesStatus = selectedStatus === 'all' || v.status === selectedStatus;

    return matchesSearch && matchesPlatform && matchesProvider && matchesStatus;
  });

  // Sort logic
  const sortedVideos = [...filteredVideos].sort((a, b) => {
    if (sortBy === 'favorites') {
      return (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
    }
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return sortBy === 'oldest' ? timeA - timeB : timeB - timeA;
  });

  return (
    <div className="space-y-6">
      
      {/* HEADER BAR WITH CONTROLS */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-white via-emerald-200 to-emerald-400 bg-clip-text text-transparent flex items-center gap-2">
              <Video className="w-5 h-5 text-emerald-400" />
              {isRtl ? 'مكتبة الفيديوهات (AI Video Library)' : 'AI Video Library'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {isRtl 
                ? `إجمالي ${videos.length} فيديو تم إنشاؤه عبر مختلف محركات الذكاء الاصطناعي` 
                : `Total ${videos.length} videos generated across all AI provider engines`}
            </p>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-emerald-400 transition cursor-pointer"
                title={isRtl ? 'تحديث المكتبة' : 'Refresh Library'}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            )}

            {/* VIEW MODE TOGGLE */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition ${viewMode === 'grid' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'}`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition ${viewMode === 'list' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* SEARCH AND FILTERS ROW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 pt-2">
          
          {/* SEARCH INPUT */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isRtl ? 'بحث في الوصف، اسم المنتج، أسلوب الفيديو...' : 'Search prompt, product name, style...'}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* FILTER: PLATFORM */}
          <div className="md:col-span-2">
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
            >
              <option value="all">{isRtl ? 'جميع المنصات' : 'All Platforms'}</option>
              <option value="tiktok">TikTok</option>
              <option value="reels">Instagram Reels</option>
              <option value="shorts">YouTube Shorts</option>
              <option value="snapchat">Snapchat</option>
              <option value="x">X (Twitter)</option>
            </select>
          </div>

          {/* FILTER: STATUS */}
          <div className="md:col-span-2">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
            >
              <option value="all">{isRtl ? 'جميع الحالات' : 'All Statuses'}</option>
              <option value="completed">{isRtl ? 'يكتمل' : 'Completed'}</option>
              <option value="queued">{isRtl ? 'في الانتظار' : 'Queued'}</option>
              <option value="failed">{isRtl ? 'فشل' : 'Failed'}</option>
            </select>
          </div>

          {/* SORT BY */}
          <div className="md:col-span-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
            >
              <option value="newest">{isRtl ? 'الأحدث أولاً' : 'Sort: Newest First'}</option>
              <option value="oldest">{isRtl ? 'الأقدم أولاً' : 'Sort: Oldest First'}</option>
              <option value="favorites">{isRtl ? 'المفضلة أولاً' : 'Sort: Favorites'}</option>
            </select>
          </div>

        </div>
      </div>

      {/* VIDEO GRID / LIST CONTAINER */}
      {sortedVideos.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-12 text-center space-y-3">
          <Video className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-300">
            {isRtl ? 'لم يتم العثور على فيديوهات' : 'No Videos Found'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {isRtl 
              ? 'قم بإنشاء فيديو جديد من قسم استوديو الإنشاء وسيظهر تلقائياً في مكتبتك.' 
              : 'Generate a new video using the creation studio and it will appear here.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {sortedVideos.map((video) => (
            <div
              key={video.id}
              className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden hover:border-emerald-500/40 transition-all duration-300 group shadow-lg flex flex-col justify-between"
            >
              {/* THUMBNAIL CONTAINER */}
              <div 
                onClick={() => onSelectVideo(video)}
                className="relative aspect-[9/16] max-h-[260px] bg-slate-950 cursor-pointer overflow-hidden flex items-center justify-center"
              >
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.prompt}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 flex items-center justify-center">
                    <Video className="w-10 h-10 text-slate-700" />
                  </div>
                )}

                {/* PLAY OVERLAY BUTTON */}
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="p-3 bg-emerald-500 text-slate-950 rounded-full shadow-xl transform group-hover:scale-110 transition-transform">
                    <Play className="w-6 h-6 fill-slate-950 ml-0.5" />
                  </div>
                </div>

                {/* TOP BADGES */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                  <span className="bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-800 text-[10px] font-bold text-slate-200 uppercase tracking-wider">
                    {video.platform}
                  </span>

                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border backdrop-blur-md ${
                    video.status === 'completed'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : video.status === 'failed'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-teal-500/20 text-teal-300 border-teal-500/40 animate-pulse'
                  }`}>
                    {video.status}
                  </span>
                </div>

                {/* BOTTOM BADGE FOR DURATION & QUALITY */}
                <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400">
                  {video.duration} • {video.resolution}
                </div>

                {/* FAVORITE BUTTON */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(video.id);
                  }}
                  className={`absolute bottom-3 right-3 p-2 rounded-xl border backdrop-blur-md transition ${
                    video.isFavorite
                      ? 'bg-rose-500/30 text-rose-400 border-rose-500/50'
                      : 'bg-slate-950/60 text-slate-400 hover:text-white border-slate-800'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${video.isFavorite ? 'fill-rose-400' : ''}`} />
                </button>
              </div>

              {/* CARD DETAILS */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <h4 
                    onClick={() => onSelectVideo(video)}
                    className="text-xs font-bold text-slate-100 line-clamp-2 hover:text-emerald-400 transition cursor-pointer leading-snug"
                  >
                    {video.productInfo?.name || video.prompt}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                    {video.providerName}
                  </p>
                </div>

                {/* CARD ACTION BUTTONS */}
                <div className="flex items-center justify-between border-t border-slate-800/80 pt-3 gap-1">
                  <button
                    onClick={() => onSelectVideo(video)}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                    <span>{isRtl ? 'معاينة' : 'Preview'}</span>
                  </button>

                  <button
                    onClick={() => onDuplicateVideo(video)}
                    className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] transition cursor-pointer"
                    title={isRtl ? 'نسخ' : 'Duplicate'}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => onDeleteVideo(video.id)}
                    className="p-1.5 rounded-lg bg-slate-950 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 text-[11px] transition cursor-pointer"
                    title={isRtl ? 'حذف' : 'Delete'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl divide-y divide-slate-800">
          {sortedVideos.map((video) => (
            <div 
              key={video.id}
              className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-800/50 transition"
            >
              <div className="flex items-center gap-4 cursor-pointer" onClick={() => onSelectVideo(video)}>
                <div className="w-16 h-20 bg-slate-950 rounded-xl overflow-hidden relative flex-shrink-0 border border-slate-800">
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt={video.prompt} className="w-full h-full object-cover" />
                  ) : (
                    <Video className="w-6 h-6 text-slate-700 m-auto mt-7" />
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white hover:text-emerald-400 transition">
                    {video.productInfo?.name || video.prompt.substring(0, 60) + '...'}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-400">
                    <span className="text-emerald-400 font-semibold">{video.providerName}</span>
                    <span>•</span>
                    <span className="uppercase font-mono">{video.platform}</span>
                    <span>•</span>
                    <span>{video.duration}</span>
                    <span>•</span>
                    <span className="text-slate-500">{new Date(video.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={() => onSelectVideo(video)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition cursor-pointer"
                >
                  {isRtl ? 'عرض الفيديو' : 'View Video'}
                </button>
                <button
                  onClick={() => onDeleteVideo(video.id)}
                  className="p-2 rounded-lg bg-slate-950 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};
