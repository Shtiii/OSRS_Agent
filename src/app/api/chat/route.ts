import { streamText, tool, stepCountIs } from 'ai';
import type { ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { searchWiki, getWikiPage, getWikiPageFull, getItemPrice, getPlayerStats, formatPriceSummary, formatStatsSummary, formatGainsSummary, getPlayerGains } from '@/lib/osrs';
import { searchWeb } from '@/lib/tavily';
import { retrieveContext, formatContextForPrompt, isRAGConfigured, addDocument } from '@/lib/rag';
import { getSupabaseClient } from '@/lib/supabase';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import type { UserContext, CollectionLogItem } from '@/lib/types';

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

const isDev = process.env.NODE_ENV === 'development';
function debugLog(...args: unknown[]) {
  if (isDev) console.log('[DEBUG]', ...args);
}

// ============================================
// OpenRouter provider via AI SDK
// ============================================

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  headers: {
    'HTTP-Referer': 'https://osrs-agent.local',
    'X-Title': 'OSRS Helper Agent',
  },
});

// ============================================
// Request validation
// ============================================

const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(10000),
    })
  ).min(1).max(100),
  userContext: z.object({
    username: z.string().nullable().optional(),
    stats: z.any().nullable().optional(),
    gains: z.any().nullable().optional(),
    collectionLog: z.any().nullable().optional(),
    rareItems: z.array(z.any()).optional().default([]),
    accountType: z.string().nullable().optional(),
  }).passthrough().nullable().optional(),
  profile: z.object({
    memoryNotes: z.string().nullable(),
    achievements: z.array(z.object({
      type: z.string(),
      date: z.string(),
      description: z.string().optional(),
    })),
    notableItems: z.array(z.string()),
    goals: z.string().nullable(),
    playStyle: z.string().nullable(),
  }).nullable(),
});

// Profile data passed from client
type ProfileData = z.infer<typeof chatRequestSchema>['profile'];

// ============================================
// AUTO-CACHING LAYER
// ============================================

interface CachedWikiPage {
  title: string;
  content: string;
  url: string;
  imageUrl?: string | null;
  cachedAt: string;
}

const WIKI_CACHE_TTL = 180 * 24 * 60 * 60 * 1000; // 6 months

async function getCachedWikiPage(title: string): Promise<CachedWikiPage | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const normalizedTitle = title.toLowerCase().trim();
    const { data, error } = await supabase
      .from('documents')
      .select('content, metadata')
      .eq('metadata->>type', 'wiki_page')
      .ilike('metadata->>title', normalizedTitle)
      .limit(1)
      .single();

    if (error || !data) return null;

    const metadata = data.metadata as Record<string, string> | null;

    // Check if cache has expired
    const cachedAt = metadata?.cachedAt;
    if (cachedAt) {
      const age = Date.now() - new Date(cachedAt).getTime();
      if (age > WIKI_CACHE_TTL) {
        debugLog(`[Cache EXPIRED] ${title} (age: ${Math.round(age / 3600000)}h)`);
        return null; // Force re-fetch from Wiki
      }
    }

    return {
      title: metadata?.title || title,
      content: data.content,
      url: metadata?.url || '',
      imageUrl: metadata?.imageUrl || null,
      cachedAt: cachedAt || '',
    };
  } catch {
    return null;
  }
}

