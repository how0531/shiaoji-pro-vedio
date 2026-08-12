// src/lib/news.ts — 財經新聞聚合層
//
// 來源清單直接取自 how0531/get-stock-news 的 data/site_maps（只收該檔標記
// stock_relevant 的欄目），2026-07-26 逐條實測後才列進來。實測淘汰：中時
// realtimenews-finance.xml 已 404、自由財經 ec.ltn.com.tw 連不上、MoneyDJ
// RssCenter 的 fno/arg 組合回空 channel（site_map 自己也註明未驗證）。
//
// 這些站沒有一家送 Access-Control-Allow-Origin，瀏覽器直連必被 CORS 擋，
// 所以走三條路：桌面版用 Tauri 的 Rust-side fetch（不受 CORS 管）、dev 走
// vite proxy（見 vite.config.ts 的 /news/*）、純 web 正式版只能直連，失敗
// 時面板會說明原因而不是空白。

import { isTauri } from './runtime';

export type FeedGroup = 'tw' | 'global' | 'announce';
export type FeedKind = 'cnyes' | 'rss' | 'mops';

export interface Feed {
    id: string;
    source: string; // 來源代號，也是 proxy 前綴
    sourceLabel: string; // 顯示用（鉅亨網、Yahoo 股市…）
    label: string; // 欄目名，沿用 site_maps 的命名
    group: FeedGroup;
    kind: FeedKind;
    url: string;
}

export interface NewsStock {
    code: string;
    name: string;
}

export interface NewsItem {
    id: string; // 去重鍵：url 優先，沒有才用標題
    title: string;
    summary: string;
    url: string; // 空字串 = 無外部連結（MOPS 重大訊息）
    source: string;
    sourceLabel: string;
    category: string;
    publishAt: number; // epoch ms，0 = 來源沒給時間
    stocks: NewsStock[]; // 目前只有鉅亨與 MOPS 帶結構化個股
    keywords: string[];
    // 利多/利空（規則層，見 news-sentiment.ts）。抓取時不填，今日焦點
    // 彙整時逐則補上並藉物件快取自然記憶，其他面板可無視此欄位
    sentiment?: import('./news-sentiment').Sentiment;
}

const CNYES_API = 'https://api.cnyes.com/media/api/v1/newslist/category/';

function cnyes(category: string, label: string, group: FeedGroup): Feed {
    return {
        id: `cnyes-${category}`,
        source: 'cnyes',
        sourceLabel: '鉅亨網',
        label,
        group,
        kind: 'cnyes',
        url: `${CNYES_API}${category}?limit=30`,
    };
}

function yahoo(category: string, label: string, group: FeedGroup): Feed {
    return {
        id: `yahoo-${category}`,
        source: 'yahoo',
        sourceLabel: 'Yahoo 股市',
        label,
        group,
        kind: 'rss',
        url: `https://tw.stock.yahoo.com/rss?category=${category}`,
    };
}

function udn(cate: string, label: string, group: FeedGroup): Feed {
    return {
        id: `udn-${cate}`,
        source: 'udn',
        sourceLabel: '經濟日報',
        label,
        group,
        kind: 'rss',
        url: `https://money.udn.com/rssfeed/news/1001/${cate}?ch=money`,
    };
}

export const FEEDS: Feed[] = [
    // 鉅亨網 — 唯一帶「相關個股」結構化欄位的來源，所以排最前面
    cnyes('tw_stock_news', '台股新聞', 'tw'),
    cnyes('tw_stock', '台股', 'tw'),
    cnyes('headline', '頭條', 'tw'),
    cnyes('wd_stock', '美股/國際股', 'global'),
    cnyes('wd_macro', '國際政經', 'global'),
    cnyes('us_forecast', '美股預估', 'global'),
    // Yahoo 股市
    yahoo('tw-market', '台股', 'tw'),
    yahoo('research', '研究報告', 'tw'),
    yahoo('intl-markets', '國際股市', 'global'),
    // 經濟日報
    udn('5590', '證券', 'tw'),
    udn('5588', '國際', 'global'),
    // 中央社產經、科技新報財經
    {
        id: 'cna-finance',
        source: 'cna',
        sourceLabel: '中央社',
        label: '財經',
        group: 'tw',
        kind: 'rss',
        url: 'https://feeds.feedburner.com/rsscna/finance',
    },
    {
        id: 'technews-finance',
        source: 'technews',
        sourceLabel: '科技新報',
        label: '財經',
        group: 'tw',
        kind: 'rss',
        url: 'https://finance.technews.tw/feed/',
    },
    // 證交所 / 櫃買中心 每日重大訊息（法定公告，最權威的個股事件來源）
    {
        id: 'twse-mops',
        source: 'twse',
        sourceLabel: '證交所',
        label: '上市重大訊息',
        group: 'announce',
        kind: 'mops',
        url: 'https://openapi.twse.com.tw/v1/opendata/t187ap04_L',
    },
    {
        id: 'tpex-mops',
        source: 'tpex',
        sourceLabel: '櫃買中心',
        label: '上櫃重大訊息',
        group: 'announce',
        kind: 'mops',
        url: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O',
    },
];

