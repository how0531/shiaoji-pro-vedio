// scripts/check-news-sentiment.ts — news-sentiment.ts 移植對照驗證
//
// 案例逐條取自 stock-news-skill news_sentiment.py 的 __main__ 自測（36 條，
// 含期望判定）。跑法：node scripts/check-news-sentiment.ts
// 全數一致 → exit 0；任何偏離 Python 版判定 → 列出並 exit 1。

import { classifySentiment } from '../src/lib/news-sentiment.ts';

type Case = [title: string, expect: string, body?: string];

const cases: Case[] = [
    // --- 基本利多 / 利空 / 中性 ---
    ['群創12月營收創新高 法人看好Q1', 'bullish'],
    ['希捷示警:AI 產能跟不上,建廠緩不濟急', 'bearish'],
    ['聯電法說會召開 第四季展望持平', 'neutral'],
    ['鴻海11月營收年增15% 訂單滿手', 'bullish'],
    ['緯創股利政策維持去年水準', 'neutral'],
    ['華邦電踩雷恆大 提列損失15億', 'bearish'],
    ['聯發科宣布購併矽智財公司XX', 'bullish'],
    // --- 主體區分：客戶砍單對被報導公司是利空 ---
    ['台積電遭客戶砍單 出貨大幅下修', 'bearish'],
    ['面板廠驚傳遭陸系客戶抽單 Q2恐轉虧', 'bearish'],
    // --- 反轉慣用語 ---
    ['台積電利空出盡 觸底反彈站回均線', 'bullish'],
    ['除息行情上演利多出盡 開高走低翻黑', 'bearish'],
    ['半導體庫存利空鈍化 外資回頭買超', 'bullish'],
    // --- 否定翻轉 ---
    ['面板報價未見回升 廠商營運仍承壓', 'bearish'],
    ['營收尚未轉佳 法人保守看待', 'bearish'],
    ['旺季效應不如預期 出貨動能轉弱', 'bearish'],
    // --- 轉折處理 ---
    ['營收創高，但毛利率大幅下滑 獲利衰退', 'bearish'],
    ['上半年表現平平，下半年訂單湧入 接單暢旺', 'bullish'],
    // --- 各類事件 ---
    ['XX生技訴訟敗訴 判賠12億元', 'bearish'],
    ['某金控宣布實施庫藏股 護盤護價', 'bullish'],
    ['某營建股辦理現金增資 每股70元', 'neutral'],
    ['外資連三日賣超台積電 調節逾兩萬張', 'bearish'],
    ['投信認養中小型股 連續買超帶量攻漲停', 'bullish'],
    // --- 財務危機事件 ---
    ['某公司票據跳票 恐打入全額交割股', 'bearish'],
    ['某電子廠調升全年財測目標 上修EPS預估', 'bullish'],
    // --- 內文輔助（標題中性，內文偏多）---
    [
        '某半導體廠召開法人說明會',
        'bullish',
        '公司表示在手訂單能見度高，產能滿載，毛利率提升，全年營收可望創高。',
    ],
    // --- 修復回歸：否定窗口跨子句不誤判、subject 尊重否定 ---
    ['公司並未擴產，但訂單滿手 出貨暢旺', 'bullish'],
    ['台積電未遭客戶砍單 營運穩健報喜', 'bullish'],
    // --- 跨產業 ---
    ['長榮海運價走揚 貨櫃缺櫃一櫃難求', 'bullish'],
    ['貨櫃三雄運價崩跌 Q3獲利恐重挫', 'bearish'],
    ['國泰金淨利差擴大 放款成長帶動獲利', 'bullish'],
    ['某銀行逾放比攀升 增提呆帳侵蝕獲利', 'bearish'],
    ['某建商新案完銷 推案熱銷帶動入帳', 'bullish'],
    ['房市降溫 預售退訂潮湧現 建商營運承壓', 'bearish'],
    ['晶華來客回流 訂房率攀升 報復性消費發酵', 'bullish'],
    ['中鋼報價走揚 開工率提升 鋼市轉強', 'bullish'],
    ['台塑報價崩跌 認列庫存跌價損失', 'bearish'],
    ['某產險防疫保單鉅額理賠 全年恐由盈轉虧', 'bearish'],
];

let miss = 0;
for (const [title, expect, body] of cases) {
    const r = classifySentiment(title, body ?? '');
    if (r.sentiment !== expect) {
        miss += 1;
        console.log(`MISS: ${title}`);
        console.log(`      got=${r.sentiment} (conf=${r.confidence}) expect=${expect}`);
    }
}

console.log(`${cases.length - miss}/${cases.length} 與 Python 版判定一致，${miss} 個偏離。`);
process.exit(miss > 0 ? 1 : 0);
