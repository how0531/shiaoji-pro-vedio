// src/lib/news-digest.ts — 今日焦點：當日新聞彙整＋重點個股排行
//
// 流程（沿用 how0531/get-stock-news 的字典比對思路）：各家新聞（重用
// lib/news.ts 的三組來源與 60s 快取）→ 過濾出當天 → 個股辨識雙引擎：
// ① 鉅亨/MOPS 的結構化個股欄位（高信度）② 全市場股名字典掃描標題/摘要/
// 關鍵字（loadStockCatalog 的股名只掃 4 碼普通股，避免權證雜訊）→ 依
// 「被幾則新聞提及」排行 → 前 N 名補類股（loadStockDetails）與即時漲跌
// （fetchSnapshots，手刻 ContractBase literal，比照 sector-heatmap）。
//
// 刻意不掃內文裡的裸代號 —— 「逾2330億」這類假命中防不勝防（見
// news.ts 的 newsMatchesStock），結構化來源已帶代號，字典只認股名。

import { fetchNews, type FeedGroup, type NewsItem } from './news';
import { fetchSnapshots } from './shioaji';
import {
    loadStockCatalog,
    loadStockDetails,
    sectorLabel,
    type StockMeta,
} from './stock-index';

export interface DigestStock {
    code: string;
    name: string;
    sector: string; // 可讀類股名，'' = 未知
    mentions: number; // 提及的新聞則數（去重後）
    latestAt: number; // 最新一則提及時間
    items: NewsItem[]; // 提及的新聞，最新在前
    close?: number; // 現價（snapshot）
    changeRate?: number; // 漲跌幅 %（snapshot）
}

export interface Digest {
    stocks: DigestStock[];
    totalNews: number; // 當日新聞總數（跨來源去重後）
    failed: string[]; // 抓失敗的來源標籤（沿用 news.ts 慣例）
    generatedAt: number;
}

const GROUPS: FeedGroup[] = ['tw', 'global', 'announce'];
const TOP_N = 20;

// loadStockDetails 每檔一個請求 —— 排行名單跨輪重疊度高，補過的就記住
const detailsCache = new Map<string, StockMeta>();

// 股名字典：4 碼普通股且 catalog 真的有股名（fallback 成代號的不算）
function buildDict(catalog: StockMeta[]): StockMeta[] {
    return catalog.filter(
        (s) => s.code.length === 4 && s.name && s.name !== s.code,
    );
}

// 「長榮航」的新聞會連帶命中「長榮」—— 命中若 A 名是 B 名的子字串，把
// blob 裡的 B 全部挖掉後 A 還在才算數。names 要含「結構化通道已認列」的
// 股名：鉅亨台股新聞幾乎都帶結構化欄位，長名走那條路時不在 hits 裡，
// 光比對 hits 會讓短名（長榮）每則都被灌水。
function pruneSubstringHits(
    hits: { code: string; name: string }[],
    names: string[],
    blob: string,
): { code: string; name: string }[] {
    return hits.filter((a) => {
        const longer = names.filter(
            (n) => n.length > a.name.length && n.includes(a.name),
        );
        if (longer.length === 0) return true;
        let stripped = blob;
        for (const n of longer) stripped = stripped.split(n).join('');
        return stripped.includes(a.name);
    });
}

// 一輪彙整要打十幾個外部來源，比 60 秒輪詢慢是常態；同時間只跑一輪，
// 重複呼叫（輪詢撞上手動重試）共用同一個 promise，避免堆疊與舊蓋新
let inflight: Promise<Digest> | null = null;

export function fetchDigest(): Promise<Digest> {
    if (!inflight) {
        inflight = runDigest().finally(() => {
            inflight = null;
        });
    }
    return inflight;
}

