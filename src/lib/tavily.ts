import type { TavilySearchResponse, TavilySearchResult } from './types';

const TAVILY_BASE_URL = 'https://api.tavily.com';

/**
 * Search the web using Tavily API
 * Great for finding community guides, Reddit threads, and recent strategies
 */
export async function searchWeb(
  query: string,
  options?: {
    searchDepth?: 'basic' | 'advanced';
    maxResults?: number;
    includeAnswer?: boolean;
    includeDomains?: string[];
    excludeDomains?: string[];
  }
): Promise<TavilySearchResponse | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  
  if (!apiKey) {
    console.error('TAVILY_API_KEY is not configured');
    return null;
  }

  try {
    const response = await fetch(`${TAVILY_BASE_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: `OSRS Old School RuneScape ${query}`,
        search_depth: options?.searchDepth || 'basic',
        max_results: options?.maxResults || 5,
        include_answer: options?.includeAnswer ?? true,
        include_domains: options?.includeDomains || [
          'reddit.com',
          'oldschool.runescape.wiki',
          'twitter.com',
          'youtube.com',
        ],
        exclude_domains: options?.excludeDomains || [],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tavily API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      query: data.query,
      results: data.results || [],
      answer: data.answer,
    };
  } catch (error) {
    console.error('Error searching web:', error);
    return null;
  }
}

/**
 * Format Tavily results for the AI context
 */
export function formatSearchResults(results: TavilySearchResult[]): string {
  if (!results || results.length === 0) {
    return 'No search results found.';
  }

  const formattedResults = results.map((result, index) => {
    return `[${index + 1}] ${result.title}
URL: ${result.url}
${result.content.slice(0, 300)}${result.content.length > 300 ? '...' : ''}`;
  });

  return formattedResults.join('\n\n');
}
