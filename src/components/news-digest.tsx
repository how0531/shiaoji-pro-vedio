// src/components/news-digest.tsx — 今日焦點面板
//
// 各家新聞 → 彙整重點訊息 → 列出個股清單（見 lib/news-digest.ts）。
// 排行列＝當天被新聞提及最多的個股（附類股與即時漲跌），點列展開該股
// 當日頭條，點代號 chip 則跟排行榜/熱力圖一樣連動整個終端。
// 頂部「多空總覽」直接點名利多最強 / 利空最重個股；逐則多空標籤採
// 句級歸因（對本檔的方向，不是整篇文章的方向）。

import { useCallback, useState } from 'react';
import { usePoll } from '../hooks/use-poll';
import { fetchDigest, type Digest, type DigestStock } from '../lib/news-digest';
import { openExternalUrl } from '../lib/tauri';
import * as styles from './news-digest.css';

const REFRESH_MS = 60000; // 與 news.ts 的來源快取 TTL 對齊

type SentiFilter = 'all' | 'bull' | 'bear';

function fmtTime(at: number): string {
    if (!at) return '—';
    const d = new Date(at);
    return `${String(d.getHours()).padStart(2, '0')}:${String(
        d.getMinutes(),
    ).padStart(2, '0')}`;
}

function fmtPct(rate: number | undefined): string {
    if (rate === undefined || Number.isNaN(rate)) return '—';
    const sign = rate > 0 ? '+' : '';
    return `${sign}${rate.toFixed(2)}%`;
}

function pctKind(rate: number | undefined): 'up' | 'down' | 'flat' {
    if (rate === undefined || Number.isNaN(rate) || rate === 0) return 'flat';
    return rate > 0 ? 'up' : 'down';
}

function netOf(s: DigestStock): number {
    return s.bulls - s.bears;
}

