/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX AI - Enhanced Chat Component (with Brain)
 * 
 * واجهة دردشة متكاملة مع جارفيكس AI الذكي
 * تدعم:
 * - 🧠 عرض عملية التفكير (Thinking Process)
 * - 💾 ذاكرة السياق
 * - 🔑 توزيع تلقائي على 5 مفاتيح (75 RPM)
 * - 🎯 اقتراحات ذكية
 * - 📱 تصميم RTL/Mobile-first
 * 
 * ═════════════════════════════════════════════════════════════
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useGarfiXAI } from '@/hooks/useGarfiXAI';
import { AIContext } from '@/lib/ai/types';

// ── Types ───────────────────────────────────────────────────

interface GarfiXChatProps {
  context?: Partial<AIContext>;
  placeholder?: string;
  className?: string;
  showThinking?: boolean;
  showSuggestions?: boolean;
  onMessageSend?: (message: string) => void;
  onMessageReceive?: (response: any) => void;
  welcomeMessage?: {
    ar?: string;
    en?: string;
  };
}

// ── Icons ───────────────────────────────────────────────────

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);

const LoadingIcon = () => (
  <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"/>
    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const ThinkingIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
    <path d="M12 12L8 16" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const BrainIcon = () => (
  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-purple-500/30 animate-pulse-subtle">
    <span className="text-lg">🧠</span>
  </div>
);

const UserAvatar = () => (
  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white shadow-md">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  </div>
);

// ── Main Component ─────────────────────────────────────────

export function GarfiXChat({
  context,
  placeholder = 'اسأل جارفيكس...',
  className,
  showThinking = true,
  showSuggestions = true,
  onMessageSend,
  onMessageReceive,
  welcomeMessage,
}: GarfiXChatProps) {
  const language = context?.language || 'ar';
  
  const {
    messages,
    isLoading,
    isThinking,
    thoughtProcess,
    error,
    sendMessage,
    clearMessages,
    clearError,
  } = useGarfiXAI({
    context,
    enableThinking: showThinking,
    onMessageSend,
    onMessageReceive,
  });

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking, thoughtProcess]);

  // Send message handler
  const handleSend = async () => {
    const message = inputValue.trim();
    if (!message || isLoading) return;

    setInputValue('');
    await sendMessage(message);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Quick suggestions based on context
  const quickSuggestions = getQuickSuggestions(context?.module);

  // ── Render ────────────────────────────────────────────────

  return (
    <div 
      className={`flex flex-col h-full bg-background border border-border rounded-2xl shadow-xl shadow-purple-500/5 overflow-hidden ${className || ''}`}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* Header with Brain Status */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white">
        <div className="flex items-center gap-3">
          <BrainIcon />
          <div>
            <h3 className="font-bold text-base">جارفيكس AI</h3>
            <p className="text-xs text-white/80 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isThinking ? 'bg-yellow-300 animate-pulse' : 'bg-emerald-400'}`} />
              {isThinking ? 'جارٍ التفكير...' : 'مستعد للمساعدة'}
            </p>
          </div>
        </div>
        
        <button
          onClick={clearMessages}
          className="px-3 py-1.5 text-xs rounded-lg bg-white/15 hover:bg-white/25 transition-all backdrop-blur-sm"
        >
          محادثة جديدة
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[350px] max-h-[550px] bg-gradient-to-b from-background to-muted/30">
        {/* Welcome Message */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 flex items-center justify-center mb-4">
              <span className="text-3xl">🧠</span>
            </div>
            <h4 className="font-semibold text-lg mb-2">مرحباً! أنا جارفيكس</h4>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              {welcomeMessage?.ar || 'مساعدك الذكي المتخصص في إدارة الأعمال والمحاسبة. اسألني أي شيء!'}
            </p>
            
            {/* Quick Suggestions */}
            {showSuggestions && (
              <div className="flex flex-wrap gap-2 mt-5 justify-center">
                {quickSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInputValue(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="px-4 py-2 text-sm rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors border border-primary/20"
                  >
                    💡 {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, index) => (
          <div
            key={msg.id || index}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            {/* Avatar */}
            <div className={`shrink-0 ${msg.role === 'user' ? 'order-last' : ''}`}>
              {msg.role === 'assistant' ? <BrainIcon /> : <UserAvatar />}
            </div>

            {/* Message Bubble */}
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-tr-none'
                  : 'bg-card border border-border rounded-tl-none shadow-sm'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              
              {/* Reasoning/Thinking (for assistant messages) */}
              {showThinking && msg.metadata?.reasoning && (
                <details className="mt-2 pt-2 border-t border-border/50">
                  <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <ThinkingIcon />
                    <span>عرض التفكير</span>
                  </summary>
                  <pre className="mt-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap">
                    {msg.metadata.reasoning}
                  </pre>
                </details>
              )}
              
              {/* Metadata */}
              {msg.metadata && (
                <div className={`text-[10px] mt-1.5 opacity-50 flex items-center gap-2 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}>
                  {(msg.metadata.tokens ?? 0) > 0 && (
                    <span>{msg.metadata.tokens} tokens</span>
                  )}
                  {msg.metadata.latency && (
                    <span>{msg.metadata.latency}ms</span>
                  )}
                  {msg.timestamp && (
                    <span>{msg.timestamp.toLocaleTimeString(language === 'ar' ? 'ar-SA' : 'en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Thinking Indicator */}
        {isThinking && thoughtProcess.length > 0 && (
          <div className="flex gap-3">
            <BrainIcon />
            <div className="px-4 py-3 rounded-2xl rounded-tl-none bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-violet-200 dark:border-violet-800 max-w-[85%]">
              <div className="flex items-center gap-2 text-sm text-violet-700 dark:text-violet-300 mb-2">
                <LoadingIcon />
                <span className="font-medium">جارٍ التفكير...</span>
              </div>
              <ul className="space-y-1 text-xs text-violet-600 dark:text-violet-400">
                {thoughtProcess.map((thought, i) => (
                  <li key={i} className="animate-pulse" style={{ animationDelay: `${i * 200}ms` }}>
                    {thought}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Loading Indicator (no thinking) */}
        {isLoading && !isThinking && (
          <div className="flex gap-3">
            <BrainIcon />
            <div className="px-4 py-3 rounded-2xl rounded-tl-none bg-card border border-border">
              <div className="flex items-center gap-2 text-muted-foreground">
                <LoadingIcon />
                <span className="text-sm">جارٍ الكتابة...</span>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-xl flex items-start gap-2">
            <span>⚠️</span>
            <div>
              <p>{error}</p>
              <button
                onClick={clearError}
                className="text-xs underline mt-1 hover:no-underline"
              >
                إغلاق
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t p-4 bg-card/50 backdrop-blur-sm">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={isLoading}
            className="flex-1 px-4 py-3 rounded-xl border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50 text-sm placeholder:text-muted-foreground/60"
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className="p-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[48px] min-h-[48px] flex items-center justify-center shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 active:scale-95"
          >
            {isLoading ? <LoadingIcon /> : <SendIcon />}
          </button>
        </div>
        
        {/* Hints */}
        {showSuggestions && messages.length > 0 && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {['اشرح أكثر', 'أعطِ مثالاً', 'ما الخطوات التالية؟'].map((hint) => (
              <button
                key={hint}
                onClick={() => {
                  setInputValue(hint);
                  inputRef.current?.focus();
                }}
                className="px-3 py-1.5 text-xs rounded-full bg-muted hover:bg-primary/10 transition-colors text-muted-foreground hover:text-foreground"
              >
                {hint}
              </button>
            ))}
          </div>
        )}
        
        {/* Powered by */}
        <p className="text-[10px] text-center text-muted-foreground/50 mt-3">
          ⚡ مدعوم بـ Google Gemini • تشفير من طرف إلى طرف • خصوصيتنا محمية 🔒
        </p>
      </div>
    </div>
  );
}

// ── Helper Functions ──────────────────────────────────────

function getQuickSuggestions(module?: string): string[] {
  const suggestions: Record<string, string[]> = {
    invoices: ['أنشئ فاتورة جديدة', 'اشرح الضريبة', 'تحليل الفواتير'],
    clients: ['أضف عميل جديد', 'تصنيف العملاء', 'أفضل العملاء'],
    catalog: ['إضافة منتج', 'تسعير ذكي', 'تحليل المخزون'],
    dashboard: ['ملخص الأداء', 'تنبؤات', 'نصائح تحسين'],
    reports: ['تقرير مبيعات', 'تحليل مالي', 'مقارنة'],
  };

  return suggestions[module || ''] || [
    'كيف يمكنني مساعدتك؟',
    'اشرح النظام لي',
    'نصيحة سريعة',
  ];
}

// ── Export ─────────────────────────────────────────────────

export default GarfiXChat;
