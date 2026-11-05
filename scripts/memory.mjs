#!/usr/bin/env node
// agent-memory CLI — dependency-free (Node 18+) memory linter / indexer.
//
// Usage:
//   node memory.mjs init   [--root DIR]
//   node memory.mjs lint   [--root DIR]
//   node memory.mjs index  [--root DIR]
//   node memory.mjs stats  [--root DIR]
//   node memory.mjs search <term> [--root DIR]
//
// Root resolution: --root > $AGENT_MEMORY_HOME > ./.agent-memory > ~/.agent-memory

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const VALID_STATUS = new Set([
  'active', 'consolidated', 'superseded', 'archived', 'historical_detail',
]);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') { out.root = argv[++i]; }
    else if (a.startsWith('--')) { out[a.slice(2)] = true; }
    else out._.push(a);
  }
  return out;
}

function defaultRoot() {
  if (process.env.AGENT_MEMORY_HOME) return path.resolve(process.env.AGENT_MEMORY_HOME);
  const local = path.resolve('.agent-memory');
  if (fs.existsSync(local)) return local;
  return path.join(os.homedir(), '.agent-memory');
}

// Minimal YAML-subset frontmatter parser: top-level `key: value` and one
// level of nesting under `metadata:` (indented `key: value`). Lists are ignored.
function readFrontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { fm: null, body: text };
  const fm = {};
  let nested = null;
  for (const rawLine of m[1].split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const indented = /^\s+/.test(rawLine);
    const line = rawLine.trim();
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    if (!value && !indented) { nested = {}; fm[key] = nested; continue; }
    if (indented && nested) nested[key] = value;
    else { fm[key] = value; nested = null; }
  }
  return { fm, body: text };
}

function walkMd(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === '.git' || ent.name === 'node_modules') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkMd(p, acc);
    else if (ent.isFile() && ent.name.endsWith('.md')) acc.push(p);
  }
  return acc;
}

function findIndexes(root) {
  return walkMd(root).filter(f => path.basename(f) === 'MEMORY.md');
}

function linkedTargets(indexFile) {
  const text = fs.readFileSync(indexFile, 'utf8');
  const links = [];
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+\.md)\)/g)) {
    const target = m[1].split('#')[0];
    links.push(path.resolve(path.dirname(indexFile), target));
  }
  return links;
}

function statusOf(fm) {
  return (fm && (fm.status || (fm.metadata && fm.metadata.status))) || null;
}

function typeOf(fm) {
  return (fm && (fm.type || (fm.metadata && fm.metadata.type))) || null;
}

function modifiedOf(fm) {
  return (fm && (fm.modified || (fm.metadata && fm.metadata.modified))) || null;
}

function cmdInit(root) {
  fs.mkdirSync(root, { recursive: true });
  const idx = path.join(root, 'MEMORY.md');
  if (fs.existsSync(idx)) {
    console.log(`already initialized: ${idx}`);
    return 0;
  }
  fs.writeFileSync(idx, `# Memory Index

## Active

<!-- 格式：- [标题](文件.md) — 约 80–120 汉字摘要（当前仍有效的事实/结论） -->

## History

<!-- 只在追查历史、事故证据、配置演化时读取；不要按这些文件恢复当前配置。 -->
`);
  console.log(`initialized: ${root}`);
  return 0;
}

