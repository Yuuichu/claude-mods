import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Speed, UsageSnapshot } from '../types'

const snap = atom({ plugin: 'usage-statusline', key: 'snap' } as const, null)
const model = atom({ plugin: 'usage-statusline', key: 'model' } as const, null)
const speed = atom({ plugin: 'usage-statusline', key: 'speed' } as const, {
  tokPerSec: null,
  isStreaming: false,
} satisfies Speed)
const hostId = atom({ plugin: 'usage-statusline', key: 'hostId' } as const, null)
const isLinkShown = atom({ plugin: 'usage-statusline', key: 'isLinkShown' } as const, false)

/** The desktop app's deep link for one of its sessions. */
function sessionLink(id: string): string {
  return `claude://claude.ai/epitaxy/${id}`
}

/** Rough chars-per-token used only while the step streams; the stop chunk's
 * usage gives the exact count afterwards. */
const CHARS_PER_TOKEN = 4
/** How often the live tok/s estimate may repaint the band. */
const PUSH_EVERY_MS = 250

const KIND_LABEL: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: 'spend',
}

function fmtPct(n: number): string {
  return n >= 100 ? `${Math.round(n)}%` : `${Math.round(n * 10) / 10}%`
}

function fmtSpeed(v: number): string {
  return v >= 100 ? `${Math.round(v)}` : `${Math.round(v * 10) / 10}`
}

/** Whether any figure has been read yet; an empty band draws nothing. */
function hasAnything(s: UsageSnapshot | null, m: string | null): boolean {
  return s !== null || m !== null
}

