"""Stories to read: Aozora Bunko tales (public domain) and the Tadoku free readers (NPO多言語多読,
CC BY-NC-ND 4.0), split into words and linked to JMdict.

Run from the repo root after scripts/fetch_sources.py (it needs sources/jamdict.db):
    pip install sudachipy sudachidict_core pdfplumber
    python scripts/build_stories.py

Writes data/stories.json (the list, with each story's word counts) and data/stories/<id>.json (the text).
Each story's text is kept exactly as published: word links and readings sit next to it, never in it.
Run it before build_data.py, which adds every story word to words.json.
"""

import csv
import io
import json
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

from build_data import OUT, SOURCES, hira, is_kanji, priority_rank

CACHE = SOURCES / "stories"
AOZORA_INDEX = "https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip"
TADOKU_START = ["https://tadoku.org/japanese/free-books/", "https://tadoku.org/japanese/en/free-books-en/"]
TADOKU_MAX_PAGES = 200
CREDIT_MARKS = ("多言語多読", "Tadoku", "tadoku", "クリエイティブ", "Creative", "CC BY", "http", "©")

# Short modern-spelling (新字新仮名) tales, easiest first. Missing titles are reported, not fatal.
AOZORA_WORKS = [
    ("楠山正雄", "桃太郎"), ("楠山正雄", "浦島太郎"), ("楠山正雄", "一寸法師"), ("楠山正雄", "金太郎"),
    ("楠山正雄", "花咲かじじい"), ("楠山正雄", "舌切りすずめ"), ("楠山正雄", "かちかち山"),
    ("楠山正雄", "猿かに合戦"), ("楠山正雄", "瘤とり"), ("楠山正雄", "文福茶がま"),
    ("新美南吉", "でんでんむしのかなしみ"), ("新美南吉", "手袋を買いに"), ("新美南吉", "ごん狐"),
    ("新美南吉", "赤い蝋燭"), ("新美南吉", "飴だま"), ("新美南吉", "去年の木"),
    ("小川未明", "野ばら"), ("小川未明", "金の輪"), ("小川未明", "赤い蝋燭と人魚"),
    ("芥川竜之介", "蜘蛛の糸"), ("芥川竜之介", "杜子春"),
    ("宮沢賢治", "注文の多い料理店"), ("宮沢賢治", "どんぐりと山猫"), ("宮沢賢治", "雪渡り"),
]

# Not counted as words: grammar, punctuation, numbers and names.
SKIP_POS = {"助詞", "助動詞", "補助記号", "記号", "空白"}
SKIP_SUB = {("名詞", "固有名詞"), ("名詞", "数詞")}
FREE_RANK = 25  # kana-only words at least this common count as known (ある, いる, これ…)


def log(*args):
    print(*args, flush=True)


