import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const candidates = [
  path.join(frontendRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
  path.join(frontendRoot, '..', 'backend', 'node_modules', 'typescript', 'bin', 'tsc'),
]

const tscPath = candidates.find((candidate) => existsSync(candidate))

if (!tscPath) {
  console.error('Unable to locate a TypeScript compiler binary for the frontend build.')
  process.exit(1)
}

const result = spawnSync(process.execPath, [tscPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
