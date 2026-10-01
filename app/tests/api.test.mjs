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
  fs.mkdirSync(path.join(root, '_context'), { recursive: true })
  fs.writeFileSync(noteFile(), NOTE)
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
          resolve({ status: res.statusCode, json })
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
  assert.equal((await call('GET', '/api/notes')).status, 200)
  assert.equal((await call('GET', '/api/notes', { headers: { host: 'evil.example' } })).status, 403)
  assert.equal((await call('GET', '/api/notes', { headers: { host: 'evil.example:5174' } })).status, 403)
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
