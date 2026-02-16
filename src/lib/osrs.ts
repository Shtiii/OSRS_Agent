import type {
  WOMPlayerDetails,
  WOMGains,
  WikiSearchResult,
  WikiPageContent,
} from './types';

const WOM_BASE_URL = 'https://api.wiseoldman.net/v2';
const WIKI_BASE_URL = 'https://oldschool.runescape.wiki/api.php';
const PRICES_BASE_URL = 'https://prices.runescape.wiki/api/v1/osrs';

// ============================================
// Rate Limiter for Wiki API calls
// ============================================

// Simple rate limiter for Wiki API calls
const RATE_LIMIT_DELAY = 200; // ms between wiki requests (5/sec max)
let lastWikiRequest = 0;
async function rateLimitedFetch(url: string, options?: RequestInit): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastWikiRequest;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest));
  }
  lastWikiRequest = Date.now();
  return fetch(url, options);
}

// ============================================
// Types for Real-Time Prices
// ============================================

export interface ItemPriceData {
  itemId: number;
  itemName: string;
  highPrice: number | null;
  lowPrice: number | null;
  highTime: number | null;
  lowTime: number | null;
  avgPrice: number | null;
  volume: number | null;
  wikiUrl: string;
}

interface WikiItemIdResponse {
  itemId: number | null;
  itemName: string;
}

// Cache for item mappings (Wiki name -> item ID)
let itemMappingCache: Record<string, number> | null = null;
let mappingCacheTime = 0;
const MAPPING_CACHE_TTL = 3600000; // 1 hour

// ============================================
// Price data caches
// ============================================

let latestPriceCache: Record<string, any> | null = null;
let latestPriceCacheTime = 0;
const PRICE_CACHE_TTL = 60000; // 60 seconds

let volumeCache: Record<string, any> | null = null;
let volumeCacheTime = 0;
const VOLUME_CACHE_TTL = 120000; // 2 minutes

async function getLatestPrices(): Promise<Record<string, any>> {
  if (latestPriceCache && Date.now() - latestPriceCacheTime < PRICE_CACHE_TTL) {
    return latestPriceCache;
  }
  try {
    const response = await fetch(`${PRICES_BASE_URL}/latest`, {
      headers: { 'User-Agent': 'OSRS-Agent-Dashboard/1.0' },
    });
    if (!response.ok) throw new Error(`Prices API error: ${response.status}`);
    const data = await response.json();
    latestPriceCache = data.data || {};
    latestPriceCacheTime = Date.now();
    return latestPriceCache!;
  } catch (error) {
    console.error('Error fetching latest prices:', error);
    return latestPriceCache ?? {};
  }
}

async function getVolumeData(): Promise<Record<string, any>> {
  if (volumeCache && Date.now() - volumeCacheTime < VOLUME_CACHE_TTL) {
    return volumeCache;
  }
  try {
    const response = await fetch(`${PRICES_BASE_URL}/1h`, {
      headers: { 'User-Agent': 'OSRS-Agent-Dashboard/1.0' },
    });
    if (!response.ok) throw new Error(`Volume API error: ${response.status}`);
    const data = await response.json();
    volumeCache = data.data || {};
    volumeCacheTime = Date.now();
    return volumeCache!;
  } catch (error) {
    console.error('Error fetching volume data:', error);
    return volumeCache ?? {};
  }
}

/**
 * Fetch player details from Wise Old Man API
 */
