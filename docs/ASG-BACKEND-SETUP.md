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

## Privacy boundary in v1.3.1.3

The backend uses the **Advanced Sheets API with `drive.file`**, not the
account-wide SpreadsheetApp service. Google permits this app to access only
files explicitly selected for it (or created by it). Select only the existing
ASG workbook. `ASG_SHEET_ID` plus `ASG_SELECTED_SHEET_ID` also form a server-side
allowlist; callers cannot choose another workbook. Access covers the entire
workbook, including History, not one tab. Do not select extra files later.

There is no service account or service-account private key. This design does
require a standard Google Cloud project for the one-time Google Picker setup.
It does not require moving the existing workbook or sharing it publicly.
Google's file grant still permits modifying or deleting a selected file in
principle; this application implements only the documented cell/tab operations.

If upgrading from v1.3.1.2: archive every older active web-app deployment and
remove the exact ASG app connection in Google Account > Security > connections
to third-party apps and services. Preserve the script project and properties.
An edited manifest alone is not evidence that an old broad grant was removed.
Do not redeploy the old code or re-grant account-wide Sheets/Drive access.

Everything in the workbook stays normal, directly editable rows and cells:
the script reads and writes the same cells a person would, so the admin can
always open the spreadsheet and see or change the data by hand.

## 1. Create the seven tabs the backend expects

In the shared workbook, add seven tabs (exact names), each with the header
row below. Everything except the Roster tab is also edited by the
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

- **HQ Upgrades** — player-edited upgrade slots after the explicit migration:

  | category | name | note | id | position |
  |----------|------|------|----|----------|

  `category` is one of the four lowercase values above; `note` is the hover
  tooltip text. `id` is unique and stable; `position` is zero-based within
  its category. Existing A:C workbooks stay readable but upgrades are
  read-only until migrated. Follow [ASG-UPGRADE-ROLLOUT.md](ASG-UPGRADE-ROLLOUT.md)
  for the explicit backup, dry run, migration and deployment order. Do not
  simply add empty D:E headers to an existing populated workbook.

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

- **Assignment History** (GM record, created automatically) — one row per
  completed gig or project, written when a player presses **Completed** and
  answers *Successful* or *Failed*:

  | id | kind | number | name | description | result | completed_at | crew | status |
  |----|------|--------|------|-------------|--------|--------------|------|--------|

  `result` is `success` or `failed`; `completed_at` is UTC (ISO); `crew` lists
  the assigned NPCs (with required gig roles) at completion; `status` is
  `pending` while a completion is being applied and `done` once the card and
  its slots are removed (a blank status in an older row counts as done). The
  card leaves the players' view and its NPCs return to Available. The players'
  page never reads this tab. You may create it yourself with the header above,
  or let the first completion create it.

  Google Sheets writes are not transactions, so a completion is **not**
  all-or-nothing. The script writes the row as `pending`, clears the card's
  slots and then the card, and marks the row `done`. If a write fails in
  between, the row stays `pending` and the next load or save finishes the
  removal from that row; a half-cleared card can be visible until then. The
  card id identifies the completion, so repeating it is safe, and the first
  recorded result is kept (a retry with the other answer does not change it).
  The page only offers **Completed** against a script that does this, so after
  updating `asg.gs` you must redeploy it (step 3, **new version**).

## 2. Share the workbook

Ask the workbook's owner to share it with the **backend Google account's
email address** as **Editor**, and copy the workbook's ID from its URL:
`https://docs.google.com/spreadsheets/d/<THIS LONG ID>/edit`.

## 3. Install file-only code and privately select the workbook

Do these account actions yourself, with guidance if needed. No automated
account changes or deployments are part of publishing the source commit.

1. Keep the existing standalone ASG Backend project. Replace Code.gs with
   `apps-script/asg.gs`. Add an HTML file named `Setup` containing
   `apps-script/Setup.html`. Show the manifest through Project Settings and
   replace appsscript.json with `apps-script/appsscript.json`.
2. Verify Overview > Project OAuth Scopes shows **drive.file plus userinfo.email**. It must
   not request broad `spreadsheets`, `drive`, Gmail, or read-only account-wide
   scopes. The email scope is necessary for the owner identity check. Stop if the actual prompt differs.
3. Create/select a standard Google Cloud project and associate it with this
   Apps Script project in Project Settings. Configure the OAuth consent screen
   for your own account. Enable **Google Sheets API** and **Google Picker API**.
   Enable the Sheets v4 advanced service in Apps Script (the manifest names it).
   Changing Cloud-project association changes the OAuth identity, so selection
   and authorization must use the same associated project throughout.
