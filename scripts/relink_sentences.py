"""
Splits every example sentence into words with Sudachi, the same way the stories are linked, and fills in what the
sentence's own word links missed. Tatoeba's word index skips many words (なる in になりました, ところ, 成人), so
without this the app can't tell that a sentence holds a word you haven't learned.

For each sentence (in place):
  links  gains the words Nekko has an entry for that weren't linked yet.
  gaps   [[start, length]]: words written in kana that Nekko has no entry for (もつれ, たっぷり). The app can't
         explain them, so a sentence with one is left out of the examples.
  names  [[start, length]]: names of people and places (トム, メアリー). A name is never a word to learn.
Grammar words (particles, endings, interjections) are never gaps.
"""

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


def main(con, words, sentences):
    try:
        linker = Linker(con)
    except ImportError:
        print("Sentence words: skipped (needs sudachipy, see the Build data workflow)")
        return
    added, gapped, named = relink(sentences, words, linker)
    print(f"Sentence words: {added} more links, {gapped} sentences with a word Nekko has no entry for, "
          f"{named} with a name")
