"""Checks everything in data/ for broken or missing content and writes a report a person can work through.

Run from the repo root after the data is built (it only reads data/, so it also runs without sources/):
    python scripts/check_content.py

Writes reports/content-check.md (counts plus examples for each problem) and reports/content-check.json
(every flagged item). It never changes data/ and always exits 0: problems go in the report, not the build log.
"""

import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
REPORTS = ROOT / "reports"
SHOWN = 25  # examples per check in the Markdown report

KANA = re.compile(r"^[ぁ-んァ-ヶー]+$")
JAPANESE = re.compile(r"[ぁ-んァ-ヶ一-鿿]")
SENTENCE_END = re.compile(r"(?<=[。！？!?」』])")
NUMBER = re.compile(r"[0-9０-９]+")


def is_kanji(c):
    return "一" <= c <= "鿿" or "㐀" <= c <= "䶿" or c in "々〆ヶ"


def odd_char(c):
    """Characters that mean the text came through damaged: look-alike radicals from PDF fonts, vertical-only
    punctuation, the replacement character, private-use glyphs and control characters."""
    o = ord(c)
    return (0x2E80 <= o <= 0x2FDF or 0xFE10 <= o <= 0xFE19 or 0xFE30 <= o <= 0xFE4F or o == 0xFFFD
            or 0xE000 <= o <= 0xF8FF or (unicodedata.category(c) == "Cc" and c not in "\n"))


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


class Report:
    def __init__(self):
        self.checks = {}  # key → (area, title, why, [items])

    def add(self, key, area, title, why, items):
        self.checks[key] = (area, title, why, list(items))

    def write(self, counts):
        REPORTS.mkdir(exist_ok=True)
        full = {k: {"area": a, "title": t, "why": w, "count": len(i), "items": i} for k, (a, t, w, i) in self.checks.items()}
        (REPORTS / "content-check.json").write_text(json.dumps({"counts": counts, "checks": full}, ensure_ascii=False, indent=1),
                                                     encoding="utf-8")
        out = ["# Nekko content check", "",
               "Written by `scripts/check_content.py` after every data build. Each section is one kind of problem, "
               f"with up to {SHOWN} examples; `content-check.json` next to this file has every item.", "",
               "Checked: " + ", ".join(f"{n:,} {k}" for k, n in counts.items()) + ".", "",
               "| Area | Problem | Count |", "|---|---|---:|"]
        for k, (area, title, _, items) in self.checks.items():
            out.append(f"| {area} | [{title}](#{k}) | {len(items):,} |")
        for k, (area, title, why, items) in self.checks.items():
            out += ["", f'<a id="{k}"></a>', f"## {area}: {title} ({len(items):,})", "", why, ""]
            out += [f"- {line(i)}" for i in items[:SHOWN]] or ["None. 🎉"]
            if len(items) > SHOWN:
                out.append(f"- …and {len(items) - SHOWN:,} more")
        (REPORTS / "content-check.md").write_text("\n".join(out) + "\n", encoding="utf-8")


def line(item):
    return " · ".join(str(v) for v in item.values()) if isinstance(item, dict) else str(item)


def word_label(w):
    return f"{w['w']} ({w['r']})" if w["w"] != w["r"] else w["w"]


def first_gloss(w):
    return next((g for s in w["senses"] for g in s["gloss"]), "")


