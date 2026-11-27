"""Writes public/dict/jmdict.json: a short meaning for every JMdict word that Nekko's own word list doesn't have.

Songs (and anything else that meets real-world Japanese) need a meaning for every word, even ones Nekko doesn't
teach. data/words.json covers the words Nekko teaches or links to; this covers the rest of JMdict, so a song word
is never left without a definition when the AI skips it.

Each entry is [id, written forms, readings, meaning, flags, part of speech]:
- written forms and readings are joined with "|" (forms may be empty for kana-only words);
- meaning is the first glosses of the first senses, like "to write; to compose · to draw";
- flags: "c" common, "k" usually written in kana;
- part of speech, short: "v", "adj", "n", "prt", "aux", "exp", "adv", "int", "conj", "pref", "suf" (or ""), so a
  particle can be told from a noun read the same way.

It sits in public/ rather than data/ so it is fetched (and kept offline) only when a page asks for it, instead of
being part of the app's install download.

    python scripts/build_dict.py
"""

import json
import sqlite3
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "sources"
COMMON = {"news1", "ichi1", "spec1", "spec2", "gai1", "news2", "ichi2"}
BAD = ("search-only",)  # rare and old spellings stay: an old song may use them


def short_pos(pos):
    p = pos.lower()
    for key, tag in (("particle", "prt"), ("auxiliary", "aux"), ("expression", "exp"), ("adverb", "adv"),
                     ("interjection", "int"), ("conjunction", "conj"), ("prefix", "pref"), ("suffix", "suf"),
                     ("verb", "v"), ("adjective", "adj"), ("pronoun", "n"), ("noun", "n")):
        if key in p:
            return tag
    return ""


def main():
    con = sqlite3.connect(SOURCES / "jamdict.db")
    have = set(json.loads((ROOT / "data" / "words.json").read_text(encoding="utf-8")))

    forms, kana = defaultdict(list), defaultdict(list)
    common = set()
    kinf, kpri = defaultdict(set), defaultdict(set)
    for kid, t in con.execute("SELECT kid, text FROM KJI"):
        kinf[kid].add(t)
    for kid, t in con.execute("SELECT kid, text FROM KJP"):
        kpri[kid].add(t)
    for fid, idseq, text in con.execute("SELECT ID, idseq, text FROM Kanji ORDER BY ID"):
        if str(idseq) in have or any(b in i for i in kinf[fid] for b in BAD):
            continue
        forms[idseq].append(text)
        if kpri[fid] & COMMON:
            common.add(idseq)
    ninf, npri = defaultdict(set), defaultdict(set)
    for kid, t in con.execute("SELECT kid, text FROM KNI"):
        ninf[kid].add(t)
    for kid, t in con.execute("SELECT kid, text FROM KNP"):
        npri[kid].add(t)
    for kid, idseq, text in con.execute("SELECT ID, idseq, text FROM Kana ORDER BY ID"):
        if str(idseq) in have or any(b in i for i in ninf[kid] for b in BAD):
            continue
        kana[idseq].append(text)
        if npri[kid] & COMMON:
            common.add(idseq)

    sense_of = {}
    for sid, idseq in con.execute("SELECT ID, idseq FROM Sense ORDER BY ID"):
        if idseq in kana:
            sense_of[sid] = idseq
    gloss, pos, misc = defaultdict(list), defaultdict(list), defaultdict(set)
    for sid, t in con.execute("SELECT sid, text FROM SenseGloss WHERE lang = 'eng'"):
        if sid in sense_of:
            gloss[sid].append(t)
    for sid, t in con.execute("SELECT sid, text FROM pos"):
        if sid in sense_of:
            pos[sid].append(t)
    for sid, t in con.execute("SELECT sid, text FROM misc"):
        if sid in sense_of:
            misc[sid].add(t)

    senses = defaultdict(list)  # idseq -> [(glosses, pos tag)]
    usually_kana = set()
    last_pos = {}
    for sid in sorted(sense_of):
        idseq = sense_of[sid]
        tag = next((t for t in map(short_pos, pos[sid]) if t), "") or last_pos.get(idseq, "")
        last_pos[idseq] = tag
        if not senses[idseq] and "word usually written using kana alone" in misc[sid]:
            usually_kana.add(idseq)
        if gloss[sid] and len(senses[idseq]) < 3:
            senses[idseq].append((gloss[sid][:3], tag))

    out = []
    for idseq in sorted(kana):
        if not senses[idseq]:
            continue
        meaning = " · ".join("; ".join(g) for g, _ in senses[idseq])
        flags = ("c" if idseq in common else "") + ("k" if idseq in usually_kana else "")
        tag = senses[idseq][0][1]
        out.append([str(idseq), "|".join(forms[idseq]), "|".join(kana[idseq]), meaning, flags, tag])

    path = ROOT / "public" / "dict" / "jmdict.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"jmdict.json: {len(out)} words Nekko's word list doesn't have, {path.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
