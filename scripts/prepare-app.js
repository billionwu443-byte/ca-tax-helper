// 把网页版 index.html + engine.js 复制到 app/，补上完整的 HTML 文档外壳（桌面版需要标准模式渲染）。
// 网页版发布时由平台自动加外壳，所以源文件里不写 <!doctype>。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
// 默认输出到 app/（桌面版）；传参 docs 则输出到 docs/（GitHub Pages）
const out = path.join(root, process.argv[2] || 'app');
fs.mkdirSync(out, { recursive: true });

const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com">
</head>
<body>
${page}
</body>
</html>
`;
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.copyFileSync(path.join(root, 'engine.js'), path.join(out, 'engine.js'));
console.log(path.relative(root, out) + '/ 已更新');
