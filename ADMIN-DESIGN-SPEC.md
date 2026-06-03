# PHS Admin — Locked Design Spec ("Italian car" build)

This is the **single source of truth** for the admin panel UI (`admin.js`, `admin.css`).
Do not improvise taste. Apply this exactly. If a screen deviates from this spec, it is a bug.

Design north star: **a well-made Italian car dashboard** — taut, precise, fast, confident,
premium materials, nothing wasted. Quiet by default, alive on interaction. Think Linear's
restraint + a tachometer's drama for the one hero moment.

Files stay in sync across three copies: root, `/admin`, `/public/admin`.

---

## 0. NON-NEGOTIABLE RULES (these are what make it stop looking like AI slop)

1. **One header for every tab.** Every tab renders the SAME `PageHeader` (title + one-line
   subtitle). No per-tab hero variations, no cards in the header, no buttons in the header body.
2. **DELETE all vanity metrics.** The `"N fields / N tools / N staged"` chips, the
   `renderWorkspaceBanner`, the in-body `Preview / Command / Refresh` cluster, and the
   `"Schedule control · No draft changes"` pills are all DELETED. They mean nothing to a user.
3. **Every value comes from a token.** No hardcoded hex, px radius, or px spacing in new code.
   If two tabs render a different gray, that is a bug.
4. **One accent, used sparingly.** Accent = primary action + active nav + active state ONLY.
   Never decorative. No second accent, no gradients except the ONE ring gradient (§4).
5. **No emoji as UI. One SVG line-icon set** (reuse the existing `ICON` map, 1.6–1.7 stroke).
6. **Re-render discipline.** In-tab edits update only the changed node. `scrollTo(0)` happens
   ONLY on a real tab switch, never on an edit. (Fixes the scroll-jump bug.)
7. **`prefers-reduced-motion`**: all transforms/animations collapse to opacity-only or none.

---

## 1. TOKENS (already defined in admin.css `:root` — REUSE, do not redefine)

Use these exact variables everywhere:

- Surfaces: `--bg-0` (app bg), `--bg-1` (raised), `--bg-2` (card), `--bg-3` (inset)
- Text: `--fg-0` (headings), `--fg-1` (body), `--fg-2` (muted), `--fg-3`/`--fg-4` (faint)
- Lines: `--line` (hairline), `--line-strong` (emphasis), `--line-focus` (focus ring)
- Accent: `--accent`, `--accent-soft`
- Status: `--success`, `--warning`, `--danger` (only on real status, never decoration)
- Radius: `--r-xs:6` `--r-sm:8` `--r-md:10`. Add `--r-lg:14` and `--r-xl:20` for hero/ring card.
- Spacing: `--space-1..6` (4→24). Add `--space-7:32` `--space-8:48` for section rhythm.
- Motion: `--motion-fast:100` `--motion-med:160` `--motion-slow:220`;
  `--ease-out: cubic-bezier(0.16,1,0.3,1)` (the "settle"), `--ease-inout`.
- Add one shadow scale (light/dark already differ via `--shadow-soft`):
  `--shadow-1: 0 1px 2px color-mix(in srgb, var(--gray-9) 8%, transparent);`
  `--shadow-2: 0 4px 16px color-mix(in srgb, var(--gray-9) 10%, transparent);`
  `--shadow-3: var(--shadow-soft);` (lift on hover / hero)

**Type scale (lock it):** 12 / 13 / 14(base) / 16 / 20 / 28 / 40 / 56.
Hierarchy is done with size+weight+color, NOT boxes. Weights: 400 body, 500 labels,
600 section titles, 700 page title, 800 hero numerals. `font-variant-numeric: tabular-nums`
on every number that updates (countdowns, counts, times).

---

## 2. CORE COMPONENTS (build once, use on EVERY tab)

### 2.1 PageHeader — the only header
```html
<header class="ad-pagehead">
  <div class="ad-pagehead__text">
    <h1 class="ad-pagehead__title">Schedule</h1>
    <p class="ad-pagehead__sub">Plan future dates, change today, and edit reusable bell templates.</p>
  </div>
</header>
```
```css
.ad-pagehead{display:flex;align-items:flex-start;justify-content:space-between;
  padding:var(--space-7) 0 var(--space-5);border-bottom:1px solid var(--line);margin-bottom:var(--space-7);}
.ad-pagehead__title{font-size:28px;font-weight:700;letter-spacing:-.02em;color:var(--fg-0);margin:0;}
.ad-pagehead__sub{font-size:14px;color:var(--fg-2);margin:6px 0 0;max-width:64ch;line-height:1.5;}
```
The global top-bar (theme toggle · Discard · Publish) is the ONLY action cluster. Keep it.
Per-tab page bodies contain ONLY content sections — never their own header chrome.

### 2.2 Card — the only container
```css
.ad-card{background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r-lg);
  padding:var(--space-6);box-shadow:var(--shadow-1);
  transition:box-shadow var(--motion-med) var(--ease-out),border-color var(--motion-med) var(--ease-out);}
.ad-card--interactive:hover{box-shadow:var(--shadow-2);border-color:var(--line-strong);}
.ad-card__title{font-size:16px;font-weight:600;color:var(--fg-0);margin:0 0 var(--space-1);}
.ad-card__hint{font-size:13px;color:var(--fg-2);margin:0 0 var(--space-5);line-height:1.5;}
```
Sections default to a plain block with a 600/16px title + hairline divider. Only wrap in
`.ad-card` when the content is a distinct object (a form group, the planner, a list). Do NOT
nest cards. Do NOT make a card just to hold one sentence.

### 2.3 Field — one row style
```css
.ad-field{display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-5);}
.ad-field__label{font-size:13px;font-weight:500;color:var(--fg-1);}
.ad-field__help{font-size:12px;color:var(--fg-3);line-height:1.4;}
.ad-input,.ad-select,.ad-textarea{width:100%;background:var(--bg-1);color:var(--fg-0);
  border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px;font:inherit;
  transition:border-color var(--motion-fast) var(--ease-out),box-shadow var(--motion-fast) var(--ease-out);}
.ad-input:focus-visible,.ad-select:focus-visible,.ad-textarea:focus-visible{outline:none;
  border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);}
```

