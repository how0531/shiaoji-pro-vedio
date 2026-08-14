// src/components/plugin-store.tsx：外掛商店對話框。分「已安裝」與「可安裝」
// 兩節，每顆外掛一張卡片（圖示＋狀態徽章＋描述＋權限摘要），可展開看完整
// 說明、逐條權限與來源；安裝前就攤開權限是刻意的：安裝＝在 App 內執行第三方
// bundle。底部收合的開發者模式可 side-load 自訂外掛（僅限信任來源，操作前
// 要求使用者明確確認風險）。

import {
    Activity,
    Banknote,
    BarChart2,
    Bell,
    Bot,
    Calculator,
    CalendarClock,
    ChevronDown,
    ChevronRight,
    ClipboardList,
    Coins,
    FileText,
    Filter,
    FlaskConical,
    Gauge,
    Landmark,
    Layers,
    LineChart,
    type LucideIcon,
    Package,
    Percent,
    PieChart,
    Puzzle,
    Receipt,
    ScrollText,
    Search,
    ShieldAlert,
    Table,
    Ticket,
    TrendingUp,
    Wallet,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    hasUpdate,
    installPlugin,
    listLoadedPanels,
    setPluginEnabled,
    sideloadPlugin,
    uninstallPlugin,
    updatableIds,
    updatePlugin,
    usePluginsState,
    type InstalledPlugin,
} from '../lib/plugins/store';
import {
    PLUGIN_CATEGORIES,
    PLUGIN_HOST_GUARANTEE,
    PLUGIN_PERMISSION_IDS,
    PLUGIN_PERMISSION_NOTE_MAX,
    PLUGIN_PERMISSIONS,
    type PluginCategoryId,
    type PluginPanelDef,
    type PluginPermissionId,
    type PluginPermissionRisk,
    type StoreCatalog,
} from '../lib/plugins/types';
import { notify } from '../lib/trade';
import * as hud from './hud-header.css';
import * as styles from './plugin-store.css';

type CatalogEntry = StoreCatalog['plugins'][number];

// 中文長句放常數而不是直接寫在 JSX 裡：JSX 會把換行併成一個空格，中文句子
// 中間會多出空白
const UNDECLARED_NOTICE =
    '此外掛沒有宣告權限（舊版 manifest 格式）。這不代表它不會存取資料：外掛與 App 在同一個環境執行，仍可能讀到帳務、行情與本機設定。請確認來源可信再安裝。';
const OFFLINE_NOTICE = '無法取得外掛目錄（離線？），已安裝的外掛不受影響';

// ---- 規模化門檻 ----
// 外掛數低於門檻時，對應的導覽層完全不渲染（不是隱藏，是不存在），維持
// 現有單頁兩區的樣子；四個外掛不該為了分頁而多長出一整條導覽列。三個常數
// 分開命名，讓未來各自獨立調整（例如篩選比分頁早浮現）不用互相牽動，
// 現在三者都給 12。
const TAB_THRESHOLD = 12;
const SEARCH_THRESHOLD = 12;
const FILTER_THRESHOLD = 12;

// 效能取捨：不引入虛擬化套件（會新增 runtime dependency，違反專案規則）。
// 改成每個分頁最多渲染這麼多張卡，超過的用搜尋／分類縮小範圍，而不是把
// 上百張卡全部塞進 DOM。這是刻意的陽春解法：60 張卡的渲染成本目前沒有
// 被實測過是瓶頸，真的需要虛擬化時，先量出瓶頸確實存在，再做，不要先做。
const RENDER_LIMIT = 60;

// manifest 的 icon 欄位若命中這份 allowlist 就畫成 lucide 元件，比照
// layout-library.tsx 的 PROFILE_ICONS（同樣是「字串存進資料、App 端查表」）。
// 收的是財經語彙，外掛想要別的圖示可以改用 1 至 2 字的角標（含 emoji）。
export const PLUGIN_ICONS: Record<string, LucideIcon> = {
    Activity,
    Banknote,
    BarChart2,
    Bell,
    Bot,
    Calculator,
    CalendarClock,
    ClipboardList,
    Coins,
    FileText,
    Filter,
    FlaskConical,
    Gauge,
    Landmark,
    Layers,
    LineChart,
    Package,
    Percent,
    PieChart,
    Receipt,
    ScrollText,
    Table,
    Ticket,
    TrendingUp,
    Wallet,
};

// 徽章與可用動作各自獨立判斷：徽章反映「目前狀態」，動作反映「現在能做
// 什麼」。已停用優先於可更新（updatePlugin 不檢查 enabled，會把已停用
// 外掛的 activate() 跑起來、面板重新掛進 panelsByPlugin，變成「顯示已
// 停用但程式碼在跑」的矛盾，所以已停用的外掛一律顯示「已停用」，不顯示
// 「可更新」，也不給更新按鈕，要更新得先手動開啟）。
type BadgeKind =
    | 'notInstalled'
    | 'installed'
    | 'update'
    | 'disabled'
    | 'failed'
    | 'delisted';

// entry 可能不存在：已安裝但不在 catalog 的外掛（side-load，或官方目錄
// 一時抓不到／沒收錄）沒有可比對的來源，不會有「可更新／官方下架」。
function badgeOf(
    entry: CatalogEntry | undefined,
    installed: InstalledPlugin | undefined,
    loaded: Record<string, string>,
): { kind: BadgeKind; reason?: string } {
    if (entry?.disabled) return { kind: 'delisted' };
    if (!installed) return { kind: 'notInstalled' };
    if (!installed.enabled) return { kind: 'disabled' };
    if (entry && hasUpdate(installed, entry)) return { kind: 'update' };
    const reason = loaded[installed.id];
    if (reason && reason !== 'ok') return { kind: 'failed', reason };
    return { kind: 'installed' };
}

