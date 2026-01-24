import { searchWiki, getWikiPage, getWikiPageFull, getItemPrice, formatPriceSummary } from '@/lib/osrs';
import { searchWeb, formatSearchResults } from '@/lib/tavily';
import { retrieveContext, formatContextForPrompt, isRAGConfigured, addDocument } from '@/lib/rag';
import { getSupabaseClient } from '@/lib/supabase';
import type { UserContext, CollectionLogItem } from '@/lib/types';

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

// Profile data passed from client
interface ProfileData {
  memoryNotes: string | null;
  achievements: Array<{ type: string; date: string; description?: string }>;
  notableItems: string[];
  goals: string | null;
  playStyle: string | null;
}

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

/**
 * Check if a Wiki page is already cached in Supabase
 */
async function getCachedWikiPage(title: string): Promise<CachedWikiPage | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const normalizedTitle = title.toLowerCase().trim();
    const { data, error } = await (supabase as any)
      .from('documents')
      .select('content, metadata')
      .eq('metadata->>type', 'wiki_page')
      .ilike('metadata->>title', normalizedTitle)
      .limit(1)
      .single();

    if (error || !data) return null;

    return {
      title: data.metadata?.title || title,
      content: data.content,
      url: data.metadata?.url || '',
      imageUrl: data.metadata?.imageUrl || null,
      cachedAt: data.metadata?.cachedAt || '',
    };
  } catch {
    return null;
  }
}

/**
 * Cache a Wiki page to Supabase documents table
 */
