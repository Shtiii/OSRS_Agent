'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from './Sidebar';
import Chat from './Chat';
import type { WOMPlayerDetails, WOMGains, CollectionLogData, CollectionLogItem, UserContext } from '@/lib/types';

export default function Dashboard() {
  const [username, setUsername] = useState('');
  const [stats, setStats] = useState<WOMPlayerDetails | null>(null);
  const [gains, setGains] = useState<WOMGains | null>(null);
  const [collectionLog, setCollectionLog] = useState<CollectionLogData | null>(null);
  const [rareItems, setRareItems] = useState<CollectionLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
      } else {
        console.error('Failed to load player stats');
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, [username]);

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
    },
    []
  );

  // Load stats when username changes
  useEffect(() => {
    if (username) {
      loadStats();
    }
  }, [username, loadStats]);

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
      />
      <Chat userContext={userContext} />
    </div>
  );
}
