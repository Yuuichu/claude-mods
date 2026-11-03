# usage-statusline

A Claude Code mod that draws a one-line usage status in the band above the prompt input, like the CLI's statusline. It shows the current model, how full the context window is, the account's rate-limit windows (`5h` / `7d` / `spend`), the session's running cost in US dollars, a live output tok/s figure estimated while the model streams and made exact by each step's token usage, and (in the desktop app) a button that copies a deep link to the current session.

## Install

From this marketplace (one step on Claude Code 2.1.275+):

```bash
claude plugin marketplace add Yuuichu/claude-mods
claude plugin install usage-statusline@yuuchu-claude-mods
```

Or run Claude Code with the mod folder loaded, e.g. `claude --plugin-dir <path to usage-statusline>`, or place it in your dev-mods folder and enable mods for the session. No setup or credentials needed.

## How it works

- `session.measure` pushes the usage figures (context %, rate-limit windows, cost) — no polling. The context % matches the desktop app's own indicator: how full the compaction (auto-compact) window is, which on 1M-context models is much smaller than the model's own window; the model-window fill follows in brackets (`ctx 79% (1M 19%)`) on such models.
- `turn.step` (a streaming hook) counts text/thinking/tool-argument output and clocks it to estimate tok/s live; the stop chunk's `usage.output_tokens` finalizes the exact figure.
- `session.start` picks up the desktop app's own session id (`CLAUDE_CODE_HOST_SESSION_ID`); outside the desktop app the link button is omitted.
- The line is drawn by a `ui.render` hook for the `AbovePrompt` band on terminal and desktop surfaces; before the band has ever drawn, the same line is kept in `$.ui.status` so it still shows on other surfaces.