function cmdLint(root) {
  const indexes = findIndexes(root);
  if (indexes.length === 0) {
    console.error(`! no MEMORY.md found under ${root}`);
    return 1;
  }
  let errors = 0, warnings = 0;
  for (const idx of indexes) {
    const dir = path.dirname(idx);
    const files = walkMd(dir).filter(f => f !== idx);
    const linked = new Set(linkedTargets(idx));
    for (const f of files) {
      const { fm } = readFrontmatter(f);
      const rel = path.relative(root, f);
      if (!fm) { console.log(`ERROR ${rel}: missing frontmatter`); errors++; continue; }
      const status = statusOf(fm);
      if (!status) { console.log(`ERROR ${rel}: missing status`); errors++; }
      else if (!VALID_STATUS.has(status)) {
        console.log(`ERROR ${rel}: invalid status "${status}"`);
        errors++;
      }
      if (!fm.name) { console.log(`WARN  ${rel}: missing name`); warnings++; }
      if (!fm.description) { console.log(`WARN  ${rel}: missing description`); warnings++; }
      if (!typeOf(fm)) { console.log(`WARN  ${rel}: missing metadata.type`); warnings++; }
      if (!modifiedOf(fm)) { console.log(`WARN  ${rel}: missing modified date`); warnings++; }
      if ((status === 'superseded' || status === 'consolidated')
          && !fm.superseded_by && !fm.consolidated_into && !(fm.metadata && (fm.metadata.superseded_by || fm.metadata.consolidated_into))) {
        console.log(`WARN  ${rel}: ${status} but no superseded_by/consolidated_into pointer`);
        warnings++;
      }
      if (!linked.has(path.resolve(f))) {
        console.log(`WARN  ${rel}: not linked from ${path.basename(path.dirname(f))}/MEMORY.md`);
        warnings++;
      }
    }
    for (const link of linked) {
      if (!fs.existsSync(link)) {
        console.log(`ERROR ${path.relative(root, idx)}: broken link -> ${path.relative(root, link)}`);
        errors++;
      }
    }
  }
  // duplicate content check (same sha256) across memory files
  const hashes = new Map();
  for (const idx of indexes) {
    for (const f of walkMd(path.dirname(idx))) {
      if (path.basename(f) === 'MEMORY.md') continue;
      const h = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
      if (hashes.has(h)) {
        console.log(`WARN  duplicate content: ${path.relative(root, hashes.get(h))} == ${path.relative(root, f)}`);
        warnings++;
      } else hashes.set(h, f);
    }
  }
  console.log(`\n${errors} error(s), ${warnings} warning(s)`);
  return errors > 0 ? 1 : 0;
}

function cmdIndex(root) {
  for (const idx of findIndexes(root)) {
    console.log(`\n## ${path.relative(root, path.dirname(idx)) || '.'}`);
    const text = fs.readFileSync(idx, 'utf8');
    let section = '';
    for (const line of text.split(/\r?\n/)) {
      const h = line.match(/^##\s+(.+)/);
      if (h) { section = h[1].trim(); continue; }
      if (/^-\s+\[/.test(line)) console.log(`  [${section}] ${line.replace(/^-\s+/, '')}`);
    }
  }
  return 0;
}

function cmdStats(root) {
  const counts = {};
  for (const idx of findIndexes(root)) {
    for (const f of walkMd(path.dirname(idx))) {
      if (path.basename(f) === 'MEMORY.md') continue;
      const { fm } = readFrontmatter(f);
      const s = statusOf(fm) || 'unknown';
      counts[s] = (counts[s] || 0) + 1;
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`${k.padEnd(18)} ${v}`);
  }
  console.log(`${'total'.padEnd(18)} ${total}`);
  return 0;
}

function cmdSearch(root, term) {
  if (!term) { console.error('usage: memory.mjs search <term> [--root DIR]'); return 2; }
  let hits = 0;
  for (const idx of findIndexes(root)) {
    for (const f of walkMd(path.dirname(idx))) {
      if (path.basename(f) === 'MEMORY.md') continue;
      const text = fs.readFileSync(f, 'utf8');
      if (!text.toLowerCase().includes(term.toLowerCase())) continue;
      const { fm } = readFrontmatter(f);
      const line = (text.split(/\r?\n/).find(l => l.toLowerCase().includes(term.toLowerCase())) || '').trim();
      console.log(`\n${path.relative(root, f)} [${statusOf(fm) || '?'}]`);
      console.log(`  ${line.slice(0, 200)}`);
      hits++;
    }
  }
  console.log(`\n${hits} hit(s)`);
  return hits > 0 ? 0 : 1;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'help';
  const root = path.resolve(args.root || defaultRoot());
  switch (cmd) {
    case 'init': return cmdInit(root);
    case 'lint': return cmdLint(root);
    case 'index': return cmdIndex(root);
    case 'stats': return cmdStats(root);
    case 'search': return cmdSearch(root, args._[1]);
    default:
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 12).join('\n'));
      return 0;
  }
}

process.exit(main());
