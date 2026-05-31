import { createRequire } from 'node:module'
import { mkdir, readFile, rm, writeFile, cp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const esbuild = require('../.builddeps/node_modules/esbuild-wasm')

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(rootDir, 'dist')
const assetsDir = path.join(distDir, 'assets')

await rm(distDir, { recursive: true, force: true })
await mkdir(assetsDir, { recursive: true })

await esbuild.build({
  entryPoints: [path.join(rootDir, 'src', 'main.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  absWorkingDir: rootDir,
  external: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  outdir: assetsDir,
  entryNames: 'app',
  assetNames: '[name]',
  sourcemap: false,
  jsx: 'automatic',
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL ?? 'http://localhost:4000/api'),
  },
})

const html = await readFile(path.join(rootDir, 'index.html'), 'utf8')
const patchedHtml = html
  .replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <script type="importmap">\n      {\n        "imports": {\n          "react": "https://esm.sh/react@19.2.6",\n          "react-dom/client": "https://esm.sh/react-dom@19.2.6/client",\n          "react/jsx-runtime": "https://esm.sh/react@19.2.6/jsx-runtime",\n          "react/jsx-dev-runtime": "https://esm.sh/react@19.2.6/jsx-dev-runtime"\n        }\n      }\n    </script>',
  )
  .replace('<script type="module" src="/src/main.tsx"></script>', '<link rel="stylesheet" href="./assets/app.css" />\n    <script type="module" src="./assets/app.js"></script>')
  .replace('href="/favicon.svg"', 'href="./favicon.svg"')
  .replace('<title>frontend</title>', '<title>TaskFlow</title>')

await writeFile(path.join(distDir, 'index.html'), patchedHtml)

for (const fileName of ['favicon.svg', 'icons.svg']) {
  const sourcePath = path.join(rootDir, 'public', fileName)

  if (existsSync(sourcePath)) {
    await cp(sourcePath, path.join(distDir, fileName))
  }
}