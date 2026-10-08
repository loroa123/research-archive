// 读取研究库（纯 md + frontmatter）。库根不在本仓库里，由配置指定。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { parse as parseYaml } from 'yaml'

export const SOURCE_DIRS = ['github', 'paper', 'video', 'self-upload', 'xhs', 'wechat', 'web'] as const

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
  task: string
  summary: string
  mtime: number
}

export interface MeetingTurn {
  start: number
  end: number
  speaker: string
  speakerId: string
  text: string
}

export interface MeetingTranscript {
  duration: number
  speakers: { id: string; name: string }[]
  turns: MeetingTurn[]
}

export interface VideoCue {
  start: number
  end: number
  text: string
}

export interface VideoSegment extends VideoCue {
  speaker: string
  speakerId: string
}

export interface VideoKeyframe {
  index: number
  name: string
  time: number
  reason: string
}

export interface VideoComparison {
  platformVsLocal: number | null
  platformVsQwen: number | null
  localVsQwen: number | null
  localRuntime: number | null
  qwenRuntime: number | null
  qwenTokens: number | null
  correctionCount: number
}

export interface NoteVideo {
  duration: number
  cueCount: number
  available: boolean
  sourceUrl: string
  sourceLabel: string
  cues: VideoCue[]
  segments: VideoSegment[]
  keyframes: VideoKeyframe[]
  sceneThreshold: number | null
  maxGapSeconds: number | null
  comparison: VideoComparison | null
}

export interface NoteImage {
  index: number
  name: string
  note: string
  added: boolean
}

export interface Project {
  name: string
  title: string
  fields: Record<string, string>
  related: { id: string; title: string }[]
}

export interface ResearchTask {
  id: string
  title: string
  status: string
  created: string
  updated: string
  summary: string
  body: string
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

function parseMatter(raw: string): { data: Record<string, unknown>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return { data: {}, content: raw }
  const parsed = parseYaml(match[1])
  const data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  return { data, content: raw.slice(match[0].length) }
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
        const { data, content } = parseMatter(fs.readFileSync(file, 'utf-8'))
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
          task: str(data.task),
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
  const m = id.match(/^([a-z]+(?:-[a-z]+)*)\/([^/\\\u0000-\u001f]{1,200})$/)
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
    const { data, content } = parseMatter(raw)
    const meta = listNotes(root).find((n) => n.id === id)
    return { meta, frontmatter: data, body: content, meeting: readMeetingTranscript(root, data), video: readNoteVideo(root, data, str(data.url)), images: readNoteImages(root, id, data) }
  } catch {
    return null
  }
}

function xhsImageNotesFile(root: string) {
  return path.join(root, '_context', 'xhs-image-notes.json')
}

function readXhsImageNotes(root: string): Record<string, Record<string, string>> {
  try {
    const raw = JSON.parse(fs.readFileSync(xhsImageNotesFile(root), 'utf-8'))
    return raw && typeof raw.notes === 'object' && raw.notes ? raw.notes : {}
  } catch {
    return {}
  }
}

