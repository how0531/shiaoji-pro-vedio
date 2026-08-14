// src/App.tsx — Shioaji Pro trading terminal
// Dynamic panel blocks on a draggable grid, with named layout profiles.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GridLayout, {
    useContainerWidth,
    type Layout,
    type LayoutItem,
} from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import * as styles from './App.css';
import * as grid from './grid.css';
import { BottomDock } from './components/bottom-dock';
import { CandleChart } from './components/candle-chart';
import { IntradayChart } from './components/intraday-chart';
import { IntradayWallPanel } from './components/intraday-wall';
import { CommandPalette } from './components/command-palette';
import { DepthLadder } from './components/depth-ladder';
import { EventToasts } from './components/event-toasts';
import { FlashOrder } from './components/flash-order';
import { HudHeader } from './components/hud-header';
import { OptionChain } from './components/option-chain';
import { PanelLibrary } from './components/panel-library';
import { PluginBlock } from './components/plugin-block';
import { PluginStoreDialog } from './components/plugin-store';
import * as libraryStyles from './components/panel-library.css';
import {
    broadcastSelectCode,
    onBroadcastSelectCode,
} from './lib/option-pick';
import { OrderTicket } from './components/order-ticket';
import { ChipsCard } from './components/chips-card';
import { ComboTicket } from './components/combo-ticket';
import { DebugPanel } from './components/debug-panel';
import { GridTicket } from './components/grid-ticket';
import { NewsDigest } from './components/news-digest';
import { NewsFeed } from './components/news-feed';
import { NoticeCenter } from './components/notice-center';
import { FeatureGate } from './components/feature-gate';
import { OptPayoff } from './components/opt-payoff';
import { SectorHeatmap } from './components/sector-heatmap';
import { PnlPanel } from './components/pnl-panel';
import { VolProfile } from './components/vol-profile';
import { ReplayPanel } from './components/replay-panel';
import { DepthMap } from './components/depth-map';
import { PanelChrome } from './components/panel-chrome';
import { QuoteBoard } from './components/quote-board';
import { ScannerPanel } from './components/scanner-panel';
import { TickTape } from './components/tick-tape';
import { TrayPanel } from './components/tray-panel';
import { Watchlist } from './components/watchlist';
import { StockFuturesPanel } from './components/stock-futures-panel';
import { WarrantPanel } from './components/warrant-panel';
import {
    MarketPulsePanel,
    MarketSignalPanel,
} from './components/market-pulse-panel';
import * as panel from './components/panel.css';
import { useHotkeys } from './hooks/use-hotkeys';
import { usePoll } from './hooks/use-poll';
import { useWatchlist } from './hooks/use-watchlist';
import { trackActivity } from './lib/activity';
import { agentModule, backtestModule } from './lib/features';
import {
    ensureContract,
    getCachedContract,
    useContract,
} from './lib/contracts-cache';
import { reportDailyPnl } from './lib/risk';
import { isTauri, openPopout } from './lib/tauri';
import {
    fetchAccountBalance,
    fetchMargin,
    fetchPositions,
    fetchTrades,
} from './lib/shioaji';
import { onOrderEvent } from './lib/stream';
import { ensureAccounts, getAccountState } from './lib/account-store';
import { getPanelDef, initPlugins, usePluginsState } from './lib/plugins/store';
import { notify } from './lib/trade';
import type { ContractInfo } from './lib/types/contract';
import type { Trade } from './lib/types/order';
import type { AccountedPosition, Position } from './lib/types/portfolio';
import {
    BLOCK_META,
    DEFAULT_WORKSPACE,
    GRID_COLS,
    LAYOUT_PRESETS,
    loadProfiles,
    loadWorkspace,
    newBlockId,
    saveProfiles,
    saveWorkspace,
    type Block,
    type BlockType,
    type PulseSection,
    type PulseSectionWeights,
    type Profile,
    type Workspace,
} from './lib/workspace';
import { Orb } from './components/orb';

const POPOUT_TYPES: ReadonlySet<string> = new Set([
    'chart',
    'intraday',
    'depth',
    'ticket',
    'tape',
    'flash',
    'chips',
    'volprofile',
    'optchain',
    'pnl',
    'replay',
    'depthmap',
    'news',
    'digest',
]);

const popoutQuery = new URLSearchParams(window.location.search);
const POPOUT_TYPE = popoutQuery.get('popout');
const POPOUT_CODE = popoutQuery.get('code') || null;

// resolves a block's contract: pinned code (contract cache) or global selection
function useBlockContract(
    block: Block,
    selected: ContractInfo | null,
): ContractInfo | null {
    const pinned = useContract(block.pin);
    useEffect(() => {
        if (block.pin && !pinned) {
            ensureContract(block.pin).catch(() =>
                notify({
                    kind: 'err',
                    title: '找不到商品',
                    body: `代碼 ${block.pin} 無法解析`,
                }),
            );
        }
    }, [block.pin, pinned]);
    return block.pin ? (pinned ?? null) : selected;
}

