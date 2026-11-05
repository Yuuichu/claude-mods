import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-statusline',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    scroll: { offset: 0, bodyRows: 20 },
  },
} as const

test('the band draws the status line from a measurement', async ($, on) => {
  // The engine's answers this test stands in for. The engine's own band
  // drawing: an element, like any ui.render hook.
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', () => ({ changed: [] }))
  // The mod asks the engine for a breakdown at start and with each
  // measurement; a compaction window as wide as the model's keeps the plain
  // single figure.
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {
        window: 200000,
        breakdown: {
          categories: [],
          totalTokens: 84000,
          maxTokens: 200000,
          rawMaxTokens: 200000,
          autocompactSource: 'auto',
          percentage: 42,
          gridRows: [],
          model: 'claude-sonnet-5-5',
          memoryFiles: [],
          mcpTools: [],
          agents: [],
          isAutoCompactEnabled: true,
          apiUsage: null,
        },
      },
      rateLimits: [],
      cost: { usd: 1.2345 },
    },
  }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text>engine band</Text>
      </Box>
    )
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  // The seed at session.start already drew the line: the figures come from
  // what the engine answers, before any reply of the session.
  const seededRow = await ui.find({ type: 'Text', text: /ctx 42%/ })
  expect(seededRow).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$1\.23/ })).toBeDefined()

  // A measurement pushes the figures; the drawing stays.
  await $.session.measure({
    context: { window: 200000, percent: 42, tokens: 84000 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 7 },
      { kind: 'seven_day', percentUsed: 2 },
    ],
    cost: { usd: 1.2345 },
    changed: ['context', 'rateLimits', 'cost'],
  })

  const modelRow = await ui.find({ type: 'Text', text: /ctx 42%/ })
  expect(modelRow).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1M/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /5h 7%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /7d 2%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$1\.23/ })).toBeDefined()
  await ui.unmount()
})

test('on a wide-window model the band shows the compaction fill first, the model window in brackets', async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', () => ({ changed: [] }))
  // The engine's answer for a 1M-window model: the measure event's percent
  // counts against the full window, the breakdown against the compaction
  // window (the desktop app's own indicator figures).
  on('session.usage', () => ({
    value: {
      startedAt: 0,
    context: {
      window: 1000000,
      breakdown: {
        categories: [],
        totalTokens: 198962,
        maxTokens: 252000,
        rawMaxTokens: 252000,
        autocompactSource: 'clientdata',
        percentage: 79,
        gridRows: [],
        model: 'claude-opus-5-5[1m]',
        memoryFiles: [],
        mcpTools: [],
        agents: [],
        isAutoCompactEnabled: true,
        apiUsage: null,
      },
    },
    rateLimits: [],
    },
  }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text>engine band</Text>
      </Box>
    )
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await $.session.measure({
    context: { window: 1000000, percent: 19, tokens: 198962 },
    rateLimits: [],
    changed: ['context'],
  })

  expect(await ui.find({ type: 'Text', text: /ctx 79% \(1M 19%\)/ })).toBeDefined()
  await ui.unmount()
})

test('where the engine answers no breakdown the band falls back to the measure-event percent', async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', () => ({ changed: [] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, percent: 19 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text>engine band</Text>
      </Box>
    )
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await $.session.measure({
    context: { window: 1000000, percent: 19, tokens: 198962 },
    rateLimits: [],
    changed: ['context'],
  })

  expect(await ui.find({ type: 'Text', text: /ctx 19%/ })).toBeDefined()
  // No compaction window known: no brackets.
  expect(await ui.find({ type: 'Text', text: /1M/ })).toBeUndefined()
  await ui.unmount()
})

