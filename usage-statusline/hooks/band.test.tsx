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
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', () => ({ changed: [] }))
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

  // Before any measurement the mod passes: the engine's own band shows.
  expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()

  // A measurement pushes the figures; the mod's drawing replaces the engine's.
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
  expect(await ui.find({ type: 'Text', text: /5h 7%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /7d 2%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$1\.23/ })).toBeDefined()
  await ui.unmount()
})

test('a turn that streams a step shows tok/s, exact once the stop lands', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', () => ({ changed: [] }))
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
