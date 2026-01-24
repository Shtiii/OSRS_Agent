'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  Send,
  Bot,
  Loader2,
  Sparkles,
  AlertCircle,
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
        throw new Error('Failed to get response');
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
    "What boss should I do next?",
    "Best money making method for my stats?",
    "Can I do Vorkath with my gear?",
    "What quests should I complete?",
  ];

  const handleSuggestionClick = (prompt: string) => {
    setInput(prompt);
  };

  const displayName = userContext.stats?.displayName || userContext.username || 'Player';

  return (
    <div className="flex-1 flex flex-col h-full" style={{ backgroundColor: 'var(--osrs-chat)' }}>
      {/* Chat Header - OSRS Style */}
      <div className="px-4 py-3 border-b-2 border-[var(--osrs-border)] osrs-panel">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded border-2 border-[var(--osrs-border-light)] bg-[var(--osrs-panel-dark)] flex items-center justify-center">
            <Bot className="w-6 h-6 text-[var(--osrs-orange)]" />
          </div>
          <div>
            <h2 className="font-semibold text-[var(--osrs-orange)]" style={{ fontFamily: 'var(--font-press-start)', fontSize: '12px', textShadow: '2px 2px 0 #000' }}>
              Wise Old AI
            </h2>
            <p className="text-sm text-gray-300">
              {userContext.username
                ? `Advising ${displayName}`
                : 'Enter username for advice'}
              {profile?.memory_notes && (
                <span className="text-purple-400"> • Memory</span>
              )}
            </p>
          </div>
          {userContext.stats && (
            <div className="ml-auto flex items-center gap-2 text-sm">
              <span className="px-2 py-1 rounded bg-[var(--osrs-panel-dark)] border border-[var(--osrs-border)] text-[var(--osrs-yellow)]" style={{ textShadow: '1px 1px 0 #000' }}>
                Cmb {userContext.stats.combatLevel}
              </span>
              <span className={cn(
                'px-2 py-1 rounded capitalize border border-[var(--osrs-border)]',
                userContext.stats.type === 'ironman' && 'bg-gray-700 text-gray-300',
                userContext.stats.type === 'hardcore' && 'bg-red-900/50 text-red-400',
                userContext.stats.type === 'ultimate' && 'bg-purple-900/50 text-purple-400',
                userContext.stats.type === 'regular' && 'bg-[var(--osrs-panel-dark)] text-[var(--osrs-green)]',
              )}>
                {userContext.stats.type}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Messages Area - OSRS Chatbox Style */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {isDbLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--osrs-orange)]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-lg osrs-panel flex items-center justify-center mb-4">
              <Sparkles className="w-10 h-10 text-[var(--osrs-yellow)]" />
            </div>
            <h3 className="text-xl font-semibold text-[var(--osrs-orange)] mb-2" style={{ fontFamily: 'var(--font-press-start)', fontSize: '14px', textShadow: '2px 2px 0 #000' }}>
              Welcome, Adventurer!
            </h3>
            <p className="text-gray-300 max-w-md mb-6">
              I can help with boss strategies, gear setups, quest requirements,
              and money making methods.
            </p>

            <div className="grid grid-cols-2 gap-3 max-w-lg">
              {suggestedPrompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(prompt)}
                  className="osrs-button p-3 text-left text-sm"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {!userContext.username && (
              <div className="mt-6 p-4 bg-[var(--osrs-panel-dark)] border-2 border-[var(--osrs-orange)] rounded max-w-md">
                <p className="text-[var(--osrs-yellow)] text-sm" style={{ textShadow: '1px 1px 0 #000' }}>
                  💡 Enter your RuneScape username in the sidebar for personalized advice!
                </p>
              </div>
            )}

            {profile?.memory_notes && (
              <div className="mt-4 p-4 bg-purple-900/20 border-2 border-purple-600 rounded max-w-md">
                <p className="text-purple-300 text-sm">
                  🧠 I remember: {profile.memory_notes}
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div key={message.id} className="py-1">
                {message.role === 'user' ? (
                  // User message - OSRS player chat style (cyan)
                  <div className="flex items-start gap-1">
                    <span className="text-[var(--osrs-cyan)] font-bold" style={{ textShadow: '1px 1px 0 #000' }}>
                      {displayName}:
                    </span>
                    <span className="text-[var(--osrs-white)]" style={{ textShadow: '1px 1px 0 #000' }}>
                      {message.content}
                    </span>
                  </div>
                ) : (
                  // AI message - OSRS system/NPC style (yellow)
                  <div className="pl-2 border-l-2 border-[var(--osrs-orange)]/30">
                    <MessageContent content={message.content} />
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="py-1 pl-2 border-l-2 border-[var(--osrs-orange)]/30">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--osrs-orange)]" />
                  <span className="text-[var(--osrs-orange)]" style={{ textShadow: '1px 1px 0 #000' }}>Thinking...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 bg-[var(--osrs-red)]/20 border-2 border-[var(--osrs-red)] rounded text-red-300">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>Something went wrong. Please try again.</p>
          </div>
        )}
      </div>

      {/* Input Area - OSRS Chat Input Style */}
      <div className="px-4 py-3 border-t-2 border-[var(--osrs-border)]" style={{ backgroundColor: '#1a1a1a' }}>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message here..."
              className="osrs-input w-full rounded py-2.5 px-3"
              disabled={isLoading}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="osrs-button px-4 py-2.5 rounded flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-2 text-center">
          AI responses may not always be accurate. Verify on OSRS Wiki.
        </p>
      </div>
    </div>
  );
}

