const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const baseUrl = 'https://poitaro.github.io/';

function generateRedirectHtml(url) {
  return `<!DOCTYPE html>\n` +
    `<html lang="ja">\n` +
    `<head>\n` +
    `  <meta charset="UTF-8">\n` +
    `  <title>Redirecting...</title>\n` +
    `  <meta http-equiv="refresh" content="0; url=${url}">\n` +
    `</head>\n` +
    `<body>\n` +
    `  <p>このページは新しいURLに移動しました。自動で転送されます。</p>\n` +
    `  <a href="${url}">移動されない場合はこちらをクリックしてください</a>\n` +
    `</body>\n` +
    `</html>\n`;
}

function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      processDirectory(fullPath);
      continue;
    }

    if (path.extname(entry.name).toLowerCase() === '.html') {
      const relativePath = path.relative(rootDir, fullPath);
      const urlPath = relativePath.split(path.sep).join('/');
      const redirectUrl = baseUrl + urlPath;
      const htmlContent = generateRedirectHtml(redirectUrl);

      fs.writeFileSync(fullPath, htmlContent, 'utf8');
      console.log(`Updated redirect: ${relativePath} -> ${redirectUrl}`);
    }
  }
}

processDirectory(rootDir);
