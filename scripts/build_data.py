"""Build the app's study data from the files in sources/.

Run from the repo root after scripts/fetch_sources.py:
    python scripts/build_data.py

Writes data/*.json. Example sentences are included when sources/tatoeba/ exists.
"""

import bz2
import csv
import hashlib
import json
import re
import sqlite3
import tarfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

from component_names import RADICAL_NAMES

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "sources"
OUT = ROOT / "data"

JOYO_GRADES = ("1", "2", "3", "4", "5", "6", "8")
LESSON_SIZE = 10
MAX_RELATED = 3            # related kanji pulled into a lesson per seed kanji
WORDS_PER_KANJI = 15       # words listed on a kanji's page
WORDS_PER_READING = 3      # guaranteed words for each reading that has any
STUDY_WORDS_PER_KANJI = 3  # words added to the review queue per kanji
STUDY_MAX_RANK = 25        # only fairly common words go into reviews (see priority_rank)
MIN_WORDS_PER_KANJI = 3    # rare kanji get uncommon words up to this many, so their page isn't empty
RARE_RANK = 99             # rank of words with no frequency tag at all (marked "rare")
SENTENCES_PER_WORD = 3
SENTENCES_PER_LESSON_WORD = 5  # words Nekko teaches get more, so the app can pick ones you can already read

KVG = "{http://kanjivg.tagaini.net}"
SVG = "{http://www.w3.org/2000/svg}"


# ---------------------------------------------------------------- kana helpers

def hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def is_kanji(c):
    return "一" <= c <= "鿿" or "㐀" <= c <= "䶿" or c in "々〆"


RENDAKU = {
    "か": "が", "き": "ぎ", "く": "ぐ", "け": "げ", "こ": "ご",
    "さ": "ざ", "し": "じ", "す": "ず", "せ": "ぜ", "そ": "ぞ",
    "た": "だ", "ち": "ぢじ", "つ": "づず", "て": "で", "と": "ど",
    "は": "ばぱ", "ひ": "びぴ", "ふ": "ぶぷ", "へ": "べぺ", "ほ": "ぼぽ",
}
SMALL_KANA = "ゃゅょぁぃぅぇぉっー"
I_ROW = {"う": "い", "く": "き", "ぐ": "ぎ", "す": "し", "つ": "ち", "ぬ": "に", "ぶ": "び", "む": "み", "る": "り"}


def sound_variants(r):
    """The ways a reading can change inside a word: rendaku (か→が) and a small っ at the end."""
    out = {r: 0}
    if r[0] in RENDAKU:
        for v in RENDAKU[r[0]]:
            out.setdefault(v + r[1:], 1)
    for v in list(out):
        if len(v) > 1 and v[-1] in "つちくき":
            out.setdefault(v[:-1] + "っ", out[v] + 1)
    return out


def reading_forms(key, rtype):
    """Kana a kanji can stand for, given one KANJIDIC reading, mapped to a penalty."""
    if rtype == "on":
        return sound_variants(hira(key))
    r = key.strip("-")
    stem, _, oku = r.partition(".")
    bases = [stem]
    # Okurigana sometimes gets absorbed into the kanji (話 はなし from はな.す).
    for i in range(1, len(oku) + 1):
        bases.append(stem + oku[:i])
    if oku and oku[-1] in I_ROW:
        bases.append(stem + oku[:-1] + I_ROW[oku[-1]])
    forms = {}
    for n, b in enumerate(bases):
        for v, p in sound_variants(b).items():
            forms.setdefault(v, p + (0 if n == 0 else 0.5))
    return forms


# ---------------------------------------------------------------- loading

def load_kanjidic(con):
    grades = ",".join("?" * len(JOYO_GRADES))
    chars = {}
    for cid, lit, strokes, grade, freq in con.execute(
            "SELECT ID, literal, stroke_count, grade, freq FROM character"):
        chars[cid] = {"c": lit, "strokes": strokes, "grade": grade,
                      "freq": int(freq) if freq else None, "on": [], "kun": [], "meanings": []}
    for cid, rtype, val in con.execute(
            "SELECT g.cid, r.r_type, r.value FROM reading r JOIN rm_group g ON r.gid = g.ID "
            "WHERE r.r_type IN ('ja_on', 'ja_kun')"):
        chars[cid]["on" if rtype == "ja_on" else "kun"].append(val)
    for cid, val in con.execute(
            "SELECT g.cid, m.value FROM meaning m JOIN rm_group g ON m.gid = g.ID WHERE m.m_lang = ''"):
        chars[cid]["meanings"].append(val)
    by_lit = {c["c"]: c for c in chars.values()}
    joyo = [r[0] for r in con.execute(
        f"SELECT literal FROM character WHERE grade IN ({grades})", JOYO_GRADES)]
    return by_lit, joyo


