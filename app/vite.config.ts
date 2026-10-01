import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {
  HttpError,
  createCategory,
  deleteCategory,
  listCategories,
  listNotes,
  listProjects,
  readNote,
  resolveLibraryRoot,
  setNoteCategory,
  updateCategory,
} from './server/library'

const appDir = path.dirname(fileURLToPath(import.meta.url))

const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/

/** 读取请求体（JSON，最大 10KB）。超限时丢弃后续数据并返回 413，不强行断开连接 */
function readBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0
    let tooBig = false
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > 10_000) tooBig = true
      else if (!tooBig) chunks.push(c)
    })
    req.on('end', () => {
      if (tooBig) return reject(new HttpError(413, '请求体过大'))
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {})
      } catch {
        reject(new HttpError(400, 'JSON 格式错误'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * 本地 API：直接读写研究库目录，不需要单独后端。
 * 写操作（分类）的防护——因为浏览器里任何网页都能向 127.0.0.1 发请求：
 *   1. Host 必须是本机（防 DNS rebinding）
 *   2. 写请求必须带自定义头 x-ra-write: 1（跨站请求带自定义头会触发预检，而我们不开放 CORS）
 *   3. 写请求若带 Origin，必须与 Host 同源
 *   4. 写请求必须是 application/json
 */
function libraryApi(): Plugin {
  const handler = async (req: any, res: any, next: () => void) => {
    const url = new URL(req.url, 'http://localhost')
    if (!url.pathname.startsWith('/api/')) return next()
    const send = (code: number, body: unknown) => {
      res.statusCode = code
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(body))
    }
    try {
      const host = String(req.headers.host || '')
      if (!LOCAL_HOST.test(host)) throw new HttpError(403, '只允许本机访问')
      const method = req.method as string
      const root = resolveLibraryRoot(appDir)

      if (method === 'GET') {
        if (url.pathname === '/api/notes') return send(200, { root, notes: listNotes(root) })
        if (url.pathname === '/api/categories') return send(200, listCategories(root))
        if (url.pathname === '/api/note') {
          const note = readNote(root, url.searchParams.get('id') || '')
          return note ? send(200, note) : send(404, { error: '笔记不存在' })
        }
        if (url.pathname === '/api/projects') return send(200, { projects: listProjects(root, listNotes(root)) })
        return send(404, { error: '未知接口' })
      }

      // ── 写操作 ──
      if (req.headers['x-ra-write'] !== '1') throw new HttpError(403, '缺少写入标记')
      const origin = req.headers.origin
      if (origin && new URL(String(origin)).host !== host) throw new HttpError(403, '跨站请求被拒绝')
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
        throw new HttpError(415, '需要 application/json')
      }

      if (url.pathname === '/api/categories') {
        if (method === 'POST') {
          createCategory(root, await readBody(req))
          return send(200, { ok: true })
        }
        if (method === 'PATCH') return send(200, { ok: true, ...updateCategory(root, await readBody(req)) })
        if (method === 'DELETE') {
          return send(200, { ok: true, ...deleteCategory(root, url.searchParams.get('name') || '') })
        }
      }
      if (url.pathname === '/api/note' && method === 'PATCH') {
        const body = await readBody(req)
        setNoteCategory(root, String(body?.id || ''), body?.category ?? null)
        return send(200, { ok: true })
      }
      return send(405, { error: '不支持的操作' })
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message })
      console.error('[api]', e)
      return send(500, { error: '服务器内部错误' })
    }
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
  server: { host: '127.0.0.1', port: 5174, cors: false },
  preview: { host: '127.0.0.1', port: 5174, cors: false },
})
