import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const candidates = [
  path.join(frontendRoot, 'node_modules', 'eslint', 'bin', 'eslint.js'),
  path.join(frontendRoot, '.deps', 'node_modules', 'eslint', 'bin', 'eslint.js'),
]

const eslintPath = candidates.find((candidate) => existsSync(candidate))

if (!eslintPath) {
  console.error('Unable to locate an ESLint binary for the frontend lint command. Run npm install in frontend/.')
  process.exit(1)
}

const result = spawnSync(process.execPath, [eslintPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
