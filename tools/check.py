#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
题库自检：确认 data/exam.json 结构完整、答案合法、空格占位符齐全。
用法：python tools/check.py
（可在 CI 里跑，例如 GitHub Actions）
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LETTERS = "ABCD"


def main():
    path = os.path.join(ROOT, "data", "exam.json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    parts = data.get("parts") or []
    assert parts, "parts 为空"
    total_points = sum(p["points"] for p in parts)

    objective = []
    for p in parts:
        kind = p["kind"]
        if kind == "dialogue":
            blanks = set()
            for dg in p["dialogues"]:
                for line in dg["lines"]:
                    blanks.update(int(n) for n in re.findall(r"\{(\d+)\}", line["t"]))
            nos = {q["no"] for q in p["questions"]}
            assert blanks == nos, "%s 对话空格与题目编号不一致：%s vs %s" % (p["id"], blanks, nos)
            objective += p["questions"]
        elif kind == "reading":
            for pa in p["passages"]:
                assert pa["paras"], "%s 段落为空" % p["id"]
                objective += pa["questions"]
        elif kind == "single":
            for q in p["questions"]:
                assert "___" in q["stem"], "第 %d 题缺少 ______ 空格" % q["no"]
            objective += p["questions"]
        elif kind == "cloze":
            blanks = set(int(n) for n in re.findall(r"\{\{(\d+)\}\}", " ".join(p["paras"])))
            nos = {q["no"] for q in p["questions"]}
            assert blanks == nos, "%s 完形空格与题目编号不一致" % p["id"]
            objective += p["questions"]
        elif kind == "translation":
            assert p.get("reference"), "缺少参考译文"
        elif kind == "writing":
            assert p.get("outline") and p.get("sample"), "写作缺少提纲或范文"

    nos = [q["no"] for q in objective]
    assert len(nos) == len(set(nos)), "题号重复"
    assert sorted(nos) == list(range(1, len(nos) + 1)), "题号不连续：%s" % sorted(nos)
    for q in objective:
        assert q["answer"] in LETTERS, "第 %d 题答案非法" % q["no"]
        assert isinstance(q["options"], list) and len(q["options"]) == 4, "第 %d 题选项数不是 4" % q["no"]
        assert all(o.strip() for o in q["options"]), "第 %d 题有空选项" % q["no"]
        assert q.get("explain"), "第 %d 题缺少解析" % q["no"]

    print("OK  客观题 %d 道，总分 %d，题号 1-%d 连续" % (len(objective), total_points, len(objective)))
    print("    " + " ".join("%d%s" % (q["no"], q["answer"]) for q in objective))


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("FAIL:", e)
        sys.exit(1)
