// 写接口的输入防护测试：起一个真实的 Vite 服务器，指向临时研究库，用原生 http 发请求（可以任意伪造 Host/Origin）。
// 运行：npm test
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NOTE = `---
source: github
url: https://example.com/a
title: 示例
captured: 2026-01-01
tags: [a, b]
status: quick           # quick | deep
verdict: learn
---

# 示例

> 摘要

正文第一段。
`
let server, port, root
const noteFile = () => path.join(root, 'github', 'ex__a.md')

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-test-'))
  fs.mkdirSync(path.join(root, 'github'), { recursive: true })
  fs.mkdirSync(path.join(root, 'self-upload'), { recursive: true })
  fs.mkdirSync(path.join(root, 'xhs'), { recursive: true })
  fs.mkdirSync(path.join(root, '_context'), { recursive: true })
  fs.mkdirSync(path.join(root, '_tasks'), { recursive: true })
  fs.mkdirSync(path.join(root, '_raw', 'self-upload', 'audio-test'), { recursive: true })
  fs.mkdirSync(path.join(root, '_raw', 'xhs', 'note-test'), { recursive: true })
  fs.mkdirSync(path.join(root, '_raw', 'xhs', 'video-test', 'keyframes'), { recursive: true })
  fs.writeFileSync(noteFile(), NOTE)
  fs.writeFileSync(path.join(root, '_context', 'tasks.json'), JSON.stringify({ tasks: [{ id: 'sample-task', title: '示例短期任务', status: 'active', created: '2026-10-08', updated: '2026-10-08', summary: '整理一组公开研究资料' }] }))
  fs.writeFileSync(path.join(root, '_tasks', 'sample-task.md'), '# 示例短期任务\n\n## 当前结论\n\n优先核对一手来源。\n')
  fs.writeFileSync(path.join(root, 'github', 'task-example.md'), NOTE.replace('title: 示例', 'title: 任务参考').replace('verdict: learn', 'verdict: learn\ntask: sample-task'))
  fs.writeFileSync(path.join(root, '_raw', 'self-upload', 'audio-test', 'meeting.json'), JSON.stringify({ duration: 12, speakers: [{ id: 's0', name: '甲' }], turns: [{ start: 1, end: 3, speaker: '甲', speakerId: 's0', text: '测试会谈' }] }))
  fs.writeFileSync(path.join(root, '_raw', 'self-upload', 'audio-test', 'meeting.mp3'), Buffer.from('fake-mp3'))
  fs.writeFileSync(path.join(root, 'self-upload', 'audio-test.md'), NOTE.replaceAll('source: github', 'source: self-upload').replaceAll('title: 示例', 'title: 本地音频实验').replace('verdict: learn', 'verdict: learn\nmeeting_transcript: _raw/self-upload/audio-test/meeting.json\nmeeting_audio: _raw/self-upload/audio-test/meeting.mp3'))
  fs.writeFileSync(path.join(root, '_raw', 'xhs', 'note-test', 'image-01.webp'), Buffer.from('fake-webp'))
  fs.writeFileSync(path.join(root, 'xhs', 'note-test.md'), NOTE.replaceAll('source: github', 'source: xhs').replaceAll('title: 示例', 'title: 小红书图文').replace('verdict: learn', 'verdict: learn\nxhs_image_dir: _raw/xhs/note-test'))
  fs.writeFileSync(path.join(root, '_raw', 'xhs', 'video-test', 'video.mp4'), Buffer.from('fake-video-data'))
  fs.writeFileSync(path.join(root, '_raw', 'xhs', 'video-test', 'original.mp4'), Buffer.from('fake-original-video'))
  fs.writeFileSync(path.join(root, '_raw', 'xhs', 'video-test', 'corrected.srt'), '1\n00:00:01,000 --> 00:00:03,500\n复指数函数\n\n2\n00:00:04,000 --> 00:00:06,000\n傅里叶变换\n')
  fs.writeFileSync(path.join(root, '_raw', 'xhs', 'video-test', 'comparison.json'), JSON.stringify({ audio_duration_seconds: 8, platform_cue_count: 2, platform_vs_local: { similarity: 0.93 }, platform_vs_qwen: { similarity: 0.98 }, local_vs_qwen: { similarity: 0.94 }, local_runtime_seconds: 5, qwen_runtime_seconds: 2, correction_count: 1, qwen_usage: { total_Tokens: 123 } }))
  fs.writeFileSync(path.join(root, '_raw', 'xhs', 'video-test', 'keyframes', 'keyframe-001.jpg'), Buffer.from('fake-jpeg'))
  fs.writeFileSync(path.join(root, '_raw', 'xhs', 'video-test', 'keyframes', 'manifest.json'), JSON.stringify({ scene_threshold: 0.22, max_gap_seconds: 45, frames: [{ file: 'keyframe-001.jpg', time_seconds: 2.5, reason: 'scene-change' }] }))
  fs.writeFileSync(path.join(root, '_raw', 'xhs', 'video-test', 'diarization.json'), JSON.stringify({ model: 'test', turns: [{ start: 0, end: 3.8, speaker: 'SPEAKER_00' }, { start: 3.8, end: 8, speaker: 'SPEAKER_01' }] }))
  fs.writeFileSync(path.join(root, 'xhs', 'video-test.md'), NOTE.replaceAll('source: github', 'source: xhs').replaceAll('title: 示例', 'title: 小红书视频').replace('verdict: learn', 'verdict: learn\ntype: video\nvideo_file: _raw/xhs/video-test/video.mp4\nvideo_original_file: _raw/xhs/video-test/original.mp4\nvideo_subtitle: _raw/xhs/video-test/corrected.srt\nvideo_diarization: _raw/xhs/video-test/diarization.json\nvideo_keyframe_dir: _raw/xhs/video-test/keyframes\nvideo_experiment: _raw/xhs/video-test/comparison.json'))
  process.env.RESEARCH_DIR = root
  server = await createServer({
    root: appDir,
    configFile: path.join(appDir, 'vite.config.ts'),
    logLevel: 'silent',
    server: { port: 0, host: '127.0.0.1' },
  })
  await server.listen()
  port = server.httpServer.address().port
})

