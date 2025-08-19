const fs = require('fs');
const path = require('path');
const { marked } = require('marked'); // markedをインポート

const articlesDir = path.join(__dirname, 'articles');
const articlesHtmlDir = path.join(__dirname, 'articles_html'); // 新しい出力ディレクトリ
const postsJsonPath = path.join(__dirname, 'posts.json');
const sitemapPath = path.join(__dirname, 'sitemap.xml');
const articleTemplatePath = path.join(__dirname, 'article-template.html'); // テンプレートファイルのパス

// GitHub PagesのURLに合わせて変更してください
const baseUrl = 'https://PoiTaro.github.io/blog/';

// articles_html ディレクトリが存在しない場合は作成
if (!fs.existsSync(articlesHtmlDir)) {
    fs.mkdirSync(articlesHtmlDir);
}

// --- Frontmatterをパースする関数 ---
function parseFrontmatter(markdown) {
    const frontmatterRegex = /^---\s*([\s\S]*?)\s*---/;
    const match = frontmatterRegex.exec(markdown);
    const attributes = {};
    if (match) {
        const frontmatter = match[1];
        frontmatter.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split(':');
            if (key && valueParts.length) {
                let value = valueParts.join(':').trim();
                if (value.startsWith('[') && value.endsWith(']')) {
                    attributes[key.trim()] = value.slice(1, -1).split(',').map(tag => tag.trim().replace(/^"|"$/g, ''));
                } else {
                    attributes[key.trim()] = value.replace(/^['" ]|['" ]$/g, '');
                }
            }
        });
    }
    return attributes;
}

// --- Markdownコンテンツを抽出する関数 ---
function extractMarkdownContent(markdown) {
    const frontmatterRegex = /^---\s*[\s\S]*?\s*---/;
    return markdown.replace(frontmatterRegex, '').trim();
}

// 1. articlesディレクトリからマークダウンファイルの一覧を取得
const articleFiles = fs.readdirSync(articlesDir).filter(file => file.endsWith('.md'));

// 記事テンプレートを読み込む
const articleTemplate = fs.readFileSync(articleTemplatePath, 'utf8');

// 2. 各ファイルの情報を取得し、新しい順にソート
const posts = articleFiles.map(file => {
    const filePath = path.join(articlesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const stats = fs.statSync(filePath);
    const attributes = parseFrontmatter(content);
    const markdownContent = extractMarkdownContent(content);
    const htmlContent = marked(markdownContent); // MarkdownをHTMLに変換

    const slug = file.replace(/\.md$/, ''); // ファイル名からスラッグを生成
    const articleHtmlFileName = `${slug}.html`;
    const articleRelativeUrl = `articles_html/${articleHtmlFileName}`;
    const articleAbsoluteUrl = `${baseUrl}${articleRelativeUrl}`;
    const articleHtmlFilePath = path.join(articlesHtmlDir, articleHtmlFileName);

    // タグのHTMLを生成
    let tagsHtml = '';
    if (attributes.tags && attributes.tags.length > 0) {
        tagsHtml = attributes.tags.map(tag => `<a href="${baseUrl}index.html?tag=${encodeURIComponent(tag)}">${tag}</a>`).join('');
    } else {
        // タグがない場合はタグセクションを非表示にするためのコメント
        tagsHtml = '<!-- No tags, hide section -->';
    }

    // テンプレートにデータを挿入してHTMLファイルを生成
    let finalHtml = articleTemplate
        .replace(/{{title}}/g, attributes.title || '無題の記事')
        .replace(/{{date}}/g, attributes.date || new Date(stats.mtime).toISOString().split('T')[0])
        .replace(/{{category}}/g, attributes.category || '未分類')
        .replace(/{{description}}/g, attributes.description || '記事の説明がありません。')
        .replace(/{{image}}/g, attributes.image || 'https://placehold.co/600x400/gray/FFFFFF?text=No+Image')
        .replace(/{{url}}/g, articleAbsoluteUrl)
        .replace(/{{alt_title}}/g, attributes.title || '無題の記事')
        .replace(/{{categoryColor}}/g, attributes.categoryColor || 'red') // カテゴリカラーを挿入
        .replace(/<!-- Tags will be displayed here -->/g, tagsHtml) // タグHTMLを挿入
        .replace(/{{content}}/g, htmlContent);

    fs.writeFileSync(articleHtmlFilePath, finalHtml);

    return {
        slug: slug, // スラッグを追加
        url: articleRelativeUrl, // 新しいURL形式
        mtime: stats.mtime.getTime(),
        title: attributes.title || '無題の記事',
        date: attributes.date || new Date(stats.mtime).toISOString().split('T')[0],
        category: attributes.category || '未分類',
        categoryColor: attributes.categoryColor || 'gray',
        image: attributes.image || 'https://placehold.co/600x400/gray/FFFFFF?text=No+Image',
        description: attributes.description || '記事の説明がありません。',
        tags: attributes.tags || [],
        content: htmlContent // Add the full HTML content
    };
}).sort((a, b) => b.mtime - a.mtime); // 降順（新しいものが先頭）にソート

// 3. posts.jsonファイルに書き出す（mtimeは不要なので除外）
const finalPosts = posts.map(({ mtime, ...rest }) => rest);
fs.writeFileSync(postsJsonPath, JSON.stringify(finalPosts, null, 4));

console.log(`Successfully generated posts.json with ${finalPosts.length} articles.`);
console.log(`Successfully generated ${finalPosts.length} HTML articles in ${articlesHtmlDir}.`);

// 4. サイトマップ(sitemap.xml)を生成
const sitemapContent = `
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}index.html</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
${posts.map(post => `
  <url>
    <loc>${baseUrl}${post.url}</loc>
    <lastmod>${new Date(post.mtime).toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
`).join('')}
</urlset>
`.trim();

fs.writeFileSync(sitemapPath, sitemapContent);

console.log('Successfully generated sitemap.xml');