function writeXhsImageNotes(root: string, notes: Record<string, Record<string, string>>) {
  const file = xhsImageNotesFile(root)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify({ notes }, null, 2)}\n`)
}

function readNoteImages(root: string, id: string, frontmatter: Record<string, unknown>): NoteImage[] {
  if (typeof frontmatter.xhs_image_dir !== 'string' || !frontmatter.xhs_image_dir.trim()) return []
  const rawRoot = path.resolve(root, '_raw')
  const dir = path.resolve(root, frontmatter.xhs_image_dir.trim())
  if (!dir.startsWith(rawRoot + path.sep)) return []
  try {
    const realRoot = fs.realpathSync(rawRoot)
    const realDir = fs.realpathSync(dir)
    if (!realDir.startsWith(realRoot + path.sep) || !fs.statSync(realDir).isDirectory()) return []
    const notes = readXhsImageNotes(root)[id] || {}
    return fs.readdirSync(realDir)
      .filter((name) => /^image-(?:\d+|added-[a-f0-9-]+)\.(?:webp|png|jpe?g)$/i.test(name))
      .sort()
      .slice(0, 50)
      .map((name, index) => ({ index, name, note: typeof notes[name] === 'string' ? notes[name] : '', added: name.startsWith('image-added-') }))
  } catch {
    return []
  }
}

function xhsImageContext(root: string, id: string) {
  const parsed = parseNoteId(id)
  if (!parsed || parsed[0] !== 'xhs') throw new HttpError(400, '只支持小红书笔记图片')
  const note = readNote(root, id)
  if (!note) throw new HttpError(404, '笔记不存在')
  if (typeof note.frontmatter.xhs_image_dir !== 'string') throw new HttpError(400, '笔记未登记原图目录')
  const rawRoot = path.resolve(root, '_raw')
  const dir = path.resolve(root, note.frontmatter.xhs_image_dir.trim())
  if (!dir.startsWith(rawRoot + path.sep)) throw new HttpError(400, '原图目录不合法')
  const realRoot = fs.realpathSync(rawRoot)
  const realDir = fs.realpathSync(dir)
  if (!realDir.startsWith(realRoot + path.sep) || !fs.statSync(realDir).isDirectory()) throw new HttpError(400, '原图目录不合法')
  return { note, dir: realDir }
}

function imageName(raw: unknown) {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!/^image-(?:\d+|added-[a-f0-9-]+)\.(?:webp|png|jpe?g)$/i.test(name)) throw new HttpError(400, '图片名称不合法')
  return name
}

export function updateNoteImageNote(root: string, body: any) {
  const id = typeof body?.id === 'string' ? body.id : ''
  const { note, dir } = xhsImageContext(root, id)
  const name = imageName(body?.name)
  if (!note.images.some((x) => x.name === name) || !fs.existsSync(path.join(dir, name))) throw new HttpError(404, '图片不存在')
  if (typeof body?.note !== 'string') throw new HttpError(400, '备注格式错误')
  const value = body.note.trim()
  if (value.length > 2000) throw new HttpError(400, '备注不能超过 2000 个字符')
  const notes = readXhsImageNotes(root)
  notes[id] = { ...(notes[id] || {}) }
  if (value) notes[id][name] = value
  else delete notes[id][name]
  writeXhsImageNotes(root, notes)
  return { index: note.images.findIndex((x) => x.name === name), name, note: value, added: name.startsWith('image-added-') }
}

export function addNoteImage(root: string, body: any) {
  const id = typeof body?.id === 'string' ? body.id : ''
  const { dir } = xhsImageContext(root, id)
  const filename = typeof body?.filename === 'string' ? body.filename : ''
  const dataUrl = typeof body?.dataUrl === 'string' ? body.dataUrl : ''
  const match = dataUrl.match(/^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw new HttpError(400, '只支持 PNG、JPEG、WEBP 图片')
  const data = Buffer.from(match[2], 'base64')
  if (!data.length || data.length > 8 * 1024 * 1024) throw new HttpError(400, '图片大小必须在 8MB 以内')
  const mime = match[1]
  const valid = mime === 'image/png'
    ? data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : mime === 'image/jpeg'
      ? data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
      : data.length >= 12 && data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP'
  if (!valid) throw new HttpError(400, '图片内容与格式不匹配')
  const sourceExt = path.extname(filename).toLowerCase()
  const ext = mime === 'image/png' ? '.png' : mime === 'image/jpeg' ? (sourceExt === '.jpeg' ? '.jpeg' : '.jpg') : '.webp'
  const name = `image-added-${randomUUID()}${ext}`
  fs.writeFileSync(path.join(dir, name), data, { flag: 'wx' })
  return { index: readNote(root, id)?.images.findIndex((x) => x.name === name) ?? -1, name, note: '', added: true }
}

export function removeNoteImage(root: string, id: string, rawName: string) {
  const { note, dir } = xhsImageContext(root, id)
  const name = imageName(rawName)
  if (!note.images.some((x) => x.name === name)) throw new HttpError(404, '图片不存在')
  const source = path.join(dir, name)
  const removedDir = path.join(dir, '_removed')
  fs.mkdirSync(removedDir, { recursive: true })
  const target = path.join(removedDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${name}`)
  fs.renameSync(source, target)
  return { name, recoverable: true }
}

export function readNoteImage(root: string, id: string, indexRaw: string, nameRaw = '') {
  const note = readNote(root, id)
  if (!note) throw new HttpError(404, '笔记不存在')
  let index = Number(indexRaw)
  if (nameRaw) {
    const name = imageName(nameRaw)
    index = note.images.findIndex((x) => x.name === name)
  }
  if (!Number.isInteger(index) || index < 0 || index >= note.images.length) throw new HttpError(404, '图片不存在')
  const dir = String(note.frontmatter.xhs_image_dir || '').trim()
  const file = privateRawFile(root, path.join(dir, note.images[index].name), ['.webp', '.png', '.jpg', '.jpeg'])
  if (!file) throw new HttpError(404, '图片不存在')
  const types: Record<string, string> = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }
  return { file, size: fs.statSync(file).size, contentType: types[path.extname(file).toLowerCase()] }
}

function privateRawFile(root: string, value: unknown, extensions: string[]) {
  if (typeof value !== 'string' || !value.trim()) return null
  const rawRoot = path.resolve(root, '_raw')
  const file = path.resolve(root, value.trim())
  if (!file.startsWith(rawRoot + path.sep) || !extensions.includes(path.extname(file).toLowerCase())) return null
  try {
    const realRoot = fs.realpathSync(rawRoot)
    const realFile = fs.realpathSync(file)
    if (!realFile.startsWith(realRoot + path.sep) || !fs.statSync(realFile).isFile()) return null
    return realFile
  } catch {
    return null
  }
}

