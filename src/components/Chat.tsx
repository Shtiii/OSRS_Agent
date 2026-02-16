'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  Send,
  Bot,
  Loader2,
  Sparkles,
  AlertCircle,
  Compass,
  Coins,
  Skull,
  Scroll,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMessages } from '@/hooks/useSupabase';
import type { UserContext } from '@/lib/types';
import type { ProfileRow } from '@/lib/database.types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  dbId?: string;
}

interface ChatProps {
  userContext: UserContext;
  chatId: string | null;
  onCreateChat: (firstMessage: string) => Promise<string | null>;
  onUpdateChatTitle: (chatId: string, title: string) => Promise<void>;
  profile: ProfileRow | null;
}

export default function Chat({ 
  userContext, 
  chatId, 
  onCreateChat, 
  onUpdateChatTitle,
  profile 
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingAssistantMessageRef = useRef<string | null>(null);

  const { 
    messages: dbMessages, 
    isLoading: isDbLoading, 
    saveMessage, 
    saveMessageToChat,
    updateMessage,
    fetchMessages 
  } = useMessages(chatId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (chatId && dbMessages.length > 0) {
      const loadedMessages: Message[] = dbMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        dbId: msg.id,
      }));
      setMessages(loadedMessages);
      setIsFirstMessage(false);
    } else if (!chatId) {
      setMessages([]);
      setIsFirstMessage(true);
    }
  }, [chatId, dbMessages]);

  const saveAssistantMessageToDb = useCallback(async (targetChatId: string, messageId: string, content: string) => {
    if (targetChatId && content) {
      const dbId = await saveMessageToChat(targetChatId, 'assistant', content);
      if (dbId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, dbId } : msg
          )
        );
      }
    }
  }, [saveMessageToChat]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessageContent = input.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessageContent,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    let currentChatId = chatId;
    if (isFirstMessage && !chatId) {
      currentChatId = await onCreateChat(userMessageContent);
      setIsFirstMessage(false);
    }

    if (currentChatId) {
      const dbId = await saveMessageToChat(currentChatId, 'user', userMessageContent);
      if (dbId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === userMessage.id ? { ...msg, dbId } : msg
          )
        );
      }
    }

    try {
      const messagesToSend = [...messages, userMessage]
        .filter((m) => m.content && m.content.trim().length > 0)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content.trim(),
        }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesToSend,
          userContext,
          profile: profile ? {
            memoryNotes: profile.memory_notes,
            achievements: profile.achievements,
            notableItems: profile.notable_items,
            goals: profile.goals,
            playStyle: profile.play_style,
          } : null,
        }),
      });

      if (!response.ok) {
        // Parse error message from API (rate limit, topic block, etc.)
        let errorMessage = 'Failed to get response';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
          if (response.status === 429 && errorData.retryAfter) {
            errorMessage += ` (retry in ${errorData.retryAfter}s)`;
          }
        } catch {
          // If JSON parsing fails, use status text
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
      };

      setMessages((prev) => [...prev, assistantMessage]);
      pendingAssistantMessageRef.current = assistantMessageId;

      const decoder = new TextDecoder();
      let done = false;
      let fullContent = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const text = decoder.decode(value, { stream: true });
          fullContent += text;
          
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            const lastMsg = { ...updated[lastIndex] };

            if (lastMsg.role === 'assistant') {
              lastMsg.content += text;
              updated[lastIndex] = lastMsg;
            }
            return updated;
          });
        }
      }

      if (currentChatId && fullContent) {
        await saveAssistantMessageToDb(currentChatId, assistantMessageId, fullContent);
      }

      pendingAssistantMessageRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      pendingAssistantMessageRef.current = null;
    } finally {
      setIsLoading(false);
    }
  };

  const suggestedPrompts = [
    { icon: Skull, text: "What boss should I do next?", color: "text-red-400" },
    { icon: Coins, text: "Best money making for my level?", color: "text-[var(--osrs-yellow)]" },
    { icon: Compass, text: "Can I do Vorkath with my stats?", color: "text-[var(--osrs-cyan)]" },
    { icon: Scroll, text: "What quests should I complete?", color: "text-[var(--osrs-green)]" },
  ];

  const handleSuggestionClick = (prompt: string) => {
    setInput(prompt);
  };

  const displayName = userContext.stats?.displayName || userContext.username || 'Player';

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--osrs-bg)]">
      {/* Chat Header */}
      <div className="px-5 py-3.5 border-b border-[var(--osrs-border)] bg-[var(--osrs-panel-dark)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--osrs-yellow)]/20 to-[var(--osrs-orange)]/10 border border-[var(--osrs-yellow)]/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-[var(--osrs-yellow)]" />
          </div>
          <div className="flex-1">
            <h2
              className="text-[var(--osrs-orange)] leading-tight"
              style={{
                fontFamily: 'var(--font-press-start)',
                fontSize: '10px',
                textShadow: '1px 1px 0 #000',
              }}
            >
              Wise Old AI
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {userContext.username
                ? `Advising ${displayName}`
                : 'Enter username for personalized advice'}
              {profile?.memory_notes && (
                <span className="text-[var(--osrs-purple)] ml-1">• Has memory</span>
              )}
            </p>
          </div>
          {userContext.stats && (
            <div className="flex items-center gap-2">
              <div className="px-2.5 py-1 rounded-md bg-[var(--osrs-yellow)]/10 border border-[var(--osrs-yellow)]/20">
                <span className="text-xs font-medium text-[var(--osrs-yellow)]">
                  Cmb {userContext.stats.combatLevel}
                </span>
              </div>
              <div className={cn(
                'px-2.5 py-1 rounded-md capitalize text-xs font-medium osrs-badge',
                userContext.stats.type === 'ironman' && 'osrs-badge-iron',
                userContext.stats.type === 'hardcore' && 'osrs-badge-hcim',
                userContext.stats.type === 'ultimate' && 'osrs-badge-uim',
                userContext.stats.type === 'regular' && 'osrs-badge-regular',
              )}>
                {userContext.stats.type}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5">
        {isDbLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--osrs-orange)]" />
              <span className="text-sm text-gray-400">Loading conversation...</span>
            </div>
          </div>
        ) : messages.length === 0 ? (
          /* ===== Empty State / Welcome Screen ===== */
          <div className="flex flex-col items-center justify-center h-full text-center max-w-xl mx-auto animate-fade-in">
            {/* Hero icon */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--osrs-orange)]/20 to-[var(--osrs-yellow)]/5 border border-[var(--osrs-orange)]/20 flex items-center justify-center mb-6 animate-glow-pulse">
              <Sparkles className="w-10 h-10 text-[var(--osrs-yellow)]" />
            </div>

            <h3
              className="text-[var(--osrs-orange)] mb-2"
              style={{
                fontFamily: 'var(--font-press-start)',
                fontSize: '14px',
                textShadow: '2px 2px 0 #000',
              }}
            >
              Welcome, Adventurer!
            </h3>
            <p className="text-gray-400 max-w-md mb-8 leading-relaxed">
              I can help with boss strategies, gear setups, quest guides,
              and money making methods. Ask me anything about Old School RuneScape.
            </p>

            {/* Suggestion chips */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
              {suggestedPrompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(prompt.text)}
                  className="suggestion-chip flex items-center gap-3"
                >
                  <prompt.icon className={cn('w-4 h-4 flex-shrink-0', prompt.color)} />
                  <span>{prompt.text}</span>
                </button>
              ))}
            </div>

            {!userContext.username && (
              <div className="mt-8 px-4 py-3 bg-[var(--osrs-orange)]/5 border border-[var(--osrs-orange)]/15 rounded-xl max-w-md">
                <p className="text-sm text-[var(--osrs-orange-light)]">
                  <span className="mr-1.5">💡</span>
                  Enter your RSN in the sidebar for personalized advice based on your stats!
                </p>
              </div>
            )}

            {profile?.memory_notes && (
              <div className="mt-4 px-4 py-3 bg-[var(--osrs-purple)]/5 border border-[var(--osrs-purple)]/15 rounded-xl max-w-md">
                <p className="text-sm text-[var(--osrs-purple)]">
                  <span className="mr-1.5">🧠</span>
                  I remember: {profile.memory_notes}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* ===== Message List ===== */
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((message) => (
              <div key={message.id} className="animate-message-in">
                {message.role === 'user' ? (
                  /* User message bubble */
                  <div className="flex justify-end">
                    <div className="msg-user px-4 py-3 max-w-[80%]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[0.7rem] font-medium text-[var(--osrs-cyan)]">
                          {displayName}
                        </span>
                      </div>
                      <p className="text-[var(--osrs-white)] text-sm leading-relaxed">
                        {message.content}
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Assistant message bubble */
                  <div className="flex justify-start">
                    <div className="flex gap-3 max-w-[85%]">
                      <div className="w-7 h-7 rounded-lg bg-[var(--osrs-yellow)]/10 border border-[var(--osrs-yellow)]/15 flex items-center justify-center flex-shrink-0 mt-1">
                        <Bot className="w-4 h-4 text-[var(--osrs-yellow)]" />
                      </div>
                      <div className="msg-assistant px-4 py-3 flex-1">
                        <MessageContent content={message.content} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex justify-start animate-message-in">
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[var(--osrs-yellow)]/10 border border-[var(--osrs-yellow)]/15 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-[var(--osrs-yellow)]" />
                  </div>
                  <div className="msg-assistant px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--osrs-orange)]" />
                      <span className="text-sm text-gray-400 animate-gentle-pulse">Thinking...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 bg-[var(--osrs-red)]/10 border border-[var(--osrs-red)]/30 rounded-xl text-red-300 max-w-3xl mx-auto mt-4">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">Something went wrong. Please try again.</p>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="px-4 md:px-6 py-4 border-t border-[var(--osrs-border)] bg-[var(--osrs-panel-dark)]">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-2.5">
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about bosses, quests, money making..."
                className="osrs-input w-full py-3 px-4 pr-4 text-sm"
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className={cn(
                'osrs-button px-4 py-3 flex items-center justify-center',
                input.trim() && !isLoading && 'osrs-button-primary'
              )}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-[0.65rem] text-gray-500 mt-2 text-center">
            AI responses may not always be accurate. Verify on the <a href="https://oldschool.runescape.wiki" target="_blank" rel="noopener noreferrer" className="text-[var(--osrs-cyan)] hover:underline">OSRS Wiki</a>.
          </p>
        </form>
      </div>
    </div>
  );
}

// Message content with polished markdown rendering
function MessageContent({ content }: { content: string }) {
  if (!content) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-[var(--osrs-orange)]" />
        <span className="text-sm text-gray-400 animate-gentle-pulse">Generating...</span>
      </div>
    );
  }

  const lines = content.split('\n');
  
  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => {
        // Headers
        if (line.startsWith('### ')) {
          return (
            <h4 key={index} className="text-[var(--osrs-orange)] font-semibold mt-3 mb-1 text-sm">
              {line.slice(4)}
            </h4>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h3 key={index} className="text-[var(--osrs-orange)] font-semibold mt-4 mb-2 text-base">
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <h2
              key={index}
              className="text-[var(--osrs-yellow)] font-bold mt-4 mb-2"
              style={{
                fontFamily: 'var(--font-press-start)',
                fontSize: '11px',
                textShadow: '1px 1px 0 #000',
              }}
            >
              {line.slice(2)}
            </h2>
          );
        }
        
        // Bullet points
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={index} className="flex gap-2.5 ml-1 text-[var(--osrs-white)] text-sm leading-relaxed">
              <span className="text-[var(--osrs-orange)] flex-shrink-0 mt-0.5">▸</span>
              <span>{formatInlineText(line.slice(2))}</span>
            </div>
          );
        }
        
        // Numbered lists
        const numberedMatch = line.match(/^(\d+)\.\s/);
        if (numberedMatch) {
          return (
            <div key={index} className="flex gap-2.5 ml-1 text-[var(--osrs-white)] text-sm leading-relaxed">
              <span className="text-[var(--osrs-orange)] font-medium flex-shrink-0 min-w-[1.2em] text-right">{numberedMatch[1]}.</span>
              <span>{formatInlineText(line.slice(numberedMatch[0].length))}</span>
            </div>
          );
        }
        
        // Empty lines
        if (line.trim() === '') {
          return <div key={index} className="h-2" />;
        }

        // Source/citation lines
        const sourceLine = line.match(/^(?:_?\[?(?:Source|View on Wiki|View on OSRS Wiki)[:\s]*)?(\[([^\]]+)\]\(([^)]+)\))_?$/i)
          || line.match(/^(?:Source|Reference|Wiki)[:\s]+(\[([^\]]+)\]\(([^)]+)\))$/i);
        if (sourceLine) {
          const linkText = sourceLine[2];
          const linkUrl = sourceLine[3];
          return (
            <div key={index} className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--osrs-cyan)]/5 border border-[var(--osrs-cyan)]/15 rounded-lg">
              <span className="text-[var(--osrs-cyan)] text-xs">📖</span>
              <a
                href={linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--osrs-cyan)] hover:text-white text-xs underline decoration-[var(--osrs-cyan)]/40 hover:decoration-white/80 transition-colors"
              >
                {linkText}
              </a>
            </div>
          );
        }
        
        // Regular text
        return (
          <div key={index} className="text-[var(--osrs-white)] text-sm leading-relaxed">
            {formatInlineText(line)}
          </div>
        );
      })}
    </div>
  );
}

