"""More example sentences for words Tatoeba's word index gives too few, from other open, human-written sources.

Tatoeba's index (jpn_indices) only covers part of Tatoeba. This also reads the rest of Tatoeba's Japanese
sentences that have an English translation, then Wiktionary's usage examples (via kaikki.org), and finds the
words in them with Sudachi, the same way the stories are linked (build_stories.Linker). Nothing here is
machine-written. Without Sudachi installed (it comes with the stories step of the Build data workflow) this
does nothing.
"""

import bz2
import json
import re
from collections import defaultdict

from build_data import SOURCES, is_kanji

KAIKKI = SOURCES / "kaikki-japanese.jsonl"


def stem(form):
    """The part of a word that doesn't change when it's conjugated: up to its last kanji (食べる → 食)."""
    last = max((i for i, c in enumerate(form) if is_kanji(c)), default=-1)
    return form[:last + 1] if last >= 0 else form


def tatoeba_pool(have):
    """Tatoeba sentences with an English translation that aren't already in the data: [(id, ja, en)]."""
    folder = SOURCES / "tatoeba"
    links = folder / "jpn-eng_links.tsv.bz2"
    if not links.exists():
        return []
    eng_of = {}
    with bz2.open(links, "rt", encoding="utf-8") as f:
        for line in f:
            a, b = line.rstrip("\n").split("\t")[:2]
            if a not in have:
                eng_of.setdefault(a, b)
    text = {}
    wanted = set(eng_of.values())
    for name, keep in (("jpn_sentences.tsv.bz2", eng_of), ("eng_sentences.tsv.bz2", wanted)):
        with bz2.open(folder / name, "rt", encoding="utf-8") as f:
            for line in f:
                sid, _, t = line.rstrip("\n").split("\t", 2)
                if sid in keep:
                    text[sid] = t
    return [(sid, text[sid], text[eid]) for sid, eid in eng_of.items() if sid in text and eid in text]


def wiktionary_pool():
    """Usage examples from English Wiktionary's Japanese entries, with their translation: [(id, ja, en)]."""
    if not KAIKKI.exists():
        return []
    out, seen = [], set()
    with open(KAIKKI, encoding="utf-8") as f:
        for line in f:
            if '"examples"' not in line:
                continue
            entry = json.loads(line)
            for sense in entry.get("senses", []):
                for ex in sense.get("examples", []):
                    ja, en = (ex.get("text") or "").strip(), (ex.get("english") or ex.get("translation") or "").strip()
                    # Short everyday examples only: no quotations from old books, no fragments.
                    if ex.get("type") == "quotation" or not ja or not en or not 4 <= len(ja) <= 60 or ja in seen:
                        continue
                    # Real phrases only: some hiragana (so not a bare compound like 栄養失調), no Latin letters.
                    if re.search(r"[A-Za-z]", ja) or not re.search(r"[\u3041-\u309f]", ja):
                        continue
                    seen.add(ja)
                    out.append((f"wk{len(out) + 1}", ja, en))
    return out


def add_sentences(words, sentences, con, level, wanted):
    """Gives each word up to `wanted(wid)` sentences. `level(wid)` is when it's taught (None: never)."""
    try:
        from build_stories import Linker
        linker = Linker(con)
    except ImportError:
        print("More sentences: skipped (needs sudachipy, see the Build data workflow)")
        return 0
    short = {wid for wid, w in words.items() if len(w["sentences"]) < wanted(wid)}
    by_stem = defaultdict(set)
    for wid in short:
        by_stem[stem(words[wid]["w"])].add(wid)
    longest = max(map(len, by_stem), default=0)

    def candidates(ja):
        """Short words whose stem appears in the text (every substring looked up, which is quick)."""
        return {wid for i in range(len(ja)) for n in range(1, longest + 1) for wid in by_stem.get(ja[i:i + n], ())}

    found = defaultdict(list)  # word id -> [(harder words, source, length, id)]
    pool = {}
    for source, items in enumerate((tatoeba_pool(set(sentences)), wiktionary_pool())):
        for sid, ja, en in items:
            hits = candidates(ja)
            if not hits:
                continue
            links = sorted(l for l in linker.paragraph(ja)[0] if l[2] in words)
            ids = {l[2] for l in links}
            for wid in hits & ids:
                own = level(wid)
                harder = 0 if own is None else sum(1 for o in ids - {wid} if level(o) is None or level(o) > own)
                found[wid].append((min(harder, 3), source, abs(len(ja) - 15), sid))
                pool[sid] = {"ja": ja, "en": en, "links": links}
    added = 0
    for wid, cs in found.items():
        room = wanted(wid) - len(words[wid]["sentences"])
        for *_, sid in sorted(cs)[:room]:
            sentences.setdefault(sid, pool[sid])
            words[wid]["sentences"].append(sid)
            added += 1
    print(f"More sentences: {added} added for {len(found)} of {len(short)} words that had too few")
    return added
