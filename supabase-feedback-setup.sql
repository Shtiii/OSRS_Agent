-- ============================================
-- OSRS Agent - Feedback & Expert Knowledge Setup
-- Run this in the Supabase SQL Editor
-- ============================================

-- 1. Create feedback table for thumbs up/down on AI responses
CREATE TABLE IF NOT EXISTS feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT NOT NULL,
  chat_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)), -- -1 = dislike, 1 = like
  correction TEXT, -- optional user correction/explanation
  user_message TEXT, -- the question that was asked
  assistant_message TEXT, -- the AI answer that was rated
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create expert_tips table for community-contributed knowledge
CREATE TABLE IF NOT EXISTS expert_tips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT, -- e.g., 'boss', 'quest', 'skilling', 'money_making', 'gear', 'general'
  topic TEXT, -- e.g., 'Zulrah', 'Dragon Slayer II', 'Runecrafting'
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by_name TEXT,
  source_feedback_id UUID REFERENCES feedback(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  upvotes INT DEFAULT 0,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS feedback_message_idx ON feedback(message_id);
CREATE INDEX IF NOT EXISTS feedback_rating_idx ON feedback(rating);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback(created_at DESC);

CREATE INDEX IF NOT EXISTS expert_tips_embedding_idx 
ON expert_tips 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 50);

CREATE INDEX IF NOT EXISTS expert_tips_category_idx ON expert_tips(category);
CREATE INDEX IF NOT EXISTS expert_tips_status_idx ON expert_tips(status);
CREATE INDEX IF NOT EXISTS expert_tips_topic_idx ON expert_tips(topic);

-- 4. Create function to search expert tips by similarity
CREATE OR REPLACE FUNCTION match_expert_tips (
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.65,
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  category TEXT,
  topic TEXT,
  submitted_by_name TEXT,
  upvotes INT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.content,
    t.category,
    t.topic,
    t.submitted_by_name,
    t.upvotes,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM expert_tips t
  WHERE t.status = 'approved'
    AND 1 - (t.embedding <=> query_embedding) > match_threshold
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 5. Enable RLS
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE expert_tips ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for feedback
-- Anyone can insert feedback (even anonymous users)
DROP POLICY IF EXISTS "Anyone can insert feedback" ON feedback;
CREATE POLICY "Anyone can insert feedback" ON feedback
  FOR INSERT WITH CHECK (true);

-- Users can read their own feedback
DROP POLICY IF EXISTS "Users can read own feedback" ON feedback;
CREATE POLICY "Users can read own feedback" ON feedback
  FOR SELECT
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR (auth.uid() IS NULL AND anonymous_id IS NOT NULL)
  );

-- 7. RLS Policies for expert_tips
-- Anyone can read approved tips
DROP POLICY IF EXISTS "Approved tips are publicly readable" ON expert_tips;
CREATE POLICY "Approved tips are publicly readable" ON expert_tips
  FOR SELECT USING (status = 'approved');

-- Authenticated users can submit tips
DROP POLICY IF EXISTS "Authenticated users can submit tips" ON expert_tips;
CREATE POLICY "Authenticated users can submit tips" ON expert_tips
  FOR INSERT WITH CHECK (true);

-- 8. Grant permissions
GRANT SELECT, INSERT ON feedback TO anon;
GRANT SELECT, INSERT ON feedback TO authenticated;
GRANT ALL ON feedback TO service_role;

GRANT SELECT, INSERT ON expert_tips TO anon;
GRANT SELECT, INSERT ON expert_tips TO authenticated;
GRANT ALL ON expert_tips TO service_role;

-- 9. Update trigger for expert_tips
CREATE OR REPLACE FUNCTION update_expert_tips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS expert_tips_updated_at_trigger ON expert_tips;
CREATE TRIGGER expert_tips_updated_at_trigger
  BEFORE UPDATE ON expert_tips
  FOR EACH ROW
  EXECUTE FUNCTION update_expert_tips_updated_at();
