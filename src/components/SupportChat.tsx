import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Language, User as UserType } from '../types';
import { TRANSLATIONS } from '../constants/translations';
import socket from '../utils/socket';
import { smartFetch } from '../utils/smartFetch';
import {
  Send, User, MessageSquare, BadgeCheck, Sparkles, Paperclip, X,
  Home, FileText, Image as ImageIcon, Star, CheckCircle2,
  Mic, MicOff, StopCircle, Bot, UserCheck, PhoneCall, AlertTriangle,
  Headphones, Clock, ShieldCheck, HelpCircle, ChevronRight, ChevronLeft,
  ExternalLink, Info, Check, RefreshCw
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  sender: 'user' | 'support';
  sender_type?: 'customer' | 'ai' | 'agent' | 'system';
  text: string;
  time: string;
  timestamp: number;
  isInternal?: boolean;
  attachment?: { name: string; url: string; type: 'image' | 'audio' | 'file' };
}

interface SupportSettings {
  welcomeMessage: string;
  supportName: string;
  supportAvatar: string;
  isAgentOnline: boolean;
  suggestions?: { id: string; textAr: string; textEn: string; icon: string; isActive: boolean; order?: number }[];
}

type ConvStatus = 'AI_HANDLING' | 'PENDING_CUSTOMER_APPROVAL' | 'QUEUED_FOR_HUMAN' | 'HUMAN_HANDLING' | 'CLOSED' | 'active' | 'waiting' | 'resolved';