// 只回短狀態字：版本移到 cardVersion、失敗原因移到 cardError，徽章不再
// 同時當三種資訊的容器（長錯誤訊息會把整列撐爆）
function badgeLabel(kind: BadgeKind): string {
    switch (kind) {
        case 'notInstalled':
            return '未安裝';
        case 'installed':
            return '已安裝';
        case 'update':
            return '可更新';
        case 'disabled':
            return '已停用';
        case 'failed':
            return '載入失敗';
        case 'delisted':
            return '官方下架';
    }
}

function badgeClass(kind: BadgeKind): string {
    switch (kind) {
        case 'installed':
            return styles.badgeOk;
        case 'update':
            return styles.badgeUpdate;
        case 'disabled':
            return styles.badge;
        case 'failed':
        case 'delisted':
            return styles.badgeDanger;
        case 'notInstalled':
            return styles.badge;
    }
}

// undefined = manifest 未宣告（舊版格式），與「宣告為空陣列＝零權限」不同，
// 兩者在 UI 上要講不一樣的話。已安裝的以本機 manifest 為準（正在跑的是
// 它），未安裝的以 catalog entry 為準（權限必須在安裝前就看得到）。
export function resolvePermissions(
    entry: CatalogEntry | undefined,
    installed: InstalledPlugin | undefined,
): PluginPermissionId[] | undefined {
    if (installed) return installed.manifest.permissions;
    return entry?.permissions;
}

// 依 PLUGIN_PERMISSION_IDS 的順序重排（高風險在前）。manifest 保留的是
// 原始宣告順序，顯示順序由商店決定，兩邊互不影響。
export function sortPermissions(
    ids: readonly PluginPermissionId[],
): PluginPermissionId[] {
    return PLUGIN_PERMISSION_IDS.filter((id) => ids.includes(id));
}

// 更新後才會多出來的權限。使用者按「更新」等於重新授權，多要的能力應該
// 在按下去之前就講清楚。
export function addedPermissions(
    entry: CatalogEntry | undefined,
    installed: InstalledPlugin | undefined,
): PluginPermissionId[] {
    const next = entry?.permissions;
    if (!next) return [];
    const current = installed?.manifest.permissions ?? [];
    return sortPermissions(next.filter((id) => !current.includes(id)));
}

// 逐權限的用途說明。與 resolvePermissions 同一套規則：已安裝的以本機
// manifest 為準（正在跑的是它），未安裝的以 catalog entry 為準。
export function resolvePermissionNotes(
    entry: CatalogEntry | undefined,
    installed: InstalledPlugin | undefined,
): Partial<Record<PluginPermissionId, string>> | undefined {
    if (installed) return installed.manifest.permissionNotes;
    return entry?.permissionNotes;
}

// 控制字元擋掉換行（權限清單要單段落，多行會破壞 permItem 的行高），
// 格式字元擋掉 U+202E 這種雙向覆寫（能在視覺上把句子倒過來讀，是偽造
// 文案的經典手法）。
const NOTE_STRIP_RE = /[\p{Cc}\p{Cf}]/gu;

// UI 端的第二道防線，不可省：parseManifest 只驗過「已安裝」那一份，
// 未安裝外掛的 note 來自 fetchCatalog（只做 as StoreCatalog，逐筆未驗證）。
// 取值一律走 Object.hasOwn（避免 Object.prototype 上的成員被當成 note）、
// 檢查型別與空白、清掉控制與格式字元，再依 PLUGIN_PERMISSION_NOTE_MAX 截斷。
// 回傳 null 代表「沒有可用的用途說明」，呼叫端退回通用描述。
export function permissionNoteText(
    notes: Partial<Record<PluginPermissionId, string>> | undefined,
    id: PluginPermissionId,
): string | null {
    if (!notes || typeof notes !== 'object') return null;
    const raw = Object.hasOwn(notes, id) ? notes[id] : undefined;
    if (typeof raw !== 'string') return null;
    const cleaned = raw.replace(NOTE_STRIP_RE, '').trim();
    if (cleaned === '') return null;
    return Array.from(cleaned).slice(0, PLUGIN_PERMISSION_NOTE_MAX).join('');
}

// ---- 安裝完成後要做什麼（安裝即置入）----
// 純函式：只看外掛掛上了幾個面板就決定動線，不碰 React 樹，方便單獨測試。
// 一個面板才自動置入；多個面板不猜（一次加五格才真的是擅自改版面），改成
// 在原地列出面板讓使用者點一下；零面板的外掛只提供背景能力，版面不動。
export type PlacementPlan =
    | { kind: 'place'; panelKey: string }
    | { kind: 'choose' }
    | { kind: 'none' };

export function planPlacement(
    panels: readonly { key: string }[],
): PlacementPlan {
    if (panels.length === 0) return { kind: 'none' };
    if (panels.length === 1) {
        return { kind: 'place', panelKey: panels[0]!.key };
    }
    return { kind: 'choose' };
}

// ids 來自 catalog（fetchCatalog 只做 `as StoreCatalog`，未逐筆驗證），
// store.json 若混進拼錯或未知的權限 id，PLUGIN_PERMISSIONS[id] 會是
// undefined，直接索引 .risk 就 throw。先過 sortPermissions（它只保留
// PLUGIN_PERMISSION_IDS 裡有的 id）把未知 id 濾掉，比照 PermissionDetail
// 的做法，讓商店對壞資料只是少算一項，不是整頁白掉。
export function riskCounts(
    ids: readonly PluginPermissionId[],
): Record<PluginPermissionRisk, number> {
    const counts: Record<PluginPermissionRisk, number> = {
        high: 0,
        medium: 0,
        low: 0,
    };
    for (const id of sortPermissions(ids)) counts[PLUGIN_PERMISSIONS[id].risk] += 1;
    return counts;
}

