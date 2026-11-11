"""
Splits every example sentence into words with Sudachi, the same way the stories are linked, and fills in what the
sentence's own word links missed. Tatoeba's word index skips many words (なる in になりました, ところ, 成人), so
without this the app can't tell that a sentence holds a word you haven't learned.

For each sentence (in place):
  links  gains the words Nekko has an entry for that weren't linked yet.
  gaps   [[start, length]]: words written in kana that Nekko has no entry for (もつれ, たっぷり). The app can't
         explain them, so a sentence with one is left out of the examples.
  names  [[start, length]]: names of people and places (トム, メアリー). A name is never a word to learn.
  g      the grammar points it uses, from grammar_tags.py.
Grammar words (particles, endings, interjections) are never gaps.
"""

import json
import re
from pathlib import Path

from build_stories import Linker, is_kanji

# JMdict classes (build_stories.pos_class) that are grammar rather than a word to learn: interjections, conjunctions, and "other"
# (particles, auxiliary verbs, expressions).
GRAMMAR = {"int", "conj", "other"}
NAME = ("名詞", "固有名詞")


def relink(sentences, words, linker):
    """→ (links added, sentences with a gap, sentences with a name)."""
    added = gapped = named = 0
    for s in sentences.values():
        ja = s["ja"]
        covered = bytearray(len(ja))
        for start, n, *_ in s["links"]:
            covered[start:start + n] = b"\1" * n
        links, _, _ = linker.paragraph(ja)
        gaps = []
        for start, n, wid, *_ in links:
            if any(covered[start:start + n]):
                continue
            surface = ja[start:start + n]
            if wid in words:
                s["links"].append([start, n, wid])
                added += 1
            elif len(surface) > 1 and not any(map(is_kanji, surface)) and not linker.pos[int(wid)] <= GRAMMAR:
                gaps.append([start, n])
            covered[start:start + n] = b"\1" * n
        s["links"].sort(key=lambda link: link[0])
        if gaps:
            s["gaps"] = gaps
            gapped += 1
        else:
            s.pop("gaps", None)
        names = [[m.begin(), m.end() - m.begin()] for m in linker.tok.tokenize(ja)
                 if tuple(m.part_of_speech()[:2]) == NAME and not any(covered[m.begin():m.end()])]
        if names:
            s["names"] = names
            named += 1
        else:
            s.pop("names", None)
    return added, gapped, named


JAPANESE = re.compile(r"[ぁ-ゖァ-ヺ一-鿿]")


def tidy(sentences, words):
    """Keeps one copy of a sentence that came in twice (from two sources, or twice in Tatoeba), the one with a
    recording if either has it, and drops sentences whose English still has Japanese in it. Words point at the
    copy that's kept. → (copies merged, dropped)."""
    keep, merged, dropped = {}, {}, set()
    for sid in sorted(sentences, key=lambda i: "audio" not in sentences[i]):
        s = sentences[sid]
        if JAPANESE.search(s["en"]):
            dropped.add(sid)
        elif s["ja"] in keep:
            merged[sid] = keep[s["ja"]]
        else:
            keep[s["ja"]] = sid
    for sid in [*merged, *dropped]:
        del sentences[sid]
    for w in words.values():
        if w.get("sentences"):
            w["sentences"] = list(dict.fromkeys(merged.get(i, i) for i in w["sentences"] if i not in dropped))
    return len(merged), len(dropped)


def main(con, words, sentences):
    merged, dropped = tidy(sentences, words)
    print(f"Sentences: {merged} duplicates merged, {dropped} with Japanese left in the English dropped")
    try:
        linker = Linker(con)
    except ImportError:
        print("Sentence words: skipped (needs sudachipy, see the Build data workflow)")
        return
    added, gapped, named = relink(sentences, words, linker)
    print(f"Sentence words: {added} more links, {gapped} sentences with a word Nekko has no entry for, "
          f"{named} with a name")
    import grammar_tags
    points = json.loads((Path(__file__).parent.parent / "data" / "grammar.json").read_text(encoding="utf-8"))
    tagged = grammar_tags.tag_sentences(sentences, [p["id"] for p in points], linker.tok)
    print(f"Sentence grammar: {tagged} sentences use grammar from N5 up")