after(async () => {
  await server?.close()
  fs.rmSync(root, { recursive: true, force: true })
})

/** 原生 http 请求，可任意设置头（fetch 不让改 Host / Origin） */
function call(method, url, { headers = {}, body, raw } = {}) {
  return new Promise((resolve, reject) => {
    const payload = raw ?? (body === undefined ? undefined : JSON.stringify(body))
    const req = http.request(
      { host: '127.0.0.1', port, method, path: url, headers: { ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}), ...headers } },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          let json = null
          try { json = JSON.parse(data) } catch { /* 非 JSON */ }
          resolve({ status: res.statusCode, json, headers: res.headers })
        })
      },
    )
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}
const GOOD = { 'x-ra-write': '1', 'content-type': 'application/json' }
const write = (method, url, body, extra = {}) => call(method, url, { headers: { ...GOOD, ...extra }, body })
const notes = async () => (await call('GET', '/api/notes')).json.notes
const cats = async () => (await call('GET', '/api/categories')).json

test('读接口可用；伪造 Host（DNS rebinding）被拒绝', async () => {
  const listed = await call('GET', '/api/notes')
  assert.equal(listed.status, 200)
  assert.ok(listed.json.notes.some((n) => n.id === 'self-upload/audio-test' && n.source === 'self-upload'))
  const meetingNote = await call('GET', '/api/note?id=self-upload%2Faudio-test')
  assert.equal(meetingNote.status, 200)
  assert.equal(meetingNote.json.meeting.turns[0].text, '测试会谈')
  const meetingAudio = await call('GET', '/api/meeting-audio?id=self-upload%2Faudio-test')
  assert.equal(meetingAudio.status, 200)
  assert.equal(meetingAudio.headers['content-type'], 'audio/mpeg')
  const meetingRange = await call('GET', '/api/meeting-audio?id=self-upload%2Faudio-test', { headers: { range: 'bytes=2-5' } })
  assert.equal(meetingRange.status, 206)
  assert.equal(meetingRange.headers['content-range'], 'bytes 2-5/8')
  assert.equal((await call('GET', '/api/meeting-audio?id=self-upload%2Faudio-test', { headers: { range: 'bytes=99-100' } })).status, 416)
  assert.equal((await call('GET', '/api/meeting-audio?id=github%2Fex__a')).status, 404)
  const xhsNote = await call('GET', '/api/note?id=xhs%2Fnote-test')
  assert.equal(xhsNote.status, 200)
  assert.equal(xhsNote.json.images[0].name, 'image-01.webp')
  const xhsImage = await call('GET', '/api/note-image?id=xhs%2Fnote-test&index=0')
  assert.equal(xhsImage.status, 200)
  assert.equal(xhsImage.headers['content-type'], 'image/webp')
  assert.equal((await call('GET', '/api/note-image?id=xhs%2Fnote-test&index=99')).status, 404)
  assert.equal((await call('GET', '/api/note-image?id=github%2Fex__a&index=0')).status, 404)
  const videoNote = await call('GET', '/api/note?id=xhs%2Fvideo-test')
  assert.equal(videoNote.status, 200)
  assert.equal(videoNote.json.video.cues[0].text, '复指数函数')
  assert.equal(videoNote.json.video.available, true)
  assert.equal(videoNote.json.video.sourceUrl, 'https://example.com/a')
  assert.deepEqual(videoNote.json.video.segments.map((x) => x.speaker), ['说话人 1', '说话人 2'])
  assert.equal(videoNote.json.video.keyframes[0].time, 2.5)
  assert.equal(videoNote.json.video.comparison.platformVsQwen, 0.98)
  assert.equal(videoNote.json.video.comparison.qwenTokens, 123)
  const video = await call('GET', '/api/note-video?id=xhs%2Fvideo-test')
  assert.equal(video.status, 200)
  assert.equal(video.headers['content-type'], 'video/mp4')
  const videoRange = await call('GET', '/api/note-video?id=xhs%2Fvideo-test', { headers: { range: 'bytes=2-5' } })
  assert.equal(videoRange.status, 206)
  assert.equal(videoRange.headers['content-range'], 'bytes 2-5/15')
  assert.equal((await call('GET', '/api/note-video?id=github%2Fex__a')).status, 404)
  const keyframe = await call('GET', '/api/video-keyframe?id=xhs%2Fvideo-test&index=0')
  assert.equal(keyframe.status, 200)
  assert.equal(keyframe.headers['content-type'], 'image/jpeg')
  assert.equal((await call('GET', '/api/video-keyframe?id=xhs%2Fvideo-test&index=99')).status, 404)
  assert.equal((await call('GET', '/api/notes', { headers: { host: 'evil.example' } })).status, 403)
  assert.equal((await call('GET', '/api/notes', { headers: { host: 'evil.example:5174' } })).status, 403)
})

