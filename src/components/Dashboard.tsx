'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from './Sidebar';
import Chat from './Chat';
import { useChats, useProfile, ChatHistoryItem } from '@/hooks/useSupabase';
import type { WOMPlayerDetails, WOMGains, CollectionLogData, CollectionLogItem, UserContext } from '@/lib/types';

export default function Dashboard() {
  // Player context state
  const [username, setUsername] = useState('');
  const [stats, setStats] = useState<WOMPlayerDetails | null>(null);
  const [gains, setGains] = useState<WOMGains | null>(null);
  const [collectionLog, setCollectionLog] = useState<CollectionLogData | null>(null);
  const [rareItems, setRareItems] = useState<CollectionLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Chat state management
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  // Supabase hooks
  const { 
    chats, 
    isLoading: isChatsLoading, 
    createChat, 
    updateChatTitle, 
    deleteChat,
    fetchChats,
    isConfigured: isSupabaseConfigured 
  } = useChats();
  
  const { 
    profile, 
    upsertProfile, 
    isConfigured: isProfileConfigured 
  } = useProfile();

  // Derive user context for the chat
  const userContext: UserContext = {
    username: username || null,
    stats,
    gains,
    collectionLog,
    rareItems,
    accountType: stats?.type || null,
  };

  // Load stats from API
  const loadStats = useCallback(async () => {
    if (!username) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/player?username=${encodeURIComponent(username)}`);
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
        setGains(data.gains);

        // If Supabase is configured, update the profile with this username
        if (isProfileConfigured && data.stats) {
          upsertProfile({
            osrs_username: username,
            account_type: data.stats.type,
            combat_level: data.stats.combatLevel,
            total_level: data.stats.latestSnapshot?.data?.skills?.overall?.level || null,
          });
        }
      } else {
        console.error('Failed to load player stats');
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, [username, isProfileConfigured, upsertProfile]);

  // Update stats (force refresh from hiscores)
  const updateStats = useCallback(async () => {
    if (!username) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
        setGains(data.gains);
      } else {
        console.error('Failed to update player stats');
      }
    } catch (error) {
      console.error('Error updating stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, [username]);

  // Handle collection log parsing
  const handleCollectionLogParsed = useCallback(
    (data: CollectionLogData, items: CollectionLogItem[]) => {
      setCollectionLog(data);
      setRareItems(items);

      // If Supabase is configured, update notable items in profile
      if (isProfileConfigured) {
        const itemNames = items.slice(0, 50).map(item => item.name);
        upsertProfile({ notable_items: itemNames });
      }
    },
    [isProfileConfigured, upsertProfile]
  );

  // Handle new chat creation
  const handleNewChat = useCallback(() => {
    setCurrentChatId(null);
  }, []);

  // Handle chat selection from history
  const handleSelectChat = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
  }, []);

  // Handle chat creation (called from Chat component when first message is sent)
  const handleCreateChat = useCallback(async (firstMessage: string): Promise<string | null> => {
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');
    const newChatId = await createChat(title, username || undefined);
    if (newChatId) {
      setCurrentChatId(newChatId);
    }
    return newChatId;
  }, [createChat, username]);

  // Handle chat title update
  const handleUpdateChatTitle = useCallback(async (chatId: string, title: string) => {
    await updateChatTitle(chatId, title);
  }, [updateChatTitle]);

  // Handle chat deletion
  const handleDeleteChat = useCallback(async (chatId: string) => {
    await deleteChat(chatId);
    if (currentChatId === chatId) {
      setCurrentChatId(null);
    }
  }, [deleteChat, currentChatId]);

  // Load stats when username changes
  useEffect(() => {
    if (username) {
      loadStats();
    }
  }, [username, loadStats]);

  // Restore username from profile if available
  useEffect(() => {
    if (profile?.osrs_username && !username) {
      setUsername(profile.osrs_username);
    }
  }, [profile, username]);

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      <Sidebar
        username={username}
        setUsername={setUsername}
        stats={stats}
        gains={gains}
        rareItems={rareItems}
        collectionLog={collectionLog}
        onLoadStats={loadStats}
        onUpdateStats={updateStats}
        onCollectionLogParsed={handleCollectionLogParsed}
        isLoading={isLoading}
        // New props for chat history
        chatHistory={chats}
        currentChatId={currentChatId}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        isChatsLoading={isChatsLoading}
        isSupabaseConfigured={isSupabaseConfigured}
        profile={profile}
      />
      <Chat 
        userContext={userContext} 
        // New props for persistence
        chatId={currentChatId}
        onCreateChat={handleCreateChat}
        onUpdateChatTitle={handleUpdateChatTitle}
        profile={profile}
      />
    </div>
  );
}