// dev proxy 前綴（與 vite.config.ts 的 server.proxy 一一對應）
const PROXY_ORIGINS: { origin: string; prefix: string }[] = [
    { origin: 'https://api.cnyes.com', prefix: '/news/cnyes' },
    { origin: 'https://tw.stock.yahoo.com', prefix: '/news/yahoo' },
    { origin: 'https://money.udn.com', prefix: '/news/udn' },
    { origin: 'https://feeds.feedburner.com', prefix: '/news/cna' },
    { origin: 'https://finance.technews.tw', prefix: '/news/technews' },
    { origin: 'https://openapi.twse.com.tw', prefix: '/news/twse' },
    { origin: 'https://www.tpex.org.tw', prefix: '/news/tpex' },
];

function proxied(url: string): string {
    for (const rule of PROXY_ORIGINS) {
        if (url.startsWith(rule.origin)) {
            return rule.prefix + url.slice(rule.origin.length);
        }
    }
    return url;
}

// 鉅亨 API 會擋沒有來源標頭的請求 —— get-stock-news 的 cnyes.py 同樣帶這兩個。
// 瀏覽器禁止腳本設 Origin/Referer（設了會被靜默丟掉），所以只在 Tauri 的
// Rust-side fetch 帶；dev 由 vite proxy 補（見 vite.config.ts）。
const UPSTREAM_HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    Origin: 'https://news.cnyes.com',
    Referer: 'https://news.cnyes.com/',
};

async function fetchUpstream(
    url: string,
    signal?: AbortSignal,
): Promise<Response> {
    if (isTauri) {
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
        // Origin/Referer 只有鉅亨要（其他家帶了反而可能被擋），與 vite
        // proxy 的每站設定對齊
        const headers = url.startsWith('https://api.cnyes.com')
            ? UPSTREAM_HEADERS
            : { 'User-Agent': UPSTREAM_HEADERS['User-Agent']! };
        return tauriFetch(url, { headers, signal });
    }
    // web 態一律走相對路徑：dev 與 preview 都有 proxy（見 vite.config.ts
    // 的 server.proxy / preview.proxy）。純靜態託管沒有 proxy 會失敗，但
    // 那條路直連本來也會被 CORS 擋，面板已有降級說明。
    return fetch(proxied(url), { signal });
}

// ---- 各來源的解析 ----

interface CnyesItem {
    newsId?: number;
    title?: string;
    summary?: string;
    publishAt?: number;
    keyword?: string[];
    market?: { code?: string; name?: string }[];
}

function parseCnyes(json: unknown, feed: Feed): NewsItem[] {
    const data = (json as { items?: { data?: CnyesItem[] } })?.items?.data;
    if (!Array.isArray(data)) return [];
    return data.flatMap((raw) => {
        const title = (raw.title ?? '').trim();
        if (!title) return [];
        const url = raw.newsId
            ? `https://news.cnyes.com/news/id/${raw.newsId}`
            : '';
        return [
            {
                id: url || title,
                title,
                summary: (raw.summary ?? '').trim(),
                url,
                source: feed.source,
                sourceLabel: feed.sourceLabel,
                category: feed.label,
                publishAt: raw.publishAt ? raw.publishAt * 1000 : 0,
                stocks: (raw.market ?? [])
                    .filter((m) => m.code)
                    .map((m) => ({ code: m.code!, name: m.name ?? '' })),
                keywords: raw.keyword ?? [],
            },
        ];
    });
}

function textOf(parent: Element, tag: string): string {
    const el = parent.getElementsByTagName(tag)[0];
    return el?.textContent?.trim() ?? '';
}