test('任务与项目、分类独立，并聚合关联研究笔记', async () => {
  const response = await call('GET', '/api/tasks')
  assert.equal(response.status, 200)
  assert.equal(response.json.tasks.length, 1)
  assert.equal(response.json.tasks[0].id, 'sample-task')
  assert.equal(response.json.tasks[0].title, '示例短期任务')
  assert.match(response.json.tasks[0].body, /核对一手来源/)
  assert.deepEqual(response.json.tasks[0].related, [{ id: 'github/task-example', title: '任务参考' }])
})

test('任务状态可安全更新，并保留任务的其他字段', async () => {
  const done = await write('PATCH', '/api/tasks', { id: 'sample-task', status: 'done' })
  assert.equal(done.status, 200)
  assert.equal(done.json.task.status, 'done')
  let listed = await call('GET', '/api/tasks')
  assert.equal(listed.json.tasks[0].status, 'done')
  const stored = JSON.parse(fs.readFileSync(path.join(root, '_context', 'tasks.json'), 'utf-8')).tasks[0]
  assert.equal(stored.title, '示例短期任务')
  assert.equal(stored.summary, '整理一组公开研究资料')
  assert.equal((await write('PATCH', '/api/tasks', { id: 'sample-task', status: 'invalid' })).status, 400)
  assert.equal((await write('PATCH', '/api/tasks', { id: '../escape', status: 'done' })).status, 400)
  assert.equal((await write('PATCH', '/api/tasks', { id: 'missing', status: 'done' })).status, 404)
  const active = await write('PATCH', '/api/tasks', { id: 'sample-task', status: 'active' })
  assert.equal(active.status, 200)
  listed = await call('GET', '/api/tasks')
  assert.equal(listed.json.tasks[0].status, 'active')
})

