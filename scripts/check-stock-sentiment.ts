// scripts/check-stock-sentiment.ts — 個股句級歸因自測
// 跑法：node scripts/check-stock-sentiment.ts
// 驗證 classifyStockSentiment：同一則新聞對不同股票應得到各自的方向，
// 以及整篇退回、代碼假命中防護等邊界。

import { classifyStockSentiment } from '../src/lib/news-sentiment.ts';

interface Case {
    name: string;
    title: string;
    body: string;
    terms: string[];
    expect: 'bullish' | 'bearish' | 'neutral';
}

const CASES: Case[] = [
    // 一篇多檔：逗號子句各自歸戶
    {
        name: '多檔標題-台積電側',
        title: '台積電營收創新高，聯電獲利衰退',
        body: '',
        terms: ['台積電', '2330'],
        expect: 'bullish',
    },
    {
        name: '多檔標題-聯電側',
        title: '台積電營收創新高，聯電獲利衰退',
        body: '',
        terms: ['聯電', '2303'],
        expect: 'bearish',
    },
    // 頓號並列共用述語：不拆，兩檔同向
    {
        name: '頓號並列-前者',
        title: '台積電、聯電同步大漲',
        body: '',
        terms: ['台積電', '2330'],
        expect: 'bullish',
    },
    {
        name: '頓號並列-後者',
        title: '台積電、聯電同步大漲',
        body: '',
        terms: ['聯電', '2303'],
        expect: 'bullish',
    },
    // 內文句級歸因（標題沒點名）
    {
        name: '內文歸因-利空側',
        title: '半導體股表現分歧',
        body: '台積電獲利亮眼再創高。聯電遭外資調降評等，賣壓沉重。',
        terms: ['聯電', '2303'],
        expect: 'bearish',
    },
    // 否定翻轉在子句內仍生效
    {
        name: '否定翻轉',
        title: '台積電獲利不如預期，聯電由虧轉盈',
        body: '',
        terms: ['台積電', '2330'],
        expect: 'bearish',
    },
    {
        name: '否定翻轉-對照組',
        title: '台積電獲利不如預期，聯電由虧轉盈',
        body: '',
        terms: ['聯電', '2303'],
        expect: 'bullish',
    },
    // 整篇都沒點名（結構化標籤才認列）→ 退回整篇判讀
    {
        name: '整篇退回',
        title: '晶圓代工龍頭訂單滿手，產能滿載',
        body: '',
        terms: ['台積電', '2330'],
        expect: 'bullish',
    },
    // 主詞歸屬：「別人挑戰 X」對 X 是利空，挑戰者的利多詞不算給 X
    {
        name: '被挑戰-利空歸戶',
        title: '英特爾EMIB-T封裝良率衝上90%、加碼俄亥俄廠 挑戰台積電CoWoS',
        body: '',
        terms: ['台積電', '2330'],
        expect: 'bearish',
    },
    {
        name: '被挑戰-逗號子句版',
        title: '英特爾先進封裝報捷，挑戰台積電龍頭地位',
        body: '',
        terms: ['台積電', '2330'],
        expect: 'bearish',
    },
    // 主詞是自己（X 挑戰別人）不觸發被挑戰規則
    {
        name: '主詞是自己不誤翻',
        title: '台積電威脅三星先進製程地位',
        body: '',
        terms: ['台積電', '2330'],
        expect: 'neutral',
    },
    // 「逾2330億」不可誤當台積電代碼命中；股名也沒出現 → 整篇退回。
    // 整篇口徑下「買超」與「重挫」分數打平 → 中性。若防護失效、
    // 「外資買超逾2330億元」被當成台積電子句，會錯判成 bullish。
    {
        name: '代碼假命中防護',
        title: '外資買超逾2330億元，聯電重挫',
        body: '',
        terms: ['台積電', '2330'],
        expect: 'neutral',
    },
];

let pass = 0;
const failures: string[] = [];
for (const c of CASES) {
    const got = classifyStockSentiment(c.title, c.body, c.terms).sentiment;
    if (got === c.expect) {
        pass += 1;
    } else {
        failures.push(`✗ ${c.name}: expect ${c.expect}, got ${got}`);
    }
}

console.log(`check-stock-sentiment: ${pass}/${CASES.length} passed`);
for (const f of failures) console.error(f);
if (failures.length > 0) process.exit(1);
