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
  category: string
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
      // 跳过点文件（编辑器临时文件、隐藏文件）：它们的 id 也不会被读写接口接受，列出来只会产生点不开的卡片
      files = fs.readdirSync(full).filter((f) => f.endsWith('.md') && !f.startsWith('.'))
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
          category: str(data.category),
          summary: summaryOf(content),
          mtime: fs.statSync(file).mtimeMs,
        })
      } catch {
        /* 单个文件解析失败不影响整体 */
      }
    }
  }
  // 同一天按 id 排，不按修改时间——否则每次改分类卡片都会换位置
  return out.sort((a, b) => (b.captured || '').localeCompare(a.captured || '') || a.id.localeCompare(b.id))
}

/** 笔记 id 必须形如 <来源目录>/<文件名>：目录在白名单内，文件名不含路径分隔符、控制字符，不以点开头 */
function parseNoteId(id: string): [string, string] | null {
  const m = id.match(/^([a-z]+)\/([^/\\\u0000-\u001f]{1,200})$/)
  if (!m || m[2].startsWith('.') || !(SOURCE_DIRS as readonly string[]).includes(m[1])) return null
  return [m[1], m[2]]
}

export function readNote(root: string, id: string) {
  const parsed = parseNoteId(id)
  if (!parsed) return null
  const file = path.resolve(root, parsed[0], `${parsed[1]}.md`)
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


// ───────────────────────── 分类（可写）─────────────────────────
export const CATEGORY_COLORS = ['sky', 'violet', 'orange', 'rose', 'teal', 'amber', 'emerald', 'zinc'] as const

export interface CategoryDef {
  name: string
  color: string
}
export interface CategoryInfo extends CategoryDef {
  count: number
  registered: boolean // false 表示只在笔记里出现、不在 categories.json 里
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

const categoriesFile = (root: string) => path.join(root, '_context', 'categories.json')

function readCategoryDefs(root: string): CategoryDef[] {
  try {
    const j = JSON.parse(fs.readFileSync(categoriesFile(root), 'utf-8'))
    return (Array.isArray(j.categories) ? j.categories : [])
      .filter((c: any) => c && typeof c.name === 'string' && c.name.trim())
      .map((c: any) => ({
        name: c.name.trim(),
        color: (CATEGORY_COLORS as readonly string[]).includes(c.color) ? c.color : 'sky',
      }))
  } catch {
    return []
  }
}

/** 原子写：先写临时文件再重命名，避免写到一半崩掉留下半个文件 */
function atomicWrite(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-ra-${process.pid}`
  fs.writeFileSync(tmp, text, 'utf-8')
  fs.renameSync(tmp, file)
}

function writeCategoryDefs(root: string, defs: CategoryDef[]) {
  atomicWrite(categoriesFile(root), JSON.stringify({ categories: defs }, null, 2) + '\n')
}

export function listCategories(root: string): { categories: CategoryInfo[]; uncategorized: number; total: number } {
  const notes = listNotes(root)
  const defs = readCategoryDefs(root)
  const counts = new Map<string, number>()
  for (const n of notes) if (n.category) counts.set(n.category, (counts.get(n.category) || 0) + 1)
  const categories: CategoryInfo[] = defs.map((d) => ({ ...d, count: counts.get(d.name) || 0, registered: true }))
  for (const [name, count] of counts) {
    if (!defs.some((d) => d.name === name)) categories.push({ name, color: 'zinc', count, registered: false })
  }
  return { categories, uncategorized: notes.filter((n) => !n.category).length, total: notes.length }
}

/** 控制字符、不可见格式字符（零宽、双向覆盖等）、行/段分隔符、孤立代理项 */
const BAD_NAME_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}]/u
/** 前端用这个值表示「未分类」筛选，不能被分类名占用 */
const RESERVED_NAMES = new Set(['__none__'])
export const MAX_CATEGORIES = 100

function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') throw new HttpError(400, '分类名必须是文字')
  // NFC 归一化：避免 é 的两种 Unicode 写法造成肉眼无法区分的重复分类
  const name = raw.normalize('NFC').trim()
  if (!name) throw new HttpError(400, '分类名不能为空')
  if (name.length > 30) throw new HttpError(400, '分类名最长 30 个字符')
  if (BAD_NAME_CHARS.test(name)) throw new HttpError(400, '分类名不能包含换行、控制字符或不可见字符')
  if (RESERVED_NAMES.has(name)) throw new HttpError(400, '这个名字是系统保留的')
  return name
}

function cleanColor(raw: unknown, fallback = 'sky'): string {
  if (raw == null || raw === '') return fallback
  if (typeof raw === 'string' && (CATEGORY_COLORS as readonly string[]).includes(raw)) return raw
  throw new HttpError(400, '不支持的颜色')
}

/**
 * YAML 标量：只有「以字母开头、只含字母数字和少量安全符号、且不是 YAML 保留词」的才原样写，
 * 其余一律加双引号。以字母开头就排除了数字、十六进制/八进制/科学计数、日期时间、.inf/.nan 等
 * 会被解析成非字符串的写法；保留词包括 YAML 1.1 的 y/n/yes/no/on/off，兼容不同的解析器。
 */
const YAML_RESERVED = /^(y|n|yes|no|on|off|true|false|null|nil|none)$/i
function yamlScalar(v: string): string {
  const plain = /^\p{L}[\p{L}\p{N} _\-/.&]*$/u.test(v) && !YAML_RESERVED.test(v) && v === v.trim()
  return plain ? v : JSON.stringify(v)
}

/** 只改 frontmatter 里 key 那一行（没有就插到 verdict 后或块末尾），不重排其他内容和注释 */
export function editFrontmatterLine(text: string, key: string, value: string | null): string {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) throw new HttpError(422, '笔记没有 frontmatter，无法写入')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = m[1].split(/\r?\n/)
  const idx = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l))
  const rendered = value === null ? null : `${key}: ${yamlScalar(value)}`
  if (idx >= 0) {
    if (rendered === null) lines.splice(idx, 1)
    else lines[idx] = rendered
  } else if (rendered !== null) {
    const vi = lines.findIndex((l) => /^verdict\s*:/.test(l))
    lines.splice(vi >= 0 ? vi + 1 : lines.length, 0, rendered)
  }
  return text.replace(m[0], () => `---${eol}${lines.join(eol)}${eol}---`)
}

function noteFile(root: string, id: string): string {
  const parsed = parseNoteId(id)
  if (!parsed) throw new HttpError(400, '无效的笔记 id')
  const file = path.resolve(root, parsed[0], `${parsed[1]}.md`)
  if (!file.startsWith(path.resolve(root) + path.sep)) throw new HttpError(400, '无效的笔记 id')
  if (!fs.existsSync(file)) throw new HttpError(404, '笔记不存在')
  return file
}

export function setNoteCategory(root: string, id: string, category: string | null) {
  const file = noteFile(root, id)
  const value = category === null || category === '' ? null : cleanName(category)
  atomicWrite(file, editFrontmatterLine(fs.readFileSync(file, 'utf-8'), 'category', value))
}

export function createCategory(root: string, body: any) {
  const name = cleanName(body?.name)
  const defs = readCategoryDefs(root)
  if (defs.length >= MAX_CATEGORIES) throw new HttpError(400, `分类最多 ${MAX_CATEGORIES} 个`)
  if (defs.some((d) => d.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, '已有同名分类')
  const color = cleanColor(body?.color, CATEGORY_COLORS[defs.length % (CATEGORY_COLORS.length - 1)])
  writeCategoryDefs(root, [...defs, { name, color }])
}

/** 改名（同步改所有相关笔记）和/或改颜色 */
export function updateCategory(root: string, body: any): { renamedNotes: number } {
  const from = cleanName(body?.name)
  const defs = readCategoryDefs(root)
  const notes = listNotes(root).filter((n) => n.category === from)
  const existing = defs.find((d) => d.name === from)
  if (!existing && notes.length === 0) throw new HttpError(404, '分类不存在')
  const to = body?.newName == null ? from : cleanName(body.newName)
  if (to !== from && defs.concat(listCategories(root).categories).some((d) => d.name.toLowerCase() === to.toLowerCase() && d.name !== from)) {
    throw new HttpError(409, '已有同名分类')
  }
  const color = cleanColor(body?.color, existing?.color || 'zinc')
  // 先改笔记，再写清单：中途失败时清单仍是旧名，笔记里的新名会作为「未登记」分类显示，不会丢
  if (to !== from) for (const n of notes) setNoteCategory(root, n.id, to)
  const next = existing ? defs.map((d) => (d.name === from ? { name: to, color } : d)) : [...defs, { name: to, color }]
  writeCategoryDefs(root, next)
  return { renamedNotes: to !== from ? notes.length : 0 }
}

/** 删除分类：清掉相关笔记的 category 行（笔记正文不动） */
export function deleteCategory(root: string, name: string): { clearedNotes: number } {
  const target = cleanName(name)
  const defs = readCategoryDefs(root)
  const notes = listNotes(root).filter((n) => n.category === target)
  if (!defs.some((d) => d.name === target) && notes.length === 0) throw new HttpError(404, '分类不存在')
  for (const n of notes) setNoteCategory(root, n.id, null)
  writeCategoryDefs(root, defs.filter((d) => d.name !== target))
  return { clearedNotes: notes.length }
}
