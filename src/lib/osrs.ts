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

    const response = await fetch(`${WIKI_BASE_URL}?${params}`, {
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

    const response = await fetch(`${WIKI_BASE_URL}?${params}`, {
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
 * Get full page content with sections
 */
export async function getWikiPageFull(title: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      titles: title,
      prop: 'extracts',
      explaintext: 'true',
      format: 'json',
      origin: '*',
    });

    const response = await fetch(`${WIKI_BASE_URL}?${params}`, {
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
    
    return pages[pageId].extract || null;
  } catch (error) {
    console.error('Error fetching wiki page:', error);
    return null;
  }
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
    'slayer', 'farming', 'herblore', 'construction', 'hunter'
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
    // @ts-ignore - access dynamic property
    const skill = skills[skillName];
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
 * Get item ID from item name (searches mapping first, then Wiki if needed)
 */
async function getItemId(itemName: string): Promise<WikiItemIdResponse> {
  const mapping = await getItemMapping();
  const normalizedName = itemName.toLowerCase().trim();
  
  // Direct lookup
  if (mapping[normalizedName]) {
    return {
      itemId: mapping[normalizedName],
      itemName: itemName,
    };
  }

  // Try to find a partial match
  const matchedName = Object.keys(mapping).find(name => 
    name.includes(normalizedName) || normalizedName.includes(name)
  );
  
  if (matchedName) {
    return {
      itemId: mapping[matchedName],
      itemName: matchedName,
    };
  }

  // Search Wiki for the item to get the correct name
  const searchResults = await searchWiki(itemName);
  if (searchResults.length > 0) {
    const wikiTitle = searchResults[0].title.toLowerCase();
    if (mapping[wikiTitle]) {
      return {
        itemId: mapping[wikiTitle],
        itemName: searchResults[0].title,
      };
    }
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

    // Fetch latest prices
    const response = await fetch(`${PRICES_BASE_URL}/latest`, {
      headers: {
        'User-Agent': 'OSRS-Agent-Dashboard/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Prices API error: ${response.status}`);
    }

    const data = await response.json();
    const priceData = data.data?.[itemId];

    if (!priceData) {
      console.error(`No price data for item ID: ${itemId}`);
      return null;
    }

    // Also get volume data from 1h endpoint
    let volume: number | null = null;
    try {
      const volumeResponse = await fetch(`${PRICES_BASE_URL}/1h`, {
        headers: {
          'User-Agent': 'OSRS-Agent-Dashboard/1.0',
        },
      });
      if (volumeResponse.ok) {
        const volumeData = await volumeResponse.json();
        const itemVolumeData = volumeData.data?.[itemId];
        if (itemVolumeData) {
          volume = (itemVolumeData.highPriceVolume || 0) + (itemVolumeData.lowPriceVolume || 0);
        }
      }
    } catch {}

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
  const results: Record<string, ItemPriceData | null> = {};
  
  for (const name of itemNames) {
    results[name] = await getItemPrice(name);
  }
  
  return results;
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
