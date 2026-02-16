'use client';

import { useState, useRef } from 'react';
import {
  User,
  RefreshCw,
  Upload,
  Swords,
  TrendingUp,
  FileJson,
  CheckCircle,
  AlertCircle,
  Loader2,
  MessageSquare,
  Plus,
  Trash2,
  Clock,
  Brain,
  Cloud,
  CloudOff,
  ChevronDown,
  ChevronRight,
  Shield,
  Star,
  Scroll,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WOMPlayerDetails, WOMGains, CollectionLogData, CollectionLogItem } from '@/lib/types';
import type { ProfileRow } from '@/lib/database.types';
import type { ChatHistoryItem } from '@/hooks/useSupabase';
import { parseCollectionLog, extractRareItems } from '@/lib/parser';

interface SidebarProps {
  username: string;
  setUsername: (username: string) => void;
  stats: WOMPlayerDetails | null;
  gains: WOMGains | null;
  rareItems: CollectionLogItem[];
  collectionLog: CollectionLogData | null;
  onLoadStats: () => void;
  onUpdateStats: () => void;
  onCollectionLogParsed: (data: CollectionLogData, rareItems: CollectionLogItem[]) => void;
  isLoading: boolean;
  chatHistory: ChatHistoryItem[];
  currentChatId: string | null;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  isChatsLoading: boolean;
  isSupabaseConfigured: boolean;
  profile: ProfileRow | null;
}

