import type { CollectionLogData, CollectionLogItem } from './types';

// List of valuable/rare items to highlight
const VALUABLE_ITEMS = new Set([
  // Pets
  'Abyssal orphan', 'Baby chinchompa', 'Baby mole', 'Beaver', 'Bloodhound',
  'Callisto cub', 'Chaos elemental jr', 'Chompy chick', 'Giant squirrel',
  'Hellpuppy', 'Herbi', 'Heron', 'Ikkle hydra', 'Jal-nib-rek', 'Kalphite princess',
  'Lil\' zik', 'Little nightmare', 'Noon', 'Olmlet', 'Pet chaos elemental',
  'Pet dagannoth prime', 'Pet dagannoth rex', 'Pet dagannoth supreme',
  'Pet dark core', 'Pet general graardor', 'Pet k\'ril tsutsaroth',
  'Pet kraken', 'Pet kree\'arra', 'Pet penance queen', 'Pet smoke devil',
  'Pet snakeling', 'Pet zilyana', 'Phoenix', 'Prince black dragon', 'Rift guardian',
  'Rock golem', 'Rocky', 'Scorpia\'s offspring', 'Skotos', 'Smolcano',
  'Sraracha', 'Tangleroot', 'Tiny tempor', 'Venenatis spiderling',
  'Vet\'ion jr.', 'Vorki', 'Youngllef',
  
  // Rare drops
  'Twisted bow', 'Scythe of vitur', 'Ghrazi rapier', 'Sanguinesti staff',
  'Justiciar faceguard', 'Justiciar chestguard', 'Justiciar legguards',
  'Avernic defender hilt', 'Inquisitor\'s great helm', 'Inquisitor\'s hauberk',
  'Inquisitor\'s plateskirt', 'Inquisitor\'s mace', 'Nightmare staff',
  'Harmonised orb', 'Eldritch orb', 'Volatile orb', 'Elder maul',
  'Kodai insignia', 'Dexterous prayer scroll', 'Arcane prayer scroll',
  'Dragon claws', 'Ancestral hat', 'Ancestral robe top', 'Ancestral robe bottom',
  'Dragon warhammer', 'Blade of saeldor', 'Bow of faerdhinen',
  'Crystal armour seed', 'Enhanced crystal weapon seed', 'Elidinis\' ward',
  'Masori mask', 'Masori body', 'Masori chaps', 'Lightbearer',
  'Fang', 'Tumeken\'s shadow', 'Osmumten\'s fang',
  
  // GWD
  'Armadyl helmet', 'Armadyl chestplate', 'Armadyl chainskirt',
  'Bandos chestplate', 'Bandos tassets', 'Bandos boots',
  'Saradomin sword', 'Armadyl crossbow', 'Saradomin\'s light',
  'Staff of the dead', 'Zamorakian spear', 'Steam battlestaff',
  'Godsword shard 1', 'Godsword shard 2', 'Godsword shard 3',
  'Armadyl hilt', 'Bandos hilt', 'Saradomin hilt', 'Zamorak hilt',
  
  // Wildy bosses
  'Voidwaker blade', 'Voidwaker hilt', 'Voidwaker gem',
  'Ursine chainmace', 'Webweaver bow', 'Accursed sceptre',
  
  // Slayer
  'Abyssal whip', 'Abyssal dagger', 'Kraken tentacle',
  'Trident of the seas', 'Occult necklace', 'Smoke battlestaff',
  'Dragon boots', 'Primordial crystal', 'Pegasian crystal', 'Eternal crystal',
  'Hydra\'s claw', 'Hydra leather', 'Hydra\'s fang', 'Hydra\'s eye', 'Hydra\'s heart',
  
  // Corp
  'Spectral sigil', 'Arcane sigil', 'Elysian sigil', 'Spirit shield',
  
  // Misc valuable
  'Ring of endurance', 'Dragon pickaxe', 'Draconic visage',
  'Skeletal visage', 'Wyvern visage', 'Dragon 2h sword', 'Dragon chainbody',
  'Dragon full helm', 'Dragon platebody', 'Dragon platelegs', 'Dragon plateskirt',
  '3rd age full helmet', '3rd age platebody', '3rd age platelegs', '3rd age plateskirt',
  '3rd age kiteshield', '3rd age range coif', '3rd age range top', '3rd age range legs',
  '3rd age vambraces', '3rd age mage hat', '3rd age robe top', '3rd age robe',
  '3rd age amulet', '3rd age cloak', '3rd age longsword', '3rd age wand',
  '3rd age bow', '3rd age druidic robe top', '3rd age druidic robe bottoms',
  '3rd age druidic cloak', '3rd age druidic staff', '3rd age pickaxe', '3rd age axe',
]);

/**
 * Parse Collection Log JSON data
 */
export function parseCollectionLog(jsonData: unknown): CollectionLogData | null {
  try {
    const data = jsonData as Record<string, unknown>;
    
    // Handle both direct format and nested format
    const collectionLog = (data.collectionLog || data) as Record<string, unknown>;
    
    if (!collectionLog.tabs) {
      console.error('Invalid collection log format: missing tabs');
      return null;
    }

    return {
      tabs: collectionLog.tabs as CollectionLogData['tabs'],
      username: (collectionLog.username as string) || 'Unknown',
      accountType: (collectionLog.accountType as string) || 'normal',
      totalObtained: (collectionLog.totalObtained as number) || 0,
      totalItems: (collectionLog.totalItems as number) || 0,
      uniqueObtained: (collectionLog.uniqueObtained as number) || 0,
      uniqueItems: (collectionLog.uniqueItems as number) || 0,
    };
  } catch (error) {
    console.error('Error parsing collection log:', error);
    return null;
  }
}

