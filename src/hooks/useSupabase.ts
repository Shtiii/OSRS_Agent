'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient, getAnonymousId, isSupabaseConfigured, formatChatDate } from '@/lib/supabase';
import type { ProfileRow } from '@/lib/database.types';

// ============================================
// Types
// ============================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatHistoryItem {
  id: string;
  title: string;
  created_at: string;
  formattedDate: string;
}

interface ChatSelectResult {
  id: string;
  title: string;
  created_at: string;
}

interface MessageSelectResult {
  id: string;
  role: string;
  content: string;
}

// ============================================
// useChats Hook - Manages chat history
// ============================================

export function useChats() {
  const [chats, setChats] = useState<ChatHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChats = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      // Guest mode - no persistence
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const anonymousId = getAnonymousId();
      
      // First try to get user's chats if authenticated
      const { data: { user } } = await supabase.auth.getUser();
      
      // Build the query - use type assertion for flexibility
      let query = (supabase as any)
        .from('chats')
        .select('id, title, created_at')
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (user) {
        query = query.eq('user_id', user.id);
      } else {
        query = query.eq('anonymous_id', anonymousId);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        console.error('Error fetching chats:', queryError);
        setError('Failed to load chat history');
        return;
      }

      const chatData = data as ChatSelectResult[] | null;

      setChats(
        (chatData || []).map((chat) => ({
          id: chat.id,
          title: chat.title || 'New Chat',
          created_at: chat.created_at,
          formattedDate: formatChatDate(chat.created_at),
        }))
      );
    } catch (err) {
      console.error('Error in fetchChats:', err);
      setError('Failed to load chat history');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createChat = useCallback(async (title: string, osrsUsername?: string): Promise<string | null> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      // Guest mode - return a local ID
      return `local_${Date.now()}`;
    }

    try {
      const anonymousId = getAnonymousId();
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error: insertError } = await (supabase as any)
        .from('chats')
        .insert({
          user_id: user?.id || null,
          anonymous_id: user ? null : anonymousId,
          title: title.slice(0, 100),
          osrs_username: osrsUsername || null,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Error creating chat:', insertError);
        return null;
      }

      // Refresh the chat list
      await fetchChats();

      return data?.id || null;
    } catch (err) {
      console.error('Error in createChat:', err);
      return null;
    }
  }, [fetchChats]);

  const updateChatTitle = useCallback(async (chatId: string, title: string) => {
    const supabase = getSupabaseClient();
    if (!supabase || chatId.startsWith('local_')) {
      return;
    }

    try {
      await (supabase as any)
        .from('chats')
        .update({ title: title.slice(0, 100) })
        .eq('id', chatId);

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId ? { ...chat, title } : chat
        )
      );
    } catch (err) {
      console.error('Error updating chat title:', err);
    }
  }, []);

  const deleteChat = useCallback(async (chatId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase || chatId.startsWith('local_')) {
      return;
    }

    try {
      await (supabase as any).from('chats').delete().eq('id', chatId);
      setChats((prev) => prev.filter((chat) => chat.id !== chatId));
    } catch (err) {
      console.error('Error deleting chat:', err);
    }
  }, []);

  // Fetch chats on mount
  useEffect(() => {
    if (isSupabaseConfigured()) {
      fetchChats();
    }
  }, [fetchChats]);

  return {
    chats,
    isLoading,
    error,
    fetchChats,
    createChat,
    updateChatTitle,
    deleteChat,
    isConfigured: isSupabaseConfigured(),
  };
}

// ============================================
// useMessages Hook - Manages messages for a chat
// ============================================

