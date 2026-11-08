"""扫描版答案解析册 → 逐页 OCR JSON（RapidOCR，本地免费）。

用法:
    python ocr_answers.py --pdf 答案解析册.pdf --outdir answers_pages [--zoom 2.4] [--workers 8]

输出: answers_pages/pNNN_L.json / pNNN_R.json，每页左右半页各一个文件：
      {"page": 1, "side": "L", "items": [{"text": "...", "box": [[x,y],...]}]}
已有文件会跳过，可断点续跑。
"""
import argparse
import json
import os
import time
import traceback
from concurrent.futures import ProcessPoolExecutor

import fitz
import numpy as np

_doc = None
_engine = None
_pdf = None
_out = None
_zoom = 2.4


def _init(pdf, out, zoom):
    global _doc, _engine, _pdf, _out, _zoom
    from rapidocr_onnxruntime import RapidOCR
    _pdf, _out, _zoom = pdf, out, zoom
    _doc = fitz.open(pdf)
    _engine = RapidOCR()


def _work(args):
    idx, side = args
    out_path = os.path.join(_out, f"p{idx:03d}_{side}.json")
    if os.path.exists(out_path):
        return idx, side, "cached"
    try:
        page = _doc[idx]
        pix = page.get_pixmap(matrix=fitz.Matrix(_zoom, _zoom))
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 4:
            img = img[:, :, :3]
        h, w = img.shape[:2]
        crop = np.ascontiguousarray(img[:, : w // 2] if side == "L" else img[:, w // 2 :])
        res, _ = _engine(crop)
        items = [
            {"text": text, "score": float(score),
             "box": [[round(float(x), 1), round(float(y), 1)] for x, y in box]}
            for box, text, score in (res or [])
        ]
        tmp = out_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"page": idx + 1, "side": side, "items": items}, f, ensure_ascii=False)
        os.replace(tmp, out_path)
        return idx, side, f"ok {len(items)}"
    except Exception:
        return idx, side, "ERR " + traceback.format_exc()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--zoom", type=float, default=2.4)
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    doc = fitz.open(args.pdf)
    n = doc.page_count
    doc.close()
    tasks = [(i, s) for i in range(n) for s in ("L", "R")]
    t0 = time.time()
    done = 0
    with ProcessPoolExecutor(max_workers=args.workers, initializer=_init,
                             initargs=(args.pdf, args.outdir, args.zoom)) as ex:
        for idx, side, status in ex.map(_work, tasks, chunksize=2):
            done += 1
            if done % 10 == 0 or status.startswith("ERR"):
                print(f"[{time.time()-t0:7.1f}s] {done}/{len(tasks)} p{idx+1}{side} {status}", flush=True)
    print(f"DONE {len(tasks)} tasks in {time.time()-t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