// Format inline text with images and styling
function formatInlineText(text: string): React.ReactNode {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = imageRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(formatTextOnly(text.slice(lastIndex, match.index)));
    }
    
    const altText = match[1];
    const imageUrl = match[2];
    parts.push(
      <div key={`img-${match.index}`} className="my-3 inline-block">
        <div className="osrs-card p-2 inline-block">
          <img
            src={imageUrl}
            alt={altText}
            className="max-w-[200px] max-h-[200px] object-contain rounded"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          {altText && (
            <span className="block text-xs text-gray-400 text-center mt-1">{altText}</span>
          )}
        </div>
      </div>
    );
    
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(formatTextOnly(text.slice(lastIndex)));
  }

  return parts.length > 0 ? parts : formatTextOnly(text);
}

// Format text — handles links, bold, italic, code
function formatTextOnly(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|_[^_]+_)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="text-[var(--osrs-yellow)] font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="bg-[var(--osrs-panel)] px-1.5 py-0.5 rounded text-[var(--osrs-orange)] text-xs font-mono border border-[var(--osrs-border)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={index}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--osrs-cyan)] hover:text-white underline decoration-[var(--osrs-cyan)]/40 hover:decoration-white/80 transition-colors"
        >
          {linkMatch[1]}
        </a>
      );
    }
    if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
      const innerLinkMatch = part.slice(1, -1).match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (innerLinkMatch) {
        return (
          <em key={index}>
            <a
              href={innerLinkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--osrs-cyan)] hover:text-white underline decoration-[var(--osrs-cyan)]/40 hover:decoration-white/80 transition-colors"
            >
              {innerLinkMatch[1]}
            </a>
          </em>
        );
      }
      return (
        <em key={index} className="text-gray-400">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}
