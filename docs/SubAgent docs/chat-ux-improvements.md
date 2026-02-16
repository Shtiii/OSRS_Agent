# Chat UX Improvements — Implementation Spec

> **Created:** 2026-02-16  
> **Status:** Ready for implementation  
> **Files to modify:**  
> - `src/components/Chat.tsx` (660 lines)  
> - `src/app/api/chat/route.ts` (935 lines)

---

## Change 1: Show real error messages + dismiss button

**File:** `src/components/Chat.tsx`  
**Location:** Lines 405–411  

### Problem
The error banner hardcodes `"Something went wrong. Please try again."` even though the `error` state (`Error | null`, declared at line 46) already carries the real API message (rate-limit text, topic block, etc., parsed in the catch at line 217).

### Current code (lines 405–411)
```tsx
{error && (
  <div className="flex items-center gap-3 p-4 bg-[var(--osrs-red)]/10 border border-[var(--osrs-red)]/30 rounded-xl text-red-300 max-w-3xl mx-auto mt-4">
    <AlertCircle className="w-5 h-5 flex-shrink-0" />
    <p className="text-sm">Something went wrong. Please try again.</p>
  </div>
)}
```

### Required changes

1. **Replace the hardcoded string** with `{error.message}`.
2. **Add a dismiss (X) button** on the right side of the banner that calls `setError(null)`.
3. **Import `X`** from `lucide-react` (add to the existing import block at lines 4–15).

### Target code
```tsx
{error && (
  <div className="flex items-center gap-3 p-4 bg-[var(--osrs-red)]/10 border border-[var(--osrs-red)]/30 rounded-xl text-red-300 max-w-3xl mx-auto mt-4">
    <AlertCircle className="w-5 h-5 flex-shrink-0" />
    <p className="text-sm flex-1">{error.message}</p>
    <button onClick={() => setError(null)} className="ml-auto hover:text-red-200 transition-colors">
      <X className="w-4 h-4" />
    </button>
  </div>
)}
```

---

## Change 2: "Stop generating" button with AbortController

**File:** `src/components/Chat.tsx`

### Problem
While the AI streams a response, the user has no way to cancel. There is no `AbortController` wired up.

### Required changes

#### 2a. Add ref (near line 49, alongside other refs)
```tsx
const abortControllerRef = useRef<AbortController | null>(null);
```

#### 2b. Create AbortController before fetch (inside `handleSubmit`, just before the `fetch` call at line 143)
Insert before `const response = await fetch(...)`:
```tsx
const controller = new AbortController();
abortControllerRef.current = controller;
```
And pass `signal: controller.signal` into the `fetch` options:
```tsx
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  signal: controller.signal,
  body: JSON.stringify({ ... }),
});
```

#### 2c. Add `handleStop` function (after `handleSubmit`, around line 222)
```tsx
const handleStop = () => {
  abortControllerRef.current?.abort();
  abortControllerRef.current = null;
};
```

#### 2d. Abort-error guard in catch block (line 217)
Current catch block (lines 217–219):
```tsx
} catch (err) {
  setError(err instanceof Error ? err : new Error('Unknown error'));
  pendingAssistantMessageRef.current = null;
```
Change to:
```tsx
} catch (err) {
  if (err instanceof Error && err.name === 'AbortError') {
    // User cancelled — not an error
  } else {
    setError(err instanceof Error ? err : new Error('Unknown error'));
  }
  pendingAssistantMessageRef.current = null;
```

#### 2e. Clear the controller in the `finally` block (line 221)
Add `abortControllerRef.current = null;` in the finally block.

#### 2f. Stop button in UI (lines 428–440)
When `isLoading` is true, show a **Stop** button instead of the Send button.

**Import `Square`** from `lucide-react` (add to the import block at lines 4–15).

Replace the current submit button with:
```tsx
{isLoading ? (
  <button
    type="button"
    onClick={handleStop}
    className="osrs-button px-4 py-3 flex items-center justify-center text-red-400 hover:text-red-300"
  >
    <Square className="w-5 h-5" />
  </button>
) : (
  <button
    type="submit"
    disabled={!input.trim()}
    className={cn(
      'osrs-button px-4 py-3 flex items-center justify-center',
      input.trim() && 'osrs-button-primary'
    )}
  >
    <Send className="w-5 h-5" />
  </button>
)}
```

---

## Changes 3 & 4: Auto-expanding textarea replaces input

**File:** `src/components/Chat.tsx`  
**Location:** Lines 418–426 (the `<input>` element)

