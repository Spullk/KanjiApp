"""
Finds the grammar points (data/grammar.json, N5 and up) each example sentence uses, from Sudachi's split of the
sentence: s["g"] = [grammar point ids]. The app uses it to leave out sentences with grammar you haven't learned,
and to link a sentence to the grammar in it.

Each point is a few token patterns: a pattern matches a run of consecutive tokens, one test per token. A test
looks at the token's surface (s), dictionary form (d), normalized form (n), part of speech (pos, its first
field, and sub, its second) and conjugation form (form, a prefix of Sudachi's 活用形). Beginner grammar (the
particles, です and ます) is in nearly every sentence, so it isn't tagged.
"""


class Tok:
    __slots__ = ("s", "d", "n", "pos", "sub", "ctype", "form")

    def __init__(self, m):
        p = m.part_of_speech()
        self.s, self.d, self.n = m.surface(), m.dictionary_form(), m.normalized_form()
        self.pos, self.sub, self.ctype, self.form = p[0], p[1], p[4], p[5]


def t(*words, pos=None, sub=None, form=None, ctype=None, not_after_te=False):
    """A test for one token: one of `words` (surface, dictionary or normalized form; any when none given)."""
    ws = set(words)

    def test(tok, prev):
        if ws and not ({tok.s, tok.d, tok.n} & ws):
            return False
        if pos and not tok.pos.startswith(pos):
            return False
        if sub and tok.sub != sub:
            return False
        if form and not tok.form.startswith(form):
            return False
        if ctype and not tok.ctype.startswith(ctype):
            return False
        if not_after_te and prev is not None and prev.s in ("て", "で") and prev.pos == "助詞":
            return False
        return True

    return test


# The e-row kana for each u-row ending: a godan verb's potential (読む → 読める).
E_ROW = dict(zip("うくぐすつぬぶむる", "えけげせてねべめれ"))

VERB = t(pos="動詞")
ADJ = t(pos="形容詞")
TE = t("て", "で", pos="助詞", sub="接続助詞")
NOUNISH = t(pos="名詞")
PRED = lambda tok, prev: tok.pos in ("動詞", "形容詞", "助動詞")  # noqa: E731  ends a clause before a noun
# A verb or adjective clause, not a noun + な/だ (大変なこと, 建物の様なもの).
CLAUSE = lambda tok, prev: tok.pos in ("動詞", "形容詞") or (tok.pos == "助動詞" and tok.n not in ("だ", "です"))  # noqa: E731


def any_of(*tests):
    return lambda tok, prev: any(f(tok, prev) for f in tests)


def not_(test):
    return lambda tok, prev: not test(tok, prev)


def S(*parts):
    """A pattern from words in a row: each part a word or a tuple of words that may stand there."""
    return [t(*(p if isinstance(p, tuple) else (p,))) for p in parts]