async function runDigest(): Promise<Digest> {
    // 沒有 shioaji server（純 web、未登入）時目錄拿不到 —— 退回只用
    // 結構化個股欄位辨識（沒類股/漲跌，但彙整照常），不讓整個面板失敗
    const [results, catalog] = await Promise.all([
        Promise.all(GROUPS.map((g) => fetchNews(g))),
        loadStockCatalog().catch((): StockMeta[] => []),
    ]);
    const failed = [...new Set(results.flatMap((r) => r.failed))];

    // 跨組再去重一次（同一則可能同時進台股與國際組）＋只留當天
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const seen = new Set<string>();
    const today: NewsItem[] = [];
    for (const item of results.flatMap((r) => r.items)) {
        if (item.publishAt < dayStart.getTime()) continue;
        if (seen.has(item.id)) continue; // 同 news.ts dedupe，用 id 不用標題
        seen.add(item.id);
        today.push(item);
    }

    const dict = buildDict(catalog);
    const catalogByCode = new Map(catalog.map((s) => [s.code, s]));
    // 鉅亨的頭條/國際欄目會標記陸股（688825 科創板、002594 深市這類），
    // 有目錄時以台股目錄驗證；沒目錄（無 server 降級）時用啟發式：4 碼
    // 普通股，或 00 開頭 5 碼 ETF（00878）與 009 開頭 6 碼（009816）。
    // 深市 000/002 開頭正好是 6 碼且以 00 起頭，所以 6 碼只放行 009。
    const isTwCode = (code: string) =>
        catalogByCode.size > 0
            ? catalogByCode.has(code)
            : /^\d{4}$/.test(code) ||
              /^00\d{3}$/.test(code) ||
              /^009\d{3}$/.test(code);
    const byCode = new Map<string, { name: string; items: NewsItem[] }>();
    const record = (code: string, name: string, item: NewsItem) => {
        const entry = byCode.get(code) ?? { name, items: [] };
        if (!entry.name && name) entry.name = name;
        entry.items.push(item);
        byCode.set(code, entry);
    };

    for (const item of today) {
        const structured = new Set<string>();
        for (const s of item.stocks) {
            if (!isTwCode(s.code)) continue; // 擋美股/陸股代號與指數
            if (structured.has(s.code)) continue;
            structured.add(s.code);
            record(s.code, s.name, item);
        }
        const blob = `${item.title} ${item.summary} ${item.keywords.join(' ')}`;
        const allHits = dict.filter((d) => blob.includes(d.name));
        // prune 要看得到全部命中的股名（含結構化通道認列、可能不在目錄
        // 字典裡的長名），但只 record 還沒認列的，避免同一則重複計數
        const names = [
            ...allHits.map((d) => d.name),
            ...item.stocks.map((s) => s.name).filter(Boolean),
        ];
        for (const hit of pruneSubstringHits(allHits, names, blob)) {
            if (structured.has(hit.code)) continue;
            record(hit.code, hit.name, item);
        }
    }

    const ranked = [...byCode.entries()]
        .map(([code, entry]) => ({
            code,
            name: entry.name,
            items: [...entry.items].sort((a, b) => b.publishAt - a.publishAt),
            latestAt: entry.items.reduce(
                (max, it) => Math.max(max, it.publishAt),
                0,
            ),
        }))
        .sort(
            (a, b) =>
                b.items.length - a.items.length || b.latestAt - a.latestAt,
        )
        .slice(0, TOP_N);

    // 補類股/正式股名＋即時漲跌（單批 ≤ TOP_N，遠低於 40–80 的安全區間）
    const missingDetails = ranked
        .map((r) => r.code)
        .filter((code) => !detailsCache.has(code));
    const [details, snaps] = await Promise.all([
        missingDetails.length
            ? loadStockDetails(missingDetails).catch((): StockMeta[] => [])
            : Promise.resolve<StockMeta[]>([]),
        ranked.length
            ? fetchSnapshots(
                  ranked.map((r) => ({
                      security_type: 'STK' as const,
                      exchange: (catalogByCode.get(r.code)?.exchange ||
                          'TSE') as 'TSE',
                      code: r.code,
                      target_code: null,
                  })),
              ).catch(() => [])
            : Promise.resolve([]),
    ]);
    for (const d of details) detailsCache.set(d.code, d);
    const snapByCode = new Map(snaps.map((s) => [s.code, s]));

    const stocks: DigestStock[] = ranked.map((r) => {
        const detail = detailsCache.get(r.code);
        const snap = snapByCode.get(r.code);
        return {
            code: r.code,
            name: detail?.name || r.name || r.code,
            sector: detail?.category ? sectorLabel(detail.category) : '',
            mentions: r.items.length,
            latestAt: r.latestAt,
            items: r.items,
            close: snap?.close,
            changeRate: snap?.change_rate,
        };
    });

    return {
        stocks,
        totalNews: today.length,
        failed,
        generatedAt: Date.now(),
    };
}
