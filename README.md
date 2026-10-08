# research-archive

**一个 Claude Code / Codex skill：把你感兴趣的链接变成研究库里的一条笔记。**
*A Claude Code / Codex skill that turns links you find interesting into notes in a personal research library.*

看到感兴趣的工作（GitHub 仓库、arXiv 论文、博客、YouTube、小红书、公众号），把链接发给 Claude，它会识别来源、抓取内容、按模板写一份简单分析，存成一个 md 文件，更新索引，并对照你关心的项目写出关联。

## 特点

- **纯文件**：一条一个 md，带 frontmatter，没有数据库，Obsidian 直接能开，随时可迁移。
- **诚实优先**：抓不到就明说，不编；每条笔记的「证据与来源」写清读了什么、没读到什么、哪些没验证。
- **关联有核实标记**：对照你写的项目画像，区分「按画像推测」和「已读项目文档」，避免凭名字猜。
- **数据和工具分开**：本仓库只有 skill、模板和文档。你的笔记、项目画像放在自己的目录里，不会被这个仓库带走。
- **分级分析**：默认 `quick`（只看元数据和 README/摘要），你说「细看」才 `deep`（读源码或全文）。
- **短期任务与长期项目分开**：研究资料可关联短期任务；任务完成后，任务和关联资料默认隐藏，需要时统一展开。长期方向继续放项目画像。

## 支持的来源

| 来源 | 状态 | 说明 |
|---|---|---|
| GitHub | 稳定 | 用公开 API（装了 `gh` 更好）；deep 时 `git clone --depth=1` |
| arXiv（含 alphaxiv 链接） | 稳定 | 用 arXiv API 取元数据和摘要 |
| 网页 / 博客 | 稳定 | 需要一个能抽正文的工具 |
| YouTube | 尽力而为 | 需要 `yt-dlp` 取字幕，否则请你贴字幕 |
| 用户自上传 | 稳定（按授权范围读取） | 适合本地音频、视频、PDF、文本或工具实验；只读取明确指定的文件，不扫描所在目录 |
| 小红书 / 微信公众号 | 尽力而为 | 常有反爬或登录墙，抓不到会请你贴正文 |

## 安装

```bash
git clone https://github.com/loroa123/research-archive.git ~/research-archive
ln -s ~/research-archive/skill ~/.claude/skills/research-archive      # Claude Code
ln -s ~/research-archive/skill ~/.codex/skills/research-archive       # Codex（可选）

cp ~/research-archive/skill/config.example.md ~/research-archive/skill/config.local.md
# 编辑 config.local.md，把「库根」改成你想放研究库的目录
```

`config.local.md` 已被 `.gitignore` 忽略，里面的路径和个人设置不会上传。

## 使用

在 Claude Code 里直接发链接并说一句话：

```
分析一下 https://arxiv.org/abs/xxxx.xxxxx
归档这个仓库 https://github.com/owner/repo
研究库里有没有关于 multi-agent 的？
细看一下刚才那个仓库
加到关心的项目里：<项目名和一两句说明>
```

本地文件也可以直接指定路径，例如：

```
分析一下 /path/to/recording.mp3
```

本地文件归档到 `self-upload/`；处理时只读取你明确指定的文件和允许的临时输出，不扫描所在目录。

会议或访谈录音会优先整理为“要点常显 + 完整文字折叠 + 按时间原声跳播”的会谈资料；默认不匹配项目画像，除非你明确要求关联某个项目。

第一次使用时，skill 会在库根下创建目录和空索引。

## 库的结构

```
<库根>/
├── index.md              # 总索引（日期、来源、一句话、verdict、标签）
├── _context/projects.md  # 你关心的项目画像（私有）
├── _context/tasks.json   # 短期任务索引与状态（私有）
├── _tasks/               # 短期任务正文（私有）
├── _templates/note.md    # 可选，覆盖内置模板
├── _raw/                 # 原文快照，只追加
└── github/ paper/ video/ self-upload/ xhs/ wechat/ web/
```

笔记模板见 [`skill/note-template.md`](skill/note-template.md)，示例见 [`examples/`](examples/)。

## 界面（可选）

`app/` 是一个本地网页，用来浏览、筛选和管理研究库：可切换的卡片/列表展示、统计、标签与短期任务筛选、搜索、笔记详情（含右侧目录和独立追问区块）、独立任务页、项目画像页，以及声纹档案和常见词管理页。会谈类笔记可以显示默认折叠的完整逐段文字，点击时间直接跳到原音频播放。已确认的声纹和词汇默认折叠到归档区；声纹重名时不会覆盖，可明确合并档案。条目优先显示发布日期，没有时才显示归档日期。技术栈：React 19、Vite、Tailwind 4。

**自定义分类**：在页面里新增、改名、换颜色、删除分类，并把每条笔记归入一个分类（卡片上或详情页里直接选）。分类名写在笔记的 frontmatter（`category:`），分类清单存在 `<库根>/_context/categories.json`，所以不用界面也能读写。

