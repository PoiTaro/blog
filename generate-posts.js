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
const rawPosts = articleFiles.map(file => {
    const filePath = path.join(articlesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const stats = fs.statSync(filePath);
    const attributes = parseFrontmatter(content);
    const markdownContent = extractMarkdownContent(content);
    let htmlContent = marked(markdownContent); // MarkdownをHTMLに変換

    // H2見出しを抽出して目次を作成し、本文内のH2にidアンカーを付与
    const h2Regex = /<h2>(.*?)<\/h2>/g;
    const h2Matches = [...htmlContent.matchAll(h2Regex)].map(m => m[1]);
    const slugify = (s) => s
        .toString()
        .trim()
        .toLowerCase()
        .replace(/<[^>]+>/g, '') // strip HTML
        .replace(/&[^;]+;/g, '') // strip entities
        .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf\s-]/g, '') // keep jp chars
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

    const h2Anchors = h2Matches.map(text => ({ text, id: slugify(text) }));
    if (h2Anchors.length > 0) {
        // 本文の<h2>にidを付与
        h2Anchors.forEach(({ id, text }) => {
            const h2Tag = `<h2>${text}</h2>`;
            const h2TagWithId = `<h2 id="${id}">${text}</h2>`;
            htmlContent = htmlContent.replace(h2Tag, h2TagWithId);
        });
    }

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

        // Determine image fields: prefer frontmatter keys (thumbnail, image, image_url) as-provided.
        const fmImage = attributes.thumbnail || attributes.image || attributes.image_url || attributes.imageUrl || attributes.img || null;
        // image: used in templates directly (must be a usable URL or path as provided in frontmatter)
        const imageValue = fmImage || 'https://placehold.co/600x400/gray/FFFFFF?text=No+Image';
        // imageLocal: preserve relative/local path if frontmatter included a relative path starting with ../ or ./ or /thumbnails
        const isRelative = fmImage && (/^(\.|\.\.|\/|thumbnails|\.\/|\.\.\/)/.test(fmImage));
        const imageLocalValue = isRelative ? fmImage : imageValue;
        // imageAbsolute: if the provided value looks absolute (starts with http), keep it; otherwise, prefix with baseUrl
        const imageAbsoluteValue = fmImage && /^https?:\/\//.test(fmImage) ? fmImage : (isRelative ? `${baseUrl}${fmImage.replace(/^\.\/?/, '')}` : imageValue);

        return {
        slug: slug, // スラッグを追加
        url: articleRelativeUrl, // 新しいURL形式
        mtime: stats.mtime.getTime(),
        title: attributes.title || '無題の記事',
        date: attributes.date || new Date(stats.mtime).toISOString().split('T')[0],
        category: attributes.category || '未分類',
        categoryColor: attributes.categoryColor || 'gray',
    image: imageValue,
    imageLocal: imageLocalValue,
    imageAbsolute: imageAbsoluteValue,
        description: attributes.description || '記事の説明がありません。',
        tags: attributes.tags || [],
            content: htmlContent, // Add the full HTML content
            toc: h2Anchors, // Array of {text, id}
                articleHtmlFilePath,
                articleAbsoluteUrl,
                tagsHtml
    };
}).sort((a, b) => b.mtime - a.mtime); // 降順（新しいものが先頭）にソート

// 関連記事を計算する関数（タグ一致を優先、次にカテゴリ一致。自分自身は除外。最大3件）
function getRelatedPosts(current, all) {
    const candidates = all.filter(p => p.slug !== current.slug);
    const score = (p) => {
        const tagOverlap = (current.tags || []).filter(t => (p.tags || []).includes(t)).length;
        const categoryBonus = current.category && p.category && current.category === p.category ? 0.5 : 0;
        return tagOverlap + categoryBonus;
    };
    const scored = candidates
        .map(p => ({ p, s: score(p) }))
        .sort((a, b) => b.s - a.s || b.p.mtime - a.p.mtime);

    // まずスコア>0を優先的に最大3件
    const primary = scored.filter(({ s }) => s > 0).slice(0, 3).map(({ p }) => p);
    if (primary.length === 3) return primary;

    // 足りない分は最新順で補充（重複を避ける）
    const need = 3 - primary.length;
    const fallback = candidates
        .filter(p => !primary.some(pp => pp.slug === p.slug))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, need);
    return primary.concat(fallback);
}

// 関連記事セクションのHTMLを生成
function buildRelatedHtml(related) {
        if (!related || related.length === 0) return '';
        return `
        <section class="mt-12">
            <h2 class="text-2xl font-bold mb-6 text-gray-900 dark:text-white">関連記事</h2>
            <div class="grid gap-6 md:grid-cols-3">
                ${related.map(r => `
                    <a href="../${r.url}" class="group block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition">
                        <div class="w-full aspect-video overflow-hidden">
                            <img src="${r.image}" alt="${r.title}" class="w-full h-full object-cover">
                        </div>
                        <div class="p-4">
                            <p class="text-xs font-semibold text-primary-600 dark:text-primary-400 mb-1">${r.category || ''}</p>
                            <h3 class="text-sm font-bold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 line-clamp-2">${r.title}</h3>
                        </div>
                    </a>
                `).join('')}
            </div>
        </section>
        `;
}

// 目次のHTMLを生成（H2のみ）
function buildTocHtml(toc) {
        if (!toc || toc.length === 0) return '';
        return `
        <nav aria-label="目次" class="mb-8">
            <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-800/50 backdrop-blur px-5 py-4">
                <div class="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>
                    目次
                </div>
                <ul class="space-y-1">
                    ${toc.map(item => `
                        <li>
                            <a href="#${item.id}" class="block text-sm text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                                ${item.text}
                            </a>
                        </li>
                    `).join('')}
                </ul>
            </div>
        </nav>`;
}

// 3. 各記事の最終HTMLを生成（関連記事を挿入）
rawPosts.forEach(current => {
        const related = getRelatedPosts(current, rawPosts);
        const relatedHtml = buildRelatedHtml(related);
    const tocHtml = buildTocHtml(current.toc);

        let finalHtml = articleTemplate
                .replace(/{{title}}/g, current.title)
                .replace(/{{date}}/g, current.date)
                .replace(/{{category}}/g, current.category)
                .replace(/{{description}}/g, current.description)
                .replace(/{{image}}/g, current.image)
                .replace(/{{url}}/g, current.articleAbsoluteUrl)
                .replace(/{{alt_title}}/g, current.title)
                .replace(/{{categoryColor}}/g, current.categoryColor)
                .replace(/<!-- Tags will be displayed here -->/g, current.tagsHtml)
            .replace(/<!-- TOC will be displayed here -->/g, tocHtml)
            .replace(/{{content}}/g, current.content)
                .replace(/<!-- Related posts will be displayed here -->/g, relatedHtml);

        fs.writeFileSync(current.articleHtmlFilePath, finalHtml);
});

// posts.jsonファイルに書き出す（公開メタ + 更新日時）
const finalPosts = rawPosts.map(({ mtime, articleHtmlFilePath, articleAbsoluteUrl, tagsHtml, content, ...rest }) => ({
    ...rest,
    updatedAt: new Date(mtime).toISOString()
}));
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
    <url>
        <loc>${baseUrl}contact.html</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.4</priority>
    </url>
${rawPosts.map(post => `
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