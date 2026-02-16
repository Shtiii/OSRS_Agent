# Mobile Responsiveness Specification — OSRS Agent

**Created:** 2026-02-16  
**Status:** Ready for Implementation  
**Workspace:** `c:\Users\sbj\OneDrive - Nordax Group AB\Desktop\OSRS_Agent`

---

## 1. Summary of Current Layout Issues for Mobile

The OSRS Agent website is currently a **desktop-only** layout. The root problem is a **fixed-width sidebar (340px)** sitting beside a flex-1 chat area inside a `flex h-screen` container. On any screen narrower than ~700px, the chat area is crushed to near-zero width. On a typical mobile screen (375px), only 35px would remain for the entire chat panel — rendering the app completely unusable.

### Critical Issues:

1. **Fixed 340px sidebar** — never collapses, no toggle mechanism (`Sidebar.tsx` line 156: `w-[340px]`)
2. **No hamburger/drawer menu** — sidebar has no way to hide on mobile
3. **`overflow: hidden` on body** — prevents natural mobile scrolling (`globals.css` line 62)
4. **No responsive breakpoints** — only two minor Tailwind responsive classes exist in the entire codebase (`md:px-6` in Chat.tsx and `sm:grid-cols-2` for suggestion chips)
5. **Small touch targets** — chat history delete buttons, auth buttons, and various interactive elements are too small for fingers (< 44px)
6. **No viewport-aware input handling** — mobile keyboards push content up without proper handling
7. **Chat header badges overflow** — combat level + account type badges don't wrap on narrow screens

---

## 2. Component-by-Component Analysis

---

### 2.1 `src/app/globals.css` (395 lines)

**Current approach:** CSS custom properties for theming, custom classes for buttons/inputs/panels, no CSS media queries.

#### Hardcoded values:
| Line(s) | Property | Value | Issue |
|---------|----------|-------|-------|
| 62 | `body { overflow: hidden }` | `hidden` | Prevents mobile scroll; mobile browsers need `overflow` for address bar interaction |
| 140 | scrollbar width | `8px` | Fine, but should consider hiding on touch devices |
| 354 | `.sidebar-section` padding | `16px 20px` | Tight but acceptable |
| 364–370 | `.msg-user` border-radius | `12px 12px 4px 12px` | OK |
| 378–387 | `.suggestion-chip` padding | `10px 16px` | Acceptable touch target |

#### Responsive breakpoints: **NONE**

#### Changes needed:
- Add mobile media queries (`@media (max-width: 767px)`)
- Add sidebar overlay/transition styles
- Add hamburger button styles
- Adjust body overflow for mobile
- Add touch-specific styles (larger tap targets, no hover effects on touch)
- Add safe-area-inset padding for notched phones

---

### 2.2 `src/app/page.tsx` (6 lines)

**Current approach:** Simple wrapper that renders `<Dashboard />`.

```tsx
export default function Home() {
  return <Dashboard />;
}
```

#### Issues: None — this file is just a passthrough.
#### Changes needed: None.

---

### 2.3 `src/app/layout.tsx` (50 lines)

**Current approach:** Standard Next.js layout with Geist and Press Start 2P fonts, `AuthProvider` wrapper, `minHeight: '100vh'` on body.

#### Key observations:
- Line 41: `<html lang="en" className="dark">`
- Line 43–44: Body has inline `style={{ backgroundColor: 'var(--osrs-bg)', minHeight: '100vh' }}`
- Next.js automatically adds `<meta name="viewport" content="width=device-width, initial-scale=1" />`

#### Issues:
- No `viewport-fit=cover` for notched phones (iPhone safe areas)

#### Changes needed:
- Add viewport meta with `viewport-fit=cover` to metadata
- Consider adding `maximum-scale=1` to prevent unwanted zoom on input focus (iOS)

---

### 2.4 `src/components/Chat.tsx` (717 lines)

**Current approach:** `flex-1 flex flex-col h-full` — fills remaining space after sidebar.

