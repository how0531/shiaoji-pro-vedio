// src/lib/news-sentiment.ts — 規則層的台股新聞利多/利空分類器
//
// 忠實移植自 stock-news-skill 的 news_sentiment.py（同一套詞庫與計分規
// 則，該版附 36 條自測案例；本移植的對照驗證在 scripts/check-news-
// sentiment.ts）。純函數、零依賴、同步即時 —— 一則標題+摘要不到 1ms，
// 今日焦點彙整時逐則呼叫即可，不需快取層。
//
// 計分規則（與 Python 版一致，勿單邊改動）：
// - 標題權重 2、內文權重 1（標題已被編輯精煉）
// - 反轉慣用語先抽出計分並遮蔽（「利空出盡」→多，避免再被「利空」命中）
// - 否定翻轉：命中詞前 6 字窗口內有否定詞 → 分數記到對方
// - 轉折加權：「但/卻/然而…」之後的子句是重點，命中詞分數 ×2
// - 主體提示：「客戶砍單/遭抽單」對被報導公司是利空
// - 兩邊分數要拉開 1.3 倍才判定偏多/偏空，否則中性

export type Sentiment = 'bullish' | 'bearish' | 'neutral';

export interface SentimentResult {
    sentiment: Sentiment;
    confidence: number; // 0~1，分差相對總量的比例
}

// --------------------------------------------------------------------------
// 詞庫（與 news_sentiment.py 逐字同步）
// --------------------------------------------------------------------------

const BULLISH_WORDS: string[] = [
    // 營收 / 獲利方向
    '攀升', '看漲', '強勁', '超預期', '優於預期', '優於市場預期', '優於財測',
    '上修', '上調', '創新高', '創高', '創歷史新高', '再創高', '改寫新高',
    '報喜', '爆發', '看好', '轉佳', '走強', '回溫', '回升', '翻多', '翻紅',
    '回神', '回穩', '築底反彈', '觸底反彈', '落底回升', '止穩', '止跌回升',
    // 訂單 / 產能 / 出貨
    '訂單滿手', '訂單湧入', '訂單能見度高', '急單', '拉貨', '急單湧入',
    '出貨暢旺', '出貨強勁', '出貨放量', '接單暢旺', '接單滿載', '滿載',
    '產能滿載', '擴產', '擴廠', '新增訂單', '大單', '大單挹注', '標案',
    '得標', '斬獲訂單', '拿下訂單', '供不應求',
    // 投顧 / 法人語言
    '利多', '加碼', '調升', '調升目標價', '目標價上修', '升評', '調升評等',
    '買進', '買超', '推薦', '投信認養', '法人認養', '連買', '連續買超', '土洋對作偏多',
    '中信買超', '外資買超', '投信買超', '投信連買', '法人加碼', '首次評等',
    // 量價走勢
    '突破', '放量大漲', '續強', '亮燈漲停', '漲停', '飆漲', '強漲',
    '大漲', '勁揚', '走揚', '攻頂', '創波段新高', '多頭', '領漲', '噴出',
    // 業績 / 基本面
    '年增', '月增', '季增', '獲利成長', '獲利大增', '獲利倍增', '獲利躍進',
    'EPS創高', '賺贏', '賺逾', '轉盈', '轉機', '由虧轉盈', '扭虧為盈',
    '毛利率提升', '毛利率攀升', '毛利率上揚', '營收創高', '營收創新高',
    '營收亮眼', '業績亮眼', '獲利亮眼', '題材發酵', '利多齊發', '業績噴發',
    // 公司行動 / 籌碼
    '庫藏股', '回購庫藏股', '實施庫藏股', '現金股利優於', '高殖利率',
    '標到', '中選', '簽約', '簽訂大單', '結盟', '策略聯盟', '入股',
    '購併', '併購', '收購', '勝訴', '獲准',
    // 漲價 / 接單 / 認證 / 生技 / 脫罪
    '漲價', '報價調漲', '調漲', '喊漲', '供貨吃緊',
    '解盲成功', '取得藥證', '藥證取得', '通過認證', '取得認證',
    '打入供應鏈', '進入供應鏈', '切入供應鏈', '獨家供貨', '獨家供應',
    '長約', '簽長約', '長期合約', '產能開出', '外資調升', '評等調升',
    '不起訴', '獲不起訴', '獲判無罪',
    // 跨產業：航運/營建/金融/觀光/原物料
    '運價走揚', '運價走升', '運價飆漲', '運價大漲', '運價回升',
    '缺櫃', '一櫃難求', '滿艙', '艙位滿載',
    '完銷', '完售', '建案完銷', '推案熱銷', '預售熱銷', '完工入帳', '交屋入帳',
    '利差擴大', '淨利差擴大', '放款成長', '存放款成長', '手續費收入成長',
    '資本適足率提升', '逾放比下降', '逾放比改善',
    '來客回流', '來客數成長', '訂房率攀升', '訂房率回升', '訂房滿房',
    '報復性消費', '入境人次成長', '翻桌率提升', '同店銷售成長',
    '報價走揚', '報價飆漲', '報價止跌', '開工率提升', '稼動率提升',
];

