import json, re, sys
from collections import Counter, defaultdict

Q_RE = re.compile(r'^(\d{1,3})(?:\s*[.．,，、]\s*|\s+|(?=[^\s\d]))(?=\S)')
OPT_RE = re.compile(r'^([A-D])\s*(?:[.．,，、]\s*|\s+|(?=[\u4e00-\u9fff]))(.*)$')
OPT_MARK = r'(?=[A-D](?:\s*[.．,，、]|\s|[\u4e00-\u9fff]))'
SUBJ_RE = re.compile(r'^第([一二三四五])部分\s*(.*)$')
TYPE_RE = re.compile(r'^([一二三])、\s*(单项选择题|多项选择题|材料分析题)')
CHAP_RE = re.compile(r'^(第[一二三四五六七八九十]+章|导论|绪论)')

PARTS = {'一': '马原', '二': '毛中特', '三': '习思想', '四': '史纲', '五': '思法'}
PART_FULL = {
    '马原': '马克思主义基本原理',
    '毛中特': '毛泽东思想和中国特色社会主义理论体系概论',
    '习思想': '习近平新时代中国特色社会主义思想概论',
    '史纲': '中国近现代史纲要',
    '思法': '思想道德与法治',
}
TYPE_MAP = {'单项选择题': 'single', '多项选择题': 'multi', '材料分析题': 'essay'}


def body_lines(page):
    out = []
    for l in page['lines']:
        t = l['text'].strip()
        if not t:
            continue
        if l['y0'] < 28 or l['y0'] > 805:
            continue
        if l['y0'] > 782 and re.fullmatch(r'\d{1,4}', t):
            continue
        w = l['x1'] - l['x0']
        h = l['y1'] - l['y0']
        if h > 2.5 * max(w, 1) or w < 6:
            continue
        if l['x0'] < 30:
            continue
        if re.search(r'考研政治\s*1000', t):
            continue
        if re.match(r'^第[一二三四五]部分', t) and re.search(r'[·，]', t) and re.search(r'(选择题|分析题)', t):
            continue
        out.append(l)
    return out


def split_inline_options(text):
    """拆开同一行里并排的多个选项（'A.…B.…'、'C.… D.…' 或 'A …B …'）。"""
    parts = []
    start = 0
    for m in re.finditer(OPT_MARK, text):
        if m.start() == 0:
            continue
        prev = text[m.start() - 1]
        if prev.isascii() and prev.isalpha():
            continue
        parts.append(text[start:m.start()])
        start = m.start()
    parts.append(text[start:])
    return [p.strip() for p in parts if p.strip()]


def main():
    import sys
    pages = json.load(open(sys.argv[1], encoding='utf-8'))
    questions = []
    cur = None
    subject = None
    type_ = None
    chapter = ''
    seq = 0
    printed_mismatch = []
    page_no = 0

    def new_question(printed, text):
        nonlocal cur, seq
        seq += 1
        q = {'id': f'{subject}-{type_}-{seq:04d}', 'subject': subject, 'type': type_,
             'chapter': chapter, 'printed': printed, 'stem': text, 'options': [], 'page': page_no}
        questions.append(q)
        cur = q
        if printed != seq:
            printed_mismatch.append((q['id'], printed, seq, text[:24]))
        return q

    for page in pages:
        page_no = page['page']
        lines = body_lines(page)
        if not lines:
            continue
        opt_x = [l['x0'] for l in lines if re.match(r'^[A-D][.．,，、]', l['text'].strip())]
        if opt_x:
            opt_margin = sorted(opt_x)[len(opt_x) // 2]
        else:
            opt_margin = min(l['x0'] for l in lines) + 15
        q_limit = opt_margin - 8

        for l in lines:
            text = l['text'].strip()

            m = TYPE_RE.match(text)
            if m:
                type_ = TYPE_MAP[m.group(2)]
                seq = 0
                cur = None
                continue
            m = SUBJ_RE.match(text)
            if m and l['y0'] > 55 and l['x0'] < 200:
                subject = PARTS[m.group(1)]
                chapter = ''
                continue
            if CHAP_RE.match(text) and l['x0'] <= q_limit + 6:
                chapter = text
                continue

            m = Q_RE.match(text)
            if m and subject and type_ and l['x0'] <= q_limit:
                new_question(int(m.group(1)), text[m.end():])
                continue

            if cur is None:
                continue
            om = OPT_RE.match(text)
            if om:
                for seg in split_inline_options(text):
                    sm = OPT_RE.match(seg)
                    if not sm:
                        continue
                    letter, val = sm.group(1), sm.group(2).strip()
                    target = cur
                    # 圈号题号把上一题的 D 挤到了新题开头：归还上一题
                    if (not cur['options'] and letter == 'D' and len(questions) >= 2):
                        prev = questions[-2]
                        have = {o['letter'] for o in prev['options']}
                        if prev['type'] != 'essay' and have == {'A', 'B', 'C'}:
                            target = prev
                    if any(o['letter'] == letter for o in target['options']):
                        continue
                    target['options'].append({'letter': letter, 'text': val})
                continue
            if cur['options']:
                cur['options'][-1]['text'] += text
            else:
                cur['stem'] += text

    for q in questions:
        q['options'] = sorted(q['options'], key=lambda o: o['letter'])
        q['stem'] = re.sub(r'\s+', ' ', q['stem']).strip()
        for o in q['options']:
            o['text'] = re.sub(r'\s+', ' ', o['text']).strip()

    json.dump(questions, open(sys.argv[2], 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)

    stats = defaultdict(lambda: {'total': 0, 'opt4': 0, 'bad': []})
    for q in questions:
        s = stats[(q['subject'], q['type'])]
        s['total'] += 1
        n = len(q['options'])
        if q['type'] == 'essay':
            pass
        elif n == 4:
            s['opt4'] += 1
        else:
            s['bad'].append((q['id'], n, q['stem'][:25]))
    print('total', len(questions))
    for (subj, t), s in sorted(stats.items()):
        print(f"{subj:4s} {t:6s} total={s['total']:3d} opt4={s['opt4']:3d} bad={len(s['bad'])}")
    print('mismatches', len(printed_mismatch))
    for row in printed_mismatch[:40]:
        print(row)
    sec = defaultdict(list)
    for q in questions:
        sec[(q['subject'], q['type'])].append(q['printed'])
    for k, nums in sec.items():
        c = Counter(nums)
        missing = [n for n in range(1, max(nums) + 1) if n not in c]
        dup = [n for n in c if c[n] > 1]
        print(k, 'missing', missing, 'dup', dup)


if __name__ == '__main__':
    main()
