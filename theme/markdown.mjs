// Markup the theme adds to upstream Markdown before it becomes a page, for
// status.css to style. scripts/build-content.mjs calls `decorate` on every
// generated Markdown page. The words stay upstream; this only wraps them.
//
// It dresses status tables: any table with a "State" column, such as the
// ones on the roadmap page.
//
//   - each State cell becomes a badge, toned by `tones` below;
//   - links in an "Issue" column become chips;
//   - the heading above each table gets a tally of its states;
//   - a page with two or more such tables gets a summary before its first
//     heading: one row per table, with a bar and the same tally.
//
// A state this file doesn't know keeps its plain text, so a new word
// upstream degrades to an ordinary table cell instead of breaking. The
// markup is raw HTML in Markdown, so it doesn't depend on the Markdown
// processor's plugin interface.

import GithubSlugger from 'github-slugger';

/** Which tone each state is shown in, in display order. A look decision. */
const tones = {
  ready: 'success',
  verify: 'info',
  decide: 'warning',
  untracked: 'neutral',
};
const order = Object.keys(tones);

const STATE_COLUMN = 'state';
const ISSUE_COLUMN = 'issue';

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (s) => s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '');
const isRow = (l) => l && !l.code && /^\s*\|.*\|\s*$/.test(l.line);
const isRule = (l) => isRow(l) && /^[\s|:-]+$/.test(l.line) && l.line.includes('-');
/** A table row's cells, as written (between the outer pipes). */
const cells = (line) => line.trim().slice(1, -1).split(/(?<!\\)\|/);
const row = (cs) => `|${cs.join('|')}|`;

const badge = (label, tone) => `<span class="anvil-status" data-tone="${tone}">${escape(label)}</span>`;
const sorted = (counts) =>
  Object.entries(counts).sort(([a], [b]) => order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase()));
const tally = (counts) =>
  `<span class="anvil-tally">${sorted(counts)
    .map(([label, n]) => badge(`${n} ${label}`, tones[label.toLowerCase()]))
    .join('')}</span>`;
const bar = (counts) =>
  `<span class="anvil-bar" aria-hidden="true">${sorted(counts)
    .map(([label, n]) => `<span data-tone="${tones[label.toLowerCase()]}" style="flex-grow:${n}"></span>`)
    .join('')}</span>`;

/**
 * `lines` are scripts/lib/markdown.mjs's parsed lines ({ line, code, level,
 * text }), after headings are shifted and links rewritten. Returns new lines.
 */
export function decorate(lines) {
  const out = lines.map((l) => ({ ...l }));
  const slugger = new GithubSlugger();
  let heading = null;
  const sections = []; // { at: index of the heading line, id, title, counts }

  for (let i = 0; i < out.length; i++) {
    const l = out[i];
    if (l.level) {
      heading = { at: i, id: slugger.slug(plain(l.text)), title: plain(l.text) };
      continue;
    }
    if (!isRow(l) || !isRule(out[i + 1]) || isRow(out[i - 1])) continue;

    const columns = cells(l.line).map((c) => c.trim().toLowerCase());
    const stateAt = columns.indexOf(STATE_COLUMN);
    if (stateAt < 0) continue;
    const issueAt = columns.indexOf(ISSUE_COLUMN);
    const counts = {};
    for (let r = i + 2; isRow(out[r]); r++) {
      const cs = cells(out[r].line);
      const label = (cs[stateAt] ?? '').trim();
      const tone = tones[label.toLowerCase()];
      if (!tone) continue;
      cs[stateAt] = ` ${badge(label, tone)} `;
      counts[label] = (counts[label] ?? 0) + 1;
      if (cs[issueAt]) {
        cs[issueAt] = cs[issueAt].replace(
          /\[([^\]]+)\]\(([^)\s]+)\)/g,
          (_, text, href) => `<a class="anvil-issue" href="${escape(href)}">${escape(text)}</a>`,
        );
        // Chips separate themselves; drop the commas between them.
        cs[issueAt] = cs[issueAt].replace(/<\/a>\s*,\s*<a /g, '</a> <a ');
      }
      out[r].line = row(cs);
    }
    if (heading && Object.keys(counts).length) sections.push({ ...heading, counts });
  }
  if (!sections.length) return out;

  const html = (line) => [{ line: '', code: false }, { line, code: false }, { line: '', code: false }];
  // Insert from the bottom up, so earlier indexes stay valid.
  for (const s of [...sections].reverse()) {
    out.splice(s.at + 1, 0, ...html(`<p class="anvil-tally-line not-content">${tally(s.counts)}</p>`));
  }
  if (sections.length >= 2) {
    const items = sections
      .map((s) => `<li><a href="#${s.id}">${escape(s.title)}</a>${bar(s.counts)}${tally(s.counts)}</li>`)
      .join('');
    const first = out.findIndex((l) => l.level);
    out.splice(first, 0, ...html(`<nav class="anvil-progress not-content"><ul role="list">${items}</ul></nav>`));
  }
  return out;
}
