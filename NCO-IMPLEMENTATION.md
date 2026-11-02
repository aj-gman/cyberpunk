# NCO sheet: review items 2-13

## Scope

This PR fixes review items 2-13. Item 1, authentication and per-character edit permissions, is deliberately excluded. Revision checks prevent accidental stale writes; they do not authenticate a player. No existing character JSON or map files are changed.

## Implementation plan and behavior

2. Rebuild the complete trauma list when loading. Clear old marks and recalculate Humanity.
3. Prefer the complete flaws array. Use legacy two-field saves only as a fallback.
4. Preserve Hits marks on resize; ask before removing a marked pip. Capacity limits are no-ops.
5. Resolve gear X behavior from its current list: return carried gear, confirm before deleting stashed gear.
6. Validate versioned character shapes before changing the sheet. Preserve legacy v1 fields. Reject unsupported versions and identify the bad field.
7. Load/save the GitHub file revision and reject stale or missing revisions. Serialize storage operations, protect edits made during a request, show dirty/last-save feedback, warn on navigation/replacement, and offer a browser-local recovery draft. Keep JSON export available as a backup.
8. Correct rule destinations using the deployment root. Cyberpsychosis points to Cyberpsychosis Symptoms as requested. Leave the currency label unlinked rather than inventing a destination.
9. Add an explicit Affects Humanity checkbox. Only marked traumas with this flag lower the maximum. Newly added traumas start unflagged. Legacy saved traumas retain the previous Humanity effect until the player changes the flag. Show the derived maximum.
10. Wrap phone navigation and trackers, stack mobile gear/trauma cards, and keep storage controls reachable.
11. Remove only blank inactive condition/trauma rows. Recalculate Humanity after cleanup.
12. Use named keyboard-operable hit, Drive and trauma buttons with pressed state. Trap storage-dialog focus, support Escape and return focus. Make the Cyberpsychosis bar use the full 0-20 scale.
13. Add synthetic DOM and mocked API regression tests. Optional later convenience features (character picker, undo, touch reorder and a separate cyberware-use action) are deferred as recommended by the review.

## Verification and deployment notes

- New tests run with `npx vitest run NCO-sheet.test.js`. They never access production characters or send cloud-save requests.
- Browser checks cover 320px, 390px and desktop layouts with synthetic long names and gear.
- Build with `SITE_PATH_PREFIX=/cyberpunk/ SITE_BASE_URL=https://aj-gman.github.io npm run build`.
- Existing unrelated failing suites are not changed by this PR.
- Deploy the updated API and sheet together. Cached older sheets cannot save without a revision; reload the page. For an existing character, load its cloud version before saving. Importing a JSON file does not claim a cloud revision: keep that JSON backup, then load the cloud character before reconciling changes, or save under a new unused ID.
- Recovery is browser-local, not cross-device and not guaranteed in private browsing or when storage is blocked. The sheet reports storage failure and recommends a JSON backup. Recovery data remains on the device until a clean cloud save or explicit browser-storage clearing.
- Passwords, accounts, edit permissions, admin assignment and password recovery are not implemented. Cloud writes remain unauthenticated until item 1 is addressed separately.
