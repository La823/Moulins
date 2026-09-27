"""Parse GST rates out of CBIC Notification 9/2025-Integrated Tax (Rate).

In force from 22 September 2025. This replaced the six-schedule structure that
cbic-gst.gov.in still publishes; the 12% slab no longer exists and a 40%
demerit slab was added.

Unlike the old HTML table, the schedules carry no rate columns -- the rate IS
the schedule, declared once in the preamble. So the rate comes from whichever
schedule heading the row falls under, which is why rows are assigned to
schedules by y-coordinate rather than by page: Schedules V, VI and VII all
begin on page 80.

Rows are read from the PDF's ruled table cells, not from flowed text. Text
extraction mis-pairs the Chapter 30 block -- "234. 3004" lands on its own line
while its description floats below -- and a mis-paired row means a wrong rate
on a medicine.
"""
import csv, re, collections
import pdfplumber
from cbic_codes import parse_code_cell

SRC = 'notif9.pdf'
SCHED_RE = re.compile(r'Schedule\s+(VII|VI|IV|V|III|II|I)\b\s*\D{0,4}\s*([0-9.]+)\s*%')
SERIAL_RE = re.compile(r'^\s*(\d+[A-Z]*)\s*\.\s*$')


def clean(s):
    return re.sub(r'\s+', ' ', (s or '').replace('\n', ' ')).strip()


def main():
    rates, excs = [], []
    stats = collections.Counter()
    schedule = rate = None
    current = None  # the entry a continuation row belongs to

    def flush():
        """Emit the accumulated entry once its description is complete."""
        if not current:
            return
        sched, serial, codecell, desc, r = current
        inc, exc, anych, junk = parse_code_cell(codecell)
        stats['entries'] += 1
        for code in inc:
            # IGST is the schedule rate; CGST and SGST are each half of it.
            rates.append([code, sched, serial, desc, r / 2, r / 2, r, None])
        for code in exc:
            excs.append([sched, serial, 'excluded_code', code, codecell, desc, r])
        if anych:
            stats['any_chapter'] += 1
            excs.append([sched, serial, 'any_chapter', None, codecell, desc, r])
        for jk in junk:
            stats['unparsed'] += 1
            excs.append([sched, serial, 'unparsed', None, jk, desc, r])
        if not inc and not exc and not anych and not junk:
            stats['no_code'] += 1
            excs.append([sched, serial, 'no_code', None, codecell, desc, r])

    with pdfplumber.open(SRC) as pdf:
        for page in pdf.pages:
            # Schedule headings on this page, with the y they start at.
            heads = []
            for m in SCHED_RE.finditer(page.extract_text() or ''):
                heads.append((m.group(1), float(m.group(2))))
            # Where each heading sits vertically, so rows can be attributed.
            head_pos = []
            if heads:
                words = page.extract_words()
                for name, r in heads:
                    y = None
                    for i, w in enumerate(words):
                        if w['text'].strip() == 'Schedule' and i + 1 < len(words):
                            nxt = words[i + 1]['text'].strip().rstrip('–—-')
                            if nxt.startswith(name) and nxt[len(name):].strip(' –—-') == '':
                                y = w['top']
                                break
                    head_pos.append((y if y is not None else 0.0, name, r))
                head_pos.sort()

            seen_heads = set()
            # Row geometry, so each row carries its own top coordinate.
            for table in page.find_tables():
                data = table.extract()
                for row_obj, cells in zip(table.rows, data):
                    top = row_obj.bbox[1]
                    # Adopt every schedule heading above this row.
                    for y, name, r in head_pos:
                        if y <= top:
                            schedule, rate = name, r
                            seen_heads.add(name)
                    cells = [clean(c) for c in cells]
                    if len(cells) < 3:
                        stats['skipped_non_entry'] += 1
                        continue
                    serial, codecell, desc = cells[0], cells[1], ' '.join(
                        x for x in cells[2:] if x)
                    m = SERIAL_RE.match(serial)
                    if m:
                        flush()
                        current = [schedule, m.group(1), codecell, desc, rate]
                    elif current and not serial:
                        # Continuation: description wrapped, or extra codes.
                        if codecell:
                            current[2] += ', ' + codecell
                        if desc:
                            current[3] = (current[3] + ' ' + desc).strip()
                    else:
                        stats['skipped_non_entry'] += 1

            # A heading can sit at the foot of a page with its rows starting on
            # the next one -- Schedule VII does exactly this on page 80. Such a
            # heading is never above any row on its own page, so adopt whatever
            # is left over here, or its whole schedule inherits the previous
            # rate (28% pan masala and tobacco read as 1.50%).
            for y, name, r in head_pos:
                if name not in seen_heads:
                    schedule, rate = name, r
        flush()

    # The same (code, description, rate) can be listed twice.
    seen, dedup = set(), []
    for r in rates:
        k = (r[0], r[3], r[6])
        if k in seen:
            continue
        seen.add(k)
        dedup.append(r)

    with open('notif_rates.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['code', 'schedule', 'serial', 'description', 'cgst', 'sgst', 'igst', 'cess'])
        w.writerows(dedup)
    with open('notif_exceptions.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['schedule', 'serial', 'kind', 'code', 'raw', 'description', 'igst'])
        w.writerows(excs)

    print(stats)
    print('rate rows      ', len(dedup))
    print('distinct codes ', len({r[0] for r in dedup}))
    print('exceptions     ', len(excs))
    print('code lengths   ', dict(collections.Counter(len(r[0]) for r in dedup)))
    print('sched -> rates ', {s: sorted({r[6] for r in dedup if r[1] == s})
                              for s in sorted({r[1] for r in dedup})})


if __name__ == '__main__':
    main()
