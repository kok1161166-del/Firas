import React, { useState, useEffect, useRef } from 'react';
import { Language, ChatMessage } from '../types';
import { chatService } from '../services/chatService';

interface ChatWidgetProps {
  lang: Language;
  isDemo?: boolean;
}

// --- Icons for Badges ---
const OwnerBadge = () => (
  <div className="flex items-center justify-center w-4 h-4 rounded bg-[#C9A24B] text-black shrink-0 shadow-[0_0_10px_rgba(201,162,75,0.4)]" title="Broadcaster">
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
      <path d="M5 19h14v2H5v-2zm7-13l3.5 7h-7L12 6zM6 17h12l-3-6H9l-3 6z" />
      <path d="M12 2L2 19h20L12 2zm0 3.5L18.5 17H5.5L12 5.5z" />
    </svg>
  </div>
);

const ModBadge = () => (
  <div className="flex items-center justify-center w-4 h-4 rounded bg-[#C9A24B]/80 text-black shrink-0 shadow-[0_0_8px_rgba(201,162,75,0.4)]" title="Moderator">
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
      <path d="M18.828 2.343a3.001 3.001 0 00-4.243 0l-5.071 5.071-3.657-3.657a1 1 0 00-1.414 0l-1.414 1.414a1 1 0 000 1.414l3.657 3.657-5.071 5.071a1 1 0 000 1.414l2.828 2.828a1 1 0 001.414 0l5.071-5.071 3.657 3.657a1 1 0 001.414 0l1.414-1.414a1 1 0 000-1.414l-3.657-3.657 5.071-5.071a3.001 3.001 0 000-4.243zm-2.829 2.829a1 1 0 111.414-1.414 1 1 0 01-1.414 1.414z" />
    </svg>
  </div>
);

const VipBadge = () => (
  <div className="flex items-center justify-center w-4 h-4 rounded bg-[#F542A8] text-white shrink-0 shadow-[0_0_8px_rgba(245,66,168,0.4)]" title="VIP">
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
      <path d="M12 2L2 9l10 13 10-13-10-7z" />
    </svg>
  </div>
);

const INITIAL_MESSAGES: ChatMessage[] = [];