4. Create a browser API key for Picker in that Cloud project, restrict its API
   access to Google Picker API, and set website referrers to `*.google.com` and
   `*.googleusercontent.com` per Google's Apps Script Picker guide. Never paste
   API keys, OAuth tokens, group passwords or signing keys into chat or Git.
5. Preserve `ASG_SHEET_ID` (the existing workbook ID) and `ASG_TOKEN_KEY` (same
   private random secret later used in Vercel). Add these Script Properties:

   | Property | Value |
   |----------|-------|
   | ASG_OWNER_EMAIL | your exact signed-in main Google account email |
   | ASG_CLOUD_PROJECT_NUMBER | numeric project number, not project ID |
   | ASG_PICKER_API_KEY | restricted browser API key from step 4 |
   | ASG_SETUP_ENABLED | true, temporarily |

6. Use **Deploy > Test deployments > Web app** to obtain the editor-only `/dev`
   test URL. Open it yourself, signed in as the script owner, with `?setup=1`.
   Do not put this setup URL on the player page. The setup checks BOTH the
   active user and executor against ASG_OWNER_EMAIL and fails closed when
   Google supplies no active-user email. If setup is denied, stop, do not weaken
   the check or expose OAuth tokens through a public fallback.
7. Authorize only the requested file-specific permission and owner email identity. Click **Select ASG
   workbook**, pick the existing ASG workbook, and verify it is the intended
   file. Picker, not a pasted ID, grants the app file access. Selection is
   rejected unless its ID equals ASG_SHEET_ID. Successful selection records
   ASG_SELECTED_SHEET_ID and automatically sets ASG_SETUP_ENABLED to false.
   Close the setup window. Verify the property is false without sharing
   property screenshots. Keep the private setup disabled.
8. Before a player deployment, perform the permission checks below. The
   owner-only Picker integration and actual consent flow remain **unverified
   until run on the real account**. A source commit is not a successful setup.
9. Once checks pass, deploy a **new version** as Web app, **Execute as: Me**,
   **Who has access: Anyone**. This opens only the token-gated endpoint, not
   workbook Drive sharing. Keep old broad-scope versions archived. Copy its
   `/exec` URL for step 6. Do not use `/dev` on the player page.

### Required privacy checks

- Confirm the old broad grant is removed and fresh consent is file-specific.
- Verify selected ASG values load and a reversible test edit writes correctly.
- Test journal recovery and history recording with disposable ASG test data.
- Using only a separately approved, non-sensitive test workbook that was NOT
  selected for this app, verify a direct Advanced Sheets read is denied. Do not
  inspect another private workbook as a test. Local allowlist tests alone do
  not prove Google's grant boundary.
- Verify the private setup URL and each setup RPC reject anonymous and other
  accounts, even if ASG_SETUP_ENABLED was accidentally true. The player endpoint
  must never return a Google OAuth token, Picker key or saved property values.
- Disable setup, then verify normal player loads/saves without Google sign-in.

References: [file scopes](https://developers.google.com/workspace/sheets/api/scopes),
[Picker requirements](https://developers.google.com/apps-script/guides/dialogs#file-open_dialogs),
[advanced services](https://developers.google.com/apps-script/guides/services/advanced).

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
The Advanced Sheets API **does consume Sheets API quota**. Each ordinary load
uses one batched snapshot read, shared across all modules. Five open players at
8-second polling produce approximately 37.5 reads/minute before saves, setup,
other callers and retries. The published per-user/project read limit is 60/min;
this estimate is headroom, not a capacity guarantee. Saves also need a snapshot
and writes, and completions use several journal phases. Quota failures return
rate_limited; stop/reduce load rather than promising 8 seconds under all traffic.
The page compares snapshots and re-renders only when something changed.

Saves are granular: the page sends only the rows the player actually
changed (changed/added/deleted rows, keyed by id), and the script batches granular RAW value writes to update,
append or blank exactly those cells. Formula-looking input stays text. Hand edits elsewhere in a tab are
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

## Costs and quotas

Advanced Sheets API quotas now apply: 60 read and 60 write requests per minute
per user/project, and 300 each per project, according to the current published
table. All execute-as-me players share the owner's quota. Standard API use is
listed at no additional cost; Google's current page also warns that over-quota
charges are planned later in 2026. Check current terms and project billing before
changing quota or enabling paid services. Do not enable billing, request paid
quota or buy capacity as part of setup without approval.

Apps Script runtime quotas also remain. The 8-second fast poll is retained at
the user's request for at most five concurrent users, subject to the mandatory
real latency/quota test. Keep idle polling at 60 seconds. Do not claim verified
performance before testing. Sources:
https://developers.google.com/workspace/sheets/api/limits and
https://developers.google.com/apps-script/guides/services/quotas .

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
- The user selected 8-second play-session polling for at most five concurrent
  users. Live latency and quota headroom still need checking in step 7.