def load_jlpt():
    data = json.loads((SOURCES / "kanji-data.json").read_text(encoding="utf-8"))
    return {k: v["jlpt_new"] for k, v in data.items() if v.get("jlpt_new")}


def element_parts(group):
    """Direct named sub-components of a KanjiVG group (unnamed wrapper groups are skipped)."""
    out = []
    for child in group:
        if child.tag != SVG + "g":
            continue
        el = child.get(KVG + "element")
        if el and not el.startswith("CDP"):
            out.append((el, child.get(KVG + "phon") is not None, child.get(KVG + "original"), child))
        else:
            out += element_parts(child)
    return out


def load_kanjivg(joyo):
    """parts[k] = [(element, is_phonetic, original_form)], plus each element's own parts."""
    parts = {}
    for k in joyo:
        tree = ET.parse(SOURCES / "kanjivg" / ("%05x.svg" % ord(k)))
        root = next(g for g in tree.iter(SVG + "g") if g.get("id") == "kvg:%05x" % ord(k))

        def walk(owner, group):
            seen = []
            for el, phon, orig, child in element_parts(group):
                if el == owner:
                    continue
                if el not in [s[0] for s in seen]:
                    seen.append((el, phon, orig))
                if el not in parts and el not in joyo:
                    parts[el] = None  # reserve, filled below
                    parts[el] = walk(el, child)
            return seen

        parts[k] = walk(k, root)
    return parts


# ---------------------------------------------------------------- words

POS_SHORT = [
    ("noun (common)", "noun"), ("takes the aux. verb suru", "suru verb"),
    ("genitive case particle", "no-adjective"), ("keiyodoshi", "na-adjective"),
    ("adjective (keiyoushi)", "i-adjective"), ("Godan verb", "godan verb"),
    ("Ichidan verb", "ichidan verb"), ("intransitive verb", "intransitive"),
    ("transitive verb", "transitive"), ("adverb", "adverb"), ("expressions", "expression"),
    ("suffix", "suffix"), ("prefix", "prefix"), ("counter", "counter"),
    ("numeric", "numeral"), ("pronoun", "pronoun"), ("conjunction", "conjunction"),
    ("interjection", "interjection"), ("adverbial noun", "adverbial noun"),
    ("temporal noun", "time noun"), ("auxiliary", "auxiliary"),
]
BAD_FORM = ("irregular", "out-dated", "ateji")


def short_pos(text):
    for needle, label in POS_SHORT:
        if needle in text:
            return label
    return text


def priority_rank(tags):
    """Lower is more common. nfXX are frequency bands of 500 words from a newspaper corpus."""
    nf = [int(t[2:]) for t in tags if t.startswith("nf")]
    if nf:
        return min(nf)
    if tags & {"news1", "ichi1", "spec1"}:
        return 25
    if tags & {"news2", "ichi2", "spec2", "gai1"}:
        return 50
    return None


def load_words(con, joyo_set):
    kforms = defaultdict(list)  # idseq -> [(form_id, text)]
    for fid, idseq, text in con.execute("SELECT ID, idseq, text FROM Kanji"):
        if any(c in joyo_set for c in text):
            kforms[idseq].append((fid, text))
    kpri, kinf = defaultdict(set), defaultdict(set)
    for fid, t in con.execute("SELECT kid, text FROM KJP"):
        kpri[fid].add(t)
    for fid, t in con.execute("SELECT kid, text FROM KJI"):
        kinf[fid].add(t)

    entries = {}
    for idseq, forms in kforms.items():
        rare = None
        for n, (fid, text) in enumerate(forms):
            if any(b in i for i in kinf[fid] for b in BAD_FORM):
                continue
            rank = priority_rank(kpri[fid])
            if rank is None:
                rare = rare or text
                continue
            entries[idseq] = {"form": text, "rank": rank + n * 5}  # first listed form is preferred
            break
        else:
            # No common spelling: kept as an uncommon word, shown only where a kanji or reading has nothing better.
            if rare:
                entries[idseq] = {"form": rare, "rank": RARE_RANK, "rare": True}
    ids = set(entries)

    kana = defaultdict(list)
    restr = defaultdict(set)
    for kid, t in con.execute("SELECT kid, text FROM KNR"):
        restr[kid].add(t)
    kinfo = defaultdict(set)
    for kid, t in con.execute("SELECT kid, text FROM KNI"):
        kinfo[kid].add(t)
    for kid, idseq, text, nokanji in con.execute("SELECT ID, idseq, text, nokanji FROM Kana"):
        if idseq in ids and not nokanji:
            kana[idseq].append((kid, text))
    for idseq, e in list(entries.items()):
        reading = next((t for kid, t in kana[idseq]
                        if (not restr[kid] or e["form"] in restr[kid])
                        and not any("out-dated" in i or "irregular" in i for i in kinfo[kid])), None)
        if reading is None:
            del entries[idseq]
        else:
            e["reading"] = reading
            e["senses"] = []
            e["usuallyKana"] = False

    add_senses(con, entries)
    return entries