# Grammar point id → patterns. One pattern matching anywhere in the sentence is enough.
RULES = {
    # N5
    "aru-iru": [[t("ある", "有る", "いる", "居る", pos="動詞", not_after_te=True)]],
    "position": [[t("の", "この", "その", "あの", "どの"), t("上", "下", "中", "前", "後ろ", "横", "隣", "そば", "外", "右", "左", "間", pos="名詞")]],
    "adj-past-neg": [[ADJ, t("た", pos="助動詞")], [t(pos="形容詞", form="連用形"), t("ない", pos=("形容詞", "助動詞"))],
                     [t(pos="形状詞"), t("でし", "だっ")], [t(pos="形状詞"), t("じゃ", "では"), t("ない", "ありません", "あり")]],
    "plain-past": [[any_of(VERB, t(pos="助動詞", ctype="下一段")), t("た", pos="助動詞")]],
    "plain-negative": [[t(pos="動詞", form="未然形"), t("ない", pos="助動詞")]],
    "te-form": [[VERB, TE]],
    "te-kudasai": [[TE, t("くださる", "下さる")], [t("を", pos="助詞"), t("くださる", "下さる")]],
    "te-iru": [[TE, t("いる", "居る")]],
    "tai": [[t("たい", pos="助動詞")]],
    "mashou": [[t("ます", pos="助動詞", form="意志推量形")], [t("ます", pos="助動詞"), t("ぬ", "ず"), t("か", pos="助詞")]],
    "ni-iku": [[t(pos="動詞", form="連用形"), t("に", pos="助詞"), t("行く", "来る", "帰る", "いく", "くる")]],
    "kara-made": [[NOUNISH, t("から", pos="助詞", sub="格助詞")], [t("まで", pos="助詞")]],
    "kara-because": [[t("から", pos="助詞", sub="接続助詞")]],
    "ga-but": [[t("が", pos="助詞", sub="接続助詞")]],
    "suki": [[t("が", pos="助詞"), t("好き", "嫌い", "上手", "下手", "欲しい", "分かる")]],
    "yori": [[t("より", pos="助詞")], [t("一番", "いちばん")], [t("方", "ほう", pos="名詞"), t("が", pos="助詞")]],
    "te-mo-ii": [[TE, t("も", pos="助詞"), t("いい", "良い", "よい", "構う")],
                 [TE, t("は", pos="助詞"), t("いける", "いけない", "なる", "だめ", "駄目")]],
    "naide": [[t("ない", pos="助動詞"), t("で", pos="助詞")]],
    "mae-ato": [[PRED, t("前", "まえ", pos="名詞"), t("に", pos="助詞")], [t("た", pos="助動詞"), t("後", "あと", pos="名詞")]],
    "toki": [[any_of(PRED, t("の", pos="助詞"), t(pos="形状詞")), t("時", "とき", pos="名詞")]],
    "naru": [[t("に", pos=("助詞", "助動詞")), t("なる", "成る", pos="動詞")], [t(pos="形容詞", form="連用形"), t("なる", "成る", pos="動詞")]],
    "deshou": [[t("です", pos="助動詞", form="意志推量形")], [t("だ", pos="助動詞", form="意志推量形")]],
    "ya": [[t("や", pos="助詞", sub="副助詞")], [t("など", "なんか", pos="助詞")]],
    "mou-mada": [[t("もう", "まだ", pos="副詞")]],
    "dake": [[t("だけ", pos="助詞")]],
    "koto-ga-dekiru": [[t("こと", "事", pos="名詞"), t("が", pos="助詞"), t("できる", "出来る")]],
    # N4
    "ta-koto-ga-aru": [[t("た", pos="助動詞"), t("こと", "事", pos="名詞"), t("が", "は", "も", pos="助詞"), t("ある", "有る", "ない", "無い")],
                       [t("ない", pos="助動詞"), t("こと", "事", pos="名詞"), t("が", "も", pos="助詞"), t("ある", "有る")]],
    "potential": [[lambda tok, prev: tok.pos == "動詞" and tok.ctype.startswith("下一段") and tok.d != tok.n
                   and tok.n[-1:] in E_ROW and tok.d == tok.n[:-1] + E_ROW[tok.n[-1]] + "る"],
                  [t(pos="動詞", ctype=("上一段", "下一段", "カ行")), t("られる", pos="助動詞")],
                  [t("来る", form="未然形"), t("れる", pos="助動詞")]],
    "volitional": [[t(pos="動詞", form="意志推量形")]],
    "tsumori": [[t("つもり", "積もり", pos="名詞")]],
    "ba": [[t(form="仮定形"), t("ば", pos="助詞")]],
    "tara": [[t("た", pos="助動詞", form="仮定形")]],
    "to-if": [[any_of(PRED, t(pos="形状詞")), t("と", pos="助詞", sub="接続助詞")]],
    "nara": [[t("なら", "ならば", pos=("助動詞", "助詞"))]],
    "passive": [[t(pos="動詞", ctype="五段", form="未然形"), t("れる", pos="助動詞")],
                [t("する", "為る", form="未然形"), t("れる", pos="助動詞")]],
    "causative": [[t(pos="動詞", form="未然形"), t("せる", "させる")], [t("させる", pos="動詞")]],
    "te-shimau": [[TE, t("しまう", "仕舞う")], [t("ちゃう", "じゃう", "ちまう")]],
    "te-oku": [[TE, t("おく", "置く", pos="動詞", sub="非自立可能")], [t("とく", "どく", pos=("動詞", "助動詞"))]],
    "te-miru": [[TE, t("みる", "見る", sub="非自立可能")]],
    "te-aru": [[TE, t("ある", "有る")]],
    "giving": [[t("あげる", "上げる", "くれる", "呉れる", "もらう", "貰う", pos="動詞", not_after_te=True)]],
    "te-ageru": [[TE, t("あげる", "上げる", "くれる", "呉れる", "もらう", "貰う", "いただく", "頂く", "くださる", "下さる", "やる")]],
    "te-hoshii": [[TE, t("ほしい", "欲しい")]],
    "sou-looks": [[any_of(t(pos="動詞", form="連用形"), t(pos="形容詞", form="語幹"), t(pos="形状詞"), t(pos="名詞")),
                   t("そう", pos="形状詞", sub="助動詞語幹")]],
    "sou-heard": [[any_of(t(form="終止形"), t(form="連体形"), t("だ", pos="助動詞")), t("そう", pos="名詞", sub="助動詞語幹")]],
    "you-mitai": [[t("よう", "様", pos="形状詞", sub="助動詞語幹"), not_(t("に"))], [t("みたい", pos="形状詞")]],
    "rashii": [[t("らしい", pos=("助動詞", "接尾辞"))]],
    "kamoshirenai": [[t("か", pos="助詞"), t("も", pos="助詞"), t("しれる", "知れる")]],
    "hazu": [[t("はず", "筈", pos="名詞")]],
    "nakereba": [[t("ない", pos="助動詞", form="仮定形")], [t("ない", pos="助動詞"), t("と", pos="助詞"), not_(VERB)],
                 [t("なくちゃ", "なくては", "ないと")], [t("ない", pos="助動詞", form="連用形"), TE, t("も", pos="助詞")]],
    "hou-ga-ii": [[t("方", "ほう", pos="名詞"), t("が", pos="助詞"), t("いい", "良い", "よい")]],
    "nagara": [[t("ながら", pos="助詞")]],
    "shi": [[t("し", pos="助詞", sub="接続助詞")]],
    "node": [[t("の", "ん", pos="助詞", sub="準体助詞"), t("で", pos="助動詞", form="連用形")], [t("ので", pos="助詞")]],
    "noni": [[PRED, t("の", pos="助詞", sub="準体助詞"), t("に", pos="助詞"), t("、", "。", "！", "？")],
             [t("のに", pos="助詞")]],
    "tame": [[t("ため", "為", pos="名詞")]],
    "you-ni": [[t("よう", "様", pos="形状詞"), t("に", pos="助動詞")], [t("よう", "様"), t("に", pos="助詞")]],
    "koto-ni-suru": [[t("こと", "事", pos="名詞"), t("に", pos="助詞"), t("する", "為る", "なる", "成る")]],
    "sugiru": [[not_(t("に")), t("すぎる", "過ぎる", sub="非自立可能")]],  # にすぎない is "merely"
    "yasui-nikui": [[t(pos="動詞", form="連用形"), t("やすい", "易い", "にくい", "難い", "づらい", "辛い", pos="接尾辞")]],
    "aida": [[any_of(PRED, t("の", pos="助詞")), t("間", "あいだ", pos="名詞")]],
    "ka-dou-ka": [[t("か", pos="助詞"), t("どう"), t("か", pos="助詞")]],
    "bakari": [[t("ばかり", "ばっかり", "ばっか", pos="助詞")]],
    "tokoro": [[PRED, t("ところ", "所", pos="名詞"), any_of(t("だ", "です", pos="助動詞"), t("に", "で", "へ", pos="助詞"))]],
    "to-iu": [[t("と", "って", pos="助詞", sub="格助詞"), t("言う", "いう", "云う", "思う")]],
    "n-desu": [[t("の", "ん", pos="助詞", sub="準体助詞"), lambda tok, prev: tok.d in ("です", "だ") and tok.s != "で"]],
    "keigo": [[t("いらっしゃる", "召し上がる", "おっしゃる", "なさる", "ござる", "申す", "参る", "伺う", "存じる", "差し上げる")],
              [t("お", "御", "ご", pos="接頭辞"), t(pos="動詞", form="連用形"), t("くださる", "下さる", "なる", "成る", "する", "為る", "いたす", "致す")]],
    # N3
    "wake": [[t("わけ", "訳", pos="名詞")]],
    "you-to-suru": [[t(pos="動詞", form="意志推量形"), t("と", pos="助詞"), t("する", "為る")]],
    "ni-yotte": [[t("に", pos="助詞"), t("よる", "因る", "依る")]],
    "ni-tsuite": [[t("に", pos="助詞"), t("つく", "就く"), TE]],
    "ni-totte": [[t("に", pos="助詞"), t("とる", "取る"), TE]],
    "to-shite": [[t("と", pos="助詞"), t("する", "為る", form="連用形"), TE], [t("として", pos="助詞")]],
    "beki": [[t("べし", "べき", pos="助動詞")]],
    "zuni": [[t("ず", "ぬ", pos="助動詞"), t("に", pos="助詞")]],
    "ppoi": [[t("っぽい", "ぽい", pos="接尾辞")]],
    "tabi-ni": [[any_of(PRED, t("の", pos="助詞")), t("たび", "度", pos="名詞"), t("に", pos="助詞")]],
    "uchi-ni": [[any_of(PRED, t("の", pos="助詞"), t(pos="形状詞")), t("うち", "内", pos="名詞"), t("に", pos="助詞")]],
    "okage-sei": [[t("おかげ", "お陰", pos="名詞")], [t("の", pos="助詞"), t("せい", "所為", pos="名詞")],
                  [PRED, t("せい", "所為", pos="名詞")]],
    "mama": [[t("まま", "侭", pos="名詞")], [t("そのまま", "其の儘")]],
    "totan": [[t("た", pos="助動詞"), t("途端", "とたん")]],
    "furi": [[t("ふり", "振り", pos="名詞"), t("を", pos="助詞"), t("する", "為る")]],
    "tsuide-ni": [[t("ついで", "序で", pos="名詞"), t("に", pos="助詞")]],
    "causative-passive": [[t("させる", "せる"), t("られる", pos="助動詞")]],
    "nakanaka": [[t("なかなか", "中々", pos="副詞")]],
    "kke": [[t("っけ", "け", pos="助詞", sub="終助詞")]],
    "sae": [[t("さえ", pos="助詞")]],
    "koto-wa-nai": [[PRED, t("こと", "事", pos="名詞"), t("は", pos="助詞"), t("ない", "無い")],
                    [PRED, t("こと", "事", pos="名詞"), t("は", pos="助詞"), t("ある", "有る"), t("ます"), t("ぬ", "ず")]],
    "dake-de-naku": [[t("だけ", pos="助詞"), t("で", pos="助動詞"), t("ない", "無い")], [t("だけ", pos="助詞"), t("で", pos="助詞"), t("なく")]],
    "saichuu": [[t("最中")]],
    "ni-chigainai": [S("に", ("違い", "相違"), ("ない", "無い", "ありません", "あり"))],
    "ni-kurabete": [S("に", ("比べる", "較べる", "くらべる"))],
    "ni-taishite": [S("に", "対する")],
    "ni-kanshite": [S("に", "関する")],
    "toori": [[any_of(PRED, t("の", pos="助詞")), t("とおり", "通り", pos="名詞"), t("に", "だ", "です", "、", "。")], [t("どおり")]],
    "kawari-ni": [[any_of(PRED, t("の", pos="助詞")), t("かわり", "代わり", "替わり"), t("に")]],
    "kuse-ni": [[any_of(PRED, t("の", pos="助詞"), t("な", pos="助動詞")), t("くせ", "癖"), t("に")]],
    "mono-da": [[CLAUSE, t("もの", "もん", "物", pos="名詞"), t("だ", "です", pos="助動詞")]],
    "koto-da": [[CLAUSE, t("こと", "事", pos="名詞"), t("だ", "です", pos="助動詞", form="終止形")]],
    "ppanashi": [[lambda tok, prev: tok.s in ("っぱなし", "ぱなし")]],
    "gachi": [[t("がち", pos="接尾辞")]],
    "gimi": [[any_of(t(pos="名詞"), t(pos="動詞", form="連用形")), t("ぎみ", "気味"), not_(t("悪い", "わるい", "が", "の", "を"))]],
    "darake": [[t("だらけ")]],
    "tatoe-temo": [[t("たとえ", "例え", pos="副詞")]],
    "wari-ni": [[any_of(PRED, t("の", pos="助詞"), t("な", pos="助動詞")), t("わり", "割", "割り"), t("に", "には")]],
    "kurai": [[t("くらい", "ぐらい", pos="助詞")]],
    "hodo": [[t("ほど", pos="助詞")]],
    "ni-shite-wa": [S("に", ("する", "為る"), "て", "は") + [not_(t("いける", "なる", "成る", "駄目", "だめ"))]],
    "te-kara-de-nai-to": [S("て", "から", "で", ("ない", "無い"), ("と", "ば")), S("て", "から", "で", ("なけれ", "ない"))],
    "you-ga-nai": [S(("よう", "様", "しよう", "仕様"), "が", ("ない", "無い"))],
    "ta-tokoro": [[t("た", pos="助動詞"), t("ところ", "所"), t("、", "，")]],
    "koto-ni-natte-iru": [S(("こと", "事"), "に", ("なる", "成る"), ("て", "で"), ("いる", "居る"))],
    "to-iu-koto-da": [S("と", ("いう", "言う"), ("こと", "事"), ("だ", "です"))],
    "to-wa-kagiranai": [S("と", "は", ("限る", "かぎる"))],
    "nai-koto-wa-nai": [[t("ない", pos="助動詞"), t("こと", "事"), t("は"), t("ない", "無い")]],
    "ni-kawatte": [S("に", ("かわる", "代わる", "替わる"), "て")],
    "o-hajime": [[t("を"), t("はじめ", "始め", "初め"), t("、", "と", "として")]],
    "o-chuushin-ni": [S("を", "中心", "に")],
    "ni-kuwaete": [S("に", ("加える", "くわえる"), "て")],
    "ni-tsurete": [[t(pos="動詞", form=("終止形", "連体形")), t("に"), t("つれる", "連れる"), t("て")]],
    "kakeru": [[t(pos="動詞", form="連用形"), t("かける", "掛ける", sub="非自立可能")], [t("かけ", "掛け", pos="接尾辞")],
               [lambda tok, prev: tok.s in ("読みかけ", "食べかけ", "飲みかけ", "書きかけ", "やりかけ", "言いかけ")]],
    "kiru": [[t(pos="動詞", form="連用形"), t("きる", "切る", "きれる", "切れる", sub="非自立可能")]],
    "dasu": [[t(pos="動詞", form="連用形"), t("だす", "出す", sub="非自立可能")]],
    "tagaru": [[t("たがる", pos="助動詞")]],
    "koso": [[t("こそ", pos="助詞")]],
    "te-irai": [S(("て", "で"), "以来")],
    "te-tamaranai": [S(("て", "で"), ("たまる", "堪る"), ("ない", "ぬ", "ず"))],
    "oki-ni": [[t("おき", "置き", pos="接尾辞"), t("に")]],
    "dokoroka": [[t("どころ"), t("か")], [t("どころか")]],
    "wake-ni-wa-ikanai": [S(("わけ", "訳"), "に", "は", ("いく", "行く"))],
    "tara-ii-noni": [[t("た", form="仮定形"), t("いい", "良い", "よい"), t("の", pos="助詞"), t("に")],
                     [t("ば"), t("いい", "良い", "よい"), t("の", pos="助詞"), t("に")]],
    # N2
    "ni-oite": [S("に", ("おく", "於く"), "て"), S("に", ("おける", "於ける")), S("に", ("おく", "於く"), "り")],
    "ni-kakawarazu": [[t("に"), t("かかわる", "関わる", "拘る", "係わる"), t("ず")]],
    "ni-mo-kakawarazu": [S("に", "も", ("かかわる", "関わる", "拘る", "係わる"), "ず")],
    "ni-kagitte": [S("に", ("限る", "かぎる"), ("て", "り")), S("に", ("限り", "かぎり"))],
    "ni-sotte": [S("に", ("沿う", "そう"), "て")],
    "ni-motozuite": [S("に", ("基づく", "もとづく"))],
    "o-tooshite": [[not_(t("目")), t("を"), t("通す", "とおす", "通じる", "つうじる"), t("て")]],
    "o-megutte": [S("を", ("めぐる", "巡る"), "て")],
    "o-towazu": [S("を", ("問う", "とう"), "ず")],
    "o-kikkake-ni": [S("を", ("きっかけ", "切っ掛け"), ("に", "として"))],
    "o-komete": [S("を", ("込める", "こめる"), "て")],
    "ue-de": [[t("た", pos="助動詞"), t("上", "うえ"), t("で", pos="助詞")], [t(form="連体形"), t("上", "うえ"), t("で", pos="助詞")]],
    "ue-ni": [[PRED, t("上", "うえ"), t("に")]],
    "ue-wa": [[PRED, t("上", "うえ"), t("は")]],
    "ijou-wa": [[PRED, t("以上"), any_of(t("は"), t("、"))]],
    "kara-ni-wa": [S("から", "に", "は")],
    "bakari-ka": [S("ばかり", "か")],
    "nomi-narazu": [S("のみ", ("なる", "成る", "なり"), "ず"), [t("のみならず")]],
    "mono-no": [[PRED, t("もの", "物"), t("の", pos="助詞"), t("、")]],
    "mono-nara": [[PRED, t("もの", "もん", "物"), t("なら", "ならば")]],
    "mono-ka": [[PRED, t("もの", "もん", "物"), t("か", pos="助詞", sub="終助詞")]],
    "mono-dakara": [[t("もの", "もん", "物"), t("だ", pos="助動詞"), t("から")]],
    "kagiri": [[PRED, t("限り", "かぎり")]],
    "kanenai": [[t(pos="動詞", form="連用形"), t("かねる", "兼ねる"), t("ない")]],
    "kaneru": [[t(pos="動詞", form="連用形"), t("かねる", "兼ねる"), not_(t("ない"))]],
    "eru": [[t(pos="動詞", form="連用形"), t("得る", "える", "うる", sub="非自立可能")], [t("あり得る", "有り得る", "ありえる", "ありうる")]],
    "zaru-o-enai": [S("ざる", "を", ("得る", "える")), S("ず", "を", ("得る", "える"))],
    "zu-ni-wa-irarenai": [S("ず", "に", "は", ("いる", "居る"))],
    "ni-sugi-nai": [S("に", ("すぎる", "過ぎる"), ("ない", "ぬ", "ず")), S("に", ("すぎる", "過ぎる"), "ます", ("ぬ", "ず"))],
    "ni-hoka-naranai": [S("に", ("ほか", "他", "外"), ("なる", "成る"), ("ない", "ぬ", "ず"))],
    "to-shitemo": [[t(pos=("動詞", "形容詞", "助動詞"), form=("終止形", "連体形")), t("と"), t("する", "為る"), t("て"), t("も")]],
    "to-shitara": [[not_(t(form="意志推量形")), t("と"), t("する", "為る", form="連用形"), t("たら")],
                   [not_(t(form="意志推量形")), t("と"), t("する", "為る", form="仮定形"), t("ば")]],
    "to-ittemo": [S("と", ("いう", "言う"), "て", "も")],
    "tokoro-o": [[PRED, t("ところ", "所"), t("を")]],
    "tsutsu": [[t("つつ", pos="助詞")]],
    "ni-tsuke": [[t(form=("連体形", "終止形")), t("に"), t("つける", "付ける"), not_(t("て"))]],
    "ni-kotaete": [S("に", ("応える", "こたえる"))],
    "ni-shitagatte": [S("に", ("したがう", "従う"), "て")],
    "ni-tomonatte": [S("に", ("伴う", "ともなう"))],
    "ni-mukete": [S("に", ("向ける", "むける"), "て"), [t("向け", "むけ", pos="接尾辞")]],
    "ni-oujite": [S("に", ("応じる", "おうじる"), "て")],
    "ni-hanshite": [S("に", ("反する", "はんする"))],
    "ni-saishite": [S("に", ("際する", "さいする"))],
    "ni-watatte": [S("に", ("わたる", "渡る", "亘る"), ("て", "り"))],
    "ippou-da": [[t(pos="動詞", form="連体形"), t("一方"), t("だ", "です", "で")]],
    "bekarazu": [[t("べから")], [t("べく", pos="助動詞")]],
    "you-ni-mo": [[t(pos="動詞", form="意志推量形"), t("に"), t("も")]],
    "koto-ni-feeling": [[any_of(t(pos="形容詞", form="連体形"), t("な", pos="助動詞"), t("た", pos="助動詞")), t("こと", "事"), t("に"), t("、")]],
    "ni-kimatte-iru": [S("に", ("決まる", "きまる"), ("て", "で"), ("いる", "居る"))],
    "kkonai": [[t("っこ"), t("ない")], [t("っこない")]],
}