function BlockBody({
    block,
    contract,
    snapshot,
    watchlistProps,
    dockProps,
    onSelectCode,
    onPulseConfigChange,
    onWallConfigChange,
    refreshTrading,
}: {
    block: Block;
    contract: ContractInfo | null;
    snapshot?: import('./lib/types/market').Snapshot;
    watchlistProps: React.ComponentProps<typeof Watchlist>;
    dockProps: React.ComponentProps<typeof BottomDock>;
    onSelectCode: (code: string) => void;
    onPulseConfigChange: (
        id: string,
        sections: PulseSection[],
        weights: PulseSectionWeights,
    ) => void;
    onWallConfigChange: (
        id: string,
        list: string,
        cols: number,
        rows: number,
    ) => void;
    refreshTrading: () => void;
}) {
    if (contract?.security_type === 'IND' && indexBlockMessage(block.type)) {
        return <IndexBlockUnavailable type={block.type} />;
    }
    switch (block.type) {
        case 'watchlist':
            return <Watchlist {...watchlistProps} />;
        case 'movers':
            return <ScannerPanel onPick={onSelectCode} />;
        case 'dock':
            return <BottomDock {...dockProps} />;
        case 'chart':
            return contract ? (
                <>
                    <QuoteBoard contract={contract} snapshot={snapshot} />
                    <CandleChart
                        contract={contract}
                        trades={dockProps.trades}
                        onOrdersChanged={dockProps.onTradesChanged}
                    />
                </>
            ) : (
                <BlockPlaceholder />
            );
        case 'intraday':
            return contract ? (
                <IntradayChart contract={contract} />
            ) : (
                <BlockPlaceholder />
            );
        case 'intradaywall':
            return (
                <IntradayWallPanel
                    onPick={onSelectCode}
                    initialList={block.wallList}
                    initialCols={block.wallCols}
                    initialRows={block.wallRows}
                    onConfigChange={(list, cols, rows) =>
                        onWallConfigChange(block.id, list, cols, rows)
                    }
                />
            );
        case 'depth':
            return contract ? (
                <DepthLadder code={contract.code} />
            ) : (
                <BlockPlaceholder />
            );
        case 'ticket':
            return contract ? (
                <OrderTicket contract={contract} onPlaced={refreshTrading} />
            ) : (
                <BlockPlaceholder />
            );
        case 'tape':
            return contract ? (
                <TickTape contract={contract} />
            ) : (
                <BlockPlaceholder />
            );
        case 'flash':
            return contract ? (
                <FlashOrder
                    contract={contract}
                    trades={dockProps.trades}
                    positions={dockProps.positions}
                    onOrdersChanged={dockProps.onTradesChanged}
                />
            ) : (
                <BlockPlaceholder />
            );
        case 'pnl':
            return <PnlPanel />;
        case 'chips':
            return contract ? (
                <ChipsCard contract={contract} />
            ) : (
                <BlockPlaceholder />
            );
        case 'volprofile':
            return contract ? (
                <VolProfile contract={contract} />
            ) : (
                <BlockPlaceholder />
            );
        case 'optchain':
            return <OptionChain onPick={onSelectCode} />;
        case 'stockfutures':
            return (
                <StockFuturesPanel
                    onPick={onSelectCode}
                    onAdd={(selectedContract) =>
                        watchlistProps.onAdd(
                            selectedContract.code,
                            selectedContract.security_type,
                            selectedContract,
                        )
                    }
                />
            );
        case 'warrants':
            return (
                <WarrantPanel
                    onPick={onSelectCode}
                    onAdd={(selectedContract) =>
                        watchlistProps.onAdd(
                            selectedContract.code,
                            selectedContract.security_type,
                            selectedContract,
                        )
                    }
                />
            );
        case 'combo':
            return <ComboTicket />;
        case 'notices':
            return <NoticeCenter />;
        case 'debug':
            return <DebugPanel />;
        case 'grid':
            return contract ? (
                <GridTicket
                    contract={contract}
                    trades={dockProps.trades}
                    onOrdersChanged={dockProps.onTradesChanged}
                />
            ) : (
                <BlockPlaceholder />
            );
        case 'heatmap':
            return <SectorHeatmap onPick={onSelectCode} />;
        case 'pulse':
            return (
                <MarketPulsePanel
                    onPick={onSelectCode}
                    initialVisualization={block.pulseVisualization}
                    initialSections={block.pulseSections}
                    initialWeights={block.pulseWeights}
                    initialIndexCode={block.pulseIndex}
                    fixedIndex={Boolean(block.pulseIndex)}
                    fixedView="index"
                    onConfigChange={(sections, weights) =>
                        onPulseConfigChange(block.id, sections, weights)
                    }
                />
            );
        case 'signals':
            return <MarketSignalPanel onPick={onSelectCode} />;
        case 'news':
            return <NewsFeed contract={contract} onPick={onSelectCode} />;
        case 'digest':
            return <NewsDigest onPick={onSelectCode} />;
        case 'backtest': {
            const BtPanel = backtestModule?.Panel;
            return (
                <FeatureGate feature='backtest'>
                    {BtPanel ? (
                        <BtPanel contract={contract} onPick={onSelectCode} />
                    ) : null}
                </FeatureGate>
            );
        }
        case 'optpnl':
            return <OptPayoff positions={dockProps.positions} />;
        case 'assistant': {
            const Panel = agentModule?.Panel;
            return (
                <FeatureGate feature='agent'>
                    {Panel ? <Panel /> : null}
                </FeatureGate>
            );
        }
        case 'replay':
            return contract ? (
                <ReplayPanel contract={contract} />
            ) : (
                <BlockPlaceholder />
            );
        case 'depthmap':
            return contract ? (
                <DepthMap contract={contract} />
            ) : (
                <BlockPlaceholder />
            );
        case 'plugin':
            return <PluginBlock block={block} code={contract?.code ?? null} />;
    }
}

