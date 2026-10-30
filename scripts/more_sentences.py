"""More example sentences for words Tatoeba's word index gives too few, from other open, human-written sources.

Tatoeba's index (jpn_indices) only covers part of Tatoeba. This also reads the rest of Tatoeba's Japanese
sentences that have an English translation, then Wiktionary's usage examples (via kaikki.org), and finds the
words in them with Sudachi, the same way the stories are linked (build_stories.Linker). Words still short after
that get lines from film and TV subtitles (JESC), which are real speech but more casual and less carefully
translated. Nothing here is machine-written. Without Sudachi installed (it comes with the stories step of the
Build data workflow) this does nothing.
"""

import bz2
import io
import json
import re
import tarfile
from collections import defaultdict

from build_data import SOURCES, is_kanji, kana_only

KAIKKI = SOURCES / "kaikki-japanese.jsonl"
JESC = SOURCES / "jesc" / "raw.tar.gz"
# Subtitle lines with these in them are left out: Nekko's example sentences shouldn't swear or be crude.
JESC_SKIP = re.compile(r"\b(fuck\w*|shit\w*|bitch\w*|bastards?|cunt|dick|cock|pussy|whore|slut|sex\w*|rap(e|es|ed|ing|ist)|"
                       r"nigg\w*|fag\w*|retard\w*|asshole|crap|poop|piss\w*|porn\w*|hooker|damn\w*)\b", re.I)
JESC_SKIP_JA = re.compile(r"強姦|レイプ|セックス|クソ|くそ|糞|畜生|ちくしょう|売春|淫|ファック|エロ|ヤリ|殺せ|死ね")
# Subtitles are often translated loosely, or lined up with the wrong line. English usually runs two or three
# letters per Japanese character; pairs far outside that are dropped, and so are the worst-aligned lines.
JESC_RATIO = (1.2, 3.5)
JESC_KEEP = 0.7


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


def jesc_pairs():
    """(English, Japanese, alignment score or None) lines from the corpus, from Stanford's archive or the Parquet
    copy."""
    if JESC.exists():
        with tarfile.open(JESC) as tar:
            for member in tar:
                if member.isfile():
                    for line in io.TextIOWrapper(tar.extractfile(member), encoding="utf-8", errors="replace"):
                        cols = line.rstrip("\n").split("\t")
                        if len(cols) == 2:
                            yield cols[0], cols[1], None
        return
    files = sorted(JESC.parent.glob("*.parquet"))
    if files:
        import pyarrow.parquet as pq  # only needed for the copy
        for path in files:
            table = pq.read_table(path)
            # Pairs as {"translation": {"en", "ja"}}, or in "en" and "ja" columns; "score" is how well they line up.
            rows = (table.column("translation").to_pylist() if "translation" in table.column_names
                    else table.select(["en", "ja"]).to_pylist())
            scores = table.column("score").to_pylist() if "score" in table.column_names else [None] * len(rows)
            for row, score in zip(rows, scores):
                yield row.get("en") or "", row.get("ja") or "", score


def jesc_pool():
    """Subtitle lines with their English: [(id, ja, en)]. Short, whole, clean lines that line up well."""
    out, seen = [], set()
    for en, ja, score in jesc_pairs():
        # English first; swap if a copy ever has them the other way round.
        if not re.search(r"[\u3041-\u30ff]", ja):
            en, ja = ja, en
        # The corpus may put spaces between words (and subtitles use them for pauses): drop them.
        ja = re.sub(r"[ \u3000]+", "", ja)
        en = en.strip()
        if not 6 <= len(ja) <= 30 or not 2 <= len(en.split()) <= 20 or ja in seen:
            continue
        if not JESC_RATIO[0] <= len(en) / len(ja) <= JESC_RATIO[1]:
            continue
        # Whole lines only: a subtitle cut off mid-sentence ("…ようになると") has no end mark.
        if not re.search(r"[。！？!?]$", ja) or not re.search(r"[.!?]['\"]?$", en):
            continue
        # Plain sentences: hiragana, no Latin letters, no sound or speaker notes, nothing crude.
        if re.search(r"[A-Za-zＡ-Ｚａ-ｚ（）()♪≪≫《》【】→➡＜＞<>]|。、|、。", ja) or not re.search(r"[\u3041-\u309f]", ja):
            continue
        if not re.match(r"[\"'A-Za-z0-9]", en) or JESC_SKIP.search(en) or JESC_SKIP_JA.search(ja):
            continue
        seen.add(ja)
        # The copy has the English in lower case.
        en = re.sub(r"\bi\b", "I", en[0].upper() + en[1:])
        out.append((score, ja, en))
    scored = sorted(s for s, _, _ in out if s is not None)
    if scored:
        cut = scored[int(len(scored) * (1 - JESC_KEEP))]
        print(f"Subtitle lines: alignment scores {scored[0]:.3g} to {scored[-1]:.3g}, keeping {cut:.3g} and up")
        out = [o for o in out if o[0] is None or o[0] >= cut]
    return [(f"js{i + 1}", ja, en) for i, (_, ja, en) in enumerate(out)]


