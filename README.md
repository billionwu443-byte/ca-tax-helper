# California 加州报税助手

2025 税年联邦 Form 1040 + 加州 Form 540 / 540NR 报税估算工具，中文界面。

**在线使用：** https://billionwu443-byte.github.io/ca-tax-helper/
**Windows 桌面版：** [Releases](https://github.com/billionwu443-byte/ca-tax-helper/releases/latest)

## 功能

- 联邦 1040：2025 税率、OBBBA 新规（标准扣除 $15,750、SALT 上限 $40,000、子女抵免 $2,200、小费/加班费/老年人/车贷扣除）、合格股息与长期资本利得、自雇税、NIIT、EITC、QBI
- 加州 540：Schedule CA 收入调整、加州分项扣除、免税额抵免、租房抵免、行为健康服务税
- 加州 540NR：部分年份居民和非居民按比例计税
- CalEITC（FTB 3514 官方 2025 查表）与 Young Child Tax Credit
- Schedule S 其他州税收抵免
- Schedule P 加州 AMT（含 ISO）
- 2026 年联邦与加州预缴税计划

所有计算都在浏览器本地完成，不上传任何数据。

## 免责声明

本工具只用于估算和核对，不是税务建议，也不能代替正式报税软件或 CPA。参数来源见页面底部。

## 开发

- `index.html` + `engine.js`：页面和计算引擎（`engine.js` 为纯函数，可在 Node 中直接测试）
- `npm run build:web`：生成 `docs/`（GitHub Pages）
- `npm start`：本地运行桌面版
- `npm run dist:win`：打包 Windows 安装程序（`dist/`）
