# Nest — Family Organiser (PRD)

## Original Problem Statement
Family organiser including: shared calendar, shopping list sortable by Australian supermarkets (Coles, Woolworths, Aldi, IGA, Foodworks), scannable shopping items, common items tracking, weekend planner, notes section, addable children, mum/dad login with Google SSO.

## User Choices (Feb 2026)
- Google SSO via Emergent-managed Google Auth
- Barcode scanning: Both camera-based and manual entry
- Shopping list: Both auto-suggest AND frequent items tracking
- Calendar integrated with Weekend view
- Design: Modern & organised dashboard (Soft Neo-Brutalism, Pastel)

## Architecture
- Backend: FastAPI + MongoDB (motor)
- Frontend: React 19 + Tailwind + shadcn/ui + lucide-react + @zxing/browser
- Auth: Emergent Google OAuth (session_token cookie + bearer fallback)
- Barcode data: Open Food Facts free API (no key required)

## User Personas
- **Parents (Mum, Dad)**: Login via Google, manage calendar/shopping/notes, add children
- **Children**: Profiles only (not login), assigned to events

## Core Requirements (Static)
1. Google SSO login for parents
2. Shared calendar (CRUD events, assign to family members)
3. Weekend planner view (Sat/Sun highlighted, part of calendar)
4. Shopping list grouped by supermarket, auto-suggest, barcode scan
5. Common item detection (frequently added items flagged)
6. Notes (sticky-note style, colors, per family)
7. Add/remove children with color-coded profiles
8. Family-scoped data isolation

## Implemented (Feb–Apr 2026)
- [x] Backend FastAPI with full CRUD for auth, family, events, shopping, notes, frequent items, barcode lookup
- [x] MongoDB models with UUID user_id/family_id (avoids _id issues)
- [x] Emergent Google OAuth flow with 7-day session tokens
- [x] React dashboard with Bento grid (Calendar 4-col, Shopping 2-col, Weekend 2-col, Notes 4-col, Family 6-col)
- [x] Soft Neo-Brutalism styling (Outfit/Figtree fonts, pastel accents, hard borders, sharp shadows)
- [x] Calendar with month navigation, weekend highlighting, per-day events, category colors
- [x] Shopping list with 5 supermarket chips (Coles/Woolies/Aldi/IGA/Foodworks + Any), auto-suggest dropdown, common-item badge, barcode scanner modal (camera + manual tabs)
- [x] Notes with color picker, editable, masonry grid
- [x] Add/remove children with color + age
- [x] Weekend planner card showing next Sat/Sun events
- **Iteration 2 (Apr 2026)**:
- [x] Parent invitation flow — shareable invite link (?invite=TOKEN) and copyable family code (NEST-XXXX)
- [x] Join-by-code (safety: only if current family has no data)
- [x] Family ID & editable family name (displayed & copy-to-clipboard)
- [x] Recurring events (daily/weekly/monthly with optional end date)
- [x] Event reminders (15m / 1h / 1day before) — toast + browser Notification
- [x] Shopping list templates (create/apply/delete, applies all items with frequent-item increment)
- **Iteration 3 (Apr 2026)**:
- [x] Recurring event exceptions — skip a single occurrence without affecting series
- [x] Edit single occurrence vs entire series (creates a standalone event + adds exception on original)
- [x] Multi-parent role permissions — only `is_owner` (family creator) can rename the family; Owner badge on parent card; joiners via invite/code are is_owner=False
- [x] Shopping list checkout mode — in-store grouped view with per-supermarket tabs, progress bar, big tap targets, finish-and-clear
- **Iteration 4 (Apr 2026)**:
- [x] Activity feed notifications — toasts when partner adds shopping/notes/events/meals (30s polling, family-scoped, `/api/activity?since=ISO`)
- [x] 1-tap skip-next-occurrence button on recurring events (no modal needed)
- [x] Transfer ownership to another parent (owner-only, with 403/404/400 guards)
- [x] Weekly **meal planner** — 7-day × 4-meal (breakfast/lunch/dinner/snack) grid, per-meal ingredients
- [x] Send-to-shopping — aggregates unique ingredients from meals in a date range to shopping list (tagged supermarket of choice)
- [x] Children can already be assigned to calendar events via existing `assigned_to` picker
- **Iteration 5 (Apr 2026)**:
- [x] Meal templates ("Taco Tuesday") — save reusable meal + ingredients; apply to any week/day/meal slot
- [x] Family activity log page at `/activity` — full timeline grouped by day, with `before` cursor pagination
- [x] Mobile swipe-to-check gesture in CheckoutMode (touch swipe right >70px = toggle item)
- [x] Radix DialogDescription added to all dialogs (a11y warnings cleared)
- **Iteration 6 (Apr 2026)**:
- [x] Migrated `@app.on_event("shutdown")` → `lifespan(app)` asynccontextmanager (FastAPI modern pattern)
- [x] Date-range validation on `/api/meals/to-shopping` — returns 400 when `start_date > end_date`
- [x] **Real-time WebSocket activity stream** at `/api/ws/activity` — per-family broadcast with cookie-or-`?token=` auth, 1008 close on invalid auth, hello-frame on connect, ping/pong keep-alive
- [x] Dashboard WS client with 25s heartbeat, 10s reconnect, graceful polling fallback when WS unavailable
- **Iteration 7 (Apr 2026)**:
- [x] Date-range validation also on GET `/api/meals` (returns 400 when `start_date > end_date`)
- [x] Structured logging in WS handler: replaced bare `except Exception: pass` with `logger_ws.warning/info` (connect, disconnect, send errors, receive errors, insert/broadcast failures) under `nest.ws` logger
- [x] Flagged Emergent ingress WS limitation: **confirmed** by platform support — WebSocket Upgrade is not supported on `*.preview.emergentagent.com`. Recommended alternatives: SSE, polling (currently active fallback), or contact `support@emergent.sh` for production WS
- [x] Tested live via curl: meals inverted=400, valid=200, no params=200. Backend lint clean.

## Backlog (P0/P1/P2)
### P1 (next iteration)
- Invite second parent to existing family (currently each Google login creates separate family_id)
- Drag-and-drop events between days
- Recurring events
- Shopping list templates (save a typical weekly list)
- Event reminders / notifications

### P2
- Shared meal planner (links to shopping list)
- Chore tracking per child with reward system
- Photos attached to notes/events
- Family budget tracking
- Add DialogDescription components (a11y)
- Open Food Facts response caching

## Next Tasks
- (Optional) Implement family invitation flow (generate invite link for second parent)
- (Optional) Add MongoDB index on user_sessions.session_token
- Move to lifespan context manager (replace deprecated @app.on_event shutdown)
