# Coding workflow — Claude is the brain, Codex is the hands

GOALS (both matter, they trade off — hit the sweet spot):
1. MINIMIZE my (Claude) usage. My intelligence is scarce; Codex quota is huge.
2. BEAT plain-Codex output quality — but ONLY by applying judgment where it counts.

KEY INSIGHT: my tokens are cheap when I THINK and expensive when I READ code.
So I pour intelligence into the PLAN (free quality boost) and keep reviewing
lightweight (summaries, not full diffs). I never routinely ingest large files.

## Where my second brain actually adds value (do these)
- **Plan hard, up front.** Before delegating, I think through the approach,
  edge cases, the cleanest design, and likely pitfalls — then encode all of it
  into the Codex prompt. A great spec is where "2 brains" quality comes from,
  and it costs me almost nothing because it's thinking, not reading.
- **Light quality gate after.** I read Codex's short summary + test result and
  sanity-check it against the original intent. If something seems off, THEN I
  pull the smallest relevant snippet and use my judgment. Otherwise I trust it.

## Division of labor
- ME: plan + key decisions + write a tight, complete spec + lightweight review.
- CODEX: explore the codebase, write the code, run tests/builds, self-verify,
  report back a SHORT summary. Codex reads the code so I don't have to.

## Rules that keep my usage really small
1. Do NOT read large files or full diffs into my context. Let Codex read code.
2. To understand existing code, have Codex summarize it instead of reading it:
   `codex exec --sandbox workspace-write "summarize how X works in src/, key files + functions, <300 words"`
3. Delegate with ONE detailed, self-contained prompt. Always tell Codex to test
   its own work and report briefly:
   `codex exec --sandbox workspace-write "<full spec: file paths, exact behavior,
   edge cases, design constraints. Then run the relevant tests/build yourself.
   Report ONLY a short summary: what changed, files touched, pass/fail.
   Do NOT paste full diffs.>"`
4. After Codex: read only the summary + test result. Pull actual code ONLY if
   the summary reveals a problem or the task was high-stakes.
5. On failure: have Codex show only the error + smallest snippet, never whole
   files. I decide the fix and re-prompt. This is my highest-value thinking.
6. End with a plain-language summary for the user.

## Quality bar
- The spec is mine to get right — vague specs waste Codex runs and my review
  tokens. Specific in, good out.
- For anything tricky (architecture, security, data handling, tradeoffs), spend
  real thought on the plan and do look at the key code. That's the 2-brain edge.
- For trivial/mechanical work (renames, boilerplate), don't overthink — a
  one-line Codex prompt is fine, and the user can even skip me entirely.