def add_senses(con, entries):
    """Fills each entry's senses (up to 5, English) and whether it's usually written in kana."""
    sense_of = {}
    for sid, idseq in con.execute("SELECT ID, idseq FROM Sense ORDER BY ID"):
        if idseq in entries:
            sense_of[sid] = idseq
    stagk = defaultdict(set)
    for sid, t in con.execute("SELECT sid, text FROM stagk"):
        stagk[sid].add(t)
    sense_data = defaultdict(lambda: {"pos": [], "gloss": [], "misc": []})
    for sid, t in con.execute("SELECT sid, text FROM SenseGloss WHERE lang = 'eng'"):
        if sid in sense_of:
            sense_data[sid]["gloss"].append(t)
    for sid, t in con.execute("SELECT sid, text FROM pos"):
        if sid in sense_of:
            sense_data[sid]["pos"].append(short_pos(t))
    for sid, t in con.execute("SELECT sid, text FROM misc"):
        if sid in sense_of:
            sense_data[sid]["misc"].append(t)
    last_pos = {}
    for sid in sorted(sense_of):
        e = entries[sense_of[sid]]
        if stagk[sid] and e["form"] not in stagk[sid]:
            continue
        s = sense_data[sid]
        # JMdict leaves pos out when it is the same as the previous sense.
        pos = s["pos"] or last_pos.get(sense_of[sid], [])
        last_pos[sense_of[sid]] = pos
        if not e["senses"] and "word usually written using kana alone" in s["misc"]:
            e["usuallyKana"] = True
        if len(e["senses"]) < 5 and s["gloss"]:
            e["senses"].append({"pos": pos, "gloss": s["gloss"][:6]})


def load_story_words(con, ids):
    """Plain entries for story words outside Nekko's word list: first spelling and reading, senses, rank."""
    if not ids:
        return {}
    marks = ",".join("?" * len(ids))
    entries = {}
    for table, pri in (("Kanji", "KJP"), ("Kana", "KNP")):
        for idseq, text in con.execute(f"SELECT idseq, text FROM {table} WHERE idseq IN ({marks}) ORDER BY ID", ids):
            e = entries.setdefault(idseq, {"form": text, "senses": [], "usuallyKana": False, "tags": set()})
            if table == "Kana":
                e.setdefault("reading", text)
        for idseq, t in con.execute(f"SELECT f.idseq, p.text FROM {pri} p JOIN {table} f ON f.ID = p.kid "
                                    f"WHERE f.idseq IN ({marks})", ids):
            entries[idseq]["tags"].add(t)
    for e in entries.values():
        e["rank"] = priority_rank(e.pop("tags")) or 99
    add_senses(con, entries)
    return {i: e for i, e in entries.items() if e["senses"] and "reading" in e}


def shipped_words():
    """The words in the data/words.json being replaced, by id."""
    path = OUT / "words.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def story_word_ids():
    """Every word the stories use (data/stories.json, written by build_stories.py), so each gets a page."""
    path = OUT / "stories.json"
    if not path.exists():
        return set()
    return {wid for story in json.loads(path.read_text(encoding="utf-8")) for wid, _ in story["w"]}


# ---------------------------------------------------------------- furigana

