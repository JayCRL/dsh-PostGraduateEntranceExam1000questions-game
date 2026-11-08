"""文字版试题册 PDF → 逐行 JSON（不 OCR，直接取文本层）。

用法:
    python make_lines.py --pdf 试题分册.pdf --out q_lines.json
"""
import argparse
import json

import fitz


def lines_of_page(page):
    out = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"]).strip()
            if not text:
                continue
            x0, y0, x1, y1 = line["bbox"]
            out.append({"text": text, "x0": round(x0, 1), "y0": round(y0, 1),
                        "x1": round(x1, 1), "y1": round(y1, 1)})
    out.sort(key=lambda item: (round(item["y0"] / 6), item["x0"]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    doc = fitz.open(args.pdf)
    pages = [{"page": i + 1, "lines": lines_of_page(page)} for i, page in enumerate(doc)]
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(pages, f, ensure_ascii=False)
    print(f"pages={len(pages)} -> {args.out}")


if __name__ == "__main__":
    main()
