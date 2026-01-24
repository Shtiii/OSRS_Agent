import { searchWiki, getWikiPage, getWikiPageFull, getItemPrice, formatPriceSummary } from '@/lib/osrs';
import { searchWeb, formatSearchResults } from '@/lib/tavily';
import { retrieveContext, formatContextForPrompt, isRAGConfigured } from '@/lib/rag';
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

// Helper function to get key skills from stats
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

// Helper function to inject specific rules based on account type
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

// Helper function to format rare items for prompt
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

// Build dynamic system prompt based on user context and profile memory
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

  return `You are an expert Old School RuneScape (OSRS) assistant helping **${username}**.

### STRICT CONSTRAINTS (YOU MUST FOLLOW THESE):
1. **OSRS ONLY:** You possess knowledge ONLY about Old School RuneScape. If asked about real-world topics, politics, RS3, or other games, politely refuse and steer the conversation back to OSRS.
2. **NO HALLUCINATION:** If you do not know a drop rate, specific mechanic, quest step, or any factual data, ADMIT IT. Do not invent numbers or mechanics.
3. **DATA DRIVEN:** Use the provided stats below to tailor your advice. Do NOT suggest high-level content (like ToB or Inferno) if the user has mid-level stats.

### USER CONTEXT (CRITICAL - READ THIS):
- **Username:** ${username}
- **Account Type:** ${gameMode.toUpperCase()}
- **Combat Level:** ${combatLevel}
- **Total Level:** ${totalLevel}
- **Key Skills:** ${keySkills}

${getGameModeRules(gameMode)}
${collectionLogSection}
${memorySection}

### HOW TO GIVE GREAT ADVICE:
1. **Check Requirements:** Before suggesting content, verify the user meets the requirements using their stats above.
2. **Prioritize Owned Gear:** If suggesting gear, CHECK the collection log above first. Recommend items they already own before suggesting purchases.
3. **Ask for Clarification:** If you need more info (e.g., "What's your Slayer level?" or "What's your budget?"), ASK the user.
4. **Be Specific:** Give exact numbers when possible (drop rates, GP/hr, XP/hr).
5. **Format Clearly:** Use headers, bullet points, and organized sections for complex answers.

### VISUAL RESPONSES:
When discussing specific items, bosses, or gear, include images to make your responses more visual and helpful:
- Use Markdown image syntax: \`![Item Name](image_url)\`
- If a tool returns an \`imageUrl\`, include it in your response to show the item/boss
- Example: When explaining the Abyssal whip, include its image to help the user visualize it

### INTERACTION STYLE:
- Be helpful, enthusiastic about OSRS, and concise.
- Use OSRS terminology naturally (tick manipulation, 3t fishing, BiS, etc.).
- Be encouraging about progress but realistic about challenges.
- If the user mentions an achievement, congratulate them genuinely!`;
}

