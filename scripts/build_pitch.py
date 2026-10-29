"""Adds pitch accents to the words in data/words.json, from Kanjium (CC BY-SA 4.0), as data/pitch.json.

Run after build_data.py; needs sources/accents.txt from fetch_sources.py.
Output: {word id: [downstep, ...]}, where the downstep is the mora after which the pitch falls (0 = it never does).
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "sources"
OUT = ROOT / "data"


def kata_to_hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def parse_accents(text):
    """(word, reading in hiragana) -> downsteps, without the part-of-speech notes like (名)."""
    out = {}
    for line in text.splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        word, reading, accents = parts[0], parts[1], parts[2]
        nums = []
        for n in re.sub(r"\([^)]*\)", "", accents).split(","):
            if n.strip().isdigit() and int(n) not in nums:
                nums.append(int(n))
        if nums:
            out.setdefault((word, kata_to_hira(reading)), nums)
    return out


def main():
    accents = parse_accents((SOURCES / "accents.txt").read_text(encoding="utf-8"))
    words = json.loads((OUT / "words.json").read_text(encoding="utf-8"))
    pitch = {}
    for wid, w in words.items():
        r = kata_to_hira(w["r"])
        found = accents.get((w["w"], r)) or accents.get((w["r"], r)) or accents.get((r, r))
        if found:
            pitch[wid] = found
    (OUT / "pitch.json").write_text(json.dumps(pitch, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"pitch accents: {len(pitch)} of {len(words)} words")


if __name__ == "__main__":
    main()
