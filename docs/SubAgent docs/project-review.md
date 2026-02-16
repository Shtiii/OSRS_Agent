# OSRS Agent — Comprehensive Project Review

**Date:** 2026-02-16  
**Reviewer:** AI Automated Review  
**Project:** OSRS Helper — AI-Powered RuneScape Assistant  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Review](#2-architecture-review)
3. [Code Quality Issues](#3-code-quality-issues)
4. [Security Concerns](#4-security-concerns)
5. [Performance Issues](#5-performance-issues)
6. [Error Handling](#6-error-handling)
7. [Best Practices Violations](#7-best-practices-violations)
8. [Dependency Review](#8-dependency-review)
9. [Database / Supabase Review](#9-database--supabase-review)
10. [Suggestions for Improvement](#10-suggestions-for-improvement)

---

## 1. Project Overview

### What the Project Does

OSRS Agent is a **Next.js web application** that serves as an AI-powered Old School RuneScape (OSRS) assistant. It provides:

- **Player stat lookup** via the Wise Old Man (WOM) API
- **AI chat** powered by OpenRouter (e.g., DeepSeek) with tool-calling (Wiki search, GE prices, web search)
- **Collection Log parsing** from uploaded JSON files
- **RAG (Retrieval-Augmented Generation)** via Supabase pgvector for caching and re-using Wiki content
- **Persistent chat history and user profiles** via Supabase
- **Guest/anonymous mode** with localStorage-based anonymous IDs

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1.4 (App Router) |
| Language | TypeScript 5 (strict mode) |
| UI | React 19.2.3, Tailwind CSS 4, Lucide React icons |
| Font | Press Start 2P (pixel font), Geist / Geist Mono |
| AI / LLM | OpenRouter API (DeepSeek default model) |
| Embeddings | OpenAI `text-embedding-3-small` |
| Database | Supabase (PostgreSQL + pgvector) |
| Search | Tavily API for web search |
| External APIs | Wise Old Man API, OSRS Wiki MediaWiki API, OSRS Real-Time Prices API |
| Build | Turbopack, React Compiler (babel-plugin-react-compiler) |
| Styling | Custom OSRS-themed dark UI with CSS custom properties |

---

## 2. Architecture Review

### 2.1 File Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout (fonts, metadata, dark theme)
│   ├── page.tsx            # Entry point → renders <Dashboard />
│   ├── globals.css         # OSRS-themed CSS variables + Tailwind
│   └── api/
│       ├── chat/route.ts   # POST handler - LLM chat with tool-calling (706 lines)
│       └── player/route.ts # GET/POST handler - WOM player lookup/update
├── components/
│   ├── Chat.tsx            # Chat UI with streaming, markdown rendering (527 lines)
│   ├── Dashboard.tsx       # Main layout: Sidebar + Chat, state orchestration
│   └── Sidebar.tsx         # Player input, stats, collection log, chat history (424 lines)
├── hooks/
│   └── useSupabase.ts      # Hooks: useChats, useMessages, useProfile, useGuestMode (528 lines)
└── lib/
    ├── database.types.ts   # Supabase-generated TS types
    ├── osrs.ts             # WOM API, Wiki API, Real-Time Prices API (539 lines)
    ├── parser.ts           # Collection Log JSON parser + rare item extraction
    ├── rag.ts              # OpenAI embeddings + Supabase vector search
    ├── supabase.ts         # Supabase client singleton, anonymous ID, helpers
    ├── tavily.ts           # Tavily web search API
    ├── types.ts            # Shared TypeScript types (WOM, Wiki, Collection Log, etc.)
    └── utils.ts            # cn() utility (clsx + tailwind-merge)
```

### 2.2 Data Flow

```
User Input (Sidebar: username / Chat: message)
    │
    ├─> /api/player (GET/POST) → WOM API → Player stats/gains
    │       └─> Dashboard state (stats, gains)
    │
    ├─> /api/chat (POST) → OpenRouter LLM
    │       ├─> RAG context retrieval (Supabase pgvector)
    │       ├─> Tool calls: searchWiki, getWikiPage, getItemPrice, searchWeb
    │       │       └─> Auto-cached to Supabase documents table
    │       └─> Streaming response → Chat component
    │
    ├─> Supabase (chats, messages tables) → Chat persistence
    │
    └─> Supabase (profiles table) → User memory/profile persistence
```

### 2.3 Component Hierarchy

```
RootLayout (layout.tsx)
  └── Home (page.tsx)
        └── Dashboard (client component — state orchestrator)
              ├── Sidebar (username input, stats display, collection log, chat history)
              └── Chat (message display, input, streaming, markdown rendering)
                    └── MessageContent → formatInlineText → formatTextOnly
```

### 2.4 Architectural Observations

- **All client-side rendering**: `Dashboard` is a client component, so the entire app is CSR (no SSR/SSG benefits).
- **Single-page app pattern**: `page.tsx` just renders `<Dashboard />` — no route-based code splitting.
- **State lifted to Dashboard**: All state lives in `Dashboard.tsx`, passed down via props. No global state management.
- **Streaming via ReadableStream**: Chat API manually constructs SSE-like streaming (not using Vercel AI SDK's streaming helpers despite having `ai` as a dependency).
- **Tool execution happens server-side** in the API route, and results are streamed inline with tool status messages embedded in the response text.

---

## 3. Code Quality Issues

### 3.1 Excessive Use of `(supabase as any)`

**Files:** `src/hooks/useSupabase.ts` (lines 65, 109, 131, 155, 165, 222, 260-290, 364, 413, 440, 456), `src/app/api/chat/route.ts` (line 41), `src/lib/rag.ts` (lines 128, 180, 224)

Throughout the codebase, the Supabase client is cast to `any` to circumvent type checking:

```typescript
const { data, error } = await (supabase as any)
  .from('chats')
  .select('id, title, created_at')
  .eq('is_archived', false)
```

This defeats the purpose of having `database.types.ts`. The correct approach is to type the Supabase client generically with `SupabaseClient<Database>` and use the generated types directly. The root cause is likely that the `documents` table isn't in `database.types.ts`, and the casting was applied everywhere as a workaround.

### 3.2 `@ts-ignore` Comments

**File:** `src/lib/osrs.ts`, line 286

```typescript
// @ts-ignore - access dynamic property
const skill = skills[skillName];
```

This should use a proper type assertion or a type-safe indexing approach instead of suppressing the error.

### 3.3 Duplicate Type Definitions

**Files:** `src/lib/supabase.ts` (lines 101-108) and `src/lib/database.types.ts` (lines 135-147)

Both files export the same type aliases (`ProfileRow`, `ChatRow`, `MessageRow`, `ProfileInsert`, etc.), creating ambiguity about which to import.

### 3.4 Unused Exports / Dead Code

| File | Item | Issue |
|---|---|---|
| `src/lib/supabase.ts` | `createAdminClient()` | Never called anywhere in the codebase |
| `src/lib/supabase.ts` | `clearAnonymousId()` | Never called |
| `src/lib/supabase.ts` | `safeQuery()` | Never called |
| `src/lib/parser.ts` | `getCompletionStats()`, `searchCollectionLog()`, `hasItem()`, `getEntryItems()`, `formatRareItemsList()`, `extractObtainedItems()` | Exported but never imported |
| `src/lib/osrs.ts` | `formatStatsSummary()`, `formatGainsSummary()`, `getMultipleItemPrices()`, `formatPrice()`, `trackPlayer()` (direct call only) | Exported but never imported elsewhere |
| `src/lib/tavily.ts` | `searchOSRSGuide()`, `searchGearSetup()`, `searchReddit()` | Exported but never imported |
| `src/lib/rag.ts` | `addDocuments()`, `getDocumentStats()` | Exported but never imported |
| `src/hooks/useSupabase.ts` | `useGuestMode()` | Exported but never used |
| `package.json` | `@ai-sdk/openai`, `@ai-sdk/react`, `ai`, `@supabase/ssr`, `zod` | Installed but not imported anywhere in the source code |

### 3.5 Inconsistent ID Generation

- **`src/components/Chat.tsx`, lines 99-100 and 152-153**: Uses `Date.now().toString()` for temporary message IDs. This can collide if two messages are created in the same millisecond. The assistant message ID is `(Date.now() + 1).toString()` — a fragile workaround.

### 3.6 Magic Strings / Numbers

- `src/app/api/chat/route.ts`: The model name `'deepseek/deepseek-chat'` appears as a hardcoded fallback in two places (lines 506 and 597).
- `src/lib/rag.ts`: `8000` character limit for embedding input (line 76).
- `src/lib/osrs.ts`: `MAPPING_CACHE_TTL = 3600000` — no comment explaining units (it's 1 hour in ms).

### 3.7 Inconsistent Null Handling

- `src/lib/supabase.ts`, line 11: `process.env.NEXT_PUBLIC_SUPABASE_URL || ''` — uses empty string fallback, but then `isSupabaseConfigured()` checks for `!== ''`. This works but is fragile.
- `src/app/api/chat/route.ts`, line 492: `latestUserMessage` defaults to `''` if no user message found, then is used as a truthy check at line 496.

### 3.8 Large/Complex Functions

- **`POST` handler in `src/app/api/chat/route.ts`** (lines 482-706): This single function is 224 lines long, handling request parsing, RAG retrieval, system prompt building, OpenRouter API call, streaming, nested tool call execution with follow-up streaming, and error handling. It should be decomposed.

---

## 4. Security Concerns

### 4.1 CRITICAL: RLS Completely Disabled

**File:** `supabase-fix-rls.sql` (active policy), `supabase-fresh-setup.sql` (line 82)

The currently deployed RLS policies are:

```sql
CREATE POLICY "Allow profile access" ON profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow chat access" ON chats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow message access" ON messages FOR ALL USING (true) WITH CHECK (true);
```

**Impact:** ANY user with the Supabase anon key (which is exposed client-side via `NEXT_PUBLIC_SUPABASE_ANON_KEY`) can read, modify, and delete ALL profiles, chats, and messages of ALL users. This is a **data breach vulnerability**.

The fresh setup script even explicitly disables RLS:
```sql
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE chats DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
```

### 4.2 API Keys Exposed in Client Bundle

**File:** `src/lib/supabase.ts`, lines 11-12

```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
```

The `NEXT_PUBLIC_` prefix means these are bundled into client-side JavaScript. The anon key is designed to be public, but combined with disabled RLS (§4.1), this exposes the entire database.

### 4.3 No Server-Side API Key for Supabase in API Routes

**File:** `src/app/api/chat/route.ts`, line 4

The chat API route imports `getSupabaseClient()` which returns the anon-key client. For server-side operations (like caching Wiki pages), it should use the service role key via `createAdminClient()`.

### 4.4 No Input Validation on Chat API

**File:** `src/app/api/chat/route.ts`, line 483

```typescript
const { messages, userContext, profile } = await req.json();
```

No validation of:
- `messages` array shape/length (could send massive arrays to inflate OpenRouter costs)
- `userContext` or `profile` objects (could inject arbitrary data into the system prompt)
- No rate limiting

### 4.5 No Input Validation on Player API

**File:** `src/app/api/player/route.ts`, lines 6-7, 41

The username parameter is taken directly from the query string or request body without sanitization. While it's used in URL encoding for WOM API calls, there's no length limit or character validation.

### 4.6 OpenRouter API Key in Server Environment

**File:** `src/app/api/chat/route.ts`, line 501

```typescript
'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
```

The API key is correctly server-side only (no `NEXT_PUBLIC_` prefix), but there's no check for its existence before making the call. If missing, it sends `Bearer undefined`.

### 4.7 Tavily API Key Sent in Request Body

**File:** `src/lib/tavily.ts`, line 30

```typescript
body: JSON.stringify({
  api_key: apiKey,
  ...
})
```

The Tavily API key is sent in the request body. This is the correct approach per Tavily's API design, but the file is imported only in the server-side chat route, so it's safe. However, if ever imported client-side, the key would leak.

### 4.8 XSS via Markdown Image Rendering

**File:** `src/components/Chat.tsx`, lines 468-484

```tsx
<img
  src={imageUrl}
  alt={altText}
  className="max-w-[200px] max-h-[200px] object-contain rounded"
  loading="lazy"
/>
```

The `imageUrl` from AI responses is rendered directly in an `<img>` tag without URL validation. While `<img src>` XSS is limited in modern browsers, a malicious URL could:
- Leak user IP via tracking pixel
- Attempt to trigger browser-specific vulnerabilities

### 4.9 No CSRF Protection

The API routes accept POST requests without CSRF tokens. Since they use JSON content type, this provides some protection (CORS pre-flight), but it's not comprehensive.

---

## 5. Performance Issues

### 5.1 Unnecessary Re-renders

**File:** `src/components/Chat.tsx`, lines 157-166

The streaming update creates a new array on every chunk:

```typescript
setMessages((prev) => {
  const updated = [...prev];
  const lastIndex = updated.length - 1;
  const lastMsg = { ...updated[lastIndex] };
  if (lastMsg.role === 'assistant') {
    lastMsg.content += text;
    updated[lastIndex] = lastMsg;
  }
  return updated;
});
```

This runs potentially hundreds of times per response (once per SSE chunk), each time creating a new array and triggering a React re-render. With React Compiler enabled this may be partially mitigated, but the `MessageContent` component still re-parses the entire markdown on each update.

### 5.2 Full Item Mapping Fetched on Every Price Lookup

**File:** `src/lib/osrs.ts`, lines 342-374

`getItemMapping()` fetches the entire OSRS item mapping (~4,000+ items) from the Wiki Prices API on every first call and caches in memory. However:
- No server-side persistent cache — the mapping is re-fetched on every serverless function cold start
- `getItemPrice()` also fetches the entire `/latest` endpoint (all items) just to get one price (line 429)

### 5.3 Sequential Tool Execution

**File:** `src/app/api/chat/route.ts`, lines 562-600

When the LLM requests multiple tool calls, they're executed sequentially in a `for` loop:

```typescript
for (const toolCall of pendingToolCalls) {
  // ... execute tool
  // ... make follow-up API call
}
```

If the LLM requests `searchWiki` + `getItemPrice`, these could be parallelized.

### 5.4 No Image Optimization

**File:** `src/components/Chat.tsx`, lines 468-484

Wiki images are loaded via raw `<img>` tags. Next.js `<Image>` component provides optimization (lazy loading, WebP conversion, responsive sizes). The current implementation loads potentially large PNG/JPEG files from the Wiki.

### 5.5 No Bundle Splitting

The entire `Dashboard` → `Chat` → `Sidebar` tree is imported statically. Since `page.tsx` just renders `<Dashboard />`, there's no meaningful code splitting. The Sidebar (including the full Lucide icon set it imports) and all library code loads on initial page load.

### 5.6 Redundant API Calls

**File:** `src/app/api/chat/route.ts`, lines 271-278 (inside `tools.searchWiki`)

`searchWiki` tool both searches AND fetches the top result's full page:

```typescript
const results = await searchWiki(query);
const topResult = results[0];
const pageContent = await getWikiPage(topResult.title); // Second API call
```

If the LLM then calls `getWikiPage` for the same page, it fetches it again (though the cache may catch it).

### 5.7 Collection Log Not Persisted

When the user uploads a collection log JSON, it's parsed client-side and held in React state. If they refresh the page, they must re-upload. Only `notable_items` (up to 50 item names) are saved to the profile.

---

## 6. Error Handling

### 6.1 No React Error Boundary

**File:** `src/app/layout.tsx`

No `ErrorBoundary` component wraps the application. If any component throws during rendering, the entire app crashes with a white screen. Next.js provides `error.tsx` files for route-level error handling, but none exist in this project.

### 6.2 Silent Failures in Supabase Operations

**File:** `src/hooks/useSupabase.ts`

Most Supabase operations only `console.error` on failure and return `null`:

```typescript
if (error) {
  console.error('Error creating chat:', error);
  return null;
}
```

The user gets no notification that their chat/message failed to save. Messages could silently disappear on refresh.

### 6.3 Unhandled Promise Rejections

**File:** `src/app/api/chat/route.ts`, line 346

```typescript
// Cache for future use (async, don't wait)
cacheWikiPage(title, content, url, imageUrl);
```

This fire-and-forget promise has no `.catch()`. If it rejects, it becomes an unhandled promise rejection. The `cacheWikiPage` function does have a try/catch internally, but if `addDocument` throws synchronously, it won't be caught.

### 6.4 Generic Error Messages

**File:** `src/components/Chat.tsx`, line 348

```tsx
<p>Something went wrong. Please try again.</p>
```

The error state captures the actual error object but only shows a generic message. More specific messages (e.g., "API rate limited", "Network error") would improve UX.

### 6.5 No Timeout on External API Calls

**Files:** `src/lib/osrs.ts`, `src/lib/tavily.ts`, `src/lib/rag.ts`

None of the `fetch()` calls have `AbortController` timeouts. If the OSRS Wiki, WOM, or Prices API is slow, requests hang until the 60-second `maxDuration` kills them.

### 6.6 Stream Error Not Surfaced to Client

**File:** `src/app/api/chat/route.ts`, lines 694-698

```typescript
} catch (streamError) {
  console.error('Stream error:', streamError);
}
```

If streaming fails mid-response, the error is logged server-side but the stream just closes. The client receives a partial response with no indication that it's incomplete.

---

## 7. Best Practices Violations

### 7.1 Not Using Vercel AI SDK Features

**File:** `package.json` — `ai`, `@ai-sdk/openai`, `@ai-sdk/react` are installed

The project installs the Vercel AI SDK (`ai@6.0.49`, `@ai-sdk/openai`, `@ai-sdk/react`) but doesn't use any of them. Instead, it manually:
- Constructs streaming responses
- Parses SSE events
- Handles tool calls

The AI SDK provides `streamText()`, `useChat()`, and built-in tool-calling support that would eliminate ~300 lines of fragile streaming/parsing code.

### 7.2 No Loading/Error States in Next.js App Router

Missing files:
- `src/app/loading.tsx` — No loading state during navigation
- `src/app/error.tsx` — No error boundary
- `src/app/not-found.tsx` — No 404 page

### 7.3 Hardcoded Inline Styles

**Files:** `src/components/Chat.tsx`, `src/components/Sidebar.tsx`

Extensive use of inline `style={{ }}` props instead of Tailwind classes or CSS modules:

```tsx
style={{ fontFamily: 'var(--font-press-start)', fontSize: '12px', textShadow: '2px 2px 0 #000' }}
```

This pattern appears 15+ times across Chat.tsx and Sidebar.tsx.

### 7.4 No `Suspense` Boundaries

The app doesn't use React `Suspense` for any data-fetching boundaries. With React 19 and Next.js App Router, Suspense boundaries would improve loading UX.

### 7.5 Non-Memoized Callback Props

**File:** `src/components/Chat.tsx`, line 213

```typescript
const handleSuggestionClick = (prompt: string) => {
  setInput(prompt);
};
```

This creates a new function reference on every render. With React Compiler this may be auto-optimized, but explicit `useCallback` would be more reliable for components not covered by the compiler.

### 7.6 `useEffect` Dependencies Could be Stale

**File:** `src/components/Chat.tsx`, lines 63-70

```typescript
useEffect(() => {
  if (chatId && dbMessages.length > 0) {
    const loadedMessages = dbMessages.map(...);
    setMessages(loadedMessages);
    setIsFirstMessage(false);
  } else if (!chatId) {
    setMessages([]);
    setIsFirstMessage(true);
  }
}, [chatId, dbMessages]);
```

When `chatId` changes but `dbMessages` is still from the previous chat (briefly), this could flash stale messages.

### 7.7 Console Logging in Production

Throughout the codebase, `console.log()` and `console.error()` are used extensively for debugging:
- `src/app/api/chat/route.ts`: ~15 console.log/error calls
- `src/lib/rag.ts`: ~10 console.warn/error calls
- `src/hooks/useSupabase.ts`: ~12 console.error calls

These should use a structured logging library or be conditional on `NODE_ENV`.

### 7.8 No Environment Variable Validation

No `.env.example` file documents required variables. The app silently degrades if variables are missing, with no clear startup validation. Required env vars include:
- `OPENROUTER_API_KEY` (required for core functionality)
- `OPENROUTER_MODEL` (optional, defaults to 'deepseek/deepseek-chat')
- `NEXT_PUBLIC_SUPABASE_URL` (optional, enables persistence)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (optional, enables persistence)
- `SUPABASE_SERVICE_ROLE_KEY` (optional, unused)
- `OPENAI_API_KEY` (optional, enables RAG)
- `TAVILY_API_KEY` (optional, enables web search)

---

## 8. Dependency Review

### 8.1 Unused Dependencies

| Package | Version | Status |
|---|---|---|
| `ai` | ^6.0.49 | **UNUSED** — Vercel AI SDK core, not imported |
| `@ai-sdk/openai` | ^3.0.18 | **UNUSED** — AI SDK OpenAI provider, not imported |
| `@ai-sdk/react` | ^3.0.51 | **UNUSED** — AI SDK React hooks (useChat), not imported |
| `@supabase/ssr` | ^0.8.0 | **UNUSED** — Supabase SSR helpers, not imported |
| `zod` | ^4.3.6 | **UNUSED** — Schema validation, not imported |

These five packages add unnecessary bundle size and install time. Either use them (as recommended in §10) or remove them.

### 8.2 Missing Dependencies

| Need | Recommendation |
|---|---|
| Input validation on API routes | `zod` is already installed — use it! |
| Structured logging | `pino` or `winston` |
| Rate limiting | `upstash/ratelimit` or custom middleware |

### 8.3 Version Notes

- **Next.js 16.1.4** — Very recent (experimental features like `reactCompiler: true` and `turbopack.root`)
- **React 19.2.3** — Latest stable; React Compiler is experimental
- **Tailwind CSS 4** — Latest; uses `@import "tailwindcss"` and `@theme inline` syntax
- **babel-plugin-react-compiler 1.0.0** — First stable release; may have edge cases

### 8.4 Security Audit Recommendation

Run `npm audit` to check for known vulnerabilities in the dependency tree, especially with the very recent package versions.

---

## 9. Database / Supabase Review

### 9.1 Schema Design Issues

#### Missing `documents` Table in TypeScript Types

**File:** `src/lib/database.types.ts`

The `documents` table (used for RAG/wiki caching) is defined in `supabase-rag-setup.sql` but is completely absent from `database.types.ts`. This forces all document-related queries to use `(supabase as any)`.

#### Schema Inconsistency Between SQL Files

| Column | `supabase-schema.sql` | `supabase-fresh-setup.sql` |
|---|---|---|
| `profiles.user_id` | `UUID REFERENCES auth.users(id) ON DELETE CASCADE` | `UUID DEFAULT NULL` (no FK) |
| `profiles.anonymous_id` | Added via `ALTER TABLE` at end | Defined inline |
| `profiles.account_type` | `CHECK (account_type IN (...))` | No constraint |
| `messages.role` | `CHECK (role IN (...))` | No constraint |
| UUID generation | `uuid_generate_v4()` | `gen_random_uuid()` |
| RLS | Enabled with user-only policies | **Disabled** |

The "fresh setup" file is clearly the one actually deployed, and it removes important constraints and foreign keys.

#### No Unique Constraint on `anonymous_id` in Chats

The `profiles` table has a `UNIQUE` constraint on `anonymous_id` (`supabase-schema.sql`, line 48), but the `chats` table does not. Multiple chats per anonymous user is intentional, but there's no index-backed filtering.

### 9.2 RLS Policy Analysis

**Three conflicting RLS approaches exist:**

1. **`supabase-schema.sql`**: Proper RLS requiring `auth.uid() = user_id`. Anonymous users are blocked.
2. **`supabase-fix-rls.sql`**: Opens everything with `USING (true) WITH CHECK (true)`. No security.
3. **`supabase-fresh-setup.sql`**: Disables RLS entirely.

The commented-out "restrictive" alternative in `supabase-fix-rls.sql` (lines 56-89) is closer to correct, but has a flaw: it checks `anonymous_id IS NOT NULL` which matches ANY record that has an anonymous_id, not just the current user's.

**Correct approach:**
```sql
CREATE POLICY "Chat access"
  ON chats FOR ALL
  USING (
    user_id = auth.uid() 
    OR (anonymous_id IS NOT NULL AND anonymous_id = current_setting('request.headers')::json->>'x-anonymous-id')
  );
```
Or pass the anonymous_id as a Supabase header/claim.

### 9.3 RAG-Specific Issues

**File:** `supabase-rag-setup.sql`

- The `documents` table has RLS enabled with proper policies (read-only for anon, write for service_role)
- However, `src/lib/rag.ts` uses `getSupabaseClient()` (anon key) for `addDocument()` — this should fail due to RLS unless the fix-rls.sql override is applied
- `ivfflat` index with `lists = 100` is reasonable for small collections but needs tuning as the corpus grows
- No deduplication logic — calling `cacheWikiPage()` for the same page twice creates duplicate documents

### 9.4 Query Patterns

**File:** `src/hooks/useSupabase.ts`

- **N+1 potential**: `fetchChats()` makes an auth call + a query on every mount
- **No pagination**: Chat history limited to 50 via `.limit(50)`, but no "load more" mechanism
- **Race condition**: `upsertProfile()` does a SELECT then INSERT/UPDATE (not atomic). Two concurrent calls could create duplicate profiles.

**File:** `src/app/api/chat/route.ts`

- **Wiki cache lookup**: Uses `ilike` for case-insensitive matching (line 43), which won't use a standard index. A functional index on `lower(metadata->>'title')` would help.

---

## 10. Suggestions for Improvement

### Priority 1: Critical (Security)

| # | Issue | Action |
|---|---|---|
| 1.1 | **RLS disabled — full database exposed** | Implement proper RLS policies that check `anonymous_id` correctly. At minimum, the active policies should verify ownership, not `USING (true)`. |
| 1.2 | **No input validation on API routes** | Use the already-installed `zod` to validate request bodies in `/api/chat/route.ts` and `/api/player/route.ts`. Limit message array length, validate types. |
| 1.3 | **No rate limiting** | Add rate limiting to `/api/chat` to prevent abuse (cost amplification via OpenRouter). Consider `@upstash/ratelimit` or IP-based middleware. |
| 1.4 | **Missing env var checks** | Validate `OPENROUTER_API_KEY` exists at startup. Return 503 if not configured. Create `.env.example`. |

### Priority 2: High (Functionality / Reliability)

| # | Issue | Action |
|---|---|---|
| 2.1 | **Use the Vercel AI SDK** | Replace 300+ lines of manual streaming/tool-calling code with `streamText()` from the `ai` package. Use `useChat()` from `@ai-sdk/react` client-side. This is already installed. |
| 2.2 | **Add Error Boundary** | Create `src/app/error.tsx` and `src/app/global-error.tsx` for uncaught errors. |
| 2.3 | **Fix wiki cache deduplication** | Before inserting a new document in `cacheWikiPage()`, check if one exists (upsert pattern) to avoid duplicates. |
| 2.4 | **Fix type safety** | Add the `documents` table to `database.types.ts`. Remove all `(supabase as any)` casts. Remove `@ts-ignore`. |
| 2.5 | **Atomic profile upsert** | Use Supabase's `.upsert()` with `onConflict` instead of SELECT-then-INSERT/UPDATE in `useProfile`. |
| 2.6 | **Add external API timeouts** | Wrap all `fetch()` calls with `AbortController` + timeout (e.g., 10s for WOM, 15s for OpenRouter). |

### Priority 3: Medium (Performance / DX)

| # | Issue | Action |
|---|---|---|
| 3.1 | **Remove unused dependencies** | Remove `ai`, `@ai-sdk/openai`, `@ai-sdk/react`, `@supabase/ssr` if not adopting them. Or adopt them (recommended). |
| 3.2 | **Remove dead code** | Delete unused exported functions in `parser.ts`, `osrs.ts`, `tavily.ts`, `rag.ts`, `supabase.ts`. |
| 3.3 | **Optimize streaming re-renders** | Batch streaming updates (e.g., accumulate chunks for 50ms before updating state), or use `useRef` for the content and only trigger occasional renders. |
| 3.4 | **Parallelize tool calls** | Use `Promise.all()` for independent tool calls instead of sequential execution. |
| 3.5 | **Cache item mapping server-side** | Use a module-level Map or Redis to persist the OSRS item mapping across serverless invocations. |
| 3.6 | **Use Next.js `<Image>`** | Replace raw `<img>` tags with `next/image` for automatic optimization and lazy loading. Add `remotePatterns` config for Wiki image domains. |

### Priority 4: Low (Code Quality / Maintenance)

| # | Issue | Action |
|---|---|---|
| 4.1 | **Extract inline styles to Tailwind** | Create utility classes for the repeated `textShadow`, `fontFamily`, `fontSize` patterns. Use Tailwind `@apply` or component classes. |
| 4.2 | **Decompose `route.ts`** | Split the 706-line chat route into: prompt builder, tool executor, stream handler, and main handler. |
| 4.3 | **Add structured logging** | Replace `console.log/error` with a logger that respects `NODE_ENV`. |
| 4.4 | **Add tests** | No tests exist. Add unit tests for `parser.ts`, `osrs.ts` formatting functions, and integration tests for API routes. |
| 4.5 | **Create `.env.example`** | Document all environment variables with descriptions and required/optional status. |
| 4.6 | **Generate stable message IDs** | Use `crypto.randomUUID()` instead of `Date.now().toString()` for temporary message IDs. |
| 4.7 | **Consolidate SQL files** | Merge the 4 SQL files into a single migration or use Supabase migrations. The current state (4 files with conflicting approaches) is confusing. |
| 4.8 | **Add `not-found.tsx`** | Provide a custom 404 page. |

---

## Appendix: File-by-File Quick Reference

| File | Lines | Key Issues |
|---|---|---|
| `layout.tsx` | 42 | Clean. Minor: no `lang` attribute fallback. |
| `page.tsx` | 6 | Fine as-is. |
| `globals.css` | 137 | Clean OSRS theme. Some color names misleading (e.g., `--osrs-orange: #e7e7e9` is gray). |
| `api/chat/route.ts` | 706 | Largest file. Needs decomposition. Manual streaming. No input validation. |
| `api/player/route.ts` | 67 | Clean. Missing input validation. |
| `Chat.tsx` | 527 | Custom markdown renderer. Streaming re-render issue. Missing memoization. |
| `Dashboard.tsx` | 157 | State orchestrator. Clean but could benefit from `useReducer`. |
| `Sidebar.tsx` | 424 | Large component. Many inline styles. |
| `useSupabase.ts` | 528 | 4 hooks. Heavy `any` casting. Race conditions in upsert. |
| `database.types.ts` | 147 | Missing `documents` table. Duplicate exports with `supabase.ts`. |
| `osrs.ts` | 539 | Good API wrappers. Unused exports. `@ts-ignore`. |
| `parser.ts` | 234 | Solid logic. Many unused exports. |
| `rag.ts` | 234 | Clean RAG implementation. Uses wrong Supabase client for writes. |
| `supabase.ts` | 152 | Singleton pattern. Dead code (`createAdminClient`, `safeQuery`). |
| `tavily.ts` | 128 | Clean. Many unused exports. |
| `types.ts` | 122 | Well-structured types. |
| `utils.ts` | 7 | Minimal — just `cn()`. |
| `supabase-schema.sql` | 259 | Original schema with proper RLS. Proper constraints. |
| `supabase-fix-rls.sql` | 89 | **Danger** — opens all data to public. |
| `supabase-fresh-setup.sql` | 105 | Simplified schema. No FK constraints. RLS disabled. |
| `supabase-rag-setup.sql` | 105 | Clean pgvector setup. Proper RLS for documents. |

---

*End of Review*
