import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {
  HttpError,
  addNoteImage,
  createCategory,
  createTerminology,
  createVoiceprint,
  deleteCategory,
  deleteTerminology,
  deleteVoiceprint,
  listCategories,
  listNotes,
  listProjects,
  listTerminology,
  listTasks,
  listVoiceprints,
  mergeVoiceprints,
  readNote,
  readNoteImage,
  removeNoteImage,
  readAudioClip,
  readMeetingAudio,
  resolveLibraryRoot,
  readNoteVideoFile,
  readVideoKeyframe,
  removeNoteVideo,
  setNoteCategory,
  setNoteTask,
  updateTerminology,
  updateVoiceprint,
  updateNoteImageNote,
  updateCategory,
  updateTaskStatus,
} from './server/library'

const appDir = path.dirname(fileURLToPath(import.meta.url))

const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/

/** 读取请求体（JSON，最大 10KB）。超限时丢弃后续数据并返回 413，不强行断开连接 */
function readBody(req: any, maxBytes = 10_000): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0
    let tooBig = false
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > maxBytes) tooBig = true
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
 *   5. 浏览器自带的 Sec-Fetch-Site 若存在，必须是 same-origin 或 none（直接输入网址）
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
        if (url.pathname === '/api/voiceprints') return send(200, listVoiceprints(root))
        if (url.pathname === '/api/terminology') return send(200, listTerminology(root))
        if (url.pathname === '/api/audio-clip') {
          const clip = readAudioClip(root, url.searchParams.get('kind') || '', url.searchParams.get('id') || '', url.searchParams.get('clip') || '')
          res.statusCode = 200
          res.setHeader('Content-Type', 'audio/mpeg')
          res.setHeader('Content-Length', String(clip.size))
          res.setHeader('Cache-Control', 'no-store')
          fs.createReadStream(clip.file).pipe(res)
          return
        }
        if (url.pathname === '/api/meeting-audio') {
          const audio = readMeetingAudio(root, url.searchParams.get('id') || '')
          res.setHeader('Content-Type', audio.contentType)
          res.setHeader('Accept-Ranges', 'bytes')
          res.setHeader('Cache-Control', 'no-store')
          const range = String(req.headers.range || '').match(/^bytes=(\d*)-(\d*)$/)
          if (range) {
            const start = range[1] ? Number(range[1]) : 0
            const end = range[2] ? Math.min(Number(range[2]), audio.size - 1) : audio.size - 1
            if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= audio.size) {
              res.statusCode = 416
              res.setHeader('Content-Range', `bytes */${audio.size}`)
              res.end()
              return
            }
            res.statusCode = 206
            res.setHeader('Content-Range', `bytes ${start}-${end}/${audio.size}`)
            res.setHeader('Content-Length', String(end - start + 1))
            fs.createReadStream(audio.file, { start, end }).pipe(res)
            return
          }
          res.statusCode = 200
          res.setHeader('Content-Length', String(audio.size))
          fs.createReadStream(audio.file).pipe(res)
          return
        }
        if (url.pathname === '/api/note-video') {
          const video = readNoteVideoFile(root, url.searchParams.get('id') || '')
          res.setHeader('Content-Type', video.contentType)
          res.setHeader('Accept-Ranges', 'bytes')
          res.setHeader('Cache-Control', 'no-store')
          const range = String(req.headers.range || '').match(/^bytes=(\d*)-(\d*)$/)
          if (range) {
            const start = range[1] ? Number(range[1]) : 0
            const end = range[2] ? Math.min(Number(range[2]), video.size - 1) : video.size - 1
            if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= video.size) {
              res.statusCode = 416
              res.setHeader('Content-Range', `bytes */${video.size}`)
              res.end()
              return
            }
            res.statusCode = 206
            res.setHeader('Content-Range', `bytes ${start}-${end}/${video.size}`)
            res.setHeader('Content-Length', String(end - start + 1))
            fs.createReadStream(video.file, { start, end }).pipe(res)
            return
          }
          res.statusCode = 200
          res.setHeader('Content-Length', String(video.size))
          fs.createReadStream(video.file).pipe(res)
          return
        }
        if (url.pathname === '/api/note') {
          const note = readNote(root, url.searchParams.get('id') || '')
          return note ? send(200, note) : send(404, { error: '笔记不存在' })
        }
        if (url.pathname === '/api/note-image') {
          const image = readNoteImage(root, url.searchParams.get('id') || '', url.searchParams.get('index') || '', url.searchParams.get('name') || '')
          res.statusCode = 200
          res.setHeader('Content-Type', image.contentType)
          res.setHeader('Content-Length', String(image.size))
          res.setHeader('Cache-Control', 'private, max-age=3600')
          fs.createReadStream(image.file).pipe(res)
          return
        }
        if (url.pathname === '/api/video-keyframe') {
          const image = readVideoKeyframe(root, url.searchParams.get('id') || '', url.searchParams.get('index') || '')
          res.statusCode = 200
          res.setHeader('Content-Type', image.contentType)
          res.setHeader('Content-Length', String(image.size))
          res.setHeader('Cache-Control', 'private, max-age=3600')
          fs.createReadStream(image.file).pipe(res)
          return
        }
        if (url.pathname === '/api/projects') return send(200, { projects: listProjects(root, listNotes(root)) })
        if (url.pathname === '/api/tasks') return send(200, { tasks: listTasks(root, listNotes(root)) })
        return send(404, { error: '未知接口' })
      }

      // ── 写操作 ──
      if (req.headers['x-ra-write'] !== '1') throw new HttpError(403, '缺少写入标记')
      const origin = req.headers.origin
      if (origin !== undefined) {
        let originHost = ''
        try {
          originHost = new URL(String(origin)).host
        } catch {
          /* Origin: null（沙箱 iframe、file://）等无法解析的值，按跨站处理 */
        }
        if (originHost !== host) throw new HttpError(403, '跨站请求被拒绝')
      }
      const site = req.headers['sec-fetch-site']
      if (site !== undefined && site !== 'same-origin' && site !== 'none') throw new HttpError(403, '跨站请求被拒绝')
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
      if (url.pathname === '/api/tasks' && method === 'PATCH') {
        return send(200, { ok: true, task: updateTaskStatus(root, await readBody(req)) })
      }
      if (url.pathname === '/api/voiceprints') {
        if (method === 'POST') return send(200, { ok: true, profile: createVoiceprint(root, await readBody(req)) })
        if (method === 'PATCH') return send(200, { ok: true, profile: updateVoiceprint(root, await readBody(req)) })
        if (method === 'DELETE') {
          deleteVoiceprint(root, url.searchParams.get('id') || '')
          return send(200, { ok: true })
        }
      }
      if (url.pathname === '/api/voiceprints/merge' && method === 'POST') {
        return send(200, { ok: true, profile: mergeVoiceprints(root, await readBody(req)) })
      }
      if (url.pathname === '/api/terminology') {
        if (method === 'POST') return send(200, { ok: true, term: createTerminology(root, await readBody(req)) })
        if (method === 'PATCH') return send(200, { ok: true, term: updateTerminology(root, await readBody(req)) })
        if (method === 'DELETE') {
          deleteTerminology(root, url.searchParams.get('id') || '')
          return send(200, { ok: true })
        }
      }
      if (url.pathname === '/api/note-video' && method === 'DELETE') {
        return send(200, { ok: true, ...removeNoteVideo(root, url.searchParams.get('id') || '') })
      }
      if (url.pathname === '/api/note' && method === 'PATCH') {
        const body = await readBody(req)
        const hasCategory = Object.prototype.hasOwnProperty.call(body, 'category')
        const hasTask = Object.prototype.hasOwnProperty.call(body, 'task')
        if (hasCategory === hasTask) throw new HttpError(400, '必须且只能更新分类或短期任务其中一项')
        if (hasCategory) setNoteCategory(root, String(body?.id || ''), body.category ?? null)
        else setNoteTask(root, String(body?.id || ''), body.task ?? null)
        return send(200, { ok: true })
      }
      if (url.pathname === '/api/note-image') {
        if (method === 'POST') return send(200, { ok: true, image: addNoteImage(root, await readBody(req, 11_300_000)) })
        if (method === 'PATCH') return send(200, { ok: true, image: updateNoteImageNote(root, await readBody(req)) })
        if (method === 'DELETE') return send(200, { ok: true, ...removeNoteImage(root, url.searchParams.get('id') || '', url.searchParams.get('name') || '') })
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