function privateRawDir(root: string, value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const rawRoot = path.resolve(root, '_raw')
  const dir = path.resolve(root, value.trim())
  if (!dir.startsWith(rawRoot + path.sep)) return null
  try {
    const realRoot = fs.realpathSync(rawRoot)
    const realDir = fs.realpathSync(dir)
    if (!realDir.startsWith(realRoot + path.sep) || !fs.statSync(realDir).isDirectory()) return null
    return realDir
  } catch {
    return null
  }
}

function srtSeconds(value: string) {
  const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/)
  if (!match) return null
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000
}

function parseSrt(text: string): VideoCue[] {
  return text.trim().split(/\r?\n\s*\r?\n/).map((block) => {
    const lines = block.split(/\r?\n/)
    const timing = lines.findIndex((line) => line.includes('-->'))
    if (timing < 0) return null
    const [startRaw, endRaw] = lines[timing].split('-->').map((x) => x.trim())
    const start = srtSeconds(startRaw)
    const end = srtSeconds(endRaw)
    const cueText = lines.slice(timing + 1).join(' ').trim()
    if (start == null || end == null || end < start || !cueText) return null
    return { start, end, text: cueText }
  }).filter((cue): cue is VideoCue => cue !== null).slice(0, 20_000)
}

function finiteOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function readVideoSegments(root: string, frontmatter: Record<string, unknown>, cues: VideoCue[]): VideoSegment[] {
  const diarization = privateRawFile(root, frontmatter.video_diarization, ['.json'])
  let turns: { start: number; end: number; speaker: string }[] = []
  if (diarization) {
    try {
      const raw = JSON.parse(fs.readFileSync(diarization, 'utf-8'))
      turns = (Array.isArray(raw?.turns) ? raw.turns : [])
        .map((turn: any) => ({ start: Number(turn?.start), end: Number(turn?.end), speaker: String(turn?.speaker || '') }))
        .filter((turn: any) => Number.isFinite(turn.start) && Number.isFinite(turn.end) && turn.end > turn.start && turn.speaker)
    } catch {
      /* 分离结果可选 */
    }
  }
  const ids = [...new Set(turns.map((turn) => turn.speaker))]
  const label = (id: string) => id ? `说话人 ${Math.max(1, ids.indexOf(id) + 1)}` : '旁白'
  const tagged: VideoSegment[] = cues.map((cue) => {
    let speakerId = ''
    let best = 0
    for (const turn of turns) {
      const overlap = Math.max(0, Math.min(cue.end, turn.end) - Math.max(cue.start, turn.start))
      if (overlap > best) { best = overlap; speakerId = turn.speaker }
    }
    return { ...cue, speakerId, speaker: label(speakerId) }
  })
  const grouped: VideoSegment[] = []
  for (const cue of tagged) {
    const previous = grouped[grouped.length - 1]
    const gap = previous ? cue.start - previous.end : Infinity
    const longEnough = previous ? previous.end - previous.start >= 20 && /[。！？?!]$/.test(previous.text) : false
    const tooLarge = previous ? previous.end - previous.start >= 30 || previous.text.length + cue.text.length > 140 : false
    if (!previous || previous.speakerId !== cue.speakerId || gap > 1.5 || longEnough || tooLarge) {
      grouped.push({ ...cue })
    } else {
      previous.end = cue.end
      previous.text = `${previous.text}${/[，。！？；：、,.!?;:]$/.test(previous.text) ? '' : '，'}${cue.text}`
    }
  }
  return grouped
}

