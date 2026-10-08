export interface MarkdownSection {
  level: 2 | 3 | null
  title: string
  id: string
  body: string
}

export interface TocItem {
  level: 2 | 3
  title: string
  id: string
}

export interface ParsedNoteBody {
  main: MarkdownSection[]
  followups: MarkdownSection[]
  followupId: string
  toc: TocItem[]
  hasFollowups: boolean
}

const FOLLOWUP_TITLE = '追问记录'

function visibleMarkdown(markdown: string) {
  return markdown.replace(/<!--[\s\S]*?-->/g, '').trim()
}

function plainHeading(markdown: string) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function baseId(title: string) {
  return (
    title
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  )
}

function uniqueId(title: string, used: Map<string, number>) {
  const base = baseId(title)
  const count = (used.get(base) ?? 0) + 1
  used.set(base, count)
  return count === 1 ? base : `${base}-${count}`
}

/** 只在 fenced code block 之外识别二、三级 ATX 标题。 */
function splitSections(markdown: string, used: Map<string, number>): MarkdownSection[] {
  const sections: MarkdownSection[] = []
  let current: MarkdownSection = { level: null, title: '', id: '', body: '' }
  let bodyLines: string[] = []
  let fence: { marker: string; length: number } | null = null

  const flush = () => {
    current.body = bodyLines.join('\n').replace(/^\n+|\n+$/g, '')
    if (current.level !== null || current.body.trim()) sections.push(current)
    bodyLines = []
  }

  for (const line of markdown.split('\n')) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const token = fenceMatch[1]
      if (!fence) fence = { marker: token[0], length: token.length }
      else if (token[0] === fence.marker && token.length >= fence.length) fence = null
      bodyLines.push(line)
      continue
    }

    const heading = !fence ? line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/) : null
    if (!heading) {
      bodyLines.push(line)
      continue
    }

    flush()
    const title = plainHeading(heading[2])
    current = {
      level: heading[1].length as 2 | 3,
      title,
      id: uniqueId(title, used),
      body: '',
    }
  }
  flush()
  return sections
}

function splitFollowups(markdown: string) {
  const lines = markdown.split('\n')
  let fence: { marker: string; length: number } | null = null

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const token = fenceMatch[1]
      if (!fence) fence = { marker: token[0], length: token.length }
      else if (token[0] === fence.marker && token.length >= fence.length) fence = null
      continue
    }
    if (!fence && /^##\s+追问记录\s*#*\s*$/.test(line)) {
      return { main: lines.slice(0, i).join('\n'), followups: lines.slice(i + 1).join('\n') }
    }
  }
  return { main: markdown, followups: '' }
}

export function parseNoteBody(markdown: string): ParsedNoteBody {
  const split = splitFollowups(markdown)
  const used = new Map<string, number>()
  const main = splitSections(split.main, used)
  const followupId = uniqueId(FOLLOWUP_TITLE, used)
  const hasFollowups = Boolean(visibleMarkdown(split.followups))
  const followups = hasFollowups ? splitSections(split.followups, used) : []
  const toc: TocItem[] = main
    .filter((section): section is MarkdownSection & { level: 2 | 3 } => section.level !== null)
    .map(({ level, title, id }) => ({ level, title, id }))

  if (hasFollowups) {
    toc.push({ level: 2, title: FOLLOWUP_TITLE, id: followupId })
    toc.push(
      ...followups
        .filter((section): section is MarkdownSection & { level: 2 | 3 } => section.level !== null)
        .map(({ level, title, id }) => ({ level, title, id })),
    )
  }

  return { main, followups, followupId, toc, hasFollowups }
}
