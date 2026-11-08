// Small, fence-aware Markdown helpers. Deliberately line-based: upstream
// docs are plain GitHub Markdown, and these only need to find headings,
// cut sections and rewrite link targets without touching code blocks.

import GithubSlugger from 'github-slugger';

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/**
 * Split a document into lines tagged with whether they sit inside a fenced
 * code block, and parse headings outside fences.
 */
export function parse(text) {
  const lines = text.split('\n');
  const out = [];
  let fence = null;
  for (const line of lines) {
    const f = line.match(FENCE);
    if (fence) {
      out.push({ line, code: true });
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      out.push({ line, code: true });
      continue;
    }
    const h = line.match(HEADING);
    out.push(h ? { line, code: false, level: h[1].length, text: h[2] } : { line, code: false });
  }
  return out;
}

/** Headings with the ids GitHub (and Astro) give them, in document order. */
export function headings(parsed) {
  const slugger = new GithubSlugger();
  return parsed
    .map((l, index) => (l.level ? { index, level: l.level, text: l.text, id: slugger.slug(plain(l.text)) } : null))
    .filter(Boolean);
}

/** Heading text as it reads, without inline Markdown, for ids and titles. */
export function plain(text) {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '');
}

/**
 * The line range [start, end) a cut covers, and the heading it drops.
 *   section undefined → whole file, minus a leading `#` title
 *   section null      → text before the first `##` (minus the `#` title)
 *   section "Text"    → that heading's body, up to the next heading of the
 *                       same or a higher level
 */
export function cut(parsed, section) {
  const hs = headings(parsed);
  const title = hs[0]?.level === 1 ? hs[0] : null;
  const afterTitle = title ? title.index + 1 : 0;

  if (section === undefined) {
    return { start: afterTitle, end: parsed.length, heading: title, shift: 0 };
  }
  if (section === null) {
    const firstH2 = hs.find((h) => h.level >= 2);
    return { start: afterTitle, end: firstH2 ? firstH2.index : parsed.length, heading: title, shift: 0 };
  }
  const matches = hs.filter((h) => plain(h.text) === section);
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `no heading "${section}"`
        : `heading "${section}" appears ${matches.length} times`,
    );
  }
  const h = matches[0];
  const next = hs.find((n) => n.index > h.index && n.level <= h.level);
  // The section's heading becomes the page title (an h1), so its children
  // move up to h2.
  return { start: h.index + 1, end: next ? next.index : parsed.length, heading: h, shift: h.level - 1 };
}

/** Raise every heading in the lines by `shift` levels (never above h2). */
export function shiftHeadings(parsed, shift) {
  if (!shift) return parsed;
  return parsed.map((l) => {
    if (!l.level) return l;
    const level = Math.max(2, l.level - shift);
    return { ...l, level, line: `${'#'.repeat(level)} ${l.text}` };
  });
}

const INLINE_LINK = /(!?)\[((?:[^\]\\]|\\.)*)\]\(\s*<?([^)\s>]+)>?(\s+"[^"]*")?\s*\)/g;
const REF_DEF = /^(\s{0,3}\[[^\]]+\]:\s*)<?(\S+?)>?(\s.*)?$/;

/**
 * Rewrite every link and image target outside code with `fn(target, isImage)`,
 * which returns the new target.
 */
export function rewriteLinks(parsed, fn) {
  return parsed.map((l) => {
    if (l.code) return l;
    const def = l.line.match(REF_DEF);
    if (def) return { ...l, line: `${def[1]}${fn(def[2], false)}${def[3] ?? ''}` };
    // Known limitation: a link written inside an inline code span is
    // rewritten too. Upstream docs don't do this today.
    const line = l.line.replace(INLINE_LINK, (all, bang, text, target, title) =>
      `${bang}[${text}](${fn(target, bang === '!')}${title ?? ''})`,
    );
    return { ...l, line };
  });
}

export function join(parsed) {
  return parsed.map((l) => l.line).join('\n');
}
