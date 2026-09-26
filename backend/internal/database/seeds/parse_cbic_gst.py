import re, html, csv, collections

SRC = 'cbic.html'

def cells(r):
    cs = re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)
    out = []
    for c in cs:
        c = re.sub(r'<br\s*/?>', ' ', c, flags=re.I)
        c = re.sub(r'<[^>]+>', ' ', c)
        c = html.unescape(c).replace('\xa0', ' ')
        out.append(re.sub(r'\s+', ' ', c).strip())
    return out

def rate(v):
    v = v.replace('%', '').strip()
    if not v or v in ('-', '_'): return None
    if v.lower() in ('nil', 'nill'): return 0.0
    try: return float(v)
    except ValueError: return None

VALID = {2, 4, 6, 8}

def codes_from_fragment(frag):
    """One comma/or/and-separated fragment -> list of codes, list of junk."""
    frag = frag.strip(' []()')
    if not frag or not re.search(r'\d', frag): return [], []
    # A range: "5004 to 5006" -> every heading between, at the same width.
    m = re.match(r'^\s*(\d[\d ]*?)\s+to\s+(\d[\d ]*?)\s*$', frag, re.I)
    if m:
        a, b = re.sub(r'\D', '', m.group(1)), re.sub(r'\D', '', m.group(2))
        if len(a) == len(b) and len(a) in VALID and int(a) <= int(b):
            return [str(n).zfill(len(a)) for n in range(int(a), int(b) + 1)], []
        return [], [frag]
    # Otherwise the digit runs spell one code: "3004 90 99" -> 30049099.
    d = re.sub(r'\D', '', frag)
    if len(d) in VALID: return [d], []
    # "2711 12 00 2711 13 00" ran two codes together with no comma.
    if len(d) > 8 and len(d) % 8 == 0:
        return [d[i:i+8] for i in range(0, len(d), 8)], []
    return [], [frag]

EXC_BRACKET = re.compile(r'[\[\(]\s*(?:other than|except)\b(.*?)(?:[\]\)]|$)', re.I)
EXC_BARE    = re.compile(r'\b(?:other than|except)\b(.*)$', re.I)

def parse_code_cell(raw):
    """-> (included codes, excluded codes, any_chapter flag, unparsed junk)"""
    txt = raw
    excl_txt = []
    for m in EXC_BRACKET.finditer(txt): excl_txt.append(m.group(1))
    txt = EXC_BRACKET.sub(' ', txt)
    m = EXC_BARE.search(txt)
    if m:
        excl_txt.append(m.group(1))
        txt = txt[:m.start()]
    any_chapter = bool(re.search(r'any\s+(other\s+)?chapter', raw, re.I))
    txt = re.sub(r'any\s+(other\s+)?chapter', ' ', txt, flags=re.I)

    def split_all(s):
        # Brackets separate too: an unbalanced "1404 [1404 90 60" is two codes.
        return [f for f in re.split(r',|\bor\b|\band\b|[\[\]()]', s, flags=re.I) if f.strip()]

    inc, junk = [], []
    for frag in split_all(txt):
        c, j = codes_from_fragment(frag); inc += c; junk += j
    exc = []
    for e in excl_txt:
        for frag in split_all(e):
            c, j = codes_from_fragment(frag); exc += c; junk += j
    return inc, exc, any_chapter, junk

h = open(SRC, encoding='utf-8').read()
i = h.find('id="goods_table"'); j = h.find('</table>', i)
body = h[i:j]; body = body[body.find('<tbody>'):]

rates_rows, exc_rows = [], []
stats = collections.Counter()
for r in re.findall(r'<tr[^>]*>(.*?)</tr>', body, re.S):
    c = cells(r)
    if len(c) < 8: continue
    sched, sno, codecell, desc = c[0], c[1], c[2], c[3]
    cg, sg, ig, cess = rate(c[4]), rate(c[5]), rate(c[6]), c[7].strip()
    if cess in ('', '-'): cess = None
    stats['table_rows'] += 1
    if re.match(r'^\[?omitted', desc, re.I):
        stats['omitted'] += 1
        exc_rows.append([sched, sno, 'omitted', None, codecell, desc, None]); continue
    inc, exc, anych, junk = parse_code_cell(codecell)
    for code in inc:
        rates_rows.append([code, sched, sno, desc, cg, sg, ig, cess])
    for code in exc:
        exc_rows.append([sched, sno, 'excluded_code', code, codecell, desc, ig])
    if anych:
        stats['any_chapter'] += 1
        exc_rows.append([sched, sno, 'any_chapter', None, codecell, desc, ig])
    for jk in junk:
        stats['unparsed'] += 1
        exc_rows.append([sched, sno, 'unparsed', None, jk, desc, ig])
    if not inc and not anych and not junk and not exc:
        stats['no_code'] += 1
        exc_rows.append([sched, sno, 'no_code', None, codecell, desc, ig])

# De-dup: the same (code, description, igst) can be listed twice.
seen = set(); dedup = []
for r in rates_rows:
    k = (r[0], r[3], r[6])
    if k in seen: continue
    seen.add(k); dedup.append(r)

with open('gst_rates.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f); w.writerow(['code','schedule','serial','description','cgst','sgst','igst','cess']); w.writerows(dedup)
with open('gst_exceptions.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f); w.writerow(['schedule','serial','kind','code','raw','description','igst']); w.writerows(exc_rows)

print(stats)
print('rate rows       ', len(dedup), '(pre-dedup', len(rates_rows), ')')
print('distinct codes  ', len({r[0] for r in dedup}))
print('exception rows  ', len(exc_rows))
print('by code length  ', collections.Counter(len(r[0]) for r in dedup))
print('by igst         ', sorted(collections.Counter(r[6] for r in dedup).items(), key=lambda x: (x[0] is None, x[0])))
print('exception kinds ', collections.Counter(r[2] for r in exc_rows))
