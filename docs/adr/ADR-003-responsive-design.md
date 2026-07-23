# ADR-003: Responsive Design Strategy

## Status: Accepted

## Context
Original module components used fixed-width layouts and inline styles with no responsive breakpoints. This makes the application unusable on mobile/tablet devices — critical for MENA market where mobile usage is dominant.

## Decision
1. Add sm/md/lg Tailwind breakpoints to all module views
2. Convert inline styles to Tailwind classes systematically
3. Use responsive grid layouts: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
4. Mobile-first approach: flex-col sm:flex-row, hidden md:block

## Consequences
- Application now usable on all device sizes
- Consistent spacing with progressive padding: p-2 sm:p-4 md:p-6
- Tables show card view on mobile, full table on desktop
- Reduced inline style count from 1300+ to near-zero