export async function getPlayerStats(username: string): Promise<WOMPlayerDetails | null> {
  try {
    const encodedUsername = encodeURIComponent(username.toLowerCase());
    const response = await fetch(`${WOM_BASE_URL}/players/${encodedUsername}`, {
      headers: {
        'User-Agent': 'OSRS-Agent-Dashboard/1.0',
      },
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Player not found, try to track them
        return await trackPlayer(username);
      }
      throw new Error(`WOM API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching player stats:', error);
    return null;
  }
}

/**
 * Track a new player on Wise Old Man
 */
export async function trackPlayer(username: string): Promise<WOMPlayerDetails | null> {
  try {
    const response = await fetch(`${WOM_BASE_URL}/players`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'OSRS-Agent-Dashboard/1.0',
      },
      body: JSON.stringify({ username }),
    });

    if (!response.ok) {
      throw new Error(`Failed to track player: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error tracking player:', error);
    return null;
  }
}

/**
 * Update player stats on Wise Old Man
 */
export async function updatePlayerStats(username: string): Promise<WOMPlayerDetails | null> {
  try {
    const encodedUsername = encodeURIComponent(username.toLowerCase());
    const response = await fetch(`${WOM_BASE_URL}/players/${encodedUsername}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'OSRS-Agent-Dashboard/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to update player: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating player stats:', error);
    return null;
  }
}

/**
 * Get player gains from Wise Old Man
 */
export async function getPlayerGains(
  username: string,
  period: 'day' | 'week' | 'month' | 'year' = 'week'
): Promise<WOMGains | null> {
  try {
    const encodedUsername = encodeURIComponent(username.toLowerCase());
    const response = await fetch(
      `${WOM_BASE_URL}/players/${encodedUsername}/gained?period=${period}`,
      {
        headers: {
          'User-Agent': 'OSRS-Agent-Dashboard/1.0',
        },
        next: { revalidate: 300 }, // Cache for 5 minutes
      }
    );

    if (!response.ok) {
      throw new Error(`WOM API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching player gains:', error);
    return null;
  }
}

/**
 * Search the OSRS Wiki
 */
export async function searchWiki(query: string): Promise<WikiSearchResult[]> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      format: 'json',
      srlimit: '5',
      origin: '*',
    });

    const response = await rateLimitedFetch(`${WIKI_BASE_URL}?${params}`, {
      headers: {
        'User-Agent': 'OSRS-Agent-Dashboard/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Wiki API error: ${response.status}`);
    }

    const data = await response.json();
    return data.query?.search || [];
  } catch (error) {
    console.error('Error searching wiki:', error);
    return [];
  }
}

/**
 * Get page content from OSRS Wiki (with optional image)
 */
export async function getWikiPage(title: string): Promise<WikiPageContent | null> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      titles: title,
      prop: 'extracts|info|pageimages',
      exintro: 'true',
      explaintext: 'true',
      inprop: 'url',
      piprop: 'original', // Get original image
      format: 'json',
      origin: '*',
    });

    const response = await rateLimitedFetch(`${WIKI_BASE_URL}?${params}`, {
      headers: {
        'User-Agent': 'OSRS-Agent-Dashboard/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Wiki API error: ${response.status}`);
    }

    const data = await response.json();
    const pages = data.query?.pages;
    
    if (!pages) return null;
    
    const pageId = Object.keys(pages)[0];
    if (pageId === '-1') return null;
    
    const page = pages[pageId];
    return {
      title: page.title,
      pageid: page.pageid,
      extract: page.extract || '',
      fullurl: page.fullurl || `https://oldschool.runescape.wiki/w/${encodeURIComponent(page.title)}`,
      imageUrl: page.original?.source || null,
    };
  } catch (error) {
    console.error('Error fetching wiki page:', error);
    return null;
  }
}

/**
 * Get full page content with sections (uses action=parse for complete wikitext)
 */
export async function getWikiPageFull(title: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      action: 'parse',
      page: title,
      prop: 'wikitext',
      format: 'json',
      origin: '*',
    });

    const response = await rateLimitedFetch(`${WIKI_BASE_URL}?${params}`, {
      headers: { 'User-Agent': 'OSRS-Agent-Dashboard/1.0' },
    });

    if (!response.ok) {
      throw new Error(`Wiki API error: ${response.status}`);
    }

    const data = await response.json();
    const wikitext = data.parse?.wikitext?.['*'];
    if (!wikitext) return null;

    // Clean wikitext: remove templates, keep readable content
    return cleanWikitext(wikitext);
  } catch (error) {
    console.error('Error fetching full wiki page:', error);
    return null;
  }
}

