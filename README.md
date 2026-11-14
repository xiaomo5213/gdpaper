# 广东省学位英语（样卷）在线练习

广东省成人高等教育学士学位英语水平考试 **样卷** 的网页版练习：完成对话、阅读理解、词汇语法、完形填空、英译汉、写作，**自动评分 + 逐题解析**，纯静态站点，零依赖。

试题与答案由扫描版 PDF（8 页）逐页识读整理，含官方参考答案。

## 功能

- **计时**：120 分钟倒计时，时间到自动交卷；中途刷新可继续（localStorage）
- **答题卡**：60 格实时状态，点击跳转；交卷后绿/红标出对错
- **自动评分**：客观题 70 分（Part II 每题 1.5 分），按部分显示得分条
- **逐题解析**：交卷后每题显示正确答案、你的答案、中文解析
- **三种作答方式**
  | 部分 | 交互 |
  | --- | --- |
  | Part I 完成对话 | 点对话里的空格 → 原位弹出该题 4 个选项（同一小题内字母自动去重） |
  | Part II 阅读 / Part III 词汇语法 | 直接点题目下的选项，句中下划线只作占位 |
  | Part IV 完形填空 | 点文章里的空格 → 弹出该空选项，不在下方重复列选项 |
- **主观题**：翻译可在线输入，交卷后显示参考译文 + 译点解析；写作有词数统计、写作思路与参考范文
- 深色模式、手机适配、打印/导出 PDF、“只看错题”、重新练习

## 目录结构

```
.
├── index.html              # 页面骨架（不含数据、不含样式）
├── assets/
│   ├── style.css           # 全部样式（含深色模式、打印样式）
│   └── app.js              # 全部交互逻辑（原生 JS，无框架）
├── data/
│   ├── exam.json           # 题库数据（唯一数据源，可复用/校对）
│   └── exam.js             # 由 build.py 生成：window.EXAM_DATA = {...}
├── tools/
│   └── build.py            # 生成 exam.js 与单文件版 dist/index.html
├── dist/                   # 构建产物（单文件版，可选提交）
└── README.md
```

**数据和页面是分离的**：页面只读 `window.EXAM_DATA`（来自 `data/exam.js`），改题只改 `data/exam.json`，再运行构建脚本即可。

## 本地预览

直接双击 `index.html` 就能用（会自动加载 `data/exam.js`）。

如果要用 http 方式（更接近线上环境）：

```bash
python -m http.server 8000
# 打开 http://127.0.0.1:8000
```

（`file://` 下浏览器不允许 fetch 本地 JSON，所以仓库里附带 `data/exam.js`；两者内容一致。）

## 构建

```bash
python tools/check.py   # 校验题库：题号连续、答案合法、空格占位齐全（CI 也会跑）
python tools/build.py   # 由 exam.json 生成 exam.js，并生成单文件版 dist/index.html
```

- `data/exam.json` → `data/exam.js`
- 生成单文件版 `dist/index.html`（CSS/JS/数据全部内联，可单独分发）

## 部署到 GitHub Pages

1. 新建仓库并推送本项目：

   ```bash
   git init
   git add .
   git commit -m "feat: 广东省学位英语样卷在线练习"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```

2. 仓库 **Settings → Pages**：Source 选 `Deploy from a branch`，分支 `main`、目录 `/ (root)`，保存。
3. 一两分钟后访问 `https://<你的用户名>.github.io/<仓库名>/`。

## 数据格式

`data/exam.json` 顶层：

```jsonc
{
  "meta": { "title": "...", "totalMinutes": 120, "totalPoints": 100, ... },
  "parts": [ /* 6 个部分 */ ]
}
```

每个部分用 `kind` 区分渲染方式：

| kind | 说明 | 关键字段 |
| --- | --- | --- |
| `dialogue` | 完成对话，一段对话 = 一道小题 | `dialogues[{title, lines[{s,t}]}]`，`t` 中用 `{1}` 表示第 1 空；`questions[{no, options, answer, explain}]` |
| `reading` | 阅读理解 | `passages[{title, guide, paras[], questions[]}]` |
| `single` | 词汇语法单句 | `questions[{no, stem, options, answer, explain}]`，`stem` 里用 `______` 表示空格 |
| `cloze` | 完形填空 | `paras[]` 中用 `{{51}}` 表示第 51 空 + `questions[{no, options, answer, explain}]` |
| `translation` | 英译汉 | `paras[]`、`reference`、`notes[]` |
| `writing` | 写作 | `topic`、`outline[]`、`ideas`、`sample[]` |

`answer` 取 `"A" | "B" | "C" | "D"`；`points` 为该部分总分，评分时按题数均分。

### 换成另一年的真题

1. 复制本项目，改 `data/exam.json`（`meta.title` 与各 `parts`）；
2. 运行 `python tools/build.py`；
3. 推送到新仓库即可。

## 说明

- 原卷为扫描件，个别排印问题已在题目注释中标明（第 11 题题干、第 30 题 A 项、第 39 题 A 项、完形第 55 题介词），答案以官方答案为准。
- 主观题（英译汉、写作）不自动评分，请对照参考译文与范文自评。

## License

MIT（题目文本版权归原命题机构所有，本项目仅用于学习交流）。