def align(form, reading, kanji_forms):
    """Split a word into (text, kana) segments and say which kanji reading each kanji uses.

    kanji_forms[k] is {kana: (reading_key, type, penalty)}. Kanji runs that match nothing
    (今日 → きょう) become one 'special' segment.
    """
    reading = hira(reading)

    @lru_cache(maxsize=None)
    def best(i, j):
        if i == len(form):
            return (0, ()) if j == len(reading) else None
        c = form[i]
        options = []
        if not is_kanji(c):
            if j < len(reading) and (hira(c) == reading[j] or c == "ー"):
                rest = best(i + 1, j + 1)
                if rest:
                    options.append((rest[0], ((c, None, None, None),) + rest[1]))
            elif c in "ヶケ" and j < len(reading) and reading[j] in "かがこ":
                rest = best(i + 1, j + 1)
                if rest:
                    options.append((rest[0], ((c, None, None, None),) + rest[1]))
            return min(options, key=lambda o: o[0]) if options else None
        lookup = form[i - 1] if c == "々" and i > 0 else c
        for kana, (key, rtype, pen) in kanji_forms.get(lookup, {}).items():
            if reading.startswith(kana, j):
                rest = best(i + 1, j + len(kana))
                if rest:
                    options.append((rest[0] + pen, ((c, kana, lookup, key),) + rest[1]))
        run = 0
        while i + run < len(form) and is_kanji(form[i + run]):
            run += 1
        # A flat cost per special run, so 今日 stays whole instead of 今=き + 日=ょう.
        for n in range(1, run + 1):
            for m in range(1, min(len(reading) - j, 4 * n) + 1):
                if j + m < len(reading) and reading[j + m] in SMALL_KANA:
                    continue
                rest = best(i + n, j + m)
                if rest:
                    options.append((rest[0] + 10, ((form[i:i + n], reading[j:j + m], None, "*"),) + rest[1]))
        return min(options, key=lambda o: o[0]) if options else None

    result = best(0, 0)
    best.cache_clear()
    if result is None:
        return None
    segs = list(result[1])
    # Two-kanji words with one odd part are usually whole-word readings (明日 あした, 一人 ひとり).
    for n in range(len(segs) - 1):
        a, b = segs[n], segs[n + 1]
        if a[1] and b[1] and len(a[0]) == len(b[0]) == 1 and "*" in (a[3], b[3]) \
                and (n == 0 or segs[n - 1][1] is None) and (n + 2 == len(segs) or segs[n + 2][1] is None):
            segs[n:n + 2] = [(a[0] + b[0], a[1] + b[1], None, "*")]
            break
    segments = []
    for text, kana, k, key in segs:
        if kana is None and segments and segments[-1][1] is None:
            segments[-1][0] += text
        else:
            segments.append([text, kana, k, key])
    return segments


# ---------------------------------------------------------------- sentences

B_TOKEN = re.compile(r"^(?P<head>[^(\[{~]+)(?:\((?P<read>[^)]*)\))?(?:\[(?P<sense>\d+)\])?"
                     r"(?:\{(?P<surface>[^}]*)\})?(?P<checked>~)?$")


def word_level(w, kanji_lesson):
    """When a word becomes readable: its lesson, else its last kanji's lesson; 0 for kana words, None if never."""
    if w.get("lesson"):
        return w["lesson"]
    lessons = [kanji_lesson.get(c) for c in w["w"] if is_kanji(c)]
    if not lessons:
        return 0
    return None if None in lessons else max(lessons)


def load_sentences(words, kanji_lesson=None):
    """
    Attach Tatoeba example sentences to words via Tatoeba's Japanese word index. Easy sentences come first: the
    fewest other words that are taught later than the word itself (`kanji_lesson` maps each kanji to its lesson).
    """
    folder = SOURCES / "tatoeba"
    if not (folder / "jpn_indices.tar.bz2").exists():
        print("Sentences: skipped (run fetch_sources.py --sentences)")
        return {}
    by_form = defaultdict(list)
    for wid, w in words.items():
        by_form[w["w"]].append(wid)

    candidates = defaultdict(list)  # word id -> [(checked, jpn_id, eng_id)]
    tokens = {}                      # jpn_id -> [(word id, surface)] for linking words inside it
    with tarfile.open(folder / "jpn_indices.tar.bz2") as tar:
        member = next(m for m in tar.getmembers() if m.isfile())
        for line in tar.extractfile(member).read().decode("utf-8").splitlines():
            cols = line.split("\t")
            if len(cols) < 3 or not cols[0].isdigit() or not cols[1].isdigit():
                continue
            jid, eid = int(cols[0]), int(cols[1])
            found = []
            for tok in cols[2].split():
                m = B_TOKEN.match(tok)
                if not m:
                    continue
                for wid in by_form.get(m["head"], ()):
                    if m["read"] and hira(m["read"]) != hira(words[wid]["r"]):
                        continue
                    found.append((wid, m["surface"] or m["head"]))
                    candidates[wid].append((not m["checked"], jid, eid))
            if found:
                tokens[jid] = found
    wanted = {i for cs in candidates.values() for _, j, e in cs for i in (j, e)}
    text = {}
    for name in ("jpn_sentences.tsv.bz2", "eng_sentences.tsv.bz2"):
        with bz2.open(folder / name, "rt", encoding="utf-8") as f:
            for line in f:
                sid, _, t = line.rstrip("\n").split("\t", 2)
                if sid.isdigit() and int(sid) in wanted:
                    text[int(sid)] = t

    levels = {wid: word_level(w, kanji_lesson or {}) for wid, w in words.items()}

    def harder(wid, jid):
        """Words in the sentence that are taught after this one (or never)."""
        own = levels[wid]
        if own is None:
            return 0
        return sum(1 for other, _ in tokens[jid] if other != wid and (levels[other] is None or levels[other] > own))

    sentences = {}
    for wid, cs in candidates.items():
        # Easy sentences first, then checked examples, then a comfortable length.
        cs = sorted((c for c in cs if c[1] in text and c[2] in text),
                    key=lambda c: (min(harder(wid, c[1]), 3), c[0], abs(len(text[c[1]]) - 15)))
        limit = SENTENCES_PER_LESSON_WORD if words[wid].get("lesson") else SENTENCES_PER_WORD
        chosen = []
        for _, jid, eid in cs:
            if jid not in chosen:
                chosen.append(jid)
                sentences.setdefault(str(jid), {"ja": text[jid], "en": text[eid]})
            if len(chosen) == limit:
                break
        words[wid]["sentences"] = [str(j) for j in chosen]

    # Mark every known word inside each kept sentence so the app can link it.
    for sid, s in sentences.items():
        links, cursor = [], 0
        for wid, surface in tokens[int(sid)]:
            pos = s["ja"].find(surface, cursor)
            if pos >= 0:
                links.append([pos, len(surface), wid])
                cursor = pos + len(surface)
        s["links"] = links
    print(f"Sentences: {len(sentences)}")
    return sentences


