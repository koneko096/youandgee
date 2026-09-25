# Improvement Backlogs - youandgee

## 1. Design Responsiveness
- **Issue:** The design appears good on PC but is significantly degraded on tablet and mobile devices.
- **Impact:** Poor user experience on non-PC platforms.
- **Status:** Commits predating the offline-sync plan (`3228d80`, `2a87ea8`) addressed this. Not verified on a real device since — no browser tool has been available to whoever last touched this doc or this session's agent.

## 2. Print Receipt Rendering on Mobile
- **Issue:** Print receipts render as blank pages when viewed on mobile devices.
- **Impact:** Users are unable to view or print receipts from mobile.
- **Status:** Print CSS was touched again while adding receipt reprint from order history (`fcaf813`) — deliberately kept the existing per-page display:none approach rather than a generic visibility trick, specifically because this issue's history suggested that's fragile. Still not verified on a real mobile device.

## 3. Offline First Design
- **Issue:** App only run on single device database.
- **Impact:** Remote supplier cannot update the stock.
- **Solution:** Use offline first app with D1 remote database synced.
- **Status:** Implemented — see `docs/plans/2026-09-19-1740-feat-offline-pos-delivery-plan.md` and `llm/DEPLOY.md`. Products, orders, and stock movements all sync bidirectionally with conflict resolution; verified via automated tests and a direct production API check, but never against two real physical devices side by side.
