# ASG shared-workbook backend setup

The ASG page (sheet page 3) works out of the box as a browser-local draft.
These steps connect it to the shared Google Sheets workbook so the whole
group sees and edits the same Stash, HQ and Assignments. Players never sign
in with Google: the sheet asks for the shared group password, and only the
backend Google account ever talks to Google.

Architecture (approved 2026-11-18): a **split backend**.

1. **Vercel (existing gman-cyberpunk project) does only the password
   check.** `api/asg-auth.js` verifies the group password against a scrypt
   hash and mints a short-lived HMAC token. This reuses the GM screen's
   authentication pattern. No spreadsheet traffic passes through Vercel.
2. **A Google Apps Script web app does every spreadsheet read and write.**
   The browser posts straight to `script.google.com`; the script verifies
   the token and reads/writes the workbook as the backend Google account.

There is **no service account, no private key, and no Google Cloud
project**: the standalone script runs under the separate Google account
chosen for the backend, and the workbook's third-party owner shares the
workbook with that account as Editor. What the script can reach is exactly
what that Google account can reach, so keep the backend account's access
limited to this workbook.

Everything in the workbook stays normal, directly editable rows and cells:
the script reads and writes the same cells a person would, so the admin can
always open the spreadsheet and see or change the data by hand.

## 1. Create the seven tabs the backend expects

In the shared workbook, add seven tabs (exact names), each with the header
row below. Everything except the two admin-only tabs is also edited by the
backend on the players' behalf.

- **Roster** (admin-only) — the NPC roster. The ASG page never writes here.

  | id | role | number | skill | name | page_url |
  |----|------|--------|-------|------|----------|

  `skill` is 0-3. `name` and `page_url` are only set for named NPCs;
  `page_url` is the public page the sheet opens in the small window on
  double-click. Creating, deleting and editing NPCs happens only here.

- **Stash** — player-edited. One row per group and per item:

  | id | type | group | position | name | note |
  |----|------|-------|----------|------|------|

  `type` is `group` or `item`. Items point at their group by the group's
  `id`; `position` is the display order within the list. When renaming a
  group by hand, edit only the group row — items follow the id. When moving
  an item by hand, change its `group` cell to the target group's id.

- **HQ** — player-edited 0-15 values, exactly four rows:

  | category | value |
  |----------|-------|

  `supplies`, `culture`, `technology`, `security`.

- **HQ Upgrades** (admin-only) — the base upgrade slots:

  | category | name | note |
  |----------|------|------|

  `category` is one of the four above (case-insensitive); `note` is the
  hover tooltip text.

- **Future Upgrades** — player-edited, one planned upgrade per row (single
  column, no dashes needed):

  | line |
  |------|

- **Assignment Cards** — player-edited projects and gigs:

  | id | kind | position | number | name | description |
  |----|------|----------|--------|------|-------------|

  `kind` is `project` or `gig`; `position` is the display order; `number` is
  the stable card number shown in the UI.

- **Assignment Slots** — player-edited NPC assignments:

  | key | card | slot | npc | role |
  |-----|------|------|-----|------|

  `key` is `<card id>:<slot index>` (slots are 0-1 for projects, 0-3 for
  gigs); `npc` is a roster id (empty = unassigned); `role` is an optional
  required role for that gig position.

## 2. Share the workbook

Ask the workbook's owner to share it with the **backend Google account's
email address** as **Editor**, and copy the workbook's ID from its URL:
`https://docs.google.com/spreadsheets/d/<THIS LONG ID>/edit`.

## 3. Deploy the Apps Script web app (backend Google account)

Do this signed in as the separate backend Google account, not a personal
one.

1. Go to https://script.google.com/ and create a **New project** (a
   standalone script, not bound to the workbook).
2. Paste the contents of `apps-script/asg.gs` into the editor.
3. Open **Project Settings > Script Properties** and add:

   | Property | Value |
   |----------|-------|
   | `ASG_SHEET_ID` | the workbook ID from step 2 |
   | `ASG_TOKEN_KEY` | the random shared secret from step 4 below |

4. **Deploy > New deployment > Web app**: *Execute as* **Me**, *Who has
   access* **Anyone**. Authorize the script when Google asks (it needs the
   spreadsheets scope to open the shared workbook).
5. Copy the web app URL ending in `/exec`. Every redeploy after editing the
   script needs **Deploy > Manage deployments > edit > new version**,
   otherwise the old code keeps serving.

## 4. Choose the group password and the shared secret

