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
- [x] Tested: backend 35/35 in-scope, 4/4 recurring regression tests green, all frontend flows verified

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