#### Hardcoded values:
| Line(s) | Element | Value | Issue |
|---------|---------|-------|-------|
| 213 | Root container | `flex-1 flex flex-col h-full` | OK, flex grows |
| 215 | Chat header | `px-5 py-3.5` | OK |
| 217 | Header icon | `w-9 h-9` | OK |
| 223–228 | Title font | `fontSize: '10px'` (pixel font) | Tiny — may be hard to read on mobile |
| 244–245 | Combat badge | `px-2.5 py-1` | Small touch targets |
| 261 | Messages area | `px-4 md:px-6 py-5` | Has `md:` breakpoint — good |
| 280 | Welcome hero | `w-20 h-20` | OK |
| 288–293 | Welcome title | `fontSize: '14px'` (pixel font) | OK |
| 301 | Suggestion grid | `grid-cols-1 sm:grid-cols-2` | Has `sm:` breakpoint — good |
| 335 | Messages container | `max-w-3xl mx-auto` | OK — constrains on desktop |
| 339 | User message bubble | `max-w-[80%]` | OK for mobile |
| 351 | Assistant message | `max-w-[85%]` | OK for mobile |
| 397 | Input container | `px-4 md:px-6 py-4` | Has `md:` breakpoint — good |
| 403 | Textarea | `maxHeight: '200px'` | May be too tall on small screens |

#### Responsive breakpoints (existing):
- `md:px-6` on messages area (line 261) and input area (line 397)
- `sm:grid-cols-2` on suggestion grid (line 301)

#### Mobile issues:
1. **Chat header badges overflow** — When combat level badge + account type badge + icon are on a narrow screen, they'll wrap awkwardly
2. **Welcome screen** — `max-w-xl` is fine but the pixel font heading + body text need spacing adjustments
3. **Textarea max height** — 200px is half the screen on short phones; should be reduced
4. **No hamburger/menu button** — Chat header has no way to open the sidebar on mobile

#### Changes needed:
- Add hamburger menu button to chat header (visible only on mobile)
- Wrap/stack chat header badges on small screens
- Reduce textarea max-height on mobile
- Ensure messages area fills screen properly with mobile keyboard
- Add `pb-safe` (safe area inset) to input area for phones with gesture bars

---

### 2.5 `src/components/Dashboard.tsx` (170 lines)

**Current approach:** `flex h-screen` — horizontal flex with Sidebar (340px) + Chat (flex-1).

```tsx
// Line 163
<div className="flex h-screen bg-[var(--osrs-bg)] text-[var(--osrs-white)]">
  <Sidebar ... />
  <Chat ... />
</div>
```

#### Hardcoded values:
| Line | Element | Value | Issue |
|------|---------|-------|-------|
| 163 | Root | `flex h-screen` | Fixed viewport height, no mobile toggle |

#### Responsive breakpoints: **NONE**

#### Mobile issues:
1. **Sidebar always visible** — On mobile, the 340px sidebar pushes Chat off-screen or crushes it
2. **No state for sidebar visibility** — No `isSidebarOpen` state, no toggle callback
3. **No overlay/backdrop** — When sidebar opens on mobile, there's no backdrop to close it

#### Changes needed:
- Add `isSidebarOpen` state (default `false` on mobile, `true` on desktop)
- Add `toggleSidebar` callback to pass to both Sidebar and Chat
- On mobile (`< 768px`), render sidebar as a **slide-over drawer with backdrop**
- On desktop (`>= 768px`), keep current side-by-side layout
- Add media query listener (or use Tailwind `md:` breakpoints) to auto-close sidebar on resize
- Pass `onCloseSidebar` to Sidebar for the X/close button on mobile

---

### 2.6 `src/components/Sidebar.tsx` (584 lines)

**Current approach:** `w-[340px] flex flex-col h-full` — fixed width, full height, vertical flex layout.

#### Hardcoded values:
| Line(s) | Element | Value | Issue |
|---------|---------|-------|-------|
| 156 | Root container | `w-[340px]` | **CRITICAL** — fixed width, no responsive |
| 160–163 | Header | `px-5 py-5` | Adequate padding |
| 164 | Logo icon | `w-10 h-10` | OK |
| 195 | New chat button | `py-2.5` | Touch-friendly height |
| 202 | Chat history | `max-h-52` | Limits scroll area — OK |
| 204 | Section label | `text-[0.7rem]` | Very small |
| Various | Delete button | `p-1` (4px padding) | **Too small** for touch (< 44px) |
| Various | Collapsible toggles | `text-[0.7rem]` | Very small text |

