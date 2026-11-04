# Nekko content check

Written by `scripts/check_content.py` after every data build. Each section is one kind of problem, with up to 25 examples; `content-check.json` next to this file has every item.

Checked: 21,507 words, 2,136 kanji, 372 radicals, 46,129 sentences, 115 stories, 132 grammar points.

| Area | Problem | Count |
|---|---|---:|
| Words | [Lesson words with no dictionary entry](#lesson-word-missing) | 0 |
| Words | [Words with no meaning](#word-no-meaning) | 0 |
| Words | [Lesson words with no example sentence](#lesson-word-no-sentence) | 279 |
| Words | [Words pointing at sentences that don't exist](#word-sentence-missing) | 0 |
| Words | [Lesson words whose first meaning is hard to use](#lesson-word-weak-meaning) | 16 |
| Words | [Lesson words whose furigana doesn't spell the word](#lesson-word-furigana) | 0 |
| Words | [The same word taught twice](#lesson-word-duplicate) | 0 |
| Words | [Junk words still in a lesson](#lesson-word-junk) | 0 |
| Words | [Single-kana words outside the lessons](#word-lone-kana) | 5 |
| Kanji | [Kanji with no meaning](#kanji-no-meaning) | 0 |
| Kanji | [Kanji with no reading](#kanji-no-reading) | 0 |
| Kanji | [Kanji with fewer than 2 example words](#kanji-no-words) | 3 |
| Kanji | [Kanji pointing at words that don't exist](#kanji-word-missing) | 0 |
| Kanji | [Kanji with no stroke order](#kanji-no-strokes) | 0 |
| Kanji | [Kanji in no lesson](#kanji-not-taught) | 0 |
| Kanji | [Lessons listing kanji that don't exist](#lesson-kanji-missing) | 0 |
| Kanji | [On readings with no example word](#kanji-reading-no-word) | 298 |
| Radicals | [Radicals without exactly one name](#radical-name) | 0 |
| Radicals | [Radicals no kanji uses](#radical-unused) | 12 |
| Radicals | [Radicals pointing at kanji that don't exist](#radical-used-in-missing) | 0 |
| Radicals | [Radicals in no lesson](#radical-not-taught) | 0 |
| Sentences | [Sentences with a missing or untranslated English line](#sentence-translation) | 0 |
| Sentences | [Sentences with damaged text](#sentence-odd-text) | 3 |
| Sentences | [Sentences linking to missing words](#sentence-bad-link) | 0 |
| Sentences | [The same Japanese sentence more than once](#sentence-duplicate) | 12 |
| Stories | [Story text with damaged characters](#story-odd-characters) | 35 |
| Stories | [Story words with no dictionary entry](#story-word-missing) | 686 |
| Stories | [Story files with broken links](#story-links) | 0 |
| Stories | [Story text that may be jumbled](#story-jumbled) | 23 |
| Stories | [Stories with ○○○ blanks](#story-blanks) | 6 |
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
## Words: Lesson words with no example sentence (279)

Taught words should have at least one example sentence. Tatoeba, Wiktionary and JESC had none for these.

- 1 · 本木 (もとき) · original stock · 1523260
- 1 · ください · please (give me) · 1184270
- 2 · 三十日 (みそか) · last day of the month · 1604510
- 2 · かける · to hang up (e.g. a coat, a picture on the wall) · 1207610
- 5 · どう · how · 1008910
- 6 · 二百十日 (にひゃくとおか) · 210th day (from the first day of spring according to the lunar calendar) · 1463030
- 7 · 上田 (じょうでん) · high rice field · 1353990
- 10 · すぐに · immediately · 1430620
- 10 · つける · to turn on · 1610400
- 12 · 開き (ひらき) · opening · 1989500
- 12 · 千代 (ちよ) · thousand years · 1581030
- 13 · 貸出用 (かしだしよう) · circulation or lending (e.g. library books) · 1949630
- 13 · ボタン · button (clothing) · 1123880
- 16 · そうして · and · 1612860
- 17 · どうして · how · 1466940
- 18 · 元首 (げんしゅ) · sovereign · 1260870
- 19 · つまらない · dull · 1008190
- 21 · 急いで (いそいで) · hurriedly · 1228570
- 22 · 大店 (おおだな) · large store · 1862050
- 23 · または · or · 1524990
- 23 · できるだけ · as much as one can · 1340460
- 24 · 字 (あざ) · section of village · 1315120
- 24 · こう · in this way · 1004310
- 24 · すり · pickpocket · 1567450
- 25 · 買い占め (かいしめ) · buying up of goods · 1589670
- …and 254 more

<a id="word-sentence-missing"></a>
## Words: Words pointing at sentences that don't exist (0)

The word lists a sentence id that sentences.json doesn't have.

None. 🎉

<a id="lesson-word-weak-meaning"></a>
## Words: Lesson words whose first meaning is hard to use (16)

The first meaning is what the card asks for. These are a cross-reference, contain markup, or run over 60 characters.

- 6 · 二百十日 (にひゃくとおか) · 210th day (from the first day of spring according to the lunar calendar) · very long
- 9 · 天下り (あまくだり) · retiring high-ranking government officials taking a lucrative job in a private or semi-private corporation · very long
- 20 · 下町 (したまち) · low-lying part of a city (usu. containing shops, factories, etc.) · very long
- 33 · 関西 (かんさい) · Kansai (region comprising Kyoto, Osaka, Kobe and surrounding prefectures) · very long
- 36 · 受験 (じゅけん) · taking an examination (esp. for entrance to a school or university) · very long
- 40 · 参院 (さんいん) · House of Councillors (upper house of the National Diet of Japan) · very long
- 78 · 偏差値 (へんさち) · deviation value (usu. scaled to mean of 50, standard deviation of 10, and often used for academic grades) · very long
- 83 · 豆 (まめ) · legume (esp. edible legumes or their seeds, e.g. beans, peas, pulses) · very long
- 116 · 衆院 (しゅういん) · House of Representatives (lower house of the National Diet of Japan) · very long
- 149 · 侍 (さむらい) · warrior (esp. of military retainers of daimyos in the Edo period) · very long
- 157 · 鶴 (つる) · crane (any bird of the family Gruidae, esp. the red-crowned crane, Grus japonensis) · very long
- 168 · 幼稚園 (ようちえん) · kindergarten (in Japan, non-compulsory education from age 3 until primary school) · very long
- 177 · 碑 (いしぶみ) · stone monument bearing an inscription (esp. memorial for future generations) · very long
- 184 · 長唄 (ながうた) · long epic song with shamisen accompaniment (developed in Edo in the early 17th century) · very long
- 192 · 慌てる (あわてる) · to become confused (disconcerted, disorganized, disorganised) · very long
- 205 · 覚醒剤 (かくせいざい) · stimulant (e.g. psychoactive drugs like methamphetamine, ritalin, etc.) · very long

<a id="lesson-word-furigana"></a>
## Words: Lesson words whose furigana doesn't spell the word (0)

The furigana pieces put together should give back the word exactly.

None. 🎉

<a id="lesson-word-duplicate"></a>
## Words: The same word taught twice (0)

Two lesson words share the spelling and the first meaning, so they'd be two cards for one thing.

None. 🎉

<a id="lesson-word-junk"></a>
## Words: Junk words still in a lesson (0)

Words marked junk (a wrong dictionary match) shouldn't be taught.

None. 🎉

<a id="word-lone-kana"></a>
## Words: Single-kana words outside the lessons (5)

A lone kana as a word is usually a wrong dictionary match (ト as "note G"). Check these aren't shown as cards.

- ザ · the · 1058900
- べ · word used at sentence-end (like a particle) to indicate speculation, volition or invitation · 2213460
- て · and · 2654270
- ト · 7th in a sequence denoted by the iroha system · 2029780
- ん · yes · 2139720

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
## Kanji: On readings with no example word (298)

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
- 縁 · -ネン
- 応 · ヨウ
- 応 · -ノウ
- 王 · -ノウ
- 臆 · ヨク
- 俺 · エン
- 音 · -ノン
- 価 · ケ
- 可 · コク
- 夏 · ガ
- 画 · カイ
- …and 273 more

<a id="radical-name"></a>
## Radicals: Radicals without exactly one name (0)

Each radical should have exactly one name (Lucas's rule).

None. 🎉

<a id="radical-unused"></a>
## Radicals: Radicals no kanji uses (12)

A radical in a lesson that no taught kanji contains doesn't help learn anything.

- 𧘇 · hem · 115
- 卅 · thirty · 85
- 呑 · swallow · 78
- 禸 · track · 69
- 尢 · lame · 122
- 㐄 · stride · 57
- 丞 · aid · 106
- 㐭 · granary · 165
- 龹 · bundle · 160
- 𡰪 · crooked · 126
- 柬 · choose · 166
- 巜 · stream · 202

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
## Sentences: Sentences with damaged text (3)

Broken characters or leftover HTML.

- js307560 · そんな悠長に、待ってられるか。 · I can't wait leisurely.
- js575023 · 頭部打撲の可能性もあります"。 · There's also the possibility of a blow to her head.
- js820336 · "大倉市民病院の婦人科に、紹介状を書きますから"。 · I'll write you a referral to okura community hospital's gynecology department.

<a id="sentence-bad-link"></a>
## Sentences: Sentences linking to missing words (0)

A tappable word in the sentence points at nothing.

None. 🎉

<a id="sentence-duplicate"></a>
## Sentences: The same Japanese sentence more than once (12)

Usually harmless (different sources), listed so they can be merged.

- ウラウラとした日差しに誘われて、眠りに落ちた。 · 2
- 著者が本を書き直す度に新版となる。 · 2
- 伝説では、彼女は人魚だったと言われる。 · 2
- カール・マルクス曰く「あらゆる社会の歴史は階級闘争の歴史である」だそうです。 · 2
- その事典は約５０万語の単語を収めている。 · 2
- 彼は私に毒舌を浴びせた。 · 2
- 人間は万物の霊長である。 · 2
- 少年よ、大志を抱け。 · 2
- そのチームは準決勝に勝って決勝に進出した。 · 2
- アフリカの難民が救いを求めている。 · 2
- 彼女は他の人と一味違う。 · 2
- あーんして。 · 2

<a id="story-odd-characters"></a>
## Stories: Story text with damaged characters (35)

Look-alike radicals (⼈ for 人) or vertical-only punctuation (︒ for 。) from the PDF's fonts. They look right but don't link to any word.

- 怠け者のフウアン · 0 · ︑ U+FE11 ︒ U+FE12 · フウアンは若い男です︒お母さんと二人で暮らしています︒フウアンは怠け者です︒働きません︒毎日︑昼まで寝ています︒
- 怠け者のフウアン · 1 · ︑ U+FE11 ︒ U+FE12 ﹁ U+FE41 ﹂ U+FE42 · ある日︑お母さんはたくさん壺を作りました︒そして︑フウアンに言いました︒﹁フウアン︑この壺を市場で売て︑カニを買て来てお
- 怠け者のフウアン · 2 · ︑ U+FE11 ︒ U+FE12 · ││あ！これが簡単だ！フウアンは壺の底に穴を開けて︑棒を通しました︒
- 怠け者のフウアン · 3 · ︑ U+FE11 ︒ U+FE12 · フウアンは市場に着きました︒しかし︑市場で壺を売ても誰も買いません︒底に穴があるからです︒フウアンは困りました︒
- 怠け者のフウアン · 4 · ︑ U+FE11 ︒ U+FE12 · 市場に皮膚病の人がたくさんいます︒フウアンはそれを見て思いました︒││あ！壺を砕いて粉にして︑薬だと言て︑売ろう︒
- 怠け者のフウアン · 5 · ︒ U+FE12 · フウアンは壺を砕いて薬を作りました︒フウアンは薬を売たお金でカニを買うことができました︒
- 怠け者のフウアン · 6 · ︑ U+FE11 ︒ U+FE12 · 市場からフウアンの家までは近いです︒少し歩くと︑湖が見えました︒
- 怠け者のフウアン · 7 · ︑ U+FE11 ︒ U+FE12 ﹁ U+FE41 ﹂ U+FE42 · フウアンはカニに言いました︒﹁僕は湖で泳ぎたいから︑おまえたちは歩いて僕の家に行きなさい！﹂そして︑フウンは湖で遊びまし
- 怠け者のフウアン · 8 · ︑ U+FE11 ︒ U+FE12 ﹁ U+FE41 ﹂ U+FE42 · お母さんはフウアンに聞きました︒﹁カニはどこにあるの？﹂﹁え！？まだ来ない？僕は湖で泳ぎたかたから︑カニに歩いて僕の家に
- 怠け者のフウアン · 9 · ︒ U+FE12 · お母さんはフウアンが怠け者で馬鹿なことがよくわかりました︒お母さんは泣きました︒
- 涙の力 · 0 · ⻑ U+2ED1 ⼈ U+2F08 ⾝ U+2F9D ︑ U+FE11 ︒ U+FE12 · 昔︑昔︑世界に巨⼈がいました︒この巨⼈は︑⾝⻑が３００メートルありました︒
- 涙の力 · 1 · ⼈ U+2F08 ︑ U+FE11 ︒ U+FE12 · 巨⼈は︑だんだんいなくなりました︒最後の巨⼈はメキシコのきれいな町に住んでいました︒この町は︑アグアスカリエンテスと呼ば
- 涙の力 · 2 · ⼈ U+2F08 ⽇ U+2F47 ︑ U+FE11 ︒ U+FE12 · ある⽇︑その巨⼈も病気になって死にました︒
- 涙の力 · 3 · ⼈ U+2F08 ⼊ U+2F0A ⼟ U+2F1F ⼤ U+2F24 ︑ U+FE11 ︒ U+FE12 · でも︑巨⼈を⼊れられる⼤きな墓はありませんでした︒⼟の上に倒れたままでした︒
- 涙の力 · 4 · ⻑ U+2ED1 ⼈ U+2F08 ⼟ U+2F1F ︑ U+FE11 ︒ U+FE12 · ⻑い時間が経ちました︒巨⼈の体は︑⼟で覆われてしまいました︒
- 涙の力 · 5 · ⼈ U+2F08 ⼤ U+2F24 ︑ U+FE11 ︒ U+FE12 · そして︑⼤きくて広い丘になりました︒この丘は⼈の形をしていました︒
- 涙の力 · 6 · ⼀ U+2F00 ︒ U+FE12 ﹁ U+FE41 ﹂ U+FE42 · その丘は﹁死者の丘﹂と丘呼ばれました︒の7者アグアスカリエンテスで死⼀番有名な場所になりました︒
- 涙の力 · 7 · ︑ U+FE11 ︒ U+FE12 · それから３０００年後︑町の汚染が進んで︑丘まで来ました︒
- 涙の力 · 8 · ⼤ U+2F24 ⽇ U+2F47 ⾯ U+2FAF ︑ U+FE11 ︒ U+FE12 · ！てけ助そんなある⽇︑急に地⾯が⼤きく揺れました︒みんなは地震があったと思いました︒みんなびっくりしました︒！え
- 涙の力 · 9 · ⼈ U+2F08 ⼥ U+2F25 ⾒ U+2F92 ︒ U+FE12 · でも地震ではありませんでした︒巨⼈が起き上がったのです︒みんなは近くに集まりました︒そして巨⼈を⾒ました︒⼥の巨⼈でした
- 涙の力 · 10 · ⼈ U+2F08 ⼤ U+2F24 ︒ U+FE12 · 巨⼈は泣いていました︒⼤きな涙を流しました︒
- 涙の力 · 11 · ⼈ U+2F08 ︑ U+FE11 ︒ U+FE12 · ⼈々は逃げようとしましたが︑逃げられませんでした︒そして︑涙は⼈を動物に変えました︒
- 涙の力 · 12 · ⼈ U+2F08 ⽇ U+2F47 ⾒ U+2F92 ︑ U+FE11 ︒ U+FE12 · 世界中の⼈がこのニュースを⾒ました︒５⽇ぐらい経って︑汚染がなくなりました︒天気もよくなりました︒
- 涙の力 · 13 · ⼀ U+2F00 ⼈ U+2F08 ︑ U+FE11 ︒ U+FE12 · 巨⼈はうれしくて︑もう⼀度眠りました︒
- 涙の力 · 14 · ⼈ U+2F08 ⼤ U+2F24 ⽇ U+2F47 ︑ U+FE11 ︒ U+FE12 · その⽇から︑⼈々は︑この世界を⼤切にするようになりました︒
- …and 10 more

<a id="story-word-missing"></a>
## Stories: Story words with no dictionary entry (686)

The story links the word, but words.json doesn't have it, so it can't be tapped or counted.

- 私とハムスター · マロン · 1129940 · 27
- 猿かに合戦 · かに · 1202410 · 23
- 雪渡り · キック · 1041080 · 23
- 舌切りすずめ · すずめ · 1373560 · 22
- どんぐりと山猫 · どんぐり · 1419200 · 22
- 日本のバレンタインデー · チョコレート · 1078270 · 20
- トマトを育てました · トマト · 1085420 · 16
- ごん狐 · うなぎ · 1172500 · 15
- 雪渡り · トントン · 1008800 · 14
- 羊飼いの男の子 ～イソップ物語より · オオカミ · 1560940 · 11
- 金の斧銀の斧～イソップ物語より · さま · 1545790 · 11
- 注文の多い料理店 · いらっしゃい · 1000940 · 11
- 一寸法師 · さま · 1545790 · 11
- 浦島太郎 · さま · 1545790 · 11
- 美知子の星空 · カフェ · 1038050 · 10
- 美知子の星空 · カレー · 1039140 · 10
- ごん狐 · いわし · 1587860 · 10
- 美知子の星空 · じゃあ · 1896380 · 9
- キャラメルとあめ玉 · キャラメル · 2480290 · 8
- 日本のバレンタインデー · バレンタインデー · 1100020 · 8
- 杜子春 · まま · 1585410 · 8
- カラスと水さし ～イソップ物語より～ · カラス · 1171450 · 7
- あんこちゃん 〜季節のお菓子〜 · あんこ · 1610570 · 7
- ちょっと… · マリーナ · 1129330 · 7
- どんぐりと山猫 · きのこ · 1416010 · 7
- …and 661 more

<a id="story-links"></a>
## Stories: Story files with broken links (0)



None. 🎉

<a id="story-jumbled"></a>
## Stories: Story text that may be jumbled (23)

Half or more of the character pairs never appear in real Japanese. Usually side notes, picture labels or furigana read in the wrong order; place-name lists also land here.

- かまきり · 5 · 83% · 12630きりまか「本読習学数数語ル本彙字ベ語文レ日
- つみっこ · 1 · 43% · 本庄市埼玉県東京都若泉公園の桜マリーゴールドの丘公園
- ようこそ別府へ · 14 · 48% · 北海道大阪東京九州ふくおかさが福岡佐賀別府長崎大分熊本宮崎かごしま鹿児島かごしま鹿児島沖縄
- ポール・ジャクレー · 2 · 75% · 館料資俗民史3歴町沢井軽「ポール・ジャクレー展」
- ポール・ジャクレー · 12 · 52% · 注10二ためき州十このもわ百んにれの六れ話きぁ回で、い宮才はをれ、もす二な廷の、しいこ！
- ポール・ジャクレー · 14 · 61% · とぬ一にまの軽ま九入しに井で六った必沢、○た。
- ポール・ジャクレー · 14 · 56% · 要にジ年んな住ャにで摺んク六す師でレ十
- ポール・ジャクレー · 16 · 53% · 日ういし示じ料ょぇ部ぶャは、みす館か！
- ポール・ジャクレー · 17 · 59% · 喜多川歌麿（1798）注2歌麿の模写1911年（15才）紙本着色「青楼美人名花合」
- 別府観光の父 油屋熊八 · 15 · 73% · 館書を志図の立覧県分遊御大泉（温年府19別「
- 北海道 · 1 · 59% · 根室県札幌県根室札幌函館県函館実は、昔北海道は「札幌県」
- 日下川の猿猴 · 0 · 67% · この川に・・・日高村仁淀川日高村役場日下川宇井
- 日本の城 · 0 · 50% · 弘前城竹田城松本城彦根城姫路城まつえじょう松江城えどじょう江戸城熊本城犬山城なごやじょうおおさかじょう名古屋城大阪城首里城
- 日本の城 · 1 · 62% · しろ城しゃちほこ鯱天守石垣堀
- 日本の城 · 24 · 52% · しゅりじょう首里城沖縄県正殿守礼門首里城は赤い城です。
- 温泉の町 別府 · 0 · 45% · ほっかいどう北海道おおさか大阪とうきょう東京九州べっぷ福岡別府さが佐賀長崎大分熊本みやざきかごしま宮崎おきなわ鹿児島沖縄鹿児島
- 花と色 · 0 · 40% · 埼玉県ときがわ町（上）埼玉県小川町巾着田（下）
- 花と色 · 2 · 52% · 東京都文京区六義園（上）埼玉県新座市平林寺（左）東京都立川市・昭島市昭和記念公園（右）
- 花と色 · 4 · 48% · 神奈川県中郡吾妻山公園（上）埼玉県比企郡武蔵丘陵森林公園（下）
- 花と色 · 7 · 53% · 神奈川県鎌倉市東慶寺（上）成就院（左）江ノ電沿線（右）
- 花と色 · 8 · 50% · 群馬県足利市あしかがフラワーパーク
- 雪渡り · 68 · 50% · 「北風ぴいぴい風三郎、西風どうどう又三郎」
- 黒コウモリと白コウモリ · 14 · 41% · 花は苦に光ひ大お鳥と冷つ乾か流なのいるきのたいれ匂果く虫歌いたるい物もみ雨あ風か星ほの湖ずめぜしうみ

<a id="story-blanks"></a>
## Stories: Stories with ○○○ blanks (6)

Fill-in-the-blank pages from the book itself (入れて asks you to guess いれて / いいよ). Not damage, but they look odd without the book's pictures.

- 入れて · 3 · 「わたしも、○○○。」
- 入れて · 4 · 「うん、○○○。」
- 入れて · 6 · 「○○も、○○○。」
- 入れて · 7 · 「うん、○○○。」
- 稲むらの火 · 6 · でも、儀兵衛はなにも言わなかった。儀兵衛は四〇〇人の村の人のことばかり考えていたのだ。忠は泣きながら、家の中に入った。儀
- ポール・ジャクレー · 6 · 日本画や、浮世絵も学んだんですよ。1浮世絵って？注絵江戸時代（一六〇〇～一八世浮六八年）にとても人気があっ麿歌た絵です。

<a id="grammar-no-examples"></a>
## Grammar: Grammar points with no example (0)



None. 🎉

<a id="grammar-gap"></a>
## Grammar: Grammar examples with no {marked} part (0)

Each example marks the grammar point as {…} so it can be highlighted and quizzed.

None. 🎉
