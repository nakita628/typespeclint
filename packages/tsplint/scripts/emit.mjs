// Shared by the generators: write a generated file the way `vp fmt` leaves it, or, with
// `--check`, fail when the committed file differs from what would be generated.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const check = process.argv.includes('--check')
const vp = fileURLToPath(new URL('../node_modules/.bin/vp', import.meta.url))

/**
 * @param {URL} file The file to write.
 * @param {string} content Its generated content, before formatting.
 * @returns {boolean} Whether the file was already up to date.
 */
export function emit(file, content) {
  const path = fileURLToPath(file)
  const before = readFileSync(path, 'utf8')
  writeFileSync(path, content)
  execFileSync(vp, ['fmt', path], { stdio: 'ignore' })
  const upToDate = readFileSync(path, 'utf8') === before
  // A check never leaves the working tree changed.
  if (check && !upToDate) writeFileSync(path, before)
  return upToDate
}

/** Exit with an error when `--check` found stale files. */
export function finish(stale, what) {
  if (check && stale.length > 0) {
    console.error(`${what} out of date: ${stale.join(', ')}. Run \`pnpm readme\`.`)
    process.exit(1)
  }
}
