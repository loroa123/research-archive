import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { listNotes, listProjects, readNote, resolveLibraryRoot } from './server/library'

const appDir = path.dirname(fileURLToPath(import.meta.url))

/** 开发/预览服务器上的只读 API：直接读研究库目录，不需要单独后端 */
function libraryApi(): Plugin {
  const handler = (req: any, res: any, next: () => void) => {
    const url = new URL(req.url, 'http://localhost')
    if (!url.pathname.startsWith('/api/')) return next()
    const root = resolveLibraryRoot(appDir)
    const send = (code: number, body: unknown) => {
      res.statusCode = code
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    }
    if (req.method !== 'GET') return send(405, { error: 'read-only' })
    if (url.pathname === '/api/notes') return send(200, { root, notes: listNotes(root) })
    if (url.pathname === '/api/note') {
      const note = readNote(root, url.searchParams.get('id') || '')
      return note ? send(200, note) : send(404, { error: 'not found' })
    }
    if (url.pathname === '/api/projects') {
      return send(200, { projects: listProjects(root, listNotes(root)) })
    }
    return send(404, { error: 'unknown endpoint' })
  }
  return {
    name: 'library-api',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), libraryApi()],
  // 只监听本机，研究库内容是私有数据
  server: { host: '127.0.0.1', port: 5174 },
  preview: { host: '127.0.0.1', port: 5174 },
})
