# 自己生成题库（PDF → bank.json）

这套脚本是插件题库的制作流水线，对应**扫描版肖 1000（2027）**的两本 PDF：

- 试题分册（有文字层）→ 直接抽文本行 → 解析题干/选项
- 答案解析册（扫描件）→ RapidOCR 本地识别 → 解析答案、解析（含跨页续接）

OCR 用 **RapidOCR（免费、本地 CPU）**，189 页 / 8 进程大约十几分钟，不需要任何付费接口。

## 安装

```bash
pip install -r requirements.txt
```

## 三步生成

```bash
# 1) 试题册：抽文本行
python make_lines.py --pdf 27版肖1000试题分册.pdf --out q_lines.json

# 2) 解析题干、选项、科目/章节
python make_questions.py q_lines.json questions.json

# 3) 答案解析册：OCR（断点续跑，已有文件会跳过）
python ocr_answers.py --pdf 27版肖1000答案解析册.pdf --outdir answers_pages --workers 8

# 4) 合并成题库
python make_bank.py --questions questions.json --answers answers_pages --out bank.json
```

生成的 `bank.json` 直接在插件「题库与设置 → 导入题库 JSON」里导入，或放到任意可下载地址用「从链接导入」。

## 换书要改什么

`make_bank.py` 顶部的 `RANGES` / `BOUNDARY` 是**答案册 PDF 页码 → 科目/题型**的映射，换一本答案册时按页码改这两块即可。`make_questions.py` 里的科目、题型正则也是针对这套书的排版，其他书可能要微调。

## 说明

- 脚本不包含任何题目内容，只做「用户自己的 PDF → 自己的 JSON」。
- 解析文字来自 OCR，可能有识别错误；插件里用「错题本」和人工校对修。
- 版权属于原书作者，生成的文件仅供个人学习使用。