export const ChatWidget: React.FC<ChatWidgetProps> = ({ lang, isDemo }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [unread, setUnread] = useState(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const t = {
    title: lang === 'en' ? 'Live Chat' : 'شات البث',
    connecting: lang === 'en' ? 'Connecting...' : 'جارِ الاتصال...',
    connected: lang === 'en' ? 'Live' : 'متصل',
    error: lang === 'en' ? 'Connection Issue' : 'مشكلة اتصال',
    retry: lang === 'en' ? 'Retry' : 'إعادة المحاولة'
  };

  useEffect(() => {
    // 1. Listen for new messages
    const unbindMessage = chatService.onMessage((msg) => {
      setMessages(prev => {
        const newArr = [...prev, msg];
        return newArr.slice(-75);
      });
    });

    // 2. Listen for deleted messages
    const unbindDelete = chatService.onDeleteMessage((msgId) => {
      setMessages(prev => prev.filter(m => m.id !== msgId));
    });

    // 3. Listen for status changes
    const unbindStatus = chatService.onStatusChange((connected, error, details) => {
      setIsConnected(connected);
      setConnectionError(error);
      setStatusText(details || '');
    });

    // 4. Connect to Firas channel
    chatService.connect('firas');

    // 5. Cleanup
    return () => {
      unbindMessage();
      unbindDelete();
      unbindStatus();
      chatService.disconnect();
    };
  }, []);

  // Pin-to-bottom logic: instant (smooth scroll lags in fast chat and makes
  // messages look like they fly upward). Respects users reading history.
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    if (stickToBottomRef.current || messages.length <= 5) {
      el.scrollTop = el.scrollHeight;
      setUnread(0);
    } else {
      setUnread((n) => Math.min(n + 1, 99));
    }
  }, [messages]);

  // Stay pinned when content height changes after paint (emotes loading, fonts)
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const stuck = distance < 60;
    stickToBottomRef.current = stuck;
    if (stuck) setUnread(0);
  };

  const jumpToLatest = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    setUnread(0);
    el.scrollTop = el.scrollHeight;
  };

  const getBadge = (role: string) => {
    switch (role) {
      case 'owner': return <OwnerBadge />;
      case 'moderator': return <ModBadge />;
      case 'vip': return <VipBadge />;
      default: return null;
    }
  };

  const renderMessage = (content: string) => {
    if (!content) return null;

    // Regex to match Kick emotes: [emote:ID:NAME]
    const emoteRegex = /\[emote:(\d+):([\w\s\-]+)\]/gi;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = emoteRegex.exec(content)) !== null) {
      // Add text before the emote
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }

      const emoteId = match[1];
      const emoteName = match[2];
      const emoteUrl = `https://files.kick.com/emotes/${emoteId}/fullsize`;

      parts.push(
        <img
          key={`${match.index}-${emoteId}`}
          src={emoteUrl}
          alt={emoteName}
          title={emoteName}
          className="inline-block w-8 h-8 md:w-10 md:h-10 mx-0.5 align-middle object-contain hover:scale-125 transition-transform"
          onError={(event) => { (event.target as HTMLImageElement).style.display = 'none'; }}
        />
      );

      lastIndex = emoteRegex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return parts.length > 0 ? parts : content;
  };

  return (
    <>
      <style>{`
        .kick-chat-scroll{scrollbar-width:thin;scrollbar-color:rgba(201,162,75,.5) transparent;overscroll-behavior:contain}
        .kick-chat-scroll::-webkit-scrollbar{width:6px}
        .kick-chat-scroll::-webkit-scrollbar-track{background:transparent}
        .kick-chat-scroll::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(217,180,94,.6),rgba(217,180,94,.18));border-radius:99px}
      `}</style>
    <div className="flex flex-col h-full w-full bg-[#0b0e0f]/80 backdrop-blur-2xl rounded-3xl overflow-hidden border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative ring-1 ring-white/5 isolate group">
      {/* Gold top accent */}
      <span className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-l from-transparent via-[#C9A24B]/80 to-transparent z-20 pointer-events-none" aria-hidden="true" />

      {/* Decorative Glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-kick/5 rounded-full blur-3xl -z-10 group-hover:bg-kick/10 transition-colors duration-500"></div>

      {/* --- Header --- */}
      <div className="h-14 shrink-0 bg-white/5 border-b border-white/5 flex items-center justify-between px-5 z-20 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-8 h-8 rounded-lg bg-black/20 border border-white/5 transition-colors ${isConnected ? 'text-[#C9A24B]' : connectionError ? 'text-red-500' : 'text-white/50'}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className={`text-white font-bold tracking-wide text-sm uppercase ${lang === 'ar' ? 'font-arabic' : ''}`}>{t.title}</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[#C9A24B] shadow-[0_0_8px_#C9A24B]' : connectionError ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`}></span>
              <span className="text-[10px] text-white/40 font-mono uppercase">
                {isConnected ? t.connected : connectionError ? t.error : (statusText || t.connecting)}
              </span>
            </div>
          </div>
        </div>

        {/* Message count */}
        <span className="ms-auto inline-flex items-center text-[10px] font-black px-2.5 py-1 rounded-full bg-[#C9A24B]/10 border border-[#C9A24B]/30 text-[#D9C08A]" dir="ltr">
          {messages.length}
        </span>

        {/* Retry Button */}
        {connectionError && (
          <button
            onClick={() => chatService.connect('firas')}
            className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors text-xs flex items-center gap-1"
            title={t.retry}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden md:inline">{t.retry}</span>
          </button>
        )}
      </div>

      {/* --- Chat List --- */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 pt-5 space-y-1.5 kick-chat-scroll bg-gradient-to-b from-[#0b0e0f]/50 to-transparent relative"
      >
        {messages.length === 0 && (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center gap-3 text-center px-6">
            <span className="w-12 h-12 rounded-2xl bg-[#C9A24B]/10 border border-[#C9A24B]/30 flex items-center justify-center text-[#D9C08A]">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            </span>
            <p className="text-sm font-black text-white/70">{lang === 'en' ? 'No messages yet' : 'لا توجد رسائل بعد'}</p>
            <p className="text-[11px] text-white/35 font-medium">{lang === 'en' ? 'Be the first to greet the fortress' : 'كن أول من يرحب بالقلعة'}</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="group flex items-start gap-2.5 py-1.5 px-3 rounded-xl hover:bg-[#C9A24B]/[0.06] transition-colors duration-200 border border-transparent hover:border-[#C9A24B]/20">

            {/* Badge Area */}
            {(msg.role === 'owner' || msg.role === 'moderator' || msg.role === 'vip') && (
              <div className="mt-1 shrink-0 transform group-hover:scale-110 transition-transform">
                {getBadge(msg.role)}
              </div>
            )}

            {/* Message Content */}
            <div className="flex flex-wrap items-baseline gap-x-2 text-[13px] md:text-sm leading-relaxed break-words w-full min-w-0 [overflow-wrap:anywhere]">

              {/* Username */}
              <span
                className="font-bold hover:underline cursor-pointer transition-opacity shrink-0 drop-shadow-sm"
                style={{ color: msg.user.color || '#fff' }}
              >
                {msg.user.username}
              </span>

              {/* Text / Emotes */}
              <span className={`text-white/80 font-medium group-hover:text-white transition-colors flex flex-wrap items-center gap-x-1 ${lang === 'ar' ? 'font-arabic' : ''}`}>
                {renderMessage(msg.content)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Decorative Bottom Gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#0b0e0f] to-transparent pointer-events-none z-10"></div>
      {/* Decorative Top Fade (no layout impact) */}
      <div className="absolute top-14 left-0 right-0 h-8 bg-gradient-to-b from-[#0b0e0f] to-transparent pointer-events-none z-10"></div>

      {/* Jump to latest */}
      {unread > 0 && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1.5 text-[11px] font-black px-4 py-2 rounded-full bg-gradient-to-b from-[#FFE9B8] via-[#C9A24B] to-[#8A6A3A] text-black shadow-[0_8px_24px_rgba(201,162,75,0.5)] hover:brightness-110 active:scale-95 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
          <span dir="ltr">{unread}</span>
          <span>{lang === 'en' ? 'new' : 'جديدة'}</span>
        </button>
      )}
    </div>
    </>
  );
};