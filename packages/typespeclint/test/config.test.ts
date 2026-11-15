import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, it } from 'vite-plus/test'

import { defineConfig, findConfigFile, loadConfig } from '../src/helper/config.js'

it('defineConfig returns the config unchanged', () => {
  const config = { rules: { 'model-used': false } } as const
  expect(defineConfig(config)).toBe(config)
})

it('loads the nearest config from an ancestor directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'typespeclint-'))
  const nested = join(root, 'specs', 'api')
  mkdirSync(nested, { recursive: true })
  writeFileSync(
    join(root, 'typespeclint.config.mjs'),
    `export default { rules: { "model-naming": { minLength: 5 } } };\n`,
  )
  expect(findConfigFile(nested)).toBe(join(root, 'typespeclint.config.mjs'))
  expect(await loadConfig(nested)).toEqual({ rules: { 'model-naming': { minLength: 5 } } })
})

it('returns an empty config when there is no config file', async () => {
  expect(await loadConfig('/nonexistent/virtual/project')).toEqual({})
})