function readNoteVideo(root: string, frontmatter: Record<string, unknown>, sourceUrl = ''): NoteVideo | null {
  if (frontmatter.type !== 'video') return null
  const video = privateRawFile(root, frontmatter.video_file, ['.mp4', '.m4v', '.webm', '.mov'])
  const subtitle = privateRawFile(root, frontmatter.video_subtitle, ['.srt'])
  if (!subtitle) return null
  try {
    const cues = parseSrt(fs.readFileSync(subtitle, 'utf-8'))
    if (!cues.length) return null
    const keyframeDir = privateRawDir(root, frontmatter.video_keyframe_dir)
    let keyframes: VideoKeyframe[] = []
    let sceneThreshold: number | null = null
    let maxGapSeconds: number | null = null
    if (keyframeDir) {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(keyframeDir, 'manifest.json'), 'utf-8'))
        sceneThreshold = finiteOrNull(manifest?.scene_threshold)
        maxGapSeconds = finiteOrNull(manifest?.max_gap_seconds)
        keyframes = (Array.isArray(manifest?.frames) ? manifest.frames : [])
          .filter((frame: any) => frame && /^keyframe-\d+\.(?:jpe?g|png|webp)$/i.test(frame.file) && Number.isFinite(Number(frame.time_seconds)) && fs.existsSync(path.join(keyframeDir, frame.file)))
          .slice(0, 500)
          .map((frame: any, index: number) => ({ index, name: frame.file, time: Math.max(0, Number(frame.time_seconds)), reason: typeof frame.reason === 'string' ? frame.reason : '' }))
      } catch {
        /* 关键帧是可选项 */
      }
    }
    let comparison: VideoComparison | null = null
    let experimentDuration: number | null = null
    const experiment = privateRawFile(root, frontmatter.video_experiment, ['.json'])
    if (experiment) {
      try {
        const raw = JSON.parse(fs.readFileSync(experiment, 'utf-8'))
        experimentDuration = finiteOrNull(raw?.audio_duration_seconds)
        comparison = {
          platformVsLocal: finiteOrNull(raw?.platform_vs_local?.similarity),
          platformVsQwen: finiteOrNull(raw?.platform_vs_qwen?.similarity),
          localVsQwen: finiteOrNull(raw?.local_vs_qwen?.similarity),
          localRuntime: finiteOrNull(raw?.local_runtime_seconds),
          qwenRuntime: finiteOrNull(raw?.qwen_runtime_seconds),
          qwenTokens: finiteOrNull(raw?.qwen_usage?.total_Tokens),
          correctionCount: Math.max(0, Number(raw?.correction_count) || 0),
        }
      } catch {
        /* 实验数据是可选项 */
      }
    }
    return {
      duration: experimentDuration ?? cues[cues.length - 1].end,
      cueCount: cues.length,
      available: Boolean(video),
      sourceUrl,
      sourceLabel: '平台原字幕，经模型与关键帧校正',
      cues,
      segments: readVideoSegments(root, frontmatter, cues),
      keyframes,
      sceneThreshold,
      maxGapSeconds,
      comparison,
    }
  } catch {
    return null
  }
}

export function removeNoteVideo(root: string, id: string) {
  const note = readNote(root, id)
  if (!note?.video) throw new HttpError(404, '视频笔记不存在')
  const files = new Set<string>()
  for (const value of [note.frontmatter.video_file, note.frontmatter.video_original_file]) {
    const file = privateRawFile(root, value, ['.mp4', '.m4v', '.webm', '.mov'])
    if (file) files.add(file)
  }
  if (!files.size) throw new HttpError(404, '本地视频已删除')
  for (const file of files) fs.unlinkSync(file)
  return { removed: files.size, sourceUrl: note.video.sourceUrl }
}

export function readNoteVideoFile(root: string, id: string) {
  const note = readNote(root, id)
  if (!note?.video) throw new HttpError(404, '视频不存在')
  const file = privateRawFile(root, note.frontmatter.video_file, ['.mp4', '.m4v', '.webm', '.mov'])
  if (!file) throw new HttpError(404, '视频不存在')
  const types: Record<string, string> = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' }
  return { file, size: fs.statSync(file).size, contentType: types[path.extname(file).toLowerCase()] || 'application/octet-stream' }
}

export function readVideoKeyframe(root: string, id: string, indexRaw: string) {
  const note = readNote(root, id)
  if (!note?.video) throw new HttpError(404, '视频不存在')
  const index = Number(indexRaw)
  if (!Number.isInteger(index) || index < 0 || index >= note.video.keyframes.length) throw new HttpError(404, '关键帧不存在')
  const dir = privateRawDir(root, note.frontmatter.video_keyframe_dir)
  if (!dir) throw new HttpError(404, '关键帧不存在')
  const frame = note.video.keyframes[index]
  const file = privateRawFile(root, path.join(String(note.frontmatter.video_keyframe_dir), frame.name), ['.jpg', '.jpeg', '.png', '.webp'])
  if (!file || path.dirname(file) !== dir) throw new HttpError(404, '关键帧不存在')
  const types: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
  return { file, size: fs.statSync(file).size, contentType: types[path.extname(file).toLowerCase()] }
}

function readMeetingTranscript(root: string, frontmatter: Record<string, unknown>): MeetingTranscript | null {
  const file = privateRawFile(root, frontmatter.meeting_transcript, ['.json'])
  if (!file) return null
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
    const duration = Number(raw?.duration)
    const speakers = Array.isArray(raw?.speakers)
      ? raw.speakers.filter((x: any) => x && typeof x.id === 'string' && typeof x.name === 'string').slice(0, 20)
      : []
    const turns = Array.isArray(raw?.turns)
      ? raw.turns.filter((x: any) => x && Number.isFinite(x.start) && Number.isFinite(x.end) && typeof x.text === 'string')
        .map((x: any) => ({
          start: Math.max(0, Number(x.start)),
          end: Math.max(0, Number(x.end)),
          speaker: typeof x.speaker === 'string' ? x.speaker : '未知说话人',
          speakerId: typeof x.speakerId === 'string' ? x.speakerId : '',
          text: x.text.trim(),
        }))
        .filter((x: MeetingTurn) => x.text && x.end >= x.start)
        .slice(0, 20_000)
      : []
    if (!Number.isFinite(duration) || duration <= 0 || !turns.length) return null
    return { duration, speakers, turns }
  } catch {
    return null
  }
}

