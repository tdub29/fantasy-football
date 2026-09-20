const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const site = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(site, 'css', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');

assert.match(html, /id="nav-toggle"[^>]+aria-expanded="false"/);
assert.match(app, /function setMobileNav\(open, returnFocus = false\)/);
assert.match(app, /toggle\.setAttribute\('aria-expanded', String\(open\)\)/);
assert.match(app, /querySelector\('\.sidebar-close'\)\?\.focus\(\)/);
assert.match(css, /body\.nav-open \.nav-toggle \{ visibility: hidden; pointer-events: none; \}/);

// One shape for the star/block badge everywhere: the base rule owns the radius now,
// so a table badge and a card badge cannot drift into a square and a pill again.
assert.doesNotMatch(css.match(/\.mark-btn \{([\s\S]*?)\}/)?.[1] || '', /border-radius: 999px/);
assert.match(css.match(/\.mark-btn \{([\s\S]*?)\}/)?.[1] || '', /border-radius: var\(--radius-sm\)/);
const tableMark = css.match(/table\.data \.mark-btn \{([\s\S]*?)\}/)?.[1] || '';
assert.doesNotMatch(tableMark, /border-radius/);   // inherited, never re-declared
// 44px is the TOUCH floor, not the cursor size: a 44px block in every row set the
// row height on its own. Assert the coarse-pointer rule still guarantees it.
const coarseMark = css.match(/@media \(pointer: coarse\) \{\s*table\.data \.mark-btn \{([\s\S]*?)\}/)?.[1] || '';
assert.match(coarseMark, /inline-size: 44px/);
assert.match(coarseMark, /block-size: 44px/);
assert.match(app, /'aria-pressed': String\(marked\)/);
assert.match(app, /btn\.setAttribute\('aria-pressed', String\(on\)\)/);

console.log('mobile-controls.test.js: all assertions passed');
