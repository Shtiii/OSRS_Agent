'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  Search,
  BookOpen,
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
  dbId?: string; // Database ID for updating
}

interface ChatProps {
  userContext: UserContext;
  // New props for persistence
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

  // Supabase hooks for message persistence
  const { 
    messages: dbMessages, 
    isLoading: isDbLoading, 
    saveMessage, 
    saveMessageToChat,
    updateMessage,
    fetchMessages 
  } = useMessages(chatId);

  // Scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load messages from database when chatId changes
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
      // New chat - clear messages
      setMessages([]);
      setIsFirstMessage(true);
    }
  }, [chatId, dbMessages]);

  // Save assistant message when streaming completes (accepts explicit chatId)
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

    // If this is the first message, create a new chat
    let currentChatId = chatId;
    if (isFirstMessage && !chatId) {
      currentChatId = await onCreateChat(userMessageContent);
      setIsFirstMessage(false);
    }

    // Save user message to database (use saveMessageToChat with explicit chatId for new chats)
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
      // Only include messages with non-empty content and valid roles
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

      // Save assistant message to database after streaming completes
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

  return (
    <div className="flex-1 flex flex-col bg-gray-950 h-full">
      {/* Chat Header */}
      <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center">
            <Bot className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h2 className="font-semibold text-white">OSRS AI Assistant</h2>
            <p className="text-sm text-gray-400">
              {userContext.username
                ? `Helping ${userContext.stats?.displayName || userContext.username}`
                : 'Enter your username to get personalized advice'}
              {profile?.memory_notes && (
                <span className="text-purple-400"> • Memory active</span>
              )}
            </p>
          </div>
          {userContext.stats && (
            <div className="ml-auto flex items-center gap-2 text-sm">
              <span className="px-2 py-1 rounded bg-gray-800 text-gray-300">
                Combat {userContext.stats.combatLevel}
              </span>
              <span className={cn(
                'px-2 py-1 rounded capitalize',
                userContext.stats.type === 'ironman' && 'bg-gray-700 text-gray-300',
                userContext.stats.type === 'hardcore' && 'bg-red-900/50 text-red-400',
                userContext.stats.type === 'ultimate' && 'bg-purple-900/50 text-purple-400',
                userContext.stats.type === 'regular' && 'bg-green-900/50 text-green-400',
              )}>
                {userContext.stats.type}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {isDbLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-amber-600/20 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Welcome to OSRS Helper!
            </h3>
            <p className="text-gray-400 max-w-md mb-6">
              I can help you with boss strategies, gear setups, quest requirements,
              and money making methods. Ask me anything about OSRS!
            </p>

            <div className="grid grid-cols-2 gap-3 max-w-lg">
              {suggestedPrompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(prompt)}
                  className="p-3 text-left text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-300 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {!userContext.username && (
              <div className="mt-6 p-4 bg-amber-900/20 border border-amber-800/50 rounded-lg max-w-md">
                <p className="text-amber-400 text-sm">
                  💡 Enter your RuneScape username in the sidebar to get
                  personalized advice based on your stats!
                </p>
              </div>
            )}

            {profile?.memory_notes && (
              <div className="mt-4 p-4 bg-purple-900/20 border border-purple-800/50 rounded-lg max-w-md">
                <p className="text-purple-400 text-sm">
                  🧠 I remember: {profile.memory_notes}
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-amber-600/20 flex-shrink-0 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-amber-500" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[70%] rounded-lg px-4 py-3',
                    message.role === 'user'
                      ? 'bg-amber-600 text-white'
                      : 'bg-gray-800 text-gray-100'
                  )}
                >
                  <MessageContent content={message.content} />
                </div>
                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-gray-700 flex-shrink-0 flex items-center justify-center">
                    <User className="w-5 h-5 text-gray-300" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-600/20 flex-shrink-0 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-amber-500" />
                </div>
                <div className="bg-gray-800 rounded-lg px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                  <span className="text-gray-400">Thinking...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-900/20 border border-red-800/50 rounded-lg text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>Something went wrong. Please try again.</p>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about bosses, gear, quests, or strategies..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-4 pr-12 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              disabled={isLoading}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 text-gray-500">
              <Search className="w-4 h-4" />
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={cn(
              'px-4 py-3 rounded-lg font-medium transition-colors flex items-center gap-2',
              isLoading || !input.trim()
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-amber-600 text-white hover:bg-amber-500'
            )}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-2 text-center">
          AI responses may not always be accurate. Verify important information on the OSRS Wiki.
        </p>
      </div>
    </div>
  );
}

// Component to render message content with markdown-like formatting
function MessageContent({ content }: { content: string }) {
  if (!content) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
        <span className="text-gray-400">Generating response...</span>
      </div>
    );
  }

  // Simple markdown parsing for headers, bold, and lists
  const lines = content.split('\n');
  
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      {lines.map((line, index) => {
        // Headers
        if (line.startsWith('### ')) {
          return (
            <h4 key={index} className="text-amber-400 font-semibold mt-3 mb-1 text-sm">
              {line.slice(4)}
            </h4>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h3 key={index} className="text-amber-400 font-semibold mt-4 mb-2 text-base">
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <h2 key={index} className="text-amber-400 font-bold mt-4 mb-2 text-lg">
              {line.slice(2)}
            </h2>
          );
        }
        
        // Bullet points
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={index} className="flex gap-2 ml-2">
              <span className="text-amber-500">•</span>
              <span>{formatInlineText(line.slice(2))}</span>
            </div>
          );
        }
        
        // Numbered lists
        const numberedMatch = line.match(/^(\d+)\.\s/);
        if (numberedMatch) {
          return (
            <div key={index} className="flex gap-2 ml-2">
              <span className="text-amber-500">{numberedMatch[1]}.</span>
              <span>{formatInlineText(line.slice(numberedMatch[0].length))}</span>
            </div>
          );
        }
        
        // Empty lines
        if (line.trim() === '') {
          return <div key={index} className="h-2" />;
        }
        
        // Regular paragraphs
        return (
          <p key={index} className="my-1">
            {formatInlineText(line)}
          </p>
        );
      })}
    </div>
  );
}

// Format inline text (bold, italic, code, images)
function formatInlineText(text: string): React.ReactNode {
  // Check for markdown images first: ![alt](url)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = imageRegex.exec(text)) !== null) {
    // Add text before the image
    if (match.index > lastIndex) {
      parts.push(formatTextOnly(text.slice(lastIndex, match.index)));
    }
    
    // Add the image
    const altText = match[1];
    const imageUrl = match[2];
    parts.push(
      <div key={`img-${match.index}`} className="my-3 inline-block">
        <div className="border-2 border-amber-600/50 bg-black/40 rounded-lg p-2 inline-block">
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
            <p className="text-xs text-gray-400 text-center mt-1">{altText}</p>
          )}
        </div>
      </div>
    );
    
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last image
  if (lastIndex < text.length) {
    parts.push(formatTextOnly(text.slice(lastIndex)));
  }

  return parts.length > 0 ? parts : formatTextOnly(text);
}

// Format text without images (bold, code)
function formatTextOnly(text: string): React.ReactNode {
  // Simple bold and code formatting
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="text-white font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="bg-gray-700 px-1 py-0.5 rounded text-amber-300 text-xs"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
