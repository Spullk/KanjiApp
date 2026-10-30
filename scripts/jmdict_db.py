"""Turns the live JMdict and KANJIDIC2 files from EDRDG into sources/jamdict.db.

The build scripts read the dictionary from SQLite tables laid out like the jamdict-data package (a 2021
snapshot). This writes the same tables, with the same columns and the same meaning, from the current files, so
the data can follow the live dictionary. Only the tables and columns the build scripts use are written.

    python scripts/jmdict_db.py JMdict_e.gz kanjidic2.xml.gz sources/jamdict.db
"""

import gzip
import sqlite3
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SCHEMA = """
CREATE TABLE character (ID INTEGER PRIMARY KEY, literal TEXT, stroke_count INTEGER, grade TEXT, freq TEXT);
CREATE TABLE rm_group (ID INTEGER PRIMARY KEY, cid INTEGER);
CREATE TABLE reading (gid INTEGER, r_type TEXT, value TEXT);
CREATE TABLE meaning (gid INTEGER, value TEXT, m_lang TEXT);
CREATE TABLE Kanji (ID INTEGER PRIMARY KEY, idseq INTEGER, text TEXT);
CREATE TABLE KJI (kid INTEGER, text TEXT);
CREATE TABLE KJP (kid INTEGER, text TEXT);
CREATE TABLE Kana (ID INTEGER PRIMARY KEY, idseq INTEGER, text TEXT, nokanji INTEGER);
CREATE TABLE KNR (kid INTEGER, text TEXT);
CREATE TABLE KNI (kid INTEGER, text TEXT);
CREATE TABLE KNP (kid INTEGER, text TEXT);
CREATE TABLE Sense (ID INTEGER PRIMARY KEY, idseq INTEGER);
CREATE TABLE stagk (sid INTEGER, text TEXT);
CREATE TABLE pos (sid INTEGER, text TEXT);
CREATE TABLE misc (sid INTEGER, text TEXT);
CREATE TABLE SenseGloss (sid INTEGER, lang TEXT, text TEXT);
"""

XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"


def texts(el, tag):
    return [(c.text or "").strip() for c in el.findall(tag)]


def load_jmdict(con, path):
    kid = kana_id = sid = 0
    # JMdict's entities (&n; and so on) are declared in its own DTD, which the parser expands to their
    # descriptions ("noun (common) (futsuumeishi)"), the same text jamdict-data stores.
    for _, entry in ET.iterparse(gzip.open(path), events=("end",)):
        if entry.tag != "entry":
            continue
        idseq = int(entry.findtext("ent_seq"))
        for k in entry.findall("k_ele"):
            kid += 1
            con.execute("INSERT INTO Kanji VALUES (?, ?, ?)", (kid, idseq, k.findtext("keb")))
            con.executemany("INSERT INTO KJI VALUES (?, ?)", [(kid, t) for t in texts(k, "ke_inf")])
            con.executemany("INSERT INTO KJP VALUES (?, ?)", [(kid, t) for t in texts(k, "ke_pri")])
        for r in entry.findall("r_ele"):
            kana_id += 1
            con.execute("INSERT INTO Kana VALUES (?, ?, ?, ?)",
                        (kana_id, idseq, r.findtext("reb"), 1 if r.find("re_nokanji") is not None else 0))
            con.executemany("INSERT INTO KNR VALUES (?, ?)", [(kana_id, t) for t in texts(r, "re_restr")])
            con.executemany("INSERT INTO KNI VALUES (?, ?)", [(kana_id, t) for t in texts(r, "re_inf")])
            con.executemany("INSERT INTO KNP VALUES (?, ?)", [(kana_id, t) for t in texts(r, "re_pri")])
        for s in entry.findall("sense"):
            sid += 1
            con.execute("INSERT INTO Sense VALUES (?, ?)", (sid, idseq))
            con.executemany("INSERT INTO stagk VALUES (?, ?)", [(sid, t) for t in texts(s, "stagk")])
            con.executemany("INSERT INTO pos VALUES (?, ?)", [(sid, t) for t in texts(s, "pos")])
            con.executemany("INSERT INTO misc VALUES (?, ?)", [(sid, t) for t in texts(s, "misc")])
            con.executemany("INSERT INTO SenseGloss VALUES (?, ?, ?)",
                            [(sid, g.get(XML_LANG, "eng"), (g.text or "").strip()) for g in s.findall("gloss")])
        entry.clear()
    return kid


def load_kanjidic(con, path):
    cid = gid = 0
    for _, ch in ET.iterparse(gzip.open(path), events=("end",)):
        if ch.tag != "character":
            continue
        cid += 1
        misc = ch.find("misc")
        strokes = misc.findtext("stroke_count") if misc is not None else None
        con.execute("INSERT INTO character VALUES (?, ?, ?, ?, ?)", (
            cid, ch.findtext("literal"), int(strokes) if strokes else None,
            misc.findtext("grade") if misc is not None else None,
            misc.findtext("freq") if misc is not None else None))
        for group in ch.iterfind("reading_meaning/rmgroup"):
            gid += 1
            con.execute("INSERT INTO rm_group VALUES (?, ?)", (gid, cid))
            con.executemany("INSERT INTO reading VALUES (?, ?, ?)",
                            [(gid, r.get("r_type"), r.text) for r in group.findall("reading")])
            # English meanings have no m_lang attribute; jamdict-data stores them with an empty one.
            con.executemany("INSERT INTO meaning VALUES (?, ?, ?)",
                            [(gid, m.text, m.get("m_lang", "")) for m in group.findall("meaning")])
        ch.clear()
    return cid


def build(jmdict, kanjidic, out):
    out = Path(out)
    tmp = out.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    con = sqlite3.connect(tmp)
    con.executescript(SCHEMA)
    forms = load_jmdict(con, jmdict)
    chars = load_kanjidic(con, kanjidic)
    con.commit()
    con.close()
    tmp.replace(out)
    print(f"Dictionary: {forms} written forms, {chars} kanji")
    return forms


if __name__ == "__main__":
    build(*sys.argv[1:4])
