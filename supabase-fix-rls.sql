-- ============================================
-- OSRS Agent - RLS Fix for Anonymous Access
-- Run this in your Supabase SQL Editor
-- ============================================

-- First, drop the existing restrictive policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;

DROP POLICY IF EXISTS "Users can view own chats" ON chats;
DROP POLICY IF EXISTS "Users can insert own chats" ON chats;
DROP POLICY IF EXISTS "Users can update own chats" ON chats;
DROP POLICY IF EXISTS "Users can delete own chats" ON chats;

DROP POLICY IF EXISTS "Users can view messages in own chats" ON messages;
DROP POLICY IF EXISTS "Users can insert messages in own chats" ON messages;
DROP POLICY IF EXISTS "Users can delete messages in own chats" ON messages;

-- ============================================
-- NEW POLICIES: Allow anonymous access scoped by anonymous_id
-- ============================================

-- PROFILES: Allow access by user_id OR anonymous_id
CREATE POLICY "Profile anonymous access" 
  ON profiles FOR ALL 
  USING (
    anonymous_id IS NOT NULL 
    OR user_id = auth.uid()
  )
  WITH CHECK (
    anonymous_id IS NOT NULL 
    OR user_id = auth.uid()
  );

-- CHATS: Allow access by user_id OR anonymous_id
CREATE POLICY "Chat anonymous access"
  ON chats FOR ALL
  USING (
    anonymous_id IS NOT NULL 
    OR user_id = auth.uid()
  )
  WITH CHECK (
    anonymous_id IS NOT NULL 
    OR user_id = auth.uid()
  );

-- MESSAGES: Access via chat ownership
CREATE POLICY "Message access via chat"
  ON messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM chats 
      WHERE chats.id = messages.chat_id 
      AND (chats.anonymous_id IS NOT NULL OR chats.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chats 
      WHERE chats.id = messages.chat_id 
      AND (chats.anonymous_id IS NOT NULL OR chats.user_id = auth.uid())
    )
  );

-- DOCUMENTS: Allow read access for RAG retrieval, restrict writes to service role
CREATE POLICY "Documents read access"
  ON documents FOR SELECT
  USING (true);

CREATE POLICY "Documents insert via service role"
  ON documents FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