async function cacheWikiPage(
  title: string,
  content: string,
  url: string,
  imageUrl?: string | null
): Promise<void> {
  try {
    const metadata = {
      type: 'wiki_page',
      title: title.toLowerCase().trim(),
      displayTitle: title,
      url,
      imageUrl,
      cachedAt: new Date().toISOString(),
    };
    
    await addDocument(content, metadata);
    console.log(`Cached Wiki page: ${title}`);
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
    'fishing', 'cooking', 'woodcutting', 'crafting', 'runecrafting', 'hunter', 'agility', 'thieving'
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
  items.slice(0, 25).forEach(item => {
    lines.push(`- ${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`);
  });

  if (items.length > 25) {
    lines.push(`... and ${items.length - 25} more items`);
  }

  return lines.join('\n');
}

// ============================================
// SYSTEM PROMPT - "RESEARCHER" MODE
// ============================================

function buildSystemPrompt(userContext: UserContext | null, profile: ProfileData | null): string {
  const stats = userContext?.stats;
  const username = stats?.displayName || userContext?.username || 'Adventurer';
  const gameMode = stats?.type || 'regular';
  const combatLevel = stats?.combatLevel || 3;
  const totalLevel = stats?.latestSnapshot?.data?.skills?.overall?.level || 0;
  const keySkills = stats ? getKeySkills(stats) : 'Unknown';

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
        .map(a => `- ${a.type}${a.description ? `: ${a.description}` : ''}`)
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

  return `You are the **Wise Old AI** - an expert Old School RuneScape researcher helping **${username}**.

## 🔧 TOOLS & RESEARCH (CRITICAL - READ THIS!)

You have access to the **ENTIRE OSRS Wiki** via tools. **DO NOT GUESS OR MAKE UP INFORMATION.**

### MANDATORY TOOL USAGE:
1. **ALWAYS VERIFY** - If the user asks about drop rates, quest requirements, item stats, boss mechanics, or ANY factual data, you MUST use a tool to look it up.
2. **searchWiki** - Use this when unsure of the exact page name. Example: User asks "Where do I get a Bond?" → Call \`searchWiki("Old School Bond")\`
3. **getWikiPage** - Use this to read the full content of a specific Wiki page for detailed info.
4. **getItemPrice** - Use this for Grand Exchange prices (real-time data).

### WHEN TO USE TOOLS:
✅ "What's the drop rate for X?" → searchWiki + getWikiPage
✅ "How much is X worth?" → getItemPrice  
✅ "Requirements for quest X?" → getWikiPage("Quest Name")
✅ "How do I kill boss X?" → getWikiPage("Boss Name")
✅ "Where do I get item X?" → searchWiki + getWikiPage

### WHEN NOT TO USE TOOLS:
❌ Simple greetings ("Hi!", "Thanks!")
❌ Opinion questions ("What do you think of...")
❌ Things you can answer from the user's provided stats

### TRANSPARENCY:
When you use a tool, briefly acknowledge it: "Let me check the Wiki..." or "Looking up prices..."

## 📊 USER CONTEXT

- **Username:** ${username}
- **Account Type:** ${gameMode.toUpperCase()}
- **Combat Level:** ${combatLevel}
- **Total Level:** ${totalLevel}
- **Key Skills:** ${keySkills}

${getGameModeRules(gameMode)}
${collectionLogSection}
${memorySection}

## 📝 RESPONSE STYLE

- **BE CONCISE**: Answer directly in 1-3 sentences for simple questions.
- **NO FLUFF**: Don't start with "Great question!" - just give the answer.
- **CITE SOURCES**: When using Wiki data, you can mention "According to the Wiki..."
- **INCLUDE IMAGES**: If a tool returns an imageUrl, include it using \`![Name](url)\`
- **ASK IF NEEDED**: If you need clarification, ask the user.

## ⚠️ STRICT CONSTRAINTS

1. **OSRS ONLY**: Only discuss Old School RuneScape. Refuse RS3, other games, or off-topic requests.
2. **NO HALLUCINATION**: If you don't know something and can't find it via tools, say "I couldn't find that information."
3. **RESPECT GAME MODE**: Always consider the user's account type (Ironman restrictions, etc.)`;
}

// ============================================
// TOOL DEFINITIONS
// ============================================

const tools = {
  searchWiki: {
    description: 'Search the OSRS Wiki for a topic. Use this if unsure of the exact page name.',
    execute: async (query: string) => {
      console.log(`[Tool] searchWiki: "${query}"`);
      const results = await searchWiki(query);
      if (results.length === 0) {
        return { success: false, message: 'No Wiki pages found for that search.' };
      }
      
      // Get summary of top result
      const topResult = results[0];
      const pageContent = await getWikiPage(topResult.title);
      
      return {
        success: true,
        searchResults: results.slice(0, 5).map(r => ({
          title: r.title,
          snippet: r.snippet.replace(/<[^>]*>/g, '').slice(0, 150),
        })),
        topPage: pageContent ? {
          title: pageContent.title,
          url: pageContent.fullurl,
          summary: pageContent.extract.slice(0, 800),
          imageUrl: pageContent.imageUrl || null,
        } : null,
      };
    },
  },
  
  getWikiPage: {
    description: 'Read the full content of a specific OSRS Wiki page. Use for detailed info.',
    execute: async (title: string) => {
      console.log(`[Tool] getWikiPage: "${title}"`);
      
      // Check cache first
      const cached = await getCachedWikiPage(title);
      if (cached) {
        console.log(`[Cache HIT] ${title}`);
        return {
          success: true,
          fromCache: true,
          title: cached.title,
          url: cached.url,
          content: cached.content.slice(0, 4000),
          imageUrl: cached.imageUrl,
        };
      }
      
      // Fetch from Wiki
      console.log(`[Cache MISS] Fetching ${title} from Wiki`);
      const content = await getWikiPageFull(title);
      const pageInfo = await getWikiPage(title);
      
      if (!content) {
        return { success: false, message: `Wiki page "${title}" not found. Try searchWiki to find the correct name.` };
      }
      
      const url = pageInfo?.fullurl || `https://oldschool.runescape.wiki/w/${encodeURIComponent(title)}`;
      const imageUrl = pageInfo?.imageUrl || null;
      
      // Cache for future use (async, don't wait)
      cacheWikiPage(title, content, url, imageUrl);
      
      return {
        success: true,
        fromCache: false,
        title: pageInfo?.title || title,
        url,
        content: content.slice(0, 4000),
        imageUrl,
      };
    },
  },
  
  getItemPrice: {
    description: 'Get real-time Grand Exchange prices for an OSRS item.',
    execute: async (itemName: string) => {
      console.log(`[Tool] getItemPrice: "${itemName}"`);
      const priceData = await getItemPrice(itemName);
      if (!priceData) {
        return { success: false, message: `Could not find GE price for "${itemName}". Check the item name spelling.` };
      }
      return {
        success: true,
        itemName: priceData.itemName,
        highPrice: priceData.highPrice,
        lowPrice: priceData.lowPrice,
        avgPrice: priceData.avgPrice,
        volume: priceData.volume,
        wikiUrl: priceData.wikiUrl,
        formatted: formatPriceSummary(priceData),
      };
    },
  },
  
  searchWeb: {
    description: 'Search the web for OSRS guides, Reddit discussions, or YouTube content.',
    execute: async (query: string) => {
      console.log(`[Tool] searchWeb: "${query}"`);
      const results = await searchWeb(query, {
        searchDepth: 'advanced',
        maxResults: 5,
        includeAnswer: true,
      });
      if (!results || results.results.length === 0) {
        return { success: false, message: 'No web results found.' };
      }
      return {
        success: true,
        answer: results.answer || null,
        results: results.results.slice(0, 3).map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.content.slice(0, 250),
        })),
      };
    },
  },
};