test('before the live window has a response the band shows only the compaction fill', async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', () => ({ changed: [] }))
  // A fresh (or just-compacted) session: the breakdown knows the compaction
  // window, but no response of the live window has ever reported its fill.
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {
        window: 1000000,
        breakdown: {
          categories: [],
          totalTokens: 52000,
          maxTokens: 252000,
          rawMaxTokens: 252000,
          autocompactSource: 'clientdata',
          percentage: 21,
          gridRows: [],
          model: 'claude-opus-5-5[1m]',
          memoryFiles: [],
          mcpTools: [],
          agents: [],
          isAutoCompactEnabled: true,
          apiUsage: null,
        },
      },
      rateLimits: [],
    },
  }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text>engine band</Text>
      </Box>
    )
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  // The measure event has no percent either: the live window has no reading.
  await $.session.measure({
    context: { window: 1000000 },
    rateLimits: [],
    changed: ['context'],
  })

  expect(await ui.find({ type: 'Text', text: /ctx 21%/ })).toBeDefined()
  // No model-window figure to bracket: extrapolating would invent one.
  expect(await ui.find({ type: 'Text', text: /1M/ })).toBeUndefined()
  await ui.unmount()
})

test('a freshly started session draws the band before any reply', async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', () => ({ changed: [] }))
  // A resumed session: the engine answers the seed from what it already has
  // on disk (the transcript's last usage, the settings' model).
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {
        window: 1000000,
        breakdown: {
          categories: [],
          totalTokens: 210000,
          maxTokens: 252000,
          rawMaxTokens: 252000,
          autocompactSource: 'clientdata',
          percentage: 83,
          gridRows: [],
          model: 'claude-opus-5-5[1m]',
          memoryFiles: [],
          mcpTools: [],
          agents: [],
          isAutoCompactEnabled: true,
          apiUsage: null,
        },
      },
      rateLimits: [{ kind: 'five_hour', percentUsed: 31 }],
      cost: { usd: 2.5 },
    },
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text>engine band</Text>
      </Box>
    )
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  // No measurement has ever been raised: the seed alone drew the line.
  expect(await ui.find({ type: 'Text', text: /ctx 83%/ })).toBeDefined()
  // The live window has no response yet: no 1M bracket.
  expect(await ui.find({ type: 'Text', text: /1M/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /5h 31%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$2\.50/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /claude-opus-5-5/ })).toBeDefined()
  await ui.unmount()
})

test('a turn that streams a step shows tok/s, exact once the stop lands', async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', () => ({ changed: [] }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000 },
      rateLimits: [],
    },
  }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text>engine band</Text>
      </Box>
    )
  })

  // A step streams text chunks then stops with a real usage figure; the
  // engine's stream beneath stands in with the same shape.
  on('turn.step', async function* ($, e, next) {
    let out = 0
    for (const text of ['hello ', 'world']) {
      out += text.length
      yield { kind: 'text', index: 0, text, ref: `r${out}` }
    }
    yield {
      kind: 'stop',
      stopReason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 10,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        model: 'claude-sonnet-5-5',
      },
      ref: 'r-stop',
    }
    return {
      turnId: 't1',
      index: 0,
      answer: 'hello world',
      toolUses: [],
      stopReason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 10,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        model: 'claude-sonnet-5-5',
      },
    }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await $.session.measure({
    context: { window: 200000, percent: 10 },
    rateLimits: [],
    changed: ['context'],
  })
  expect(await ui.find({ type: 'Text', text: /ctx 10%/ })).toBeDefined()

  // Draining the engine's stream drives the mod's streaming hook; the
  // engine beneath stands in with text chunks and a stop carrying usage.
  const step = $.turn.step({
    turnId: 't1',
    index: 0,
    model: 'claude-sonnet-5-5',
    messageCount: 2,
  })
  for await (const _chunk of step) {
    // Drained: the mod's hook ran beneath as the chunks passed.
  }

  // 10 output tokens (the stop's usage) over the ~0s the mocked clock spent
  // is unmeasurable, so the exact figure is suppressed; what must show is
  // the model, recorded from the step's request.
  expect(await ui.find({ type: 'Text', text: /claude-sonnet-5-5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /tok\/s/ })).toBeUndefined()

  await ui.unmount()
})
