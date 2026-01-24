import type {
  WOMPlayerDetails,
  WOMGains,
  WikiSearchResult,
  WikiPageContent,
} from './types';

const WOM_BASE_URL = 'https://api.wiseoldman.net/v2';
const WIKI_BASE_URL = 'https://oldschool.runescape.wiki/api.php';

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
 * Get page content from OSRS Wiki
 */
export async function getWikiPage(title: string): Promise<WikiPageContent | null> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      titles: title,
      prop: 'extracts|info',
      exintro: 'true',
      explaintext: 'true',
      inprop: 'url',
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