# Nekko 根っこ

A personal kanji and vocabulary trainer in the spirit of WaniKani, with Anki-style spaced repetition. Every word links to its kanji, every kanji to its readings, parts, sound family and words, so you can wander the whole web from anywhere.

## App

A Preact + Vite web app that installs to a phone home screen and works offline (the dictionary is cached on first load, about 3 MB gzipped).

```sh
npm install
npm run dev     # local dev server
npm test        # unit tests
npm run build   # static site in dist/
```

The **App** GitHub Action builds every PR and publishes `main` to GitHub Pages. Pages has to be switched on once: repo **Settings → Pages → Source: GitHub Actions**.

## Phone apps

The iPhone and Android apps are the same web app wrapped with [Capacitor](https://capacitorjs.com/), in `ios/` and `android/`. On top of the website they keep progress in a file in the app's own storage, send a daily review reminder (Progress → Settings → Reminders), tap the phone's haptics when you grade, use the phone's Japanese voice, and share backups through the share sheet.

```sh
npm run app       # build the website and copy it into both apps
npm run ios       # ...then open the iPhone project in Xcode (needs a Mac)
npm run android   # ...then open the Android project in Android Studio
```

The **Mobile** GitHub Action builds both apps on every PR, so a Mac isn't needed to check they compile. Its Android run leaves an installable debug APK under the run's **Artifacts**. App icons and splash screens come from `assets/` (`npx capacitor-assets generate`).

## Data

`data/` holds everything the app needs, generated from open sources by `scripts/`.

| File | What's in it |
| --- | --- |
| `kanji.json` | All 2,136 Jōyō kanji: meanings, every on/kun reading with the words that use it (most-used reading first), special readings (今日 きょう), parts, sound component, kanji that contain it, kanji that share its sound component, JLPT level, lesson |
| `radicals.json` | Components that aren't Jōyō kanji themselves (氵, 亻, 吾…), with meanings and the kanji that use them |
| `words.json` | ~16k common words: reading, furigana split per kanji, English senses, example sentence ids |
| `sentences.json` | Tatoeba example sentences with English, plus the position of each known word so it can be linked |
| `lessons.json` | The study order: 206 lessons of ~10 kanji, with the radicals and review words each one introduces |
| `strokes.json` | KanjiVG stroke paths per kanji, in stroke order |
| `meta.json` | Counts and source credits |

### Study order

Kanji go roughly from JLPT N5 to N1, then the remaining Jōyō kanji, most frequent first. Two things pull kanji out of that order, like WaniKani does:

- A kanji's parts come first, so 青 is learned before 晴.
- Kanji that share a sound component are pulled together (青 brings 情, 精 and 静 into the same lesson), as long as they are at most one JLPT level harder.

There is no level locking; the order is only a suggestion of what to learn next.

### Rebuilding

```sh
python scripts/fetch_sources.py --sentences   # downloads into sources/ (not committed)
python scripts/build_data.py
```

Leave out `--sentences` to skip the ~100 MB Tatoeba download; the build then writes no sentences. The **Build data** GitHub Action runs both steps with sentences whenever `scripts/` changes and commits the result.

## License

Nekko's code is free software under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). Anyone can use, change and share it, but if they share a changed version, or run one as a website or app for other people, they have to publish their changed source under the same license. Nobody can take Nekko, tweak it and close it up.

Copyright (C) 2026 Spullk

### Data

The AGPL covers the code. The data the app is built from belongs to the projects below and keeps their licenses, and the credits are also shown in the app under Settings → Credits.

- [JMdict and KANJIDIC2](https://www.edrdg.org/) by the Electronic Dictionary Research and Development Group, CC BY-SA 4.0 (via [jamdict-data](https://pypi.org/project/jamdict-data/))
- [KanjiVG](https://kanjivg.tagaini.net/) by Ulrich Apel and contributors, CC BY-SA 3.0
- JLPT levels from Jonathan Waller's lists, via [kanji-data](https://github.com/davidluzgouveia/kanji-data) (MIT)
- Example sentences and their recordings from the [Tatoeba Project](https://tatoeba.org/), CC BY 2.0 FR (recordings under each speaker's own license)
- More example sentences from Wiktionary contributors, via [kaikki.org](https://kaikki.org/), CC BY-SA 4.0
- Film and TV subtitle sentences from [JESC](https://nlp.stanford.edu/projects/jesc/) (Pryzant et al., Stanford), CC BY-SA 4.0
- Pitch accents from [Kanjium](https://github.com/mifunetoshiro/kanjium), CC BY-SA 4.0
- Word recordings from [Kanji alive](https://kanjialive.com/), CC BY 4.0, and from volunteers on [Wikimedia Commons](https://commons.wikimedia.org/) and [Lingua Libre](https://lingualibre.org/) (each recording's author and license are listed with it); words without a recording use the device's Japanese text-to-speech voice, marked with a robot icon
- Stories from [Aozora Bunko](https://www.aozora.gr.jp/) (public domain) and the free [Tadoku](https://tadoku.org/japanese/) readers by NPO多言語多読, CC BY-NC-ND 4.0 (shown unchanged, not for commercial use)
- Review fonts from [Google Fonts](https://fonts.google.com/), SIL Open Font License

Because of the share-alike licenses, the generated `data/` is CC BY-SA 4.0, except the stories in `data/stories/`: the Aozora ones (`a*.json`) are public domain and the Tadoku ones (`t*.json`) stay CC BY-NC-ND 4.0.