test('本地视频可以删除，字幕和来源地址仍保留', async () => {
  const noteId = 'xhs/video-test'
  const removed = await write('DELETE', `/api/note-video?id=${encodeURIComponent(noteId)}`)
  assert.equal(removed.status, 200)
  assert.equal(removed.json.removed, 2)
  assert.equal(fs.existsSync(path.join(root, '_raw', 'xhs', 'video-test', 'video.mp4')), false)
  assert.equal(fs.existsSync(path.join(root, '_raw', 'xhs', 'video-test', 'original.mp4')), false)
  const note = await call('GET', `/api/note?id=${encodeURIComponent(noteId)}`)
  assert.equal(note.json.video.available, false)
  assert.equal(note.json.video.sourceUrl, 'https://example.com/a')
  assert.equal(note.json.video.cues.length, 2)
  assert.equal((await call('GET', `/api/note-video?id=${encodeURIComponent(noteId)}`)).status, 404)
})

test('小红书原图支持备注、补图和可恢复移除', async () => {
  const noteId = 'xhs/note-test'
  const first = await call('GET', `/api/note?id=${encodeURIComponent(noteId)}`)
  assert.equal(first.json.images.length, 1)
  assert.equal(first.json.images[0].note, '')

  const noted = await write('PATCH', '/api/note-image', { id: noteId, name: 'image-01.webp', note: '第二行数字需要人工复核' })
  assert.equal(noted.status, 200)
  const afterNote = await call('GET', `/api/note?id=${encodeURIComponent(noteId)}`)
  assert.equal(afterNote.json.images[0].note, '第二行数字需要人工复核')

  const webp = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ')
  const added = await write('POST', '/api/note-image', {
    id: noteId,
    filename: '补充截图.webp',
    dataUrl: `data:image/webp;base64,${webp.toString('base64')}`,
  })
  assert.equal(added.status, 200)
  assert.match(added.json.image.name, /^image-added-[a-f0-9-]+\.webp$/)
  const afterAdd = await call('GET', `/api/note?id=${encodeURIComponent(noteId)}`)
  assert.equal(afterAdd.json.images.length, 2)
  assert.ok(afterAdd.json.images.some((x) => x.added && x.name === added.json.image.name))

  assert.equal((await write('POST', '/api/note-image', { id: noteId, filename: 'bad.svg', dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' })).status, 400)
  assert.equal((await write('PATCH', '/api/note-image', { id: noteId, name: '../Cookies', note: 'x' })).status, 400)

  const removed = await write('DELETE', `/api/note-image?id=${encodeURIComponent(noteId)}&name=${encodeURIComponent('image-01.webp')}`)
  assert.equal(removed.status, 200)
  const afterRemove = await call('GET', `/api/note?id=${encodeURIComponent(noteId)}`)
  assert.equal(afterRemove.json.images.length, 1)
  assert.ok(!fs.existsSync(path.join(root, '_raw', 'xhs', 'note-test', 'image-01.webp')))
  assert.ok(fs.readdirSync(path.join(root, '_raw', 'xhs', 'note-test', '_removed')).some((name) => name.endsWith('-image-01.webp')))
})

test('写请求的跨站防护', async () => {
  const body = { name: 'guard-test' }
  assert.equal((await call('POST', '/api/categories', { headers: { 'content-type': 'application/json' }, body })).status, 403, '缺少 x-ra-write')
  assert.equal((await call('POST', '/api/categories', { headers: { 'x-ra-write': '1', 'content-type': 'text/plain' }, body })).status, 415, '非 JSON')
  assert.equal((await write('POST', '/api/categories', body, { origin: 'https://evil.example' })).status, 403, '跨站 Origin')
  assert.equal((await write('POST', '/api/categories', body, { origin: 'null' })).status, 403, 'Origin: null')
  assert.equal((await write('POST', '/api/categories', body, { origin: `http://127.0.0.1:${port + 1}` })).status, 403, '同主机不同端口')
  assert.equal((await write('POST', '/api/categories', body, { 'sec-fetch-site': 'cross-site' })).status, 403, 'Sec-Fetch-Site: cross-site')
  assert.equal((await write('POST', '/api/categories', body, { 'sec-fetch-site': 'same-site' })).status, 403, 'Sec-Fetch-Site: same-site')
  assert.equal((await write('POST', '/api/categories', body, { host: 'evil.example' })).status, 403, '伪造 Host 的写请求')
  assert.equal((await cats()).categories.length, 0, '以上被拒绝的请求一个都不能生效')
  assert.equal((await write('POST', '/api/categories', body, { origin: `http://127.0.0.1:${port}`, 'sec-fetch-site': 'same-origin' })).status, 200, '同源请求应通过')
  assert.equal((await write('DELETE', '/api/categories?name=guard-test')).status, 200)
})

test('请求体：超大、坏 JSON、不支持的方法', async () => {
  assert.equal((await write('POST', '/api/categories', { name: 'a'.repeat(20000) })).status, 413)
  assert.equal((await call('POST', '/api/categories', { headers: GOOD, raw: '{bad json' })).status, 400)
  assert.equal((await write('PUT', '/api/categories', {})).status, 405)
  assert.equal((await write('POST', '/api/nope', {})).status, 405)
  assert.equal((await call('GET', '/api/nope')).status, 404)
})

test('分类名校验：这些必须被拒绝', async () => {
  const bad = [
    '', '   ', 'x'.repeat(31), '__none__',
    'a\nb', 'a\r\nb', 'a\tb', 'a\u0000b',
    'a b', 'a b', 'a\u0085b', // 行/段分隔符、NEL（YAML 会当成换行）
    'ab​cd', 'ab‍cd', 'ab﻿cd', // 零宽字符
    'abc‮def', 'abc⁦def', // 双向覆盖（显示欺骗）
    'a\uD800b', // 孤立代理项
  ]
  for (const name of bad) {
    const r = await write('POST', '/api/categories', { name })
    assert.equal(r.status, 400, `应拒绝 ${JSON.stringify(name)}，实际 ${r.status}`)
  }
  for (const name of [123, null, true, ['a'], { a: 1 }]) {
    assert.equal((await write('POST', '/api/categories', { name })).status, 400, `非字符串 ${JSON.stringify(name)}`)
  }
  assert.equal((await write('POST', '/api/categories', { name: 'ok', color: 'red; background:url(x)' })).status, 400, '非法颜色')
  assert.equal((await write('POST', '/api/categories', { name: 'ok', color: 123 })).status, 400)
  assert.equal((await cats()).categories.length, 0, '被拒绝的名字不能留下任何痕迹')
})

test('YAML 往返：特殊字符的分类名写入 frontmatter 后读回必须完全一致，且不破坏其他字段', async () => {
  const names = [
    'agent harness', 'AI evaluation: 评估/观测', '# 像注释', 'a #b', "it's", 'say "hi"', '[x]', '{y}', '- 开头', '> 引用', '| 管道',
    '& 锚点', '* 星号', '! 标签', '%指令', '@at', '`tick`', 'yes', 'No', 'true', 'null', '~', '123', '1.5', '0x1F', '2026-01-01',
    'café', '日本語のカテゴリ', '😀 emoji', 'a: b: c', 'key: [1, 2]', '--- 三横线', '... 三点',
    'y', 'n', 'ON', 'Off', '1e3', '0o17', '0b101', '.inf', '.NaN', '+1', '-1', '1_000', '2026-01-01 10:30', '12:30:45', '1:2',
  ]
  for (const name of names) {
    try {
    const created = await write('POST', '/api/categories', { name })
    assert.equal(created.status, 200, `创建 ${JSON.stringify(name)} 失败：${JSON.stringify(created.json)}`)
    assert.equal((await write('PATCH', '/api/note', { id: 'github/ex__a', category: name })).status, 200)
    const n = (await notes()).find((x) => x.id === 'github/ex__a')
    assert.equal(n.category, name, `YAML 往返不一致：写入 ${JSON.stringify(name)}，读回 ${JSON.stringify(n.category)}`)
    // 其他字段必须原样保留
    assert.equal(n.title, '示例'); assert.deepEqual(n.tags, ['a', 'b']); assert.equal(n.verdict, 'learn'); assert.equal(n.status, 'quick')
    } finally {
      await write('DELETE', `/api/categories?name=${encodeURIComponent(name)}`)
    }
  }
})

test('写入只改 category 一行；删除后文件与原文件逐字节一致', async () => {
  await write('POST', '/api/categories', { name: 'tools' })
  await write('PATCH', '/api/note', { id: 'github/ex__a', category: 'tools' })
  const after = fs.readFileSync(noteFile(), 'utf-8')
  const a = NOTE.split('\n'), b = after.split('\n')
  assert.equal(b.length, a.length + 1, '只应多一行')
  assert.ok(after.includes('verdict: learn\ncategory: tools\n'), '插在 verdict 之后')
  assert.ok(after.includes('status: quick           # quick | deep'), '行内注释保持不变')
  assert.ok(after.endsWith('正文第一段。\n'), '正文不动')
  await write('DELETE', '/api/categories?name=tools')
  assert.equal(fs.readFileSync(noteFile(), 'utf-8'), NOTE, '删除分类后应回到原文件')
})

test('笔记可归入短期任务，且只改 task frontmatter', async () => {
  const before = fs.readFileSync(noteFile(), 'utf-8')
  const assigned = await write('PATCH', '/api/note', { id: 'github/ex__a', task: 'sample-task' })
  assert.equal(assigned.status, 200)
  let after = fs.readFileSync(noteFile(), 'utf-8')
  assert.ok(after.includes('verdict: learn\ntask: sample-task\n'))
  assert.equal((await notes()).find((x) => x.id === 'github/ex__a').task, 'sample-task')
  assert.equal((await write('PATCH', '/api/note', { id: 'github/ex__a', task: 'missing' })).status, 404)
  assert.equal((await write('PATCH', '/api/note', { id: 'github/ex__a', task: '../escape' })).status, 400)
  assert.equal((await write('PATCH', '/api/note', { id: 'github/ex__a', category: 'x', task: 'sample-task' })).status, 400)
  assert.equal((await write('PATCH', '/api/note', { id: 'github/ex__a' })).status, 400)
  assert.equal((await write('PATCH', '/api/note', { id: 'github/ex__a', task: null })).status, 200)
  after = fs.readFileSync(noteFile(), 'utf-8')
  assert.equal(after, before)
})

test('改名同步到相关笔记；撞名（含大小写、Unicode 同形）被拒绝', async () => {
  await write('POST', '/api/categories', { name: 'Alpha' })
  await write('POST', '/api/categories', { name: 'Beta' })
  await write('PATCH', '/api/note', { id: 'github/ex__a', category: 'Alpha' })
  assert.equal((await write('POST', '/api/categories', { name: 'alpha' })).status, 409, '大小写不同也算重名')
  assert.equal((await write('PATCH', '/api/categories', { name: 'Alpha', newName: 'BETA' })).status, 409, '改名撞已有分类')
  assert.equal((await write('POST', '/api/categories', { name: 'café' })).status, 200)
  assert.equal((await write('POST', '/api/categories', { name: 'café' })).status, 409, 'NFC/NFD 同形算重名')
  const r = await write('PATCH', '/api/categories', { name: 'Alpha', newName: 'Gamma', color: 'rose' })
  assert.equal(r.json.renamedNotes, 1)
  assert.equal((await notes()).find((x) => x.id === 'github/ex__a').category, 'Gamma')
  assert.equal((await write('PATCH', '/api/categories', { name: 'nonexistent', newName: 'x' })).status, 404)
  assert.equal((await write('DELETE', '/api/categories?name=nonexistent')).status, 404)
  assert.equal((await write('DELETE', '/api/categories')).status, 400, '缺少 name')
  for (const n of ['Gamma', 'Beta', 'café']) await write('DELETE', `/api/categories?name=${encodeURIComponent(n)}`)
})

test('笔记 id：路径穿越、绝对路径、点文件、空字节、非白名单目录都被拒绝', async () => {
  const ids = ['../../etc/passwd', '../x', '/etc/passwd', 'github/../../x', 'github/.hidden', 'github/', '_context/projects', 'github/a\u0000b', 'github/a/b', 'github\\x', 'GITHUB/ex__a', '', 'github/' + 'a'.repeat(201)]
  for (const id of ids) {
    const w = await write('PATCH', '/api/note', { id, category: 'x' })
    assert.ok([400, 404].includes(w.status), `写 id ${JSON.stringify(id)} 应被拒绝，实际 ${w.status}`)
    const r = await call('GET', `/api/note?id=${encodeURIComponent(id)}`)
    assert.equal(r.status, 404, `读 id ${JSON.stringify(id)} 应 404，实际 ${r.status}`)
  }
  assert.equal((await write('PATCH', '/api/note', { id: 'github/nope', category: 'x' })).status, 404)
})

test('点文件：不列出、不可读、不可写（即使真实存在）', async () => {
  const f = path.join(root, 'github', '.hidden.md')
  fs.writeFileSync(f, NOTE)
  try {
    assert.ok(!(await notes()).some((n) => n.id.includes('.hidden')), '不应出现在列表里')
    assert.equal((await call('GET', '/api/note?id=github%2F.hidden')).status, 404)
    const w = await write('PATCH', '/api/note', { id: 'github/.hidden', category: 'x' })
    assert.equal(w.status, 400)
    assert.equal(fs.readFileSync(f, 'utf-8'), NOTE, '文件不能被改动')
  } finally {
    fs.rmSync(f, { force: true })
  }
})

test('没有 frontmatter 的文件拒绝写入且不被修改', async () => {
  const f = path.join(root, 'github', 'plain.md')
  fs.writeFileSync(f, '# 没有 frontmatter\n正文\n')
  const r = await write('PATCH', '/api/note', { id: 'github/plain', category: 'x' })
  assert.equal(r.status, 422)
  assert.equal(fs.readFileSync(f, 'utf-8'), '# 没有 frontmatter\n正文\n')
  fs.rmSync(f)
})

test('分类数量上限 100', async () => {
  const existing = (await cats()).categories.length
  let ok = 0
  for (let i = 0; i < 105; i++) if ((await write('POST', '/api/categories', { name: `c${i}` })).status === 200) ok++
  assert.equal(ok + existing, 100)
  assert.equal((await write('POST', '/api/categories', { name: 'one-more' })).status, 400)
})

test('categories.json 被手工改坏时服务不崩溃', async () => {
  const f = path.join(root, '_context', 'categories.json')
  for (const content of ['{bad', '[]', '{"categories":"x"}', '{"categories":[null,1,{"name":""},{"name":"ok","color":"<script>"}]}']) {
    fs.writeFileSync(f, content)
    const r = await call('GET', '/api/categories')
    assert.equal(r.status, 200, `坏文件 ${content} 不应让接口报错`)
    for (const c of r.json.categories) assert.ok(/^[a-z]+$/.test(c.color), '颜色必须是白名单值')
  }
})

test('声纹档案接口只返回元数据，并支持新增、编辑、删除', async () => {
  const initial = await call('GET', '/api/voiceprints')
  assert.equal(initial.status, 200)
  assert.deepEqual(initial.json.profiles, [])

  const created = await write('POST', '/api/voiceprints', {
    label: '待确认 · 测试说话人', role: '访谈嘉宾', sampleCount: 1,
    embeddingFile: '_context/voiceprints/test.npz', embeddingLabel: 'SPEAKER_00', embeddingDimensions: 256,
    note: '测试档案',
  })
  assert.equal(created.status, 200)
  const profile = created.json.profile
  assert.match(profile.id, /^speaker-/)
  assert.equal(profile.label, '待确认 · 测试说话人')
  assert.equal(profile.embeddingDimensions, 256)
  assert.equal(JSON.stringify(created.json).includes('data:'), false)

  const listed = await call('GET', '/api/voiceprints')
  assert.equal(listed.status, 200)
  assert.equal(listed.json.profiles.length, 1)
  assert.equal(listed.json.profiles[0].embeddingFile, '_context/voiceprints/test.npz')
  assert.equal(JSON.stringify(listed.json).includes('Float32Array'), false)

  const updated = await write('PATCH', '/api/voiceprints', { id: profile.id, label: '待确认 · 测试说话人', status: 'confirmed', role: '主持人' })
  assert.equal(updated.status, 200)
  assert.equal(updated.json.profile.status, 'confirmed')
  assert.equal(updated.json.profile.label, '测试说话人')
  assert.equal(updated.json.profile.role, '主持人')
  assert.equal((await write('PATCH', '/api/voiceprints', { id: profile.id, label: 'x', embeddingDimensions: -1 })).status, 400)
  assert.equal((await write('POST', '/api/voiceprints', { label: '测试说话人' })).status, 409)

  const duplicate = (await write('POST', '/api/voiceprints', { label: '另一条待合并档案', sampleCount: 2 })).json.profile
  const merged = await write('POST', '/api/voiceprints/merge', { sourceId: duplicate.id, targetId: profile.id })
  assert.equal(merged.status, 200)
  assert.equal(merged.json.profile.sampleCount, 3)
  assert.ok(merged.json.profile.mergedFrom.includes(duplicate.id))
  assert.equal((await call('GET', '/api/voiceprints')).json.profiles.length, 1)

  assert.equal((await write('DELETE', `/api/voiceprints?id=${encodeURIComponent(profile.id)}`)).status, 200)
  assert.equal((await call('GET', '/api/voiceprints')).json.profiles.length, 0)
})

test('常见词接口支持别名、启用状态，并拒绝非法输入', async () => {
  assert.deepEqual((await call('GET', '/api/terminology')).json.terms, [])
  const created = await write('POST', '/api/terminology', {
    term: 'faster-whisper', aliases: ['fast whisper', 'faster whisper'], note: '测试词', enabled: false,
  })
  assert.equal(created.status, 200)
  const term = created.json.term
  assert.match(term.id, /^term-/)
  assert.deepEqual(term.aliases, ['fast whisper', 'faster whisper'])
  assert.equal(term.status, 'candidate')

  const updated = await write('PATCH', '/api/terminology', { id: term.id, status: 'confirmed', enabled: true })
  assert.equal(updated.status, 200)
  assert.equal(updated.json.term.enabled, true)
  assert.equal(updated.json.term.status, 'confirmed')
  assert.equal((await write('POST', '/api/terminology', { term: 'faster-whisper' })).status, 409)
  assert.equal((await write('POST', '/api/terminology', { term: 'x', aliases: ['a\n b'] })).status, 400)
  assert.equal((await write('PATCH', '/api/terminology', { id: '../bad', term: 'x' })).status, 400)
  assert.equal((await write('DELETE', `/api/terminology?id=${encodeURIComponent(term.id)}`)).status, 200)
  assert.deepEqual((await call('GET', '/api/terminology')).json.terms, [])
})

test('已登记的音频片段可播放，未登记或越界文件不可读取', async () => {
  const clipsDir = path.join(root, '_context', 'audio-clips')
  fs.mkdirSync(clipsDir, { recursive: true })
  fs.writeFileSync(path.join(clipsDir, 'test.mp3'), Buffer.from('fake-mp3'))
  fs.writeFileSync(path.join(root, '_context', 'voiceprints.json'), JSON.stringify({
    version: 1,
    profiles: [{ id: 'speaker-test', label: '测试', clips: [{ id: 'clip-1', file: '_context/audio-clips/test.mp3', start: 0, end: 1, text: '测试', label: '试听' }] }],
  }))
  const ok = await call('GET', '/api/audio-clip?kind=voiceprint&id=speaker-test&clip=clip-1')
  assert.equal(ok.status, 200)
  assert.equal(ok.headers['content-type'], 'audio/mpeg')
  assert.equal(Number(ok.headers['content-length']), 8)
  assert.equal((await call('GET', '/api/audio-clip?kind=voiceprint&id=speaker-test&clip=nope')).status, 404)
  fs.writeFileSync(path.join(root, '_context', 'voiceprints.json'), JSON.stringify({
    version: 1,
    profiles: [{ id: 'speaker-test', label: '测试', clips: [{ id: 'clip-2', file: '../projects.md', start: 0, end: 1 }] }],
  }))
  assert.equal((await call('GET', '/api/audio-clip?kind=voiceprint&id=speaker-test&clip=clip-2')).status, 404)
})
