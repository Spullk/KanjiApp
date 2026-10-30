"""Download the open data sources the build uses into sources/.

Run from the repo root:
    python scripts/fetch_sources.py                       # dictionary, JLPT list, KanjiVG
    python scripts/fetch_sources.py --sentences           # also Tatoeba example sentences
    python scripts/fetch_sources.py --refresh-dictionary  # download the current JMdict, KANJIDIC2 and the list of
                                                          # Wikimedia Commons recordings again

Files that already exist are kept, so re-running is cheap.
"""

import argparse
import html
import json
import re
import time
import urllib.parse
import lzma
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from concurrent.futures import ThreadPoolExecutor
import xml.etree.ElementTree as ET
from pathlib import Path

import jmdict_db

SOURCES = Path(__file__).resolve().parent.parent / "sources"

# The current JMdict and KANJIDIC2 from EDRDG (updated about daily), each with a mirror to try second.
JMDICT_URLS = ("http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz", "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz")
KANJIDIC_URLS = ("http://www.edrdg.org/kanjidic/kanjidic2.xml.gz", "http://ftp.edrdg.org/pub/Nihongo/kanjidic2.xml.gz")
# If those can't be reached: a 2021 snapshot of both, packed into one SQLite file by the jamdict project on PyPI.
JAMDICT_DATA = "jamdict-data==1.5"
# A sound dictionary has well over this many written forms; fewer means a broken download.
MIN_FORMS = 100_000
JLPT_URL = "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json"
KANJIALIVE_URL = "https://raw.githubusercontent.com/kanjialive/kanji-data-media/master/language-data/ka_data.csv"
ACCENTS_URL = "https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt"
KANJIVG_URL = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{}.svg"
TATOEBA = {
    "jpn_indices.tar.bz2": "https://downloads.tatoeba.org/exports/jpn_indices.tar.bz2",
    "jpn_sentences.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences.tsv.bz2",
    "eng_sentences.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2",
    "sentences_with_audio.tar.bz2": "https://downloads.tatoeba.org/exports/sentences_with_audio.tar.bz2",
    "jpn-eng_links.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/jpn/jpn-eng_links.tsv.bz2",
}
# Wiktionary's Japanese entries as JSON lines (kaikki.org), for their usage examples.
KAIKKI_URL = "https://kaikki.org/dictionary/Japanese/kaikki.org-dictionary-Japanese.jsonl"
# The Japanese-English Subtitle Corpus (JESC, Stanford, CC BY-SA 4.0): lines from film and TV subtitles, used only
# for words the other sources have too few sentences for.
JESC_URL = "https://nlp.stanford.edu/projects/jesc/data/raw.tar.gz"
# A copy on Hugging Face, as Parquet files, for when Stanford's server doesn't answer. (It moved there from
# Hoshikuzu/JESC.)
JESC_MIRROR = "https://huggingface.co/datasets/nntsuzu/JESC/resolve/main/"
JESC_MIRROR_FILES = "https://huggingface.co/api/datasets/nntsuzu/JESC"
JESC_MIRROR_LIST = "https://datasets-server.huggingface.co/parquet?dataset=nntsuzu/JESC"

JOYO_GRADES = ("1", "2", "3", "4", "5", "6", "8")

# Japanese word recordings by volunteers on Wikimedia Commons (Lingua Libre's, and older ones made for Wiktionary).
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
COMMONS_CATEGORIES = ("Category:Lingua Libre pronunciation-jpn", "Category:Japanese pronunciation")
USER_AGENT = "NekkoBuild/1.0 (https://github.com/Spullk/KanjiApp; open data build for a kanji study app)"


def download(url, dest):
    if dest.exists() and dest.stat().st_size > 0:
        return
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f)
    tmp.rename(dest)


def download_any(urls, dest):
    for url in urls:
        try:
            download(url, dest)
            return
        except OSError as e:
            print(f"  {url}: {e}")
    raise OSError(f"no copy of {dest.name} could be downloaded")


def fetch_dictionary(refresh=False):
    db = SOURCES / "jamdict.db"
    jmdict, kanjidic = SOURCES / "JMdict_e.gz", SOURCES / "kanjidic2.xml.gz"
    if refresh:
        for f in (db, jmdict, kanjidic):
            f.unlink(missing_ok=True)
    if db.exists():
        return db
    try:
        download_any(JMDICT_URLS, jmdict)
        download_any(KANJIDIC_URLS, kanjidic)
        forms = jmdict_db.build(jmdict, kanjidic, db)
        if forms < MIN_FORMS:
            raise ValueError(f"only {forms} written forms")
        return db
    except (OSError, ValueError, ET.ParseError) as e:
        print(f"Live dictionary failed ({e}); using the jamdict-data snapshot")
        for f in (db, jmdict, kanjidic):
            f.unlink(missing_ok=True)
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


