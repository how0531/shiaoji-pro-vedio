// src/components/news-feed.tsx — 財經新聞面板
//
// 多來源聚合（鉅亨/Yahoo/經濟日報/中央社/科技新報/證交所重大訊息，見
// lib/news.ts）。三個共通分頁 台股 / 國際 / 重大訊息，第四個「本商品」會
// 依面板連動或釘選的商品過濾出相關新聞。新聞裡的個股代號是可點的 —— 點
// 一下就跟排行榜、熱力圖一樣連動整個終端。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    fetchNews,
    newsMatchesStock,
    type FeedGroup,
    type NewsItem,
} from '../lib/news';
import { openExternalUrl } from '../lib/tauri';
import type { ContractInfo } from '../lib/types/contract';
import * as styles from './news-feed.css';

type Tab = FeedGroup | 'symbol';

const TABS: { key: Tab; label: string }[] = [
    { key: 'tw', label: '台股' },
    { key: 'global', label: '國際' },
    { key: 'announce', label: '重大訊息' },
    { key: 'symbol', label: '本商品' },
];

const TAB_KEY = 'sj-pro-news-tab';
const REFRESH_MS = 60000;
const MAX_ROWS = 120;

// 今天的只給時分（盤中最常看的是「多久前」），跨日再補日期
function fmtTime(at: number): string {
    if (!at) return '—';
    const d = new Date(at);
    const now = new Date();
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(
        d.getMinutes(),
    ).padStart(2, '0')}`;
    const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
    if (sameDay) return hm;
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(
        d.getDate(),
    ).padStart(2, '0')} ${hm}`;
}

export function NewsFeed({
    contract,
    onPick,
}: {
    contract: ContractInfo | null;
    onPick?: (code: string) => void;
}) {
    const [tab, setTab] = useState<Tab>(
        () => (localStorage.getItem(TAB_KEY) as Tab | null) ?? 'tw',
    );
    const [items, setItems] = useState<NewsItem[]>([]);
    const [failed, setFailed] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [reloadSeq, setReloadSeq] = useState(0);
    const [updatedAt, setUpdatedAt] = useState(0);
    // 釘選/連動的商品換掉時，個股分頁要立刻重抓
    const code = contract?.code ?? '';
    const name = contract?.name ?? '';
    const activeTab: Tab = tab === 'symbol' && !code ? 'tw' : tab;
    const groups: FeedGroup[] = useMemo(
        () =>
            activeTab === 'symbol'
                ? ['tw', 'global', 'announce']
                : [activeTab],
        [activeTab],
    );
    const groupsKey = groups.join(',');
    const seqRef = useRef(0);

    const load = useCallback(
        async (signal: AbortSignal) => {
            const seq = ++seqRef.current;
            setLoading(true);
            const results = await Promise.all(
                groups.map((g) => fetchNews(g, signal)),
            );
            if (signal.aborted || seq !== seqRef.current) return;
            // 個股分頁一次抓三組，各組內已排序但串起來會變三段；跨組去重
            // （同一則可能同時在台股與國際組）後依時間重排
            const merged: NewsItem[] = [];
            const seen = new Set<string>();
            for (const it of results.flatMap((r) => r.items)) {
                if (seen.has(it.id)) continue;
                seen.add(it.id);
                merged.push(it);
            }
            merged.sort((a, b) => b.publishAt - a.publishAt);
            setItems(merged);
            setFailed([...new Set(results.flatMap((r) => r.failed))]);
            setUpdatedAt(Date.now());
            setLoading(false);
        },
        // groups 是依 activeTab 算出來的，用字串當相依避免每次 render 重跑
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [groupsKey],
    );

    useEffect(() => {
        const ctrl = new AbortController();
        void load(ctrl.signal);
        const timer = setInterval(() => void load(ctrl.signal), REFRESH_MS);
        return () => {
            ctrl.abort();
            clearInterval(timer);
        };
    }, [load, reloadSeq]);

    const shown = useMemo(() => {
        const list =
            activeTab === 'symbol'
                ? items.filter((it) => newsMatchesStock(it, code, name))
                : items;
        return list.slice(0, MAX_ROWS);
    }, [items, activeTab, code, name]);

    const allFailed = failed.length > 0 && items.length === 0;

    return (
        <div className={styles.wrap}>
            <div className={styles.toolbar}>
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        className={styles.tab[activeTab === t.key ? 'on' : 'off']}
                        disabled={t.key === 'symbol' && !code}
                        title={
                            t.key === 'symbol'
                                ? code
                                    ? `只看與 ${code} ${name} 相關的新聞`
                                    : '選定商品後可用'
                                : undefined
                        }
                        onClick={() => {
                            setTab(t.key);
                            localStorage.setItem(TAB_KEY, t.key);
                        }}
                    >
                        {t.key === 'symbol' && code ? code : t.label}
                    </button>
                ))}
            </div>

            <div className={styles.list}>
                {allFailed && (
                    <div className={styles.notice}>
                        <span>新聞來源連不上</span>
                        <span>
                            {import.meta.env.DEV
                                ? '各家新聞站都沒開放 CORS，dev 需經 vite proxy（/news/*）'
                                : '瀏覽器版受 CORS 限制，桌面版可直接抓取'}
                        </span>
                        <button
                            className={styles.retryBtn}
                            onClick={() => setReloadSeq((s) => s + 1)}
                        >
                            重試
                        </button>
                    </div>
                )}
                {!allFailed && shown.length === 0 && (
                    <div className={styles.notice}>
                        {loading
                            ? '載入新聞…'
                            : activeTab === 'symbol'
                              ? `近期沒有提到 ${code} ${name} 的新聞`
                              : '目前沒有新聞'}
                    </div>
                )}
                {shown.map((it) => (
                    <div key={it.id} className={styles.row}>
                        <div className={styles.rowHead}>
                            <span className={styles.time}>
                                {fmtTime(it.publishAt)}
                            </span>
                            <span className={styles.sourceTag}>
                                {it.sourceLabel}
                            </span>
                            {it.url ? (
                                <button
                                    className={styles.title}
                                    title='開啟原文'
                                    onClick={() => void openExternalUrl(it.url)}
                                >
                                    {it.title}
                                </button>
                            ) : (
                                <span className={styles.titleFlat}>
                                    {it.title}
                                </span>
                            )}
                        </div>
                        {it.summary && (
                            <div className={styles.summary}>{it.summary}</div>
                        )}
                        {it.stocks.length > 0 && (
                            <div className={styles.chipRow}>
                                {it.stocks.map((s) => (
                                    <button
                                        key={s.code}
                                        className={styles.stockChip}
                                        title={`切換到 ${s.code} ${s.name}`}
                                        onClick={() => onPick?.(s.code)}
                                    >
                                        {s.code}
                                        {s.name && (
                                            <span
                                                className={styles.stockChipName}
                                            >
                                                {s.name}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className={styles.footer}>
                <span>
                    {shown.length} 則
                    {updatedAt ? ` · ${fmtTime(updatedAt)} 更新` : ''}
                </span>
                {failed.length > 0 && (
                    <span
                        className={styles.warn}
                        title={`抓取失敗：${failed.join('、')}`}
                    >
                        {failed.length} 個來源異常
                    </span>
                )}
            </div>
        </div>
    );
}