def check_words(r, words, lessons, sentences, kanji):
    lesson_of = {wid: l["id"] for l in lessons for wid in l["words"]}
    taught = [words[i] for i in lesson_of if i in words]
    r.add("lesson-word-missing", "Words", "Lesson words with no dictionary entry",
          "A lesson lists a word id that words.json doesn't have, so the card can't show.",
          [{"lesson": l, "id": i} for i, l in lesson_of.items() if i not in words])
    r.add("word-no-meaning", "Words", "Words with no meaning",
          "No sense has an English gloss, so the card has nothing to ask for.",
          [{"word": word_label(w), "id": w["id"]} for w in words.values()
           if not any(g.strip() for s in w["senses"] for g in s["gloss"])])
    r.add("lesson-word-no-sentence", "Words", "Lesson words with no example sentence",
          "Taught words should have at least one example sentence. Tatoeba, Wiktionary and JESC had none for these.",
          [{"lesson": lesson_of[w["id"]], "word": word_label(w), "meaning": first_gloss(w), "id": w["id"]}
           for w in sorted(taught, key=lambda w: lesson_of[w["id"]]) if not w["sentences"]])
    r.add("word-sentence-missing", "Words", "Words pointing at sentences that don't exist",
          "The word lists a sentence id that sentences.json doesn't have.",
          [{"word": word_label(w), "sentence": s} for w in words.values() for s in w["sentences"] if s not in sentences])
    # Glosses a learner can't use as an answer: a pointer to another entry, markup, or a whole paragraph.
    weak = []
    for w in taught:
        g = first_gloss(w)
        if re.match(r"\(?see\b", g, re.I) or re.search(r"[<>&]|\?\?", g):
            weak.append({"lesson": lesson_of[w["id"]], "word": word_label(w), "meaning": g, "why": "pointer or markup"})
        elif len(g) > 60:
            weak.append({"lesson": lesson_of[w["id"]], "word": word_label(w), "meaning": g, "why": "very long"})
    r.add("lesson-word-weak-meaning", "Words", "Lesson words whose first meaning is hard to use",
          "The first meaning is what the card asks for. These are a cross-reference, contain markup, or run over 60 characters.",
          sorted(weak, key=lambda x: x["lesson"]))
    furi = []
    for w in taught:
        if "".join(s[0] for s in w["furigana"]) != w["w"]:
            furi.append({"word": word_label(w), "furigana": "".join(f"{a}[{b}]" if b else a for a, b, *_ in w["furigana"])})
    r.add("lesson-word-furigana", "Words", "Lesson words whose furigana doesn't spell the word",
          "The furigana pieces put together should give back the word exactly.", furi)
    same = defaultdict(list)
    for w in taught:
        same[(w["w"], first_gloss(w).lower())].append(w)
    r.add("lesson-word-duplicate", "Words", "The same word taught twice",
          "Two lesson words share the spelling and the first meaning, so they'd be two cards for one thing.",
          [{"word": word_label(ws[0]), "meaning": k[1], "lessons": ", ".join(str(lesson_of[w["id"]]) for w in ws)}
           for k, ws in same.items() if len(ws) > 1])
    spelled = defaultdict(list)
    for w in words.values():
        if not w.get("junk"):
            spelled[(w["w"], w["r"])].append(w)
    r.add("lesson-word-rarer-homophone", "Words", "Lesson words that may be the wrong dictionary entry",
          "Another entry written and read the same way is more common, so the lesson may teach the rare meaning "
          "(ロケット as \"locket\" instead of \"rocket\").",
          [{"lesson": lesson_of[w["id"]], "word": word_label(w), "taught": first_gloss(w),
            "more common": " / ".join(first_gloss(o) for o in better)}
           for w in sorted(taught, key=lambda w: lesson_of[w["id"]])
           if (better := [o for o in spelled[(w["w"], w["r"])] if o["id"] != w["id"] and o["rank"] < w["rank"]])])
    r.add("lesson-word-junk", "Words", "Junk words still in a lesson",
          "Words marked junk (a wrong dictionary match) shouldn't be taught.",
          [{"lesson": lesson_of[w["id"]], "word": word_label(w)} for w in taught if w.get("junk")])
    # Kana words a story links to are fine; a lone kana outside the lessons is usually a wrong match (ト as "note G").
    r.add("word-lone-kana", "Words", "Single-kana words outside the lessons",
          "A lone kana as a word is usually a wrong dictionary match (ト as \"note G\"). Check these aren't shown as cards.",
          [{"word": word_label(w), "meaning": first_gloss(w), "id": w["id"]} for w in words.values()
           if len(w["w"]) == 1 and KANA.match(w["w"]) and w["id"] not in lesson_of and not w.get("junk")])


