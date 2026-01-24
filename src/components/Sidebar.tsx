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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WOMPlayerDetails, WOMGains, CollectionLogData, CollectionLogItem } from '@/lib/types';
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
}: SidebarProps) {
  const [inputValue, setInputValue] = useState(username);
  const [fileStatus, setFileStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
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

  // FIX: This now looks directly at skills.overall instead of "computed"
  const getTotalLevel = () => {
    if (!stats?.latestSnapshot?.data?.skills) return 0;
    
    // The API puts the total level here:
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

  return (
    <div className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-xl font-bold text-amber-500 flex items-center gap-2">
          <Swords className="w-6 h-6" />
          OSRS Helper
        </h1>
        <p className="text-gray-400 text-sm mt-1">Your AI-powered companion</p>
      </div>

      {/* Username Input */}
      <div className="p-4 border-b border-gray-800">
        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <User className="w-4 h-4 inline mr-1" />
            RuneScape Username
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter username..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className={cn(
                'px-3 py-2 rounded-lg font-medium transition-colors',
                isLoading || !inputValue.trim()
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-amber-600 text-white hover:bg-amber-500'
              )}
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
            className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            Update Stats
          </button>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="p-4 border-b border-gray-800 space-y-3">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Total Level</span>
              <span className="text-amber-500 font-bold text-lg">
                {getTotalLevel().toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-gray-400 text-sm">Combat Level</span>
              <span className="text-white font-medium">{stats.combatLevel}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-gray-400 text-sm">Account Type</span>
              <span className={cn(
                'text-sm font-medium capitalize',
                stats.type === 'ironman' && 'text-gray-300',
                stats.type === 'hardcore' && 'text-red-400',
                stats.type === 'ultimate' && 'text-purple-400',
                stats.type === 'regular' && 'text-green-400',
              )}>
                {stats.type}
              </span>
            </div>
          </div>

          {/* Recent Gains */}
          {getTopGains().length > 0 && (
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-gray-400 text-sm">Weekly Gains</span>
              </div>
              <div className="space-y-1">
                {getTopGains().map(([skill, data]) => (
                  <div
                    key={skill}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-300 capitalize">{skill}</span>
                    <span className="text-green-400 font-medium">
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
      <div className="p-4 border-b border-gray-800">
        <label className="block text-sm font-medium text-gray-300 mb-2">
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
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-dashed border-gray-600 rounded-lg text-gray-300 transition-colors"
        >
          <Upload className="w-4 h-4" />
          {fileName || 'Upload collectionlog.json'}
        </button>
        
        {fileStatus === 'success' && (
          <div className="mt-2 flex items-center gap-2 text-green-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            Collection log loaded successfully
          </div>
        )}
        {fileStatus === 'error' && (
          <div className="mt-2 flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            Failed to parse collection log
          </div>
        )}

        {collectionLog && (
          <div className="mt-2 text-sm text-gray-400">
            {collectionLog.uniqueObtained || rareItems.length} unique items loaded
          </div>
        )}
      </div>

      {/* Rare Items Preview */}
      {rareItems.length > 0 && (
        <div className="p-4 flex-1 overflow-y-auto">
          <h3 className="text-sm font-medium text-gray-300 mb-2">
            Notable Items ({rareItems.length})
          </h3>
          <div className="space-y-1">
            {rareItems.slice(0, 10).map((item) => (
              <div
                key={item.id}
                className="text-sm text-gray-400 flex items-center justify-between"
              >
                <span className="truncate">{item.name}</span>
                {item.quantity > 1 && (
                  <span className="text-gray-500 ml-2">x{item.quantity}</span>
                )}
              </div>
            ))}
            {rareItems.length > 10 && (
              <div className="text-sm text-gray-500">
                +{rareItems.length - 10} more...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="p-4 border-t border-gray-800 mt-auto">
        <p className="text-xs text-gray-500 text-center">
          Powered by Wise Old Man & OSRS Wiki
        </p>
      </div>
    </div>
  );
}