# ---------------------------------------------------------------- audio and strokes

def load_word_audio(words):
    """Kanji alive recorded 6-12 example words per kanji. Link the ones that are our words.

    Files are named <kname>_06_<letter>, letters following the order of the examples list.
    """
    path = SOURCES / "ka_data.csv"
    if not path.exists():
        return 0
    by_form = {(w["w"], hira(w["r"])): wid for wid, w in words.items()}
    linked = 0
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            try:
                examples = json.loads(row["examples"])
            except (json.JSONDecodeError, KeyError):
                continue
            for i, ex in enumerate(examples):
                m = re.match(r"^(.+?)（(.+?)）$", ex[0].strip())
                wid = m and by_form.get((m[1], hira(m[2])))
                if wid and "audio" not in words[wid]:
                    words[wid]["audio"] = f"{row['kname']}_06_{chr(ord('a') + i)}"
                    linked += 1
    return linked


COMMONS_TITLE = (
    re.compile(r"^LL-Q5287 \(jpn\)-(?P<speaker>[^-]+)-(?P<word>.+)\.\w+$"),  # Lingua Libre
    re.compile(r"^Ja-(?P<word>.+?)(?:-\d+)?\.\w+$"),                            # made for Wiktionary
)


def load_commons_audio(words):
    """Words with no Kanji alive recording get one from Wikimedia Commons: w["rec"] = [id, file, author, licence].

    A recording is matched by how the word is written, and only when that spelling belongs to one Nekko word
    (a kana-only title, only to a word normally written in that kana), so no word gets someone else's audio.
    """
    path = SOURCES / "commons_audio.json"
    if not path.exists():
        return 0
    by_spelling = defaultdict(list)
    for wid, w in words.items():
        by_spelling[w["w"]].append(wid)
        if w["usuallyKana"] or not any(map(is_kanji, w["w"])):
            by_spelling[hira(w["r"])].append(wid)
    linked = 0
    # Sorted, so the same list always gives the same choices.
    for file, (author, licence) in sorted(json.loads(path.read_text(encoding="utf-8")).items()):
        m = next((m for m in (t.match(file) for t in COMMONS_TITLE) if m), None)
        if not m or not re.search(r"[\u3040-\u30ff\u4e00-\u9fff]", m["word"]):
            continue
        spelling = m["word"].strip()
        ids = set(by_spelling.get(spelling, ())) | set(by_spelling.get(hira(spelling), ()) if not any(map(is_kanji, spelling)) else ())
        if len(ids) != 1:
            continue
        w = words[ids.pop()]
        if "audio" in w or "rec" in w:
            continue
        # Lingua Libre's author field reads "Speaker: X / Recorder: Y"; the speaker is the one to credit.
        speaker = re.search(r"Speaker:\s*([^\n]+)", author)
        author = (speaker[1] if speaker else author.splitlines()[0] if author else m.groupdict().get("speaker") or "").strip()
        w["rec"] = [hashlib.md5(file.encode()).hexdigest()[:12], file, author, licence]
        linked += 1
    return linked