def check_kanji(r, kanji, words, lessons, strokes):
    in_lesson = {c for l in lessons for c in l["kanji"]}
    r.add("kanji-no-meaning", "Kanji", "Kanji with no meaning", "KANJIDIC gave no English meaning.",
          [k for k, v in kanji.items() if not v["meanings"]])
    r.add("kanji-no-reading", "Kanji", "Kanji with no reading", "No on or kun reading to teach.",
          [k for k, v in kanji.items() if not v["on"] and not v["kun"]])
    r.add("kanji-no-words", "Kanji", "Kanji with fewer than 2 example words",
          "Each kanji should show a few words that use it.",
          [{"kanji": k, "words": len(v["words"])} for k, v in kanji.items() if len(v["words"]) < 2])
    r.add("kanji-word-missing", "Kanji", "Kanji pointing at words that don't exist",
          "A kanji's word list has an id that words.json doesn't have.",
          [{"kanji": k, "id": i} for k, v in kanji.items() for i in v["words"] if i not in words])
    r.add("kanji-no-strokes", "Kanji", "Kanji with no stroke order", "KanjiVG has no strokes for these.",
          [k for k in kanji if k not in strokes])
    r.add("kanji-not-taught", "Kanji", "Kanji in no lesson", "Every Joyo kanji should be in a lesson.",
          [k for k in kanji if k not in in_lesson])
    r.add("lesson-kanji-missing", "Kanji", "Lessons listing kanji that don't exist", "The lesson can't show these.",
          [{"lesson": l["id"], "kanji": c} for l in lessons for c in l["kanji"] if c not in kanji])
    # A reading worth a card should have a word that uses it.
    r.add("kanji-reading-no-word", "Kanji", "On readings with no example word",
          "Kun readings often have no word of their own, but an on reading with none can't be shown in use.",
          [{"kanji": k, "reading": rd["r"]} for k, v in kanji.items() for rd in v["readings"]
           if rd["type"] == "on" and not rd["words"]])


def check_radicals(r, radicals, kanji, lessons):
    in_lesson = {c for l in lessons for c in l["radicals"]}
    r.add("radical-name", "Radicals", "Radicals without exactly one name",
          "Each radical should have exactly one name (Lucas's rule).",
          [{"radical": k, "names": " / ".join(v["meanings"]) or "none"} for k, v in radicals.items() if len(v["meanings"]) != 1])
    r.add("radical-unused", "Radicals", "Radicals no kanji uses",
          "A radical in a lesson that no taught kanji contains doesn't help learn anything.",
          [{"radical": k, "name": (v["meanings"] or ["?"])[0], "lesson": v.get("lesson")} for k, v in radicals.items()
           if not v["usedIn"]])
    r.add("radical-used-in-missing", "Radicals", "Radicals pointing at kanji that don't exist", "",
          [{"radical": k, "kanji": c} for k, v in radicals.items() for c in v["usedIn"] if c not in kanji])
    r.add("radical-not-taught", "Radicals", "Radicals in no lesson", "", [k for k in radicals if k not in in_lesson])


def check_sentences(r, sentences, words):
    bad_link, odd, no_en = [], [], []
    for sid, s in sentences.items():
        ja, en = s["ja"], s.get("en", "")
        if not ja.strip() or not en.strip() or JAPANESE.search(en):
            no_en.append({"id": sid, "ja": ja, "en": en})
        if any(odd_char(c) for c in ja) or re.search(r"&\w+;|<[a-z/]", ja + en):
            odd.append({"id": sid, "ja": ja, "en": en})
        for start, length, wid in s["links"]:
            if wid not in words or start + length > len(ja):
                bad_link.append({"id": sid, "ja": ja, "word": wid})
    r.add("sentence-translation", "Sentences", "Sentences with a missing or untranslated English line",
          "The English is empty or still has Japanese in it.", no_en)
    r.add("sentence-odd-text", "Sentences", "Sentences with damaged text", "Broken characters or leftover HTML.", odd)
    r.add("sentence-bad-link", "Sentences", "Sentences linking to missing words",
          "A tappable word in the sentence points at nothing.", bad_link)
    dup = Counter(s["ja"] for s in sentences.values())
    r.add("sentence-duplicate", "Sentences", "The same Japanese sentence more than once",
          "Usually harmless (different sources), listed so they can be merged.",
          [{"ja": ja, "times": n} for ja, n in dup.most_common() if n > 1])


def bigram_model(sentences, words):
    """Pairs of characters seen in real Japanese (the example sentences and the dictionary)."""
    seen = set()
    for t in [s["ja"] for s in sentences.values()] + [w["w"] for w in words.values()]:
        t = NUMBER.sub("0", t)
        seen.update(a + b for a, b in zip(t, t[1:]))
    return seen


def jumbled(sentence, seen):
    """Share of character pairs never seen in real Japanese. Text read in the wrong order (columns of a side note
    mixed together, furigana read backwards) is mostly unseen pairs; names and lists score high too, so these
    are for a person to look at, not to drop automatically."""
    t = NUMBER.sub("0", sentence)
    pairs = [a + b for a, b in zip(t, t[1:]) if JAPANESE.match(a) and JAPANESE.match(b)]
    if len(pairs) < 12:
        return 0
    return sum(p not in seen for p in pairs) / len(pairs)