#### Responsive breakpoints: **NONE**

#### Mobile issues:
1. **Fixed 340px width** — Must become full-width or near-full-width on mobile
2. **No close button** — When used as a drawer on mobile, there's no way to close
3. **Delete/action buttons too small** — The `p-1` delete buttons on chat history items are ~20px, well below the 44px minimum for touch
4. **Chat history max-height** — `max-h-52` (208px) is fine on mobile
5. **Long scrollable content** — Sidebar has many sections; on mobile it needs smooth scrolling
6. **Footer "Powered by"** — Pushed down by `flex-1` spacer; on mobile drawer this is fine

#### Changes needed:
- Remove fixed `w-[340px]` on mobile, use `w-full` or `w-[85vw] max-w-[340px]`
- Add close (X) button in header on mobile
- Increase touch targets: delete buttons → `p-2` minimum (44px hit area)
- Accept `onClose` prop for mobile drawer behavior
- Accept `isOpen` prop to control visibility
- Add slide animation (translateX) for drawer

---

### 2.7 `src/components/AuthProvider.tsx` (93 lines)

**Current approach:** React context provider — no visual rendering at all.

#### Issues: **None** — purely a logic/state component.
#### Changes needed: None.

---

## 3. Specific Changes Needed Per File

---

### 3.1 `src/app/globals.css`

#### A. Add mobile base styles (after line 62, body rule):

```css
/* Mobile viewport fix */
@supports (height: 100dvh) {
  .h-screen-safe {
    height: 100dvh;
  }
}

/* Safe area padding for notched phones */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.pt-safe {
  padding-top: env(safe-area-inset-top, 0px);
}
```

#### B. Add sidebar mobile overlay styles (after `.sidebar-section` around line 358):

```css
/* ===== Mobile Sidebar Overlay ===== */
.sidebar-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 40;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.sidebar-backdrop.open {
  opacity: 1;
  pointer-events: auto;
}

.sidebar-drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 50;
  transform: translateX(-100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  width: 85vw;
  max-width: 340px;
}

.sidebar-drawer.open {
  transform: translateX(0);
}

@media (min-width: 768px) {
  .sidebar-drawer {
    position: relative;
    transform: none;
    width: 340px;
    max-width: none;
    z-index: auto;
  }
  
  .sidebar-backdrop {
    display: none;
  }
}
```

#### C. Add hamburger button styles (new section):

```css
/* ===== Hamburger Menu Button ===== */
.hamburger-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid var(--osrs-border);
  color: var(--osrs-orange);
  cursor: pointer;
  transition: all 0.2s ease;
}

.hamburger-btn:hover {
  background: var(--osrs-panel);
  border-color: var(--osrs-orange);
}

@media (min-width: 768px) {
  .hamburger-btn {
    display: none;
  }
}
```

#### D. Add mobile touch-friendly overrides:

```css
/* ===== Mobile-specific overrides ===== */
@media (max-width: 767px) {
  body {
    overflow: auto;
    -webkit-overflow-scrolling: touch;
  }
  
  /* Larger touch targets */
  .osrs-button {
    min-height: 44px;
    min-width: 44px;
  }
  
  .osrs-input {
    font-size: 16px; /* Prevents iOS zoom on focus */
    min-height: 44px;
  }
  
  /* Hide scrollbar on mobile for cleaner look */
  ::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
  
  /* Reduce suggestion chip hover effects on touch */
  .suggestion-chip:hover {
    transform: none;
  }
  
  .suggestion-chip:active {
    background: var(--osrs-panel-accent);
    border-color: var(--osrs-orange);
  }
}
```

#### E. Modify body rule (line 57–62):

**Before:**
```css
body {
  background: var(--osrs-bg);
  color: var(--foreground);
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
  overflow: hidden;
}
```

