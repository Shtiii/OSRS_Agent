-- ============================================
-- OSRS Agent - RAG Vector Store Setup
-- Run this in the Supabase SQL Editor
-- ============================================

-- 1. Enable the vector extension (required for embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create the documents table for storing Wiki content
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding vector(1536), -- OpenAI text-embedding-3-small uses 1536 dimensions
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create indexes for efficient searching
CREATE INDEX IF NOT EXISTS documents_embedding_idx 
ON documents 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS documents_metadata_idx 
ON documents 
USING gin (metadata);

-- 4. Create the match_documents function for semantic similarity search
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documents d
  WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 5. Create a function to search by text (requires embedding the query externally)
CREATE OR REPLACE FUNCTION search_documents_by_category (
  category_filter TEXT,
  search_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata
  FROM documents d
  WHERE d.metadata->>'category' = category_filter
  ORDER BY d.created_at DESC
  LIMIT search_limit;
END;
$$;

-- 6. Enable RLS on documents table
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- 7. Allow public read access to documents (they are public Wiki content)
DROP POLICY IF EXISTS "Documents are publicly readable" ON documents;
CREATE POLICY "Documents are publicly readable" ON documents
  FOR SELECT
  USING (true);

-- 8. Only allow service role to insert/update/delete documents
DROP POLICY IF EXISTS "Only service role can modify documents" ON documents;
CREATE POLICY "Only service role can modify documents" ON documents
  FOR ALL
  USING (auth.role() = 'service_role');

-- 9. Grant necessary permissions
GRANT SELECT ON documents TO anon;
GRANT SELECT ON documents TO authenticated;
GRANT ALL ON documents TO service_role;

-- 10. Create an update trigger for updated_at
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_updated_at_trigger ON documents;
CREATE TRIGGER documents_updated_at_trigger
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_documents_updated_at();

-- ============================================
-- Verification Query
-- ============================================
-- Run this to verify the setup:
-- SELECT 
--   (SELECT COUNT(*) FROM documents) AS document_count,
--   (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS vector_version;