async function cacheWikiPage(
  title: string,
  content: string,
  url: string,
  imageUrl?: string | null
): Promise<void> {
  try {
    const normalizedTitle = title.toLowerCase().trim();
    const metadata = {
      type: 'wiki_page',
      title: normalizedTitle,
      displayTitle: title,
      url,
      imageUrl,
      cachedAt: new Date().toISOString(),
    };

    const supabase = getSupabaseClient();
    if (!supabase) {
      await addDocument(content, metadata);
      return;
    }

    // Check if this page already exists in the cache
    const { data: existing } = await supabase
      .from('documents')
      .select('id')
      .eq('metadata->>type', 'wiki_page')
      .ilike('metadata->>title', normalizedTitle)
      .limit(1)
      .single();

    if (existing?.id) {
      // Update existing row with fresh content and embedding
      const { createEmbedding } = await import('@/lib/rag');
      const embedding = await createEmbedding(content);
      if (embedding) {
        await supabase
          .from('documents')
          .update({ content, metadata, embedding })
          .eq('id', existing.id);
        debugLog(`Updated cached Wiki page: ${title}`);
      }
    } else {
      // Insert new row
      await addDocument(content, metadata);
      debugLog(`Cached Wiki page: ${title}`);
    }
  } catch (error) {
    console.error('Failed to cache Wiki page:', error);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getKeySkills(stats: UserContext['stats']): string {
  if (!stats?.latestSnapshot?.data?.skills) {
    return 'No detailed stats available';
  }

  const skills = stats.latestSnapshot.data.skills;
  const skillList = [
    'attack', 'strength', 'defence', 'hitpoints', 'ranged', 'prayer', 'magic',
    'slayer', 'farming', 'herblore', 'construction', 'mining', 'smithing',
    'fishing', 'cooking', 'woodcutting', 'crafting', 'fletching', 'firemaking',
    'runecrafting', 'hunter', 'agility', 'thieving', 'sailing',
  ];

  const lines: string[] = [];
  for (const skillName of skillList) {
    const skill = skills[skillName];
    if (skill) {
      lines.push(`${skillName}: ${skill.level}`);
    }
  }

  return lines.join(', ');
}

function getGameModeRules(mode: string): string {
  switch (mode) {
    case 'ironman':
      return `### IRONMAN RULES (CRITICAL):
- The user is an **IRONMAN**. They CANNOT trade with other players or use the Grand Exchange.
- When suggesting items or gear, you MUST explain WHERE to obtain them (monster drops, shops, spawns, minigame rewards).
- Do not mention GE prices unless discussing "High Alchemy" value for self-sustaining GP.
- For supplies (food, potions), explain how to gather/craft them yourself.
- Prioritize drops and unlocks from Slayer, bosses, or quests.`;

    case 'hardcore':
      return `### HARDCORE IRONMAN RULES (CRITICAL - SAFETY FIRST):
- The user is a **HARDCORE IRONMAN**. One death = status lost. SAFETY IS PRIORITY #1.
- Do NOT suggest dangerous Wilderness methods unless explicitly asked and warn heavily.
- ALWAYS warn about potential one-shot mechanics, dangerous quest bosses, or risky activities.
- They CANNOT trade with other players or use the Grand Exchange.
- When suggesting content, mention if it has a death risk (e.g., "Vorkath can combo you if unlucky").
- For dangerous bosses, suggest over-preparing with extra food/prayer.`;

    case 'ultimate':
      return `### ULTIMATE IRONMAN RULES (CRITICAL - NO BANK):
- The user is an **ULTIMATE IRONMAN (UIM)**. They have NO BANK ACCESS.
- Inventory management is CRITICAL. Consider their limited space in all advice.
- Suggest using: Looting Bag, Seed Box, Rune Pouch, death storage (Zulrah/Hespori), or POH storage.
- They CANNOT trade with other players or use the Grand Exchange.
- For skilling or bossing, explain how to manage inventory throughout the activity.
- Suggest efficient "loadouts" that minimize bank trips (since they can't bank).`;

    case 'regular':
    default:
      return `### REGULAR ACCOUNT RULES:
- The user is a **REGULAR (MAIN) ACCOUNT**.
- You can freely suggest buying items from the Grand Exchange.
- Focus on GP/Hour efficiency and meta methods.
- Suggest market flipping or merching if relevant to money-making questions.
- Cost-benefit analysis is welcome (e.g., "Buying X for 5M saves 10 hours of grinding").`;
  }
}

function formatRareItemsForPrompt(items: CollectionLogItem[]): string {
  if (items.length === 0) return 'No rare items logged';

  const lines: string[] = [];
  items.slice(0, 25).forEach((item) => {
    lines.push(`- ${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`);
  });

  if (items.length > 25) {
    lines.push(`... and ${items.length - 25} more items`);
  }

  return lines.join('\n');
}

// ============================================
// SYSTEM PROMPT
// ============================================

function buildSystemPrompt(userContext: UserContext | null, profile: ProfileData | null): string {
  const stats = userContext?.stats;
  const hasStats = !!stats;
  const username = stats?.displayName || userContext?.username || 'Adventurer';
  const gameMode = stats?.type || null;
  const combatLevel = stats?.combatLevel;
  const totalLevel = stats?.latestSnapshot?.data?.skills?.overall?.level;
  const keySkills = stats ? getKeySkills(stats) : null;

  // Format gains if available
  let gainsSection = '';
  if (userContext?.gains) {
    const gainsData = userContext.gains as import('@/lib/types').WOMGains;
    const gainsSummary = formatGainsSummary(gainsData);
    if (gainsSummary && gainsSummary !== 'No recent gains available' && gainsSummary !== 'No recent XP gains') {
      gainsSection = `\n### RECENT ACTIVITY:\n${gainsSummary}\n`;
    }
  }

  let memorySection = '';
  if (profile) {
    const memoryParts: string[] = [];

    if (profile.memoryNotes) {
      memoryParts.push(`**Known Facts:** ${profile.memoryNotes}`);
    }
    if (profile.goals) {
      memoryParts.push(`**Current Goals:** ${profile.goals}`);
    }
    if (profile.playStyle) {
      memoryParts.push(`**Play Style:** ${profile.playStyle}`);
    }
    if (profile.achievements && profile.achievements.length > 0) {
      const recentAchievements = profile.achievements.slice(-5);
      const achievementText = recentAchievements
        .map((a) => `- ${a.type}${a.description ? `: ${a.description}` : ''}`)
        .join('\n');
      memoryParts.push(`**Recent Achievements:**\n${achievementText}`);
    }
    if (profile.notableItems && profile.notableItems.length > 0) {
      memoryParts.push(`**Notable Gear Owned:** ${profile.notableItems.slice(0, 15).join(', ')}`);
    }

    if (memoryParts.length > 0) {
      memorySection = `
### LONG-TERM MEMORY (Facts I remember about this user):
${memoryParts.join('\n\n')}
`;
    }
  }

  let collectionLogSection = '';
  if (userContext?.rareItems && userContext.rareItems.length > 0) {
    collectionLogSection = `
### COLLECTION LOG (Items this player owns):
${formatRareItemsForPrompt(userContext.rareItems)}
`;
  }

  const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `You are the **Wise Old AI** - an expert Old School RuneScape researcher helping **${username}**.

**Today's date is ${currentDate}.** Your training data may be outdated. OSRS receives frequent updates — new skills, bosses, quests, and items are added regularly. **ALWAYS trust tool results (Wiki, prices) over your training data.** If a tool shows something exists that you didn't know about, it is real and current.

**IMPORTANT**: Sailing was released as the 24th skill in OSRS in November 2025. It is a fully released, trainable skill. Do not tell users it doesn't exist.

## ABSOLUTE RULES

1. **ZERO TOLERANCE FOR HALLUCINATION**: NEVER fabricate numbers, drop rates, XP rates, requirements, item stats, or any other factual claim. If you cannot verify a fact from the user's stats below or via a tool lookup, you MUST say "I'm not sure â€” let me look that up" and use a tool.
2. **OSRS ONLY**: Only discuss Old School RuneScape. Refuse RS3, other games, or off-topic requests politely.
3. For **ANY factual claim about OSRS** that is not directly derivable from the user's stats provided below, you **MUST use a tool first**. This includes but is not limited to: drop rates, quest requirements, diary requirements, boss mechanics, item stats, skilling methods, XP rates, clue scroll rewards, minigame rewards, spell/prayer unlock levels, slayer task info, combat formulas, and gear comparisons.
4. When in doubt about whether you know something accurately, **ALWAYS use a tool**. It is better to look something up and be right than to guess and be wrong.

## TOOLS & RESEARCH

You have access to the **ENTIRE OSRS Wiki** and **real-time GE prices** via tools.

### AVAILABLE TOOLS:
- **searchWiki** - Search for Wiki pages when unsure of the exact page name. Returns a summary of the top result. Use \`getWikiPage\` afterwards if you need more detail or a different page from the results.
- **getWikiPage** - Read the full content of a specific Wiki page. Use for detailed drop tables, quest steps, boss mechanics, requirements, etc.
- **getItemPrice** - Get live Grand Exchange prices (real-time data from the Wiki Prices API).
- **searchWeb** - Search the web for community content (Reddit, YouTube). Use for meta strategies, current opinions, or recent game updates.
- **lookupPlayer** - Look up any OSRS player's stats and recent gains from Wise Old Man. Use when the user asks about another player.

### WHEN TO USE TOOLS:
- Drop rates, boss mechanics, quest requirements â†’ searchWiki + getWikiPage
- Item prices, costs, money-making comparisons â†’ getItemPrice
- Diary requirements, minigame rewards, spell unlocks â†’ getWikiPage
- Skilling XP rates, methods, efficiency â†’ searchWiki + getWikiPage
- Slayer tasks, masters, weights â†’ getWikiPage
- Community meta, opinions, recent updates â†’ searchWeb
- Another player's stats â†’ lookupPlayer

### WHEN NOT TO USE TOOLS:
- Simple greetings ("Hi!", "Thanks!")
- Pure opinion questions ("What do you think of...")
- Things you can answer from the user's provided stats below

### TRANSPARENCY & CITATIONS:
- When you look something up, briefly say: "Let me check the Wiki..." or "Looking up prices..."
- **ALWAYS cite the source** after presenting factual data: "According to the Wiki..." or "Source: [Page Name](url)"
- Include the Wiki URL when available.
- If a tool returns an imageUrl, include it using \`![Name](url)\`

## USER CONTEXT
${hasStats ? `
- **Username:** ${username}
- **Account Type:** ${(gameMode || 'regular').toUpperCase()}
- **Combat Level:** ${combatLevel}
- **Total Level:** ${totalLevel}
- **Key Skills:** ${keySkills}
${gainsSection}` : `
- **Username:** ${username || 'Unknown'}
- **Stats:** Not available. Do not assume any skill levels. If the user asks for personalized advice, suggest they enter their RuneScape username for accurate recommendations. Ask the user about their account type if relevant.
`}
${gameMode ? getGameModeRules(gameMode) : `### ACCOUNT TYPE UNKNOWN:
- The user has not linked their account. If your advice depends on whether they are an ironman, ask them.
- Do NOT assume they can use the Grand Exchange unless confirmed.`}
${collectionLogSection}
${memorySection}

## RESPONSE STYLE

- **BE CONCISE**: Answer directly in 1-3 sentences for simple questions. Expand for complex topics.
- **NO FLUFF**: Don't start with "Great question!" - just give the answer.
- **CHECK REQUIREMENTS**: Before recommending content, verify the user meets the requirements based on their stats above. If their stats are too low, explain what they need to train first.
- **ASK IF NEEDED**: If you need clarification, ask the user.

## STRICT CONSTRAINTS

1. **NO HALLUCINATION**: If tools return no results, say "I couldn't find that information on the Wiki." NEVER make up numbers. NEVER claim something doesn't exist in OSRS without checking the Wiki first.
2. **TRUST TOOLS OVER TRAINING**: Your training data has a cutoff date. OSRS is a live game with frequent updates. If the Wiki says something exists, it exists. Do not contradict tool results.
3. **RESPECT GAME MODE**: Always consider the user's account type. Never suggest GE purchases to ironmen.
4. **VERIFY BEFORE RECOMMENDING**: If suggesting a boss, quest, or activity, check that the user's stats are sufficient.`;
}

// ============================================
// MAIN API HANDLER
// ============================================

// ============================================
// TOPIC GUARDRAIL
// ============================================

/** Quick check to reject blatantly off-topic or prompt-injection attempts. */
function isOffTopic(text: string): boolean {
  const lower = text.toLowerCase();

  // Prompt injection patterns
  const injectionPatterns = [
    /ignore (all |your |previous |above )?instructions/i,
    /disregard (all |your |previous |above )?instructions/i,
    /forget (all |your |previous |above )?instructions/i,
    /you are now/i,
    /new persona/i,
    /act as (?!a player|an ironman|a hardcore)/i,
    /pretend you(?:'re| are) (?!a player|an ironman)/i,
    /system prompt/i,
    /reveal your (instructions|prompt|system)/i,
    /what are your instructions/i,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(text)) return true;
  }

  // Clearly off-topic categories (only block if there's zero OSRS context)
  const osrsKeywords = [
    'osrs', 'runescape', 'rs', 'quest', 'boss', 'skill', 'level', 'xp',
    'gear', 'item', 'slayer', 'prayer', 'combat', 'gp', 'gold', 'wiki',
    'ironman', 'hcim', 'uim', 'ge ', 'grand exchange', 'drop', 'pet',
    'clue', 'diary', 'minigame', 'raid', 'cox', 'tob', 'toa',
    'wilderness', 'pvp', 'pvm', 'pk', 'barrows', 'godwars', 'zulrah',
    'vorkath', 'gauntlet', 'inferno', 'fire cape', 'dragon', 'rune',
    'abyssal', 'whip', 'blowpipe', 'trident', 'sailing', 'fishing',
    'mining', 'woodcutting', 'cooking', 'crafting', 'herblore', 'agility',
    'runecrafting', 'hunter', 'thieving', 'farming', 'construction',
    'fletching', 'firemaking', 'smithing', 'account', 'stats', 'total level',
    'dps', 'max hit', 'spec', 'special attack', 'potion', 'food',
  ];

  const hasOsrsContext = osrsKeywords.some((kw) => lower.includes(kw));

  // Only hard-block if clearly off-topic AND no OSRS context
  if (!hasOsrsContext) {
    const offTopicPatterns = [
      /write (me )?(a |an )?(essay|story|poem|code|script|email)/i,
      /help me (hack|cheat|steal|scam)/i,
      /how to (hack|ddos|dox|swat)/i,
      /generate (code|python|javascript|html|sql)/i,
      /translate .+ (to|into) (french|spanish|german|chinese|japanese)/i,
    ];
    for (const pattern of offTopicPatterns) {
      if (pattern.test(text)) return true;
    }
  }

  return false;
}

export async function POST(req: Request) {
  // ── Rate Limiting ──
  const clientId = getClientIdentifier(req);
  const rateCheck = checkRateLimit(`chat:${clientId}`, {
    limit: 30,          // 30 messages
    windowSeconds: 60,  // per minute
  });

  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded. Please wait before sending more messages.',
        retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil((rateCheck.resetAt - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  try {
    const body = await req.json();

    // Validate request body
    const parseResult = chatRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parseResult.error.flatten() }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { messages, userContext, profile } = parseResult.data;

    const latestUserMessage = messages
      .slice()
      .reverse()
      .find((m) => m.role === 'user')?.content || '';

    // ── Topic Guardrail ──
    if (latestUserMessage && isOffTopic(latestUserMessage)) {
      return new Response(
        JSON.stringify({
          error: 'I can only help with Old School RuneScape topics. Please ask me about OSRS!',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Optional: RAG context retrieval
    let ragContext = '';
    if (isRAGConfigured() && latestUserMessage) {
      try {
        const relevantDocs = await retrieveContext(latestUserMessage, {
          matchThreshold: 0.7,
          matchCount: 2,
        });
        if (relevantDocs.length > 0) {
          ragContext = formatContextForPrompt(relevantDocs);
          debugLog(`RAG: Retrieved ${relevantDocs.length} cached documents`);
        }
      } catch (ragError) {
        console.error('RAG retrieval error:', ragError);
      }
    }

    const baseSystemPrompt = buildSystemPrompt(userContext, profile);
    const systemPrompt = ragContext
      ? `${baseSystemPrompt}\n\n### CACHED KNOWLEDGE (from previous lookups):\n${ragContext}`
      : baseSystemPrompt;

    const modelId = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat';

    const modelMessages: ModelMessage[] = messages.map((m) =>
      m.role === 'user'
        ? { role: 'user' as const, content: m.content }
        : { role: 'assistant' as const, content: m.content }
    );

    const result = streamText({
      model: openrouter.chat(modelId),
      system: systemPrompt,
      messages: modelMessages,
      stopWhen: stepCountIs(5),
      tools: {
        searchWiki: tool({
          description: 'Search the OSRS Wiki for a topic. Use when unsure of exact page name. Returns search results and top page summary.',
          inputSchema: z.object({
            query: z.string().describe('Search query (e.g., "dragon scimitar", "zulrah guide", "quest requirements")'),
          }),
          execute: async ({ query }) => {
            debugLog(`[Tool] searchWiki: "${query}"`);
            try {
              const results = await searchWiki(query);
              if (results.length === 0) {
                return { success: false as const, message: 'No Wiki pages found for that search.' };
              }

              const topResult = results[0];
              const pageContent = await getWikiPage(topResult.title);

              return {
                success: true as const,
              searchResults: results.slice(0, 5).map((r) => ({
                title: r.title,
                snippet: r.snippet.replace(/<[^>]*>/g, '').slice(0, 150),
              })),
              topPage: pageContent
                ? {
                    title: pageContent.title,
                    url: pageContent.fullurl,
                    summary: pageContent.extract.slice(0, 800),
                    imageUrl: pageContent.imageUrl || null,
                  }
                : null,
            };
            } catch (error) {
              console.error('[Tool Error] searchWiki failed:', error);
              return { success: false as const, message: `Wiki search failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
            }
          },
        }),

        getWikiPage: tool({
          description: 'Read full content of a specific OSRS Wiki page. Use for detailed drop rates, quest steps, boss mechanics.',
          inputSchema: z.object({
            title: z.string().describe('Exact Wiki page title (e.g., "Abyssal whip", "Dragon Slayer II", "Zulrah")'),
          }),
          execute: async ({ title }) => {
            debugLog(`[Tool] getWikiPage: "${title}"`);

            // Check cache first
            const cached = await getCachedWikiPage(title);
            if (cached) {
              debugLog(`[Cache HIT] ${title}`);
              return {
                success: true as const,
                fromCache: true,
                title: cached.title,
                url: cached.url,
                content: cached.content.slice(0, 8000),
                imageUrl: cached.imageUrl,
              };
            }

            debugLog(`[Cache MISS] Fetching ${title} from Wiki`);
            const content = await getWikiPageFull(title);
            const pageInfo = await getWikiPage(title);

            if (!content) {
              return {
                success: false as const,
                message: `Wiki page "${title}" not found. Try searchWiki to find the correct name.`,
              };
            }

            const url = pageInfo?.fullurl || `https://oldschool.runescape.wiki/w/${encodeURIComponent(title)}`;
            const imageUrl = pageInfo?.imageUrl || null;

            // Cache for future RAG retrieval
            await cacheWikiPage(title, content, url, imageUrl);

              return {
              success: true as const,
              fromCache: false,
              title: pageInfo?.title || title,
              url,
              content: content.slice(0, 8000),
              imageUrl,
            };
          },
        }),

        getItemPrice: tool({
          description: 'Get live Grand Exchange prices. Use when users ask about costs, item values, or money-making comparisons.',
          inputSchema: z.object({
            itemName: z.string().describe('Item name (e.g., "Abyssal whip", "Dragon bones", "Twisted bow")'),
          }),
          execute: async ({ itemName }) => {
            debugLog(`[Tool] getItemPrice: "${itemName}"`);
            const priceData = await getItemPrice(itemName);
            if (!priceData) {
              return {
                success: false as const,
                message: `Could not find GE price for "${itemName}". Check the item name spelling.`,
              };
            }
            return {
              success: true as const,
              itemName: priceData.itemName,
              highPrice: priceData.highPrice,
              lowPrice: priceData.lowPrice,
              avgPrice: priceData.avgPrice,
              volume: priceData.volume,
              wikiUrl: priceData.wikiUrl,
              formatted: formatPriceSummary(priceData),
            };
          },
        }),

        searchWeb: tool({
          description: 'Search the web for OSRS community content (Reddit, YouTube guides). Use for meta strategies or opinions.',
          inputSchema: z.object({
            query: z.string().describe('Web search query (e.g., "best slayer block list 2024", "vorkath beginner guide")'),
          }),
          execute: async ({ query }) => {
            debugLog(`[Tool] searchWeb: "${query}"`);
            const results = await searchWeb(query, {
              searchDepth: 'advanced',
              maxResults: 5,
              includeAnswer: true,
            });
            if (!results || results.results.length === 0) {
              return { success: false as const, message: 'No web results found.' };
            }
            return {
              success: true as const,
              answer: results.answer || null,
              results: results.results.slice(0, 3).map((r) => ({
                title: r.title,
                url: r.url,
                snippet: r.content.slice(0, 250),
              })),
            };
          },
        }),
        lookupPlayer: tool({
          description: 'Look up any OSRS player\'s stats and recent activity from Wise Old Man. Use when users ask about another player or want to compare.',
          inputSchema: z.object({
            username: z.string().describe('RuneScape username to look up (e.g., "Zezima", "Woox")'),
          }),
          execute: async ({ username: lookupUsername }) => {
            debugLog(`[Tool] lookupPlayer: "${lookupUsername}"`);
            const playerStats = await getPlayerStats(lookupUsername);
            if (!playerStats) {
              return {
                success: false as const,
                message: `Player "${lookupUsername}" not found on Wise Old Man. They may need to be tracked first.`,
              };
            }

            const statsSummary = formatStatsSummary(playerStats);
            const gains = await getPlayerGains(lookupUsername, 'week');
            const gainsSummary = gains ? formatGainsSummary(gains) : 'No recent gains data';

            return {
              success: true as const,
              displayName: playerStats.displayName,
              type: playerStats.type,
              combatLevel: playerStats.combatLevel,
              statsSummary,
              gainsSummary,
            };
          },
        }),      },
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