export function useMessages(chatId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!chatId || chatId.startsWith('local_')) {
      setMessages([]);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await (supabase as any)
        .from('messages')
        .select('id, role, content')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        return;
      }

      const messageData = data as MessageSelectResult[] | null;

      setMessages(
        (messageData || [])
          .filter((msg) => msg.role !== 'system')
          .map((msg) => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }))
      );
    } catch (err) {
      console.error('Error in fetchMessages:', err);
    } finally {
      setIsLoading(false);
    }
  }, [chatId]);

  const saveMessage = useCallback(async (
    role: 'user' | 'assistant',
    content: string
  ): Promise<string | null> => {
    if (!chatId || chatId.startsWith('local_')) {
      return `local_msg_${Date.now()}`;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return `local_msg_${Date.now()}`;
    }

    try {
      const { data, error } = await (supabase as any)
        .from('messages')
        .insert({
          chat_id: chatId,
          role,
          content,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error saving message:', error);
        return null;
      }

      return data?.id || null;
    } catch (err) {
      console.error('Error in saveMessage:', err);
      return null;
    }
  }, [chatId]);

  // Save message with explicit chatId (for when new chat is created mid-flow)
  const saveMessageToChat = useCallback(async (
    targetChatId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<string | null> => {
    if (!targetChatId || targetChatId.startsWith('local_')) {
      return `local_msg_${Date.now()}`;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return `local_msg_${Date.now()}`;
    }

    try {
      const { data, error } = await (supabase as any)
        .from('messages')
        .insert({
          chat_id: targetChatId,
          role,
          content,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error saving message to chat:', error);
        return null;
      }

      return data?.id || null;
    } catch (err) {
      console.error('Error in saveMessageToChat:', err);
      return null;
    }
  }, []);

  const updateMessage = useCallback(async (messageId: string, content: string) => {
    if (messageId.startsWith('local_')) {
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    try {
      await (supabase as any)
        .from('messages')
        .update({ content })
        .eq('id', messageId);
    } catch (err) {
      console.error('Error updating message:', err);
    }
  }, []);

  // Fetch messages when chatId changes
  useEffect(() => {
    if (chatId) {
      fetchMessages();
    } else {
      setMessages([]);
    }
  }, [chatId, fetchMessages]);

  return {
    messages,
    setMessages,
    isLoading,
    fetchMessages,
    saveMessage,
    saveMessageToChat,
    updateMessage,
  };
}

// ============================================
// useProfile Hook - Manages user profile/memory
// ============================================

export function useProfile() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    setIsLoading(true);

    try {
      const anonymousId = getAnonymousId();
      const { data: { user } } = await supabase.auth.getUser();

      let query = (supabase as any).from('profiles').select('*');

      if (user) {
        query = query.eq('user_id', user.id);
      } else {
        query = query.eq('anonymous_id', anonymousId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }

      setProfile(data as ProfileRow | null);
    } catch (err) {
      console.error('Error in fetchProfile:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const upsertProfile = useCallback(async (updates: Partial<ProfileRow>) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    try {
      const anonymousId = getAnonymousId();
      const { data: { user } } = await supabase.auth.getUser();

      // First, try to find existing profile
      let existingProfile = null;
      const { data: foundProfile } = await (supabase as any)
        .from('profiles')
        .select('id')
        .eq('anonymous_id', anonymousId)
        .maybeSingle();
      
      existingProfile = foundProfile;

      const profileData = {
        ...updates,
        user_id: user?.id || null,
        anonymous_id: user ? null : anonymousId,
        last_seen_at: new Date().toISOString(),
      };

      let result;
      if (existingProfile?.id) {
        // Update existing profile
        const { data, error } = await (supabase as any)
          .from('profiles')
          .update(profileData)
          .eq('id', existingProfile.id)
          .select()
          .single();
        
        if (error) {
          console.error('Error updating profile:', error);
          return;
        }
        result = data;
      } else {
        // Insert new profile
        const { data, error } = await (supabase as any)
          .from('profiles')
          .insert(profileData)
          .select()
          .single();
        
        if (error) {
          console.error('Error inserting profile:', error);
          return;
        }
        result = data;
      }

      setProfile(result as ProfileRow);
    } catch (err) {
      console.error('Error in upsertProfile:', err);
    }
  }, []);

  const updateMemoryNotes = useCallback(async (notes: string) => {
    await upsertProfile({ memory_notes: notes });
  }, [upsertProfile]);

  const addAchievement = useCallback(async (type: string, description?: string) => {
    const currentAchievements = profile?.achievements || [];
    const newAchievement = {
      type,
      date: new Date().toISOString(),
      description,
    };

    await upsertProfile({
      achievements: [...currentAchievements, newAchievement],
    });
  }, [profile, upsertProfile]);

  const updateNotableItems = useCallback(async (items: string[]) => {
    await upsertProfile({ notable_items: items });
  }, [upsertProfile]);

  // Fetch profile on mount
  useEffect(() => {
    if (isSupabaseConfigured()) {
      fetchProfile();
    }
  }, [fetchProfile]);

  return {
    profile,
    isLoading,
    fetchProfile,
    upsertProfile,
    updateMemoryNotes,
    addAchievement,
    updateNotableItems,
    isConfigured: isSupabaseConfigured(),
  };
}

// ============================================
// Guest Mode Helper
// ============================================

export function useGuestMode() {
  const [isGuest, setIsGuest] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setIsGuest(true);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      setIsGuest(!user);
    };

    checkAuth();
  }, []);

  return { isGuest, isSupabaseConfigured: isSupabaseConfigured() };
}
