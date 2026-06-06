# md2html

[English](README.md) · [简体中文](README.zh-CN.md)

> 把任意 Markdown 文件转换成单一、自包含、赏心悦目的 HTML 页面。

`md2html` 是一个轻量 CLI 工具，能将 Markdown 渲染成**一个** HTML 文件 — CSS（以及可选的字体）全部内联 — 方便随处打开、通过邮件发送，或部署到静态托管服务，完全无需任何外部依赖。它采用**主题驱动**的架构：同一份 Markdown 可以呈现出截然不同的视觉风格。内置参考主题 **Claude** — 一种温暖的衬线散文风格，专为长文阅读舒适度而生。

<sub>Node ≥ 18.3 · TypeScript · 零运行时配置 · MIT 许可</sub>

---

## 快速开始

```bash
git clone https://github.com/WeiqiangYu0528/md2html.git
cd md2html
npm install
npm run build
```

然后转换一个文件：

```bash
node dist/cli.js notes.md          # → notes.html，与源文件同目录
```

想把 `md2html` 作为全局命令使用？只需链接一次：

```bash
npm link            # 之后在任意位置都可执行 `md2html notes.md`
```

## 用法

```bash
md2html <file.md> [options]
```

| 选项 | 说明 |
|---|---|
| `-o, --output <path>` | 输出文件路径（默认：`<input>.html`，与源文件同目录） |
| `--theme <name>` | 指定渲染主题（默认：`claude`） |
| `--embed-fonts` | 将主题字体内联到 HTML 中（否则使用系统字体） |
| `--list-themes` | 列出所有可用主题后退出 |
| `-h, --help` | 显示帮助信息 |

```bash
md2html notes.md                 # → notes.html
md2html notes.md -o public/n.html # 指定输出路径
md2html notes.md --embed-fonts    # 完全可移植，包含字体
md2html --list-themes             # 查看已安装的主题
```

输出结果是一个将所有资源内联的单文件 — 没有 `<link>` 标签，没有资源目录，移动文件也不会破坏任何依赖。

## 支持的语法

CommonMark + GitHub-Flavored Markdown，以及文档写作中最常用的扩展语法：

- **表格**、**任务列表**、**删除线**和**自动链接**（GFM）
- **围栏代码块**，带语法高亮（[Shiki](https://shiki.style)）
- **标注块** — `> [!NOTE]`、`[!TIP]`、`[!IMPORTANT]`、`[!WARNING]`、`[!CAUTION]`
- **脚注**、**YAML 前言**（`title` 字段将成为页面标题）以及自动生成的**标题锚点**

## 主题

主题拥有*全部*视觉呈现的控制权 — 颜色、字体、间距、代码高亮配色，甚至标注块图标等细节。转换层保持主题无关性：它输出语义化 HTML 并附带稳定的类名钩子，从不内嵌任何视觉决策。

内置的 **Claude** 主题（"温暖衬线散文"风格）树立了质量标杆：象牙白底色、陶土色点缀、衬线字体排版、羊皮纸色调代码块、大地色系标注块，以及定制复选框 — 每个元素都经过精心调校，与页面浑然一体。

添加主题只需在 `themes/<name>/` 下创建一个文件夹（包含 `theme.json` 清单和 `theme.css`，可选自定义代码配色和字体），无需修改任何转换层代码。主题可以样式化的完整钩子集已记录在
[`THEME-CONTRACT.md`](THEME-CONTRACT.md) 中。

## 架构

两个严格分离的层次：

1. **解析层** — Markdown → 带稳定类名钩子的语义化 HTML。与主题完全无关；不输出任何颜色、字体或间距信息。
2. **组装层** — 将解析结果包裹进文档外壳，并内联所选主题的 CSS（及字体）。

整个产品的核心理念是*"同一份 Markdown，可随意更换外观"*，因此这条边界是不可逾越的：将任何视觉逻辑放入解析层均视为架构缺陷。完整的设计理念参见
[`docs/superpowers/specs/`](docs/superpowers/specs/)。

## 开发

```bash
npm test          # 运行 Vitest 测试套件
npm run typecheck # tsc --noEmit
npm run build     # 打包到 dist/cli.js
```

运行单个测试文件：`npx vitest run test/<name>.test.ts`。

## 许可证

[MIT](LICENSE) © Weiqiang Yu
