# ADR 007: Single-Page Application Architecture (Next.js SPA)

- **Status**: Accepted
- **Date**: 2025-01-15
- **Deciders**: Engineering Team, Architecture Owner

## Context

GARFIX EOS needs a frontend architecture that supports:

1. **Complex interactive UI**: Multi-module dashboard with real-time updates, charts, modals, and AI chat bubbles
2. **Authentication state**: Auth context must persist across navigation without page reloads
3. **PWA requirements**: Service worker caching, offline support, and install prompt require a SPA-like experience
4. **MENA UX**: Arabic-first RTL layout with smooth transitions between views
5. **Performance**: Sub-second view transitions for daily-used business application

The team considered traditional multi-page (MPA), SPA, and hybrid approaches using Next.js capabilities.

## Decision

We use **Next.js as a Single-Page Application (SPA)** with the following architecture:

1. **Single root page** (`src/app/page.tsx`): The landing page when unauthenticated, and the authenticated app shell when logged in.
2. **Client-side navigation**: All module views (invoices, clients, accounting, etc.) are rendered client-side within the AppShell component. No page reloads for navigation.
3. **API routes**: All data operations use Next.js API routes (`/api/*`), which run server-side with full database access.
4. **Authentication**: Client-side `AuthContext` manages session state; API routes validate tokens.
5. **PWA manifest**: Service worker caches the app shell for offline access.

The app shell pattern:
```
src/app/page.tsx (root)
  → LandingPage (unauthenticated)
  → AppShell (authenticated)
      → Sidebar + Topbar (navigation)
      → Dynamic view rendering (invoices, clients, etc.)
```

## Consequences

### Positive
- Smooth, fast view transitions — no page reloads
- Auth context persists across navigation
- PWA-friendly — entire app can be cached as one shell
- Simpler deployment — one page to cache and optimize
- Real-time updates (WebSocket/polling) work naturally within SPA

### Negative
- Initial load may be heavier (entire app shell + all module code)
- SEO limited — landing page is the only server-rendered page; authenticated views are client-only
- Code splitting must be manual — lazy loading module views to reduce initial bundle
- Browser history management is manual — URL path changes without page reloads need careful handling

### Neutral
- Landing page remains server-rendered for SEO and first-load performance
- API routes handle all CRUD operations — frontend never touches the database directly
- Module views are loaded dynamically based on current navigation state

## Alternatives Considered

| Alternative | Pros | Cons | Decision |
|---|---|---|---|
| **Next.js SSR/SSG pages** | SEO-friendly; fast first load | Auth state resets on page navigation; slow transitions | Rejected — auth disruption between pages |
| **Next.js App Router with layouts** | Native routing; nested layouts | Still causes page reloads between major sections; PWA complications | Rejected — doesn't match SPA UX needs |
| **Pure React SPA (Vite/CRA)** | Lightweight; fast | No server-side API routes; need separate backend | Rejected — Next.js API routes are integral |
| ** Remix** | Progressive enhancement; good routing | Less PWA-friendly; smaller ecosystem | Rejected — team expertise is Next.js |
| **Next.js hybrid (SSR landing + SPA app)** | SEO + SPA UX | Complex to maintain two patterns | Accepted — current approach uses this hybrid |
