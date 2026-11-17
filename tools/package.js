// Build the release zip:   node tools/package.js
//
// Writes dist/Web-Wide-Water-<version>.zip containing only what the extension
// needs (manifest, icons, popup, control centre, scripts), with manifest.json
// at the top level, ready to attach to a GitHub release. The demo page, docs
// and tools stay out.
//
// It packs the last commit, not loose edits, so the zip always matches a version
// that is on record. It runs tools/check.js first and stops if anything is wrong.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const INCLUDE = ['manifest.json', 'icons', 'popup', 'control', 'src', 'LICENSE'];

try { run(process.execPath, [path.join(__dirname, 'check.js')]); }
catch (e) { console.error('\nNot packaged: fix the problems above first.'); process.exit(1); }

const dirty = run('git', ['status', '--porcelain', '--', ...INCLUDE]).trim();
if (dirty) {
  console.error('Not packaged: these files have changes that are not committed yet:\n' + dirty + '\nCommit them first, so the zip matches a recorded version.');
  process.exit(1);
}

const { version } = JSON.parse(run('git', ['show', 'HEAD:manifest.json']));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join('dist', `Web-Wide-Water-${version}.zip`);
run('git', ['archive', '--format=zip', `--output=${out}`, 'HEAD', '--', ...INCLUDE]);
const kb = Math.round(fs.statSync(path.join(root, out)).size / 1024);
console.log(`Built ${out.replace(/\\/g, '/')} (${kb} KB) from commit ${run('git', ['rev-parse', '--short', 'HEAD']).trim()}.`);