def get(url, dest=None):
    """Downloads url (into dest when given, kept as a cache). Returns the bytes."""
    if dest and dest.exists():
        return dest.read_bytes()
    req = urllib.request.Request(url, headers={"User-Agent": "Nekko story builder (github.com/Spullk/KanjiApp)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        body = r.read()
    if dest:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(body)
    return body


# ---------------------------------------------------------------- Aozora Bunko

RUBY = re.compile(r"｜([^《｜]+)《([^》]+)》|([一-鿿㐀-䶿々〆ヶ]+)《([^》]+)》")
NOTE = re.compile(r"※?［＃[^］]*］")


def aozora_line(line):
    """One line of Aozora text → (plain text, [[start, length, reading]]) from its 《ruby》."""
    line = NOTE.sub("", line).strip("　 ")
    text, ruby, pos = [], [], 0
    for m in RUBY.finditer(line):
        text.append(line[pos:m.start()])
        base, reading = (m[1], m[2]) if m[1] else (m[3], m[4])
        start = sum(map(len, text))
        ruby.append([start, len(base), reading])
        text.append(base)
        pos = m.end()
    text.append(line[pos:])
    return "".join(text), ruby


def aozora_body(raw):
    lines = raw.decode("cp932", errors="replace").splitlines()
    seps = [i for i, l in enumerate(lines) if l.startswith("-----")]
    start = seps[1] + 1 if len(seps) >= 2 else lines.index("") + 1
    end = next((i for i in range(start, len(lines)) if lines[i].startswith("底本：")), len(lines))
    paras = [aozora_line(l) for l in lines[start:end]]
    return [p for p in paras if p[0]]


def aozora_stories():
    index = zipfile.ZipFile(io.BytesIO(get(AOZORA_INDEX, CACHE / "aozora-index.zip")))
    rows = csv.DictReader(io.TextIOWrapper(index.open(index.namelist()[0]), encoding="utf-8-sig"))
    by_work = {}
    titles = defaultdict(set)
    wanted = {a for a, _ in AOZORA_WORKS}
    for r in rows:
        author = r["姓"] + r["名"]
        if author not in wanted or r["役割フラグ"] != "著者" or not r["文字遣い種別"].startswith("新字新仮名"):
            continue
        titles[author].add(r["作品名"])
        if r["テキストファイルURL"].endswith(".zip"):
            by_work.setdefault((author, r["作品名"]), r)
    for author, title in AOZORA_WORKS:
        r = by_work.get((author, title))
        if not r:
            log(f"Aozora: not found {author} {title}. Titles by {author}: {' / '.join(sorted(titles[author]))}")
            continue
        try:
            z = zipfile.ZipFile(io.BytesIO(get(r["テキストファイルURL"], CACHE / f"aozora-{r['作品ID']}.zip")))
            raw = z.read(next(n for n in z.namelist() if n.endswith(".txt")))
        except Exception as e:  # one broken download shouldn't stop the rest
            log(f"Aozora: {title}: {e}")
            continue
        yield {"id": "a" + r["作品ID"].lstrip("0"), "title": title, "author": author, "source": "aozora",
               "url": r["図書カードURL"]}, aozora_body(raw)


# ---------------------------------------------------------------- Tadoku

HREF = re.compile(r'href="([^"#]+)"')
TITLE = re.compile(r"<h1[^>]*>(.*?)</h1>|<title>(.*?)</title>", re.S)
LEVEL = re.compile(r"(?:レベル|Level|LEVEL)\s*([0-5])")
TAG = re.compile(r"<[^>]+>")


def tadoku_books():
    """Crawls the free-books pages for PDF links. Returns [(pdf url, title, level)]."""
    seen, queue, books = set(), list(TADOKU_START), {}
    while queue and len(seen) < TADOKU_MAX_PAGES:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        try:
            page = get(url).decode("utf-8", errors="replace")
        except Exception as e:
            log(f"Tadoku: {url}: {e}")
            continue
        m = TITLE.search(page)
        title = TAG.sub("", (m[1] or m[2]) if m else "").split("|")[0].split("–")[0].strip()
        level = LEVEL.search(TAG.sub(" ", page))
        for link in HREF.findall(page):
            link = urllib.parse.urljoin(url, link)
            if link.lower().endswith(".pdf"):
                books.setdefault(link, (title, int(level[1]) if level else None))
            elif "tadoku.org/japanese/" in link and ("free-book" in link or "/book/" in link):
                queue.append(link)
        time.sleep(0.3)
    log(f"Tadoku: crawled {len(seen)} pages, found {len(books)} PDFs")
    return [(u, t, l) for u, (t, l) in books.items()]


def pdf_paragraphs(path):
    """Each page's main text (furigana dropped by its smaller size) as one paragraph."""
    import pdfplumber

    paras = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            chars = [c for c in page.chars if c["text"].strip()]
            if not chars:
                continue
            sizes = sorted(c["size"] for c in chars)
            body = sizes[len(sizes) // 2]
            chars = [c for c in chars if c["size"] > body * 0.75]
            lines = defaultdict(list)
            for c in chars:
                lines[round(c["top"] / (body * 0.8))].append(c)
            text = "".join("".join(c["text"] for c in sorted(cs, key=lambda c: c["x0"]))
                           for _, cs in sorted(lines.items()))
            text = text.replace(" ", "").replace("　", "")
            if not re.search(r"[ぁ-ん]", text) or any(m in text for m in CREDIT_MARKS):
                continue
            paras.append((text, []))
    return paras


def tadoku_stories():
    for url, title, level in tadoku_books():
        name = Path(urllib.parse.urlparse(url).path).stem
        path = CACHE / "tadoku" / f"{name}.pdf"
        try:
            get(url, path)
            paras = pdf_paragraphs(path)
        except Exception as e:
            log(f"Tadoku: {url}: {e}")
            continue
        if paras:
            yield {"id": "t" + re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-").lower(), "title": title or name,
                   "author": "NPO多言語多読", "source": "tadoku", "level": level, "url": url}, paras[1:] or paras


# ---------------------------------------------------------------- words

class Linker:
    """Finds the JMdict entry for each word Sudachi splits out."""

    def __init__(self, con):
        from sudachipy import Dictionary

        # Mid-size units; longer dictionary words are rebuilt from them below. (The longest mode joins
        # idioms across particles: 犬と猿.)
        self.tok = Dictionary(dict="core").tokenizer("B")
        self.by_text = defaultdict(set)
        self.readings = defaultdict(set)
        rank = {}
        tags = defaultdict(set)
        for table, pri in (("Kanji", "KJP"), ("Kana", "KNP")):
            for fid, idseq, text in con.execute(f"SELECT ID, idseq, text FROM {table}"):
                self.by_text[text].add(idseq)
                if table == "Kana":
                    self.readings[idseq].add(text)
            for fid, t in con.execute(f"SELECT f.idseq, p.text FROM {pri} p JOIN {table} f ON f.ID = p.kid"):
                tags[fid].add(t)
        for idseq, t in tags.items():
            rank[idseq] = priority_rank(t)
        self.rank = rank

    @lru_cache(maxsize=None)
    def lemma_reading(self, lemma):
        return hira("".join(t.reading_form() for t in self.tok.tokenize(lemma)))

    def best(self, ids, reading):
        """The entry read like the word: exactly, else sharing the longest start, then the most common."""
        def fit(i):
            common = max((len(r) + 1 if r == reading else
                          next((n for n, (a, b) in enumerate(zip(r, reading)) if a != b), min(len(r), len(reading)))
                          for r in self.readings[i]), default=0)
            return (-common, self.rank.get(i) or 99, i)

        return min(ids, key=fit)

    def paragraph(self, text):
        """→ links [[start, length, id]], readings [[start, length, kana]], counted [(id, free)]."""
        ms = list(self.tok.tokenize(text))
        links, readings, counted = [], [], []
        i = 0
        while i < len(ms):
            m = ms[i]
            pos = m.part_of_speech()
            if pos[0] in SKIP_POS:
                i += 1
                continue
            hit = None
            # Longest run of up to 4 tokens that is one dictionary word (お + じい + さん → おじいさん).
            for j in range(min(len(ms), i + 4), i + 1, -1):
                run = ms[i:j]
                if any(t.part_of_speech()[0] in SKIP_POS for t in run):
                    continue
                ids = self.by_text.get("".join(t.surface() for t in run[:-1]) + run[-1].dictionary_form())
                if ids:
                    hit = j, ids, hira("".join(t.reading_form() for t in run[:-1])) + self.lemma_reading(run[-1].dictionary_form())
                    break
            if not hit and pos[0] != "接頭辞" and (pos[0], pos[1]) not in SKIP_SUB:
                # The word as written, or for kana Sudachi's usual spelling (きつね → 狐), finds the right entry first.
                forms = (m.dictionary_form(), m.normalized_form())
                if not any(map(is_kanji, forms[0])):
                    forms = forms[::-1]
                ids = next((self.by_text[f] for f in forms if f in self.by_text), None)
                if ids:
                    hit = i + 1, ids, self.lemma_reading(m.dictionary_form())
            end = hit[0] if hit else i + 1
            start, stop = m.begin(), ms[end - 1].end()
            surface = text[start:stop]
            reading = hira("".join(t.reading_form() for t in ms[i:end]))
            if hit:
                wid = self.best(hit[1], hit[2])
                links.append([start, stop - start, str(wid)])
                kana_only = not any(is_kanji(c) for c in surface)
                counted.append((str(wid), kana_only and (self.rank.get(wid) or 99) <= FREE_RANK))
            if any(is_kanji(c) for c in surface):
                readings.append(trim_reading(start, surface, reading))
            i = end
        return links, readings, counted


def trim_reading(start, surface, reading):
    """Drops the kana the word shares with its reading at either end (買い/かい → 買/か)."""
    a, b = 0, 0
    while a < len(surface) - 1 and a < len(reading) and hira(surface[a]) == reading[a] and not is_kanji(surface[a]):
        a += 1
    while b < len(surface) - a - 1 and b < len(reading) - a and hira(surface[-1 - b]) == reading[-1 - b] \
            and not is_kanji(surface[-1 - b]):
        b += 1
    return [start + a, len(surface) - a - b, reading[a:len(reading) - b]]


def overlaps(span, spans):
    return any(s < span[0] + span[1] and span[0] < s + n for s, n, _ in spans)


def main():
    linker = Linker(sqlite3.connect(SOURCES / "jamdict.db"))
    (OUT / "stories").mkdir(parents=True, exist_ok=True)
    index = []
    sources = [aozora_stories()]
    if "--no-tadoku" not in sys.argv:
        sources.append(tadoku_stories())
    for gen in sources:
        for meta, paras in gen:
            out, words, free, chars = [], Counter(), 0, 0
            for text, ruby in paras:
                links, readings, counted = linker.paragraph(text)
                # The author's own ruby wins over Sudachi's guess.
                furi = sorted(ruby + [r for r in readings if r[2] and not overlaps(r, ruby)])
                out.append([text, links, furi])
                chars += len(text)
                for wid, is_free in counted:
                    if is_free:
                        free += 1
                    else:
                        words[wid] += 1
            if not words:
                continue
            (OUT / "stories" / f"{meta['id']}.json").write_text(
                json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            index.append({**meta, "chars": chars, "free": free, "w": words.most_common()})
            log(f"{meta['source']}: {meta['title']} — {chars} chars, {sum(words.values()) + free} words, "
                f"{len(words)} distinct; starts: {paras[0][0][:40]}")
    index.sort(key=lambda s: (s["source"] != "tadoku", s.get("level") or 0, s["chars"]))
    keep = {s["id"] for s in index}
    for f in (OUT / "stories").glob("*.json"):
        if f.stem not in keep:
            f.unlink()
    (OUT / "stories.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"Stories: {len(index)}")


if __name__ == "__main__":
    main()