def load_sentence_audio(sentences):
    """Mark sentences that have a freely licensed Tatoeba recording: s["audio"] = [audio id, speaker]."""
    path = SOURCES / "tatoeba" / "sentences_with_audio.tar.bz2"
    if not path.exists() or not sentences:
        return 0
    with tarfile.open(path) as tar:
        member = next(m for m in tar.getmembers() if m.isfile())
        for line in tar.extractfile(member).read().decode("utf-8").splitlines():
            cols = line.split("\t")
            # sentence id, audio id, username, license, attribution url
            if len(cols) >= 4 and cols[0] in sentences and cols[3] not in ("", "\\N"):
                sentences[cols[0]]["audio"] = [cols[1], cols[2]]
    return sum(1 for s in sentences.values() if "audio" in s)


def load_strokes(joyo):
    """KanjiVG stroke paths per kanji, in stroke order, for the stroke order animation."""
    strokes = {}
    for k in joyo:
        tree = ET.parse(SOURCES / "kanjivg" / ("%05x.svg" % ord(k)))
        strokes[k] = [p.get("d") for p in tree.iter(SVG + "path")]
    return strokes


# ---------------------------------------------------------------- ordering

def build_lessons(joyo, kanji, parts):
    joyo_set = set(joyo)
    level_rank = {5: 0, 4: 1, 3: 2, 2: 3, 1: 4}

    def rank(k):
        return level_rank.get(kanji[k]["jlpt"], 5)

    base = sorted(joyo, key=lambda k: (rank(k), kanji[k]["freq"] or 9999, kanji[k]["strokes"] or 99))
    position = {k: i for i, k in enumerate(base)}

    family = defaultdict(set)
    for k in joyo:
        if kanji[k]["phonetic"]:
            family[kanji[k]["phonetic"]].add(k)

    def prerequisites(k):
        out = []
        for el, _, _ in parts[k]:
            if el in joyo_set:
                out.append(el)
            elif parts.get(el):
                out += [sub for sub, _, _ in parts[el] if sub in joyo_set]
        # A much harder kanji used as a part (乙 inside 九) is not worth pulling forward.
        return [p for p in out if p != k and rank(p) <= rank(k) + 1]

    lessons, current, assigned = [], [], set()

    def add(k, stack=()):
        if k in assigned or k in stack:
            return
        for p in prerequisites(k):
            add(p, stack + (k,))
        assigned.add(k)
        current.append(k)

    for k in base:
        if k in assigned:
            continue
        add(k)
        related = (family.get(kanji[k]["phonetic"], set()) | family.get(k, set())) - assigned
        related = sorted((r for r in related if rank(r) <= rank(k) + 1), key=position.get)
        for r in related[:MAX_RELATED]:
            add(r)
        if len(current) >= LESSON_SIZE:
            lessons.append(current)
            current = []
    if current:
        lessons.append(current)
    return lessons


# ---------------------------------------------------------------- main

