// 读取研究库（纯 md + frontmatter）。库根不在本仓库里，由配置指定。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import matter from 'gray-matter'

export const SOURCE_DIRS = ['github', 'paper', 'video', 'xhs', 'wechat', 'web'] as const

export interface NoteMeta {
  id: string // 如 github/owner__repo
  source: string
  title: string
  url: string
  author: string
  captured: string
  published: string
  tags: string[]
  status: string
  verdict: string
  summary: string
  mtime: number
}

export interface Project {
  name: string
  title: string
  fields: Record<string, string>
  related: { id: string; title: string }[]
}

function expandHome(p: string) {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p
}

/** 库根：环境变量 RESEARCH_DIR > skill/config.local.md 里「库根」下第一个反引号路径 > ~/research */
export function resolveLibraryRoot(appDir: string): string {
  if (process.env.RESEARCH_DIR) return expandHome(process.env.RESEARCH_DIR)
  const cfg = path.resolve(appDir, '..', 'skill', 'config.local.md')
  try {
    const text = fs.readFileSync(cfg, 'utf-8')
    const m = text.match(/##\s*库根[\s\S]*?`([^`]+)`/)
    if (m) return expandHome(m[1].trim())
  } catch {
    /* 没有本地配置，用默认值 */
  }
  return path.join(os.homedir(), 'research')
}

function str(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).trim()
}

function summaryOf(body: string): string {
  const m = body.match(/^>\s*(.+)$/m)
  return m ? m[1].trim() : ''
}

function titleOf(body: string, fallback: string): string {
  const m = body.match(/^#\s+(.+)$/m)
  return m ? m[1].trim() : fallback
}

export function listNotes(root: string): NoteMeta[] {
  const out: NoteMeta[] = []
  for (const dir of SOURCE_DIRS) {
    const full = path.join(root, dir)
    let files: string[] = []
    try {
      files = fs.readdirSync(full).filter((f) => f.endsWith('.md'))
    } catch {
      continue
    }
    for (const f of files) {
      const file = path.join(full, f)
      try {
        const { data, content } = matter(fs.readFileSync(file, 'utf-8'))
        const name = f.replace(/\.md$/, '')
        const tags = Array.isArray(data.tags) ? data.tags.map(str).filter(Boolean) : []
        out.push({
          id: `${dir}/${name}`,
          source: str(data.source) || dir,
          title: str(data.title) || titleOf(content, name),
          url: str(data.url),
          author: str(data.author),
          captured: str(data.captured),
          published: str(data.published),
          tags,
          status: str(data.status) || 'quick',
          verdict: str(data.verdict),
          summary: summaryOf(content),
          mtime: fs.statSync(file).mtimeMs,
        })
      } catch {
        /* 单个文件解析失败不影响整体 */
      }
    }
  }
  return out.sort((a, b) => (b.captured || '').localeCompare(a.captured || '') || b.mtime - a.mtime)
}

/** id 必须形如 <来源目录>/<文件名>，防止路径穿越 */
export function readNote(root: string, id: string) {
  const m = id.match(/^([a-z]+)\/([^/\\]+)$/)
  if (!m || !(SOURCE_DIRS as readonly string[]).includes(m[1])) return null
  const file = path.resolve(root, m[1], `${m[2]}.md`)
  if (!file.startsWith(path.resolve(root) + path.sep)) return null
  try {
    const raw = fs.readFileSync(file, 'utf-8')
    const { data, content } = matter(raw)
    const meta = listNotes(root).find((n) => n.id === id)
    return { meta, frontmatter: data, body: content }
  } catch {
    return null
  }
}

export function listProjects(root: string, notes: NoteMeta[]): Project[] {
  let text = ''
  try {
    text = fs.readFileSync(path.join(root, '_context', 'projects.md'), 'utf-8')
  } catch {
    return []
  }
  const bodies = new Map<string, string>()
  for (const n of notes) {
    try {
      bodies.set(n.id, fs.readFileSync(path.join(root, `${n.id}.md`), 'utf-8').toLowerCase())
    } catch {
      /* ignore */
    }
  }
  const projects: Project[] = []
  const parts = text.split(/\n(?=##\s)/).slice(1)
  for (const part of parts) {
    const heading = part.split('\n')[0].replace(/^##\s*/, '').trim()
    if (!heading) continue
    const name = heading.replace(/[（(].*$/, '').trim()
    const fields: Record<string, string> = {}
    for (const line of part.split('\n').slice(1)) {
      const m = line.match(/^-\s+\*\*(.+?)\*\*[:：]\s*(.*)$/)
      if (m) fields[m[1].trim()] = m[2].trim()
    }
    const key = name.toLowerCase()
    const related = key
      ? notes
          .filter((n) => (bodies.get(n.id) || '').includes(key))
          .map((n) => ({ id: n.id, title: n.title }))
      : []
    projects.push({ name, title: heading, fields, related })
  }
  return projects
}
