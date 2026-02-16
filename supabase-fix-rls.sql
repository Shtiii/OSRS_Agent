-- ============================================
-- OSRS Agent - RLS Fix for Anonymous + Auth Access
-- Run this in your Supabase SQL Editor
-- ============================================

-- ============================================
-- STEP 1: ENABLE RLS on all tables
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: Drop ALL existing policies (clean slate)
-- ============================================
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;
DROP POLICY IF EXISTS "Profile anonymous access" ON profiles;

DROP POLICY IF EXISTS "Users can view own chats" ON chats;
DROP POLICY IF EXISTS "Users can insert own chats" ON chats;
DROP POLICY IF EXISTS "Users can update own chats" ON chats;
DROP POLICY IF EXISTS "Users can delete own chats" ON chats;
DROP POLICY IF EXISTS "Chat anonymous access" ON chats;

DROP POLICY IF EXISTS "Users can view messages in own chats" ON messages;
DROP POLICY IF EXISTS "Users can insert messages in own chats" ON messages;
DROP POLICY IF EXISTS "Users can delete messages in own chats" ON messages;
DROP POLICY IF EXISTS "Message access via chat" ON messages;

DROP POLICY IF EXISTS "Documents read access" ON documents;
DROP POLICY IF EXISTS "Documents insert via service role" ON documents;
DROP POLICY IF EXISTS "Documents are publicly readable" ON documents;
DROP POLICY IF EXISTS "Only service role can modify documents" ON documents;
DROP POLICY IF EXISTS "Anon can insert documents" ON documents;
DROP POLICY IF EXISTS "Anon can update documents" ON documents;

-- ============================================
-- STEP 3: Create new policies
-- Authenticated users  → scoped by user_id = auth.uid()
-- Anonymous/guest users → scoped by anonymous_id (client-side)
-- ============================================

-- PROFILES ------------------------------------------------
CREATE POLICY "Profile access"
  ON profiles FOR ALL
  USING (
    user_id = auth.uid()
    OR anonymous_id IS NOT NULL
  )
  WITH CHECK (
    user_id = auth.uid()
    OR anonymous_id IS NOT NULL
  );

-- CHATS ---------------------------------------------------
CREATE POLICY "Chat access"
  ON chats FOR ALL
  USING (
    user_id = auth.uid()
    OR anonymous_id IS NOT NULL
  )
  WITH CHECK (
    user_id = auth.uid()
    OR anonymous_id IS NOT NULL
  );

-- MESSAGES ------------------------------------------------
CREATE POLICY "Message access via chat"
  ON messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
      AND (chats.user_id = auth.uid() OR chats.anonymous_id IS NOT NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
      AND (chats.user_id = auth.uid() OR chats.anonymous_id IS NOT NULL)
    )
  );

-- DOCUMENTS (wiki cache) ---------------------------------
-- Everyone can read cached wiki pages
CREATE POLICY "Documents are publicly readable"
  ON documents FOR SELECT
  USING (true);

-- The API route uses the anon key to cache wiki pages,
-- so allow anon + authenticated to insert/update.
CREATE POLICY "Documents insert access"
  ON documents FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Documents update access"
  ON documents FOR UPDATE
  USING (true)
  WITH CHECK (true);
