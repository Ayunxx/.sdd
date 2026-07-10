export const meta = {
  name: 'sdd-agent-dispatch-smoke',
  description: 'Verify workflow agents return plain and structured results.',
  phases: [
    { title: 'dispatch', detail: 'Run two no-tool agents through parallel().' },
  ],
}

phase('dispatch')

const StructuredSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'message'],
  properties: {
    ok: { type: 'boolean' },
    message: { type: 'string' },
  },
}

const [plain, structured] = await parallel([
  () => agent('Do not use tools. Reply with exactly READY.', {
    label: 'plain-dispatch',
    phase: 'dispatch',
  }),
  () => agent('Do not use tools. Return {"ok":true,"message":"READY"}.', {
    label: 'schema-dispatch',
    phase: 'dispatch',
    schema: StructuredSchema,
  }),
])

return {
  plain,
  structured,
  plainWasNull: plain === null,
  structuredWasNull: structured === null,
}
