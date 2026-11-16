// Run before loading or committing:   node tools/check.js
//
// Catches the mistakes that stop the extension loading:
//   1. a script with a syntax error (parsed with V8, the engine Chrome uses);
//   2. a file the manifest or a page refers to that does not exist;
//   3. a script on disk that the manifest forgot to load.
// Prints what is wrong and exits with an error if anything is.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const problems = [];
const rel = (p) => path.relative(root, p).replace(/\\/g, '/');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const files = walk(root);

// 1. every script parses
const scripts = files.filter((f) => f.endsWith('.js'));
for (const f of scripts) {
  try { new vm.Script(fs.readFileSync(f, 'utf8'), { filename: rel(f) }); }
  catch (e) {
    const where = (e.stack || '').split('\n')[0];
    problems.push(`Syntax error: ${where}\n    ${e.message}`);
  }
}

// 2. everything the manifest names exists
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const named = [
  ...manifest.content_scripts.flatMap((c) => c.js || []),
  manifest.action && manifest.action.default_popup,
  manifest.options_ui && manifest.options_ui.page,
  ...Object.values(manifest.icons || {}),
  ...Object.values((manifest.action && manifest.action.default_icon) || {})
].filter(Boolean);
for (const n of named) if (!fs.existsSync(path.join(root, n))) problems.push(`manifest.json names a file that does not exist: ${n}`);

//    and everything a page links to exists
for (const f of files.filter((p) => p.endsWith('.html'))) {
  const html = fs.readFileSync(f, 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"#?:]+\.(?:js|css|html))"/g)) {
    const target = path.join(path.dirname(f), m[1]);
    if (!fs.existsSync(target)) problems.push(`${rel(f)} links to a file that does not exist: ${m[1]}`);
  }
}

// 3. no script in src/ is left out of the manifest
const loaded = new Set(manifest.content_scripts.flatMap((c) => c.js || []));
for (const f of scripts.map(rel)) if (f.startsWith('src/') && !loaded.has(f)) problems.push(`${f} exists but is not in manifest.json, so it never runs`);

if (problems.length) {
  console.error(`\n${problems.length} problem(s) found:\n`);
  for (const p of problems) console.error('  - ' + p + '\n');
  process.exit(1);
}
console.log(`All good: ${scripts.length} scripts parse, ${named.length} manifest files exist, nothing is missing.`);