def ba_hodo(toks):
    """ば〜ほど: a ば clause and then ほど after the same verb or adjective (すればするほど)."""
    for i, tok in enumerate(toks[:-1]):
        if tok.form.startswith("仮定形") and toks[i + 1].s == "ば":
            for j in range(i + 2, min(len(toks) - 1, i + 5)):
                if toks[j].d == tok.d and toks[j + 1].s == "ほど":
                    return True
    return False


SPECIAL = {"ba-hodo": ba_hodo}


def matches(pattern, toks):
    n = len(pattern)
    for i in range(len(toks) - n + 1):
        if all(test(toks[i + k], toks[i + k - 1] if i + k else None) for k, test in enumerate(pattern)):
            return True
    return False


def tags(toks, wanted=None):
    """The grammar point ids the tokens use, in RULES order."""
    out = [gid for gid, patterns in RULES.items() if (wanted is None or gid in wanted) and any(matches(p, toks) for p in patterns)]
    out += [gid for gid, f in SPECIAL.items() if (wanted is None or gid in wanted) and f(toks)]
    return out


def tag_sentences(sentences, grammar_ids, tokenizer):
    """Sets s["g"] on every sentence that uses a tagged grammar point; → how many were tagged."""
    wanted = set(grammar_ids)
    missing = (set(RULES) | set(SPECIAL)) - wanted
    if missing:
        raise SystemExit(f"Grammar rules for points that don't exist: {sorted(missing)}")
    n = 0
    for s in sentences.values():
        g = tags([Tok(m) for m in tokenizer.tokenize(s["ja"])], wanted)
        if g:
            s["g"] = g
            n += 1
        else:
            s.pop("g", None)
    return n