export function NewsDigest({ onPick }: { onPick?: (code: string) => void }) {
    const poll = usePoll<Digest>(
        useCallback(() => fetchDigest(), []),
        REFRESH_MS,
    );
    const digest = poll.data;
    const [expanded, setExpanded] = useState<string | null>(null);
    const [senti, setSenti] = useState<SentiFilter>('all');

    const maxMentions = digest?.stocks[0]?.mentions ?? 1;
    const allFailed =
        !!digest && digest.failed.length > 0 && digest.totalNews === 0;

    const stocks = digest?.stocks ?? [];
    // 淨向 = 利多則數 − 利空則數；正的進利多榜、負的進利空榜
    const bullTop = stocks
        .filter((s) => netOf(s) > 0)
        .sort((a, b) => netOf(b) - netOf(a))
        .slice(0, 5);
    const bearTop = stocks
        .filter((s) => netOf(s) < 0)
        .sort((a, b) => netOf(a) - netOf(b))
        .slice(0, 5);
    const bullCount = stocks.filter((s) => netOf(s) > 0).length;
    const bearCount = stocks.filter((s) => netOf(s) < 0).length;

    // 篩選不改排名：rank 取彙整原始名次，篩掉的列直接消失
    const rows = stocks
        .map((s, i) => ({ s, rank: i + 1 }))
        .filter(({ s }) =>
            senti === 'all'
                ? true
                : senti === 'bull'
                  ? netOf(s) > 0
                  : netOf(s) < 0,
        );

    const ovChip = (s: DigestStock, kind: 'bull' | 'bear') => (
        <button
            key={s.code}
            className={styles.ovChip[kind]}
            title={`${s.code} ${s.name} · ${s.bulls}多 ${s.bears}空 · 點擊連動終端`}
            onClick={() => onPick?.(s.code)}
        >
            {s.code}
            {s.name !== s.code && (
                <span className={styles.ovChipName}>{s.name}</span>
            )}
            <span className={styles.ovChipCount}>
                {s.bulls}多{s.bears > 0 ? `${s.bears}空` : ''}
            </span>
        </button>
    );

    return (
        <div className={styles.wrap}>
            {digest && !allFailed && (bullTop.length > 0 || bearTop.length > 0) && (
                <div className={styles.overview}>
                    {bullTop.length > 0 && (
                        <div className={styles.ovRow}>
                            <span className={styles.ovLabel.bull}>
                                利多最強
                            </span>
                            {bullTop.map((s) => ovChip(s, 'bull'))}
                        </div>
                    )}
                    {bearTop.length > 0 && (
                        <div className={styles.ovRow}>
                            <span className={styles.ovLabel.bear}>
                                利空最重
                            </span>
                            {bearTop.map((s) => ovChip(s, 'bear'))}
                        </div>
                    )}
                </div>
            )}
            {digest && !allFailed && stocks.length > 0 && (
                <div className={styles.filterBar}>
                    <button
                        className={styles.filterBtn[senti === 'all' ? 'on' : 'off']}
                        onClick={() => setSenti('all')}
                    >
                        全部 {stocks.length}
                    </button>
                    <button
                        className={styles.filterBtn[senti === 'bull' ? 'on' : 'off']}
                        onClick={() => setSenti('bull')}
                    >
                        利多 {bullCount}
                    </button>
                    <button
                        className={styles.filterBtn[senti === 'bear' ? 'on' : 'off']}
                        onClick={() => setSenti('bear')}
                    >
                        利空 {bearCount}
                    </button>
                </div>
            )}
            <div className={styles.list}>
                {!digest && (
                    <div className={styles.notice}>
                        {poll.error ? (
                            <>
                                <span>彙整失敗</span>
                                <span>{poll.error}</span>
                                <button
                                    className={styles.retryBtn}
                                    onClick={poll.refresh}
                                >
                                    重試
                                </button>
                            </>
                        ) : (
                            '彙整今日新聞…'
                        )}
                    </div>
                )}
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
                            onClick={poll.refresh}
                        >
                            重試
                        </button>
                    </div>
                )}
                {digest && !allFailed && stocks.length === 0 && (
                    <div className={styles.notice}>
                        今日新聞中尚未偵測到個股
                    </div>
                )}
                {digest && !allFailed && stocks.length > 0 && rows.length === 0 && (
                    <div className={styles.notice}>
                        沒有符合此篩選的個股
                    </div>
                )}
                {rows.map(({ s, rank }) => (
                    <div key={s.code}>
                        <button
                            className={styles.rankRow}
                            title={`展開 ${s.code} ${s.name} 的當日頭條 · 今日 ${s.mentions} 則提及`}
                            onClick={() =>
                                setExpanded(
                                    expanded === s.code ? null : s.code,
                                )
                            }
                        >
                            <span
                                className={styles.heatFill}
                                style={{
                                    width: `${Math.round(
                                        (s.mentions / maxMentions) * 100,
                                    )}%`,
                                }}
                            />
                            <span className={styles.rowInner}>
                                <span className={styles.rankNum}>{rank}</span>
                                <span
                                    className={styles.stockChip}
                                    role='button'
                                    title={`切換到 ${s.code} ${s.name}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onPick?.(s.code);
                                    }}
                                >
                                    {s.code}
                                    {s.name !== s.code && (
                                        <span
                                            className={styles.stockChipName}
                                        >
                                            {s.name}
                                        </span>
                                    )}
                                </span>
                                {s.sector && (
                                    <span className={styles.sectorTag}>
                                        {s.sector}
                                    </span>
                                )}
                                {s.bulls > 0 && (
                                    <span
                                        className={styles.senti.bull}
                                        title={`${s.bulls} 則利多`}
                                    >
                                        {s.bulls}多
                                    </span>
                                )}
                                {s.bears > 0 && (
                                    <span
                                        className={styles.senti.bear}
                                        title={`${s.bears} 則利空`}
                                    >
                                        {s.bears}空
                                    </span>
                                )}
                                <span
                                    className={
                                        styles.pct[pctKind(s.changeRate)]
                                    }
                                >
                                    {fmtPct(s.changeRate)}
                                </span>
                            </span>
                        </button>
                        {expanded === s.code && (
                            <div className={styles.itemList}>
                                {s.items.map((it, idx) => (
                                    <div
                                        key={it.id}
                                        className={styles.itemRow}
                                    >
                                        <span className={styles.time}>
                                            {fmtTime(it.publishAt)}
                                        </span>
                                        <span className={styles.sourceTag}>
                                            {it.sourceLabel}
                                        </span>
                                        {s.itemSentiments[idx] ===
                                            'bullish' && (
                                            <span
                                                className={styles.sentiTag.bull}
                                            >
                                                多
                                            </span>
                                        )}
                                        {s.itemSentiments[idx] ===
                                            'bearish' && (
                                            <span
                                                className={styles.sentiTag.bear}
                                            >
                                                空
                                            </span>
                                        )}
                                        {it.url ? (
                                            <button
                                                className={styles.title}
                                                title='開啟原文'
                                                onClick={() =>
                                                    void openExternalUrl(
                                                        it.url,
                                                    )
                                                }
                                            >
                                                {it.title}
                                            </button>
                                        ) : (
                                            <span
                                                className={
                                                    styles.titleFlat
                                                }
                                            >
                                                {it.title}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className={styles.footer}>
                <span>
                    {digest
                        ? `今日 ${digest.totalNews} 則 · 焦點 ${digest.stocks.length} 檔` +
                          (digest.roundups > 0
                              ? ` · 綜述排除 ${digest.roundups}`
                              : '') +
                          ` · ${fmtTime(digest.generatedAt)} 更新`
                        : ''}
                </span>
                {digest && digest.failed.length > 0 && (
                    <span
                        className={styles.warn}
                        title={`抓取失敗：${digest.failed.join('、')}`}
                    >
                        {digest.failed.length} 個來源異常
                    </span>
                )}
            </div>
        </div>
    );
}
