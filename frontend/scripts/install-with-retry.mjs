import { spawn } from 'node:child_process'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const args = process.argv.length > 2 ? process.argv.slice(2) : ['install']

const maxAttempts = Number(process.env.INSTALL_RETRIES ?? 3)
const timeoutMs = Number(process.env.INSTALL_TIMEOUT_MS ?? 300000)
const retryCleanupMode = (process.env.INSTALL_RETRY_CLEANUP ?? 'partial').toLowerCase()

if (!Number.isFinite(maxAttempts) || maxAttempts < 1) {
  console.error('INSTALL_RETRIES must be a positive number')
  process.exit(1)
}

if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
  console.error('INSTALL_TIMEOUT_MS must be at least 1000')
  process.exit(1)
}

if (!['none', 'partial', 'full'].includes(retryCleanupMode)) {
  console.error("INSTALL_RETRY_CLEANUP must be one of 'none', 'partial', or 'full'")
  process.exit(1)
}

async function cleanupRetryArtifacts() {
  if (retryCleanupMode === 'none') {
    return
  }

  const nodeModulesPath = join(process.cwd(), 'node_modules')

  if (retryCleanupMode === 'full') {
    await rm(nodeModulesPath, { recursive: true, force: true })
    return
  }

  let entries = []
  try {
    entries = await readdir(nodeModulesPath, { withFileTypes: true })
  } catch {
    return
  }

  const transientDirs = entries.filter((entry) => entry.isDirectory() && /^\.[^-]+-.+/.test(entry.name))

  await Promise.all(
    transientDirs.map((entry) => rm(join(nodeModulesPath, entry.name), { recursive: true, force: true }))
  )
}

function runAttempt(attempt) {
  return new Promise((resolve) => {
    const child =
      process.platform === 'win32'
        ? spawn([command, ...args].join(' '), {
            stdio: 'inherit',
            env: process.env,
            shell: true,
          })
        : spawn(command, args, {
            stdio: 'inherit',
            env: process.env,
            shell: false,
          })

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5000).unref()
    }, timeoutMs)

    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, timedOut })
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      console.error(error)
      resolve({ code: 1, timedOut: false })
    })
  })
}

async function main() {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`Install attempt ${attempt}/${maxAttempts}: npm ${args.join(' ')}`)
    const result = await runAttempt(attempt)

    if (result.code === 0) {
      console.log('Install completed successfully')
      process.exit(0)
    }

    const reason = result.timedOut
      ? `timed out after ${timeoutMs}ms`
      : `failed with exit code ${result.code}`

    if (attempt < maxAttempts) {
      try {
        await cleanupRetryArtifacts()
      } catch (error) {
        console.warn(`Retry cleanup failed: ${error.message}`)
      }
      console.warn(`Install ${reason}. Retrying...`)
    } else {
      console.error(`Install ${reason}. No retries left.`)
      process.exit(result.code)
    }
  }
}

main()