def add_sentences(words, sentences, con, level, wanted):
    """Gives each word up to `wanted(wid)` sentences. `level(wid)` is when it's taught (None: never)."""
    try:
        from build_stories import Linker
        linker = Linker(con)
    except ImportError:
        print("More sentences: skipped (needs sudachipy, see the Build data workflow)")
        return 0
    added = 0
    # Tatoeba and Wiktionary first, ranked together; subtitles only for the words they leave short.
    for name, pools, keep in (
            ("Tatoeba and Wiktionary", lambda: (tatoeba_pool(set(sentences)), wiktionary_pool()), None),
            # 2.8 million lines: stop reading for a word once it has 50 to choose from.
            ("subtitles", lambda: (jesc_pool(),), 50)):
        # Subtitle translations are often loose or belong to another line, so a subtitle counts for a word only
        # when its English has one of the word's meanings in it.
        added += fill(words, sentences, linker, level, wanted, name, pools(), keep, check=name == "subtitles")
    return added


STOP = {"the", "and", "for", "with", "that", "this", "one", "something", "someone", "thing", "things", "etc", "esp",
        "make", "get", "have", "become", "out", "from", "into", "about", "very", "not", "who", "what", "when"}


def gloss_stems(text):
    """Rough stems of the English words in a text (first five letters), for matching a meaning to a translation."""
    return {t[:5] for t in re.findall(r"[a-z]{3,}", text.lower()) if t not in STOP}


def fill(words, sentences, linker, level, wanted, name, pools, keep, check=False):
    short = {wid for wid, w in words.items() if len(w["sentences"]) < wanted(wid)}
    by_stem = defaultdict(set)
    for wid in short:
        by_stem[stem(words[wid]["w"])].add(wid)
    lengths = sorted({len(s) for s in by_stem})
    starts = {s[0] for s in by_stem}

    def candidates(ja):
        """Short words whose stem appears in the text (every substring looked up, which is quick)."""
        return {wid for i in range(len(ja)) if ja[i] in starts
                for n in lengths for wid in by_stem.get(ja[i:i + n], ())}

    meaning_cache = {}

    def meanings(wid):
        if wid not in meaning_cache:
            meaning_cache[wid] = gloss_stems(" ".join(g for s in words[wid]["senses"] for g in s["gloss"]))
        return meaning_cache[wid]

    found = defaultdict(list)  # word id -> [(harder words, source, length, id)]
    pool = {}
    for source, items in enumerate(pools):
        for sid, ja, en in items:
            if starts.isdisjoint(ja):
                continue
            # Words that already have plenty to choose from don't need Sudachi to read more.
            hits = {wid for wid in candidates(ja) if keep is None or len(found.get(wid, ())) < keep}
            if not hits:
                continue
            links = sorted(l for l in linker.paragraph(ja)[0] if l[2] in words)
            ids = {l[2] for l in links}
            en_stems = gloss_stems(en) if check else None
            for wid in hits & ids:
                if check and en_stems.isdisjoint(meanings(wid)):
                    continue
                own = level(wid)
                harder = 0 if own is None else sum(1 for o in ids - {wid} if not kana_only(words[o]["w"])
                                                   and (level(o) is None or level(o) > own))
                found[wid].append((min(harder, 3), source, abs(len(ja) - 15), sid))
                pool[sid] = {"ja": ja, "en": en, "links": links}
    added = 0
    for wid, cs in found.items():
        room = wanted(wid) - len(words[wid]["sentences"])
        for *_, sid in sorted(cs)[:room]:
            sentences.setdefault(sid, pool[sid])
            words[wid]["sentences"].append(sid)
            added += 1
    print(f"More sentences from {name}: {added} added for {len(found)} "
          f"of {len(short)} words that had too few")
    return added