Pick the shared group password. Make it strong: at least 12 characters and
not a word, name or phrase from the campaign. The online rate limit is
best effort only (see step 5), so the password itself is the real barrier.
Then generate its scrypt hash in the exact
format the Vercel endpoint expects (any machine with Node). Run this in
bash, zsh or sh exactly as written - the single quotes keep every `$`
literal, so the shell cannot rewrite the command:

```
node -e 'const c=require("crypto");const N=16384,r=8,p=1;const s=c.randomBytes(8).toString("hex");const h=c.scryptSync("THE-GROUP-PASSWORD",Buffer.from(s,"hex"),64,{N,r,p,maxmem:256*N*r}).toString("hex");console.log("ASG_PASSHASH=scrypt$"+N+"$"+r+"$"+p+"$"+s+"$"+h)'
```

On Windows use Git Bash or WSL; PowerShell and cmd.exe reinterpret the
quoting and `$` characters and would produce a corrupt hash.

Generate the shared token-signing secret:

```
node -e 'console.log("ASG_TOKEN_KEY="+require("crypto").randomBytes(32).toString("hex"))'
```

Only the hash and the random secret go into configuration; the password
itself is shared with the players directly, never stored anywhere in the
repo or workbook. The same `ASG_TOKEN_KEY` value goes in BOTH the Vercel
env (step 5) and the Apps Script Script Properties (step 3).

## 5. Configure the Vercel password gate (gman-cyberpunk)

In the Vercel project's Settings > Environment Variables, add:

| Name | Value |
|------|-------|
| `ASG_PASSHASH` | the `scrypt$...` value from step 4 |
| `ASG_TOKEN_KEY` | the shared secret from step 4 |
| `ASG_ALLOWED_ORIGIN` | optional; defaults to `https://aj-gman.github.io` |