**短期任务**：任务索引存在 `<库根>/_context/tasks.json`，正文存在 `<库根>/_tasks/<id>.md`，笔记通过 frontmatter 的 `task:` 关联。卡片、列表和详情页都能选择任务；任务页可标记完成或重新启用。`done` / `archived` 任务及其关联资料默认隐藏，任务页和研究库共用一个“显示已完成任务”偏好统一展开。任务不是内容分类，也不是长期项目画像。

```bash
cd app
npm install
npm run dev        # 打开 http://127.0.0.1:5174
```

- 库根读取顺序：环境变量 `RESEARCH_DIR` → `skill/config.local.md` 里的「库根」→ `~/research`。
- 只监听 `127.0.0.1`，不会上传任何数据。读取范围限定在库根下的来源目录。
- 会谈播放只接受笔记 frontmatter 明确登记的 `meeting_audio` 与 `meeting_transcript`，且两个文件都必须位于库根的 `_raw/` 内；音频接口支持 Range 请求，以便按时间快速跳播。
- **页面写入范围**：分类清单 `_context/categories.json`、任务索引 `_context/tasks.json` 中已有任务的状态、笔记 frontmatter 里的 `category:` / `task:` 一行，以及声纹/词库元数据 `_context/voiceprints.json` 和 `_context/terminology.json`。声纹和词汇档案可以登记本地试听片段；音频接口只允许播放已登记且位于 `_context/audio-clips/` 下的文件，声纹向量附件不会通过浏览器接口返回。
- **写接口的防护**（浏览器里任何网页都能向 `127.0.0.1` 发请求，所以不能只靠「只监听本机」）：
  - 只接受本机 Host（防 DNS rebinding）；写请求必须带自定义头 `x-ra-write`、`application/json`、同源 Origin（`Origin: null` 也拒绝）、`Sec-Fetch-Site` 为同源；Vite 的 CORS 已关闭。
  - 请求体上限 10KB；分类最多 100 个，声纹档案最多 100 个，常见词最多 500 个。
  - 分类名：NFC 归一化后 1–30 个字符；拒绝换行、控制字符、零宽字符、双向覆盖、行/段分隔符、孤立代理项，以及保留名 `__none__`；大小写或 Unicode 同形都算重名。
  - 写入 frontmatter 时，只有「以字母开头且不是 YAML 保留词」的名字才原样写，其余一律加引号，保证读回的值和写入的完全一致（数字、日期、`0x1F`、`yes`、`# x` 等都有测试）。
  - 笔记 id 限定在来源目录白名单内，文件名不能含路径分隔符、控制字符、不能以点开头；点文件不会被列出。
  - 写文件用「临时文件 + 重命名」，不会留下写到一半的文件。
- **渲染层防护**：笔记正文不渲染原始 HTML，不自动加载外部图片，链接另开标签并带 `noopener`；frontmatter 里的 `url` 只接受 http/https，`javascript:`、`data:` 会被禁用；所有字段按纯文本显示。
- 删除分类前会提示影响几条笔记；删除只清除笔记里的 `category:` 行，不动正文。
- **自动化测试**：`cd app && npm test`（当前 20 项，会起一个真实服务器指向临时库，覆盖以上防护、任务状态与笔记任务关联、声纹/词库接口和音频路径校验）。改动后还应运行 `npm run typecheck` 和 `npm run build`。
- 归档新条目仍然通过对话里的 skill 完成（页面不能调用 Claude）。

## 换会话与交接

最稳妥的做法是在你的**研究库根目录**开启新会话，而不是只在本工具仓库里开启。研究库可以放私有的 `AGENTS.md` / `CLAUDE.md`、进展记录、项目画像和信源规则；新 AI 先读这些文件，再根据任务进入本工具仓库改代码。

新会话可以直接说：

```text
继续维护研究工具。先按研究库根目录的 AGENTS.md / CLAUDE.md 读取交接材料，再读工具仓库的 docs/AI-HANDOFF-BOOK.md；核对当前工作树和测试状态后继续，不上传私有研究数据。
```

完整的 AI 接手顺序、架构、数据契约、验证命令和收尾要求见 [AI Handoff Book](docs/AI-HANDOFF-BOOK.md)。它描述通用工具；某个用户的当前状态仍以其私有研究库里的进展文件为准。

## 隐私

- 研究库里的笔记和项目画像是你的私有数据，**不要推到公开仓库**。本仓库的 `.gitignore` 只忽略 `config.local.md`，库根建议放在仓库之外。
- `examples/` 里的内容全部是虚构的。

## 文档

- [设计说明](docs/design.md)：为什么这么设计，哪些是刻意的取舍。
- [AI Handoff Book](docs/AI-HANDOFF-BOOK.md)：Claude/Codex 新会话的接手顺序、边界、架构和验证清单。