**After:**
```css
body {
  background: var(--osrs-bg);
  color: var(--foreground);
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
  overflow: hidden;
}

@media (max-width: 767px) {
  body {
    overflow: auto;
    overflow-x: hidden;
  }
}
```

---

### 3.2 `src/app/layout.tsx`

#### Add viewport-fit=cover to metadata (line 26–30):

**Before:**
```tsx
export const metadata: Metadata = {
  title: "OSRS Helper — AI-Powered RuneScape Assistant",
  description: "Get personalized OSRS advice based on your stats...",
  keywords: ["OSRS", ...],
  icons: { icon: "/favicon.ico" },
};
```

**After:**
```tsx
export const metadata: Metadata = {
  title: "OSRS Helper — AI-Powered RuneScape Assistant",
  description: "Get personalized OSRS advice based on your stats...",
  keywords: ["OSRS", ...],
  icons: { icon: "/favicon.ico" },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    viewportFit: 'cover',
  },
};
```

> **Note:** In Next.js 14+, viewport is exported separately as `export const viewport`. Check the Next.js version and use the appropriate approach:
>
> ```tsx
> import type { Metadata, Viewport } from "next";
> 
> export const viewport: Viewport = {
>   width: 'device-width',
>   initialScale: 1,
>   maximumScale: 1,
>   viewportFit: 'cover',
> };
> ```

---

### 3.3 `src/components/Dashboard.tsx`

This is the main orchestration point. It needs the most structural changes.

#### Add mobile state management and responsive wrapper:

**Current root (line 163–183):**
```tsx
return (
  <div className="flex h-screen bg-[var(--osrs-bg)] text-[var(--osrs-white)]">
    <Sidebar
      username={username}
      setUsername={setUsername}
      // ... all props
    />
    <Chat 
      userContext={userContext} 
      chatId={currentChatId}
      onCreateChat={handleCreateChat}
      onUpdateChatTitle={handleUpdateChatTitle}
      profile={profile}
    />
  </div>
);
```

**New implementation:**

```tsx
// Add these state/hooks at the top of the Dashboard component:
const [isSidebarOpen, setIsSidebarOpen] = useState(false);
const [isMobile, setIsMobile] = useState(false);

// Detect mobile viewport
useEffect(() => {
  const checkMobile = () => setIsMobile(window.innerWidth < 768);
  checkMobile();
  window.addEventListener('resize', checkMobile);
  return () => window.removeEventListener('resize', checkMobile);
}, []);

// Close sidebar when navigating to a chat on mobile
const handleSelectChatMobile = useCallback((chatId: string) => {
  handleSelectChat(chatId);
  if (isMobile) setIsSidebarOpen(false);
}, [handleSelectChat, isMobile]);

const handleNewChatMobile = useCallback(() => {
  handleNewChat();
  if (isMobile) setIsSidebarOpen(false);
}, [handleNewChat, isMobile]);

const toggleSidebar = useCallback(() => {
  setIsSidebarOpen(prev => !prev);
}, []);

const closeSidebar = useCallback(() => {
  setIsSidebarOpen(false);
}, []);
```

**New return JSX:**
```tsx
return (
  <div className="flex h-screen bg-[var(--osrs-bg)] text-[var(--osrs-white)] relative">
    {/* Mobile backdrop */}
    {isMobile && (
      <div 
        className={cn('sidebar-backdrop', isSidebarOpen && 'open')}
        onClick={closeSidebar}
      />
    )}
    
    {/* Sidebar — drawer on mobile, static on desktop */}
    <div className={cn('sidebar-drawer', (!isMobile || isSidebarOpen) && 'open')}>
      <Sidebar
        username={username}
        setUsername={setUsername}
        stats={stats}
        gains={gains}
        rareItems={rareItems}
        collectionLog={collectionLog}
        onLoadStats={loadStats}
        onUpdateStats={updateStats}
        onCollectionLogParsed={handleCollectionLogParsed}
        isLoading={isLoading}
        chatHistory={chats}
        currentChatId={currentChatId}
        onNewChat={handleNewChatMobile}
        onSelectChat={handleSelectChatMobile}
        onDeleteChat={handleDeleteChat}
        isChatsLoading={isChatsLoading}
        isSupabaseConfigured={isSupabaseConfigured}
        profile={profile}
        onClose={closeSidebar}     // NEW PROP
        isMobile={isMobile}        // NEW PROP
      />
    </div>
    
    <Chat 
      userContext={userContext} 
      chatId={currentChatId}
      onCreateChat={handleCreateChat}
      onUpdateChatTitle={handleUpdateChatTitle}
      profile={profile}
      onToggleSidebar={toggleSidebar}  // NEW PROP
      isMobile={isMobile}              // NEW PROP
    />
  </div>
);
```

