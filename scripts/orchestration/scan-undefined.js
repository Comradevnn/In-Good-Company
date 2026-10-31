// Static check for the mobile app: reports identifiers used but never
// defined or imported (JSX can't go through `node --check`).
// Usage: node scripts/orchestration/scan-undefined.js "<absolute path to mobile/>"
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
if (!root) { console.error('usage: node scan-undefined.js <abs path to mobile>'); process.exit(2); }
const babel = require(path.join(root, 'node_modules/@babel/parser'));
const traverse = require(path.join(root, 'node_modules/@babel/traverse')).default;
const dirs = ['screens', 'components', 'theme', 'theme/palettes', 'api', 'location', 'onboarding', 'auth', 'verification'];
const files = ['App.js', ...dirs.filter((d) => fs.existsSync(path.join(root, d)))
  .flatMap((d) => fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`))];
const globals = new Set(['undefined', 'console', 'fetch', 'Date', 'Math', 'Number', 'String', 'JSON', 'Promise', 'Object', 'Array',
  'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Intl', '__DEV__', 'require', 'module', 'process', 'Boolean',
  'Error', 'URLSearchParams', 'global', 'encodeURIComponent', 'Set', 'Map', 'isNaN', 'Buffer', 'TextEncoder', 'TextDecoder']);
let n = 0;
for (const f of files) {
  const ast = babel.parse(fs.readFileSync(path.join(root, f), 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  traverse(ast, {
    Program(p) { p.scope.crawl(); },
    ReferencedIdentifier(p) {
      const id = p.node.name;
      if (p.scope.hasBinding(id) || globals.has(id) || p.parentPath.isJSXClosingElement()) return;
      console.log(`${f}: ${id} line ${p.node.loc.start.line}`);
      n++;
    },
  });
}
console.log('undefined identifiers:', n);