export default function Sidebar({
  username,
  setUsername,
  stats,
  gains,
  rareItems,
  collectionLog,
  onLoadStats,
  onUpdateStats,
  onCollectionLogParsed,
  isLoading,
  chatHistory,
  currentChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  isChatsLoading,
  isSupabaseConfigured,
  profile,
}: SidebarProps) {
  const [inputValue, setInputValue] = useState(username);
  const [fileStatus, setFileStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(true);
  const [isCollLogOpen, setIsCollLogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      setUsername(inputValue.trim());
      onLoadStats();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileStatus('idle');

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const parsed = parseCollectionLog(json);

      if (parsed) {
        const rare = extractRareItems(parsed);
        onCollectionLogParsed(parsed, rare);
        setFileStatus('success');
      } else {
        setFileStatus('error');
      }
    } catch {
      setFileStatus('error');
    }
  };

  const getTotalLevel = () => {
    if (!stats?.latestSnapshot?.data?.skills) return 0;
    const overall = stats.latestSnapshot.data.skills.overall;
    if (overall && overall.level) {
      return overall.level;
    }
    return 0;
  };

  const getTopGains = () => {
    if (!gains?.data?.skills) return [];
    return Object.entries(gains.data.skills)
      .filter(([, data]) => data.experience.gained > 0)
      .sort((a, b) => b[1].experience.gained - a[1].experience.gained)
      .slice(0, 3);
  };

  const formatXp = (xp: number) => {
    if (xp >= 1000000) return `${(xp / 1000000).toFixed(1)}M`;
    if (xp >= 1000) return `${(xp / 1000).toFixed(1)}K`;
    return xp.toString();
  };

  const handleDeleteClick = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(chatId);
  };

  const confirmDelete = (chatId: string) => {
    onDeleteChat(chatId);
    setShowDeleteConfirm(null);
  };

  const getAccountBadge = (type: string) => {
    switch (type) {
      case 'ironman':
        return 'osrs-badge-iron';
      case 'hardcore':
        return 'osrs-badge-hcim';
      case 'ultimate':
        return 'osrs-badge-uim';
      default:
        return 'osrs-badge-regular';
    }
  };

  return (
    <div className="w-[340px] flex flex-col h-full bg-[var(--osrs-panel)] border-r border-[var(--osrs-border)] overflow-hidden">
      {/* ===== Header / Branding ===== */}
      <div className="px-5 py-5 border-b border-[var(--osrs-border)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--osrs-orange)] to-[var(--osrs-yellow)] flex items-center justify-center shadow-lg shadow-[var(--osrs-orange)]/20">
            <Swords className="w-5 h-5 text-[var(--osrs-bg)]" />
          </div>
          <div className="flex-1">
            <h1
              className="text-[var(--osrs-orange)] leading-tight"
              style={{
                fontFamily: 'var(--font-press-start)',
                fontSize: '11px',
                textShadow: '1px 1px 0 #000',
              }}
            >
              OSRS Helper
            </h1>
            <p className="text-gray-400 text-xs mt-0.5">AI-powered companion</p>
          </div>
          {isSupabaseConfigured ? (
            <div
              className="osrs-tooltip flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--osrs-green)]/10 border border-[var(--osrs-green)]/20"
              data-tooltip="Cloud sync on"
            >
              <Cloud className="w-3.5 h-3.5 text-[var(--osrs-green)]" />
            </div>
          ) : (
            <div
              className="osrs-tooltip flex items-center gap-1 px-2 py-1 rounded-full bg-gray-500/10 border border-gray-500/20"
              data-tooltip="Guest mode"
            >
              <CloudOff className="w-3.5 h-3.5 text-gray-500" />
            </div>
          )}
        </div>
      </div>

      {/* ===== New Chat Button ===== */}
      <div className="px-4 py-3 border-b border-[var(--osrs-border)]">
        <button
          onClick={onNewChat}
          className="osrs-button-primary osrs-button w-full flex items-center justify-center gap-2 py-2.5"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      {/* ===== Chat History ===== */}
      {isSupabaseConfigured && (
        <div className="px-3 py-3 border-b border-[var(--osrs-border)] max-h-52 overflow-y-auto">
          <div className="flex items-center gap-2 mb-2 px-1">
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-[0.7rem] font-medium text-gray-400 uppercase tracking-wider">
              Chat History
            </span>
            {isChatsLoading && (
              <Loader2 className="w-3 h-3 animate-spin text-[var(--osrs-orange)]" />
            )}
          </div>

          {chatHistory.length === 0 ? (
            <p className="text-xs text-gray-500 px-2 py-2 italic">No previous chats</p>
          ) : (
            <div className="space-y-0.5">
              {chatHistory.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  className={cn(
                    'group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150',
                    currentChatId === chat.id
                      ? 'bg-[var(--osrs-orange)]/10 border border-[var(--osrs-orange)]/30'
                      : 'hover:bg-white/[0.03] border border-transparent'
                  )}
                >
                  <MessageSquare
                    className={cn(
                      'w-3.5 h-3.5 flex-shrink-0 transition-colors',
                      currentChatId === chat.id
                        ? 'text-[var(--osrs-orange)]'
                        : 'text-gray-500'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-sm truncate transition-colors',
                        currentChatId === chat.id
                          ? 'text-[var(--osrs-orange-light)]'
                          : 'text-gray-300'
                      )}
                    >
                      {chat.title}
                    </p>
                    <p className="text-[0.65rem] text-gray-500 mt-0.5">{chat.formattedDate}</p>
                  </div>

                  {showDeleteConfirm === chat.id ? (
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDelete(chat.id);
                        }}
                        className="p-1 text-[var(--osrs-green)] hover:text-green-300 transition-colors"
                        title="Confirm delete"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(null);
                        }}
                        className="p-1 text-gray-400 hover:text-gray-300 transition-colors"
                        title="Cancel"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => handleDeleteClick(chat.id, e)}
                      className="p-1 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-[var(--osrs-red)] transition-all"
                      title="Delete chat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== Memory Status ===== */}
      {profile?.memory_notes && (
        <div className="sidebar-section">
          <div className="flex items-center gap-2 mb-1.5">
            <Brain className="w-3.5 h-3.5 text-[var(--osrs-purple)]" />
            <span className="text-[0.7rem] font-medium text-[var(--osrs-purple)] uppercase tracking-wider">
              Memory
            </span>
          </div>
          <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed pl-5">
            {profile.memory_notes}
          </p>
        </div>
      )}

      {/* ===== Player Lookup Section (Collapsible) ===== */}
      <div className="sidebar-section">
        <button
          onClick={() => setIsPlayerOpen(!isPlayerOpen)}
          className="flex items-center gap-2 w-full text-left mb-2 group"
        >
          {isPlayerOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-transform" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-500 transition-transform" />
          )}
          <User className="w-3.5 h-3.5 text-[var(--osrs-orange)]" />
          <span className="text-[0.7rem] font-medium text-gray-400 uppercase tracking-wider group-hover:text-gray-300 transition-colors">
            Player Lookup
          </span>
          {stats && (
            <span className="ml-auto text-[0.65rem] text-[var(--osrs-green)] bg-[var(--osrs-green)]/10 px-1.5 py-0.5 rounded-full">
              Connected
            </span>
          )}
        </button>

        {isPlayerOpen && (
          <div className="animate-fade-in space-y-3">
            <form onSubmit={handleSubmit}>
              <div className="flex gap-2 min-w-0">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="RuneScape username..."
                  className="osrs-input flex-1 min-w-0 text-sm"
                />
                <button
                  type="submit"
                  disabled={isLoading || !inputValue.trim()}
                  className="osrs-button px-2.5 py-2 shrink-0 text-xs"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Look up'
                  )}
                </button>
              </div>
            </form>

            {stats && (
              <>
                {/* Player Card */}
                <div className="osrs-card p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-[var(--osrs-yellow)]" />
                      <span className="text-sm font-semibold text-[var(--osrs-white)]">
                        {stats.displayName}
                      </span>
                    </div>
                    <span className={cn('osrs-badge capitalize', getAccountBadge(stats.type))}>
                      {stats.type}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[var(--osrs-bg)]/50 rounded-md p-2 text-center">
                      <p className="text-[0.65rem] text-gray-500 uppercase tracking-wider">Total</p>
                      <p className="text-lg font-bold text-[var(--osrs-yellow)] osrs-stats">
                        {getTotalLevel().toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-[var(--osrs-bg)]/50 rounded-md p-2 text-center">
                      <p className="text-[0.65rem] text-gray-500 uppercase tracking-wider">Combat</p>
                      <p className="text-lg font-bold text-[var(--osrs-white)]">
                        {stats.combatLevel}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={onUpdateStats}
                    disabled={isLoading}
                    className="osrs-button w-full flex items-center justify-center gap-2 py-1.5 text-sm"
                  >
                    <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
                    Refresh Stats
                  </button>
                </div>

                {/* Weekly Gains */}
                {getTopGains().length > 0 && (
                  <div className="osrs-card p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-3.5 h-3.5 text-[var(--osrs-green)]" />
                      <span className="text-xs font-medium text-gray-400">Weekly Gains</span>
                    </div>
                    <div className="space-y-1.5">
                      {getTopGains().map(([skill, data]) => (
                        <div key={skill} className="flex items-center justify-between">
                          <span className="text-sm text-gray-300 capitalize">{skill}</span>
                          <span className="text-sm font-medium text-[var(--osrs-green)]">
                            +{formatXp(data.experience.gained)} XP
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ===== Collection Log Section (Collapsible) ===== */}
      <div className="sidebar-section">
        <button
          onClick={() => setIsCollLogOpen(!isCollLogOpen)}
          className="flex items-center gap-2 w-full text-left mb-2 group"
        >
          {isCollLogOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-transform" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-500 transition-transform" />
          )}
          <Scroll className="w-3.5 h-3.5 text-[var(--osrs-orange)]" />
          <span className="text-[0.7rem] font-medium text-gray-400 uppercase tracking-wider group-hover:text-gray-300 transition-colors">
            Collection Log
          </span>
          {collectionLog && (
            <span className="ml-auto text-[0.65rem] text-[var(--osrs-yellow)] bg-[var(--osrs-yellow)]/10 px-1.5 py-0.5 rounded-full">
              {collectionLog.uniqueObtained || rareItems.length} items
            </span>
          )}
        </button>

        {isCollLogOpen && (
          <div className="animate-fade-in space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="osrs-button w-full flex items-center justify-center gap-2 text-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              {fileName || 'Upload JSON'}
            </button>

            {fileStatus === 'success' && (
              <div className="flex items-center gap-2 text-[var(--osrs-green)] text-xs px-1">
                <CheckCircle className="w-3.5 h-3.5" />
                Collection log loaded!
              </div>
            )}
            {fileStatus === 'error' && (
              <div className="flex items-center gap-2 text-[var(--osrs-red)] text-xs px-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Failed to parse file
              </div>
            )}

            {/* Rare Items Preview */}
            {rareItems.length > 0 && (
              <div className="osrs-card p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-3.5 h-3.5 text-[var(--osrs-yellow)]" />
                  <span className="text-xs font-medium text-gray-400">
                    Notable Items ({rareItems.length})
                  </span>
                </div>
                <div className="space-y-1">
                  {rareItems.slice(0, 8).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-sm py-0.5"
                    >
                      <span className="text-gray-300 truncate">{item.name}</span>
                      {item.quantity > 1 && (
                        <span className="text-[var(--osrs-orange)] text-xs ml-2 flex-shrink-0">
                          x{item.quantity}
                        </span>
                      )}
                    </div>
                  ))}
                  {rareItems.length > 8 && (
                    <p className="text-xs text-gray-500 pt-1">
                      +{rareItems.length - 8} more items...
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* ===== Footer ===== */}
      <div className="px-5 py-3 border-t border-[var(--osrs-border)]">
        <p className="text-[0.65rem] text-gray-500 text-center">
          Powered by <span className="text-[var(--osrs-orange)]">ShtiiBD</span>
        </p>
      </div>
    </div>
  );
}