---

### 3.4 `src/components/Sidebar.tsx`

#### A. Update interface (around line 52–72):

Add two new props:
```tsx
interface SidebarProps {
  // ... existing props ...
  onClose?: () => void;       // NEW: close drawer on mobile
  isMobile?: boolean;          // NEW: mobile detection
}
```

#### B. Update destructuring (around line 74):

```tsx
export default function Sidebar({
  // ... existing ...
  onClose,
  isMobile,
}: SidebarProps) {
```

#### C. Change root container (line 156):

**Before:**
```tsx
<div className="w-[340px] flex flex-col h-full bg-[var(--osrs-panel)] border-r border-[var(--osrs-border)] overflow-hidden">
```

**After:**
```tsx
<div className="w-full md:w-[340px] flex flex-col h-full bg-[var(--osrs-panel)] border-r border-[var(--osrs-border)] overflow-hidden">
```

#### D. Add close button to header section (after line 163, inside the header flex):

Insert an X button visible only on mobile:

**Before (line 160–180, header section):**
```tsx
<div className="px-5 py-5 border-b border-[var(--osrs-border)]">
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-lg ...">
      <Swords className="w-5 h-5 text-[var(--osrs-bg)]" />
    </div>
    <div className="flex-1">
      <h1 ...>OSRS Helper</h1>
      <p ...>AI-powered companion</p>
    </div>
    {isSupabaseConfigured ? ( ... ) : ( ... )}
  </div>
</div>
```

**After:**
```tsx
<div className="px-5 py-5 border-b border-[var(--osrs-border)]">
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-lg ...">
      <Swords className="w-5 h-5 text-[var(--osrs-bg)]" />
    </div>
    <div className="flex-1">
      <h1 ...>OSRS Helper</h1>
      <p ...>AI-powered companion</p>
    </div>
    {isSupabaseConfigured ? ( ... ) : ( ... )}
    {/* Mobile close button */}
    {isMobile && onClose && (
      <button
        onClick={onClose}
        className="ml-2 p-2 text-gray-400 hover:text-[var(--osrs-orange)] transition-colors rounded-lg border border-[var(--osrs-border)] md:hidden"
        aria-label="Close sidebar"
      >
        <X className="w-5 h-5" />
      </button>
    )}
  </div>
</div>
```

> **Note:** Need to add `X` to the lucide-react imports at the top of Sidebar.tsx.

#### E. Increase touch targets on delete buttons (around line 248):

**Before:**
```tsx
<button
  onClick={(e) => handleDeleteClick(chat.id, e)}
  className="p-1 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-[var(--osrs-red)] transition-all"
  title="Delete chat"
>
  <Trash2 className="w-3.5 h-3.5" />
</button>
```

**After:**
```tsx
<button
  onClick={(e) => handleDeleteClick(chat.id, e)}
  className="p-2 opacity-0 group-hover:opacity-100 md:p-1 text-gray-500 hover:text-[var(--osrs-red)] transition-all"
  title="Delete chat"
>
  <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
</button>
```

Similarly for confirm/cancel delete buttons (around line 237–252).

---

### 3.5 `src/components/Chat.tsx`

#### A. Update interface (around line 34):

Add new props:
```tsx
interface ChatProps {
  userContext: UserContext;
  chatId: string | null;
  onCreateChat: (firstMessage: string) => Promise<string | null>;
  onUpdateChatTitle: (chatId: string, title: string) => Promise<void>;
  profile: ProfileRow | null;
  onToggleSidebar?: () => void;   // NEW
  isMobile?: boolean;              // NEW
}
```