// OpenRouter tool definitions
const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'searchWiki',
      description: 'Search the OSRS Wiki for a topic. Use when unsure of exact page name. Returns search results and top page summary.',
      parameters: {
        type: 'object',
        properties: {
          query: { 
            type: 'string', 
            description: 'Search query (e.g., "dragon scimitar", "zulrah guide", "quest requirements")' 
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getWikiPage',
      description: 'Read full content of a specific OSRS Wiki page. Use for detailed drop rates, quest steps, boss mechanics.',
      parameters: {
        type: 'object',
        properties: {
          title: { 
            type: 'string', 
            description: 'Exact Wiki page title (e.g., "Abyssal whip", "Dragon Slayer II", "Zulrah")' 
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getItemPrice',
      description: 'Get live Grand Exchange prices. Use when users ask about costs, item values, or money-making comparisons.',
      parameters: {
        type: 'object',
        properties: {
          itemName: { 
            type: 'string', 
            description: 'Item name (e.g., "Abyssal whip", "Dragon bones", "Twisted bow")' 
          },
        },
        required: ['itemName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchWeb',
      description: 'Search for OSRS community content (Reddit, YouTube guides). Use for meta strategies or opinions.',
      parameters: {
        type: 'object',
        properties: {
          query: { 
            type: 'string', 
            description: 'Web search query (e.g., "best slayer block list 2024", "vorkath beginner guide")' 
          },
        },
        required: ['query'],
      },
    },
  },
];

// ============================================
// MAIN API HANDLER
// ============================================

export async function POST(req: Request) {
  try {
    const { messages, userContext, profile } = await req.json();

    const latestUserMessage = messages
      .slice()
      .reverse()
      .find((m: { role: string }) => m.role === 'user')?.content || '';

    // Optional: RAG context retrieval
    let ragContext = '';
    if (isRAGConfigured() && latestUserMessage) {
      try {
        const relevantDocs = await retrieveContext(latestUserMessage, {
          matchThreshold: 0.70,
          matchCount: 2,
        });
        if (relevantDocs.length > 0) {
          ragContext = formatContextForPrompt(relevantDocs);
          console.log(`RAG: Retrieved ${relevantDocs.length} cached documents`);
        }
      } catch (ragError) {
        console.error('RAG retrieval error:', ragError);
      }
    }

    const baseSystemPrompt = buildSystemPrompt(userContext, profile);
    const systemPrompt = ragContext
      ? `${baseSystemPrompt}\n\n### CACHED KNOWLEDGE (from previous lookups):\n${ragContext}`
      : baseSystemPrompt;

    const formattedMessages = messages.map((msg: { role: string; content: string }) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: typeof msg.content === 'string' ? msg.content : String(msg.content),
    }));

    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...formattedMessages,
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://osrs-agent.local',
        'X-Title': 'OSRS Helper Agent',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat',
        messages: allMessages,
        stream: true,
        tools: toolDefinitions,
        tool_choice: 'auto',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', errorText);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let buffer = '';
        let pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = [];

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                if (delta?.content) {
                  controller.enqueue(encoder.encode(delta.content));
                }

                if (delta?.tool_calls) {
                  for (const toolCall of delta.tool_calls) {
                    const index = toolCall.index || 0;
                    if (!pendingToolCalls[index]) {
                      pendingToolCalls[index] = {
                        id: toolCall.id || '',
                        name: toolCall.function?.name || '',
                        arguments: '',
                      };
                    }
                    if (toolCall.id) pendingToolCalls[index].id = toolCall.id;
                    if (toolCall.function?.name) pendingToolCalls[index].name = toolCall.function.name;
                    if (toolCall.function?.arguments) pendingToolCalls[index].arguments += toolCall.function.arguments;
                  }
                }

                if (parsed.choices?.[0]?.finish_reason === 'tool_calls' && pendingToolCalls.length > 0) {
                  for (const toolCall of pendingToolCalls) {
                    if (!toolCall.name || !toolCall.arguments) continue;

                    try {
                      const args = JSON.parse(toolCall.arguments);
                      const toolFn = tools[toolCall.name as keyof typeof tools];
                      
                      if (toolFn) {
                        const toolArg = args.query || args.title || args.itemName;
                        
                        // Show user that we're researching
                        const statusText = `\n\n📖 *Checking ${toolCall.name === 'getWikiPage' ? 'Wiki page' : toolCall.name === 'searchWiki' ? 'Wiki' : toolCall.name === 'getItemPrice' ? 'GE prices' : 'web'}: "${toolArg}"...*\n\n`;
                        controller.enqueue(encoder.encode(statusText));
                        
                        const result = await toolFn.execute(toolArg);
                        
                        const toolResultMessages = [
                          ...allMessages,
                          {
                            role: 'assistant',
                            content: null,
                            tool_calls: [{
                              id: toolCall.id,
                              type: 'function',
                              function: { name: toolCall.name, arguments: toolCall.arguments }
                            }]
                          },
                          {
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: JSON.stringify(result),
                          },
                        ];

                        const followUpResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                          },
                          body: JSON.stringify({
                            model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat',
                            messages: toolResultMessages,
                            stream: true,
                          }),
                        });

                        if (followUpResponse.ok) {
                          const followUpReader = followUpResponse.body?.getReader();
                          if (followUpReader) {
                            let followUpBuffer = '';
                            while (true) {
                              const { done: fuDone, value: fuValue } = await followUpReader.read();
                              if (fuDone) break;
                              
                              followUpBuffer += decoder.decode(fuValue, { stream: true });
                              const fuLines = followUpBuffer.split('\n');
                              followUpBuffer = fuLines.pop() || '';
                              
                              for (const fuLine of fuLines) {
                                if (!fuLine.startsWith('data: ')) continue;
                                const fuData = fuLine.slice(6);
                                if (fuData === '[DONE]') continue;
                                
                                try {
                                  const fuParsed = JSON.parse(fuData);
                                  const fuContent = fuParsed.choices?.[0]?.delta?.content;
                                  if (fuContent) {
                                    controller.enqueue(encoder.encode(fuContent));
                                  }
                                } catch {}
                              }
                            }
                          }
                        }
                      }
                    } catch (toolError) {
                      console.error('Tool execution error:', toolError);
                      controller.enqueue(encoder.encode(`\n\n⚠️ *Tool error, continuing without...*\n\n`));
                    }
                  }
                }
              } catch (parseError) {
                // Skip malformed JSON
              }
            }
          }
        } catch (streamError) {
          console.error('Stream error:', streamError);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process chat request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
