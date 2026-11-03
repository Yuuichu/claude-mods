/** The usage figures the band draws, as the last `session.measure` left them. */
export type UsageSnapshot = {
  /**
   * How full the compaction window is — the figure the desktop app's own
   * indicator shows; null until the engine answered a usage call.
   */
  contextPercent: number | null
  /** How full the model's own window is; null before the live window's first response. */
  contextPercentFull: number | null
  /** The model's own window, in tokens. */
  contextWindow: number | null
  /** The compaction window the primary figure measures against; null when the engine gave none. */
  compactionWindow: number | null
  /** One row per rate-limit window the last response reported. */
  rateLimits: { kind: string; percentUsed: number }[]
  /** Session cost in US dollars; null where the host keeps no ledger. */
  costUsd: number | null
}

/** The output-speed estimate, live while a step streams, the last step's afterwards. */
export type Speed = {
  /** Output tokens per second for the step in flight, or the last finished one; null before any. */
  tokPerSec: number | null
  /** True while the estimate is still moving (the step has not stopped). */
  isStreaming: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'usage-statusline': {
      snap: UsageSnapshot | null
      model: string | null
      speed: Speed
      /** The desktop app's id for this session (`local_…`), null outside the desktop app. */
      hostId: string | null
      /** True while the band spells out the full link, for when the clipboard could not take it. */
      isLinkShown: boolean
    }
  }
}