### 2.4 Button — one style, three intents
```css
.ad-btn{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;
  border-radius:var(--r-sm);font-size:14px;font-weight:500;cursor:pointer;border:1px solid transparent;
  transition:transform var(--motion-fast) var(--ease-out),background var(--motion-fast) var(--ease-out),
    box-shadow var(--motion-fast) var(--ease-out);}
.ad-btn:active{transform:translateY(1px);}            /* the "mechanical" press */
.ad-btn--primary{background:var(--accent);color:#fff;box-shadow:var(--shadow-1);}
.ad-btn--primary:hover{box-shadow:var(--shadow-2);filter:brightness(1.04);}
.ad-btn--ghost{background:var(--bg-1);color:var(--fg-1);border-color:var(--line);}
.ad-btn--ghost:hover{border-color:var(--line-strong);background:var(--bg-2);}
.ad-btn--quiet{background:transparent;color:var(--fg-2);}
.ad-btn--quiet:hover{color:var(--fg-0);background:var(--bg-1);}
.ad-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;}
```

### 2.5 Segmented control (for Reusable-schedule tabs, preview modes)
One pill track, sliding accent indicator (transform, not re-paint):
```css
.ad-seg{display:inline-flex;background:var(--bg-1);border:1px solid var(--line);
  border-radius:var(--r-sm);padding:3px;gap:2px;}
.ad-seg button{height:30px;padding:0 12px;border:0;background:transparent;color:var(--fg-2);
  font:inherit;border-radius:6px;cursor:pointer;transition:color var(--motion-fast) var(--ease-out);}
.ad-seg button[aria-selected="true"]{color:var(--fg-0);background:var(--bg-2);box-shadow:var(--shadow-1);}
```

---

## 3. THE SIGNATURE MOMENT — Bell Countdown Gauge (port from main site)

This is the ONE place we go dramatic. It is the hero of the **Today** tab and ties the admin to
the public site. Port the public site's ring (`main.css` `.ring-wrap` / `.progress-ring` /
`.glass-circle`) into the admin as a **live next-bell gauge** — a tachometer for the school day.

Behavior:
- SVG ring, 200–220px. Track stroke `var(--line)`; fill stroke uses a gradient `#adminRingGrad`
  from `var(--accent)` → `color-mix(in srgb, var(--accent) 55%, #fff)`.
- `stroke-linecap:round; stroke-width:3;` fill animates via `stroke-dashoffset` with
  `transition: stroke-dashoffset 1s var(--ease-out)` so it sweeps as the minute progresses.
- Soft glow on the fill: `filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent), transparent 40%))`.
- Inside the ring (glass disc): the **time to next bell** in 800-weight tabular-nums (e.g. `5h 42m`),
  with a 12px uppercase muted label above ("NEXT BELL") and the period name below
  ("Period 1 · 7:45 AM"). Numerals use `letter-spacing:-.03em`.
- Glass disc material: `background: color-mix(in srgb, var(--bg-2) 70%, transparent);
  backdrop-filter: blur(12px); border:1px solid var(--line);
  box-shadow: inset 0 1px 0 color-mix(in srgb,#fff 30%,transparent), var(--shadow-2);`
- Mount: a JS tick (reuse the main-site clock cadence — 1s active) updates the numeral and the
  dashoffset. Recompute % through the current period. If no school today, ring sits at rest
  (track only) and the disc reads "No bells today".
- Respect reduced-motion: keep the number, drop the sweep transition.

The Today hero = the gauge on the right, and on the left: big day title ("Friday, May 29 ·
Normal Schedule"), override state line, and 3 quiet quick-action ghost buttons (Plan schedule /
Edit announcements / Preview→Publish). This is the only screen allowed a hero. Everything else
is calm sections.

Do NOT scatter the ring or glass blur elsewhere — its scarcity is what makes it premium.

---

## 4. MOTION SYSTEM ("taut, not bouncy")

All motion uses `--ease-out` (the cubic-bezier settle) and the motion tokens. Fast and decisive.

- **Tab enter:** the page body fades in + rises 8px, sections staggered 30ms each.
  `@keyframes ad-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`
  Apply `animation: ad-rise var(--motion-slow) var(--ease-out) both;` with
  `animation-delay` of `calc(var(--i) * 30ms)` set per section. Cap stagger at ~6 items.
- **Hover lift:** cards/buttons raise shadow one step over `--motion-med`. Never scale text.
- **Press:** buttons `translateY(1px)` on `:active` (mechanical feel).
- **Active nav:** a 2px accent bar on the left of the active item that slides
  (`transform: translateY`) between items, not a hard repaint.
- **Numbers:** countdown numeral changes are instant (tabular-nums prevents reflow). The ring
  sweep is the only thing that animates continuously.
- **Calendar date select:** the selected cell gets an accent ring via box-shadow transition —
  NO full calendar rebuild, NO scroll change.
- Durations: micro = `--motion-fast`, state = `--motion-med`, enter = `--motion-slow`.
  Nothing slower than 260ms. No ease-in-out on enters (feels sluggish). No bounce/elastic.
- **reduced-motion:** wrap all `@keyframes`/transition transforms in
  `@media (prefers-reduced-motion: no-preference)`; default to opacity-only.

---

## 5. PER-TAB CONTRACT (consistency is the whole point)

Every tab = `PageHeader` + content sections built from §2 components. No exceptions.

- **Today:** the only hero (§3 gauge + day summary). Below: a single 4-up quiet stat row
  (Live today / Override / Unpublished / Last publish) as plain bordered cells, NOT cards,
  NOT colored. This replaces all 8 old "insight" widgets.
- **Schedule:** §3 has no place here; just `PageHeader` → Planner card → Active-override card
  → Reusable-schedules card → Image-import card. The planner calendar keeps scroll on select.
- **Availability / Site / Privacy / Advanced:** `PageHeader` → form sections (§2.2/2.3).
  A warning appears ONLY inline next to the offending field, never as a standing banner.