export function readMeetingAudio(root: string, id: string) {
  const note = readNote(root, id)
  if (!note) throw new HttpError(404, '笔记不存在')
  const file = privateRawFile(root, note.frontmatter.meeting_audio, ['.mp3', '.m4a', '.wav', '.ogg', '.flac'])
  if (!file) throw new HttpError(404, '会谈原音频不存在')
  const types: Record<string, string> = {
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
  }
  return { file, size: fs.statSync(file).size, contentType: types[path.extname(file).toLowerCase()] || 'application/octet-stream' }
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

/** 短期任务与长期项目分开存放：索引在 _context/tasks.json，正文在 _tasks/<id>.md。 */
export function listTasks(root: string, notes: NoteMeta[]): ResearchTask[] {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, '_context', 'tasks.json'), 'utf-8'))
    if (!raw || !Array.isArray(raw.tasks)) return []
    return raw.tasks.flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return []
      const data = item as Record<string, unknown>
      const id = str(data.id)
      const title = str(data.title)
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) || !title) return []
      let body = ''
      try {
        body = fs.readFileSync(path.join(root, '_tasks', `${id}.md`), 'utf-8')
      } catch {
        /* 允许先建立任务索引、稍后再补正文 */
      }
      return [{
        id,
        title,
        status: str(data.status) || 'active',
        created: str(data.created),
        updated: str(data.updated),
        summary: str(data.summary),
        body,
        related: notes.filter((note) => note.task === id).map(({ id: noteId, title: noteTitle }) => ({ id: noteId, title: noteTitle })),
      }]
    })
  } catch {
    return []
  }
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

const tasksFile = (root: string) => path.join(root, '_context', 'tasks.json')
const categoriesFile = (root: string) => path.join(root, '_context', 'categories.json')

/** 更新短期任务状态；保留任务索引中的其他字段和顺序。 */
export function updateTaskStatus(root: string, body: any) {
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  const status = typeof body?.status === 'string' ? body.status.trim() : ''
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new HttpError(400, '任务 id 不合法')
  if (!['active', 'done', 'archived'].includes(status)) throw new HttpError(400, '任务状态不合法')
  let raw: any
  try {
    raw = JSON.parse(fs.readFileSync(tasksFile(root), 'utf-8'))
  } catch {
    throw new HttpError(404, '任务索引不存在')
  }
  if (!raw || !Array.isArray(raw.tasks)) throw new HttpError(422, '任务索引格式错误')
  const index = raw.tasks.findIndex((item: any) => item && item.id === id)
  if (index < 0) throw new HttpError(404, '任务不存在')
  raw.tasks[index] = { ...raw.tasks[index], status, updated: new Date().toISOString().slice(0, 10) }
  atomicWrite(tasksFile(root), `${JSON.stringify(raw, null, 2)}\n`)
  return { id, status, updated: raw.tasks[index].updated }
}

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

// ─────────────────────── 语音资源（私有 JSON 元数据）───────────────────────
// 声纹向量本体不从这里返回；这里只管理档案名、样本数和本地附件引用。
export type VoiceprintStatus = 'unconfirmed' | 'confirmed' | 'disabled'
export interface AudioClip {
  id: string
  file: string
  start: number
  end: number
  text: string
  label: string
}
export interface VoiceprintEmbeddingRef {
  file: string
  label: string
  dimensions: number | null
}
export interface VoiceprintProfile {
  id: string
  label: string
  role: string
  status: VoiceprintStatus
  sampleCount: number
  embeddingFile: string
  embeddingLabel: string
  embeddingDimensions: number | null
  embeddingRefs: VoiceprintEmbeddingRef[]
  clips: AudioClip[]
  mergedFrom: string[]
  note: string
  createdAt: string
  updatedAt: string
}

export interface TerminologyItem {
  id: string
  term: string
  aliases: string[]
  status: 'candidate' | 'confirmed' | 'disabled'
  enabled: boolean
  clips: AudioClip[]
  note: string
  createdAt: string
  updatedAt: string
}

const voiceprintsFile = (root: string) => path.join(root, '_context', 'voiceprints.json')
const terminologyFile = (root: string) => path.join(root, '_context', 'terminology.json')
const MAX_VOICEPRINTS = 100
const MAX_TERMS = 500
const MAX_ALIASES = 20
const BAD_RESOURCE_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}]/u