function BlockPlaceholder() {
    return <div className={styles.blockPlaceholder}>等待商品…</div>;
}

function indexBlockMessage(type: BlockType): string | null {
    if (type === 'depth' || type === 'depthmap') {
        return '指數 Quote 行情不含五檔委託資料';
    }
    if (type === 'tape' || type === 'volprofile') {
        return '指數沒有即時 Tick 串流，此面板不支援盤中更新';
    }
    if (type === 'flash' || type === 'grid') {
        return '指數商品不可下單';
    }
    return null;
}

function IndexBlockUnavailable({ type }: { type: BlockType }) {
    return (
        <div className={styles.blockPlaceholder}>
            {indexBlockMessage(type)}
        </div>
    );
}

interface BlockViewProps {
    block: Block;
    selected: ContractInfo | null;
    onPinChange: (id: string, pin: string | null) => void;
    onRemove: (id: string) => void;
    snapshot?: import('./lib/types/market').Snapshot;
    watchlistProps: React.ComponentProps<typeof Watchlist>;
    dockProps: React.ComponentProps<typeof BottomDock>;
    onSelectCode: (code: string) => void;
    onPulseConfigChange: (
        id: string,
        sections: PulseSection[],
        weights: PulseSectionWeights,
    ) => void;
    onWallConfigChange: (
        id: string,
        list: string,
        cols: number,
        rows: number,
    ) => void;
    refreshTrading: () => void;
}

function BlockView(props: BlockViewProps) {
    const { block, selected, onPinChange, onRemove, ...bodyProps } = props;
    const contract = useBlockContract(block, selected);
    const meta = BLOCK_META[block.type];
    // 外掛面板：優先用面板自己的 label/pinnable，面板停用或未安裝才落回
    // BLOCK_META.plugin 的通用備援
    const pluginDef =
        block.type === 'plugin' && block.pluginId && block.panelKey
            ? getPanelDef(block.pluginId, block.panelKey)
            : null;
    const label = pluginDef?.label ?? meta.label;
    const pinnable = pluginDef?.pinnable ?? meta.pinnable;
    const showSymbol = pinnable && contract ? ` · ${contract.code}` : '';
    const pulseMarket =
        block.type === 'pulse' && block.pulseIndex
            ? ` · ${block.pulseIndex === 'IX0001' ? '上市' : '上櫃'}`
            : '';

    return (
        <section className={panel.panel}>
            <PanelChrome
                title={`${label}${pulseMarket}${showSymbol}`}
                pinnable={pinnable}
                pin={block.pin}
                currentCode={selected?.code ?? null}
                onPinChange={(pin) => onPinChange(block.id, pin)}
                onRemove={() => onRemove(block.id)}
                onPopout={
                    POPOUT_TYPES.has(block.type)
                        ? () =>
                              void openPopout(
                                  block.type,
                                  // 今日焦點是全市場面板，別把當前商品帶進
                                  // 標題（會顯示成「今日焦點 · 2330」）
                                  block.type === 'digest'
                                      ? null
                                      : (contract?.code ?? null),
                              )
                        : undefined
                }
            />
            <BlockBody {...bodyProps} block={block} contract={contract} />
        </section>
    );
}