- **Announcements:** `PageHeader` → list of announcement cards (drag handle, show/expire dates).
- **History:** `PageHeader` → audit list + backup list, same card/list style.
- **Jarvis:** `PageHeader` → chat surface using the same input/button tokens.

After this pass, screenshot all 8 tabs. They must be visually interchangeable in style —
swap any two headers and you can't tell. If you can tell, it's not done.

---

## 6. ACCESSIBILITY & QUALITY GATE (self-verify before "done")

- AA contrast in BOTH themes. `:focus-visible` ring on every interactive element.
- Full keyboard nav; ⌘K palette opens/searches/navigates. Touch targets ≥36px (44px on mobile).
- Mobile: sidebar collapses, hero stacks (gauge under summary), planner scrolls horizontally if needed.
- No console errors on load or on the save→preview→publish loop.
- Verify list: identical PageHeader on all 8 tabs ✓ · zero vanity chips/banners anywhere ✓ ·
  gauge ticks + sweeps on Today ✓ · selecting a calendar date does NOT scroll to top and does
  NOT rebuild the tab ✓ · tab-enter stagger plays once ✓ · reduced-motion kills transforms ✓ ·
  dark + light both look deliberate ✓ · all three file copies in sync ✓.

---

## 7. STEP ZERO — BUILD TWO "TODAY" VARIANTS FIRST, THEN STOP FOR APPROVAL

Before migrating any other tab, build the **Today** tab TWO ways and screenshot both
(light + dark). Do NOT touch the other 7 tabs yet. The user will pick a direction.

- **Variant A — "Calm + one hero" (recommended):** plain `PageHeader` (§2.1), then the
  §3 ring gauge as the single hero, then the quiet 4-up stat row (plain bordered cells).
  All motion is the §4 system + the ring sweep. This is the only animated moment.
