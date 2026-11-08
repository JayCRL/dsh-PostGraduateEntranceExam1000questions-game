"""questions.json + answers_pages → bank.json

用法:
    python make_bank.py --questions questions.json --answers answers_pages --out bank.json

说明:
- questions.json 由 make_questions.py 生成；answers_pages 由 ocr_answers.py 生成。
- 下面的 RANGES/BOUNDARY 是「肖 1000 2027 版」答案册的页码 → 科目/题型映射。
  换书时按自己答案册的结构改这两块即可（页码是 PDF 页序号，从 0 开始）。
"""
import argparse
import glob
import json
import os
import re
from collections import defaultdict

ANS_RE = re.compile(r'^(\d{1,3})\s*[.．。，,、]?\s*答\s*案\s*[：:]?\s*([A-DＡ-Ｄ][A-DＡ-Ｄ、，,\s]{0,6})')
LETTERS = 'ABCDEFGH'

# 答案册页码区间：subject, type, [start, end)
RANGES = [
    ('马原', 'single', 5, 38), ('马原', 'multi', 38, 78),
    ('毛中特', 'single', 78, 89), ('毛中特', 'multi', 89, 97),
    ('习思想', 'single', 96, 108), ('习思想', 'multi', 108, 123),
    ('史纲', 'single', 124, 146), ('史纲', 'multi', 146, 166),
    ('思法', 'single', 168, 176), ('思法', 'multi', 176, 190),
]
# 同一页跨两个题型时的分界（页号 → 前后题型 + 分界题号）
BOUNDARY = {
    38: ('马原', 'single', '马原', 'multi'),
    88: ('毛中特', 'single', '毛中特', 'multi'),
    108: ('习思想', 'single', '习思想', 'multi'),
    146: ('史纲', 'single', '史纲', 'multi'),
}

NOISE = [
    re.compile(r'考研政治\s*1000\s*题'), re.compile(r'^更多考研'), re.compile(r'^第?\s*\d{1,3}\s*$'),
    re.compile(r'^[·\-—\s]+$'), re.compile(r'公众号'), re.compile(r'^[（(]?\d+[)）]?$'),
    re.compile(r'^马原|^毛中特|^史纲|^思法|^习思想'), re.compile(r'^第[一二三四五]部分'),
    re.compile(r'选择题|分析题|单项选择题|多项选择题'),
    re.compile(r'^出处|^精讲|^考点\s*\d'),
]
HEADER = re.compile(r'(马原|毛中特|习思想|史纲|思法)\s*[·，,]?\s*(单选|多选|分析)')
BOOKREF = re.compile(r'[^。；]*《[^》]*精讲精练》[^。；]*')


def section_of(page, num):
    if page in BOUNDARY:
        s1, t1, s2, t2 = BOUNDARY[page]
        return (s1, t1) if num >= 50 else (s2, t2)
    for subject, type_, lo, hi in RANGES:
        if lo <= page < hi:
            return (subject, type_)
    return None


def clean(lines):
    out = []
    for text in lines:
        text = text.strip()
        if not text or any(rule.search(text) for rule in NOISE):
            continue
        text = re.sub(r'^(简析|点拨|时政储备题|考点拓展题)[】\)）:：]?', '', text).strip()
        if text:
            out.append(text)
    text = ''.join(out)
    text = BOOKREF.sub('', text)
    text = HEADER.sub('', text)
    text = re.sub(r'微信公众号[:：]?\s*一烫', '', text)
    text = re.sub(r'[·]{2,}', '……', text)
    text = re.sub(r'\s+', '', text)
    return text.strip(' ，,。;；')