const BEARISH_WORDS: string[] = [
    // 警訊 / 預警
    '預警', '警示', '示警', '警訊', '獲利預警', '財測下修', '營運示警',
    // 監管處置
    '處置股', '關禁閉', '分盤撮合', '全額交割',
    // 業績方向
    '不如預期', '不如市場預期', '遜於預期', '低於預期', '低於財測', '下修',
    '下調', '衰退', '減少', '下滑', '走弱', '走疲', '疲弱', '疲軟',
    '縮水', '縮減', '回落', '下探', '探底', '下挫', '急凍', '急轉直下',
    // 訂單 / 產能 / 出貨
    '砍單', '被砍單', '遭砍單', '抽單', '取消訂單', '訂單流失', '停產',
    '減產', '停工', '停擺', '出貨延誤', '出貨遞延', '出貨下修', '出貨衰退',
    '產能不足', '稼動率下滑', '庫存壓力', '庫存過高', '高庫存', '去化',
    '賣壓沉重', '賣壓湧現', '賣壓出籠',
    // 投顧 / 法人語言
    '利空', '減碼', '調降', '調降目標價', '目標價下修', '下修目標價',
    '降評', '調降評等', '賣出', '看淡', '看空', '出脫', '賣超', '連賣',
    '連續賣超', '外資賣超', '外資調節', '投信賣超', '法人調節', '法人棄守',
    // 量價走勢
    '跳水', '跌停', '崩跌', '慘跌', '重挫', '暴跌', '破底', '摜破', '跌破',
    '急殺', '殺盤', '失守', '下殺', '回檔', '領跌', '弱勢', '破底翻空',
    // 業績 / 基本面
    '虧損', '鉅額虧損', '認列損失', '提列損失', '踩雷', '營收衰退',
    '獲利衰退', '由盈轉虧', '轉虧', '毛利率下滑', '毛利率下降',
    '毛利率走低', '毛利率衰退', '獲利縮水', '獲利下滑', '財報不如預期',
    // 財務 / 重大事故
    '違約', '違約交割', '跳票', '下市', '停止交易', '打入全額交割',
    '財務危機', '財務吃緊', '周轉不靈', '聲請重整', '重整', '破產',
    '詐欺', '假帳', '掏空', '起訴', '搜索', '調查', '裁罰', '停業',
    '敗訴', '判賠', '求償', '遭罰', '重罰',
    // 價格戰 / 生技 / 籌碼 / 展望
    '價格戰', '殺價競爭', '殺價', '降價', '降價求售', '降價搶市', '掉單',
    '解盲失敗', '解盲未達標', '藥證未過', '認證未過', '臨床失敗',
    '保守看待', '保守展望', '展望保守', '下修展望', '恐慌賣壓',
    '斷頭', '融資追繳', '追繳令', '質押爆倉', '認賠', '認賠殺出', '停損賣壓',
    '現增折價', '現金增資折價',
    // 跨產業：航運/營建/金融/觀光/原物料
    '運價走跌', '運價下跌', '運價崩跌', '運價重挫', '運價回落', '艙位過剩',
    '房市降溫', '銷售遇冷', '預售退訂', '退訂潮', '推案遞延', '建案延遲',
    '餘屋攀升', '餘屋增加',
    '利差收窄', '淨利差收窄', '逾放比攀升', '逾放比上升', '增提呆帳',
    '鉅額理賠', '資本適足率不足',
    '來客數下滑', '訂房率下滑', '退房潮', '內用萎縮', '同店銷售下滑',
    '報價走跌', '報價崩跌', '報價鬆動', '開工率下滑',
    '庫存跌價損失', '存貨跌價損失',
];