def check_stories(r, stories, words, sentences):
    seen = bigram_model(sentences, words)
    odd, missing, spans, mess, blanks = [], Counter(), [], [], []
    for info in stories:
        path = DATA / "stories" / f"{info['id']}.json"
        if not path.exists():
            spans.append({"story": info["title"], "problem": "text file missing"})
            continue
        paras = json.loads(path.read_text(encoding="utf-8"))
        for n, (text, links, readings, *_) in enumerate(paras):
            chars = sorted({c for c in text if odd_char(c)})
            if chars:
                odd.append({"story": info["title"], "paragraph": n, "characters": " ".join(f"{c} U+{ord(c):04X}" for c in chars),
                            "text": text[:60]})
            if "○○" in text or "〇〇" in text:
                blanks.append({"story": info["title"], "paragraph": n, "text": text[:60]})
            end = -1
            for link in links:
                start, length, wid = link[:3]
                if wid not in words:
                    missing[(info["title"], text[start:start + length], wid)] += 1
                if start < end or start + length > len(text):
                    spans.append({"story": info["title"], "paragraph": n, "problem": f"link at {start} overlaps or runs past the end"})
                end = start + length
            for s in SENTENCE_END.split(text):
                score = jumbled(s, seen)
                # Kana-heavy jumbles share more pairs with real text, but they also run on with no end mark.
                if score >= 0.5 or (score >= 0.4 and len(s) >= 20 and not re.search(r"[。！？!?」』]$", s)):
                    mess.append({"story": info["title"], "paragraph": n, "unseen pairs": f"{score:.0%}", "text": s[:70]})
    r.add("story-odd-characters", "Stories", "Story text with damaged characters",
          "Look-alike radicals (⼈ for 人) or vertical-only punctuation (︒ for 。) from the PDF's fonts. "
          "They look right but don't link to any word.", odd)
    r.add("story-word-missing", "Stories", "Story words with no dictionary entry",
          "The story links the word, but words.json doesn't have it, so it can't be tapped or counted.",
          [{"story": t, "word": s, "id": i, "times": n} for (t, s, i), n in missing.most_common()])
    r.add("story-links", "Stories", "Story files with broken links", "", spans)
    r.add("story-jumbled", "Stories", "Story text that may be jumbled",
          "Half or more of the character pairs never appear in real Japanese. Usually side notes, picture labels or "
          "furigana read in the wrong order; place-name lists also land here.", sorted(mess, key=lambda x: x["story"]))
    r.add("story-blanks", "Stories", "Stories with ○○○ blanks",
          "Fill-in-the-blank pages from the book itself (入れて asks you to guess いれて / いいよ). Not damage, "
          "but they look odd without the book's pictures.", blanks)


def check_grammar(r, grammar):
    r.add("grammar-no-examples", "Grammar", "Grammar points with no example", "",
          [{"id": g["id"], "title": g["title"]} for g in grammar if not g["ex"] and g["level"] not in ("start",)])
    r.add("grammar-gap", "Grammar", "Grammar examples with no {marked} part",
          "Each example marks the grammar point as {…} so it can be highlighted and quizzed.",
          [{"id": g["id"], "example": ja} for g in grammar for ja, _ in g["ex"] if "{" not in ja])


def main():
    words, kanji, radicals = load("words.json"), load("kanji.json"), load("radicals.json")
    sentences, lessons, grammar = load("sentences.json"), load("lessons.json"), load("grammar.json")
    strokes = load("strokes.json")
    stories = load("stories.json") if (DATA / "stories.json").exists() else []
    r = Report()
    check_words(r, words, lessons, sentences, kanji)
    check_kanji(r, kanji, words, lessons, strokes)
    check_radicals(r, radicals, kanji, lessons)
    check_sentences(r, sentences, words)
    check_stories(r, stories, words, sentences)
    check_grammar(r, grammar)
    counts = {"words": len(words), "kanji": len(kanji), "radicals": len(radicals), "sentences": len(sentences),
              "stories": len(stories), "grammar points": len(grammar)}
    r.write(counts)
    for k, (area, title, _, items) in r.checks.items():
        if items:
            print(f"{area}: {title}: {len(items)}")
    print(f"Report: {REPORTS / 'content-check.md'}", file=sys.stderr)


if __name__ == "__main__":
    main()
