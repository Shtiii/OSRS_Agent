// ============================================
// Supabase Database Types
// Generated from schema - update when schema changes
// ============================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string | null;
          anonymous_id: string | null;
          osrs_username: string | null;
          account_type: 'regular' | 'ironman' | 'hardcore' | 'ultimate' | null;
          combat_level: number | null;
          total_level: number | null;
          memory_notes: string | null;
          preferred_name: string | null;
          play_style: string | null;
          goals: string | null;
          achievements: Achievement[];
          notable_items: string[];
          created_at: string;
          updated_at: string;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          anonymous_id?: string | null;
          osrs_username?: string | null;
          account_type?: 'regular' | 'ironman' | 'hardcore' | 'ultimate' | null;
          combat_level?: number | null;
          total_level?: number | null;
          memory_notes?: string | null;
          preferred_name?: string | null;
          play_style?: string | null;
          goals?: string | null;
          achievements?: Achievement[];
          notable_items?: string[];
          created_at?: string;
          updated_at?: string;
          last_seen_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          anonymous_id?: string | null;
          osrs_username?: string | null;
          account_type?: 'regular' | 'ironman' | 'hardcore' | 'ultimate' | null;
          combat_level?: number | null;
          total_level?: number | null;
          memory_notes?: string | null;
          preferred_name?: string | null;
          play_style?: string | null;
          goals?: string | null;
          achievements?: Achievement[];
          notable_items?: string[];
          created_at?: string;
          updated_at?: string;
          last_seen_at?: string;
        };
      };
      chats: {
        Row: {
          id: string;
          user_id: string | null;
          anonymous_id: string | null;
          title: string;
          osrs_username: string | null;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          anonymous_id?: string | null;
          title?: string;
          osrs_username?: string | null;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          anonymous_id?: string | null;
          title?: string;
          osrs_username?: string | null;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          chat_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          tool_calls: Json | null;
          tool_results: Json | null;
          tokens_used: number | null;
          model_used: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          chat_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          tool_calls?: Json | null;
          tool_results?: Json | null;
          tokens_used?: number | null;
          model_used?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          chat_id?: string;
          role?: 'user' | 'assistant' | 'system';
          content?: string;
          tool_calls?: Json | null;
          tool_results?: Json | null;
          tokens_used?: number | null;
          model_used?: string | null;
          created_at?: string;
        };
      };
      documents: {
        Row: {
          id: string;
          content: string;
          metadata: Json | null;
          embedding: number[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          content: string;
          metadata?: Json | null;
          embedding?: number[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          content?: string;
          metadata?: Json | null;
          embedding?: number[] | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      feedback: {
        Row: {
          id: string;
          message_id: string;
          chat_id: string | null;
          user_id: string | null;
          anonymous_id: string | null;
          rating: number;
          correction: string | null;
          user_message: string | null;
          assistant_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          chat_id?: string | null;
          user_id?: string | null;
          anonymous_id?: string | null;
          rating: number;
          correction?: string | null;
          user_message?: string | null;
          assistant_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          chat_id?: string | null;
          user_id?: string | null;
          anonymous_id?: string | null;
          rating?: number;
          correction?: string | null;
          user_message?: string | null;
          assistant_message?: string | null;
          created_at?: string;
        };
      };
      expert_tips: {
        Row: {
          id: string;
          content: string;
          category: string | null;
          topic: string | null;
          submitted_by: string | null;
          submitted_by_name: string | null;
          source_feedback_id: string | null;
          status: 'pending' | 'approved' | 'rejected';
          upvotes: number;
          embedding: number[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          content: string;
          category?: string | null;
          topic?: string | null;
          submitted_by?: string | null;
          submitted_by_name?: string | null;
          source_feedback_id?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          upvotes?: number;
          embedding?: number[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          content?: string;
          category?: string | null;
          topic?: string | null;
          submitted_by?: string | null;
          submitted_by_name?: string | null;
          source_feedback_id?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          upvotes?: number;
          embedding?: number[] | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      generate_chat_title: {
        Args: { first_message: string };
        Returns: string;
      };
      match_documents: {
        Args: {
          query_embedding: number[];
          match_threshold?: number;
          match_count?: number;
        };
        Returns: {
          id: string;
          content: string;
          metadata: Json;
          similarity: number;
        }[];
      };
      search_documents_by_category: {
        Args: {
          category_filter: string;
          search_limit?: number;
        };
        Returns: {
          id: string;
          content: string;
          metadata: Json;
        }[];
      };
      match_expert_tips: {
        Args: {
          query_embedding: number[];
          match_threshold?: number;
          match_count?: number;
        };
        Returns: {
          id: string;
          content: string;
          category: string | null;
          topic: string | null;
          submitted_by_name: string | null;
          upvotes: number;
          similarity: number;
        }[];
      };
    };
    Enums: {
      account_type: 'regular' | 'ironman' | 'hardcore' | 'ultimate';
      message_role: 'user' | 'assistant' | 'system';
    };
  };
}

// ============================================
// Helper Types
// ============================================

export interface Achievement {
  type: string;
  date: string;
  description?: string;
}

// Convenience type aliases
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

// Specific table types for easier imports
export type ProfileRow = Tables<'profiles'>;
export type ChatRow = Tables<'chats'>;
export type MessageRow = Tables<'messages'>;
export type DocumentRow = Tables<'documents'>;

export type ProfileInsert = InsertTables<'profiles'>;
export type ChatInsert = InsertTables<'chats'>;
export type MessageInsert = InsertTables<'messages'>;
export type DocumentInsert = InsertTables<'documents'>;

export type ProfileUpdate = UpdateTables<'profiles'>;
export type ChatUpdate = UpdateTables<'chats'>;
export type MessageUpdate = UpdateTables<'messages'>;
export type DocumentUpdate = UpdateTables<'documents'>;

export type FeedbackRow = Tables<'feedback'>;
export type ExpertTipRow = Tables<'expert_tips'>;

export type FeedbackInsert = InsertTables<'feedback'>;
export type ExpertTipInsert = InsertTables<'expert_tips'>;