function resourceText(raw: unknown, label: string, max: number, required = false): string {
  if (typeof raw !== 'string') throw new HttpError(400, `${label}必须是文字`)
  const value = raw.normalize('NFC').trim()
  if (required && !value) throw new HttpError(400, `${label}不能为空`)
  if (value.length > max) throw new HttpError(400, `${label}最长 ${max} 个字符`)
  if (BAD_RESOURCE_CHARS.test(value)) throw new HttpError(400, `${label}不能包含控制字符或不可见字符`)
  return value
}

function resourceId(raw: unknown): string {
  const id = resourceText(raw, 'id', 80, true)
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new HttpError(400, '无效的资源 id')
  return id
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function readResource<T>(file: string, key: string): T[] {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return Array.isArray(value?.[key]) ? value[key] : []
  } catch {
    return []
  }
}

function writeResource(file: string, key: string, values: unknown[]) {
  atomicWrite(file, JSON.stringify({ version: 1, [key]: values }, null, 2) + '\n')
}

function normalizeVoiceprint(raw: any): VoiceprintProfile | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.label !== 'string') return null
  const status: VoiceprintStatus = ['unconfirmed', 'confirmed', 'disabled'].includes(raw.status) ? raw.status : 'unconfirmed'
  const embeddingRefs = Array.isArray(raw.embeddingRefs)
    ? raw.embeddingRefs.filter((x: any) => x && typeof x.file === 'string' && typeof x.label === 'string').map((x: any) => ({
      file: x.file,
      label: x.label,
      dimensions: Number.isInteger(x.dimensions) && x.dimensions > 0 ? x.dimensions : null,
    }))
    : raw.embeddingFile && raw.embeddingLabel
      ? [{ file: raw.embeddingFile, label: raw.embeddingLabel, dimensions: Number.isInteger(raw.embeddingDimensions) ? raw.embeddingDimensions : null }]
      : []
  return {
    id: raw.id,
    label: raw.label,
    role: typeof raw.role === 'string' ? raw.role : '',
    status,
    sampleCount: Number.isInteger(raw.sampleCount) && raw.sampleCount >= 0 ? raw.sampleCount : 0,
    embeddingFile: typeof raw.embeddingFile === 'string' ? raw.embeddingFile : '',
    embeddingLabel: typeof raw.embeddingLabel === 'string' ? raw.embeddingLabel : '',
    embeddingDimensions: Number.isInteger(raw.embeddingDimensions) && raw.embeddingDimensions > 0 ? raw.embeddingDimensions : null,
    embeddingRefs,
    clips: normalizeClips(raw.clips),
    mergedFrom: Array.isArray(raw.mergedFrom) ? raw.mergedFrom.filter((x: unknown) => typeof x === 'string').slice(0, 100) : [],
    note: typeof raw.note === 'string' ? raw.note : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  }
}

function normalizeTerm(raw: any): TerminologyItem | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.term !== 'string') return null
  const status: TerminologyItem['status'] = ['candidate', 'confirmed', 'disabled'].includes(raw.status) ? raw.status : 'candidate'
  const aliases = Array.isArray(raw.aliases) ? raw.aliases.filter((x: unknown) => typeof x === 'string').slice(0, MAX_ALIASES) : []
  return {
    id: raw.id,
    term: raw.term,
    aliases,
    status,
    enabled: raw.enabled === true,
    clips: normalizeClips(raw.clips),
    note: typeof raw.note === 'string' ? raw.note : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  }
}

function normalizeClips(raw: unknown): AudioClip[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x: any) => x && typeof x.id === 'string' && typeof x.file === 'string')
    .map((x: any) => ({
      id: x.id,
      file: x.file,
      start: typeof x.start === 'number' && Number.isFinite(x.start) ? x.start : 0,
      end: typeof x.end === 'number' && Number.isFinite(x.end) ? x.end : 0,
      text: typeof x.text === 'string' ? x.text : '',
      label: typeof x.label === 'string' ? x.label : '',
    }))
    .slice(0, 20)
}

function readVoiceprints(root: string) {
  return readResource<any>(voiceprintsFile(root), 'profiles').map(normalizeVoiceprint).filter((x): x is VoiceprintProfile => x !== null)
}

function readTerminology(root: string) {
  return readResource<any>(terminologyFile(root), 'terms').map(normalizeTerm).filter((x): x is TerminologyItem => x !== null)
}

function cleanStatus(raw: unknown, values: string[], fallback: string) {
  if (raw == null || raw === '') return fallback
  if (typeof raw !== 'string' || !values.includes(raw)) throw new HttpError(400, '不支持的状态')
  return raw
}

function cleanAliases(raw: unknown): string[] {
  if (raw == null) return []
  if (!Array.isArray(raw) || raw.length > MAX_ALIASES) throw new HttpError(400, `别名最多 ${MAX_ALIASES} 个`)
  return raw.map((x) => resourceText(x, '别名', 60, true)).filter((x, i, a) => a.indexOf(x) === i)
}