// Define tool functions
const tools = {
  searchWiki: {
    description: 'Search the official OSRS Wiki for factual information.',
    execute: async (query: string) => {
      const results = await searchWiki(query);
      if (results.length === 0) {
        return { success: false, message: 'No Wiki pages found.' };
      }
      const topResult = results[0];
      const pageContent = await getWikiPage(topResult.title);
      return {
        success: true,
        results: results.slice(0, 3).map(r => ({
          title: r.title,
          snippet: r.snippet.replace(/<[^>]*>/g, ''),
        })),
        topPage: pageContent ? {
          title: pageContent.title,
          url: pageContent.fullurl,
          content: pageContent.extract.slice(0, 1500),
          imageUrl: pageContent.imageUrl || null,
        } : null,
      };
    },
  },
  searchWeb: {
    description: 'Search the web for OSRS community content.',
    execute: async (query: string) => {
      const results = await searchWeb(query, {
        searchDepth: 'advanced',
        maxResults: 5,
        includeAnswer: true,
      });
      if (!results || results.results.length === 0) {
        return { success: false, message: 'No results found.' };
      }
      return {
        success: true,
        answer: results.answer || null,
        results: results.results.slice(0, 3).map(r => ({
          title: r.title,
          url: r.url,
          content: r.content.slice(0, 300),
        })),
      };
    },
  },
  getWikiPage: {
    description: 'Get detailed content from a specific OSRS Wiki page.',
    execute: async (title: string) => {
      const content = await getWikiPageFull(title);
      const pageInfo = await getWikiPage(title);
      if (!content) {
        return { success: false, message: `Wiki page "${title}" not found.` };
      }
      return {
        success: true,
        title: pageInfo?.title || title,
        url: pageInfo?.fullurl || `https://oldschool.runescape.wiki/w/${encodeURIComponent(title)}`,
        content: content.slice(0, 3000),
      };
    },
  },
  getItemPrice: {
    description: 'Get real-time Grand Exchange prices for an OSRS item.',
    execute: async (itemName: string) => {
      const priceData = await getItemPrice(itemName);
      if (!priceData) {
        return { success: false, message: `Could not find price for "${itemName}".` };
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
};

// OpenRouter tool definitions for function calling
const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'searchWiki',
      description: 'Search the official OSRS Wiki for factual information like drop rates, quest requirements, item stats.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query for the OSRS Wiki' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchWeb',
      description: 'Search the web for OSRS community content like Reddit discussions, YouTube guides.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getWikiPage',
      description: 'Get detailed content from a specific OSRS Wiki page.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The exact title of the Wiki page' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getItemPrice',
      description: 'Get real-time Grand Exchange prices for an OSRS item. Use this when users ask about item prices, costs, or when comparing GP/hr for money making methods.',
      parameters: {
        type: 'object',
        properties: {
          itemName: { type: 'string', description: 'The name of the OSRS item to get prices for (e.g., "Abyssal whip", "Dragon bones", "Bond")' },
        },
        required: ['itemName'],
      },
    },
  },
];

export async function POST(req: Request) {
  try {
    const { messages, userContext, profile } = await req.json();

    // Get the latest user message for RAG context retrieval
    const latestUserMessage = messages
      .slice()
      .reverse()
      .find((m: { role: string }) => m.role === 'user')?.content || '';

    // Retrieve relevant context from vector store (if RAG is configured)
    let ragContext = '';
    if (isRAGConfigured() && latestUserMessage) {
      try {
        const relevantDocs = await retrieveContext(latestUserMessage, {
          matchThreshold: 0.65,
          matchCount: 3,
        });
        if (relevantDocs.length > 0) {
          ragContext = formatContextForPrompt(relevantDocs);
          console.log(`RAG: Retrieved ${relevantDocs.length} relevant documents`);
        }
      } catch (ragError) {
        console.error('RAG retrieval error:', ragError);
        // Continue without RAG context - graceful degradation
      }
    }

    // Build system prompt with optional RAG context
    const baseSystemPrompt = buildSystemPrompt(userContext, profile);
    const systemPrompt = ragContext
      ? `${baseSystemPrompt}\n\n${ragContext}`
      : baseSystemPrompt;

    // Ensure messages are in the correct format for OpenRouter
    const formattedMessages = messages.map((msg: { role: string; content: string }) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: typeof msg.content === 'string' ? msg.content : String(msg.content),
    }));

    // Add system message at the beginning
    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...formattedMessages,
    ];

    // Use /chat/completions endpoint directly for better compatibility
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

    // Create a TransformStream to process the SSE response
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

                // Handle tool calls
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

                // Check if we finished with tool calls (finish_reason: tool_calls)
                if (parsed.choices?.[0]?.finish_reason === 'tool_calls' && pendingToolCalls.length > 0) {
                  // Execute tools and get results
                  for (const toolCall of pendingToolCalls) {
                    if (!toolCall.name || !toolCall.arguments) continue;

                    try {
                      const args = JSON.parse(toolCall.arguments);
                      const toolFn = tools[toolCall.name as keyof typeof tools];
                      
                      if (toolFn) {
                        // Extract the appropriate argument based on tool type
                        const toolArg = args.query || args.title || args.itemName;
                        const result = await toolFn.execute(toolArg);
                        
                        // Send tool result as markdown to user
                        const toolResultText = `\n\n*[Searched: ${toolCall.name}]*\n\n`;
                        controller.enqueue(encoder.encode(toolResultText));
                        
                        // Make a follow-up call with tool results
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

                        // Get the AI's response after tool execution
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