// PLUGIN_ICONS 是物件字面值，`in` / `[]` 索引都會查到 Object.prototype
// 鏈上的成員（'toString'、'constructor'、'hasOwnProperty'…）。manifest 的
// icon 欄位是外部字串，若外掛（或壞掉的 catalog）宣告 icon: 'toString'，
// PLUGIN_ICONS['toString'] 會拿到 Object.prototype.toString 這個函式，被
// 當成 React 元件渲染會炸掉。Object.hasOwn 只認字面值裡真的存在的鍵。
export function lookupIcon(icon: string): LucideIcon | undefined {
    return Object.hasOwn(PLUGIN_ICONS, icon) ? PLUGIN_ICONS[icon] : undefined;
}

// ---- 搜尋與分類篩選（純函式，供測試；已安裝 InstalledPlugin 與商店
// CatalogEntry 兩種形狀在呼叫端各自投影成這個最小介面後再共用一套邏輯）----

export interface PluginListItem {
    id: string;
    name: string;
    description: string;
    category: PluginCategoryId;
}

// name／description／id 三欄比對（大小寫不敏感），category 為 'all' 時
// 不篩分類。純函數不吃 React 狀態，query 為空字串時只做分類篩選（或原樣
// 回傳，順序不變）。
export function filterPlugins<T extends PluginListItem>(
    items: readonly T[],
    { query, category }: { query: string; category: PluginCategoryId | 'all' },
): T[] {
    const scoped =
        category === 'all'
            ? items
            : items.filter((item) => item.category === category);
    const q = query.trim().toLowerCase();
    if (!q) return [...scoped];
    return scoped.filter(
        (item) =>
            item.name.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.id.toLowerCase().includes(q),
    );
}

// 分類 chip 的數量統計，固定回傳 PLUGIN_CATEGORIES 五個 key。數量為 0 的
// 分類要不要渲染成 chip由呼叫端決定（商店規則：0 個的 chip 不顯示，避免
// 按了是空的）。
export function countByCategory(
    items: readonly { category: PluginCategoryId }[],
): Record<PluginCategoryId, number> {
    const counts = Object.fromEntries(
        PLUGIN_CATEGORIES.map((c) => [c.key, 0]),
    ) as Record<PluginCategoryId, number>;
    for (const item of items) counts[item.category] += 1;
    return counts;
}

// icon 解析三段（與 manifest 契約一致）：命中 allowlist 畫 lucide 元件 →
// 1 至 2 個字元當文字角標（emoji 可）→ 其餘或缺值取外掛名稱首字 monogram。
function PluginIcon({
    icon,
    name,
    sideloaded,
}: {
    icon: string | undefined;
    name: string;
    sideloaded: boolean;
}) {
    const cls = styles.iconTile[sideloaded ? 'sideload' : 'official'];
    const Icon = icon ? lookupIcon(icon) : undefined;
    if (Icon) {
        return (
            <span className={cls} aria-hidden='true'>
                <Icon size={15} />
            </span>
        );
    }
    if (icon && Array.from(icon).length <= 2) {
        return (
            <span className={cls} aria-hidden='true'>
                {icon}
            </span>
        );
    }
    return (
        <span className={cls} aria-hidden='true'>
            {Array.from(name)[0] ?? '?'}
        </span>
    );
}

function PermissionChips({
    permissions,
}: {
    permissions: PluginPermissionId[] | undefined;
}) {
    if (permissions === undefined) {
        return (
            <div className={styles.permRow}>
                <span className={styles.permChip.unknown}>未宣告權限</span>
            </div>
        );
    }
    if (permissions.length === 0) {
        return (
            <div className={styles.permRow}>
                <span className={styles.permChip.none}>不需權限</span>
            </div>
        );
    }
    const counts = riskCounts(permissions);
    return (
        <div className={styles.permRow}>
            {counts.high > 0 && (
                <span className={styles.permChip.high}>
                    {counts.high} 項高風險
                </span>
            )}
            {counts.medium > 0 && (
                <span className={styles.permChip.medium}>
                    {counts.medium} 項中風險
                </span>
            )}
            {counts.low > 0 && (
                <span className={styles.permChip.low}>
                    {counts.low} 項低風險
                </span>
            )}
        </div>
    );
}