// Message content with OSRS-styled markdown rendering
function MessageContent({ content }: { content: string }) {
  if (!content) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-[var(--osrs-orange)]" />
        <span className="text-gray-400">Generating...</span>
      </div>
    );
  }

  const lines = content.split('\n');
  
  return (
    <div className="space-y-1">
      {lines.map((line, index) => {
        // Headers - OSRS Orange/Yellow
        if (line.startsWith('### ')) {
          return (
            <h4 key={index} className="text-[var(--osrs-orange)] font-semibold mt-3 mb-1 text-sm" style={{ textShadow: '1px 1px 0 #000' }}>
              {line.slice(4)}
            </h4>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h3 key={index} className="text-[var(--osrs-orange)] font-semibold mt-4 mb-2 text-base" style={{ textShadow: '1px 1px 0 #000' }}>
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <h2 key={index} className="text-[var(--osrs-yellow)] font-bold mt-4 mb-2 text-lg" style={{ fontFamily: 'var(--font-press-start)', fontSize: '12px', textShadow: '2px 2px 0 #000' }}>
              {line.slice(2)}
            </h2>
          );
        }
        
        // Bullet points
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={index} className="flex gap-2 ml-2 text-[var(--osrs-yellow)]" style={{ textShadow: '1px 1px 0 #000' }}>
              <span className="text-[var(--osrs-orange)]">►</span>
              <span>{formatInlineText(line.slice(2))}</span>
            </div>
          );
        }
        
        // Numbered lists
        const numberedMatch = line.match(/^(\d+)\.\s/);
        if (numberedMatch) {
          return (
            <div key={index} className="flex gap-2 ml-2 text-[var(--osrs-yellow)]" style={{ textShadow: '1px 1px 0 #000' }}>
              <span className="text-[var(--osrs-orange)]">{numberedMatch[1]}.</span>
              <span>{formatInlineText(line.slice(numberedMatch[0].length))}</span>
            </div>
          );
        }
        
        // Empty lines
        if (line.trim() === '') {
          return <div key={index} className="h-2" />;
        }
        
        // Regular text - Yellow like NPC dialogue (use div to allow block children)
        return (
          <div key={index} className="text-[var(--osrs-yellow)]" style={{ textShadow: '1px 1px 0 #000' }}>
            {formatInlineText(line)}
          </div>
        );
      })}
    </div>
  );
}

// Format inline text with images and styling
function formatInlineText(text: string): React.ReactNode {
  // Check for markdown images: ![alt](url)
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
        <div className="border-2 border-[var(--osrs-border-light)] bg-[var(--osrs-panel-dark)] rounded p-2 inline-block">
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
            <span className="block text-xs text-[var(--osrs-orange)] text-center mt-1">{altText}</span>
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

// Format text without images
function formatTextOnly(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="text-[var(--osrs-white)] font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="bg-[var(--osrs-panel-dark)] px-1 py-0.5 rounded text-[var(--osrs-green)] text-xs border border-[var(--osrs-border)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
