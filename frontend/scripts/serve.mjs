import { createReadStream, existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(rootDir, 'dist')
const port = Number(process.env.PORT ?? 5173)

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8'
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8'
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filePath.endsWith('.svg')) return 'image/svg+xml'
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
  return 'application/octet-stream'
}

function resolvePath(urlPath) {
  const normalized = urlPath === '/' ? '/index.html' : urlPath
  const filePath = path.join(distDir, normalized)

  if (!filePath.startsWith(distDir)) {
    return null
  }

  return filePath
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  let filePath = resolvePath(requestUrl.pathname)

  if (!filePath || !existsSync(filePath)) {
    filePath = path.join(distDir, 'index.html')
  }

  try {
    const stats = statSync(filePath)

    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html')
    }

    response.writeHead(200, { 'Content-Type': contentType(filePath) })
    createReadStream(filePath).pipe(response)
  } catch {
    response.statusCode = 404
    response.end('Not found')
  }
})

server.listen(port, () => {
  console.log(`TaskFlow frontend serving on http://localhost:${port}`)
})