Then redeploy the Vercel project. This endpoint only answers the sheet's
origin and never sees a spreadsheet cell. Wrong passwords are rate-limited
per IP with exponential backoff. Two honest limits: the limiter is best
effort (a bounded per-instance map, so a determined attacker with many
instances gets more tries - hence the strong password requirement above),
and the per-IP key trusts Vercel's documented behavior of overwriting
`x-forwarded-for` with the real client IP
(https://vercel.com/docs/edge-network/headers/request-headers).

## 6. Point the GitHub Pages site at the script

The Pages build reads `ASG_SCRIPT_URL` (see `src/site/_data/sheetApi.js`)
and emits it as `window.CYBERPUNK_ASG_SCRIPT_URL`. A GitHub Actions build
only sees variables the workflow maps, and `.github/workflows/pages.yml`
maps the repository variable `ASG_SCRIPT_URL` into the build step. So: in
the repo go to **Settings > Secrets and variables > Actions > Variables >
New repository variable**, name it `ASG_SCRIPT_URL`, paste the `/exec` URL
from step 3, then rerun the Pages workflow (Actions > Deploy GitHub Pages
> Run workflow) or push any change. While the variable is empty or absent,
the ASG page stays in browser-local draft mode and says the shared backend
is not configured.

## 7. Mandatory first live verification (do this before game night)

The browser-to-Apps-Script path relies on behavior Google does not
officially document for cross-origin use: the page POSTs with
`Content-Type: text/plain` (a CORS-simple request, so no preflight is
needed), the fetch follows the script's redirect, and the JSON response is
readable. This recipe is confirmed working by multiple independent
2024-2026 reports, but it is **not guaranteed by Google** and must be
verified once in the real deployment:

1. Finish steps 1-6, open the ASG page, tap **Connect shared workbook** and
   enter the group password.
2. Confirm the status line says the workbook is connected and the modules
   show the workbook's contents.
3. Make one edit and confirm it appears in the spreadsheet.
4. Note the round-trip time; the play-session polling rate assumes
   executions complete in about a second. If real latency is much higher,
   lower the session rate below.

If the connection fails at this step, stop and report it before the table
commits to this backend; do not ship workarounds (hidden iframes, JSONP)
without a security review.

## 8. Use it

Each player opens the sheet's ASG page, taps **Connect shared workbook**
and enters the group password. The password and the token live in memory
only: nothing credential-shaped is stored in the browser, so a page reload
asks for the password again. The status line above the modules says whether
the shared workbook is connected; without it, everything stays a
browser-local draft.

## How updates flow

The sheet polls the Apps Script web app: every 60 seconds when idle. Two
remote changes detected less than five minutes apart switch it into
play-session mode, where it refreshes every 8 seconds (proposed rate,
pending the live latency check in step 7); five minutes without another
change ends the session (each change resets that timer). The scheduled
Tuesday 17:30-00:00 (Europe/Bucharest) session also runs at the fast rate
for its whole window, no detection needed. A player's own saves never count
as detected changes.

Every poll is one script execution that returns the full state (a few KB).
Apps Script executions do not consume Sheets API quota, so there is no
change-detection gate: the page simply compares the returned state with
what it has and re-renders only when something actually changed.

Saves are granular: the page sends only the rows the player actually
changed (changed/added/deleted rows, keyed by id), and the script updates,
appends or blanks exactly those cells. Hand edits elsewhere in a tab are
never disturbed. Two players editing different things touch different
cells.

A burst of edits batches into one save 150ms after the last change (text
fields wait 800ms for a typing pause), and only one save is in flight at a
time. Transient failures (offline, unreachable) keep the edit in the
browser and retry every 15 seconds; permanent rejections (invariant or
invalid ops) are never retried - see Conflicts and invariants below.

## Conflicts and invariants

Every save runs under the script's LockService: read, validate, write,
atomically with respect to other saves through the backend. The script
rejects, server-side:

- an NPC assigned to more than one slot;
- a project with more than 2 slots filled or a gig with more than 4;
- an assignment to a card that does not exist (anymore).

A rejected save answers with the fresh full state plus the error, and the
page reverts exactly the rejected rows while keeping the player's other
pending edits (permanent rejections are never retried).

Writes are last-writer-wins at ROW granularity, not state granularity:
each save carries only the rows the player actually changed since their
last sync (one stash row per item/group, one row per card, one row per
occupied slot, one cell per HQ category, the future-upgrades text). Two
players editing DIFFERENT things at the same time do not overwrite each
other. Two players editing the SAME row converge on whoever saves last;
every open page rebases onto the winner's row on its next poll while
keeping its own unwritten rows.

The visible consequence to know about: DELETE vs UNSAVED EDIT resurrects
the row. If player A deletes a stash item (or a card) while player B has
an unsaved rename of that same row, B's page does not know about the
delete yet; when B's save lands after A's delete, the row is written back
with B's content, so the item reappears (renamed) on everyone's next poll.
Same for a slot row: clearing a slot while another player assigns it (or
marks it role-required) restores that slot row with the later content.
This is the intended reconciliation - a deleted-then-resurrected row is
removed again with one more delete - and it beats silently dropping either
player's action.

Hand edits made directly in the spreadsheet are NOT inside
that lock (LockService only serializes cooperating script executions), so
a hand edit can still break an invariant; the page renders the sheet's
truth on the next poll, which is the reconciliation path. All open pages
converge within one poll cycle (8 seconds during a session, 60 seconds
idle) because every response carries the fresh full state.

## Costs

- Apps Script: a no-charge Google service; a standalone script requires
  no Cloud project that you create or manage (Apps Script keeps its own
  hidden default project) and no billing. Relevant quotas from the
  published table: 6 minutes max per execution (ours should take about a
  second) and 30 simultaneous executions per user (a 6-player table peaks
  near 1). The published table lists no daily cap on web-app invocations.
  (https://developers.google.com/apps-script/guides/services/quotas)
- Vercel: only the password check runs there - one call per player per
  session (plus a rare token re-mint after 12 hours). The free Hobby plan
  currently includes the first 1,000,000 function invocations per month;
  the ASG volume is a handful per day. Check the linked page for the
  current number. (https://vercel.com/docs/plans/hobby)

## Security notes

- The token is a bearer credential: anyone holding it can read and write
  the workbook through the script until it expires (12 hours). It is
  minted only after the scrypt password check, is kept in page memory
  only, and is sent only to `script.google.com` over HTTPS.
- The group password is never sent to or stored by Apps Script; it goes
  only to the Vercel endpoint over HTTPS and is kept in page memory only.
- Wrong passwords are rate-limited per IP by the endpoint's in-memory
  backoff. This change configures no Vercel WAF rule, and a dashboard rule
  scoped to `/api/gm/*` would not cover `/api/asg-auth*`; add one in the
  Vercel dashboard if you want that extra layer.
- The Apps Script web app is reachable by anyone with its URL, but every
  action requires a valid token signed with `ASG_TOKEN_KEY`; a leaked
  `/exec` URL alone grants nothing.
- Rotate access by changing the group password (new `ASG_PASSHASH`) and/or
  the `ASG_TOKEN_KEY` in both places.

## Not settled yet

- Migrating the existing compound stash tab (stash items, roster/jobs,
  base) into the tabs above is a manual, one-time task; this change does
  not touch the existing tab.
- The 8-second play-session rate is a proposal pending the live latency
  check in step 7.
