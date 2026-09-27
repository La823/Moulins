"""Parsing of a CBIC schedule's code column.

Shared by the HTML-table scraper and the notification-PDF scraper, because the
column is written the same way in both: comma-separated entries, tariff items
spaced into groups ("3004 90 99"), heading ranges ("5004 to 5006"), and
exclusions in brackets ("[other than 1404 90 10, ...]").

The spacing is the trap. Splitting on whitespace turns "4011 30 00" into a
standalone "30" and files aircraft tyres under the pharmaceutical chapter, so
digit runs are joined within each fragment before the length is validated.
"""
import re

VALID = {2, 4, 6, 8}  # chapter / heading / subheading / tariff item

EXC_BRACKET = re.compile(r'[\[\(]\s*(?:other than|except)\b(.*?)(?:[\]\)]|$)', re.I)
EXC_BARE = re.compile(r'\b(?:other than|except)\b(.*)$', re.I)


def codes_from_fragment(frag):
    """One comma/or/and-separated fragment -> (codes, junk)."""
    frag = frag.strip(' []()')
    if not frag or not re.search(r'\d', frag):
        return [], []
    # A range: "5004 to 5006" -> every heading between, at the same width.
    m = re.match(r'^\s*(\d[\d ]*?)\s+to\s+(\d[\d ]*?)\s*$', frag, re.I)
    if m:
        a, b = re.sub(r'\D', '', m.group(1)), re.sub(r'\D', '', m.group(2))
        if len(a) == len(b) and len(a) in VALID and int(a) <= int(b):
            return [str(n).zfill(len(a)) for n in range(int(a), int(b) + 1)], []
        return [], [frag]
    d = re.sub(r'\D', '', frag)
    if len(d) in VALID:
        return [d], []
    # Two codes run together with no comma: "2711 12 00 2711 13 00".
    if len(d) > 8 and len(d) % 8 == 0:
        return [d[i:i + 8] for i in range(0, len(d), 8)], []
    return [], [frag]


def split_all(s):
    # Brackets separate too: an unbalanced "1404 [1404 90 60" is two codes.
    return [f for f in re.split(r',|\bor\b|\band\b|[\[\]()]', s, flags=re.I) if f.strip()]


def parse_code_cell(raw):
    """-> (included codes, excluded codes, any_chapter flag, unparsed junk)"""
    txt = raw
    excl_txt = [m.group(1) for m in EXC_BRACKET.finditer(txt)]
    txt = EXC_BRACKET.sub(' ', txt)
    m = EXC_BARE.search(txt)
    if m:
        excl_txt.append(m.group(1))
        txt = txt[:m.start()]
    any_chapter = bool(re.search(r'any\s+(other\s+)?chapter', raw, re.I))
    txt = re.sub(r'any\s+(other\s+)?chapter', ' ', txt, flags=re.I)

    inc, junk = [], []
    for frag in split_all(txt):
        c, j = codes_from_fragment(frag)
        inc += c
        junk += j
    exc = []
    for e in excl_txt:
        for frag in split_all(e):
            c, j = codes_from_fragment(frag)
            exc += c
            junk += j
    return inc, exc, any_chapter, junk