def main():
    con = sqlite3.connect(SOURCES / "jamdict.db")
    kanjidic, joyo = load_kanjidic(con)
    joyo_set = set(joyo)
    jlpt = load_jlpt()
    parts = load_kanjivg(joyo)

    # Kanji
    kanji = {}
    for k in joyo:
        d = kanjidic[k]
        phon = next((el for el, is_phon, _ in parts[k] if is_phon), None)
        kanji[k] = {
            "c": k, "meanings": d["meanings"], "strokes": d["strokes"], "grade": int(d["grade"]),
            "jlpt": jlpt.get(k), "freq": d["freq"],
            "on": d["on"], "kun": d["kun"],
            "parts": [{"c": el, "phonetic": is_phon} for el, is_phon, _ in parts[k]],
            "phonetic": phon,
        }

    # Components that are not Jōyō kanji themselves become "radicals".
    used_in = defaultdict(list)
    for owner, ps in parts.items():
        for el, _, _ in ps or ():
            used_in[el].append(owner)
    radicals = {}
    for el, ps in parts.items():
        if el in joyo_set:
            continue
        orig = next((o for ps2 in parts.values() for e, _, o in ps2 or () if e == el and o), None)
        meaning = RADICAL_NAMES.get(el) or next(
            (m for c in (el, orig) if c in kanjidic for m in kanjidic[c]["meanings"][:1]), None)
        if el not in RADICAL_NAMES:
            print(f"Component without a name in component_names.py: {el} (using {meaning!r})")
        radicals[el] = {
            "c": el, "meanings": [meaning] if meaning else [el],
            "original": orig, "parts": [{"c": e, "phonetic": p} for e, p, _ in ps or ()],
            "readings": (kanjidic[el]["on"] + kanjidic[el]["kun"]) if el in kanjidic else [],
        }

    # Words + which reading of each kanji they use
    forms = {}
    for k in joyo:
        f = {}
        for key in kanji[k]["on"]:
            for kana, pen in reading_forms(key, "on").items():
                if kana not in f or f[kana][2] > pen:
                    f[kana] = (key, "on", pen)
        for key in kanji[k]["kun"]:
            for kana, pen in reading_forms(key, "kun").items():
                if kana not in f or f[kana][2] > pen:
                    f[kana] = (key, "kun", pen)
        forms[k] = f

    entries = load_words(con, joyo_set)
    words, unaligned = {}, 0
    for idseq, e in entries.items():
        if not e["senses"]:
            continue
        segs = align(e["form"], e["reading"], forms)
        if segs is None:
            # Readings that can't be split per kanji (odd okurigana or spellings): the whole word gets one reading.
            unaligned += 1
            segs = ((e["form"], hira(e["reading"]), None, "*"),)
        words[str(idseq)] = {
            "id": str(idseq), "w": e["form"], "r": e["reading"],
            "furigana": [[t, r, key] if key else [t, r] for t, r, _, key in segs],  # key: KANJIDIC reading used, "*" = special
            "uses": [[k, key] for _, _, k, key in segs if k],
            "special": [t for t, _, k, key in segs if key == "*"],
            "senses": e["senses"], "rank": e["rank"], "usuallyKana": e["usuallyKana"],
            **({"rare": True} if e.get("rare") else {}),
        }

    # Per kanji: words grouped by the reading they use
    by_kanji = defaultdict(lambda: defaultdict(list))
    for wid, w in words.items():
        for k, key in w["uses"]:
            by_kanji[k][key].append(wid)
        for run in w["special"]:
            for k in run:
                if k in joyo_set:
                    by_kanji[k]["*"].append(wid)
    order_key = lambda wid: (words[wid].get("rare", False), words[wid]["usuallyKana"], words[wid]["rank"],
                             len(words[wid]["w"]), int(wid))
    common = lambda ws: [w for w in ws if not words[w].get("rare")]
    keep = set()
    for k in joyo:
        groups = {key: sorted(set(ws), key=order_key) for key, ws in by_kanji[k].items()}
        chosen = []
        for key in groups:
            # A reading no common word uses gets its best uncommon one, so every reading has an example.
            chosen += [w for w in common(groups[key])[:WORDS_PER_READING] or groups[key][:1] if w not in chosen]
        rest = sorted({w for ws in groups.values() for w in common(ws)} - set(chosen), key=order_key)
        chosen += rest[:max(0, WORDS_PER_KANJI - len(chosen))]
        if len(chosen) < MIN_WORDS_PER_KANJI:
            more = sorted({w for ws in groups.values() for w in ws} - set(chosen), key=order_key)
            chosen += more[:MIN_WORDS_PER_KANJI - len(chosen)]
        chosen_set = set(chosen)
        readings = []
        for key, rtype in [(r, "on") for r in kanji[k]["on"]] + [(r, "kun") for r in kanji[k]["kun"]]:
            ws = [w for w in groups.get(key, []) if w in chosen_set]
            readings.append({"r": key, "type": rtype, "words": ws, "count": len(common(groups.get(key, [])))})
        # Most-used readings first, so the ones worth learning are on top.
        readings.sort(key=lambda r: (-r["count"], r["type"] != "on"))
        kanji[k]["readings"] = readings
        kanji[k]["specialWords"] = [w for w in groups.get("*", []) if w in chosen_set]
        kanji[k]["words"] = sorted(chosen, key=order_key)
        keep |= chosen_set
    story_ids = story_word_ids()
    # Words already shipped stay, since someone may be studying them: from the dictionary if it still has them,
    # otherwise as they were.
    shipped = shipped_words()
    words = {wid: w for wid, w in words.items() if wid in keep or wid in story_ids or wid in shipped}
    for idseq, e in load_story_words(con, sorted(int(i) for i in story_ids - words.keys())).items():
        segs = align(e["form"], e["reading"], forms) if any(map(is_kanji, e["form"])) else None
        words[str(idseq)] = {
            "id": str(idseq), "w": e["form"], "r": e["reading"],
            "furigana": [[t, r, key] if key else [t, r] for t, r, _, key in segs] if segs
            else [[e["form"], e["reading"] if any(map(is_kanji, e["form"])) else None]],
            "uses": [], "special": [], "senses": e["senses"], "rank": e["rank"], "usuallyKana": e["usuallyKana"],
        }
    for wid in sorted(shipped.keys() - words.keys(), key=int):  # sorted, so the same data gives the same file
        words[wid] = {**{k: v for k, v in shipped[wid].items() if k not in ("sentences", "lesson")}, "uses": []}
    for k in joyo:
        for r in kanji[k]["readings"]:
            del r["count"]

    # Lessons
    lessons = build_lessons(joyo, kanji, parts)
    lesson_of = {k: i for i, ks in enumerate(lessons) for k in ks}

    def studyable(w):
        return (w["rank"] <= STUDY_MAX_RANK and len(w["w"]) <= 4 and not w["usuallyKana"]
                and all(c in joyo_set for c in w["w"] if is_kanji(c) and c != "々"))

    seen_radicals = set()
    study_words = set()
    lesson_out = []
    for i, ks in enumerate(lessons):
        rads = []
        for k in ks:
            for el, _, _ in parts[k]:
                todo = [el] + [sub for sub, _, _ in parts.get(el) or () if sub not in joyo_set]
                for r in todo:
                    if r in radicals and r not in seen_radicals:
                        seen_radicals.add(r)
                        rads.append(r)
        lesson_out.append({"id": i + 1, "radicals": rads, "kanji": ks, "words": []})
    for k in joyo:
        kanji[k]["lesson"] = lesson_of[k] + 1
        # Review vocab: the most common everyday word for each of the kanji's main readings.
        picked = []
        for r in kanji[k]["readings"]:
            fit = [w for w in r["words"] if studyable(words[w]) and w not in picked]
            picked += fit[:1]
            if len(picked) >= STUDY_WORDS_PER_KANJI:
                break
        study_words |= set(picked)
    for wid in sorted(study_words, key=order_key):
        w = words[wid]
        lesson = max(lesson_of[c] for c in w["w"] if c in lesson_of)
        w["lesson"] = lesson + 1
        lesson_out[lesson]["words"].append(wid)
    for el, r in radicals.items():
        r["usedIn"] = sorted((o for o in used_in[el] if o in joyo_set), key=lambda o: lesson_of[o])
        r["lesson"] = next((l["id"] for l in lesson_out if el in l["radicals"]), None)
    for k in joyo:
        kanji[k]["usedIn"] = sorted((o for o in used_in[k] if o in joyo_set), key=lambda o: lesson_of[o])
        kanji[k]["soundFamily"] = sorted(
            (o for o in joyo if o != k and kanji[k]["phonetic"] and kanji[o]["phonetic"] == kanji[k]["phonetic"]),
            key=lambda o: lesson_of[o])
    radicals = {el: r for el, r in radicals.items() if r["lesson"] or r["usedIn"]}

    kanji_lesson = {k: v["lesson"] for k, v in kanji.items() if v.get("lesson")}
    sentences = load_sentences(words, kanji_lesson)
    for w in words.values():
        w.setdefault("sentences", [])
    levels = {wid: word_level(w, kanji_lesson) for wid, w in words.items()}
    from more_sentences import add_sentences  # it imports this module, so only once it's loaded
    add_sentences(words, sentences, con, levels.get,
                  lambda wid: SENTENCES_PER_LESSON_WORD if words[wid].get("lesson") else SENTENCES_PER_WORD)
    audio_words = load_word_audio(words)
    commons_words = load_commons_audio(words)
    audio_sentences = load_sentence_audio(sentences)
    strokes = load_strokes(joyo)
    for w in words.values():
        w.setdefault("sentences", [])
        del w["uses"]

    OUT.mkdir(exist_ok=True)
    meta = {
        "counts": {"kanji": len(kanji), "radicals": len(radicals), "words": len(words),
                   "studyWords": len(study_words), "sentences": len(sentences), "lessons": len(lesson_out),
                   "wordAudio": audio_words, "commonsAudio": commons_words, "sentenceAudio": audio_sentences},
        "sources": {
            "JMdict / KANJIDIC2": "Electronic Dictionary Research and Development Group, CC BY-SA 4.0",
            "KanjiVG": "Ulrich Apel and contributors, CC BY-SA 3.0",
            "JLPT levels": "Jonathan Waller's lists via davidluzgouveia/kanji-data, MIT",
            "Example sentences": "Tatoeba Project, CC BY 2.0 FR; recordings by the named Tatoeba speakers; "
                                 "Wiktionary usage examples via kaikki.org, CC BY-SA 4.0",
            "Word audio": "Kanji alive, CC BY 4.0; volunteers on Wikimedia Commons and Lingua Libre (each "
                          "recording's author and licence are listed with it)",
            "Stories": "Aozora Bunko (public domain); Tadoku free readers by NPO多言語多読, CC BY-NC-ND 4.0",
        },
    }
    for name, obj in [("kanji", kanji), ("radicals", radicals), ("words", words),
                      ("sentences", sentences), ("lessons", lesson_out), ("strokes", strokes), ("meta", meta)]:
        (OUT / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")),
                                          encoding="utf-8")
    print(json.dumps(meta["counts"]), f"words with whole-word furigana: {unaligned}")


if __name__ == "__main__":
    main()
