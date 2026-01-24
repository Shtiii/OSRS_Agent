-- ============================================
-- OSRS Agent - Supabase Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. PROFILES TABLE
-- Stores user preferences and long-term memory
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- OSRS-specific fields
  osrs_username TEXT,
  account_type TEXT CHECK (account_type IN ('regular', 'ironman', 'hardcore', 'ultimate')),
  combat_level INTEGER,
  total_level INTEGER,
  
  -- Long-term memory: A summary of important facts the AI should remember
  -- e.g., "User has Bowfa and full crystal armor", "User is going for Inferno cape"
  memory_notes TEXT,
  
  -- Preferences
  preferred_name TEXT, -- What the user likes to be called
  play_style TEXT, -- e.g., "PvM focused", "Skiller", "PKer"
  goals TEXT, -- Current goals like "Max cape", "Complete all quests"
  
  -- Notable achievements (auto-updated by AI)
  achievements JSONB DEFAULT '[]'::jsonb,
  -- e.g., [{"type": "fire_cape", "date": "2025-01-24"}, {"type": "inferno", "date": "2025-01-25"}]
  
  -- Notable items owned (synced from collection log or mentioned in chat)
  notable_items JSONB DEFAULT '[]'::jsonb,
  -- e.g., ["Twisted bow", "Bowfa", "Torva platebody"]
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_user_profile UNIQUE (user_id)
);

-- Index for faster lookups
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_osrs_username ON profiles(osrs_username);

-- ============================================
-- 2. CHATS TABLE
-- Stores conversation threads
-- ============================================
CREATE TABLE chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Chat metadata
  title TEXT DEFAULT 'New Chat',
  
  -- Optional: Store the OSRS username used during this chat session
  osrs_username TEXT,
  
  -- Status
  is_archived BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX idx_chats_user_id ON chats(user_id);
CREATE INDEX idx_chats_created_at ON chats(created_at DESC);
CREATE INDEX idx_chats_user_id_created_at ON chats(user_id, created_at DESC);

-- ============================================
-- 3. MESSAGES TABLE
-- Stores individual messages linked to a chat
-- ============================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE NOT NULL,
  
  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  
  -- Optional: Store tool calls and their results
  tool_calls JSONB,
  tool_results JSONB,
  
  -- Metadata
  tokens_used INTEGER,
  model_used TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_chat_id_created_at ON messages(chat_id, created_at ASC);

-- ============================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- Ensures users can only access their own data
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can only read/write their own profile
CREATE POLICY "Users can view own profile" 
  ON profiles FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" 
  ON profiles FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" 
  ON profiles FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own profile" 
  ON profiles FOR DELETE 
  USING (auth.uid() = user_id);

-- Chats: Users can only access their own chats
CREATE POLICY "Users can view own chats" 
  ON chats FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chats" 
  ON chats FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chats" 
  ON chats FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chats" 
  ON chats FOR DELETE 
  USING (auth.uid() = user_id);

-- Messages: Users can access messages in their own chats
CREATE POLICY "Users can view messages in own chats" 
  ON messages FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM chats 
      WHERE chats.id = messages.chat_id 
      AND chats.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages in own chats" 
  ON messages FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chats 
      WHERE chats.id = messages.chat_id 
      AND chats.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete messages in own chats" 
  ON messages FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM chats 
      WHERE chats.id = messages.chat_id 
      AND chats.user_id = auth.uid()
    )
  );

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================

-- Function to auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to profiles table
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply the trigger to chats table
CREATE TRIGGER update_chats_updated_at
  BEFORE UPDATE ON chats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to generate chat title from first message
CREATE OR REPLACE FUNCTION generate_chat_title(first_message TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Truncate to first 50 characters and add ellipsis if needed
  IF LENGTH(first_message) > 50 THEN
    RETURN LEFT(first_message, 50) || '...';
  ELSE
    RETURN first_message;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. ANONYMOUS/GUEST MODE SUPPORT
-- For users who don't sign up but want limited persistence
-- ============================================

-- Create policies for anonymous access (using service role key on server)
-- Note: For guest mode, we'll use the anon_id from local storage
-- and store it in a separate column. This is optional.

-- Add anonymous_id column for guest mode (optional)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS anonymous_id TEXT UNIQUE;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS anonymous_id TEXT;

-- Indexes for anonymous access
CREATE INDEX IF NOT EXISTS idx_profiles_anonymous_id ON profiles(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_chats_anonymous_id ON chats(anonymous_id);

-- ============================================
-- 7. SAMPLE QUERIES (for reference)
-- ============================================

-- Get user's chat history:
-- SELECT id, title, created_at FROM chats 
-- WHERE user_id = auth.uid() 
-- ORDER BY created_at DESC;

-- Get messages for a chat:
-- SELECT id, role, content, created_at FROM messages 
-- WHERE chat_id = $1 
-- ORDER BY created_at ASC;

-- Get user's profile with memory:
-- SELECT * FROM profiles WHERE user_id = auth.uid();

-- Update user's memory notes:
-- UPDATE profiles 
-- SET memory_notes = 'User has Fire Cape, is going for Inferno' 
-- WHERE user_id = auth.uid();