function profileInput(body: any, current?: VoiceprintProfile): VoiceprintProfile {
  const now = today()
  const id = current?.id || (body?.id == null ? `speaker-${randomUUID().slice(0, 8)}` : resourceId(body.id))
  const sampleCount = body?.sampleCount == null ? current?.sampleCount || 0 : body.sampleCount
  if (!Number.isInteger(sampleCount) || sampleCount < 0 || sampleCount > 10000) throw new HttpError(400, '样本数必须是 0 到 10000 的整数')
  const embeddingDimensions = body?.embeddingDimensions == null ? current?.embeddingDimensions ?? null : body.embeddingDimensions
  if (embeddingDimensions !== null && (!Number.isInteger(embeddingDimensions) || embeddingDimensions <= 0 || embeddingDimensions > 10000)) throw new HttpError(400, '声纹维度无效')
  const status = cleanStatus(body?.status, ['unconfirmed', 'confirmed', 'disabled'], current?.status || 'unconfirmed') as VoiceprintStatus
  const rawLabel = resourceText(body?.label ?? current?.label, '显示名称', 80, true)
  // 初始实验档案使用「待确认 · SPEAKER_xx」占位；确认后不应继续显示待确认。
  const label = status === 'confirmed' ? rawLabel.replace(/^待确认\s*[·•]\s*/, '') : rawLabel
  return {
    id,
    label: resourceText(label, '显示名称', 80, true),
    role: resourceText(body?.role ?? current?.role ?? '', '角色', 80),
    status,
    sampleCount,
    embeddingFile: resourceText(body?.embeddingFile ?? current?.embeddingFile ?? '', '声纹附件', 240),
    embeddingLabel: resourceText(body?.embeddingLabel ?? current?.embeddingLabel ?? '', '实验标签', 80),
    embeddingDimensions,
    embeddingRefs: current?.embeddingRefs || [],
    clips: current?.clips || [],
    mergedFrom: current?.mergedFrom || [],
    note: resourceText(body?.note ?? current?.note ?? '', '备注', 1000),
    createdAt: current?.createdAt || now,
    updatedAt: now,
  }
}

function termInput(body: any, current?: TerminologyItem): TerminologyItem {
  const now = today()
  const id = current?.id || (body?.id == null ? `term-${randomUUID().slice(0, 8)}` : resourceId(body.id))
  const status = cleanStatus(body?.status, ['candidate', 'confirmed', 'disabled'], current?.status || 'candidate') as TerminologyItem['status']
  return {
    id,
    term: resourceText(body?.term ?? current?.term, '常见词', 100, true),
    aliases: body?.aliases == null ? current?.aliases || [] : cleanAliases(body.aliases),
    status,
    enabled: body?.enabled == null ? current?.enabled === true : body.enabled === true,
    clips: current?.clips || [],
    note: resourceText(body?.note ?? current?.note ?? '', '备注', 1000),
    createdAt: current?.createdAt || now,
    updatedAt: now,
  }
}

export function listVoiceprints(root: string) {
  return { profiles: readVoiceprints(root) }
}

export function createVoiceprint(root: string, body: any) {
  const profiles = readVoiceprints(root)
  if (profiles.length >= MAX_VOICEPRINTS) throw new HttpError(400, `声纹档案最多 ${MAX_VOICEPRINTS} 个`)
  const profile = profileInput(body)
  if (profiles.some((x) => x.label.toLowerCase() === profile.label.toLowerCase())) throw new HttpError(409, '已有同名声纹档案')
  writeResource(voiceprintsFile(root), 'profiles', [...profiles, profile])
  return profile
}

export function updateVoiceprint(root: string, body: any) {
  const profiles = readVoiceprints(root)
  const id = resourceId(body?.id)
  const current = profiles.find((x) => x.id === id)
  if (!current) throw new HttpError(404, '声纹档案不存在')
  const next = profileInput(body, current)
  if (profiles.some((x) => x.id !== id && x.label.toLowerCase() === next.label.toLowerCase())) throw new HttpError(409, '已有同名声纹档案')
  writeResource(voiceprintsFile(root), 'profiles', profiles.map((x) => x.id === id ? next : x))
  return next
}

