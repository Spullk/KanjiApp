"""Download the open data sources the build uses into sources/.

Run from the repo root:
    python scripts/fetch_sources.py              # dictionary, JLPT list, KanjiVG
    python scripts/fetch_sources.py --sentences  # also Tatoeba example sentences

Files that already exist are kept, so re-running is cheap.
"""

import argparse
import lzma
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SOURCES = Path(__file__).resolve().parent.parent / "sources"

# JMdict + KANJIDIC2 packed into one SQLite file, published on PyPI by the jamdict project.
JAMDICT_DATA = "jamdict-data==1.5"
JLPT_URL = "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json"
KANJIVG_URL = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{}.svg"
TATOEBA = {
    "jpn_indices.tar.bz2": "https://downloads.tatoeba.org/exports/jpn_indices.tar.bz2",
    "jpn_sentences.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences.tsv.bz2",
    "eng_sentences.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2",
}

JOYO_GRADES = ("1", "2", "3", "4", "5", "6", "8")


def download(url, dest):
    if dest.exists() and dest.stat().st_size > 0:
        return
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f)
    tmp.rename(dest)


def fetch_dictionary():
    db = SOURCES / "jamdict.db"
    if db.exists():
        return db
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            [sys.executable, "-m", "pip", "download", "--no-deps", "--no-binary", ":all:",
             "-d", tmp, "-q", JAMDICT_DATA],
            check=True,
        )
        sdist = next(Path(tmp).glob("jamdict_data-*.tar.gz"))
        with tarfile.open(sdist) as tar:
            member = next(m for m in tar.getmembers() if m.name.endswith("jamdict.db.xz"))
            with tar.extractfile(member) as xz, lzma.open(xz) as src, open(db, "wb") as out:
                shutil.copyfileobj(src, out)
    return db


def fetch_kanjivg(db):
    out = SOURCES / "kanjivg"
    out.mkdir(exist_ok=True)
    con = sqlite3.connect(db)
    grades = ",".join("?" * len(JOYO_GRADES))
    joyo = [r[0] for r in con.execute(f"SELECT literal FROM character WHERE grade IN ({grades})", JOYO_GRADES)]
    names = ["%05x" % ord(k) for k in joyo]
    with ThreadPoolExecutor(16) as pool:
        list(pool.map(lambda n: download(KANJIVG_URL.format(n), out / f"{n}.svg"), names))
    print(f"KanjiVG: {len(names)} files")


def fetch_sentences():
    out = SOURCES / "tatoeba"
    out.mkdir(exist_ok=True)
    for name, url in TATOEBA.items():
        download(url, out / name)
        print(f"Tatoeba: {name}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sentences", action="store_true", help="also download Tatoeba sentences (~100 MB)")
    args = parser.parse_args()

    SOURCES.mkdir(exist_ok=True)
    db = fetch_dictionary()
    print("Dictionary: ok")
    download(JLPT_URL, SOURCES / "kanji-data.json")
    print("JLPT levels: ok")
    fetch_kanjivg(db)
    if args.sentences:
        fetch_sentences()


if __name__ == "__main__":
    main()
