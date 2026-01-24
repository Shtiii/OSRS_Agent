// Wise Old Man API Types
export interface WOMPlayer {
  id: number;
  username: string;
  displayName: string;
  type: 'regular' | 'ironman' | 'hardcore' | 'ultimate';
  build: 'main' | 'f2p' | 'lvl3' | 'zerker' | 'def1' | 'hp10';
  country: string | null;
  status: 'active' | 'archived' | 'flagged' | 'banned';
  exp: number;
  ehp: number;
  ehb: number;
  ttm: number;
  tt200m: number;
  registeredAt: string;
  updatedAt: string;
  lastChangedAt: string | null;
  lastImportedAt: string | null;
}

export interface WOMSkill {
  metric: string;
  experience: number;
  rank: number;
  level: number;
  ehp: number;
}

export interface WOMBoss {
  metric: string;
  kills: number;
  rank: number;
  ehb: number;
}

export interface WOMActivity {
  metric: string;
  score: number;
  rank: number;
}

export interface WOMSnapshot {
  id: number;
  playerId: number;
  createdAt: string;
  importedAt: string | null;
  data: {
    skills: Record<string, WOMSkill>;
    bosses: Record<string, WOMBoss>;
    activities: Record<string, WOMActivity>;
    computed: Record<string, { metric: string; value: number; rank: number }>;
  };
}

export interface WOMPlayerDetails extends WOMPlayer {
  combatLevel: number;
  latestSnapshot: WOMSnapshot | null;
}

export interface WOMGains {
  startsAt: string;
  endsAt: string;
  data: {
    skills: Record<string, { metric: string; experience: { gained: number; start: number; end: number }; rank: { gained: number; start: number; end: number }; level: { gained: number; start: number; end: number } }>;
    bosses: Record<string, { metric: string; kills: { gained: number; start: number; end: number }; rank: { gained: number; start: number; end: number } }>;
    activities: Record<string, { metric: string; score: { gained: number; start: number; end: number }; rank: { gained: number; start: number; end: number } }>;
  };
}

// Collection Log Types
export interface CollectionLogItem {
  id: number;
  name: string;
  quantity: number;
  obtained: boolean;
  sequence: number;
}

export interface CollectionLogEntry {
  name: string;
  items: CollectionLogItem[];
  killCounts?: { name: string; count: number }[];
}

export interface CollectionLogTab {
  name: string;
  entries: Record<string, CollectionLogEntry>;
}

export interface CollectionLogData {
  tabs: Record<string, CollectionLogTab>;
  username: string;
  accountType: string;
  totalObtained: number;
  totalItems: number;
  uniqueObtained: number;
  uniqueItems: number;
}

// User Context
export interface UserContext {
  username: string | null;
  stats: WOMPlayerDetails | null;
  gains: WOMGains | null;
  collectionLog: CollectionLogData | null;
  rareItems: CollectionLogItem[];
  accountType: 'regular' | 'ironman' | 'hardcore' | 'ultimate' | null;
}

// Tavily API Types
export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
}

// OSRS Wiki Types
export interface WikiSearchResult {
  title: string;
  pageid: number;
  snippet: string;
}

export interface WikiPageContent {
  title: string;
  pageid: number;
  extract: string;
  fullurl: string;
  imageUrl?: string | null;
}
