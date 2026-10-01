/**
 * 词根词缀拆解算法（纯前端，离线可用）
 *
 * 候选枚举 + 打分：
 *   枚举所有「前缀 × 后缀 × 词根」组合，对能对齐该单词的组合打分，取最高分。
 *   规则：
 *   - 词根命中 +5，前缀命中 +4，双字母及以上后缀命中 +4，单字母后缀命中 +1
 *   - 词根尽量贴近中间段头部/尾部时额外加分，远离则扣分
 *   - 仅有「孤立单字母后缀（如 s）」且无前缀/词根的组合 → 直接丢弃（避免 hypothesis 误拆 -s）
 *   - 整个词都拆不出有意义的块 → 返回 null（面板隐藏）
 */
import { PREFIXES, SUFFIXES, ROOTS, type AffixEntry, type RootEntry } from './morphology-data.ts'

export interface MorphSegment {
  type: 'prefix' | 'root' | 'suffix'
  text: string
  zh?: string
  en?: string
  matched: boolean // 命中内置表（残段 matched=false，无释义）
}

export interface MorphResult {
  word: string
  segments: MorphSegment[]
}

const MIN_STEM = 2

const PREFIXES_BY_LEN = [...PREFIXES].sort((a, b) => b.form.length - a.form.length)
const SUFFIXES_BY_LEN = [...SUFFIXES].sort((a, b) => b.form.length - a.form.length)
const ROOTS_BY_LEN = [...ROOTS].sort((a, b) => b.root.length - a.root.length)

export function decomposeWord(rawWord: string): MorphResult | null {
  const word = rawWord.toLowerCase().trim()
  if (word.length < 5 || !/^[a-z]+$/.test(word)) return null

  const prefixCandidates: (AffixEntry | null)[] = [
    ...PREFIXES_BY_LEN.filter((p) => word.startsWith(p.form) && word.length - p.form.length >= MIN_STEM),
    null,
  ]
  const suffixCandidates: (AffixEntry | null)[] = [
    ...SUFFIXES_BY_LEN.filter((s) => {
      if (!word.endsWith(s.form) || s.form.length >= word.length || word.length - s.form.length < MIN_STEM) return false
      // 单字母 s 仅在词干以辅音结尾时视为复数（避免 hypothesis 误拆）
      if (s.form === 's' && /[aeiou]s$/.test(word)) return false
      return true
    }),
    null,
  ]

  let best: { score: number; segments: MorphSegment[] } | null = null

  for (const p of prefixCandidates) {
    const start = p ? p.form.length : 0
    for (const s of suffixCandidates) {
      const end = s ? word.length - s.form.length : word.length
      if (end - start < MIN_STEM) continue

      const mid = word.slice(start, end)
      const rootHit = ROOTS_BY_LEN.find((r) => mid.includes(r.root) && r.root.length > 1)

      // 丢弃「仅孤立单字母后缀」组合
      if (!p && !rootHit && s && s.form.length === 1) continue
      // 三块全未命中
      if (!p && !rootHit && !s) continue

      const segments: MorphSegment[] = []
      if (p) segments.push(prefixSegment(p))
      if (rootHit) {
        const i = mid.indexOf(rootHit.root)
        if (i > 0) segments.push(stemSegment(mid.slice(0, i)))
        segments.push(rootSegment(rootHit))
        if (i + rootHit.root.length < mid.length) segments.push(stemSegment(mid.slice(i + rootHit.root.length)))
      } else {
        segments.push(stemSegment(mid))
      }
      if (s) segments.push(suffixSegment(s))

      let score = 0
      if (p) score += 4
      if (s) score += s.form.length >= 2 ? 4 : 1
      if (rootHit) {
        score += 5
        const i = mid.indexOf(rootHit.root)
        const trail = mid.length - i - rootHit.root.length
        if (i <= 2) score += 1
        if (trail <= 2) score += 1
        if (i > 4) score -= 2
        if (trail > 4) score -= 2
      }

      if (!best || score > best.score) best = { score, segments }
    }
  }

  if (!best || best.score < 4) return null
  return { word, segments: best.segments }
}

function prefixSegment(entry: AffixEntry): MorphSegment {
  return { type: 'prefix', text: entry.form, zh: entry.zh, en: entry.en, matched: true }
}

function suffixSegment(entry: AffixEntry): MorphSegment {
  return { type: 'suffix', text: entry.form, zh: entry.zh, en: entry.en, matched: true }
}

function rootSegment(entry: RootEntry): MorphSegment {
  return { type: 'root', text: entry.root, zh: entry.zh, en: entry.en, matched: true }
}

function stemSegment(text: string): MorphSegment {
  return { type: 'root', text, matched: false }
}
