import assert from 'node:assert/strict'
import test from 'node:test'

import { requireEnvironment } from './require-env.mjs'

test('returns only the requested configured variables', () => {
  assert.deepEqual(
    requireEnvironment(['A', 'B'], { A: 'present', B: 'also-present', C: 'ignored' }),
    { A: 'present', B: 'also-present' },
  )
})

test('reports missing names without exposing configured values', () => {
  assert.throws(
    () => requireEnvironment(['A', 'B'], { A: 'super-secret', B: '' }),
    (error) => /B/.test(error.message) && !/super-secret/.test(error.message),
  )
})
