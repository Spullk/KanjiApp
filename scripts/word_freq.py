"""
How common a word is, for ordering the lessons' words (Lucas, 2026-11-26: "more closely follow how common a word
is"). Two open sources, each covering the other's gaps:

  wordfreq   Robyn Speer's word list (CC BY-SA 4.0): subtitles, Wikipedia, news, books, the web and social media.
             Its text was split into words by MeCab, so a verb's forms are counted apart (食べ in 食べた, 食べる),
             and compounds MeCab splits (一本, 三十日) aren't in it at all.
  Tatoeba    how many example sentences use the word, from Tatoeba's word index, which files every form under
             the dictionary form. Everyday speech, but thin for rarer words, and names it doesn't count.

Both become a Zipf value (log10 of uses per billion words: 7 is "the", 3 is a word seen about once a million
words) and the score is their average, or the one there is. Names do well in wordfreq but poorly in sentences (本木
is mostly the surname Motoki), and verbs the other way round, so the average puts both about right.
"""

import gzip
import math
import struct
from collections import defaultdict
from pathlib import Path

SOURCES = Path(__file__).resolve().parent.parent / "sources"


def _unpack(b, i):
    """The bits of msgpack the wordfreq file uses (arrays, maps, strings, small ints), so the build needs no
    msgpack library."""
    t = b[i]
    i += 1
    if t <= 0x7F:
        return t, i
    if 0x80 <= t <= 0x8F or t == 0xDE:
        n = t & 15
        if t == 0xDE:
            n, i = struct.unpack(">H", b[i:i + 2])[0], i + 2
        d = {}
        for _ in range(n):
            k, i = _unpack(b, i)
            d[k], i = _unpack(b, i)
        return d, i
    if 0x90 <= t <= 0x9F or t in (0xDC, 0xDD):
        if t == 0xDC:
            n, i = struct.unpack(">H", b[i:i + 2])[0], i + 2
        elif t == 0xDD:
            n, i = struct.unpack(">I", b[i:i + 4])[0], i + 4
        else:
            n = t & 15
        out = []
        for _ in range(n):
            v, i = _unpack(b, i)
            out.append(v)
        return out, i
    if 0xA0 <= t <= 0xBF:
        n = t & 31
    elif t == 0xD9:
        n, i = b[i], i + 1
    elif t == 0xDA:
        n, i = struct.unpack(">H", b[i:i + 2])[0], i + 2
    elif t == 0xDB:
        n, i = struct.unpack(">I", b[i:i + 4])[0], i + 4
    elif t == 0xCC:
        return b[i], i + 1
    elif t == 0xCD:
        return struct.unpack(">H", b[i:i + 2])[0], i + 2
    elif t == 0xC0:
        return None, i
    elif t in (0xC2, 0xC3):
        return t == 0xC3, i
    else:
        raise ValueError(f"wordfreq file: unexpected msgpack byte {t:#x}")
    return b[i:i + n].decode("utf-8"), i + n


def load_wordfreq():
    """{word: Zipf value}, or {} when sources/wordfreq/ is missing. The file is a list of bins after a header: bin
    n holds the words used 10^(-n/100) of the time."""
    path = SOURCES / "wordfreq" / "large_ja.msgpack.gz"
    if not path.exists():
        return {}
    data, _ = _unpack(gzip.decompress(path.read_bytes()), 0)
    zipf = {}
    for n, bin_words in enumerate(data[1:]):
        for w in bin_words:
            zipf.setdefault(w, 9 - n / 100)
    return zipf


# Godan verbs: the kana their stem ends in before each ending MeCab splits off (書か|ない, 書き|ます, 書け|ば,
# 書こ|う, 書い|た). 行く is the one く verb with 行っ.
GODAN = {"く": "かきけこい", "ぐ": "がぎげごい", "す": "さしせそ", "つ": "たちてとっ", "ぬ": "なにねのん",
         "ぶ": "ばびべぼん", "む": "まみめもん", "る": "らりれろっ", "う": "わいえおっ"}


def surface_forms(w, pos):
    """The pieces a verb or i-adjective shows up as in MeCab-split text, besides the word itself."""
    if not w:
        return []
    stem, last = w[:-1], w[-1]
    if "ichidan verb" in pos and last == "る":
        return [stem]
    if "godan verb" in pos and last in GODAN:
        return [stem + k for k in GODAN[last]] + ([stem + "っ"] if w.endswith("行く") else [])
    if "i-adjective" in pos and last == "い":
        return [stem + e for e in ("く", "かっ", "けれ", "さ")]
    return []


def wordfreq_zipf(zipf, w, spellings=frozenset()):
    """A word's Zipf value in wordfreq, with a verb's or adjective's forms added up, or None if it isn't there.
    A form that is also another word's spelling only counts up to 20 times the dictionary form's own uses (about
    the share the dictionary form has of a verb's uses): the stem of the rare 同じる "to agree" is 同じ "same",
    but 連れ in 連れて is mostly 連れる."""
    pos = {p for s in w["senses"][:1] for p in s["pos"]}
    own = 10 ** (zipf[w["w"]] - 9) if w["w"] in zipf else 0
    forms = [f for f in surface_forms(w["w"], pos) if f in zipf]
    alone = sum(10 ** (zipf[f] - 9) for f in forms if f not in spellings)
    shared = sum(10 ** (zipf[f] - 9) for f in forms if f in spellings)
    total = own + alone + min(shared, 20 * own)
    return 9 + math.log10(total) if total else None


def commonness(words, zipf, sentence_counts, total_tokens, reading_tags):
    """{word id: score}, higher is more common. `sentence_counts` is {word id: uses in Tatoeba} (may be empty),
    `total_tokens` how many words that index holds, `reading_tags` {word id: JMdict priority tags of its reading}.
    Words in neither source get a value from JMdict's newspaper band (rank 25 is about the 12,500th word), which
    is what Nekko ordered by before."""
    by_rank = sorted(zipf.values(), reverse=True)

    def at_rank(r):
        return by_rank[min(len(by_rank) - 1, max(0, r))] if by_rank else 6 - math.log10(max(1, r))

    # wordfreq counts spellings, not words: 字 is じ "character" and the place-name あざ, 入る is はいる and the
    # literary いる. The spelling's count goes to the entry whose reading JMdict marks as everyday (ichi1, then
    # spec), not its newspaper band, which ranks 字 あざ first; each entry after it gets a tenth of the one before.
    # Tatoeba's index tells readings apart, so its part isn't split.
    same = defaultdict(list)
    for wid, w in words.items():
        same[w["w"]].append(wid)

    def everyday(wid):
        tags = reading_tags.get(wid, set())
        return ("ichi1" not in tags, not tags & {"spec1", "spec2"}, -len(tags), words[wid]["rank"], int(wid))

    behind = {}
    for ids in same.values():
        for n, wid in enumerate(sorted(ids, key=everyday)):
            behind[wid] = n
    spellings = frozenset(same)

    out = {}
    for wid, w in words.items():
        parts = []
        z = wordfreq_zipf(zipf, w, spellings)
        if z is not None:
            parts.append(z - behind[wid])
        if total_tokens:
            c = sentence_counts.get(wid, 0)
            # Half a use for words no sentence has, so they sit below those with one, not at minus infinity.
            parts.append(9 + math.log10((c + 0.5) / total_tokens))
        out[wid] = sum(parts) / len(parts) if parts else at_rank(500 * w["rank"])
    return out