interface SupportChatProps {
  currentLanguage: Language;
  currentUser: UserType | null;
  onClose?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function renderInteractiveText(text: string, isRtl: boolean, onCopySuccess: (c: string) => void) {
  if (!text) return null;
  const EXCLUDE = new Set(['HTML','CSS','SAR','USD','AED','EUR','GMT','UTC','AM','PM','OK','INFO','AI','JSON','API','VITE','NODE','CJS','ESM','TODO','WIFI','FAQ','IP','URL','ID','PDF','JPEG','PNG','SVG','CJ','APP','CHAT','ADMIN']);
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          const href = part.toLowerCase().startsWith('www.') ? 'https://' + part : part;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:underline font-bold inline-flex items-center gap-0.5 mx-1"
            >
              {part}
              <ExternalLink className="w-3 h-3 inline" />
            </a>
          );
        }
        const codeRegex = /(`[^`]+`|\b[A-Z0-9_-]{4,15}\b)/g;
        const sub = part.split(codeRegex);
        return (
          <span key={i}>
            {sub.map((s, j) => {
              const isBt = s.startsWith('`') && s.endsWith('`');
              const clean = isBt ? s.slice(1, -1) : s;
              const isCode = isBt || (s.match(/^[A-Z0-9_-]{4,15}$/) && !EXCLUDE.has(s.toUpperCase()) && /[A-Z]/.test(s));
              if (isCode && clean.trim()) {
                return (
                  <button
                    key={j}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(clean.trim()).then(() => onCopySuccess(clean.trim()));
                    }}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-mono text-[11px] font-bold rounded border border-amber-500/30 cursor-pointer transition-all active:scale-95"
                    title={isRtl ? 'اضغط لنسخ الرمز' : 'Click to copy code'}
                  >
                    <span>{clean.trim()}</span>
                    <span className="text-[9px] opacity-70">📋</span>
                  </button>
                );
              }
              return <span key={j}>{s}</span>;
            })}
          </span>
        );
      })}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SupportChat({ currentLanguage, currentUser, onClose }: SupportChatProps) {
  const t = TRANSLATIONS[currentLanguage];
  const isRtl = currentLanguage === 'ar';

  // conversationId = user email or guest token
  const conversationId = (currentUser
    ? currentUser.email
    : (localStorage.getItem('ryvo_support_guest_id') || (() => {
        const id = `guest-${Math.random().toString(36).substr(2, 9)}@ryvo.co`;
        localStorage.setItem('ryvo_support_guest_id', id);
        return id;
      })())
  ).toLowerCase().trim();

  const backupKey = `ryvo_support_messages_v2_${conversationId}`;

  // ─── State ─────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const s = localStorage.getItem(backupKey);
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });
  const [inputText, setInputText] = useState('');
  const [convStatus, setConvStatus] = useState<ConvStatus>('AI_HANDLING');
  const [aiSummary, setAiSummary] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [settings, setSettings] = useState<SupportSettings>({
    welcomeMessage: isRtl ? 'مرحباً بك في مركز دعم رايفو! كيف يمكنني مساعدتك اليوم؟ 🏍️' : 'Welcome to RYVO Support Center! How can I assist you today? 🏍️',
    supportName: isRtl ? 'مساعد رايفو الذكي' : 'RYVO AI Assistant',
    supportAvatar: '🤖',
    isAgentOnline: false,
  });
  const [selectedFile, setSelectedFile] = useState<{ name: string; url: string; base64: string; type: string } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [guestName, setGuestName] = useState(() => localStorage.getItem('ryvo_guest_name') || '');
  const [ratingInput, setRatingInput] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showInfoSidebar, setShowInfoSidebar] = useState(false);
  const [isServerHealthy, setIsServerHealthy] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const sendingRef = useRef(false);

  // persist messages
  const persistMessages = useCallback((msgs: ChatMessage[]) => {
    localStorage.setItem(backupKey, JSON.stringify(msgs));
  }, [backupKey]);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev;
      let next = [...prev];
      if (msg.sender === 'user' && !msg.id.startsWith('temp-')) {
        const tempIdx = next.findIndex(m => m.sender === 'user' && m.id.startsWith('temp-'));
        if (tempIdx !== -1) {
          next[tempIdx] = msg;
        } else {
          next.push(msg);
        }
      } else {
        next.push(msg);
      }
      next.sort((a, b) => a.timestamp - b.timestamp);
      persistMessages(next);
      return next;
    });
  }, [persistMessages]);

  // ─── Socket.io Setup ───────────────────────────────────────────────────────
  useEffect(() => {
    socket.connect();
    socket.emit('join_conversation', { sessionId: conversationId });

    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('message_received', (msg: ChatMessage) => {
      addMessage(msg);
      setIsAiTyping(false);
      setIsAgentTyping(false);
    });

    socket.on('typing_status', ({ sender, isTyping }: { sender: string; isTyping: boolean }) => {
      if (sender === 'ai') setIsAiTyping(isTyping);
      if (sender === 'support' || sender === 'agent') setIsAgentTyping(isTyping);
    });

    socket.on('status_updated', ({ status, ai_summary }: { status: ConvStatus; ai_summary?: string }) => {
      setConvStatus(status);
      if (ai_summary) setAiSummary(ai_summary);
    });

    const handleSupportOnline = () => {
      setSettings(prev => ({ ...prev, isAgentOnline: true }));
    };

    const handleSupportOffline = () => {
      setSettings(prev => ({ ...prev, isAgentOnline: false }));
    };

    const handleSupportStatus = ({ isAgentOnline }: { isAgentOnline: boolean }) => {
      setSettings(prev => ({ ...prev, isAgentOnline }));
    };

    socket.on('support:online', handleSupportOnline);
    socket.on('support:offline', handleSupportOffline);
    socket.on('support_status', handleSupportStatus);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('message_received');
      socket.off('typing_status');
      socket.off('status_updated');
      socket.off('support:online', handleSupportOnline);
      socket.off('support:offline', handleSupportOffline);
      socket.off('support_status', handleSupportStatus);
      socket.disconnect();
    };
  }, [conversationId, addMessage]);

  // ─── Health Check & Sync ───────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const data = await smartFetch('/api/health', { maxRetries: 1 });
        if (isMounted && data && data.status === 'ok') {
          setIsServerHealthy(true);
          if (typeof data.adminOnline === 'boolean') {
            setSettings(prev => ({ ...prev, isAgentOnline: data.adminOnline }));
          }
        }
      } catch {
        if (isMounted) setIsServerHealthy(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // ─── Load conversation from server on mount ─────────────────────────────────
  useEffect(() => {
    smartFetch('/api/support/settings')
      .then(d => { if (d?.welcomeMessage) setSettings(d); })
      .catch(() => {});

    smartFetch(`/api/support/conversations/${encodeURIComponent(conversationId)}`)
      .then(data => {
        if (!data) return;
        if (data.status) setConvStatus(data.status as ConvStatus);
        if (data.ai_summary) setAiSummary(data.ai_summary);

        if (data.messages && Array.isArray(data.messages)) {
          setMessages(prev => {
            const merged = [...data.messages] as ChatMessage[];
            prev.forEach(lm => { if (!merged.some(m => m.id === lm.id)) merged.push(lm); });
            merged.sort((a, b) => a.timestamp - b.timestamp);
            persistMessages(merged);
            return merged;
          });
        }

        // Show welcome message if first visit
        if (!data.messages || data.messages.length === 0) {
          const welcome: ChatMessage = {
            id: 'welcome-msg',
            sender: 'support',
            sender_type: 'ai',
            text: settings.welcomeMessage || (isRtl ? 'مرحباً بك في مركز دعم رايفو! كيف يمكنني مساعدتك؟ 🏍️' : 'Welcome to RYVO Support Center! How can I assist you? 🏍️'),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now()
          };
          addMessage(welcome);
        }
      })
      .catch(() => {});
  }, [conversationId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiTyping, isAgentTyping]);

  // ─── Automated Trigger for Human Support Escalation ──────────────────────────
  const triggerContactHumanSupport = async (reason?: string, initialMessage?: string) => {
    try {
      const reasonText = reason || (isRtl ? 'طلب التحدث مع موظف دعم بشري' : 'Contact human support request');
      const clientName = currentUser?.name || guestName || (isRtl ? 'عميل المتجر' : 'Store Customer');
      const clientEmail = currentUser?.email || conversationId;
      const clientPhone = currentUser?.phone || '';
      const lastMsg = initialMessage || (messages.length > 0 ? messages[messages.length - 1].text : '');

      const metadata = {
        userAgent: navigator.userAgent,
        language: currentLanguage,
        page: typeof window !== 'undefined' ? window.location.pathname : '/',
        device: /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
        timestamp: new Date().toISOString()
      };

      setConvStatus('QUEUED_FOR_HUMAN');

      // 1. Send via Real-time Socket
      if (socketConnected) {
        socket.emit('request_human_support', {
          sessionId: conversationId,
          userName: clientName,
          userEmail: clientEmail,
          userPhone: clientPhone,
          reason: reasonText,
          message: lastMsg,
          aiSummary: aiSummary,
          metadata
        });
      }

      // 2. Automated POST request: creates 'support_requests' DB record & sends notification email
      try {
        await smartFetch('/api/support/request-human', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            userName: clientName,
            userEmail: clientEmail,
            userPhone: clientPhone,
            reason: reasonText,
            message: lastMsg,
            aiSummary: aiSummary,
            metadata
          })
        });
      } catch (postErr) {
        console.warn('REST support request fallback completed:', postErr);
      }

      const sysMsg: ChatMessage = {
        id: `sys-human-req-${Date.now()}`,
        sender: 'support',
        sender_type: 'system',
        text: isRtl
          ? '✅ تم تسجيل طلب التحويل للدعم البشري بنجاح وإشعار فريق الإدارة والمسؤولين. سيتواصل معك أحد موظفينا قريباً جداً. يمكنك مواصلة كتابة استفسارك هنا وسيقوم الموظف بقراءته فوراً. 🙏'
          : '✅ Human support request has been logged successfully and our support admins have been notified. An agent will be with you shortly. You may continue writing your inquiries here. 🙏',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now()
      };
      addMessage(sysMsg);
    } catch (err) {
      console.error('Failed to trigger human support request:', err);
    }
  };

  // ─── Handle Transfer to Agent (customer approves) ──────────────────────────
  const handleTransferToAgent = async () => {
    await triggerContactHumanSupport(isRtl ? 'موافقة العميل على التحويل للدعم البشري' : 'Customer approved transfer to human support');
  };

  const handleDeclineTransfer = async () => {
    try {
      socket.emit('decline_transfer', { sessionId: conversationId });
      smartFetch(`/api/support/conversations/${encodeURIComponent(conversationId)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'AI_HANDLING' })
      }).catch(() => {});

      setConvStatus('AI_HANDLING');
      const sysMsg: ChatMessage = {
        id: `sys-decline-${Date.now()}`,
        sender: 'support',
        sender_type: 'system',
        text: isRtl ? 'مستمرون في الحديث مع المساعد الذكي رايفو.' : 'Continuing conversation with Ryvo AI.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now()
      };
      addMessage(sysMsg);
    } catch (err) {
      console.error('Decline failed:', err);
    }
  };

  // ─── File Upload Handler ────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      setSelectedFile({ name: file.name, url: dataUrl, base64, type: file.type });
    };
    reader.readAsDataURL(file);
  };

  // ─── Audio Recording ────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = e => audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      handleCopySuccess(isRtl ? 'تعذر الوصول إلى الميكروفون' : 'Microphone access denied');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  // Send audio blob as message
  useEffect(() => {
    if (!audioBlob) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      await sendMessage('', undefined, { name: `audio-${Date.now()}.webm`, base64, type: 'audio/webm' });
      setAudioBlob(null);
    };
    reader.readAsDataURL(audioBlob);
  }, [audioBlob]);

  // ─── Send Message ───────────────────────────────────────────────────────────
  const sendMessage = async (text: string, e?: React.FormEvent, audioFile?: { name: string; base64: string; type: string }) => {
    if (e) e.preventDefault();
    if (isSending || sendingRef.current) return;
    if (!text.trim() && !selectedFile && !audioFile) return;

    sendingRef.current = true;
    setIsSending(true);

    const ua = navigator.userAgent;
    const device = /Mobi|Android/i.test(ua) ? 'Mobile' : 'Desktop';
    const os = /Macintosh/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : 'Windows';
    const browser = /Firefox/.test(ua) ? 'Firefox' : /Edg/.test(ua) ? 'Edge' : /Safari/.test(ua) && !/Chrome/.test(ua) ? 'Safari' : 'Chrome';
    const country = 'SA';

    // Upload file if present
    let uploadedUrl: string | undefined;
    let uploadType = 'text';

    if (audioFile) {
      try {
        const data = await smartFetch('/api/support/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: audioFile.name, fileType: audioFile.type, base64Data: audioFile.base64 })
        });
        uploadedUrl = data.url;
        uploadType = 'audio';
      } catch {
        console.error('Audio upload failed');
        setIsSending(false);
        sendingRef.current = false;
        return;
      }
    } else if (selectedFile) {
      try {
        const data = await smartFetch('/api/support/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: selectedFile.name, fileType: selectedFile.type, base64Data: selectedFile.base64 })
        });
        uploadedUrl = data.url;
        uploadType = selectedFile.type.startsWith('image/') ? 'image' : 'file';
      } catch {
        console.error('File upload failed');
        setIsSending(false);
        sendingRef.current = false;
        return;
      }
    }

    // Optimistic UI update
    const tempMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      sender: 'user',
      sender_type: 'customer',
      text: text || (uploadedUrl ? `[${isRtl ? 'ملف مرفق' : 'Attachment'}]` : ''),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      attachment: uploadedUrl ? { name: audioFile?.name || selectedFile?.name || 'file', url: uploadedUrl, type: uploadType as any } : undefined
    };
    addMessage(tempMsg);
    setInputText('');
    setSelectedFile(null);
    setShowSuggestions(false);

    // Show AI typing indicator if in AI mode
    if (convStatus === 'AI_HANDLING') setIsAiTyping(true);

    if (socketConnected) {
      socket.emit('send_message', {
        sessionId: conversationId,
        sender: 'user',
        text: text,
        attachment: uploadedUrl ? { url: uploadedUrl, type: uploadType } : undefined,
        clientName: currentUser?.name || guestName || (isRtl ? 'عميل المتجر' : 'Store Customer'),
        clientEmail: currentUser?.email || conversationId,
        clientPhone: currentUser?.phone || '',
        country,
        language: currentLanguage,
        device,
        os,
        browser
      });
      setTimeout(() => {
        setIsSending(false);
        sendingRef.current = false;
      }, 600);
    } else {
      // Fallback via REST API if socket is temporarily down
      try {
        await smartFetch(`/api/support/conversations/${encodeURIComponent(conversationId)}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            sender: 'user',
            attachment: uploadedUrl ? { url: uploadedUrl, type: uploadType } : undefined,
            clientName: currentUser?.name || guestName || (isRtl ? 'عميل المتجر' : 'Store Customer'),
            clientEmail: currentUser?.email || conversationId,
            clientPhone: currentUser?.phone || '',
            country,
            language: currentLanguage,
            device,
            os,
            browser
          })
        });
      } catch {
        setIsAiTyping(false);
      } finally {
        setIsSending(false);
        sendingRef.current = false;
      }
    }
  };

  // ─── Submit Rating ──────────────────────────────────────────────────────────
  const handleRatingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await smartFetch(`/api/support/conversations/${encodeURIComponent(conversationId)}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: ratingInput, ratingComment })
      });
      setRatingSubmitted(true);
    } catch {
      console.error('Rating submit failed');
    }
  };

  // ─── Suggestions ────────────────────────────────────────────────────────────
  const defaultSuggestions = [
    { id: 's1', textAr: '📦 متابعة طلبي', textEn: '📦 Track my order', icon: '📦', isActive: true },
    { id: 's2', textAr: '🚚 تتبع الشحنة', textEn: '🚚 Shipment tracking', icon: '🚚', isActive: true },
    { id: 's3', textAr: '💳 مشكلة في الدفع', textEn: '💳 Payment issue', icon: '💳', isActive: true },
    { id: 's4', textAr: '🔄 استبدال أو استرجاع', textEn: '🔄 Return & refund', icon: '🔄', isActive: true },
    { id: 's5', textAr: '🎟️ كوبونات الخصم', textEn: '🎟️ Discount coupons', icon: '🎟️', isActive: true },
    { id: 's6', textAr: '👨‍💼 موظف دعم بشري', textEn: '👨‍💼 Human agent', icon: '👨‍💼', isActive: true },
  ];
  const activeSuggestions = (settings.suggestions?.filter(s => s.isActive) ?? []).length > 0
    ? settings.suggestions!.filter(s => s.isActive)
    : defaultSuggestions;

  const handleSuggestionClick = (s: any) => {
    const isHumanRequest = s.id === 's6' || s.id === 's9' ||
      s.textAr?.includes('موظف') || s.textAr?.includes('بشري') ||
      s.textEn?.toLowerCase()?.includes('agent') ||
      s.textEn?.toLowerCase()?.includes('human');

    if (isHumanRequest) {
      triggerContactHumanSupport(isRtl ? s.textAr : s.textEn);
    } else {
      sendMessage(isRtl ? s.textAr : s.textEn);
    }
  };

  // ─── Sender badge ────────────────────────────────────────────────────────────
  const getSenderLabel = (msg: ChatMessage) => {
    if (msg.sender === 'user') return isRtl ? 'أنت' : 'You';
    if (msg.sender_type === 'ai') return isRtl ? 'المساعد الذكي' : 'AI Assistant';
    if (msg.sender_type === 'agent') return isRtl ? 'موظف الدعم' : 'Support Agent';
    if (msg.sender_type === 'system') return '';
    return settings.supportName || (isRtl ? 'دعم رايفو' : 'RYVO Support');
  };

  const isAiMessage = (msg: ChatMessage) => msg.sender === 'support' && (msg.sender_type === 'ai' || msg.sender_type === undefined);
  const isAgentMessage = (msg: ChatMessage) => msg.sender === 'support' && msg.sender_type === 'agent';
  const isSystemMessage = (msg: ChatMessage) => msg.sender_type === 'system';

  // ─── Status badge color ──────────────────────────────────────────────────────
  const statusBadge = () => {
    if (convStatus === 'HUMAN_HANDLING') {
      return {
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        dotColor: 'bg-emerald-400',
        label: isRtl ? 'موظف متصل' : 'Agent Online',
        icon: <UserCheck className="w-3 h-3" />
      };
    }
    if (convStatus === 'QUEUED_FOR_HUMAN') {
      return {
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        dotColor: 'bg-amber-400',
        label: isRtl ? 'في قائمة الانتظار' : 'In Queue',
        icon: <PhoneCall className="w-3 h-3 animate-pulse" />
      };
    }
    if (convStatus === 'PENDING_CUSTOMER_APPROVAL') {
      return {
        color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
        dotColor: 'bg-orange-400',
        label: isRtl ? 'بانتظار موافقتك' : 'Approval Needed',
        icon: <AlertTriangle className="w-3 h-3" />
      };
    }
    if (convStatus === 'CLOSED') {
      return {
        color: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
        dotColor: 'bg-slate-400',
        label: isRtl ? 'مغلقة' : 'Closed',
        icon: <CheckCircle2 className="w-3 h-3" />
      };
    }
    return {
      color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
      dotColor: 'bg-sky-400',
      label: isRtl ? 'الرد الآلي نشط' : 'AI Active',
      icon: <Sparkles className="w-3 h-3" />
    };
  };

  const badge = statusBadge();

  // ─── Copy Success Toast ──────────────────────────────────────────────────────
  const handleCopySuccess = (code: string) => {
    setCopyToast(code);
    setTimeout(() => setCopyToast(null), 2500);
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-0 sm:p-3 md:p-6 font-sans overflow-x-hidden select-text">
      <div className="bg-white dark:bg-[#0D111A] w-full h-full sm:h-[92vh] sm:max-w-4xl lg:max-w-5xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800/80 relative">

        {/* ── Compact & Professional Header ──────────────────────────────────────── */}
        <header className="bg-gradient-to-r from-[#0d141e] via-[#111927] to-[#162234] text-white px-3.5 py-3 sm:px-5 sm:py-3.5 border-b border-slate-800/80 flex items-center justify-between gap-2.5 shrink-0 z-20">
          
          {/* Right Section: Close / Back Button & Center Brand Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Close / Return Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-slate-300 hover:text-white transition-all flex items-center justify-center cursor-pointer shrink-0 border border-white/10"
              title={isRtl ? 'إغلاق مركز الدعم' : 'Close Support Center'}
              aria-label={isRtl ? 'إغلاق' : 'Close'}
            >
              {isRtl ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            </button>

            {/* Avatar with Status Indicator */}
            <div className="relative shrink-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-sky-500 via-indigo-600 to-violet-600 flex items-center justify-center text-lg sm:text-xl shadow-md border border-white/15">
                {convStatus === 'HUMAN_HANDLING' ? '👨‍💼' : '🤖'}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0d141e] ${
                convStatus === 'HUMAN_HANDLING' || settings.isAgentOnline ? 'bg-emerald-400 animate-pulse' : 'bg-sky-400'
              }`} />
            </div>

            {/* Title & Brand Subtitle */}
            <div className="min-w-0 text-right">
              <h2 className="font-black text-xs sm:text-sm tracking-tight text-white leading-tight truncate">
                {isRtl ? 'مركز الدعم الفني' : 'Technical Support Center'}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10.5px] sm:text-[11px] font-bold text-sky-400 tracking-wide">
                  {isRtl ? 'رايفو RYVO' : 'RYVO Store'}
                </span>
                <span className="text-slate-600 text-[10px]">•</span>
                <div className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md border text-[9.5px] font-bold ${badge.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${badge.dotColor}`} />
                  <span>{badge.label}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Left Section: Action Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            
            {/* "Request Human Support" Compact Button */}
            {convStatus !== 'HUMAN_HANDLING' && convStatus !== 'QUEUED_FOR_HUMAN' && (
              <button
                type="button"
                onClick={() => triggerContactHumanSupport()}
                className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 hover:text-amber-200 border border-amber-500/35 rounded-xl text-[11px] font-black transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                title={isRtl ? 'طلب التحدث مع موظف دعم بشري' : 'Request Human Support'}
              >
                <Headphones className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="whitespace-nowrap">{isRtl ? 'طلب موظف بشري' : 'Human Agent'}</span>
              </button>
            )}

            {/* Desktop Info Toggle */}
            <button
              type="button"
              onClick={() => setShowInfoSidebar(!showInfoSidebar)}
              className={`w-9 h-9 rounded-xl border transition-all flex items-center justify-center cursor-pointer shrink-0 ${
                showInfoSidebar 
                  ? 'bg-sky-500/20 border-sky-500/40 text-sky-300' 
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-400 hover:text-white'
              }`}
              title={isRtl ? 'معلومات الدعم والخدمة' : 'Support Information'}
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ── Main Body Container (Responsive 2-pane / 1-pane layout) ──────────────── */}
        <div className="flex-1 flex min-h-0 overflow-hidden relative">

          {/* ── Main Chat Area ──────────────────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-[#090C14] relative">

            {/* ── PENDING_CUSTOMER_APPROVAL Banner ─────────────────────────────── */}
            {convStatus === 'PENDING_CUSTOMER_APPROVAL' && (
              <div className="bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-orange-500/15 border-b border-orange-500/30 p-3.5 shrink-0 animate-in slide-in-from-top-2">
                <div className="max-w-md mx-auto text-center space-y-2.5">
                  <div className="flex items-center justify-center gap-1.5 text-orange-400 font-black text-xs sm:text-sm">
                    <AlertTriangle className="w-4 h-4 animate-pulse" />
                    <span>{isRtl ? 'تحتاج مشكلتك تدخلاً من فريق الدعم' : 'Your issue needs support team attention'}</span>
                  </div>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    {isRtl
                      ? 'قام المساعد الذكي بإعداد ملخص لمشكلتك. هل ترغب بالتحويل إلى موظف دعم بشري الآن؟'
                      : 'Our AI has summarized your inquiry. Would you like to transfer to a human support agent now?'}
                  </p>
                  <div className="flex gap-2 justify-center pt-1">
                    <button
                      type="button"
                      onClick={handleTransferToAgent}
                      className="py-2 px-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <Headphones className="w-3.5 h-3.5" />
                      <span>{isRtl ? 'نعم، تحويل للموظف' : 'Yes, Transfer'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDeclineTransfer}
                      className="py-2 px-4 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      <span>{isRtl ? 'لا، مواصلة مع المساعد' : 'Keep AI'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── QUEUED_FOR_HUMAN Banner ───────────────────────────────────────── */}
            {convStatus === 'QUEUED_FOR_HUMAN' && (
              <div className="bg-amber-500/10 border-b border-amber-500/20 px-3.5 py-2.5 flex items-center justify-between gap-2 shrink-0 animate-in slide-in-from-top-1">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>{isRtl ? '⏳ طلبك في قائمة الانتظار، سيتواصل معك موظف الدعم قريباً...' : '⏳ You are in queue, an agent will be with you shortly...'}</span>
                </div>
                <button
                  type="button"
                  onClick={handleDeclineTransfer}
                  className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold rounded-lg text-[10.5px] transition border border-amber-500/30 flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Bot className="w-3 h-3" />
                  <span>{isRtl ? 'العودة للمساعد الذكي' : 'Return to AI'}</span>
                </button>
              </div>
            )}

            {/* ── Messages List ─────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-3.5 bg-slate-50 dark:bg-[#090C14] scroll-smooth">

              {/* Suggestions on Initial Open */}
              {messages.length <= 1 && showSuggestions && (
                <div className="py-2 sm:py-4 space-y-3.5 max-w-lg mx-auto animate-in fade-in duration-300">
                  <div className="text-center space-y-1">
                    <div className="w-11 h-11 mx-auto rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-xl shadow-md border border-white/20">
                      🤖
                    </div>
                    <h3 className="font-black text-slate-800 dark:text-white text-sm sm:text-base pt-1">
                      {isRtl ? 'كيف يمكننا مساعدتك اليوم؟ 🏍️' : 'How can we help you today? 🏍️'}
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 text-xs">
                      {isRtl ? 'اختر أحد المواضيع الشائعة أو اكتب استفسارك بالأسفل' : 'Select a common topic or type your message below'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {activeSuggestions.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        disabled={isSending}
                        onClick={() => handleSuggestionClick(s)}
                        className="p-2.5 sm:p-3 bg-white dark:bg-[#121622] hover:bg-sky-50 dark:hover:bg-sky-950/30 border border-slate-200/80 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-500/50 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer text-center shadow-xs disabled:opacity-40 active:scale-98"
                      >
                        <span className="block truncate">{isRtl ? s.textAr : s.textEn}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat Message Stream */}
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    isSystemMessage(msg)
                      ? 'items-center justify-center my-2'
                      : msg.sender === 'user'
                        ? (isRtl ? 'items-start mr-0 ml-auto' : 'items-end ml-0 mr-auto')
                        : (isRtl ? 'items-end ml-0 mr-auto' : 'items-start mr-0 ml-auto')
                  } max-w-[92%] sm:max-w-[82%]`}
                >
                  {isSystemMessage(msg) ? (
                    <div className="bg-slate-200/80 dark:bg-slate-800/80 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl px-4 py-2 text-center text-xs text-slate-600 dark:text-slate-300 font-medium max-w-sm shadow-xs leading-relaxed">
                      {msg.text}
                    </div>
                  ) : (
                    <>
                      {/* Sender Label & Avatar */}
                      {msg.sender !== 'user' && (
                        <div className={`flex items-center gap-1.5 mb-1 px-1 ${isRtl ? 'flex-row-reverse' : ''}`}>
                          <div className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] ${
                            isAiMessage(msg) ? 'bg-sky-500/20 text-sky-400' : 'bg-emerald-500/20 text-emerald-400'
                          }`}>
                            {isAiMessage(msg) ? <Bot className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
                          </div>
                          <span className="text-[10px] font-bold text-slate-400">{getSenderLabel(msg)}</span>
                        </div>
                      )}

                      {/* Bubble */}
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-xs text-xs sm:text-sm leading-relaxed ${
                          msg.sender === 'user'
                            ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white rounded-br-xs'
                            : isAiMessage(msg)
                              ? 'bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-xs'
                              : 'bg-emerald-500/10 border border-emerald-500/25 text-slate-900 dark:text-emerald-100 rounded-bl-xs'
                        }`}
                      >
                        {msg.attachment ? (
                          <div className="space-y-2">
                            {msg.attachment.type === 'image' && (
                              <img
                                src={msg.attachment.url}
                                alt="Attachment"
                                className="rounded-xl max-w-[240px] w-full object-cover border border-black/10 dark:border-white/10"
                              />
                            )}
                            {msg.attachment.type === 'audio' && (
                              <audio controls src={msg.attachment.url} className="w-full max-w-[240px]" />
                            )}
                            {msg.attachment.type === 'file' && (
                              <a
                                href={msg.attachment.url}
                                download={msg.attachment.name}
                                className="flex items-center gap-1.5 underline font-bold text-sky-400 hover:text-sky-300"
                              >
                                <FileText className="w-4 h-4" />
                                <span className="truncate">{msg.attachment.name}</span>
                              </a>
                            )}
                            {msg.text && <p className="text-xs mt-1 opacity-90">{msg.text}</p>}
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap break-words leading-relaxed font-sans">
                            {msg.sender === 'user' ? msg.text : renderInteractiveText(msg.text, isRtl, handleCopySuccess)}
                          </p>
                        )}
                      </div>

                      {/* Timestamp & Badges */}
                      <div className="flex items-center gap-2 mt-0.5 px-1 text-[9px] text-slate-400">
                        <span>{msg.time}</span>
                        {isAiMessage(msg) && (
                          <span className="inline-flex items-center gap-0.5 text-sky-400">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>AI</span>
                          </span>
                        )}
                        {isAgentMessage(msg) && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-400">
                            <BadgeCheck className="w-2.5 h-2.5" />
                            <span>{isRtl ? 'موظف' : 'Agent'}</span>
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}

              {/* Typing indicators */}
              {isAiTyping && (
                <div className={`flex items-end gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                  <div className="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center shrink-0">
                    <Bot className="w-3 h-3 text-sky-400" />
                  </div>
                  <div className="bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 rounded-2xl rounded-bl-xs px-3.5 py-2.5">
                    <div className="flex items-center gap-1">
                      {[0, 150, 300].map(d => (
                        <span key={d} className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                      <span className="text-[10px] text-slate-400 ml-2 font-medium">{isRtl ? 'جاري الرد...' : 'Replying...'}</span>
                    </div>
                  </div>
                </div>
              )}

              {isAgentTyping && !isAiTyping && (
                <div className={`flex items-end gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <User className="w-3 h-3 text-emerald-400" />
                  </div>
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-3.5 py-2.5">
                    <div className="flex gap-1 items-center">
                      {[0, 150, 300].map(d => (
                        <span key={d} className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                      <span className="text-[10px] text-emerald-400 ml-2 font-medium">{isRtl ? 'الموظف يكتب...' : 'Agent typing...'}</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Quick Suggestions Bar (Scrollable chips) ──────────────────────── */}
            {messages.length > 1 && (convStatus === 'AI_HANDLING' || convStatus === 'active') && (
              <div className="bg-white/90 dark:bg-[#0D111A]/90 backdrop-blur-xs border-t border-slate-200/60 dark:border-slate-800/80 px-3 py-1.5 shrink-0">
                <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                  {activeSuggestions.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={isSending}
                      onClick={() => handleSuggestionClick(s)}
                      className="whitespace-nowrap px-2.5 py-1 bg-slate-100 dark:bg-slate-800/70 hover:bg-sky-50 dark:hover:bg-sky-950/40 hover:border-sky-400/50 border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 text-[11px] font-bold rounded-lg transition-all cursor-pointer shrink-0 disabled:opacity-40 active:scale-95"
                    >
                      {isRtl ? s.textAr : s.textEn}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Rating (When closed) ────────────────────────────────────────── */}
            {convStatus === 'CLOSED' && (
              <div className="bg-white dark:bg-[#121622] border-t border-slate-200 dark:border-slate-800 p-4 shrink-0">
                {ratingSubmitted ? (
                  <div className="text-center space-y-1.5 py-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                    <p className="font-black text-slate-800 dark:text-white text-xs">{isRtl ? 'شكراً لتقييمك! 🙏' : 'Thank you for your feedback! 🙏'}</p>
                    <p className="text-[11px] text-slate-400">{isRtl ? 'مساهمتك تساعدنا على التحسين الدائم.' : 'Your feedback helps us continuously improve.'}</p>
                  </div>
                ) : (
                  <form onSubmit={handleRatingSubmit} className="space-y-2.5 max-w-sm mx-auto text-center">
                    <p className="font-black text-slate-800 dark:text-white text-xs">{isRtl ? 'كيف كانت تجربتك مع دعم رايفو؟ ⭐' : 'How was your support experience? ⭐'}</p>
                    <div className="flex justify-center gap-2">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRatingInput(star)}
                          className={`text-xl transition-transform hover:scale-125 cursor-pointer ${star <= ratingInput ? 'opacity-100' : 'opacity-30'}`}
                        >
                          ⭐
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={ratingComment}
                        onChange={e => setRatingComment(e.target.value)}
                        placeholder={isRtl ? 'تعليقك يساعدنا...' : 'Optional comment...'}
                        className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-white outline-none"
                      />
                      <button type="submit" className="px-3.5 py-1.5 bg-sky-500 hover:bg-sky-400 text-white font-black text-xs rounded-xl cursor-pointer">
                        {isRtl ? 'إرسال' : 'Send'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ── Input Bar ────────────────────────────────────────────────────── */}
            {convStatus !== 'CLOSED' && convStatus !== 'PENDING_CUSTOMER_APPROVAL' && (
              <div className="bg-white dark:bg-[#0E131E] border-t border-slate-200 dark:border-slate-800/80 p-2.5 sm:p-3 shrink-0">
                {/* File Attachment Preview */}
                {selectedFile && (
                  <div className="mb-2 flex items-center gap-2 bg-slate-100 dark:bg-slate-900 rounded-xl px-3 py-1.5 border border-slate-200 dark:border-slate-800">
                    {selectedFile.type.startsWith('image/') ? <ImageIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" /> : <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                    <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1 font-medium">{selectedFile.name}</span>
                    <button type="button" onClick={() => setSelectedFile(null)} className="text-slate-400 hover:text-rose-400 p-0.5 rounded-full cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <form onSubmit={e => sendMessage(inputText, e)} className="flex items-center gap-1.5 sm:gap-2">
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,audio/*,application/pdf" className="hidden" />

                  {/* Attachment Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 sm:p-2.5 bg-slate-100 dark:bg-slate-850 hover:bg-sky-500/10 text-slate-500 dark:text-slate-400 hover:text-sky-400 rounded-xl transition-all cursor-pointer shrink-0 border border-slate-200/60 dark:border-slate-800"
                    title={isRtl ? 'إرفاق ملف أو صورة' : 'Attach file'}
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  {/* Audio Voice Recording */}
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`p-2 sm:p-2.5 rounded-xl transition-all cursor-pointer shrink-0 border ${
                      isRecording 
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse' 
                        : 'bg-slate-100 dark:bg-slate-850 hover:bg-sky-500/10 text-slate-500 dark:text-slate-400 hover:text-sky-400 border-slate-200/60 dark:border-slate-800'
                    }`}
                    title={isRecording ? (isRtl ? 'إيقاف التسجيل' : 'Stop') : (isRtl ? 'تسجيل رسالة صوتية' : 'Record voice')}
                  >
                    {isRecording ? <StopCircle className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>

                  {/* Input Field */}
                  <input
                    type="text"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={() => socket.emit('typing', { sessionId: conversationId, sender: 'user', isTyping: true })}
                    placeholder={
                      convStatus === 'QUEUED_FOR_HUMAN'
                        ? (isRtl ? 'اكتب تفاصيل إضافية للموظف هنا...' : 'Type additional details for the agent here...')
                        : (isRtl ? 'اكتب رسالتك أو استفسارك هنا...' : 'Type your message or inquiry here...')
                    }
                    className={`flex-1 px-3.5 py-2 sm:py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-sky-400 dark:focus:border-sky-500 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-white outline-none transition-all font-medium ${
                      isRtl ? 'text-right' : 'text-left'
                    }`}
                  />

                  {/* Send Button */}
                  <button
                    type="submit"
                    disabled={(!inputText.trim() && !selectedFile) || isSending}
                    className="p-2 sm:p-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:from-slate-200 disabled:to-slate-300 dark:disabled:from-slate-800 dark:disabled:to-slate-700 text-white disabled:text-slate-400 rounded-xl transition-all cursor-pointer shrink-0 shadow-md hover:shadow-sky-500/25 active:scale-95 disabled:cursor-not-allowed"
                    title={isRtl ? 'إرسال الرسالة' : 'Send message'}
                  >
                    <Send className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
                  </button>
                </form>

                {/* Footer Security Badge */}
                <div className="flex items-center justify-center gap-2 text-[9.5px] text-slate-400 font-medium mt-1.5">
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  <span>{isRtl ? 'محادثة آمنة ومشفرة بالكامل · متجر رايفو الرسمي' : 'Fully secure & encrypted chat · Official RYVO Support'}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Desktop & Tablet Side Info Panel (Collapsible) ────────────────────── */}
          {showInfoSidebar && (
            <aside className="w-72 sm:w-80 bg-white dark:bg-[#0B0F17] border-r sm:border-r-0 sm:border-l border-slate-200 dark:border-slate-800/80 p-4 flex flex-col justify-between shrink-0 animate-in slide-in-from-right-3 duration-200 overflow-y-auto">
              <div className="space-y-4 text-right">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <h4 className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-sky-400" />
                    <span>{isRtl ? 'معلومات مركز الدعم' : 'Support Center Details'}</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowInfoSidebar(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Session Card */}
                <div className="p-3 bg-slate-50 dark:bg-slate-900/70 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                    <span>{isRtl ? 'حالة الجلسة:' : 'Session Status:'}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black ${badge.color}`}>{badge.label}</span>
                  </div>
                  <div className="text-[11px] text-slate-700 dark:text-slate-300">
                    <span className="text-[9.5px] text-slate-400 block">{isRtl ? 'المستخدم الحالي:' : 'User ID:'}</span>
                    <strong className="font-mono text-[10px] truncate block text-sky-400">{conversationId}</strong>
                  </div>
                </div>

                {/* Hours & Response Metrics */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2.5 bg-emerald-500/5 rounded-xl border border-emerald-500/15">
                    <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <strong className="text-[11px] font-black text-emerald-500 block">{isRtl ? 'خدمة الدعم 24/7' : '24/7 Support Desk'}</strong>
                      <span className="text-[9.5px] text-slate-400 block">{isRtl ? 'استجابة فورية عبر الذكاء الاصطناعي والموظفين' : 'Instant AI & Human Assistance'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-2.5 bg-sky-500/5 rounded-xl border border-sky-500/15">
                    <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                    <div>
                      <strong className="text-[11px] font-black text-sky-400 block">{isRtl ? 'مدعوم بنماذج Gemini AI' : 'Powered by Gemini AI'}</strong>
                      <span className="text-[9.5px] text-slate-400 block">{isRtl ? 'إجابات دقيقة لجميع استفسارات المتجر' : 'Precise store assistance'}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Topics */}
                <div className="space-y-1.5 pt-2">
                  <span className="text-[10px] font-black uppercase text-slate-400 block">
                    {isRtl ? '💡 استفسارات سريعة:' : '💡 Fast Topics:'}
                  </span>
                  <div className="space-y-1">
                    {defaultSuggestions.slice(0, 4).map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSuggestionClick(s)}
                        className="w-full p-2 text-right text-[11px] font-bold bg-slate-50 dark:bg-slate-900/50 hover:bg-sky-50 dark:hover:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-colors text-slate-700 dark:text-slate-300 flex items-center justify-between cursor-pointer"
                      >
                        <span>{isRtl ? s.textAr : s.textEn}</span>
                        <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Direct Escalation Section */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={() => triggerContactHumanSupport()}
                  className="w-full py-2 px-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span>{isRtl ? 'طلب تحويل لموظف بشري' : 'Escalate to Human Agent'}</span>
                </button>
              </div>
            </aside>
          )}

        </div>

      </div>

      {/* Copy Toast Alert */}
      {copyToast && (
        <div className="fixed bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white border border-slate-700/80 text-xs font-black py-2 px-4 rounded-xl shadow-2xl z-50 flex items-center gap-2 animate-in fade-in zoom-in-95">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{isRtl ? `تم النسخ: ${copyToast}` : `Copied: ${copyToast}`}</span>
        </div>
      )}
    </div>
  );
}