// 反轉慣用語：字面方向與實際情緒相反，先抽出計分再遮蔽，
// 避免「利空出盡」之後又被「利空」子字串重複算成利空
const REVERSAL_PHRASES: Record<string, Sentiment> = {
    // 字面有「利空」但其實偏多
    利空出盡: 'bullish',
    利空鈍化: 'bullish',
    利空淡化: 'bullish',
    利空消化: 'bullish',
    利空已反映: 'bullish',
    靴子落地: 'bullish',
    // 字面有「利多」但其實偏空
    利多出盡: 'bearish',
    利多不漲: 'bearish',
    利多已反映: 'bearish',
    見光死: 'bearish',
    漲多拉回: 'bearish',
    漲多回檔: 'bearish',
    開高走低: 'bearish',
    獲利了結: 'bearish',
    // 負面詞「縮小/減輕」其實偏多
    虧損縮減: 'bullish',
    虧損大減: 'bullish',
    虧損收斂: 'bullish',
    虧損減少: 'bullish',
    虧損縮小: 'bullish',
    賣壓減輕: 'bullish',
    賣壓緩解: 'bullish',
    賣壓收斂: 'bullish',
    跌幅收斂: 'bullish',
    跌幅縮小: 'bullish',
    降幅收斂: 'bullish',
    降幅縮小: 'bullish',
};

// 否定詞：出現在命中詞前方小窗口內，翻轉該詞情緒
const NEGATION_WORDS: string[] = [
    '未', '沒', '沒有', '不', '無', '免', '難以', '尚未', '並未', '未能',
    '未見', '不再', '不會', '毫無', '缺乏', '未如', '未達', '非',
];

const NEGATION_WINDOW = 6; // 否定詞往前看的字數窗口

// 子句邊界：否定窗口掃描遇到就截斷，避免跨子句誤判
const CLAUSE_BREAK = /[，。；、！？!?;,\s]/g;

// 已內含否定語意的片語：不再被二次否定（「不如預期」不能翻成利多）
const NEGATION_IMMUNE = new Set<string>([
    '不如預期', '不如市場預期', '低於預期', '低於財測', '遜於預期',
    '產能不足', '周轉不靈', '財報不如預期',
]);

// 轉折詞：其後子句是新聞重點，命中詞加權
const PIVOT_WORDS: string[] = ['但', '卻', '然而', '不過', '惟', '可惜', '只是', '唯'];

const PIVOT_BOOST = 2;

// 主體誤判提示：「客戶砍單」動作主詞是他方，對被報導公司是利空
const SUBJECT_HINTS: Record<string, Sentiment> = {
    客戶砍單: 'bearish',
    遭砍單: 'bearish',
    被砍單: 'bearish',
    客戶抽單: 'bearish',
    遭抽單: 'bearish',
    客戶縮減: 'bearish',
    客戶下修: 'bearish',
};

// --------------------------------------------------------------------------
// 核心計分
// --------------------------------------------------------------------------

const TITLE_WEIGHT = 2;
const BODY_WEIGHT = 1;

// 依長度預先排序的詞庫（長詞優先，避免「下修」吃掉「目標價下修」）
const BULLISH_SORTED = [...BULLISH_WORDS].sort((a, b) => b.length - a.length);
const BEARISH_SORTED = [...BEARISH_WORDS].sort((a, b) => b.length - a.length);

// 回傳 [(命中詞, 起始索引), ...]，命中後將該區段遮蔽避免重複計分
function scanWithPos(text: string, vocab: string[]): [string, number][] {
    if (!text) return [];
    let work = text;
    const found: [string, number][] = [];
    for (const w of vocab) {
        let start = 0;
        for (;;) {
            const idx = work.indexOf(w, start);
            if (idx < 0) break;
            found.push([w, idx]);
            work =
                work.slice(0, idx) +
                '\x00'.repeat(w.length) +
                work.slice(idx + w.length);
            start = idx + w.length;
        }
    }
    found.sort((a, b) => a[1] - b[1]);
    return found;
}

// 命中詞起點前方 NEGATION_WINDOW 字內是否有否定詞（只看最後一個
// 子句邊界/轉折詞之後的範圍，避免跨子句誤否定）
function isNegated(text: string, pos: number, word: string): boolean {
    if (NEGATION_IMMUNE.has(word)) return false;
    const winStart = Math.max(0, pos - NEGATION_WINDOW);
    let window = text.slice(winStart, pos);
    let cut = 0;
    for (const m of window.matchAll(CLAUSE_BREAK)) {
        cut = (m.index ?? 0) + m[0].length;
    }
    for (const p of PIVOT_WORDS) {
        const i = window.lastIndexOf(p);
        if (i >= 0) cut = Math.max(cut, i + p.length);
    }
    window = window.slice(cut);
    return NEGATION_WORDS.some((neg) => window.includes(neg));
}

// 第一個轉折詞之後的索引；沒有轉折詞則回傳大數（代表無轉折）
function pivotStart(text: string): number {
    let best = text.length + 1;
    for (const p of PIVOT_WORDS) {
        const idx = text.indexOf(p);
        if (idx >= 0 && idx < best) best = idx + p.length;
    }
    return best;
}