def commons(params):
    url = COMMONS_API + "?" + urllib.parse.urlencode({"action": "query", "format": "json", **params})
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except OSError as e:
            if attempt == 4:
                raise
            print(f"  Commons: {e}, trying again")
            time.sleep(2 ** attempt * 5)


def fetch_commons_audio(refresh=False):
    """Lists the Japanese recordings on Wikimedia Commons with their author and licence, in sources/commons_audio.json."""
    out = SOURCES / "commons_audio.json"
    if out.exists() and not refresh:
        return
    files = {}
    for category in COMMONS_CATEGORIES:
        cont = {"continue": ""}
        while cont is not None:
            data = commons({"generator": "categorymembers", "gcmtitle": category, "gcmtype": "file", "gcmlimit": 50,
                            "prop": "imageinfo", "iiprop": "extmetadata",
                            "iiextmetadatafilter": "Artist|LicenseShortName", **cont})
            for page in data.get("query", {}).get("pages", {}).values():
                meta = (page.get("imageinfo") or [{}])[0].get("extmetadata", {})
                artist = re.sub(r"<[^>]+>", "", html.unescape(meta.get("Artist", {}).get("value", ""))).strip()
                licence = meta.get("LicenseShortName", {}).get("value", "")
                if page["title"].startswith("File:") and licence:
                    files[page["title"][5:]] = [artist, licence]
            cont = data.get("continue")
            time.sleep(0.2)
        print(f"Commons: {category}: {len(files)} recordings so far")
    out.write_text(json.dumps(files, ensure_ascii=False), encoding="utf-8")


def fetch_sentences():
    out = SOURCES / "tatoeba"
    out.mkdir(exist_ok=True)
    for name, url in TATOEBA.items():
        download(url, out / name)
        print(f"Tatoeba: {name}")
    try:
        download(KAIKKI_URL, SOURCES / "kaikki-japanese.jsonl")
        print("Wiktionary examples: ok")
    except OSError as e:
        print(f"Wiktionary examples: skipped ({e})")
    try:
        fetch_jesc()
        print("Subtitle sentences (JESC): ok")
    except (OSError, ValueError, KeyError) as e:
        print(f"Subtitle sentences (JESC): skipped ({e})")


def fetch_jesc():
    folder = SOURCES / "jesc"
    folder.mkdir(exist_ok=True)
    if any(folder.glob("*.parquet")):
        return
    try:
        download(JESC_URL, folder / "raw.tar.gz")
        return
    except OSError as e:
        print(f"  {JESC_URL}: {e}; trying the Hugging Face copy")
    urls = []
    try:
        with urllib.request.urlopen(JESC_MIRROR_FILES, timeout=120) as r:
            urls = sorted(JESC_MIRROR + f["rfilename"] for f in json.load(r)["siblings"]
                          if f["rfilename"].endswith(".parquet") and "train" in f["rfilename"])
    except (OSError, ValueError, KeyError) as e:
        print(f"  {JESC_MIRROR_FILES}: {e}")
    if not urls:
        # The data may not be stored as Parquet; the datasets server lists its own Parquet copy then.
        with urllib.request.urlopen(JESC_MIRROR_LIST, timeout=120) as r:
            urls = sorted(f["url"] for f in json.load(r)["parquet_files"] if f.get("split") == "train")
    if not urls:
        raise ValueError("the Hugging Face copy lists no files")
    print(f"  Hugging Face copy: {len(urls)} files")
    for i, url in enumerate(urls):
        download(url, folder / f"{i:03d}.parquet")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sentences", action="store_true", help="also download Tatoeba sentences (~100 MB)")
    parser.add_argument("--refresh-dictionary", action="store_true", help="download the current dictionary again")
    args = parser.parse_args()

    SOURCES.mkdir(exist_ok=True)
    db = fetch_dictionary(args.refresh_dictionary)
    print("Dictionary: ok")
    download(JLPT_URL, SOURCES / "kanji-data.json")
    print("JLPT levels: ok")
    download(KANJIALIVE_URL, SOURCES / "ka_data.csv")
    print("Kanji alive audio list: ok")
    download(ACCENTS_URL, SOURCES / "accents.txt")
    print("Pitch accents: ok")
    fetch_kanjivg(db)
    try:
        fetch_commons_audio(args.refresh_dictionary)
    except OSError as e:
        print(f"Commons recordings: skipped ({e})")
    if args.sentences:
        fetch_sentences()


if __name__ == "__main__":
    main()