#### B. Update destructuring (around line 41):

```tsx
export default function Chat({ 
  userContext, 
  chatId, 
  onCreateChat, 
  onUpdateChatTitle,
  profile,
  onToggleSidebar,
  isMobile,
}: ChatProps) {
```

#### C. Add hamburger button to chat header (around line 215–255):

**Before (chat header, line 216–218):**
```tsx
<div className="px-5 py-3.5 border-b border-[var(--osrs-border)] bg-[var(--osrs-panel-dark)]">
  <div className="flex items-center gap-3">
    <div className="w-9 h-9 rounded-lg ...">
```

**After:**
```tsx
<div className="px-3 md:px-5 py-3.5 border-b border-[var(--osrs-border)] bg-[var(--osrs-panel-dark)]">
  <div className="flex items-center gap-2 md:gap-3">
    {/* Hamburger menu — mobile only */}
    {onToggleSidebar && (
      <button
        onClick={onToggleSidebar}
        className="hamburger-btn md:hidden"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>
    )}
    <div className="w-9 h-9 rounded-lg ...">
```

> **Note:** Need to add `Menu` to the lucide-react imports at the top of Chat.tsx.

#### D. Make chat header badges responsive (around line 244–258):

**Before:**
```tsx
{userContext.stats && (
  <div className="flex items-center gap-2">
    <div className="px-2.5 py-1 rounded-md bg-[var(--osrs-yellow)]/10 border border-[var(--osrs-yellow)]/20">
      <span className="text-xs font-medium text-[var(--osrs-yellow)]">
        Cmb {userContext.stats.combatLevel}
      </span>
    </div>
    <div className={cn(
      'px-2.5 py-1 rounded-md capitalize text-xs font-medium osrs-badge',
      // ... badge variants
    )}>
      {userContext.stats.type}
    </div>
  </div>
)}
```

**After:**
```tsx
{userContext.stats && (
  <div className="hidden sm:flex items-center gap-2">
    <div className="px-2.5 py-1 rounded-md bg-[var(--osrs-yellow)]/10 border border-[var(--osrs-yellow)]/20">
      <span className="text-xs font-medium text-[var(--osrs-yellow)]">
        Cmb {userContext.stats.combatLevel}
      </span>
    </div>
    <div className={cn(
      'px-2.5 py-1 rounded-md capitalize text-xs font-medium osrs-badge',
      // ... badge variants
    )}>
      {userContext.stats.type}
    </div>
  </div>
)}
```

This hides badges on very small screens (`< 640px`) to prevent overflow.

#### E. Reduce textarea max-height on mobile (around line 403–424):

**Before:**
```tsx
<textarea
  ref={textareaRef}
  ...
  className="osrs-input block w-full text-sm resize-none overflow-y-auto"
  style={{ maxHeight: '200px' }}
  rows={1}
  disabled={isLoading}
/>
```

**After:**
```tsx
<textarea
  ref={textareaRef}
  ...
  className="osrs-input block w-full text-sm resize-none overflow-y-auto"
  style={{ maxHeight: isMobile ? '120px' : '200px' }}
  rows={1}
  disabled={isLoading}
/>
```

#### F. Adjust placeholder text for mobile (around line 418):

**Before:**
```tsx
placeholder="Ask about bosses, quests, money making... (Shift+Enter for new line)"
```

**After:**
```tsx
placeholder={isMobile ? "Ask anything about OSRS..." : "Ask about bosses, quests, money making... (Shift+Enter for new line)"}
```

#### G. Add safe-area padding to input container (around line 397):

**Before:**
```tsx
<div className="px-4 md:px-6 py-4 border-t border-[var(--osrs-border)] bg-[var(--osrs-panel-dark)]">
```

**After:**
```tsx
<div className="px-4 md:px-6 py-4 border-t border-[var(--osrs-border)] bg-[var(--osrs-panel-dark)] pb-safe">
```

---

## 4. Implementation Plan