function PopoutView({
    type,
    code,
}: {
    type: BlockType;
    code: string | null;
}) {
    const contract = useContract(code);
    useEffect(() => {
        if (code) ensureContract(code).catch(() => undefined);
    }, [code]);
    // popouts can run 8+ at once (閃電全開) — longer intervals with a
    // per-window jitter so they don't hammer the upstream accounting
    // rate limit (25 req/5s) in lockstep
    const [pollJitter] = useState(() => Math.floor(Math.random() * 6000));
    const tradesPoll = usePoll<Trade[]>(
        useCallback(async () => {
            const [s, f] = await Promise.allSettled([
                fetchTrades('S'),
                fetchTrades('F'),
            ]);
            return [
                ...(s.status === 'fulfilled' ? s.value : []),
                ...(f.status === 'fulfilled' ? f.value : []),
            ];
        }, []),
        12000 + pollJitter,
    );
    const popoutPositionsPoll = usePoll<Position[]>(
        useCallback(async () => {
            const [st, fu] = await Promise.allSettled([
                fetchPositions('S'),
                fetchPositions('F'),
            ]);
            return [
                ...(st.status === 'fulfilled' ? st.value : []),
                ...(fu.status === 'fulfilled' ? fu.value : []),
            ];
        }, []),
        20000 + pollJitter,
    );
    const meta = BLOCK_META[type];

    let body: React.ReactNode = <BlockPlaceholder />;
    if (type === 'pnl') body = <PnlPanel />;
    else if (type === 'optchain')
        // popout T 字 click → switch the MAIN window's selected symbol so
        // 下單面板等連動面板跟著動（issue #1: T 字要同時連動下單面板）
        body = <OptionChain onPick={broadcastSelectCode} />;
    else if (type === 'combo') body = <ComboTicket />;
    // 新聞不需要商品也能看；點個股 chip 同樣連動主視窗
    else if (type === 'news')
        body = (
            <NewsFeed
                contract={contract ?? null}
                onPick={broadcastSelectCode}
            />
        );
    // 今日焦點是全市場面板，同樣不需要商品；點代號連動主視窗
    else if (type === 'digest')
        body = <NewsDigest onPick={broadcastSelectCode} />;
    else if (
        contract?.security_type === 'IND' &&
        indexBlockMessage(type)
    ) {
        body = <IndexBlockUnavailable type={type} />;
    } else if (contract) {
        switch (type) {
            case 'chart':
                body = (
                    <>
                        <QuoteBoard contract={contract} />
                        <CandleChart
                            contract={contract}
                            trades={tradesPoll.data ?? []}
                            onOrdersChanged={tradesPoll.refresh}
                        />
                    </>
                );
                break;
            case 'intraday':
                body = <IntradayChart contract={contract} />;
                break;
            case 'depth':
                body = <DepthLadder code={contract.code} />;
                break;
            case 'ticket':
                body = (
                    <OrderTicket
                        contract={contract}
                        onPlaced={tradesPoll.refresh}
                    />
                );
                break;
            case 'tape':
                body = <TickTape contract={contract} />;
                break;
            case 'flash':
                body = (
                    <FlashOrder
                        contract={contract}
                        trades={tradesPoll.data ?? []}
                        positions={popoutPositionsPoll.data ?? []}
                        onOrdersChanged={() => {
                            tradesPoll.refresh();
                            popoutPositionsPoll.refresh();
                        }}
                    />
                );
                break;
            case 'chips':
                body = <ChipsCard contract={contract} />;
                break;
            case 'volprofile':
                body = <VolProfile contract={contract} />;
                break;
            case 'replay':
                body = <ReplayPanel contract={contract} />;
                break;
            case 'depthmap':
                body = <DepthMap contract={contract} />;
                break;
            default:
                break;
        }
    }

    return (
        <div className={styles.shell}>
            <EventToasts />
            <section className={panel.panel} style={{ flex: 1, margin: 6 }}>
                <PanelChrome
                    title={`${meta.label}${contract ? ` · ${contract.code}` : ''}`}
                />
                {body}
            </section>
        </div>
    );
}

