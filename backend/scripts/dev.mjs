import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(rootDir, 'src')
const watchPaths = new Set()
let serverProcess = null
let restartTimer = null
let building = false
let restartPending = false

async function collectWatchPaths(directory) {
  watchPaths.add(directory)

  const entries = await readdir(directory, { withFileTypes: true })
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => collectWatchPaths(path.join(directory, entry.name))),
  )
}

function runBuild() {
  return new Promise((resolve, reject) => {
    const buildProcess = spawn('npm run build', {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
    })

    buildProcess.on('exit', (code) => {
      if (code === 0) {
        resolve(undefined)
        return
      }

      reject(new Error(`Build exited with code ${code ?? 1}`))
    })

    buildProcess.on('error', reject)
  })
}

async function stopServer() {
  if (!serverProcess) {
    return
  }

  const processToStop = serverProcess
  serverProcess = null

  await new Promise((resolve) => {
    processToStop.once('exit', resolve)
    processToStop.kill()
  })
}

function startServer() {
  serverProcess = spawn('node', ['dist/server.js'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
  })

  serverProcess.on('exit', (code) => {
    if (serverProcess && code && code !== 0) {
      console.error(`Server exited with code ${code}`)
    }
  })
}

async function rebuildAndRestart() {
  if (building) {
    restartPending = true
    return
  }

  building = true

  try {
    await runBuild()
    await stopServer()
    startServer()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
  } finally {
    building = false

    if (restartPending) {
      restartPending = false
      void rebuildAndRestart()
    }
  }
}

function scheduleRestart(filePath) {
  if (filePath) {
    console.log(`File changed: ${filePath}`)
  }

  if (restartTimer) {
    clearTimeout(restartTimer)
  }

  restartTimer = setTimeout(() => {
    restartTimer = null
    void rebuildAndRestart()
  }, 150)
}

await collectWatchPaths(srcDir)
await rebuildAndRestart()

for (const watchPath of watchPaths) {
  const watcher = await import('node:fs').then(({ watch }) =>
    watch(watchPath, (eventType, fileName) => {
      if (!fileName || (!fileName.endsWith('.ts') && !fileName.endsWith('.d.ts'))) {
        return
      }

      scheduleRestart(path.join(watchPath, fileName))
    }),
  )

  watcher.on('error', (error) => {
    console.error(`Watcher error for ${watchPath}:`, error)
  })
}

process.on('SIGINT', async () => {
  await stopServer()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await stopServer()
  process.exit(0)
})
