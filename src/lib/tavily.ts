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
 * Search specifically for OSRS guides and strategies
 */
export async function searchOSRSGuide(topic: string): Promise<TavilySearchResult[]> {
  const result = await searchWeb(`${topic} guide strategy`, {
    searchDepth: 'advanced',
    maxResults: 5,
    includeAnswer: true,
    includeDomains: [
      'reddit.com/r/2007scape',
      'reddit.com/r/ironscape',
      'oldschool.runescape.wiki',
    ],
  });

  return result?.results || [];
}

/**
 * Search for gear setups and recommendations
 */
export async function searchGearSetup(
  activity: string,
  budget?: string
): Promise<TavilySearchResult[]> {
  const budgetQuery = budget ? ` ${budget} budget` : '';
  const result = await searchWeb(`${activity} gear setup${budgetQuery}`, {
    searchDepth: 'advanced',
    maxResults: 5,
    includeAnswer: true,
  });

  return result?.results || [];
}

/**
 * Search Reddit specifically for OSRS discussions
 */
export async function searchReddit(query: string): Promise<TavilySearchResult[]> {
  const result = await searchWeb(query, {
    searchDepth: 'basic',
    maxResults: 5,
    includeDomains: ['reddit.com'],
  });

  return result?.results || [];
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