export default function App() {
    const {
        items,
        loading,
        initialLoading,
        addSymbol,
        removeSymbol,
        reorderSymbol,
        serverLists,
        activeListId,
        setActiveList,
        createList,
        renameCurrentList,
        deleteCurrentList,
    } = useWatchlist();
    // 訂閱外掛載入狀態：外掛非同步載入完成後，已在版面中的外掛面板標題／
    // 面板庫的新增清單都要跟著重繪，見 BlockView 與 PanelLibrary 內部用法
    usePluginsState();
    const [selected, setSelected] = useState<ContractInfo | null>(null);
    const cachedSelected = useContract(selected?.code ?? null);
    const [workspace, setWorkspace] = useState<Workspace>(loadWorkspace);
    const [profiles, setProfiles] = useState<Profile[]>(loadProfiles);
    const { width, containerRef, mounted } = useContainerWidth();

    // first loaded watchlist item becomes the active symbol
    useEffect(() => {
        const first = items[0];
        if (!selected && first) {
            setSelected(first.contract);
            return;
        }
        if (selected) {
            const refreshed = items.find(
                (item) => item.contract.code === selected.code,
            );
            // 只在 items 的物件就是 contract cache 的最新物件時才採用 —
            // 若其他面板（權證/個股期/走勢牆）對同一檔 prime 了另一個物
            // 件，這裡採 items 版、下面的 cachedSelected effect 採 cache
            // 版，兩個 effect 會互相覆寫成無限 re-render（K 線/走勢圖
            // 每輪都重抓 kbars 的風暴）。cache 是唯一權威來源；自選清單
            // 載入時本來就會把自己的物件 prime 進 cache，不會漏更新
            if (
                refreshed &&
                refreshed.contract !== selected &&
                (getCachedContract(selected.code) ?? refreshed.contract) ===
                    refreshed.contract
            ) {
                setSelected(refreshed.contract);
            }
        }
    }, [items, selected]);

    // Contract V2 info is refreshed after daily maintenance/update events.
    // Keep selections opened outside the active watchlist on the refreshed
    // cache object as well, so limits/reference never remain on yesterday.
    useEffect(() => {
        if (cachedSelected && cachedSelected !== selected) {
            setSelected(cachedSelected);
        }
    }, [cachedSelected, selected]);

    // portfolio polling — one request per signed account, rows tagged with
    // their source account so the dock can group/filter 分帳戶; falls back to
    // the plain S/F pair until the account list has loaded
    useEffect(ensureAccounts, []);
    const positionsPoll = usePoll<AccountedPosition[]>(
        useCallback(async () => {
            // signed only — the store now keeps unsigned accounts for
            // display, but they can't be queried for positions/orders
            const tradable = getAccountState().accounts.filter(
                (a) =>
                    a.signed &&
                    (a.account_type === 'S' || a.account_type === 'F'),
            );
            if (tradable.length > 0) {
                const rs = await Promise.allSettled(
                    tradable.map(async (a) => {
                        const ps = await fetchPositions(
                            a.account_type as 'S' | 'F',
                            a,
                        );
                        return ps.map((p) => ({ ...p, account: a }));
                    }),
                );
                return rs.flatMap((r) =>
                    r.status === 'fulfilled' ? r.value : [],
                );
            }
            const [st, fu] = await Promise.allSettled([
                fetchPositions('S'),
                fetchPositions('F'),
            ]);
            return [
                ...(st.status === 'fulfilled' ? st.value : []),
                ...(fu.status === 'fulfilled' ? fu.value : []),
            ];
        }, []),
        10000,
    );
    // NOTE（已知限制）：trades 只查「目前選中」的證/期帳戶（accountBody 的
    // accountFor fallback），沒有像 positions 一樣按帳戶 fan-out。同類型多
    // 帳戶時非選中帳戶的委託不會出現在委託 tab。現況一證一期沒有實害。
    const tradesPoll = usePoll<Trade[]>(
        useCallback(async () => {
            const [s, f] = await Promise.allSettled([
                fetchTrades('S'),
                fetchTrades('F'),
            ]);
            return [
                ...(s.status === 'fulfilled' ? s.value : []),
                ...(f.status === 'fulfilled' ? f.value : []),
            ];
        }, []),
        8000,
    );
    const balancePoll = usePoll(
        useCallback(() => fetchAccountBalance(), []),
        60000,
    );
    const marginPoll = usePoll(useCallback(() => fetchMargin(), []), 30000);

    const refreshTrading = useCallback(() => {
        tradesPoll.refresh();
        positionsPoll.refresh();
        balancePoll.refresh();
        marginPoll.refresh();
    }, [tradesPoll, positionsPoll, balancePoll, marginPoll]);
    const refreshTradingRef = useRef(refreshTrading);
    refreshTradingRef.current = refreshTrading;

    // order events drive an immediate (debounced) refresh — fills and
    // cancels reach every panel within ~0.5s instead of the next poll
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const off = onOrderEvent(() => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => refreshTradingRef.current(), 500);
        });
        return () => {
            off();
            if (timer) clearTimeout(timer);
        };
    }, []);

    // feed risk engine: unrealized position P&L + futures settle P&L
    useEffect(() => {
        const unrealized = (positionsPoll.data ?? []).reduce(
            (sum, p) => sum + (p.pnl || 0),
            0,
        );
        const settle = marginPoll.data?.future_settle_profitloss ?? 0;
        reportDailyPnl(unrealized + settle);
    }, [positionsPoll.data, marginPoll.data]);

    // select & link a symbol WITHOUT adding it to the watchlist
    const selectByCode = useCallback(
        async (code: string) => {
            const existing = items.find((i) => i.contract.code === code);
            if (existing) {
                setSelected(existing.contract);
                return;
            }
            try {
                const c = await ensureContract(code);
                setSelected(c);
            } catch {
                notify({
                    kind: 'err',
                    title: '找不到商品',
                    body: `代碼 ${code} 無法解析`,
                });
            }
        },
        [items],
    );

    // tray-panel clicks link the symbol into the main window
    const selectByCodeRef = useRef(selectByCode);
    selectByCodeRef.current = selectByCode;
    useEffect(() => {
        if (!isTauri) return;
        let off: (() => void) | undefined;
        void import('@tauri-apps/api/event').then(({ listen }) =>
            listen<string>('tray-pick-code', (e) => {
                if (e.payload) void selectByCodeRef.current(e.payload);
            }).then((un) => {
                off = un;
            }),
        );
        return () => off?.();
    }, []);
    // popout windows (T 字等) ask the main window to switch symbols
    useEffect(
        () =>
            onBroadcastSelectCode((code) => {
                void selectByCodeRef.current(code);
            }),
        [],
    );

    // boot: 載入已安裝且啟用的外掛（見 lib/plugins/store.ts）。onSelectCode
    // 透過 ref 轉發到當下最新的 selectByCode，比照上面 tray-pick-code /
    // onBroadcastSelectCode 的作法，避免 bridge 綁死 mount 當下的舊 closure
    useEffect(() => {
        void initPlugins({
            onSelectCode: (code) => void selectByCodeRef.current(code),
        });
    }, []);

    const selectedSnapshot = useMemo(
        () => items.find((i) => i.contract.code === selected?.code)?.snapshot,
        [items, selected],
    );

    // ambient observation: one effect catches every selection path
    // (watchlist / palette / scanner / heatmap / tray)
    useEffect(() => {
        if (selected) {
            trackActivity('選商品', `${selected.code} ${selected.name}`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.code]);

    // ---- workspace ops ----

    const updateWorkspace = useCallback((w: Workspace) => {
        setWorkspace(w);
        saveWorkspace(w);
    }, []);

    const onLayoutChange = useCallback(
        (next: Layout) => {
            updateWorkspace({ ...workspace, layout: [...next] });
        },
        [workspace, updateWorkspace],
    );

    const addBlock = useCallback(
        (
            type: BlockType,
            plugin?: { pluginId: string; panelKey: string },
        ) => {
            const meta = BLOCK_META[type];
            // 外掛面板：以面板自己的 singleton/defaultSize 為準，面板剛好
            // 停用/未安裝（理論上面板庫不會端出這個選項，這裡只是防呆）才
            // 落回 BLOCK_META.plugin 通用備援
            const panelDef = plugin
                ? getPanelDef(plugin.pluginId, plugin.panelKey)
                : null;
            const singleton = panelDef?.singleton ?? meta.singleton;
            const defaultSize = panelDef?.defaultSize ?? meta.defaultSize;
            const label = panelDef?.label ?? meta.label;
            const existing = plugin
                ? workspace.blocks.find(
                      (b) =>
                          b.type === 'plugin' &&
                          b.pluginId === plugin.pluginId &&
                          b.panelKey === plugin.panelKey,
                  )
                : workspace.blocks.find((b) => b.type === type);
            // singleton 已存在時行為不變（版面一格都不動），但要把既有那一格
            // 的 id 回報給呼叫端：商店的「安裝即置入」需要它才能捲過去閃一下，
            // 否則從商店按下去會變成「按了沒反應」
            if (singleton && existing) {
                return { id: existing.id, created: false };
            }
            trackActivity('開面板', label);
            const id = newBlockId(type);
            const item: LayoutItem = {
                i: id,
                x: 0,
                y: Infinity, // RGL drops it at the bottom
                w: defaultSize.w,
                h: defaultSize.h,
                minW: defaultSize.minW,
                minH: defaultSize.minH,
            };
            updateWorkspace({
                blocks: [
                    ...workspace.blocks,
                    {
                        id,
                        type,
                        pin: null,
                        ...(plugin
                            ? {
                                  pluginId: plugin.pluginId,
                                  panelKey: plugin.panelKey,
                              }
                            : {}),
                    },
                ],
                layout: [...workspace.layout, item],
            });
            return { id, created: true };
        },
        [workspace, updateWorkspace],
    );

    const [panelLibraryOpen, setPanelLibraryOpen] = useState(false);
    const [pluginStoreOpen, setPluginStoreOpen] = useState(false);

    // jump-to-existing-panel from the panel library: scroll the grid cell
    // into view and pulse its outline once
    //
    // 【為什麼要重試，不能只包一層 rAF】呼叫端（尤其 placePluginPanel）是先
    // addBlock 觸發 state update，緊接著同一個 tick 呼叫這裡；rAF callback
    // 執行的當下不保證 React 已經把新格子 commit 進 DOM（這裡還疊了
    // setPluginStoreOpen(false) 一起 flush，時序更難保證）。一次 rAF 抓不到
    // 就靜默放棄的話，「安裝即置入」的核心價值（看得見發生什麼事）就沒兌現。
    // 改成有上限的重試：每一幀都查一次，抓到才動作，抓不到就再等下一幀，
    // 最多等 LOCATE_MAX_ATTEMPTS 幀（60fps 下約半秒，遠超過一般 commit 加
    // layout 所需時間），逾時才放棄，行為與原本一樣是靜默 no-op。
    const LOCATE_MAX_ATTEMPTS = 30;
    const locateBlock = useCallback((id: string) => {
        const tryLocate = (attempt: number) => {
            const cell = document.querySelector(`[data-block-id="${id}"]`);
            if (!cell) {
                if (attempt >= LOCATE_MAX_ATTEMPTS) return;
                requestAnimationFrame(() => tryLocate(attempt + 1));
                return;
            }
            cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
            cell.classList.remove(libraryStyles.blockFlash);
            // restart the animation even when re-triggered back to back
            void (cell as HTMLElement).offsetWidth;
            cell.classList.add(libraryStyles.blockFlash);
            setTimeout(
                () => cell.classList.remove(libraryStyles.blockFlash),
                1300,
            );
        };
        requestAnimationFrame(() => tryLocate(0));
    }, []);

    // 安裝即置入：商店裝完（或事後從卡片按「加入版面」）把外掛面板放到版面
    // 底部。順序是先加、再關商店、再捲動，避免對話框還蓋著就捲。
    //
    // 【為什麼這不算擅自改版面】addBlock 給的是 y: Infinity，配上 RGL 的
    // 預設 vertical compact，新格子一律落在最底，既有每一格的 x/y/w/h 一個
    // 都不會變；加完立刻捲過去閃一次，使用者看得見發生什麼事；那一格自帶
    // 關閉鈕，一次點擊就還原。
    const placePluginPanel = useCallback(
        (pluginId: string, panelKey: string) => {
            const label = getPanelDef(pluginId, panelKey)?.label ?? '外掛面板';
            // 非 singleton 的面板可以多開，但安裝流程不重複加：已經在版面上
            // 就只帶使用者過去看
            const existing = workspace.blocks.find(
                (b) =>
                    b.type === 'plugin' &&
                    b.pluginId === pluginId &&
                    b.panelKey === panelKey,
            );
            const placed = existing
                ? { id: existing.id, created: false }
                : addBlock('plugin', { pluginId, panelKey });
            setPluginStoreOpen(false);
            locateBlock(placed.id);
            notify(
                placed.created
                    ? {
                          kind: 'ok',
                          title: '已加入版面',
                          body: `${label} 已加到版面底部，不需要可直接關閉這一格`,
                      }
                    : {
                          kind: 'info',
                          title: '已在版面上',
                          body: `${label} 已經在版面上`,
                      },
            );
        },
        [workspace.blocks, addBlock, locateBlock],
    );

    const isPluginPanelPlaced = useCallback(
        (pluginId: string, panelKey: string) =>
            workspace.blocks.some(
                (b) =>
                    b.type === 'plugin' &&
                    b.pluginId === pluginId &&
                    b.panelKey === panelKey,
            ),
        [workspace.blocks],
    );

    const removeBlock = useCallback(
        (id: string) => {
            const gone = workspace.blocks.find((b) => b.id === id);
            if (gone) trackActivity('關面板', gone.type);
            updateWorkspace({
                blocks: workspace.blocks.filter((b) => b.id !== id),
                layout: workspace.layout.filter((l) => l.i !== id),
            });
        },
        [workspace, updateWorkspace],
    );

    const setBlockPin = useCallback(
        (id: string, pin: string | null) => {
            updateWorkspace({
                ...workspace,
                blocks: workspace.blocks.map((b) =>
                    b.id === id ? { ...b, pin } : b,
                ),
            });
        },
        [workspace, updateWorkspace],
    );

    const setBlockWallConfig = useCallback(
        (id: string, wallList: string, wallCols: number, wallRows: number) => {
            updateWorkspace({
                ...workspace,
                blocks: workspace.blocks.map((block) =>
                    block.id === id
                        ? { ...block, wallList, wallCols, wallRows }
                        : block,
                ),
            });
        },
        [workspace, updateWorkspace],
    );

    const setBlockPulseConfig = useCallback(
        (
            id: string,
            pulseSections: PulseSection[],
            pulseWeights: PulseSectionWeights,
        ) => {
            updateWorkspace({
                ...workspace,
                blocks: workspace.blocks.map((block) =>
                    block.id === id
                        ? { ...block, pulseSections, pulseWeights }
                        : block,
                ),
            });
        },
        [workspace, updateWorkspace],
    );

    const resetWorkspace = useCallback(() => {
        updateWorkspace(structuredClone(DEFAULT_WORKSPACE));
    }, [updateWorkspace]);

    const loadPreset = useCallback(
        (name: string) => {
            const preset = LAYOUT_PRESETS.find((p) => p.name === name);
            if (preset) {
                updateWorkspace(structuredClone(preset.workspace));
                trackActivity('套版面', name);
                notify({
                    kind: 'info',
                    title: '版面已套用',
                    body: `預設版面「${name}」`,
                });
            }
        },
        [updateWorkspace],
    );

    // ---- profiles ----

    const saveProfileAs = useCallback(
        (name: string, icon?: string) => {
            const next = [
                ...profiles.filter((p) => p.name !== name),
                {
                    name,
                    workspace: structuredClone(workspace),
                    ...(icon ? { icon } : {}),
                },
            ];
            setProfiles(next);
            saveProfiles(next);
            trackActivity('存版面', name);
            notify({
                kind: 'ok',
                title: '版面已儲存',
                body: `「${name}」已加入版面列表`,
            });
        },
        [profiles, workspace],
    );

    const loadProfile = useCallback(
        (name: string) => {
            const p = profiles.find((x) => x.name === name);
            if (p) {
                updateWorkspace(structuredClone(p.workspace));
                trackActivity('套版面', name);
                notify({
                    kind: 'info',
                    title: '版面已載入',
                    body: `已切換至「${name}」`,
                });
            }
        },
        [profiles, updateWorkspace],
    );

    const deleteProfile = useCallback(
        (name: string) => {
            const next = profiles.filter((p) => p.name !== name);
            setProfiles(next);
            saveProfiles(next);
        },
        [profiles],
    );

    const renameProfile = useCallback(
        (oldName: string, newName: string) => {
            if (oldName === newName) return;
            if (profiles.some((p) => p.name === newName)) {
                // silent revert would look like data loss — say why
                notify({
                    kind: 'err',
                    title: '改名失敗',
                    body: `已有同名版面「${newName}」`,
                });
                return;
            }
            const next = profiles.map((p) =>
                p.name === oldName ? { ...p, name: newName } : p,
            );
            setProfiles(next);
            saveProfiles(next);
            trackActivity('版面改名', newName);
        },
        [profiles],
    );

    const [paletteOpen, setPaletteOpen] = useState(false);
    const openPalette = useCallback(() => setPaletteOpen(true), []);
    useHotkeys({
        onOpenPalette: openPalette,
        onAfterCancelAll: refreshTrading,
    });

    const jumpToCode = useCallback(
        async (code: string) => {
            const existing = items.find((i) => i.contract.code === code);
            if (existing) {
                setSelected(existing.contract);
                return;
            }
            const c = await ensureContract(code);
            setSelected(c);
        },
        [items],
    );

    const booting = initialLoading;

    if (POPOUT_TYPE === 'traypanel') {
        return <TrayPanel />;
    }
    if (POPOUT_TYPE && POPOUT_TYPES.has(POPOUT_TYPE)) {
        return (
            <PopoutView type={POPOUT_TYPE as BlockType} code={POPOUT_CODE} />
        );
    }

    const watchlistProps = {
        items,
        selectedCode: selected?.code ?? null,
        onSelect: setSelected,
        onAdd: addSymbol,
        onRemove: removeSymbol,
        onReorder: reorderSymbol,
        serverLists,
        activeListId,
        onSelectList: setActiveList,
        onCreateList: createList,
        onRenameList: renameCurrentList,
        onDeleteList: deleteCurrentList,
        loading,
    };
    const dockProps = {
        positions: positionsPoll.data ?? [],
        trades: tradesPoll.data ?? [],
        balance: balancePoll.data,
        margin: marginPoll.data,
        onTradesChanged: refreshTrading,
        onSelectCode: selectByCode,
    };

    return (
        <div className={styles.shell}>
            <HudHeader
                accBalance={balancePoll.data?.acc_balance}
                onOpenPanelLibrary={() => setPanelLibraryOpen(true)}
                onOpenPluginStore={() => setPluginStoreOpen(true)}
                profiles={profiles}
                currentWorkspace={workspace}
                onSaveProfile={saveProfileAs}
                onLoadProfile={loadProfile}
                onDeleteProfile={deleteProfile}
                onRenameProfile={renameProfile}
                onResetWorkspace={resetWorkspace}
                onLoadPreset={loadPreset}
                flashCodes={items
                    .filter((i) => i.contract.security_type !== 'IND')
                    .map((i) => i.contract.code)}
                selectedCode={selected?.code ?? null}
            />
            <EventToasts onEvent={refreshTrading} />
            <CommandPalette
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                onJump={jumpToCode}
                onAddPanel={addBlock}
            />
            <PanelLibrary
                open={panelLibraryOpen}
                onClose={() => setPanelLibraryOpen(false)}
                blocks={workspace.blocks}
                onAdd={addBlock}
                onLocate={locateBlock}
                selectedCode={selected?.code}
            />
            <PluginStoreDialog
                open={pluginStoreOpen}
                onClose={() => setPluginStoreOpen(false)}
                onPlacePanel={placePluginPanel}
                isPanelPlaced={isPluginPanelPlaced}
            />

            <div className={grid.gridWrap} ref={containerRef}>
                {booting && (
                    <div className={styles.loading}>
                        <Orb size={20} />
                        <span>Shioaji Pro</span>
                        <span style={{ fontSize: '0.7rem' }}>
                            載入交易終端…
                        </span>
                    </div>
                )}
                {!booting && mounted && (
                    <GridLayout
                        layout={workspace.layout}
                        width={width}
                        gridConfig={{
                            cols: GRID_COLS,
                            rowHeight: 30,
                            margin: [6, 6],
                            containerPadding: [6, 6],
                        }}
                        dragConfig={{
                            handle: '.drag-handle',
                            cancel: 'button, input, select',
                        }}
                        onLayoutChange={onLayoutChange}
                    >
                        {workspace.blocks.map((block) => (
                            <div
                                key={block.id}
                                data-block-id={block.id}
                                className={grid.cell}
                            >
                                <BlockView
                                    block={block}
                                    selected={selected}
                                    onPinChange={setBlockPin}
                                    onRemove={removeBlock}
                                    snapshot={
                                        block.pin
                                            ? undefined
                                            : selectedSnapshot
                                    }
                                    watchlistProps={watchlistProps}
                                    dockProps={dockProps}
                                    onSelectCode={selectByCode}
                                    onPulseConfigChange={setBlockPulseConfig}
                                    onWallConfigChange={setBlockWallConfig}
                                    refreshTrading={refreshTrading}
                                />
                            </div>
                        ))}
                    </GridLayout>
                )}
            </div>
        </div>
    );
}