### Problem
Single-line `<input type="text">` prevents multi-line messages and doesn't grow with content.

### Required changes

#### 3a. Add textarea ref (near line 49, with other refs)
```tsx
const textareaRef = useRef<HTMLTextAreaElement>(null);
```

#### 3b. Auto-resize helper (above or inside the component, before the JSX return)
```tsx
const autoResize = useCallback(() => {
  const textarea = textareaRef.current;
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
}, []);
```

#### 3c. Replace the `<input>` with a `<textarea>` (lines 418–426)

Current code:
```tsx
<div className="flex-1 relative">
  <input
    type="text"
    value={input}
    onChange={(e) => setInput(e.target.value)}
    placeholder="Ask about bosses, quests, money making..."
    className="osrs-input w-full py-3 px-4 pr-4 text-sm"
    disabled={isLoading}
  />
</div>
```

Target code:
```tsx
<div className="flex-1 relative">
  <textarea
    ref={textareaRef}
    value={input}
    onChange={(e) => {
      setInput(e.target.value);
      autoResize();
    }}
    onKeyDown={(e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.trim() && !isLoading) {
          handleSubmit(e as unknown as React.FormEvent);
        }
      }
    }}
    placeholder="Ask about bosses, quests, money making..."
    className="osrs-input w-full py-3 px-4 text-sm resize-none overflow-y-auto"
    style={{ maxHeight: '200px' }}
    rows={1}
    disabled={isLoading}
  />
</div>
```

#### 3d. Reset textarea height after sending
In `handleSubmit`, right after `setInput('')` (line 109), add:
```tsx
if (textareaRef.current) {
  textareaRef.current.style.height = 'auto';
}
```

---

## Change 5: Web search as fallback in system prompt

**File:** `src/app/api/chat/route.ts`  
**Location:** `buildSystemPrompt` function, starting at line 292

### Problem
The system prompt only mentions `searchWeb` for "community meta, opinions, recent updates." It should explicitly instruct the model to fall back to web search when Wiki lookups fail.

### Required changes

#### 5a. Update `searchWeb` tool description (line 376)
Current:
```
- **searchWeb** - Search the web for community content (Reddit, YouTube). Use for meta strategies, current opinions, or recent game updates.
```
New:
```
- **searchWeb** - Search the web for OSRS information. **Use as a fallback** when Wiki search doesn't find what you need, AND for community content (Reddit, YouTube, recent guides).
```

#### 5b. Add fallback lines under "### WHEN TO USE TOOLS:" (after line 387)
Current last entry in the list:
```
- Community meta, opinions, recent updates → searchWeb
- Another player's stats → lookupPlayer
```
Add these lines after the `searchWeb` line and before the `lookupPlayer` line:
```
- Wiki search returns no useful results → try searchWeb as a fallback
- Recent game updates, patch notes, current meta → searchWeb
```

#### 5c. Add new section after "### WHEN NOT TO USE TOOLS:" block (after line 393)
Insert a new section between "WHEN NOT TO USE TOOLS" and "TRANSPARENCY & CITATIONS":

```
### FALLBACK STRATEGY:
If searchWiki or getWikiPage return no results or unhelpful content, ALWAYS try searchWeb before telling the user you couldn't find information. The web often has guides, Reddit discussions, and YouTube videos that cover topics the Wiki may not.
```

---

## Summary of all import changes (Chat.tsx, lines 4–15)

Add `X` and `Square` to the existing lucide-react import:
```tsx
import {
  Send,
  Bot,
  Loader2,
  Sparkles,
  AlertCircle,
  Compass,
  Coins,
  Skull,
  Scroll,
  User,
  X,
  Square,
} from 'lucide-react';
```

---

## Implementation order

1. **Change 5** (route.ts system prompt) — isolated, no cross-dependencies
2. **Change 1** (error banner) — small, self-contained
3. **Changes 3 & 4** (textarea) — foundational UI change
4. **Change 2** (abort controller + stop button) — depends on textarea being in place for the button swap

## Verification

After implementation, run:
```bash
npx tsc --noEmit
npx next build
```
Both must pass with zero errors. Then manually test:
- Error banner shows real API error text and dismisses on X click
- Stop button appears during streaming and cancels the response
- Textarea expands up to ~6 rows and submits on Enter
- Shift+Enter inserts a newline
- Textarea resets height after sending
- Agent uses `searchWeb` as fallback when Wiki search fails
