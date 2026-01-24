/**
 * RAG (Retrieval Augmented Generation) Module
 * Handles embedding creation and semantic search for Wiki content
 */

import { getSupabaseClient } from './supabase';

// ============================================
// Types
// ============================================

export interface DocumentMatch {
  id: string;
  content: string;
  metadata: {
    title?: string;
    category?: string;
    url?: string;
    [key: string]: unknown;
  };
  similarity: number;
}

export interface EmbeddingResult {
  embedding: number[];
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

// ============================================
// Configuration
// ============================================

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_MATCH_THRESHOLD = 0.65;
const DEFAULT_MATCH_COUNT = 5;

// ============================================
// Embedding Functions
// ============================================

/**
 * Create an embedding for a given text using OpenAI's API
 * Falls back gracefully if API key is not configured
 */
export async function createEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not configured - RAG features disabled');
    return null;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000), // Limit input length
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      console.error('OpenAI Embedding API error:', response.status);
      return null;
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || null;
  } catch (error) {
    console.error('Error creating embedding:', error);
    return null;
  }
}

// ============================================
// Retrieval Functions
// ============================================

/**
 * Retrieve relevant context from the vector store based on a query
 * This is the main function used before generating chat responses
 */
export async function retrieveContext(
  query: string,
  options: {
    matchThreshold?: number;
    matchCount?: number;
    category?: string;
  } = {}
): Promise<DocumentMatch[]> {
  const {
    matchThreshold = DEFAULT_MATCH_THRESHOLD,
    matchCount = DEFAULT_MATCH_COUNT,
    category,
  } = options;

  // Create embedding for the query
  const embedding = await createEmbedding(query);
  
  if (!embedding) {
    return [];
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  try {
    // Call the match_documents function
    const { data, error } = await (supabase as any).rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
    });

    if (error) {
      console.error('Error matching documents:', error);
      return [];
    }

    // Filter by category if specified
    let results = data as DocumentMatch[] || [];
    if (category) {
      results = results.filter(doc => doc.metadata?.category === category);
    }

    return results;
  } catch (error) {
    console.error('Error in retrieveContext:', error);
    return [];
  }
}

/**
 * Format retrieved documents into a context string for the AI
 */
export function formatContextForPrompt(documents: DocumentMatch[]): string {
  if (documents.length === 0) {
    return '';
  }

  const contextParts = documents.map((doc, index) => {
    const title = doc.metadata?.title || `Source ${index + 1}`;
    const url = doc.metadata?.url || '';
    return `### ${title}
${doc.content}
${url ? `_Source: ${url}_` : ''}`;
  });

  return `### WIKI KNOWLEDGE BASE (Retrieved Context):
The following information was retrieved from the OSRS Wiki to help answer this question accurately:

${contextParts.join('\n\n---\n\n')}

Use this information to provide accurate, factual answers. If the information above doesn't cover the user's question, acknowledge that and use your general knowledge carefully.
`;
}

// ============================================
// Document Management Functions
// ============================================

/**
 * Add a document to the vector store
 * This is typically called when indexing Wiki content
 */
export async function addDocument(
  content: string,
  metadata: Record<string, unknown> = {}
): Promise<string | null> {
  const embedding = await createEmbedding(content);
  
  if (!embedding) {
    return null;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await (supabase as any)
      .from('documents')
      .insert({
        content,
        metadata,
        embedding,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error adding document:', error);
      return null;
    }

    return data?.id || null;
  } catch (error) {
    console.error('Error in addDocument:', error);
    return null;
  }
}

/**
 * Add multiple documents in batch
 */
export async function addDocuments(
  documents: Array<{ content: string; metadata?: Record<string, unknown> }>
): Promise<number> {
  let successCount = 0;

  for (const doc of documents) {
    const id = await addDocument(doc.content, doc.metadata || {});
    if (id) {
      successCount++;
    }
  }

  return successCount;
}

/**
 * Check if RAG is configured and available
 */
export function isRAGConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/**
 * Get stats about the document store
 */
export async function getDocumentStats(): Promise<{ count: number } | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  try {
    const { count, error } = await (supabase as any)
      .from('documents')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('Error getting document stats:', error);
      return null;
    }

    return { count: count || 0 };
  } catch (error) {
    console.error('Error in getDocumentStats:', error);
    return null;
  }
}