function PermissionDetail({
    permissions,
    notes,
}: {
    permissions: PluginPermissionId[] | undefined;
    notes: Partial<Record<PluginPermissionId, string>> | undefined;
}) {
    if (permissions === undefined) {
        return (
            <div className={styles.permNotice}>
                <ShieldAlert size={13} style={{ flexShrink: 0 }} />
                <span>{UNDECLARED_NOTICE}</span>
            </div>
        );
    }
    if (permissions.length === 0) {
        return (
            <div className={styles.detailText}>此外掛宣告不需要任何權限。</div>
        );
    }
    return (
        <div className={styles.permList}>
            {sortPermissions(permissions).map((id) => {
                const info = PLUGIN_PERMISSIONS[id];
                // 有用途說明就用外掛自己的話（它才知道為什麼要碰），
                // 缺這一項就退回通用描述，不留空白
                const note = permissionNoteText(notes, id);
                return (
                    <div key={id} className={styles.permItem}>
                        <span
                            className={styles.permDot[info.risk]}
                            aria-hidden='true'
                        />
                        <span className={styles.permText}>
                            <span className={styles.permLabel}>
                                {info.label}
                            </span>
                            {note ? (
                                <span className={styles.permNote}>
                                    <span className={styles.permNoteTag}>
                                        用途
                                    </span>
                                    <span>{note}</span>
                                </span>
                            ) : (
                                <span className={styles.permDesc}>
                                    {info.description}
                                </span>
                            )}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

// entry 與 installed 至少有一個：未安裝的商店項目只有 entry，side-load
// 或目錄抓不到的已安裝外掛只有 installed，兩者都在時是「商店裡也裝了」。
function PluginCard({
    id,
    entry,
    installed,
    loaded,
    busy,
    expanded,
    onToggleDetail,
    onInstall,
    onUpdate,
    onToggle,
    onUninstall,
    error,
    panels,
    isPanelPlaced,
    onPlacePanel,
}: {
    id: string;
    entry?: CatalogEntry;
    installed?: InstalledPlugin;
    loaded: Record<string, string>;
    busy: boolean;
    expanded: boolean;
    onToggleDetail: () => void;
    onInstall: () => void;
    onUpdate: () => void;
    onToggle: (on: boolean) => void;
    onUninstall: () => void;
    error?: string;
    // 這顆外掛目前掛上的面板（未安裝／已停用時是空陣列）
    panels: PluginPanelDef[];
    isPanelPlaced: (pluginId: string, panelKey: string) => boolean;
    onPlacePanel: (pluginId: string, panelKey: string) => void;
}) {
    const { kind, reason } = badgeOf(entry, installed, loaded);
    const canManage = !!installed; // 已安裝（含已停用/載入失敗/官方下架）都能移除
    // 官方下架的外掛不給啟用開關：setPluginEnabled(id, true) 現在會直接
    // throw「此外掛已被官方停用」，開關留著只會點了就跳錯誤，不如直接藏起來，
    // 移除功能仍保留讓使用者能清掉這顆外掛
    const showToggle = canManage && kind !== 'delisted';
    const showInstall = !installed && kind !== 'delisted';
    // installed.enabled 是防呆：badgeOf 的順序已經讓已停用優先於可更新，
    // kind === 'update' 理論上只會在啟用中出現，這裡多一層保險，避免
    // updatePlugin 把已停用外掛的 activate() 跑起來
    const showUpdate = installed && installed.enabled && kind === 'update';

    const name = entry?.name ?? installed?.manifest.name ?? id;
    const description =
        entry?.description ?? installed?.manifest.description ?? '';
    const icon = installed?.manifest.icon ?? entry?.icon;
    const publisher = installed?.manifest.publisher ?? entry?.publisher;
    const sideloaded = installed?.sideloaded ?? false;
    const permissions = resolvePermissions(entry, installed);
    const permissionNotes = resolvePermissionNotes(entry, installed);
    const added = showUpdate ? addedPermissions(entry, installed) : [];
    const detailId = `plugin-detail-${id}`;

    // 安裝即置入的補救入口：面板剛好一個時，安裝當下已經自動放到版面底部，
    // 這顆按鈕是給「面板被關掉之後想再放回來」用的，所以只在面板不在版面上
    // 時出現。既有的更新／啟用開關／移除三顆位置與順序完全不動。
    const soloPanel = panels.length === 1 ? panels[0]! : null;
    const showPlaceBtn = !!soloPanel && !isPanelPlaced(id, soloPanel.key);
    // 多面板外掛不自動置入（一次加五格才真的是擅自改版面），改成在原地列出
    // 面板讓使用者點一下，痛點（關商店、開面板庫、在分類裡找）仍然被解掉
    const showPanelChips = panels.length > 1;

    return (
        <div className={styles.card[expanded ? 'expanded' : 'normal']}>
            <PluginIcon icon={icon} name={name} sideloaded={sideloaded} />
            <div className={styles.cardMain}>
                <span className={styles.cardHead}>
                    <span className={styles.cardName}>{name}</span>
                    <span className={badgeClass(kind)}>
                        {badgeLabel(kind)}
                    </span>
                    {/* 已安裝但不在商店目錄：沒有來源可比對版本，用副徽章
                        講清楚它的出身（side-load 或目錄裡沒有／抓不到） */}
                    {installed && !entry && (
                        <span
                            className={
                                installed.sideloaded
                                    ? styles.badgeWarn
                                    : styles.badge
                            }
                        >
                            {installed.sideloaded
                                ? 'side-load'
                                : '不在商店目錄'}
                        </span>
                    )}
                    <span className={styles.cardVersion}>
                        {installed ? `v${installed.version}` : null}
                        {!installed && entry ? `v${entry.version}` : null}
                        {/* 同版號但 bundle 內容變了（發佈者忘了升版）也算
                            有更新，此時不畫 v1.0.0 → v1.0.0 這種無意義箭頭，
                            改標「內容已更新」讓使用者知道為什麼要按更新 */}
                        {showUpdate &&
                            entry &&
                            installed &&
                            (entry.version === installed.version ? (
                                <span className={styles.cardVersionNext}>
                                    {' 內容已更新'}
                                </span>
                            ) : (
                                <>
                                    {' → '}
                                    <span className={styles.cardVersionNext}>
                                        v{entry.version}
                                    </span>
                                </>
                            ))}
                    </span>
                    {/* 目前 catalog 全部是官方發佈，不加「官方已驗證」這種
                        人人都有的標記（等於沒有資訊）；只單純顯示發佈者
                        名稱，等真的出現第三方上架再考慮驗證徽章。 */}
                    {publisher && (
                        <span className={styles.cardPublisher}>
                            （{publisher}）
                        </span>
                    )}
                </span>
                <span className={styles.cardDesc}>{description}</span>
                {kind === 'failed' && reason && (
                    <span className={styles.cardError} title={reason}>
                        載入失敗：{reason}
                    </span>
                )}
                {/* 卡片上不放風險摘要：帳務類外掛一律會標成高風險，每張卡
                    都是紅字就變成警報疲勞，反而沒人讀。完整的逐條權限與風險
                    分級留在下方「詳細資訊與權限」展開區，安裝前要看得到的
                    知情同意在那裡，不在這一排紅字。 */}
                {error && <span className={styles.cardError}>{error}</span>}
                {showPanelChips && (
                    <div className={styles.panelChipRow}>
                        {panels.map((p) => {
                            const placed = isPanelPlaced(id, p.key);
                            return (
                                <button
                                    key={p.key}
                                    className={
                                        styles.panelChip[
                                            placed ? 'placed' : 'add'
                                        ]
                                    }
                                    title={
                                        placed
                                            ? `${p.label} 已在版面上，點擊帶你過去`
                                            : `把「${p.label}」加到版面底部`
                                    }
                                    onClick={() => onPlacePanel(id, p.key)}
                                >
                                    {placed
                                        ? `${p.label}（已在版面）`
                                        : `＋ ${p.label}`}
                                </button>
                            );
                        })}
                    </div>
                )}
                <button
                    className={styles.detailBtn}
                    aria-expanded={expanded}
                    aria-controls={detailId}
                    onClick={onToggleDetail}
                >
                    {expanded ? (
                        <ChevronDown size={11} />
                    ) : (
                        <ChevronRight size={11} />
                    )}
                    {expanded ? '收合詳情' : '詳細資訊與權限'}
                </button>
            </div>
            <div className={styles.actions}>
                {showPlaceBtn && soloPanel && (
                    <button
                        className={styles.actionBtn}
                        disabled={busy}
                        title={`把「${soloPanel.label}」加到版面底部`}
                        onClick={() => onPlacePanel(id, soloPanel.key)}
                    >
                        加入版面
                    </button>
                )}
                {showInstall && (
                    <button
                        className={styles.actionBtn}
                        disabled={busy}
                        onClick={onInstall}
                    >
                        {busy ? '處理中…' : '安裝'}
                    </button>
                )}
                {showUpdate && (
                    <button
                        className={styles.actionBtn}
                        disabled={busy}
                        onClick={onUpdate}
                    >
                        {busy ? '處理中…' : '更新'}
                    </button>
                )}
                {installed && showToggle && (
                    <button
                        className={
                            hud.switchTrack[installed.enabled ? 'on' : 'off']
                        }
                        role='switch'
                        aria-checked={installed.enabled}
                        aria-label={`啟用${name}`}
                        title={installed.enabled ? '停用此外掛' : '啟用此外掛'}
                        disabled={busy}
                        onClick={() => onToggle(!installed.enabled)}
                    />
                )}
                {installed && canManage && (
                    <button
                        className={styles.removeBtn}
                        disabled={busy}
                        onClick={onUninstall}
                    >
                        {busy ? '處理中…' : '移除'}
                    </button>
                )}
            </div>
            {expanded && (
                <div className={styles.detail} id={detailId}>
                    <div>
                        <div className={styles.detailLabel}>說明</div>
                        <div className={styles.detailText}>{description}</div>
                    </div>
                    <div>
                        <div className={styles.detailLabel}>
                            這個外掛能存取什麼
                        </div>
                        <PermissionDetail
                            permissions={permissions}
                            notes={permissionNotes}
                        />
                        {/* App 端固定文案，講 host 對所有外掛一律成立的
                            邊界。與外掛自述分開：外掛說的話不能拿來當保證 */}
                        <div className={styles.hostGuarantee}>
                            {PLUGIN_HOST_GUARANTEE}
                        </div>
                    </div>
                    {added.length > 0 && (
                        <div className={styles.permNotice}>
                            <ShieldAlert
                                size={13}
                                style={{ flexShrink: 0 }}
                            />
                            <span>
                                更新後會新增權限：
                                {added
                                    .map((pid) => PLUGIN_PERMISSIONS[pid].label)
                                    .join('、')}
                            </span>
                        </div>
                    )}
                    <div className={styles.metaGrid}>
                        <span>外掛 id</span>
                        <span className={styles.metaValue}>{id}</span>
                        {installed && (
                            <>
                                <span>已安裝版本</span>
                                <span className={styles.metaValue}>
                                    v{installed.version}
                                </span>
                            </>
                        )}
                        {entry && (
                            <>
                                <span>商店版本</span>
                                <span className={styles.metaValue}>
                                    v{entry.version}
                                </span>
                            </>
                        )}
                        <span>來源</span>
                        <span className={styles.metaValue}>
                            {installed?.baseUrl ?? entry?.url ?? '未知'}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

function DevSection() {
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startLoad = () => {
        if (!url.trim() || busy) return;
        setError(null);
        setConfirming(true);
    };

    const confirmLoad = async () => {
        setBusy(true);
        setError(null);
        try {
            await sideloadPlugin(url.trim());
            setConfirming(false);
            setUrl('');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={styles.devSection}>
            <button
                className={styles.devToggle}
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
            >
                {open ? (
                    <ChevronDown size={12} />
                ) : (
                    <ChevronRight size={12} />
                )}
                開發者模式（side-load 自訂外掛）
            </button>
            {open && !confirming && (
                <div className={styles.devRow}>
                    <input
                        className={styles.devInput}
                        placeholder='外掛 manifest 所在目錄 URL'
                        value={url}
                        onChange={(e) => {
                            setUrl(e.target.value);
                            setError(null);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') startLoad();
                        }}
                    />
                    <button
                        className={styles.actionBtn}
                        disabled={busy || !url.trim()}
                        onClick={startLoad}
                    >
                        載入
                    </button>
                </div>
            )}
            {open && confirming && (
                <div className={styles.devWarning}>
                    <span>
                        ⚠ 自負風險：side-load 的外掛不經官方簽驗，擁有與
                        App 相同的資料存取權（帳務、行情、個人設定）。僅載入
                        你完全信任的來源。
                    </span>
                    <div className={styles.devConfirmActions}>
                        <button
                            className={styles.removeBtn}
                            disabled={busy}
                            onClick={() => setConfirming(false)}
                        >
                            取消
                        </button>
                        <button
                            className={styles.actionBtn}
                            disabled={busy}
                            onClick={() => void confirmLoad()}
                        >
                            {busy ? '處理中…' : '我了解風險，繼續載入'}
                        </button>
                    </div>
                </div>
            )}
            {open && error && <span className={styles.rowError}>{error}</span>}
        </div>
    );
}

export function PluginStoreDialog({
    open,
    onClose,
    onPlacePanel,
    isPanelPlaced,
}: {
    open: boolean;
    onClose: () => void;
    // 把外掛面板加到版面底部（已在版面上就只帶使用者過去），由 App 提供：
    // 它同時負責關閉商店、捲動並閃一次那一格、發通知
    onPlacePanel: (pluginId: string, panelKey: string) => void;
    isPanelPlaced: (pluginId: string, panelKey: string) => boolean;
}) {
    const { installed, loaded, catalog } = usePluginsState();
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
    // 一次只展開一張卡片：詳情很長（逐條權限），同時開多張會失焦
    const [detailId, setDetailId] = useState<string | null>(null);
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkProgress, setBulkProgress] = useState<{
        done: number;
        total: number;
    } | null>(null);
    // 狀態分頁／搜尋／分類：只有外掛數過門檻才會出現對應的導覽層，見下方
    // showTabs／showSearch／showFilters。三者共用，不特別依 tab 各自重置，
    // 例如在「探索」搜了關鍵字後切到「我的外掛」，保留搜尋字串比清空更符合
    // 「我剛剛在找同一個東西」的直覺。
    const [tab, setTab] = useState<'mine' | 'explore'>('mine');
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<PluginCategoryId | 'all'>('all');

    // 分區照使用者的心智：「我裝了什麼」對「我還能裝什麼」。catalog 拿不到
    // （離線）時所有已安裝外掛仍列在「已安裝」，可安裝為 0，管理流程不因
    // 離線而斷掉；side-load 與不在目錄的外掛也一併留在已安裝節。
    const installedIds = new Set(installed.map((p) => p.id));
    const catalogEntries = catalog?.plugins ?? [];
    const entryById = new Map(catalogEntries.map((e) => [e.id, e]));
    const available = catalogEntries.filter((e) => !installedIds.has(e.id));
    const updatable = updatableIds({ installed, loaded, catalog });

    // 每次 render 建一次索引：listLoadedPanels() 逐張卡各叫一次會是 O(n²)。
    // 這裡讀的是 runtime 註冊表，安裝／停用／移除都會連帶讓 usePluginsState()
    // 觸發重繪，所以拿到的一定是當下的狀態。
    const panelsById = new Map<string, PluginPanelDef[]>();
    for (const { pluginId, panel } of listLoadedPanels()) {
        const list = panelsById.get(pluginId);
        if (list) list.push(panel);
        else panelsById.set(pluginId, [panel]);
    }

    // 每一區再依分類分組。分組而不是做篩選鈕，是因為篩選鈕在外掛少的時候
    // 有一半按了是空的；分組則是外掛越多越有用，少的時候也只是多兩行標題。
    // 空的分類不渲染，所以四個外掛只會看到「帳務分析」與「選擇權/衍生品」。
    function groupByCategory<T>(
        items: T[],
        categoryOf: (item: T) => PluginCategoryId | undefined,
    ): { key: PluginCategoryId; label: string; items: T[] }[] {
        return PLUGIN_CATEGORIES.map((cat) => ({
            key: cat.key,
            label: cat.label,
            // 缺 category 的（舊 manifest）歸到工具，與 types.ts 的約定一致
            items: items.filter(
                (item) => (categoryOf(item) ?? 'tools') === cat.key,
            ),
        })).filter((g) => g.items.length > 0);
    }

    // ---- 導覽層：狀態分頁／搜尋／分類篩選，只在外掛數過門檻時生效 ----
    // installed／available 投影成 PluginListItem 供 filterPlugins／
    // countByCategory 共用比對邏輯，額外掛一個回指原始物件的欄位
    // （plugin／entry），篩完之後不用另外查表就能把原始物件丟給 PluginCard。
    const installedItems = installed.map((p) => ({
        id: p.id,
        name: p.manifest.name,
        description: p.manifest.description,
        category: p.manifest.category ?? ('tools' as PluginCategoryId),
        plugin: p,
    }));
    const availableItems = available.map((e) => ({
        id: e.id,
        name: e.name,
        description: e.description,
        category: e.category ?? ('tools' as PluginCategoryId),
        entry: e,
    }));

    const totalCount = installed.length + available.length;
    const showTabs = totalCount >= TAB_THRESHOLD;
    const showSearch = totalCount >= SEARCH_THRESHOLD;
    const showFilters = totalCount >= FILTER_THRESHOLD;
    // 門檻未達標時導覽層不存在，query／category 就算有殘留狀態也不套用，
    // 兩區維持完全等同現況的單頁清單。
    const appliedQuery = showSearch ? query : '';
    const appliedCategory = showFilters ? category : 'all';
    const groupHeadersVisible = appliedCategory === 'all';

    const filteredInstalled = filterPlugins(installedItems, {
        query: appliedQuery,
        category: appliedCategory,
    });
    const filteredAvailable = filterPlugins(availableItems, {
        query: appliedQuery,
        category: appliedCategory,
    });

    // 分類 chip 的數量：只依「目前分頁的關鍵字比對結果」統計（不受目前選取
    // 的分類影響），這樣切換分類時每個 chip 的數字不會跟著自己歸零，使用者
    // 才看得出換一類還剩多少可選。沒有分頁時（外掛還不多）以兩區合計為範圍。
    const chipScope = showTabs
        ? tab === 'mine'
            ? installedItems
            : availableItems
        : [...installedItems, ...availableItems];
    const chipScopeFiltered = filterPlugins(chipScope, {
        query: appliedQuery,
        category: 'all',
    });
    const categoryCounts = countByCategory(chipScopeFiltered);
    const visibleChips = PLUGIN_CATEGORIES.filter(
        (c) => categoryCounts[c.key] > 0,
    );

    // RENDER_LIMIT 取捨（見常數定義處的說明）：分組渲染時依 PLUGIN_CATEGORIES
    // 的順序累加張數，額度用完就整組不收；未分組（已篩到單一分類）時直接
    // 對篩選結果切片。兩種情況都回傳「還有幾個沒畫出來」供底部提示使用。
    function capGroups<T>(
        groups: { key: PluginCategoryId; label: string; items: T[] }[],
    ): {
        groups: { key: PluginCategoryId; label: string; items: T[] }[];
        overflow: number;
    } {
        const total = groups.reduce((n, g) => n + g.items.length, 0);
        let remaining = RENDER_LIMIT;
        const capped: typeof groups = [];
        for (const g of groups) {
            if (remaining <= 0) break;
            if (g.items.length <= remaining) {
                capped.push(g);
                remaining -= g.items.length;
            } else {
                capped.push({ ...g, items: g.items.slice(0, remaining) });
                remaining = 0;
            }
        }
        return { groups: capped, overflow: Math.max(0, total - RENDER_LIMIT) };
    }

    function renderSectionBody<T extends { category: PluginCategoryId }>(
        items: T[],
        renderCard: (item: T) => React.ReactNode,
    ): React.ReactNode {
        if (groupHeadersVisible) {
            const { groups, overflow } = capGroups(
                groupByCategory(items, (item) => item.category),
            );
            return (
                <>
                    {groups.map((group) => (
                        <div key={group.key}>
                            <div className={styles.groupHeader}>
                                {group.label}
                                <span className={styles.sectionCount}>
                                    {group.items.length}
                                </span>
                            </div>
                            <div className={styles.list}>
                                {group.items.map(renderCard)}
                            </div>
                        </div>
                    ))}
                    {overflow > 0 && (
                        <div className={styles.overflowHint}>
                            還有 {overflow} 個，請用搜尋或分類縮小範圍
                        </div>
                    )}
                </>
            );
        }
        const capped = items.slice(0, RENDER_LIMIT);
        const overflow = items.length - capped.length;
        return (
            <>
                <div className={styles.list}>{capped.map(renderCard)}</div>
                {overflow > 0 && (
                    <div className={styles.overflowHint}>
                        還有 {overflow} 個，請用搜尋或分類縮小範圍
                    </div>
                )}
            </>
        );
    }

    function noResultsHint(): string {
        return appliedQuery.trim()
            ? `找不到符合「${appliedQuery.trim()}」的外掛`
            : '這個分類目前沒有外掛';
    }

    useEffect(() => {
        if (!open) {
            setDetailId(null);
            setTab('mine');
            setQuery('');
            setCategory('all');
            return;
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const withBusy = async (id: string, fn: () => Promise<void>) => {
        setBusyIds((prev) => new Set(prev).add(id));
        setRowErrors((prev) => {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
        });
        try {
            await fn();
        } catch (e) {
            setRowErrors((prev) => ({
                ...prev,
                [id]: e instanceof Error ? e.message : String(e),
            }));
        } finally {
            setBusyIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    // 逐一呼叫 updatePlugin，外掛互相隔離（比照 store.ts 的 initPlugins）：
    // withBusy 已經把每顆外掛的錯誤攔在 rowErrors，不會往外拋，所以這裡
    // 單純 await 一輪就好，一顆失敗不影響下一顆繼續跑。
    const onUpdateAll = async () => {
        if (bulkBusy) return;
        const ids = updatable;
        if (ids.length === 0) return;
        setBulkBusy(true);
        setBulkProgress({ done: 0, total: ids.length });
        for (let i = 0; i < ids.length; i++) {
            await withBusy(ids[i]!, () => updatePlugin(ids[i]!));
            setBulkProgress({ done: i + 1, total: ids.length });
        }
        setBulkBusy(false);
        setBulkProgress(null);
    };

    const onUninstall = (id: string) => {
        try {
            uninstallPlugin(id);
            setRowErrors((prev) => {
                if (!(id in prev)) return prev;
                const next = { ...prev };
                delete next[id];
                return next;
            });
        } catch (e) {
            setRowErrors((prev) => ({
                ...prev,
                [id]: e instanceof Error ? e.message : String(e),
            }));
        }
    };

    // 安裝成功後才置入（失敗照舊落到 rowErrors，版面一格都不動）。
    // 動線分三種，見 planPlacement 的說明。
    const afterInstall = (id: string, name: string) => {
        const panels = listLoadedPanels()
            .filter((x) => x.pluginId === id)
            .map((x) => x.panel);
        const plan = planPlacement(panels);
        if (plan.kind === 'place') {
            onPlacePanel(id, plan.panelKey);
            return;
        }
        if (plan.kind === 'choose') {
            notify({
                kind: 'info',
                title: '已安裝',
                body: `${name} 提供多個面板，請在卡片上選擇要放到版面的那一個`,
            });
            return;
        }
        // 只提供背景能力的外掛：版面不動，也不假裝加了什麼
        notify({
            kind: 'ok',
            title: '已安裝',
            body: `${name} 已安裝完成`,
        });
    };

    const cardProps = (id: string) => ({
        loaded,
        busy: busyIds.has(id),
        error: rowErrors[id],
        expanded: detailId === id,
        panels: panelsById.get(id) ?? [],
        isPanelPlaced,
        onPlacePanel,
        onToggleDetail: () =>
            setDetailId((current) => (current === id ? null : id)),
        onInstall: () => {
            const target = entryById.get(id);
            if (!target) return;
            void withBusy(id, async () => {
                await installPlugin(target);
                afterInstall(target.id, target.name);
            });
        },
        onUpdate: () => void withBusy(id, () => updatePlugin(id)),
        onToggle: (on: boolean) =>
            void withBusy(id, () => setPluginEnabled(id, on)),
        onUninstall: () => onUninstall(id),
    });

    return (
        <>
            <div className={styles.backdrop} onClick={onClose} />
            <div className={styles.shell}>
                <div
                    className={styles.dialog}
                    role='dialog'
                    aria-label='外掛商店'
                >
                    <div className={styles.header}>
                        <span>
                            <Puzzle
                                size={14}
                                style={{
                                    verticalAlign: '-2px',
                                    marginRight: 6,
                                }}
                            />
                            外掛商店
                        </span>
                        <button
                            className={styles.closeBtn}
                            title='關閉（Esc）'
                            onClick={onClose}
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* 導覽層：狀態分頁＋搜尋同一列（比照商店規劃文件 30+ 規模的
                        版面），分類 chips 另起一列。三者各自依門檻獨立出現，
                        卡片本身完全不受影響，見上方 showTabs／showSearch／
                        showFilters 的計算。 */}
                    {(showTabs || showSearch) && (
                        <div className={styles.controlRow}>
                            {showTabs && (
                                <div className={styles.tabGroup}>
                                    <button
                                        className={
                                            styles.tabBtn[
                                                tab === 'mine'
                                                    ? 'active'
                                                    : 'normal'
                                            ]
                                        }
                                        onClick={() => setTab('mine')}
                                    >
                                        我的外掛
                                        <span className={styles.countBadge}>
                                            {installed.length}
                                        </span>
                                    </button>
                                    <button
                                        className={
                                            styles.tabBtn[
                                                tab === 'explore'
                                                    ? 'active'
                                                    : 'normal'
                                            ]
                                        }
                                        onClick={() => setTab('explore')}
                                    >
                                        探索
                                        <span className={styles.countBadge}>
                                            {available.length}
                                        </span>
                                    </button>
                                </div>
                            )}
                            {showSearch && (
                                <div className={styles.searchBox}>
                                    <Search size={14} />
                                    <input
                                        className={styles.searchInput}
                                        placeholder='搜尋外掛（名稱或用途）'
                                        value={query}
                                        onChange={(e) =>
                                            setQuery(e.target.value)
                                        }
                                    />
                                </div>
                            )}
                        </div>
                    )}
                    {showFilters && visibleChips.length > 0 && (
                        <div className={styles.filterRow}>
                            <button
                                className={
                                    styles.filterChip[
                                        category === 'all'
                                            ? 'active'
                                            : 'normal'
                                    ]
                                }
                                onClick={() => setCategory('all')}
                            >
                                全部
                                <span className={styles.countBadge}>
                                    {chipScopeFiltered.length}
                                </span>
                            </button>
                            {visibleChips.map((c) => (
                                <button
                                    key={c.key}
                                    className={
                                        styles.filterChip[
                                            category === c.key
                                                ? 'active'
                                                : 'normal'
                                        ]
                                    }
                                    onClick={() => setCategory(c.key)}
                                >
                                    {c.label}
                                    <span className={styles.countBadge}>
                                        {categoryCounts[c.key]}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className={styles.body}>
                        {catalog === null && (
                            <div className={styles.offlineHint}>
                                <ShieldAlert
                                    size={14}
                                    style={{ flexShrink: 0 }}
                                />
                                <span>{OFFLINE_NOTICE}</span>
                            </div>
                        )}
                        {catalog !== null &&
                            catalogEntries.length === 0 &&
                            installed.length === 0 && (
                                <div className={styles.emptyHint}>
                                    目前沒有可用外掛
                                </div>
                            )}
                        {(!showTabs || tab === 'mine') &&
                            (installed.length > 0 ? (
                                <>
                                    <div className={styles.sectionHeader}>
                                        已安裝
                                        <span className={styles.sectionCount}>
                                            {filteredInstalled.length}
                                        </span>
                                        {/* 少於 3 個可更新時不出現：一個一個
                                            按還不麻煩，不需要多一顆按鈕 */}
                                        {updatable.length >= 3 && (
                                            <button
                                                className={styles.actionBtn}
                                                disabled={bulkBusy}
                                                onClick={() =>
                                                    void onUpdateAll()
                                                }
                                            >
                                                {bulkBusy && bulkProgress
                                                    ? `更新中 ${bulkProgress.done}/${bulkProgress.total}`
                                                    : '全部更新'}
                                            </button>
                                        )}
                                    </div>
                                    {filteredInstalled.length === 0 ? (
                                        <div className={styles.emptyHint}>
                                            {noResultsHint()}
                                        </div>
                                    ) : (
                                        renderSectionBody(
                                            filteredInstalled,
                                            (item) => (
                                                <PluginCard
                                                    key={item.plugin.id}
                                                    id={item.plugin.id}
                                                    entry={entryById.get(
                                                        item.plugin.id,
                                                    )}
                                                    installed={item.plugin}
                                                    {...cardProps(
                                                        item.plugin.id,
                                                    )}
                                                />
                                            ),
                                        )
                                    )}
                                </>
                            ) : (
                                showTabs && (
                                    <div className={styles.emptyHint}>
                                        尚未安裝任何外掛，切換到「探索」開始安裝
                                    </div>
                                )
                            ))}
                        {(!showTabs || tab === 'explore') &&
                            (available.length > 0 ? (
                                <>
                                    <div className={styles.sectionHeader}>
                                        可安裝
                                        <span className={styles.sectionCount}>
                                            {filteredAvailable.length}
                                        </span>
                                    </div>
                                    {filteredAvailable.length === 0 ? (
                                        <div className={styles.emptyHint}>
                                            {noResultsHint()}
                                        </div>
                                    ) : (
                                        renderSectionBody(
                                            filteredAvailable,
                                            (item) => (
                                                <PluginCard
                                                    key={item.entry.id}
                                                    id={item.entry.id}
                                                    entry={item.entry}
                                                    {...cardProps(
                                                        item.entry.id,
                                                    )}
                                                />
                                            ),
                                        )
                                    )}
                                </>
                            ) : (
                                showTabs && (
                                    <div className={styles.emptyHint}>
                                        目前沒有可安裝的外掛
                                    </div>
                                )
                            ))}
                    </div>

                    <DevSection />
                </div>
            </div>
        </>
    );
}