- **Variant B — "Unified animated header":** a hero header band WITH a subtle animation
  (e.g. the public site's ambient drift, toned down) that will be applied IDENTICALLY to
  all tabs. NO vanity chips, NO per-tab unique headline — same structure everywhere. The
  ring gauge still appears below on Today.

Both variants must obey §0 (no vanity chips, one accent, tokens only). Deliver 4
screenshots (A light, A dark, B light, B dark) and pause. Migrate the other tabs only
after the user picks A or B.

---

## 8. RING GAUGE — EXACT IMPLEMENTATION (port from public site, don't guess the math)

The public site computes the ring in main.js (~line 2140): for the current period,
`pctRemaining = clamp(1 - elapsed/total, 0, 1)`, then `strokeDasharray = "${pctRemaining*100} 100"`.
Reuse that exact model. The schedule for a date comes from the same data the public site
reads — get today's period list (start/end seconds + names) via the existing resolver
(`_getScheduleDataForDate` / `_getPeriodEntries` logic, or data.json directly). Replicate a
SMALL self-contained version in admin.js; do not import main.js.

### Markup (admin Today hero)
```html
<div class="ad-gauge" role="img" aria-label="Time until next bell">
  <svg class="ad-gauge__ring" viewBox="0 0 120 120">
    <defs>
      <linearGradient id="adminRingGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0"  stop-color="var(--accent)"/>
        <stop offset="1"  stop-color="color-mix(in srgb, var(--accent) 55%, #ffffff)"/>
      </linearGradient>
    </defs>
    <circle class="ad-gauge__track" cx="60" cy="60" r="54" pathLength="100"/>
    <circle class="ad-gauge__fill"  cx="60" cy="60" r="54" pathLength="100"
            transform="rotate(-90 60 60)"/>
  </svg>
  <div class="ad-gauge__disc">
    <span class="ad-gauge__eyebrow">NEXT BELL</span>
    <span class="ad-gauge__value" data-gauge-value>5h 42m</span>
    <span class="ad-gauge__period" data-gauge-period>Period 1 · 7:45 AM</span>
  </div>
</div>
```

### CSS
```css
.ad-gauge{position:relative;width:220px;height:220px;display:grid;place-items:center;}
.ad-gauge__ring{position:absolute;inset:0;width:100%;height:100%;}
.ad-gauge__track{fill:none;stroke:var(--line);stroke-width:5;}
.ad-gauge__fill{fill:none;stroke:url(#adminRingGrad);stroke-width:5;stroke-linecap:round;
  stroke-dasharray:100 100;stroke-dashoffset:0;
  filter:drop-shadow(0 0 6px color-mix(in srgb,var(--accent),transparent 45%));
  transition:stroke-dasharray 1s var(--ease-out);}
.ad-gauge__disc{width:168px;height:168px;border-radius:50%;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:4px;
  background:color-mix(in srgb,var(--bg-2) 72%,transparent);
  -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);
  border:1px solid var(--line);
  box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 22%,transparent),var(--shadow-2);}
.ad-gauge__eyebrow{font-size:11px;font-weight:600;letter-spacing:.14em;color:var(--fg-3);}
.ad-gauge__value{font-size:40px;font-weight:800;letter-spacing:-.03em;color:var(--fg-0);
  font-variant-numeric:tabular-nums;line-height:1;}
.ad-gauge__period{font-size:12px;color:var(--fg-2);}
@media (prefers-reduced-motion: reduce){.ad-gauge__fill{transition:none;}}
```

### JS (tick — self-contained, reuse public cadence: 1s active / 60s idle)
```js
// periods: [{name, startSec, endSec}] for today, from the schedule resolver.
function updateAdminGauge(periods, nowSec){
  const fill = el.querySelector('.ad-gauge__fill');
  const valueEl  = el.querySelector('[data-gauge-value]');
  const periodEl = el.querySelector('[data-gauge-period]');
  if (!periods || !periods.length){               // no school / no bells
    fill.style.strokeDasharray = '0 100';
    valueEl.textContent = '—'; periodEl.textContent = 'No bells today';
    return;
  }
  // current period = the one we're inside; else next upcoming boundary.
  const cur = periods.find(p => nowSec >= p.startSec && nowSec < p.endSec);
  const next = periods.find(p => p.startSec > nowSec);
  if (cur){
    const pctRemaining = Math.min(1, Math.max(0, 1 - (nowSec - cur.startSec)/(cur.endSec - cur.startSec)));
    fill.style.strokeDasharray = `${pctRemaining*100} 100`;
    valueEl.textContent  = fmtDur(cur.endSec - nowSec);          // time to bell
    periodEl.textContent = `${cur.name} ends · ${fmtClock(cur.endSec)}`;
  } else if (next){
    fill.style.strokeDasharray = '100 100';                       // before first bell
    valueEl.textContent  = fmtDur(next.startSec - nowSec);
    periodEl.textContent = `${next.name} starts · ${fmtClock(next.startSec)}`;
  } else {                                                        // day over
    fill.style.strokeDasharray = '0 100';
    valueEl.textContent = 'Done'; periodEl.textContent = 'School day complete';
  }
}
// fmtDur(s) -> "5h 42m" / "42m" / "3m"; fmtClock(s) -> "7:45 AM". Use tabular-nums.
```
Tick via `setInterval(updateAll, active ? 1000 : 60000)` like the public clock. The
`stroke-dasharray` change animates automatically via the CSS transition (the sweep).
On a non-instructional day, ring sits empty and the disc reads "No bells today".

---

## 9. CREATIVE LATITUDE — but the MAIN FOCUS comes first

The primary goal of this whole project is NOT animations or headers. It is:
**(1) remove the bloat/slop, (2) add genuinely useful features, (3) make every tab
sleek, consistent, and premium.** Creativity is welcome ONLY where it makes a real
feature faster or clearer. Never add motion or flourish for its own sake. Priority
order when anything conflicts: **utility > clarity > consistency > delight.**

You have latitude to design tasteful, original interactions — surprise us — as long
as they serve a real task and obey §0 (tokens only, one accent, no vanity metrics).
Good directions (build what fits, propose your own):
- **Drag-to-paint the planner:** drag across multiple dates to assign one schedule
  type in a single gesture (e.g. mark all of exam week). Real time-saver.
- **Hover-peek bell times:** hover a planner date → popover with that day's full bell
  schedule, no navigation.
- **Live micro-preview:** editing branding (title/logo) updates a small device mockup
  in real time so the admin sees the public result without opening full preview.
- **Animated publish diff:** before→after rows morph smoothly so the change is
  legible; on confirm they settle into the "live" state. Feedback, not confetti.
- **Undo-with-countdown-ring:** destructive actions (restore/clear) show a toast with
  a shrinking ring (reuses the gauge motif) allowing undo before commit.

Anything decorative that does NOT help a task is slop — leave it out. If a creative
idea would slow the page, hurt clarity, or break consistency, drop it.

---

## 10. MATERIAL & SOUL — fix the "lifeless/flat" problem (DO THIS)

The consistency pass worked, but it stripped the panel to flat black voids: cards
barely separate from the background, oceans of dead space, no depth, no motion you
can feel. That is NOT premium — it's empty. Add the craft back WITHOUT bringing back
any vanity chips/banners. The old public site had three things worth restoring:
a faint squared grid background, real material on surfaces, and visible fade-ins.

### 10.1 App canvas — PORT THE REAL PUBLIC-SITE BACKGROUND (this is the soul)
The public site (main.css) is alive because of FOUR layered, fixed, pointer-none
backgrounds behind the content. Port the same system into the admin, toned down for a
work tool. All layers `position:fixed; pointer-events:none;` and sit behind content.

**(a) Drifting squared grid** — your "cool squared background." It DRIFTS, not static
(public uses `homepageDotDrift` animating background-position). Toned down for admin:
```css
.admin-canvas-grid{position:fixed;inset:0;z-index:0;pointer-events:none;
  background-image:
    linear-gradient(to right, color-mix(in srgb,var(--fg-0) 5%,transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb,var(--fg-0) 5%,transparent) 1px, transparent 1px);
  background-size:34px 34px;
  -webkit-mask-image:radial-gradient(130% 90% at 50% 0%, #000 35%, transparent 90%);
          mask-image:radial-gradient(130% 90% at 50% 0%, #000 35%, transparent 90%);}
@media (prefers-reduced-motion: no-preference){
  .admin-canvas-grid{animation:adminGridDrift 40s linear infinite;}}
@keyframes adminGridDrift{to{background-position:34px 34px, 34px 34px;}}
```

**(b) Floating ambient orbs** — the slow living movement. Port `.ambient-orb` +
`float1/2/3` from main.css, but only 2 orbs, lower opacity, accent-tinted:
```css
.admin-orb{position:fixed;border-radius:50%;filter:blur(90px);pointer-events:none;
  z-index:0;mix-blend-mode:screen;opacity:.35;will-change:transform;}
.admin-orb--1{width:46vw;height:46vw;top:-8%;left:6%;
  background:radial-gradient(circle, color-mix(in srgb,var(--accent) 40%,transparent) 0%, transparent 70%);
  animation:adminFloat1 28s ease-in-out infinite alternate;}
.admin-orb--2{width:54vw;height:54vw;bottom:-14%;right:-8%;
  background:radial-gradient(circle, color-mix(in srgb,var(--accent) 22%,transparent) 0%, transparent 70%);
  animation:adminFloat2 34s ease-in-out infinite alternate-reverse;}
@keyframes adminFloat1{0%{transform:translate(0,0) scale(1)}100%{transform:translate(8vw,12vh) scale(1.1)}}
@keyframes adminFloat2{0%{transform:translate(0,0) scale(1)}100%{transform:translate(-12vw,-8vh) scale(1.18)}}
@media (prefers-reduced-motion: reduce){.admin-orb{animation:none;}}
```
In light mode drop orb opacity to ~.18 and use a neutral/light tint so it reads as a
soft light source, not a colored stain.

**(c) Film grain** — the secret premium ingredient that kills the flat digital look.
Port main.css `.ambient-noise` verbatim (the SVG fractalNoise data-URI), `opacity:.035`,
`mix-blend-mode:overlay`, fixed, z-index:0.

**(d) Top depth glow** — a single faint accent radial at the very top for a light
source: `radial-gradient(120% 60% at 50% -10%, color-mix(in srgb,var(--accent) 8%,transparent), transparent 60%)`.

Mount order behind content: base bg → orbs → grid → glow → grain. Content wrapper gets
`position:relative; z-index:1;`. Keep the WHOLE stack whisper-faint — when you glance
it should feel like depth and life, not decoration you'd name. This is the difference
between "lifeless" and the public site.

### 10.2 Cards — give them real material (so they stop disappearing)
Cards currently equal the background. Make every `.ad-card` a believable surface:
```css
.ad-card{
  background:
    linear-gradient(180deg, color-mix(in srgb,var(--fg-0) 3%,transparent), transparent 120px),
    var(--bg-2);
  border:1px solid var(--line);
  border-radius:var(--r-lg);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb,#fff 6%,transparent),   /* top-edge highlight = "glass" */
    var(--shadow-2);
}
body.admin-theme-dark .ad-card{
  box-shadow:
    inset 0 1px 0 color-mix(in srgb,#fff 8%,transparent),
    0 1px 0 color-mix(in srgb,#000 40%,transparent),
    var(--shadow-3);
}
```
The top-edge highlight + the subtle top gradient is what made the old panel feel like
glass. Inputs inside cards should sit on `--bg-1` so they read as inset wells. Raise
`--line` contrast slightly in dark mode if cards still don't separate.

### 10.3 Motion you can actually feel (restore the fades)
The §4 stagger must be VISIBLE, not subliminal. On tab enter, sections rise 10px and
fade over ~260ms with a 40ms per-card stagger. The hero/gauge gets a slightly longer
reveal. Cards lift on hover (shadow step + 1px translateY). This is the "clean
animation" the old site had — bring it back, just tasteful.
Use the SAME fade-up as the public site so admin and site feel related. Public uses:
`opacity:0; translateY(12px) → fadeUpAnim 0.8s var(--ease-out-expo) forwards`, delayed
`calc(var(--stagger) * 0.1s)`. Add `--ease-out-expo: cubic-bezier(0.19,1,0.22,1)` to the
admin tokens (matches the public expo feel). For a snappier work-tool cadence you may
shorten to ~0.55s, but keep the expo curve and the staggered reveal.
```css
:root{--ease-out-expo:cubic-bezier(0.19,1,0.22,1);}
@media (prefers-reduced-motion: no-preference){
  .ad-card,.ad-pagehead{opacity:0;transform:translateY(12px);
    animation:fadeUpAnim .6s var(--ease-out-expo) forwards;
    animation-delay:calc(var(--stagger,0) * 0.08s);}
}
@keyframes fadeUpAnim{to{opacity:1;transform:translateY(0);}}
.ad-card--interactive{transition:transform var(--motion-med) var(--ease-out),box-shadow var(--motion-med) var(--ease-out);}
.ad-card--interactive:hover{transform:translateY(-1px);box-shadow:var(--shadow-3);}
```
Set `--stagger` per card (0,1,2…) when rendering so the reveal cascades top-down.
IMPORTANT: this must NOT re-trigger on every in-tab edit (that would re-animate the
whole tab on each keystroke). Play it once on tab enter only.

### 10.4 Kill the dead space (short tabs feel empty)
Tabs like Availability / Privacy / History float a small card in a huge void.
- Constrain content to a comfortable max-width (~1100px) and the page stops looking
  like a sparse spreadsheet; the grid background fills the rest with texture.
- On genuinely short tabs, add ONE useful element rather than emptiness: e.g.
  Availability shows a small "current public state" status line + last-publish time;
  History fills with the events table (already does). Never add filler cards — add
  real, low-key context or let the constrained width + grid breathe.

### 10.5 Guardrails (so this doesn't slide back into slop)
- The grid + glow are the ONLY background treatment. No per-tab backgrounds.
- The accent glow stays ≤10% and uses the single accent token — no second color.
- Material = edge highlight + 1px border + soft shadow + faint top gradient. That's
  it. No heavy blur everywhere (blur stays scarce: gauge disc + modals only).
- Still: no vanity chips, no "N fields/tools/staged", no marketing headlines.

Result target: it should feel like the cards are real glass panels resting on a
faintly gridded, softly-lit surface — alive and premium — while keeping every bit of
the clean structure and useful features from the consistency pass.

---

## 11. BRAND PALETTE — match the public site (monochrome, NOT blue)

The admin currently uses a blue accent (#2457d6 / #8aa7ff). The public site is
elegant MONOCHROME. Retune the admin to the real brand palette so they feel like one
product. Source of truth (main.css / site-settings.json theme):
- accent `#a8aaa8` (warm gray) · accent2 `#131414`
- ring gradient `--ring-start:#ecece8` → `--ring-end:#a8aaa8`
- orbs: warm-white `rgba(236,236,232,.18)`, near-black `rgba(19,20,20,.72)`, dark-gray `rgba(58,59,60,.34)`

### What changes
- Set admin `--accent` to the brand gray family. Use `#a8aaa8` as the ambient/active
  accent (glow, active-nav bar, focus ring, ring-gauge gradient = `#ecece8`→`#a8aaa8`).
- **§8 ring gauge:** swap `#adminRingGrad` to `#ecece8 → #a8aaa8` (matches the public
  countdown ring exactly), glow `drop-shadow` tinted with `#a8aaa8`.
- **§10.1 orbs/glow:** tint orbs with the brand orb colors (warm-white + dark-gray),
  top glow uses warm-white not blue. The whole canvas goes warm-monochrome.

### CRITICAL: keep the primary action high-contrast (don't let it vanish)
A gray accent cannot carry the Publish CTA — gray-on-dark reads as disabled. In a
monochrome system the PRIMARY action flips to high-contrast instead of accent-colored:
```css
/* dark mode: near-white filled primary */
.ad-btn--primary{background:var(--fg-0);color:var(--bg-0);box-shadow:var(--shadow-2);}
.ad-btn--primary:hover{filter:brightness(.94);box-shadow:var(--shadow-3);}
/* light mode auto-inverts via tokens: near-black fill, white text */
```
This is the Linear/Vercel move: monochrome everything, the one primary button is the
brightest thing on screen. Active nav + focus stay the gray accent; destructive stays
`--danger`. Result: unmistakably actionable, still fully on-brand and monochrome.

Do NOT reintroduce blue anywhere. One warm-gray accent for ambient/active, high-
contrast fill for the single primary action, semantic colors only for real status.

---

## 12. FEATURE ROADMAP — precise build spec (build in phases, in order)

This section adds real features. GROUND RULES for every item below:
- **Backend contract is sacred** (see §0 / the API list). All new data is ADDITIVE:
  add new keys to site-settings.json defaulted so the public reader never breaks, or a
  new backend store — never rename/repurpose existing keys.
- Build with the §2 components, §10 material, §11 monochrome brand. No new visual
  language. Three copies stay in sync (root, /admin, /public/admin).
- Each item lists: **DATA** (where state lives) · **WHERE** (which tab/UI) ·
  **BEHAVIOR** (exact logic) · **BACKEND** (frontend-only, or needs an endpoint) ·
  **DONE** (acceptance test). Build a phase fully, self-verify it, THEN move on.

### PHASE A — Quick wins (frontend-only, no backend, low risk). Build all of these first.

A1. **Pre-publish sanity validation.**
- DATA: none (derived from draft). WHERE: runs when Publish is pressed + a small
  "checks" line on Today. BACKEND: frontend-only.
- BEHAVIOR: validate the draft bell schedules + active/ planned overrides for: period
  end ≤ start; overlapping periods; a school day with zero periods; times outside
  04:00–22:00; empty required labels. HARD errors block Publish (show a clear list);
  soft warnings allow publish after confirm.
- DONE: a deliberately broken schedule is blocked with a readable reason; a clean one
  publishes normally.

A2. **Unsaved-changes guard.**
- DATA: existing dirty state. WHERE: global. BACKEND: frontend-only.
- BEHAVIOR: `beforeunload` warns if there are unpublished draft changes; also intercept
  in-app sign-out/tab-close. No warning when clean.
- DONE: editing a field then closing the tab prompts; saving/clean does not.

A3. **Keyboard shortcuts.** ⌘S / Ctrl-S = save draft, ⌘↵ = publish (if allowed),
  Esc = close preview/modal, ⌘K = palette (already exists). Show a "?" cheatsheet
  overlay. Frontend-only. DONE: each shortcut works and is listed in the cheatsheet.

A4. **Undo toast on destructive actions.** WHERE: restore/clear/delete actions.
  BEHAVIOR: action takes effect optimistically; a toast with a shrinking countdown ring
  (reuse the gauge motif) offers Undo for ~6s before it commits. Frontend-only.
  DONE: clearing a date can be undone within the window; ignored after.

A5. **Optimistic save + "last saved" indicator.** Saving a draft updates UI instantly
  and shows "Saved · just now / 2m ago" near the dirty pill; reconcile on server ack,
  roll back + toast on failure. Frontend-only. DONE: save feels instant; failure visibly
  reverts.

A6. **"School day % complete" bar** under the Today gauge — thin progress bar of the
  day's elapsed instructional time. Frontend-only. DONE: fills through the day, empty on
  non-school days.

A7. **Lunch on Today.** Pull today's lunch from the existing `/weather/lunch` endpoint
  (already in local-server.js) and show it as a small Today card. BACKEND: read-only,
  endpoint exists. DONE: shows today's lunch or a graceful "no data".

A8. **"What's different today" public banner.** On the PUBLIC site (main.js/main.css),
  when today's schedule type ≠ the normal default, show a quiet one-line banner ("Today:
  Early Release"). Reuse `scheduleType` already computed. Frontend-only (public side).
  DONE: special days show the banner; normal days show nothing.

### PHASE B — Schedule power (frontend, builds on the existing resolver).

B1. **Recurring & bulk schedule rules.**
- DATA: NEW additive key `site-settings.scheduleRules: [{id, kind, scheduleType, ...}]`
  where kind ∈ {"weekday" (e.g. every Wed), "dateRange" (from→to), "date" (single)}.
  Default `[]`. WHERE: Schedule tab, above the planner. BACKEND: frontend-only (stored
  in site-settings via existing PUT).
- BEHAVIOR: the public resolver `_getScheduleDataForDate(date)` must resolve in priority
  order: single-date override > dateRange rule > weekday rule > data.json default.
  Add a small pure function `resolveScheduleType(date, settings)` used by BOTH admin
  planner and the public site. Bulk UI: select a date range or weekday → apply a type;
  the planner calendar shows rule-driven days with a subtle marker distinct from manual
  overrides.
- DONE: a "every Wednesday = Advisory" rule paints all Wednesdays in the planner and the
  public site renders Advisory on a Wednesday; a single-date override still wins over it.

B2. **🕰️ Time Machine preview.**
- DATA: none (uses B1 resolver + scheduled announcements). WHERE: the preview overlay —
  add a date slider/scrubber + "jump to date". BACKEND: frontend-only.
- BEHAVIOR: choosing a date re-renders the embedded public preview AS OF that date:
  schedule via `resolveScheduleType(date)`, announcements filtered by their show/expire
  dates (see D-announcements), countdown computed for that date. Smooth morph between
  dates; "Today" reset button.
- DONE: scrubbing to a planned Early-Release date shows that schedule in the preview
  without publishing anything.

### PHASE C — BIG BUILD #1: Live Theme Studio (the flagship, 3k+ lines).

- DATA: edits existing `site-settings.theme / appearance / branding`. NEW additive key
  `site-settings.themePresets: [{id,name,tokens}]` (default []). BACKEND: frontend-only
  via existing PUT; presets stored in site-settings.
- WHERE: replace/expand the Site tab's appearance area into a dedicated "Theme Studio".
- BEHAVIOR: live color pickers that auto-generate a full ramp from a base color;
  typography + spacing + radius controls; a split view with the public site in the
  preview iframe re-rendering live as controls change (debounced); save named presets;
  a preset gallery with apply/duplicate/delete; per-preset light & dark; "reset to
  default". All edits flow through the normal draft→publish pipeline.
- DONE: changing the accent updates the live preview within ~150ms; a saved preset can
  be applied and published; nothing bypasses draft/publish.

### PHASE D — Additional big builds (pick order later; each is independently shippable).

D1. **Schedule Studio (timeline editor)** — visual vertical time-ruler for a bell
  template; drag period start/end; template library; live conflict/gap detection (reuse
  A1). Edits existing `bellSchedules`. Frontend-only. DONE: dragging a boundary updates
  the time and flags overlaps live.

D2. **Version Control + visual diff** — backups already exist (`/admin/backups`). Add a
  side-by-side, human-readable diff between any two versions (section-by-section, plain
  language), one-click restore-to-point, and NAMED snapshots. BACKEND: may need an
  endpoint to fetch a specific backup's full JSON + accept a label on publish — inspect
  the backend and extend additively. DONE: diffing two versions lists exactly what
  changed; a named snapshot restores cleanly.

D3. **Announcement scheduling** — add optional `showFrom`/`expireOn` to each announcement
  (additive fields, default null). Public site filters by date; admin shows a status
  pill (Scheduled / Live / Expired). Powers the Time Machine. Frontend-only. DONE: a
  future-dated announcement is hidden publicly until its date.

D4. **⚙️ Automations engine** — a rules tab: triggers (on date/time, on weekday) →
  actions (set schedule type, publish staged changes, set maintenance, show/expire
  announcement). This generalizes B1 + scheduled publishing + D3. BACKEND: time-based
  triggers need a scheduled worker/cron on the backend (e.g. a Render cron hitting an
  apply endpoint); inspect the backend, add a `scheduledJobs` store + an apply endpoint.
  If no worker is available, degrade gracefully: apply due jobs on next admin load and
  clearly label them "applies when the site is next opened/served". DONE: a job created
  for a future time applies automatically (or on next load in fallback mode) and is
  logged in History.

D5. **Analytics Studio** — expand `/admin/analytics` into time-series charts, by-page /
  by-device breakdowns, peak-hour view, date ranges, CSV export. Inspect what the
  endpoint returns; render what's available, label what isn't configured. Frontend-first.

D6. **Jarvis Agent Console** — multi-step change plans with per-change diff + approve/
  reject, conversation threads/history, undo stack. Uses existing `/admin/ai/jarvis`.
  Frontend-first. DONE: a proposed change can be previewed as a diff and approved/rejected
  per item before it touches the draft.

### Cross-cutting requirements for ALL phases
- Update the ⌘K palette index whenever you add a setting/feature so it's findable.
- Everything new logs to the audit trail (reuse existing audit endpoint) where it
  changes state.
- After each phase: run local-server.js, exercise the feature end to end, screenshot,
  and report the DONE checks. Do not start the next phase until the current passes.

---

## 13. SHOWPIECE EFFECTS — the "wow, this is cool" layer (build with real craft)

These are demo-grade delight effects layered ONTO the clean, usable UI — never replacing
usability. Build each one PROPERLY (real techniques below), not a cheap approximation.

GLOBAL GUARDRAILS (apply to every effect):
- **Reduced-motion:** every effect is wrapped in `@media (prefers-reduced-motion:
  no-preference)` or feature-detected; users who opt out get the calm static UI.
- **GPU-cheap only:** animate transform / opacity / clip-path / CSS custom props. No
  layout thrash, no per-frame reflow. Target 60fps; throttle pointer handlers with rAF.
- **On-brand:** monochrome + the single warm-gray accent (§11). Glows use the accent.
  No rainbow, no confetti-spam. Tasteful > loud.
- **Layered, not required:** the panel must work perfectly with every effect disabled.
- **Settings toggle:** add an "Effects" toggle group (Motion effects on/off, Sound
  on/off) so the loud ones are controllable. Sound defaults OFF.

Build in this order (wow-per-effort), each fully before the next:

S1. **Shared-element tab transitions.** Use the View Transitions API
   (`document.startViewTransition`) so switching tabs morphs: the active-nav indicator
   and the page content cross-fade/slide as one motion. Assign `view-transition-name` to
   the nav pill + page header. Fallback: plain fade if the API is unavailable.
   DONE: navigating tabs feels like a native app, not a hard swap.

S2. **Circular theme-switch reveal.** On the light/dark toggle, use View Transitions +
   `clip-path: circle()` expanding from the toggle button's coordinates so the new theme
   wipes across the screen. ~20 lines. DONE: toggling theme reveals in an expanding circle
   from the button.

S3. **Cursor spotlight on cards.** Track the pointer (rAF-throttled) and set
   `--mx/--my` CSS vars on a card container; each `.ad-card` paints a soft
   `radial-gradient(at var(--mx) var(--my), accent-tint, transparent)` highlight that
   follows the cursor. DONE: cards softly light up under the pointer; no jank.

S4. **3D parallax tilt + glass glare** on the Today hero + ring gauge. On pointermove
   over the hero, apply `transform: perspective(900px) rotateX/rotateY` proportional to
   cursor offset, plus a moving specular glare highlight across the glass disc. Springs
   back on leave. DONE: the hero tilts toward the cursor with a light sweep; feels physical.

S5. **Publish "flight" animation.** When Publish runs, use the FLIP technique to animate
   the changed diff rows flying/settling into the "live" state, ending with a single
   accent ring-pulse on the gauge. No confetti. DONE: publishing is a satisfying sequence,
   not an instant flip.

S6. **Animated number tickers.** Counts and the countdown roll up odometer-style
   (per-digit transform) instead of snapping; use tabular-nums so width is stable.
   DONE: numbers animate smoothly with no layout shift.

S7. **Magnetic primary button.** The Publish button translates slightly toward the cursor
   within a small radius (rAF), springing back on leave. Disabled state = no magnetism.
   DONE: approaching Publish subtly pulls it toward the cursor.

S8. **Cursor-reactive shader background (the centerpiece).** Add a WebGL fragment-shader
   canvas behind the content (fixed, pointer-none, z-index 0) — a slow flowing
   gradient/aurora mesh in the brand grays that bends toward the cursor, tinted by the
   active accent. Reuse the public site's shader-drift feel. MUST degrade: if WebGL is
   unavailable or reduced-motion is set, fall back to the §10 static orbs+grid. Cap to
   ~30fps and pause when the tab is hidden. DONE: a living background reacts to the cursor;
   clean fallback; no fan-spinning CPU/GPU load.

S9. **Image → theme extraction (Theme Studio).** Add "Generate theme from image": user
   uploads/drops an image, quantize its colors on a canvas (downscale + k-means or median
   cut) to derive accent + background + text tokens, preview instantly, save as a preset.
   DONE: dropping a photo produces a coherent on-brand palette in the live preview.

S10. **Cinematic live day timeline (Today).** A horizontal day ruler: periods as segments,
   a glowing "now" marker that slides in real time, passed periods dimmed, current one lit.
   Smooth, synced to the same clock tick as the gauge. DONE: the marker moves live and the
   current period glows.

S11. **Premium loading + reveals.** Replace bare "Loading…" with skeleton shimmer
   placeholders; sections reveal on scroll via IntersectionObserver (opacity+rise, once).
   DONE: nothing pops in raw; loading feels designed.

S12. **(Optional, OFF by default) UI sound design.** Tiny synthesized/clipped sounds: soft
   tick on key actions, gentle chime on publish. Gated behind the Sound toggle, default
   off, preloaded, never blocking. DONE: enabling Sound adds subtle audio feedback; off =
   silent.

Quality bar for this section: each effect should look intentional and expensive, run at
60fps, and vanish cleanly under reduced-motion. If an effect feels gimmicky or janky,
refine it until it doesn't — or cut it. Demo target: a friend says "wait, how did you
build this?"

---

## 14. REFERENCES & API EXAMPLES (read these before implementing §13)

Use these official sources. Feature-detect everything; always provide the fallback noted.

### View Transitions API — for S1 (tab transitions) & S2 (theme reveal)
- MDN: https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API
- Chrome guide (same-document SPA + circular reveal recipe):
  https://developer.chrome.com/docs/web-platform/view-transitions/
- Pattern (always feature-detect):
  ```js
  function withTransition(update){
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches){
      update(); return;                  // fallback: just update
    }
    document.startViewTransition(update);
  }
  ```
- Circular theme reveal: capture the toggle's click x/y, then in CSS animate
  `::view-transition-new(root)` with `clip-path: circle(0 → 150% at x y)`. Give persistent
  elements a `view-transition-name` (e.g. the nav pill) so they morph instead of fade.
- GOTCHA: only one transition at a time; keep the DOM update synchronous inside the callback.

### FLIP animation — for S5 (publish flight)
- Concept: Paul Lewis, "FLIP Your Animations": https://aerotwist.com/blog/flip-your-animations/
- Use the Web Animations API: MDN `Element.animate()`
  https://developer.mozilla.org/en-US/docs/Web/API/Element/animate
- Pattern: record First rect (`getBoundingClientRect`), move element to Last position,
  Invert with a transform, then `el.animate([{transform:invert},{transform:'none'}], {duration, easing})`.

### Pointer-driven effects — S3 spotlight, S4 tilt, S7 magnetic
- MDN pointer events: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- rAF throttle: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- Reference for tilt/magnet math (read for technique, don't add the dep):
  vanilla-tilt.js https://github.com/micku7zu/vanilla-tilt.js
- Pattern: on `pointermove`, store coords; in a single rAF loop set CSS vars
  `el.style.setProperty('--mx', x+'px')`; CSS uses them in `radial-gradient`/`transform`.
  GOTCHA: never write styles directly in the event handler — batch in rAF.

### WebGL shader background — S8
- MDN WebGL tutorial: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial
- Fragment-shader learning: The Book of Shaders https://thebookofshaders.com/
- Approach: one fullscreen triangle, all visuals in the fragment shader; uniforms = time,
  resolution, mouse, accent color. No matrix math/libs needed for a fullscreen pass.
- Tiny-lib option if raw GL is too much: https://github.com/brurm/glsl-canvas or a hand-rolled
  ~60-line setup. Pause with `document.addEventListener('visibilitychange', …)`.
  GOTCHA: handle WebGL context loss; if `getContext('webgl')` is null → fall back to §10
  static orbs+grid. Cap to ~30fps.

### Image → palette extraction — S9
- Canvas pixels: MDN `CanvasRenderingContext2D.getImageData`
  https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData
- Libraries to vendor (pick one, both small, MIT): Color Thief
  https://github.com/lokesh/color-thief  ·  node-vibrant https://github.com/Vibrant-Colors/node-vibrant
- Approach: downscale the image to ~64px on a canvas, getImageData, run median-cut or
  k-means to get a dominant + accent swatch, map to theme tokens, preview live.
  GOTCHA: handle CORS for uploaded files (use object URLs from the File input, not remote URLs).

### Web Audio — S12 (optional sound)
- MDN Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- GOTCHA: browsers block audio until a user gesture — create/resume the AudioContext on the
  first click. Keep sounds short; default OFF; preload. Synthesize ticks with an
  OscillatorGain envelope, or play tiny preloaded clips.

### Loading & reveals — S11
- IntersectionObserver: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
- Skeleton shimmer = an animated CSS `linear-gradient` background-position loop (GPU-cheap).

### Number ticker — S6
- Per-digit roll via CSS `transform: translateY` on stacked digits; keep
  `font-variant-numeric: tabular-nums` so width never shifts.

### Baseline / accessibility
- prefers-reduced-motion: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- Every effect must no-op (or static-fallback) when reduced-motion is set OR the Effects
  toggle is off. Test both states for each effect.
```
