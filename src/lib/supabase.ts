import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Re-export database types for convenience
export type { Database } from './database.types';

// ============================================
// Environment Variables
// ============================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl !== '' && supabaseAnonKey !== '');
};

// ============================================
// Browser Client (for client components)
// ============================================

// Singleton pattern for browser client
let browserClient: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return browserClient;
}

// ============================================
// Anonymous ID Management (for Guest Mode)
// ============================================

const ANON_ID_KEY = 'osrs_agent_anon_id';

export function getAnonymousId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  let anonId = localStorage.getItem(ANON_ID_KEY);
  if (!anonId) {
    anonId = `anon_${crypto.randomUUID()}`;
    localStorage.setItem(ANON_ID_KEY, anonId);
  }
  return anonId;
}

/**
 * Format date for display
 */
export function formatChatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 1) {
    return 'Just now';
  } else if (diffInHours < 24) {
    return `${Math.floor(diffInHours)}h ago`;
  } else if (diffInHours < 48) {
    return 'Yesterday';
  } else if (diffInHours < 168) {
    return `${Math.floor(diffInHours / 24)} days ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
