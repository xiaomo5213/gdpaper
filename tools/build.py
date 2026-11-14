#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建脚本（纯标准库，无需安装依赖）

1. 由 data/exam.json 生成 data/exam.js
   浏览器不允许 file:// 页面 fetch 本地 JSON，所以另外导出一份 JS 版本，
   这样双击 index.html 也能正常做题；部署到 GitHub Pages 时两者都可用。

2. 生成 dist/index.html —— 把 CSS / JS / 题库全部内联的“单文件版”，
   方便发给别人、离线保存或打印成 PDF。

用法：
    python tools/build.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def write(rel, text):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("  %-22s %7d bytes" % (rel, len(text.encode("utf-8"))))


def main():
    data = json.loads(read("data/exam.json"))
    compact = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    exam_js = (
        "/* 本文件由 tools/build.py 从 data/exam.json 生成，请勿直接修改 */\n"
        "window.EXAM_DATA = " + compact + ";\n"
    )
    print("生成数据：")
    write("data/exam.js", exam_js)

    # ---------- 单文件版 ----------
    html = read("index.html")
    css = read("assets/style.css")
    app = read("assets/app.js")

    html = html.replace(
        '<link rel="stylesheet" href="assets/style.css" />',
        "<style>\n" + css.strip() + "\n</style>",
    )
    html = html.replace(
        '<script src="data/exam.js"></script>\n<script src="assets/app.js"></script>',
        "<script>\n" + exam_js.strip() + "\n</script>\n<script>\n" + app.strip() + "\n</script>",
    )
    if "assets/style.css" in html or "assets/app.js" in html:
        raise SystemExit("内联失败：index.html 里的资源引用可能已被改动")

    print("生成单文件版：")
    write("dist/index.html", html)
    print("完成。")


if __name__ == "__main__":
    main()