def load_pages(directory):
    files = sorted(glob.glob(os.path.join(directory, 'p*_*.json')),
                   key=lambda path: (int(re.search(r'p(\d{3})_', path).group(1)), os.path.basename(path)[-6]))
    out = {}
    for path in files:
        base = os.path.basename(path)[:-5]
        page = int(re.search(r'p(\d{3})_', base).group(1))
        items = json.load(open(path, encoding='utf-8'))['items']
        items = sorted(items, key=lambda item: (item['box'][0][1], item['box'][0][0]))
        out[base] = {'page': page, 'side': base[-1], 'texts': [item['text'].strip() for item in items]}
    return out


def parse_answers(pages):
    """按题号链式串起每页，返回 {(section, num): (answer, explanation_lines)}"""
    tokens = []
    for base, info in pages.items():
        page = info['page']
        for idx, text in enumerate(info['texts']):
            match = ANS_RE.match(text)
            if not match:
                continue
            num = int(match.group(1))
            section = section_of(page, num)
            if not section:
                continue
            answer = ''.join(ch for ch in match.group(2).upper() if ch in LETTERS)
            tokens.append({'base': base, 'idx': idx, 'num': num, 'answer': answer,
                           'section': section, 'page': page})

    by_section = defaultdict(list)
    for token in tokens:
        by_section[token['section']].append(token)

    bodies = {}
    for section, rows in by_section.items():
        per_file = defaultdict(list)
        for row in rows:
            per_file[row['base']].append(row)
        for base in per_file:
            per_file[base].sort(key=lambda row: row['idx'])

        starts = [base for base, items in per_file.items() if items[0]['num'] == 1]
        current = sorted(starts or per_file, key=lambda base: pages[base]['page'])[0]
        used = set()
        chain = []
        while current and current not in used:
            used.add(current)
            chain.extend(per_file[current])
            last = per_file[current][-1]['num']
            candidates = []
            for base, items in per_file.items():
                if base in used:
                    continue
                gap = items[0]['num'] - last
                if 1 <= gap <= 3:
                    candidates.append((gap, base))
            current = sorted(candidates)[0][1] if candidates else None

        for i, token in enumerate(chain):
            texts = pages[token['base']]['texts']
            end = len(texts)
            for later in chain[i + 1:]:
                if later['base'] == token['base']:
                    end = later['idx']
                    break
            body = texts[token['idx'] + 1:end]
            if i + 1 < len(chain):
                nxt = chain[i + 1]
                if nxt['base'] != token['base'] and nxt['num'] == token['num'] + 1:
                    body += pages[nxt['base']]['texts'][:nxt['idx']]
            bodies[(section, token['num'])] = (token['answer'], body)
    return bodies


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--questions', required=True)
    parser.add_argument('--answers', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--title', default='肖秀荣 1000 题（2027）')
    args = parser.parse_args()

    questions = json.load(open(args.questions, encoding='utf-8'))
    pages = load_pages(args.answers)
    bodies = parse_answers(pages)

    bank = []
    missing_answer = filled = 0
    for question in questions:
        if question['type'] == 'essay':
            continue
        section = (question['subject'], question['type'])
        key = (section, question['printed'])
        data = bodies.get(key)
        if not data:
            missing_answer += 1
            continue
        answer, body = data
        if not answer:
            missing_answer += 1
            continue
        if question['type'] == 'single':
            answer = answer[:1]
        options = [option['text'] for option in question['options']]
        answer = ''.join(letter for letter in answer if LETTERS.index(letter) < len(options))
        if not answer:
            continue
        explain = clean(body)
        if explain:
            filled += 1
        bank.append({
            'id': f"{question['subject']}-{question['type']}-{int(question['printed']):04d}",
            'subject': question['subject'],
            'chapter': question.get('chapter') or '',
            'type': 'multi' if question['type'] == 'multi' else 'single',
            'stem': question['stem'],
            'options': options,
            'answer': answer,
            'explain': explain,
        })

    json.dump({'version': 1, 'title': args.title, 'questions': bank},
              open(args.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'questions={len(bank)} with_explain={filled} empty_explain={len(bank)-filled} '
          f'missing_answer={missing_answer} -> {args.out}')


if __name__ == '__main__':
    main()
