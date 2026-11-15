import { existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { CONFIG_FILE_NAMES } from '../constants/index.js'
import type { AnyRuleSpec, TypespeclintConfig } from '../types/index.js'

/** Identity helper giving type checking and completion in `typespeclint.config.ts`. */
export function defineConfig<const R extends readonly AnyRuleSpec[] = readonly []>(
  config: TypespeclintConfig<R>,
): TypespeclintConfig<R> {
  return config
}

/** Look for a config file in `startDir` and each of its ancestors. */
export function findConfigFile(startDir: string): string | undefined {
  let dir = resolve(startDir)
  for (;;) {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

const cache = new Map<string, Promise<TypespeclintConfig>>()

/**
 * Load the nearest `typespeclint.config.*`. Returns an empty config when none exists.
 * The result is cached per file version, so editing the file is picked up by
 * long-running processes such as the language server.
 */
export async function loadConfig(startDir: string): Promise<TypespeclintConfig> {
  const file = process.env['TYPESPECLINT_CONFIG']
    ? resolve(process.env['TYPESPECLINT_CONFIG'])
    : findConfigFile(startDir)
  if (!file) return {}
  const version = statSync(file).mtimeMs
  const key = `${file}?v=${version}`
  let loaded = cache.get(key)
  if (!loaded) {
    loaded = import(`${pathToFileURL(file).href}?v=${version}`).then((mod) => {
      const config: unknown = mod.default ?? mod.config
      if (config === null || typeof config !== 'object') {
        throw new Error(
          `typespeclint: ${file} must default-export a config object (use defineConfig).`,
        )
      }
      const loadedConfig: TypespeclintConfig = config
      return loadedConfig
    })
    cache.set(key, loaded)
  }
  return loaded
}