/**
 * Extract all obtained items from collection log
 */
export function extractObtainedItems(collectionLog: CollectionLogData): CollectionLogItem[] {
  const obtainedItems: CollectionLogItem[] = [];

  for (const tab of Object.values(collectionLog.tabs)) {
    for (const entry of Object.values(tab.entries)) {
      for (const item of entry.items) {
        if (item.obtained && item.quantity > 0) {
          obtainedItems.push(item);
        }
      }
    }
  }

  return obtainedItems;
}

/**
 * Extract rare/valuable items from collection log
 */
export function extractRareItems(collectionLog: CollectionLogData): CollectionLogItem[] {
  const rareItems: CollectionLogItem[] = [];

  for (const tab of Object.values(collectionLog.tabs)) {
    for (const entry of Object.values(tab.entries)) {
      for (const item of entry.items) {
        if (item.obtained && item.quantity > 0) {
          // Check if it's in our valuable items list
          if (VALUABLE_ITEMS.has(item.name)) {
            rareItems.push(item);
          }
          // Also include items that contain "pet" in their name
          if (item.name.toLowerCase().includes('pet')) {
            if (!rareItems.find(r => r.id === item.id)) {
              rareItems.push(item);
            }
          }
        }
      }
    }
  }

  // Sort by name for easier reading
  return rareItems.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get completion statistics for collection log
 */
export function getCompletionStats(collectionLog: CollectionLogData): {
  total: { obtained: number; total: number; percentage: number };
  byTab: Record<string, { obtained: number; total: number; percentage: number }>;
} {
  const byTab: Record<string, { obtained: number; total: number; percentage: number }> = {};
  let totalObtained = 0;
  let totalItems = 0;

  for (const [tabName, tab] of Object.entries(collectionLog.tabs)) {
    let tabObtained = 0;
    let tabTotal = 0;

    for (const entry of Object.values(tab.entries)) {
      for (const item of entry.items) {
        tabTotal++;
        if (item.obtained) {
          tabObtained++;
        }
      }
    }

    totalObtained += tabObtained;
    totalItems += tabTotal;

    byTab[tabName] = {
      obtained: tabObtained,
      total: tabTotal,
      percentage: tabTotal > 0 ? Math.round((tabObtained / tabTotal) * 100) : 0,
    };
  }

  return {
    total: {
      obtained: totalObtained,
      total: totalItems,
      percentage: totalItems > 0 ? Math.round((totalObtained / totalItems) * 100) : 0,
    },
    byTab,
  };
}

/**
 * Format rare items for AI context
 */
export function formatRareItemsList(items: CollectionLogItem[]): string {
  if (items.length === 0) {
    return 'No notable rare items obtained yet.';
  }

  const lines = ['Notable Items Owned:'];
  
  // Group by item type (pets, weapons, armor, etc.)
  const pets = items.filter(i => 
    i.name.toLowerCase().includes('pet') || 
    i.name.includes('jr') ||
    VALUABLE_ITEMS.has(i.name) && i.name.includes('cub')
  );
  
  const weapons = items.filter(i => 
    i.name.includes('bow') || 
    i.name.includes('sword') || 
    i.name.includes('staff') ||
    i.name.includes('scythe') ||
    i.name.includes('rapier') ||
    i.name.includes('mace') ||
    i.name.includes('whip') ||
    i.name.includes('dagger') ||
    i.name.includes('claw') ||
    i.name.includes('fang')
  );
  
  const armor = items.filter(i => 
    !pets.includes(i) && 
    !weapons.includes(i)
  );

  if (pets.length > 0) {
    lines.push('\nPets:');
    pets.forEach(p => lines.push(`  - ${p.name}`));
  }

  if (weapons.length > 0) {
    lines.push('\nWeapons:');
    weapons.forEach(w => lines.push(`  - ${w.name}${w.quantity > 1 ? ` (x${w.quantity})` : ''}`));
  }

  if (armor.length > 0) {
    lines.push('\nArmor/Other:');
    armor.forEach(a => lines.push(`  - ${a.name}${a.quantity > 1 ? ` (x${a.quantity})` : ''}`));
  }

  return lines.join('\n');
}

/**
 * Search for specific items in collection log
 */
export function searchCollectionLog(
  collectionLog: CollectionLogData,
  searchTerm: string
): CollectionLogItem[] {
  const results: CollectionLogItem[] = [];
  const term = searchTerm.toLowerCase();

  for (const tab of Object.values(collectionLog.tabs)) {
    for (const entry of Object.values(tab.entries)) {
      for (const item of entry.items) {
        if (item.name.toLowerCase().includes(term)) {
          results.push(item);
        }
      }
    }
  }

  return results;
}

/**
 * Check if user has specific item
 */
export function hasItem(collectionLog: CollectionLogData, itemName: string): boolean {
  const items = searchCollectionLog(collectionLog, itemName);
  return items.some(item => item.obtained && item.quantity > 0);
}

/**
 * Get all items from a specific boss/activity
 */
export function getEntryItems(
  collectionLog: CollectionLogData,
  entryName: string
): CollectionLogItem[] {
  for (const tab of Object.values(collectionLog.tabs)) {
    for (const [name, entry] of Object.entries(tab.entries)) {
      if (name.toLowerCase().includes(entryName.toLowerCase())) {
        return entry.items;
      }
    }
  }
  return [];
}
