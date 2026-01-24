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

  return (
    <div className="w-96 osrs-panel flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b-2 border-[var(--osrs-border)]">
        <h1 className="text-xl font-bold text-[var(--osrs-orange)] flex items-center gap-2" style={{ fontFamily: 'var(--font-press-start)', fontSize: '14px' }}>
          <Swords className="w-6 h-6" />
          OSRS Helper
        </h1>
        <div className="flex items-center gap-2 mt-2">
          <p className="text-[var(--osrs-yellow)] text-sm" style={{ textShadow: '1px 1px 0 #000' }}>Your AI companion</p>
          {isSupabaseConfigured ? (
            <div className="flex items-center gap-1 text-[var(--osrs-green)]" title="Cloud sync enabled">
              <Cloud className="w-3 h-3" />
            </div>
          ) : (
            <div className="flex items-center gap-1 text-gray-500" title="Guest mode - no sync">
              <CloudOff className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>

      {/* New Chat Button */}
      <div className="px-6 py-3 border-b-2 border-[var(--osrs-border)]">
        <button
          onClick={onNewChat}
          className="osrs-button w-full flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Chat
        </button>
      </div>

      {/* Chat History */}
      {isSupabaseConfigured && (
        <div className="px-4 py-3 border-b-2 border-[var(--osrs-border)] max-h-48 overflow-y-auto">
          <div className="flex items-center gap-2 mb-2 px-2">
            <Clock className="w-4 h-4 text-[var(--osrs-orange)]" />
            <span className="text-sm font-medium text-[var(--osrs-yellow)]" style={{ textShadow: '1px 1px 0 #000' }}>History</span>
            {isChatsLoading && <Loader2 className="w-3 h-3 animate-spin text-[var(--osrs-orange)]" />}
          </div>
          
          {chatHistory.length === 0 ? (
            <p className="text-xs text-gray-400 px-2">No previous chats</p>
          ) : (
            <div className="space-y-1">
              {chatHistory.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  className={cn(
                    'group flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition-colors',
                    currentChatId === chat.id
                      ? 'bg-[var(--osrs-panel-dark)] border border-[var(--osrs-orange)]'
                      : 'hover:bg-[var(--osrs-panel-dark)] border border-transparent'
                  )}
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0 text-[var(--osrs-orange)]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate text-[var(--osrs-white)]">{chat.title}</p>
                    <p className="text-xs text-gray-400">{chat.formattedDate}</p>
                  </div>
                  
                  {showDeleteConfirm === chat.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDelete(chat.id);
                        }}
                        className="p-1 text-[var(--osrs-green)] hover:text-green-300"
                        title="Confirm delete"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(null);
                        }}
                        className="p-1 text-gray-400 hover:text-gray-300"
                        title="Cancel"
                      >
                        <AlertCircle className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => handleDeleteClick(chat.id, e)}
                      className="p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-[var(--osrs-red)] transition-opacity"
                      title="Delete chat"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Memory Status */}
      {profile?.memory_notes && (
        <div className="px-6 py-3 border-b-2 border-[var(--osrs-border)]">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-[var(--osrs-yellow)]" style={{ textShadow: '1px 1px 0 #000' }}>Memory</span>
          </div>
          <p className="text-xs text-gray-300 line-clamp-2">{profile.memory_notes}</p>
        </div>
      )}

      {/* Username Input */}
      <div className="p-6 border-b-2 border-[var(--osrs-border)]">
        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-[var(--osrs-yellow)] mb-2" style={{ textShadow: '1px 1px 0 #000' }}>
            <User className="w-4 h-4 inline mr-1" />
            RuneScape Username
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter username..."
              className="osrs-input flex-1 rounded"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="osrs-button px-4 py-2 rounded shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Load'
              )}
            </button>
          </div>
        </form>

        {stats && (
          <button
            onClick={onUpdateStats}
            disabled={isLoading}
            className="osrs-button mt-2 w-full flex items-center justify-center gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            Update Stats
          </button>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="p-6 border-b-2 border-[var(--osrs-border)] space-y-3">
          <div className="bg-[var(--osrs-panel-dark)] rounded p-3 border border-[var(--osrs-border)]">
            <div className="flex items-center justify-between">
              <span className="text-gray-300 text-sm">Total Level</span>
              <span className="osrs-stats text-lg">
                {getTotalLevel().toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-gray-300 text-sm">Combat Level</span>
              <span className="text-[var(--osrs-white)] font-medium">{stats.combatLevel}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-gray-300 text-sm">Account Type</span>
              <span className={cn(
                'text-sm font-medium capitalize',
                stats.type === 'ironman' && 'text-gray-300',
                stats.type === 'hardcore' && 'text-red-400',
                stats.type === 'ultimate' && 'text-purple-400',
                stats.type === 'regular' && 'text-[var(--osrs-green)]',
              )}>
                {stats.type}
              </span>
            </div>
          </div>

          {/* Recent Gains */}
          {getTopGains().length > 0 && (
            <div className="bg-[var(--osrs-panel-dark)] rounded p-3 border border-[var(--osrs-border)]">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-[var(--osrs-green)]" />
                <span className="text-[var(--osrs-yellow)] text-sm" style={{ textShadow: '1px 1px 0 #000' }}>Weekly Gains</span>
              </div>
              <div className="space-y-1">
                {getTopGains().map(([skill, data]) => (
                  <div
                    key={skill}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-300 capitalize">{skill}</span>
                    <span className="text-[var(--osrs-green)] font-medium">
                      +{formatXp(data.experience.gained)} XP
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collection Log Upload */}
      <div className="p-6 border-b-2 border-[var(--osrs-border)]">
        <label className="block text-sm font-medium text-[var(--osrs-yellow)] mb-2" style={{ textShadow: '1px 1px 0 #000' }}>
          <FileJson className="w-4 h-4 inline mr-1" />
          Collection Log JSON
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="osrs-button w-full flex items-center justify-center gap-2"
        >
          <Upload className="w-4 h-4" />
          {fileName || 'Upload collectionlog.json'}
        </button>
        
        {fileStatus === 'success' && (
          <div className="mt-2 flex items-center gap-2 text-[var(--osrs-green)] text-sm">
            <CheckCircle className="w-4 h-4" />
            Collection log loaded!
          </div>
        )}
        {fileStatus === 'error' && (
          <div className="mt-2 flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            Failed to parse file
          </div>
        )}

        {collectionLog && (
          <div className="mt-2 text-sm text-gray-300">
            {collectionLog.uniqueObtained || rareItems.length} unique items loaded
          </div>
        )}
      </div>

      {/* Rare Items Preview */}
      {rareItems.length > 0 && (
        <div className="p-6 flex-1 overflow-y-auto">
          <h3 className="text-sm font-medium text-[var(--osrs-yellow)] mb-2" style={{ textShadow: '1px 1px 0 #000' }}>
            Notable Items ({rareItems.length})
          </h3>
          <div className="space-y-1">
            {rareItems.slice(0, 10).map((item) => (
              <div
                key={item.id}
                className="text-sm text-gray-300 flex items-center justify-between"
              >
                <span className="truncate">{item.name}</span>
                {item.quantity > 1 && (
                  <span className="text-[var(--osrs-orange)] ml-2">x{item.quantity}</span>
                )}
              </div>
            ))}
            {rareItems.length > 10 && (
              <div className="text-sm text-gray-400">
                +{rareItems.length - 10} more...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="p-4 border-t-2 border-[var(--osrs-border)] mt-auto">
        <p className="text-xs text-gray-400 text-center">
          Powered by Wise Old Man & OSRS Wiki
        </p>
      </div>
    </div>
  );
}