// 對單一段文字計分，回傳 [本方得分, 被否定翻到對方的得分]
function scoreText(
    text: string,
    vocab: string[],
    weight: number,
): [number, number] {
    if (!text) return [0, 0];
    const pivot = pivotStart(text);
    let own = 0;
    let flipped = 0;
    for (const [word, pos] of scanWithPos(text, vocab)) {
        let w = weight;
        if (pos >= pivot) w *= PIVOT_BOOST; // 轉折後子句是重點
        if (isNegated(text, pos, word)) flipped += w;
        else own += w;
    }
    return [own, flipped];
}

// 合併標題（權重 2）與內文（權重 1）的計分
function scoreSide(
    title: string,
    body: string,
    vocab: string[],
): [number, number] {
    const [tOwn, tFlip] = scoreText(title, vocab, TITLE_WEIGHT);
    const [bOwn, bFlip] = scoreText(body, vocab, BODY_WEIGHT);
    return [tOwn + bOwn, tFlip + bFlip];
}

// 先抽出反轉慣用語計分，並把命中片語遮蔽（換等長佔位符）
// 回傳 [反轉利多分, 反轉利空分, 遮蔽後標題, 遮蔽後內文]
function applyReversals(
    title: string,
    body: string,
): [number, number, string, string] {
    let posAdd = 0;
    let negAdd = 0;
    for (const [seg, weight] of [
        [title, TITLE_WEIGHT],
        [body, BODY_WEIGHT],
    ] as [string, number][]) {
        for (const [phrase, side] of Object.entries(REVERSAL_PHRASES)) {
            if (seg.includes(phrase)) {
                const cnt = seg.split(phrase).length - 1;
                if (side === 'bullish') posAdd += weight * cnt;
                else negAdd += weight * cnt;
            }
        }
    }
    let maskedTitle = title;
    let maskedBody = body;
    for (const phrase of Object.keys(REVERSAL_PHRASES)) {
        const mask = '\x00'.repeat(phrase.length);
        maskedTitle = maskedTitle.split(phrase).join(mask);
        maskedBody = maskedBody.split(phrase).join(mask);
    }
    return [posAdd, negAdd, maskedTitle, maskedBody];
}

// 主體誤判提示：偵測「客戶砍單/遭抽單」等搭配，強化利空（單則有上限）
function applySubjectHints(title: string, body: string): number {
    const SUBJECT_CAP = TITLE_WEIGHT; // 單則最多加這麼多分，防灌爆門檻
    let negAdd = 0;
    for (const [seg, weight] of [
        [title, TITLE_WEIGHT],
        [body, BODY_WEIGHT],
    ] as [string, number][]) {
        for (const [phrase, side] of Object.entries(SUBJECT_HINTS)) {
            let start = 0;
            for (;;) {
                const idx = seg.indexOf(phrase, start);
                if (idx < 0) break;
                start = idx + phrase.length;
                // 前方有否定詞（「未遭客戶砍單」）→ 不加利空分
                if (isNegated(seg, idx, phrase)) continue;
                if (side === 'bearish') negAdd += weight;
            }
        }
    }
    return Math.min(negAdd, SUBJECT_CAP);
}

// --------------------------------------------------------------------------
// 對外 API
// --------------------------------------------------------------------------

export function classifySentiment(title: string, body = ''): SentimentResult {
    // 步驟 1：反轉慣用語先計分並遮蔽
    const [revPos, revNeg, mTitle, mBody] = applyReversals(
        title || '',
        body || '',
    );

    // 步驟 2：遮蔽後的文字做一般詞掃描（含否定翻轉、轉折加權）
    const [posOwn, posFlip] = scoreSide(mTitle, mBody, BULLISH_SORTED);
    const [negOwn, negFlip] = scoreSide(mTitle, mBody, BEARISH_SORTED);

    // 步驟 3：主體誤判提示
    const subjNeg = applySubjectHints(mTitle, mBody);

    // 匯總：利多被否定 → 計入利空；利空被否定 → 計入利多
    const pos = posOwn + revPos + negFlip;
    const neg = negOwn + revNeg + posFlip + subjNeg;

    let sentiment: Sentiment;
    if (pos === 0 && neg === 0) sentiment = 'neutral';
    else if (pos > neg * 1.3) sentiment = 'bullish';
    else if (neg > pos * 1.3) sentiment = 'bearish';
    else sentiment = 'neutral';

    const confidence = Math.min(
        1,
        Math.max(0, Math.abs(pos - neg) / (pos + neg + 1)),
    );

    return { sentiment, confidence: Math.round(confidence * 1000) / 1000 };
}