/**
 * Clean MediaWiki markup into readable plain text for the LLM
 */
function cleanWikitext(wikitext: string): string {
  let text = wikitext;
  
  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  
  // Remove categories
  text = text.replace(/\[\[Category:[^\]]*\]\]/gi, '');
  
  // Remove file/image references but keep alt text
  text = text.replace(/\[\[File:[^\]]*\]\]/gi, '');
  text = text.replace(/\[\[Image:[^\]]*\]\]/gi, '');
  
  // Convert wiki links [[Page|display]] -> display, [[Page]] -> Page
  text = text.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2');
  text = text.replace(/\[\[([^\]]*)\]\]/g, '$1');
  
  // Remove external link markup [url text] -> text
  text = text.replace(/\[https?:\/\/[^\s\]]*\s*([^\]]*)\]/g, '$1');
  
  // Remove common templates but preserve some useful ones
  // Keep {{Coins}} style templates as plain text
  text = text.replace(/\{\{[Cc]oins\|([^}]*)\}\}/g, '$1 coins');
  text = text.replace(/\{\{[Ss]kill\|([^}|]*)[^}]*\}\}/g, '$1');
  
  // Remove infobox templates (multi-line)
  text = text.replace(/\{\{[Ii]nfobox[\s\S]*?\}\}\s*/g, '');
  
  // Remove remaining single-line templates like {{clear}}, {{stub}}, etc.
  text = text.replace(/\{\{[^{}]*\}\}/g, '');
  
  // Remove nested templates (up to 2 deep)
  text = text.replace(/\{\{[^{}]*\{\{[^{}]*\}\}[^{}]*\}\}/g, '');
  text = text.replace(/\{\{[^{}]*\}\}/g, '');
  
  // Convert headers
  text = text.replace(/={5}\s*([^=]+)\s*={5}/g, '##### $1');
  text = text.replace(/={4}\s*([^=]+)\s*={4}/g, '#### $1');
  text = text.replace(/={3}\s*([^=]+)\s*={3}/g, '### $1');
  text = text.replace(/={2}\s*([^=]+)\s*={2}/g, '## $1');
  
  // Convert bold/italic
  text = text.replace(/'{3}([^']+)'{3}/g, '**$1**');
  text = text.replace(/'{2}([^']+)'{2}/g, '*$1*');
  
  // Convert bullet lists
  text = text.replace(/^\*\*\*\*/gm, '        -');
  text = text.replace(/^\*\*\*/gm, '      -');
  text = text.replace(/^\*\*/gm, '    -');
  text = text.replace(/^\*/gm, '-');
  
  // Convert numbered lists
  text = text.replace(/^#{4}/gm, '        1.');
  text = text.replace(/^#{3}/gm, '      1.');
  text = text.replace(/^#{2}/gm, '    1.');
  text = text.replace(/^#/gm, '1.');
  
  // Clean up table markup — convert to simple text
  text = text.replace(/\{\|[^\n]*\n/g, '');  // table open
  text = text.replace(/\|\}/g, '');           // table close
  text = text.replace(/^\|-.*$/gm, '');       // row separators
  text = text.replace(/^!\s*/gm, '');         // header cells
  text = text.replace(/^\|\s*/gm, '');        // data cells
  
  // Remove HTML tags
  text = text.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  text = text.replace(/<ref[^/]*\/>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/?[^>]+>/g, '');
  
  // Clean up excessive whitespace
  text = text.replace(/\n{4,}/g, '\n\n\n');
  text = text.replace(/[ \t]+$/gm, '');
  text = text.trim();
  
  return text;
}

/**
 * Format skills summary for the AI context
 */
export function formatStatsSummary(player: WOMPlayerDetails): string {
  if (!player.latestSnapshot?.data?.skills) {
    return 'No stats available';
  }

  const skills = player.latestSnapshot.data.skills;
  const importantSkills = [
    'attack', 'strength', 'defence', 'hitpoints', 'ranged', 'prayer', 'magic',
    'slayer', 'farming', 'herblore', 'construction', 'hunter', 'sailing'
  ];

  // FIX: Directly grab the 'overall' level from the API logic.
  // No math needed, preventing double-counting bugs.
  const totalLevel = skills.overall?.level || 0;

  const lines: string[] = [
    `Total Level: ${totalLevel}`,
    `Combat Level: ${player.combatLevel}`,
    `Account Type: ${player.type}`,
    '',
    'Key Stats:',
  ];

  for (const skillName of importantSkills) {
    const skill = skills[skillName as keyof typeof skills];
    if (skill) {
      lines.push(`- ${skillName.charAt(0).toUpperCase() + skillName.slice(1)}: ${skill.level}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format gains summary
 */
export function formatGainsSummary(gains: WOMGains): string {
  if (!gains?.data?.skills) {
    return 'No recent gains available';
  }

  const skillGains = Object.entries(gains.data.skills)
    .filter(([, data]) => data.experience.gained > 0)
    .sort((a, b) => b[1].experience.gained - a[1].experience.gained)
    .slice(0, 5);

  if (skillGains.length === 0) {
    return 'No recent XP gains';
  }

  const lines: string[] = ['Recent XP Gains (past week):'];
  for (const [skill, data] of skillGains) {
    lines.push(`- ${skill.charAt(0).toUpperCase() + skill.slice(1)}: +${data.experience.gained.toLocaleString()} XP`);
  }

  return lines.join('\n');
}

// ============================================
// Real-Time Price Functions
// ============================================

/**
 * Fetch the item ID mapping from the Wiki Prices API
 * This maps item names to their in-game item IDs
 */
async function getItemMapping(): Promise<Record<string, number>> {
  // Return cached data if still valid
  if (itemMappingCache && Date.now() - mappingCacheTime < MAPPING_CACHE_TTL) {
    return itemMappingCache;
  }

  try {
    const response = await fetch(`${PRICES_BASE_URL}/mapping`, {
      headers: {
        'User-Agent': 'OSRS-Agent-Dashboard/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Mapping API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Build a name -> id lookup (lowercase for case-insensitive matching)
    const mapping: Record<string, number> = {};
    for (const item of data) {
      if (item.name && item.id) {
        mapping[item.name.toLowerCase()] = item.id;
      }
    }

    itemMappingCache = mapping;
    mappingCacheTime = Date.now();
    return mapping;
  } catch (error) {
    console.error('Error fetching item mapping:', error);
    return itemMappingCache || {};
  }
}

/**
 * Get item ID from item name using the Prices API mapping only (no Wiki fallback).
 * Uses progressively fuzzier matching strategies.
 */
async function getItemId(itemName: string): Promise<WikiItemIdResponse> {
  const mapping = await getItemMapping();
  const normalizedName = itemName.toLowerCase().trim();
  
  // 1. Direct exact lookup
  if (mapping[normalizedName]) {
    return {
      itemId: mapping[normalizedName],
      itemName: itemName,
    };
  }

  const allNames = Object.keys(mapping);

  // 2. Exact match (redundant safety check)
  let match = allNames.find(name => name === normalizedName);
  if (match) {
    return { itemId: mapping[match], itemName: match };
  }

  // 3. Query is a full substring of a mapping name (e.g. "whip" -> "abyssal whip")
  match = allNames.find(name => name.includes(normalizedName));
  if (match) {
    return { itemId: mapping[match], itemName: match };
  }

  // 4. Mapping name is a full substring of the query (e.g. "abyssal whip osrs" -> "abyssal whip")
  match = allNames.find(name => normalizedName.includes(name));
  if (match) {
    return { itemId: mapping[match], itemName: match };
  }

  // 5. Word-token matching: all words in the query appear in the mapping name
  const queryWords = normalizedName.split(/\s+/).filter(w => w.length > 1);
  if (queryWords.length > 0) {
    match = allNames.find(name => queryWords.every(word => name.includes(word)));
    if (match) {
      return { itemId: mapping[match], itemName: match };
    }
  }

  // 6. Partial word overlap scoring (best match with most overlapping words)
  let bestMatch: string | null = null;
  let bestScore = 0;
  for (const name of allNames) {
    const nameWords = name.split(/\s+/);
    const overlap = queryWords.filter(w => nameWords.some(nw => nw.includes(w) || w.includes(nw))).length;
    const score = overlap / Math.max(queryWords.length, nameWords.length);
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = name;
    }
  }
  if (bestMatch) {
    return { itemId: mapping[bestMatch], itemName: bestMatch };
  }

  return {
    itemId: null,
    itemName: itemName,
  };
}

/**
 * Get real-time price data for an item
 * Uses the OSRS Wiki Real-Time Prices API
 */
export async function getItemPrice(itemName: string): Promise<ItemPriceData | null> {
  try {
    // Get item ID from name
    const { itemId, itemName: resolvedName } = await getItemId(itemName);
    
    if (!itemId) {
      console.error(`Could not find item ID for: ${itemName}`);
      return null;
    }

    // Fetch latest prices (cached)
    const prices = await getLatestPrices();
    const priceData = prices[itemId];

    if (!priceData) {
      console.error(`No price data for item ID: ${itemId}`);
      return null;
    }

    // Also get volume data from 1h endpoint (cached)
    let volume: number | null = null;
    const volumes = await getVolumeData();
    const itemVolumeData = volumes[itemId];
    if (itemVolumeData) {
      volume = (itemVolumeData.highPriceVolume || 0) + (itemVolumeData.lowPriceVolume || 0);
    }

    // Calculate average price
    const avgPrice = priceData.high && priceData.low 
      ? Math.round((priceData.high + priceData.low) / 2)
      : priceData.high || priceData.low || null;

    return {
      itemId,
      itemName: resolvedName,
      highPrice: priceData.high || null,
      lowPrice: priceData.low || null,
      highTime: priceData.highTime || null,
      lowTime: priceData.lowTime || null,
      avgPrice,
      volume,
      wikiUrl: `https://oldschool.runescape.wiki/w/${encodeURIComponent(resolvedName)}`,
    };
  } catch (error) {
    console.error('Error fetching item price:', error);
    return null;
  }
}

/**
 * Get prices for multiple items at once
 */
export async function getMultipleItemPrices(itemNames: string[]): Promise<Record<string, ItemPriceData | null>> {
  // Pre-fetch shared data once
  await getLatestPrices();
  await getVolumeData();
  
  // Now resolve all items in parallel (only mapping lookups)
  const entries = await Promise.all(
    itemNames.map(async (name) => [name, await getItemPrice(name)] as const)
  );
  
  return Object.fromEntries(entries);
}

/**
 * Format price for display (e.g., 1.5M, 500K, 1,234)
 */
export function formatPrice(price: number | null): string {
  if (price === null) return 'N/A';
  
  if (price >= 1_000_000_000) {
    return `${(price / 1_000_000_000).toFixed(2)}B`;
  } else if (price >= 1_000_000) {
    return `${(price / 1_000_000).toFixed(2)}M`;
  } else if (price >= 1_000) {
    return `${(price / 1_000).toFixed(1)}K`;
  }
  
  return price.toLocaleString();
}

/**
 * Format a complete price summary for the AI
 */
export function formatPriceSummary(data: ItemPriceData): string {
  const lines: string[] = [
    `## ${data.itemName} - Current Prices`,
    '',
    `- **Instant Buy (High):** ${formatPrice(data.highPrice)} gp`,
    `- **Instant Sell (Low):** ${formatPrice(data.lowPrice)} gp`,
    `- **Average Price:** ${formatPrice(data.avgPrice)} gp`,
  ];

  if (data.volume !== null) {
    lines.push(`- **Hourly Volume:** ${data.volume.toLocaleString()} traded`);
  }

  lines.push('');
  lines.push(`_[View on Wiki](${data.wikiUrl})_`);

  return lines.join('\n');
}
