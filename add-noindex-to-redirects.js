const fs = require('fs');
const path = require('path');

const root = __dirname;

function hasRedirectMeta(html) {
  return /<meta\s+http-equiv=["']refresh["'][^>]*>/i.test(html);
}

function hasNoindex(html) {
  return /<meta\s+name=["']robots["'][^>]*noindex/i.test(html);
}

function injectNoindex(html) {
  // Insert robots noindex right after <head>
  return html.replace(/<head>/i, '<head>\n  <meta name="robots" content="noindex, nofollow">');
}

function processDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processDir(full);
    } else if (/\.html?$/i.test(entry.name)) {
      let html = fs.readFileSync(full, 'utf8');
      if (hasRedirectMeta(html) && !hasNoindex(html)) {
        const updated = injectNoindex(html);
        fs.writeFileSync(full, updated, 'utf8');
        console.log('noindex added:', path.relative(root, full));
      }
    }
  }
}

processDir(root);