export function mergeVoiceprints(root: string, body: any) {
  const sourceId = resourceId(body?.sourceId)
  const targetId = resourceId(body?.targetId)
  if (sourceId === targetId) throw new HttpError(400, '不能把声纹档案合并到自己')
  const profiles = readVoiceprints(root)
  const source = profiles.find((x) => x.id === sourceId)
  const target = profiles.find((x) => x.id === targetId)
  if (!source || !target) throw new HttpError(404, '待合并的声纹档案不存在')
  if (source.status === 'disabled' || target.status === 'disabled') throw new HttpError(400, '停用档案不能参与合并')
  const embeddingRefs = [...target.embeddingRefs, ...source.embeddingRefs]
    .filter((x, i, a) => a.findIndex((y) => y.file === x.file && y.label === x.label) === i)
  const clips = [...target.clips, ...source.clips].map((clip, index, all) => {
    const duplicate = all.findIndex((x) => x.id === clip.id) !== index
    return duplicate ? { ...clip, id: `${sourceId}-${clip.id}` } : clip
  }).filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)
  const merged: VoiceprintProfile = {
    ...target,
    sampleCount: Math.min(10000, target.sampleCount + source.sampleCount),
    embeddingFile: target.embeddingFile || source.embeddingFile,
    embeddingLabel: target.embeddingLabel || source.embeddingLabel,
    embeddingDimensions: target.embeddingDimensions || source.embeddingDimensions,
    embeddingRefs,
    clips,
    mergedFrom: [...target.mergedFrom, source.id, ...source.mergedFrom].filter((x, i, a) => a.indexOf(x) === i).slice(0, 100),
    note: [target.note, `合并自：${source.label}`].filter(Boolean).join('；'),
    updatedAt: today(),
  }
  writeResource(voiceprintsFile(root), 'profiles', profiles.filter((x) => x.id !== sourceId && x.id !== targetId).concat(merged))
  return merged
}

export function deleteVoiceprint(root: string, idRaw: string) {
  const id = resourceId(idRaw)
  const profiles = readVoiceprints(root)
  if (!profiles.some((x) => x.id === id)) throw new HttpError(404, '声纹档案不存在')
  writeResource(voiceprintsFile(root), 'profiles', profiles.filter((x) => x.id !== id))
}

export function listTerminology(root: string) {
  return { terms: readTerminology(root) }
}

/** 只允许播放已经登记在档案中的片段，且片段文件必须位于库内 _context/audio-clips。 */
export function readAudioClip(root: string, kindRaw: string, ownerIdRaw: string, clipId: string) {
  const ownerId = resourceId(ownerIdRaw)
  const owner = kindRaw === 'voiceprint'
    ? readVoiceprints(root).find((x) => x.id === ownerId)
    : kindRaw === 'term'
      ? readTerminology(root).find((x) => x.id === ownerId)
      : undefined
  const clip = owner?.clips.find((x) => x.id === clipId)
  if (!clip) throw new HttpError(404, '音频片段不存在')
  const clipsRoot = path.resolve(root, '_context', 'audio-clips') + path.sep
  const file = path.resolve(root, clip.file)
  if (!file.startsWith(clipsRoot) || !fs.existsSync(file)) throw new HttpError(404, '音频片段文件不存在')
  const stat = fs.statSync(file)
  if (!stat.isFile()) throw new HttpError(404, '音频片段文件不存在')
  return { file, size: stat.size }
}

export function createTerminology(root: string, body: any) {
  const terms = readTerminology(root)
  if (terms.length >= MAX_TERMS) throw new HttpError(400, `常见词最多 ${MAX_TERMS} 个`)
  const term = termInput(body)
  if (terms.some((x) => x.term.toLowerCase() === term.term.toLowerCase())) throw new HttpError(409, '已有同名常见词')
  writeResource(terminologyFile(root), 'terms', [...terms, term])
  return term
}

export function updateTerminology(root: string, body: any) {
  const terms = readTerminology(root)
  const id = resourceId(body?.id)
  const current = terms.find((x) => x.id === id)
  if (!current) throw new HttpError(404, '常见词不存在')
  const next = termInput(body, current)
  if (terms.some((x) => x.id !== id && x.term.toLowerCase() === next.term.toLowerCase())) throw new HttpError(409, '已有同名常见词')
  writeResource(terminologyFile(root), 'terms', terms.map((x) => x.id === id ? next : x))
  return next
}

export function deleteTerminology(root: string, idRaw: string) {
  const id = resourceId(idRaw)
  const terms = readTerminology(root)
  if (!terms.some((x) => x.id === id)) throw new HttpError(404, '常见词不存在')
  writeResource(terminologyFile(root), 'terms', terms.filter((x) => x.id !== id))
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

export function setNoteTask(root: string, id: string, task: string | null) {
  const file = noteFile(root, id)
  let value: string | null = null
  if (task !== null && task !== '') {
    if (typeof task !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(task)) throw new HttpError(400, '任务 id 不合法')
    let raw: any
    try {
      raw = JSON.parse(fs.readFileSync(tasksFile(root), 'utf-8'))
    } catch {
      throw new HttpError(404, '任务索引不存在')
    }
    if (!Array.isArray(raw?.tasks) || !raw.tasks.some((item: any) => item && item.id === task)) throw new HttpError(404, '任务不存在')
    value = task
  }
  atomicWrite(file, editFrontmatterLine(fs.readFileSync(file, 'utf-8'), 'task', value))
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