### Phase 1: CSS Foundation (globals.css)
**Files:** `src/app/globals.css`
1. Add mobile body overflow override
2. Add `.sidebar-backdrop` and `.sidebar-drawer` classes
3. Add `.hamburger-btn` styles
4. Add mobile touch-friendly overrides (`min-height: 44px`, `font-size: 16px` for inputs)
5. Add `.pb-safe`, `.pt-safe`, `.h-screen-safe` utility classes
6. Add mobile scrollbar hiding

### Phase 2: Layout Infrastructure (layout.tsx)
**Files:** `src/app/layout.tsx`
1. Add viewport export with `viewportFit: 'cover'` and `maximumScale: 1`

### Phase 3: Dashboard Orchestration (Dashboard.tsx)
**Files:** `src/components/Dashboard.tsx`
1. Add `isSidebarOpen` state
2. Add `isMobile` state with resize listener
3. Add `toggleSidebar`, `closeSidebar` callbacks
4. Wrap Sidebar in mobile drawer container with backdrop
5. Pass new props (`onClose`, `isMobile`) to Sidebar
6. Pass new props (`onToggleSidebar`, `isMobile`) to Chat
7. Auto-close sidebar on chat/new-chat selection (mobile only)

### Phase 4: Sidebar Mobile Drawer (Sidebar.tsx)
**Files:** `src/components/Sidebar.tsx`
1. Add `onClose` and `isMobile` props
2. Change `w-[340px]` → `w-full md:w-[340px]`
3. Add `X` close button in header (mobile only)
4. Increase delete button touch targets
5. Import `X` from lucide-react

### Phase 5: Chat Mobile Adaptation (Chat.tsx)
**Files:** `src/components/Chat.tsx`
1. Add `onToggleSidebar` and `isMobile` props
2. Add hamburger `Menu` button in chat header (mobile only)
3. Import `Menu` from lucide-react
4. Hide combat/type badges on small screens (`hidden sm:flex`)
5. Reduce textarea max-height on mobile
6. Shorten placeholder text on mobile
7. Add `pb-safe` class to input container

### Phase 6: Testing & Polish
1. Test on 375px (iPhone SE), 390px (iPhone 14), 414px (iPhone Plus)
2. Test landscape mode
3. Test with mobile keyboard open
4. Test sidebar open/close animations
5. Verify touch targets ≥ 44px
6. Test safe-area insets (notched phones)

---

## 5. Tailwind Breakpoint Reference

| Prefix | Min Width | Use Case |
|--------|-----------|----------|
| (none) | 0px | Mobile-first base styles |
| `sm:` | 640px | Large phones / small tablets |
| `md:` | 768px | Tablets / sidebar breakpoint |
| `lg:` | 1024px | Desktop |
| `xl:` | 1280px | Large desktop |

**Primary responsive boundary: `md:` (768px)** — Sidebar switches from drawer to static at this point.

---

## 6. New Import Requirements

### Chat.tsx
```tsx
import { Menu } from 'lucide-react'; // ADD to existing import
```

### Sidebar.tsx
```tsx
import { X } from 'lucide-react'; // ADD to existing import (check if already imported)
```

### Dashboard.tsx
```tsx
import { cn } from '@/lib/utils'; // ADD if not already imported
```

---

## 7. Accessibility Considerations

1. All new interactive elements must have `aria-label` attributes
2. Sidebar drawer should trap focus when open on mobile (optional enhancement)
3. Escape key should close sidebar drawer
4. Backdrop click should close sidebar
5. Touch targets minimum 44x44px per WCAG 2.5.5
6. Input font-size ≥ 16px to prevent iOS auto-zoom

---

## 8. File Change Summary

| File | Type of Change | Priority |
|------|---------------|----------|
| `src/app/globals.css` | Add mobile CSS, drawer styles, touch overrides | P0 |
| `src/app/layout.tsx` | Add viewport config | P1 |
| `src/components/Dashboard.tsx` | Add mobile state, drawer wrapper | P0 |
| `src/components/Sidebar.tsx` | Responsive width, close button, touch targets | P0 |
| `src/components/Chat.tsx` | Hamburger button, responsive header, mobile input | P0 |
| `src/components/AuthProvider.tsx` | No changes | — |
| `src/app/page.tsx` | No changes | — |
