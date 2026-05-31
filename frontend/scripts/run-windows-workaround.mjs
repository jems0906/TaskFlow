import { spawn } from 'node:child_process'
import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRootBase = process.env.TASKFLOW_WINDOWS_FRONTEND_ROOT ?? 'C:/temp/taskflow-frontend-check'
const tempRoot = `${tempRootBase}-${process.pid}`
const mode = process.argv[2] ?? 'check'
const ignoredEntries = new Set(['node_modules', '.npm-cache', '.deps', 'dist'])
const systemDrive = (process.env.SystemDrive ?? 'C:').toLowerCase()
const workspaceDrive = path.parse(rootDir).root.replace(/[\\/]+$/, '').toLowerCase()

const commandPlans = {
  lint: {
    local: ['_lint'],
    staged: ['install:retry', '_lint'],
  },
  build: {
    local: ['_build'],
    staged: ['install:retry', '_build'],
    copyDistBack: true,
  },
  dev: {
    local: ['_build', '_preview'],
    staged: ['install:retry', '_build'],
    copyDistBack: true,
    serveLocalPreview: true,
  },
  preview: {
    local: ['_preview'],
    staged: ['_preview'],
  },
  check: {
    local: ['install:retry', '_lint', '_build'],
    staged: ['install:retry', '_lint', '_build'],
    copyDistBack: true,
  },
}

const plan = commandPlans[mode]

if (!plan) {
  console.error(`Unsupported command mode: ${mode}`)
  process.exit(1)
}

function needsWindowsStaging() {
  return process.platform === 'win32' && workspaceDrive !== systemDrive
}

async function syncFrontendToSystemDrive() {
  await rm(tempRoot, { recursive: true, force: true })
  await mkdir(tempRoot, { recursive: true })
  await cp(rootDir, tempRoot, {
    recursive: true,
    filter: (source) => {
      const relativePath = path.relative(rootDir, source)

      if (!relativePath) {
        return true
      }

      const firstSegment = relativePath.split(path.sep)[0]
      return !ignoredEntries.has(firstSegment)
    },
  })
}

async function copyDistBack() {
  await rm(path.join(rootDir, 'dist'), { recursive: true, force: true })
  await cp(path.join(tempRoot, 'dist'), path.join(rootDir, 'dist'), { recursive: true })
}

function runNpmScript(scriptName, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(`npm run ${scriptName}`, {
      cwd,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        INSTALL_TIMEOUT_MS: process.env.INSTALL_TIMEOUT_MS ?? '180000',
        INSTALL_RETRIES: process.env.INSTALL_RETRIES ?? '2',
        INSTALL_RETRY_CLEANUP: process.env.INSTALL_RETRY_CLEANUP ?? 'full',
      },
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve(undefined)
        return
      }

      reject(new Error(`npm run ${scriptName} exited with code ${code ?? 1}`))
    })

    child.on('error', reject)
  })
}

if (!needsWindowsStaging()) {
  for (const command of plan.local) {
    await runNpmScript(command, rootDir)
  }

  process.exit(0)
}

await syncFrontendToSystemDrive()

for (const command of plan.staged) {
  console.log(`Running ${command} in ${tempRoot}`)
  await runNpmScript(command, tempRoot)
}

if (plan.copyDistBack) {
  await copyDistBack()
}

if (plan.serveLocalPreview) {
  await runNpmScript('_preview', rootDir)
}