export const register: Register = (on) => {
  /** Whether the band has drawn at least once on a surface that raises it. */
  let bandDrawn = false

  // The desktop app hands its own session id (`local_…`) to the process it
  // starts; outside the desktop app the variable is unset and no link shows.
  on('session.start', async ($, e, next) => {
    const id = await $.env.get('CLAUDE_CODE_HOST_SESSION_ID')
    await update($, hostId, () => id ?? null)
    return next(e)
  })

  // The usage figures, pushed, not polled.
  on('session.measure', async ($, e, next) => {
    // The measure event's `context.percent` counts against the model's own
    // window (1M on `[1m]` models), but the desktop app's own indicator
    // counts against the smaller compaction (autocompact) window — the two
    // disagree by design there. The event never carries the breakdown; ask
    // for one (`summary` estimates locally, no token-count requests): its
    // `percentage` over `rawMaxTokens` is the desktop-compatible figure.
    let desktopPercent: number | null = null
    let compactionWindow: number | null = null
    try {
      const usage = await $.session.usage({ breakdown: 'summary' })
      const b = usage.context.breakdown
      if (b) {
        desktopPercent = b.percentage
        compactionWindow = b.rawMaxTokens
      }
    } catch {
      // No session bound or the op refused: the model-window figure stands in.
    }

    await update($, snap, () => ({
      contextPercent: desktopPercent ?? e.context.percent ?? null,
      contextPercentFull: e.context.percent ?? null,
      contextWindow: e.context.window,
      compactionWindow,
      rateLimits: e.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed })),
      costUsd: e.cost?.usd ?? null,
    } satisfies UsageSnapshot))

    // Fallback for surfaces that raise no band (mobile): keep the status line
    // fresh on every measurement. The band hook clears it once a drawing has
    // actually been accepted, so a refused tree leaves the fallback standing.
    if (!bandDrawn) {
      const s = await read($, snap)
      const m = await read($, model)
      if (hasAnything(s, m)) {
        $.ui.status(formatPlain(s, m))
      }
    }

    return next(e)
  })

  // Output tok/s, estimated while a step of the main loop streams; the stop
  // chunk's usage makes the final figure exact.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId) {
      return yield* next(e)
    }

    await update($, model, () => e.model)
    await update($, speed, () => ({ tokPerSec: null, isStreaming: true }))

    let firstTokenAt = 0
    let outChars = 0
    let lastPushAt = 0

    const stream = next(e)
    for await (const chunk of stream) {
      if (chunk.kind === 'text' || chunk.kind === 'thinking') {
        if (firstTokenAt === 0) firstTokenAt = await $.clock.now()
        outChars += chunk.text.length
      } else if (chunk.kind === 'input') {
        if (firstTokenAt === 0) firstTokenAt = await $.clock.now()
        outChars += chunk.json.length
      } else if (chunk.kind === 'stop') {
        const endedAt = await $.clock.now()
        const outTokens = chunk.usage?.output_tokens ?? 0
        const seconds = firstTokenAt === 0 ? 0 : (endedAt - firstTokenAt) / 1000
        await update($, speed, () => ({
          tokPerSec: seconds > 0 && outTokens > 0 ? outTokens / seconds : null,
          isStreaming: false,
        }))
      } else if (firstTokenAt !== 0) {
        const now = await $.clock.now()
        if (now - lastPushAt >= PUSH_EVERY_MS) {
          lastPushAt = now
          const seconds = (now - firstTokenAt) / 1000
          if (seconds > 0) {
            const estimate = outChars / CHARS_PER_TOKEN / seconds
            await update($, speed, s => ({ ...s, tokPerSec: estimate }))
          }
        }
      }
      yield chunk
    }
    return await stream.result
  })

  // A turn the stop chunk never closed (an interrupt, an API error) still ends
  // the streaming state.
  on('turn.complete', async ($, e, next) => {
    await update($, speed, s => (s.isStreaming ? { ...s, isStreaming: false } : s))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const s = await read($, snap)
    const m = await read($, model)
    const sp = await read($, speed)
    const id = await read($, hostId)
    const isShown = await read($, isLinkShown)
    if (!hasAnything(s, m)) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    // The tree's children: Text elements and string separators side by side,
    // directly under the Box — the shape the band's example draws.
    const line: (ReturnType<typeof Text> | ReturnType<typeof Button>)[] = []

    if (m !== null) {
      line.push(<Text color="claude">{m}</Text>)
    }
    if (s?.contextPercent != null) {
      const pct = s.contextPercent
      // On a model whose own window is larger than the compaction window
      // (1M-context models), the two fills differ; the desktop app's
      // indicator shows the compaction one, so the full-window fill follows
      // in brackets to keep both readings visible.
      const fullNote =
        s.contextWindow != null && s.compactionWindow != null && s.contextWindow > s.compactionWindow
          ? ` (1M ${fmtPct(s.contextPercentFull ?? (pct * s.contextWindow) / s.compactionWindow)})`
          : ''
      line.push(
        <Text color={pct >= 90 ? 'error' : pct >= 75 ? 'warning' : 'subtle'}>
          ctx {fmtPct(pct)}
          {fullNote}
        </Text>,
      )
    }
    for (const r of s?.rateLimits ?? []) {
      const label = KIND_LABEL[r.kind] ?? r.kind
      line.push(
        <Text color={r.percentUsed >= 90 ? 'error' : r.percentUsed >= 75 ? 'warning' : 'subtle'}>
          {label} {fmtPct(r.percentUsed)}
        </Text>,
      )
    }
    if (s?.costUsd != null) {
      line.push(
        <Text color="subtle">
          ${s.costUsd >= 1 ? s.costUsd.toFixed(2) : s.costUsd.toFixed(4)}
        </Text>,
      )
    }
    if (sp.tokPerSec != null) {
      line.push(
        <Text dimColor={sp.isStreaming}>
          {fmtSpeed(sp.tokPerSec)} tok/s{sp.isStreaming ? '…' : ''}
        </Text>,
      )
    }

    if (id !== null) {
      // Short id on the button; a press copies the full deep link. Where the
      // surface's clipboard refuses (a remote surface), the band spells the
      // link out instead so it can be selected by hand; a second press hides it.
      if (isShown) {
        line.push(<Text>{sessionLink(id)}</Text>)
      }
      line.push(
        <Button
          key="copy-link"
          label={isShown ? '收起' : `🔗 ${id.slice(0, 14)}`}
          plain
          dimColor
          onPress={async press => {
            if (await read($, isLinkShown)) {
              await update($, isLinkShown, () => false)
              return
            }
            const r = await $.ui.copy({ text: sessionLink(id), surface: press.surface })
            if (r.isCopied) {
              $.ui.toast(`已复制 ${sessionLink(id)}`)
            } else {
              await update($, isLinkShown, () => true)
            }
          }}
        />,
      )
    }

    const withSeparators: (ReturnType<typeof Text> | ReturnType<typeof Button> | string)[] = []
    line.forEach((part, i) => {
      if (i > 0) {
        withSeparators.push(' · ')
      }
      withSeparators.push(part)
    })

    // Only clear the fallback status line once the tree is built and about to
    // be returned; if the engine refuses this tree anyway, the next
    // session.measure (or the next band redraw) re-raises it via bandDrawn
    // staying false on the failure path below.
    if (!bandDrawn) {
      bandDrawn = true
      $.ui.status(undefined)
    }

    return <Box>{withSeparators}</Box>
  })
}

/** The same line as plain text, for the `$.ui.status` fallback. */
function formatPlain(s: UsageSnapshot | null, m: string | null): string {
  const bits: string[] = []
  if (m !== null) {
    bits.push(m)
  }
  if (s?.contextPercent != null) {
    const fullNote =
      s.contextWindow != null && s.compactionWindow != null && s.contextWindow > s.compactionWindow
        ? ` (1M ${fmtPct(s.contextPercentFull ?? (s.contextPercent * s.contextWindow) / s.compactionWindow)})`
        : ''
    bits.push(`ctx ${fmtPct(s.contextPercent)}${fullNote}`)
  }
  for (const r of s?.rateLimits ?? []) {
    bits.push(`${KIND_LABEL[r.kind] ?? r.kind} ${fmtPct(r.percentUsed)}`)
  }
  if (s?.costUsd != null) {
    bits.push(`$${s.costUsd >= 1 ? s.costUsd.toFixed(2) : s.costUsd.toFixed(4)}`)
  }
  return bits.join(' · ')
}
