import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { searchWiki, getWikiPage, getWikiPageFull } from '@/lib/osrs';
import { searchWeb, formatSearchResults } from '@/lib/tavily';
import type { UserContext, CollectionLogItem } from '@/lib/types';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// Create OpenRouter client
const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Build dynamic system prompt based on user context
function buildSystemPrompt(userContext: UserContext | null): string {
  let contextSection = '';

  if (userContext) {
    const statsInfo = userContext.stats
      ? `
- Username: ${userContext.stats.displayName}
- Account Type: ${userContext.stats.type}
- Combat Level: ${userContext.stats.combatLevel}
- Total Experience: ${userContext.stats.exp?.toLocaleString() || 'Unknown'}
${formatStatsForPrompt(userContext.stats)}`
      : '- No stats loaded yet';

    const itemsInfo = userContext.rareItems.length > 0
      ? formatRareItemsForPrompt(userContext.rareItems)
      : '- No collection log uploaded';

    contextSection = `
PLAYER CONTEXT:
${statsInfo}

NOTABLE ITEMS OWNED:
${itemsInfo}
`;
  } else {
    contextSection = `
PLAYER CONTEXT:
- No player data loaded. Ask the user to enter their RuneScape username in the sidebar.
`;
  }

  return `You are an expert OSRS (Old School RuneScape) assistant with deep knowledge of the game mechanics, meta strategies, boss fights, skilling methods, and the community.

${contextSection}

TOOLS AVAILABLE:
1. searchWeb - Use this to find community guides, Reddit threads, YouTube strategies, and recent meta discussions. Great for questions about "best" methods, opinions, or strategies that may change over time.
2. searchWiki - Use this to search the official OSRS Wiki for factual information like drop rates, quest requirements, item stats, and mechanics.
3. getWikiPage - Use this to get detailed information from a specific Wiki page title.

RULES:
1. If the user asks "Can I do X?" or "Am I ready for X?", compare their stats from the PLAYER CONTEXT against the known requirements. Use searchWiki if you need to verify specific requirements.
2. If the user asks for gear recommendations, PRIORITIZE items they already own (from NOTABLE ITEMS OWNED) before suggesting items they need to buy.
3. If the user asks about strategies, opinions, or "best" methods, use the searchWeb tool to find current community consensus.
4. Always be specific with numbers (drop rates, DPS, GP/hr) when available.
5. If you're unsure about current meta or recent game updates, use searchWeb to verify.
6. Format your responses clearly with headers, bullet points, and organized sections when appropriate.
7. If stats aren't loaded, encourage the user to enter their username to get personalized advice.

PERSONALITY:
- Be enthusiastic about OSRS
- Use appropriate game terminology
- Be encouraging but realistic about account progress
- Acknowledge RNG and the grind`;
}

function formatStatsForPrompt(stats: UserContext['stats']): string {
  if (!stats?.latestSnapshot?.data?.skills) {
    return '- Detailed stats not available';
  }

  const skills = stats.latestSnapshot.data.skills;
  const lines: string[] = ['- Key Skills:'];
  
  const importantSkills = [
    'attack', 'strength', 'defence', 'hitpoints', 'ranged', 'prayer', 'magic',
    'slayer', 'farming', 'herblore', 'construction'
  ];

  for (const skillName of importantSkills) {
    const skill = skills[skillName];
    if (skill) {
      lines.push(`  ${skillName}: ${skill.level}`);
    }
  }

  return lines.join('\n');
}

function formatRareItemsForPrompt(items: CollectionLogItem[]): string {
  if (items.length === 0) return '- None logged';

  const lines: string[] = [];
  items.slice(0, 20).forEach(item => {
    lines.push(`- ${item.name}${item.quantity > 1 ? ` (x${item.quantity})` : ''}`);
  });

  if (items.length > 20) {
    lines.push(`... and ${items.length - 20} more items`);
  }

  return lines.join('\n');
}

export async function POST(req: Request) {
  try {
    const { messages, userContext } = await req.json();

    const systemPrompt = buildSystemPrompt(userContext);

    const result = streamText({
      model: openrouter(process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4'),
      system: systemPrompt,
      messages,
      tools: {
        searchWeb: tool({
          description: 'Search the web for OSRS guides, strategies, Reddit discussions, and community content. Use this for questions about "best" methods, opinions, current meta, or recent strategies.',
          inputSchema: z.object({
            query: z.string().describe('The search query. Be specific and include OSRS-related terms.'),
          }),
          execute: async ({ query }) => {
            const results = await searchWeb(query, {
              searchDepth: 'advanced',
              maxResults: 5,
              includeAnswer: true,
            });

            if (!results || results.results.length === 0) {
              return { success: false, message: 'No results found for this search.' };
            }

            return {
              success: true,
              answer: results.answer || null,
              results: results.results.map(r => ({
                title: r.title,
                url: r.url,
                content: r.content.slice(0, 500),
              })),
              formatted: formatSearchResults(results.results),
            };
          },
        }),

        searchWiki: tool({
          description: 'Search the official OSRS Wiki for factual information like drop rates, quest requirements, item stats, XP rates, and game mechanics.',
          inputSchema: z.object({
            query: z.string().describe('The search query for the OSRS Wiki.'),
          }),
          execute: async ({ query }) => {
            const results = await searchWiki(query);

            if (results.length === 0) {
              return { success: false, message: 'No Wiki pages found for this search.' };
            }

            // Get the top result's full content
            const topResult = results[0];
            const pageContent = await getWikiPage(topResult.title);

            return {
              success: true,
              searchResults: results.map(r => ({
                title: r.title,
                snippet: r.snippet.replace(/<[^>]*>/g, ''), // Remove HTML tags
              })),
              topPage: pageContent ? {
                title: pageContent.title,
                url: pageContent.fullurl,
                content: pageContent.extract.slice(0, 1000),
              } : null,
            };
          },
        }),

        getWikiPage: tool({
          description: 'Get detailed content from a specific OSRS Wiki page. Use this when you need comprehensive information about a specific topic.',
          inputSchema: z.object({
            title: z.string().describe('The exact title of the Wiki page to retrieve.'),
          }),
          execute: async ({ title }) => {
            const content = await getWikiPageFull(title);
            const pageInfo = await getWikiPage(title);

            if (!content) {
              return { success: false, message: `Wiki page "${title}" not found.` };
            }

            return {
              success: true,
              title: pageInfo?.title || title,
              url: pageInfo?.fullurl || `https://oldschool.runescape.wiki/w/${encodeURIComponent(title)}`,
              content: content.slice(0, 3000), // Limit content length
            };
          },
        }),
      },
      toolChoice: 'auto',
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process chat request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
