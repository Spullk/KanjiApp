# Nekko content check

Written by `scripts/check_content.py` after every data build. Each section is one kind of problem, with up to 25 examples; `content-check.json` next to this file has every item.

Checked: 21,903 words, 2,136 kanji, 372 radicals, 44,227 sentences, 115 stories, 223 grammar points.

| Area | Problem | Count |
|---|---|---:|
| Words | [Lesson words with no dictionary entry](#lesson-word-missing) | 0 |
| Words | [Words with no meaning](#word-no-meaning) | 0 |
| Words | [Lesson words with no example sentence](#lesson-word-no-sentence) | 179 |
| Words | [Words pointing at sentences that don't exist](#word-sentence-missing) | 0 |
| Words | [Lesson words whose first meaning is hard to use](#lesson-word-weak-meaning) | 0 |
| Words | [Lesson words whose furigana doesn't spell the word](#lesson-word-furigana) | 0 |
| Words | [The same word taught twice](#lesson-word-duplicate) | 0 |
| Words | [Lesson words that may be the wrong dictionary entry](#lesson-word-rarer-homophone) | 0 |
| Words | [Junk words still in a lesson](#lesson-word-junk) | 0 |
| Words | [Single-kana words outside the lessons](#word-lone-kana) | 12 |
| Kanji | [Kanji with no meaning](#kanji-no-meaning) | 0 |
| Kanji | [Kanji with no reading](#kanji-no-reading) | 0 |
| Kanji | [Kanji with fewer than 2 example words](#kanji-no-words) | 3 |
| Kanji | [Kanji pointing at words that don't exist](#kanji-word-missing) | 0 |
| Kanji | [Kanji with no stroke order](#kanji-no-strokes) | 0 |
| Kanji | [Kanji in no lesson](#kanji-not-taught) | 0 |
| Kanji | [Lessons listing kanji that don't exist](#lesson-kanji-missing) | 0 |
| Kanji | [On readings with no example word](#kanji-reading-no-word) | 294 |
| Radicals | [Radicals without exactly one name](#radical-name) | 0 |
| Radicals | [Radicals no kanji uses](#radical-unused) | 0 |
| Radicals | [Radicals pointing at kanji that don't exist](#radical-used-in-missing) | 0 |
| Radicals | [Radicals in no lesson](#radical-not-taught) | 0 |
| Sentences | [Sentences with a missing or untranslated English line](#sentence-translation) | 0 |
| Sentences | [Sentences with damaged text](#sentence-odd-text) | 0 |
| Sentences | [Sentences linking to missing words](#sentence-bad-link) | 0 |
| Sentences | [The same Japanese sentence more than once](#sentence-duplicate) | 0 |
| Stories | [Story text with damaged characters](#story-odd-characters) | 0 |
| Stories | [Story words with no dictionary entry](#story-word-missing) | 0 |
| Stories | [Story files with broken links](#story-links) | 0 |
| Stories | [Story text that may be jumbled](#story-jumbled) | 1 |
| Stories | [Stories with ○○○ blanks](#story-blanks) | 5 |
| Grammar | [Grammar points with no example](#grammar-no-examples) | 0 |
| Grammar | [Grammar examples with no {marked} part](#grammar-gap) | 0 |

<a id="lesson-word-missing"></a>
## Words: Lesson words with no dictionary entry (0)

A lesson lists a word id that words.json doesn't have, so the card can't show.

None. 🎉

<a id="word-no-meaning"></a>
## Words: Words with no meaning (0)

No sense has an English gloss, so the card has nothing to ask for.

None. 🎉

<a id="lesson-word-no-sentence"></a>
## Words: Lesson words with no example sentence (179)

Taught words should have at least one example sentence. Tatoeba, Wiktionary and JESC had none for these.

- 1 · 本木 (もとき) · original stock · 1523260
- 2 · 三十日 (みそか) · last day of the month · 1604510
- 6 · 二百十日 (にひゃくとおか) · 210th day after spring begins (typhoon season) · 1463030
- 7 · 上田 (じょうでん) · high rice field · 1353990
- 13 · 貸出用 (かしだしよう) · circulation or lending (e.g. library books) · 1949630
- 18 · 元首 (げんしゅ) · sovereign · 1260870
- 22 · 大店 (おおだな) · large store · 1862050
- 24 · 字 (あざ) · section of village · 1315120
- 26 · 上っ調子 (うわっちょうし) · flippant · 1352450
- 26 · 室町 (むろまち) · Muromachi period (1336-1573) · 1608060
- 28 · 今秋 (こんしゅう) · this autumn · 1289210
- 30 · 米飯 (べいはん) · cooked rice · 1509010
- 33 · 実兄 (じっけい) · biological older brother · 1320960
- 35 · 要 (かなめ) · pivot · 1609600
- 35 · 一期 (いちご) · one's whole life · 1161690
- 38 · 多角 (たかく) · many-sided · 1610200
- 39 · 告別 (こくべつ) · farewell · 1286080
- 39 · 面 (おもて) · face · 1584680
- 40 · 利払い (りばらい) · interest payment · 1549650
- 41 · 在りし日 (ありしひ) · past days · 1741040
- 41 · 決め球 (きめだま) · winning pitch · 1630640
- 42 · 減反 (げんたん) · reduction (of crop size) · 1263310
- 42 · 冊子 (さっし) · book · 1298530
- 45 · 大路 (おおじ) · main street (esp. in a capital) · 1786960
- 46 · 構図 (こうず) · composition (of painting) · 1279720
- …and 154 more

<a id="word-sentence-missing"></a>
## Words: Words pointing at sentences that don't exist (0)

The word lists a sentence id that sentences.json doesn't have.

None. 🎉

<a id="lesson-word-weak-meaning"></a>
## Words: Lesson words whose first meaning is hard to use (0)

The first meaning is what the card asks for. These are a cross-reference, contain markup, or run over 60 characters.

None. 🎉

<a id="lesson-word-furigana"></a>
## Words: Lesson words whose furigana doesn't spell the word (0)

The furigana pieces put together should give back the word exactly.

None. 🎉

<a id="lesson-word-duplicate"></a>
## Words: The same word taught twice (0)

Two lesson words share the spelling and the first meaning, so they'd be two cards for one thing.

None. 🎉

<a id="lesson-word-rarer-homophone"></a>
## Words: Lesson words that may be the wrong dictionary entry (0)

Another entry written and read the same way is more common, so the lesson may teach the rare meaning (ロケット as "locket" instead of "rocket").

None. 🎉

<a id="lesson-word-junk"></a>
## Words: Junk words still in a lesson (0)

Words marked junk (a wrong dictionary match) shouldn't be taught.

None. 🎉

<a id="word-lone-kana"></a>
## Words: Single-kana words outside the lessons (12)

A lone kana as a word is usually a wrong dictionary match (ト as "note G"). Check these aren't shown as cards.

- が · indicates the subject of a sentence · 2028930
- で · at · 2028980
- ね · right? · 2029080
- わ · indicates emotion or admiration · 2029100
- な · don't · 2029110
- お · oh! (expression of slight surprise) · 2089690
- え · eh? · 2122310
- ん · yes · 2139720
- べ · word used at sentence-end (like a particle) to indicate speculation, volition or invitation · 2213460
- て · and · 2654270
- ザ · the · 1058900
- ト · 7th in a sequence denoted by the iroha system · 2029780

<a id="kanji-no-meaning"></a>
## Kanji: Kanji with no meaning (0)

KANJIDIC gave no English meaning.

None. 🎉

<a id="kanji-no-reading"></a>
## Kanji: Kanji with no reading (0)

No on or kun reading to teach.

None. 🎉

<a id="kanji-no-words"></a>
## Kanji: Kanji with fewer than 2 example words (3)

Each kanji should show a few words that use it.

- 朕 · 1
- 憬 · 1
- 塡 · 1

<a id="kanji-word-missing"></a>
## Kanji: Kanji pointing at words that don't exist (0)

A kanji's word list has an id that words.json doesn't have.

None. 🎉

<a id="kanji-no-strokes"></a>
## Kanji: Kanji with no stroke order (0)

KanjiVG has no strokes for these.

None. 🎉

<a id="kanji-not-taught"></a>
## Kanji: Kanji in no lesson (0)

Every Joyo kanji should be in a lesson.

None. 🎉

<a id="lesson-kanji-missing"></a>
## Kanji: Lessons listing kanji that don't exist (0)

The lesson can't show these.

None. 🎉

<a id="kanji-reading-no-word"></a>
## Kanji: On readings with no example word (294)

Kun readings often have no word of their own, but an on reading with none can't be shown in use.

- 圧 · エン
- 扱 · ソウ
- 扱 · キュウ
- 闇 · オン
- 壱 · イツ
- 稲 · テ
- 茨 · シ
- 茨 · ジ
- 咽 · エン
- 臼 · グ
- 唄 · バイ
- 餌 · ニ
- 栄 · ヨウ
- 怨 · ウン
- 応 · ヨウ
- 臆 · ヨク
- 俺 · エン
- 価 · ケ
- 可 · コク
- 夏 · ガ
- 画 · カイ
- 塊 · ケ
- 懐 · エ
- 崖 · ゲ
- 崖 · ギ
- …and 269 more

<a id="radical-name"></a>
## Radicals: Radicals without exactly one name (0)

Each radical should have exactly one name (Lucas's rule).

None. 🎉

<a id="radical-unused"></a>
## Radicals: Radicals no kanji uses (0)

A radical in a lesson that no taught kanji contains doesn't help learn anything.

None. 🎉

<a id="radical-used-in-missing"></a>
## Radicals: Radicals pointing at kanji that don't exist (0)



None. 🎉

<a id="radical-not-taught"></a>
## Radicals: Radicals in no lesson (0)



None. 🎉

<a id="sentence-translation"></a>
## Sentences: Sentences with a missing or untranslated English line (0)

The English is empty or still has Japanese in it.

None. 🎉

<a id="sentence-odd-text"></a>
## Sentences: Sentences with damaged text (0)

Broken characters or leftover HTML.

None. 🎉

<a id="sentence-bad-link"></a>
## Sentences: Sentences linking to missing words (0)

A tappable word in the sentence points at nothing.

None. 🎉

<a id="sentence-duplicate"></a>
## Sentences: The same Japanese sentence more than once (0)

Usually harmless (different sources), listed so they can be merged.

None. 🎉

<a id="story-odd-characters"></a>
## Stories: Story text with damaged characters (0)

Look-alike radicals (⼈ for 人) or vertical-only punctuation (︒ for 。) from the PDF's fonts. They look right but don't link to any word.

None. 🎉

<a id="story-word-missing"></a>
## Stories: Story words with no dictionary entry (0)

The story links the word, but words.json doesn't have it, so it can't be tapped or counted.

None. 🎉

<a id="story-links"></a>
## Stories: Story files with broken links (0)



None. 🎉

<a id="story-jumbled"></a>
## Stories: Story text that may be jumbled (1)

Half or more of the character pairs never appear in real Japanese. Usually side notes, picture labels or furigana read in the wrong order; place-name lists also land here.

- 北海道 · 1 · 59% · 根室県札幌県根室札幌函館県函館実は、昔北海道は「札幌県」

<a id="story-blanks"></a>
## Stories: Stories with ○○○ blanks (5)

Fill-in-the-blank pages from the book itself (入れて asks you to guess いれて / いいよ). Not damage, but they look odd without the book's pictures.

- 入れて · 3 · 「わたしも、○○○。」
- 入れて · 4 · 「うん、○○○。」
- 入れて · 6 · 「○○も、○○○。」
- 入れて · 7 · 「うん、○○○。」
- 稲むらの火 · 6 · でも、儀兵衛はなにも言わなかった。儀兵衛は四〇〇人の村の人のことばかり考えていたのだ。忠は泣きながら、家の中に入った。儀

<a id="grammar-no-examples"></a>
## Grammar: Grammar points with no example (0)



None. 🎉

<a id="grammar-gap"></a>
## Grammar: Grammar examples with no {marked} part (0)

Each example marks the grammar point as {…} so it can be highlighted and quizzed.

None. 🎉