// RSS 的 description 常整段塞 HTML（Yahoo 甚至塞圖片），取純文字當摘要
function stripHtml(html: string): string {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function parseRss(xml: string, feed: Feed): NewsItem[] {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return [];
    const nodes = Array.from(doc.getElementsByTagName('item'));
    const entries = nodes.length
        ? nodes
        : Array.from(doc.getElementsByTagName('entry')); // Atom fallback
    return entries.flatMap((node) => {
        const title = textOf(node, 'title');
        if (!title) return [];
        const link =
            textOf(node, 'link') ||
            node.getElementsByTagName('link')[0]?.getAttribute('href') ||
            '';
        const published =
            textOf(node, 'pubDate') ||
            textOf(node, 'published') ||
            textOf(node, 'updated');
        const at = published ? Date.parse(published) : NaN;
        return [
            {
                id: link || title,
                title,
                summary: stripHtml(
                    textOf(node, 'description') || textOf(node, 'summary'),
                ).slice(0, 200),
                url: link,
                source: feed.source,
                sourceLabel: feed.sourceLabel,
                category: feed.label,
                publishAt: Number.isNaN(at) ? 0 : at,
                stocks: [],
                keywords: [],
            },
        ];
    });
}

// 民國日期 '1150726' + 時間 '70003'（HHMMSS，小時不補零）→ epoch ms
function rocDateTime(date: string, time: string): number {
    const m = /^(\d{2,3})(\d{2})(\d{2})$/.exec(date.trim());
    if (!m) return 0;
    const hms = time.trim().padStart(6, '0');
    const at = new Date(
        Number(m[1]) + 1911,
        Number(m[2]) - 1,
        Number(m[3]),
        Number(hms.slice(0, 2)),
        Number(hms.slice(2, 4)),
        Number(hms.slice(4, 6)),
    ).getTime();
    return Number.isNaN(at) ? 0 : at;
}

// 上市與上櫃的欄位名不一致：上市用「公司代號/公司名稱/主旨 」（主旨後面真的
// 多一個空白），上櫃用 SecuritiesCompanyCode/CompanyName/主旨。兩邊都收。
function parseMops(json: unknown, feed: Feed): NewsItem[] {
    if (!Array.isArray(json)) return [];
    return (json as Record<string, string>[]).flatMap((row) => {
        const code = (row['公司代號'] ?? row['SecuritiesCompanyCode'] ?? '').trim();
        const name = (row['公司名稱'] ?? row['CompanyName'] ?? '').trim();
        const subject = (row['主旨 '] ?? row['主旨'] ?? '').replace(/\s+/g, ' ').trim();
        if (!code || !subject) return [];
        const publishAt = rocDateTime(row['發言日期'] ?? '', row['發言時間'] ?? '');
        return [
            {
                id: `mops-${code}-${row['發言日期'] ?? ''}-${row['發言時間'] ?? ''}-${subject.slice(0, 20)}`,
                title: subject,
                summary: (row['說明'] ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
                url: '', // MOPS 沒有可直連的單篇網址
                source: feed.source,
                sourceLabel: feed.sourceLabel,
                category: feed.label,
                publishAt,
                stocks: [{ code, name }],
                keywords: [],
            },
        ];
    });
}

// ---- 抓取 ----

const CACHE_TTL = 60_000;
const cache = new Map<string, { at: number; items: NewsItem[] }>();

async function fetchFeed(feed: Feed, signal?: AbortSignal): Promise<NewsItem[]> {
    const hit = cache.get(feed.id);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.items;

    const res = await fetchUpstream(feed.url, signal);
    if (!res.ok) throw new Error(`${feed.sourceLabel} ${res.status}`);
    const items =
        feed.kind === 'rss'
            ? parseRss(await res.text(), feed)
            : feed.kind === 'cnyes'
              ? parseCnyes(await res.json(), feed)
              : parseMops(await res.json(), feed);
    cache.set(feed.id, { at: Date.now(), items });
    return items;
}

export interface NewsResult {
    items: NewsItem[];
    failed: string[]; // 抓失敗的來源標籤，面板用來提示而不是整片空白
}

// 同組來源全部並行抓；一家掛掉不影響其他家（沿用 get-stock-news 的做法）
export async function fetchNews(
    group: FeedGroup,
    signal?: AbortSignal,
): Promise<NewsResult> {
    const feeds = FEEDS.filter((f) => f.group === group);
    const settled = await Promise.allSettled(
        feeds.map((f) => fetchFeed(f, signal)),
    );
    const items: NewsItem[] = [];
    const failed: string[] = [];
    settled.forEach((r, i) => {
        const feed = feeds[i]!;
        if (r.status === 'fulfilled') items.push(...r.value);
        else failed.push(`${feed.sourceLabel}·${feed.label}`);
    });
    return { items: dedupe(items), failed };
}

// 同一則常被多家轉載，url 相同或標題完全相同就視為同一則（先到的留下）。
// 用 it.id 而不是 url||title：cnyes/RSS 的 id 本來就等於 url||title，行為
// 不變；但 MOPS 沒有單篇網址，用標題會把「公告受邀參加法說會」這種多家
// 公司逐字相同的法定公告誤併成一則，漏掉其他公司（id 已含公司代號）。
function dedupe(items: NewsItem[]): NewsItem[] {
    const seen = new Set<string>();
    const out: NewsItem[] = [];
    for (const it of items) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        out.push(it);
    }
    return out.sort((a, b) => b.publishAt - a.publishAt);
}

// 個股比對：股名直接找，代號要擋掉「逾2330億」「12330張」這類假命中。
// 用 (^|非數字) 的寫法而不是 lookbehind —— build target 含 safari13，
// 舊 WebKit 遇到 (?<!) 會直接在建構 regex 時炸掉。
export function newsMatchesStock(
    item: NewsItem,
    code: string,
    name: string,
): boolean {
    if (item.stocks.some((s) => s.code === code)) return true;
    const blob = `${item.title} ${item.summary} ${item.keywords.join(' ')}`;
    if (name && blob.includes(name)) return true;
    if (!code) return false;
    return new RegExp(`(^|[^0-9])${code}([^0-9億萬點元張]|$)`).test(blob);
}
