import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-statusline',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const LINK = 'claude://claude.ai/epitaxy/local_0123abcd-ef45-6789-abcd-0123456789ab'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band copies the session link, or spells it out where the clipboard refuses (${surface})`, async ($, on) => {
    mock.env(on, { CLAUDE_CODE_HOST_SESSION_ID: 'local_0123abcd-ef45-6789-abcd-0123456789ab' })
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('session.measure', () => ({ changed: [] }))
    on('ui.status', () => ({ value: undefined }))
    on('ui.toast', () => ({ value: undefined }))
    on('ui.copy', () => ({ value: { isCopied: false, reason: 'no-surface' } }))
    on('ui.render', ($, e) => {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box>
          <Text>engine band</Text>
        </Box>
      )
    })

    await $.session.start({ cwd: '/', surface, isInteractive: true })
    const ui = await $.ui.mount({ ...BAND, surface })
    await $.session.measure({
      context: { window: 200000, percent: 42, tokens: 84000 },
      rateLimits: [],
      changed: ['context'],
    })

    expect(await ui.find({ key: 'copy-link' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: LINK })).toBeUndefined()

    await ui.press({ key: 'copy-link' })
    expect(await ui.find({ type: 'Text', text: LINK })).toBeDefined()

    await ui.press({ key: 'copy-link' })
    expect(await ui.find({ type: 'Text', text: LINK })).toBeUndefined()
    await ui.unmount()
  })
}
