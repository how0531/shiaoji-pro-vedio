// src/components/plugin-store.tsx：外掛商店對話框。密實列表，一列一顆外掛
// （圖示＋名稱＋描述截斷＋風險＋版本＋動作），點展開鈕看完整說明、逐條
// 權限與來源；安裝前就攤開權限是刻意的：安裝＝在 App 內執行第三方
// bundle。已安裝的外掛風險只收成一顆色點（使用者早就同意過了），可安裝
// 的外掛維持文字風險標示，安裝前的知情同意才是重點，敏感權限並要求二次
// 確認才真正送出安裝。底部收合的開發者模式可 side-load 自訂外掛（僅限
// 信任來源，操作前要求使用者明確確認風險）。

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
    setPluginEnabled,
    sideloadPlugin,
    uninstallPlugin,
    updatePlugin,
    usePluginsState,
    type InstalledPlugin,
} from '../lib/plugins/store';
import {
    PLUGIN_PERMISSION_IDS,
    PLUGIN_PERMISSIONS,
    type PluginPermissionId,
    type PluginPermissionRisk,
    type StoreCatalog,
} from '../lib/plugins/types';
import * as hud from './hud-header.css';
import * as styles from './plugin-store.css';

type CatalogEntry = StoreCatalog['plugins'][number];

// 中文長句放常數而不是直接寫在 JSX 裡：JSX 會把換行併成一個空格，中文句子
// 中間會多出空白
const UNDECLARED_NOTICE =
    '此外掛沒有宣告權限（舊版 manifest 格式）。這不代表它不會存取資料：外掛與 App 在同一個環境執行，仍可能讀到帳務、行情與本機設定。請確認來源可信再安裝。';
const OFFLINE_NOTICE = '無法取得外掛目錄（離線？），已安裝的外掛不受影響';

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

// 只回短狀態字：版本移到 rowVersion、失敗原因移到展開詳情，徽章不再
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

// 已安裝外掛的風險只收成一顆色點：使用者安裝當下已經看過完整權限清單，
// 每次開商店都用滿版紅字再吼一次是噪音，不是資訊。'unknown' 對應舊
// manifest 沒宣告權限（風險未知，比照 medium 給琥珀），'none' 對應宣告
// 空陣列（明確零權限，比照 low 給灰）。
export type RiskDotKind = PluginPermissionRisk | 'unknown' | 'none';

const RISK_DOT_LABEL: Record<RiskDotKind, string> = {
    high: '含高風險權限',
    medium: '含中風險權限',
    low: '僅低風險權限',
    unknown: '未宣告權限（風險未知）',
    none: '不需權限',
};

export function riskDotKind(
    permissions: PluginPermissionId[] | undefined,
): RiskDotKind {
    if (permissions === undefined) return 'unknown';
    if (permissions.length === 0) return 'none';
    const counts = riskCounts(permissions);
    if (counts.high > 0) return 'high';
    if (counts.medium > 0) return 'medium';
    return 'low';
}

export function riskDotLabel(kind: RiskDotKind): string {
    return RISK_DOT_LABEL[kind];
}

// 色點只有三種顏色（高風險紅／中風險琥珀／低風險或無灰），unknown 比照
// medium、none 比照 low，styles.permDot 不需要為了兩個語意變體多開兩組
// CSS。
function riskDotVariant(kind: RiskDotKind): PluginPermissionRisk {
    if (kind === 'unknown') return 'medium';
    if (kind === 'none') return 'low';
    return kind;
}

// 可安裝區塊的知情同意把關：宣告了任何權限（或舊 manifest 未宣告、風險
// 不明）都要求二次確認才真的送出安裝；明確宣告零權限的外掛沒有東西要
// 同意，直接裝，不製造無意義的摩擦。
export function needsInstallConfirm(
    permissions: PluginPermissionId[] | undefined,
): boolean {
    if (permissions === undefined) return true;
    return permissions.length > 0;
}

// 二次確認按鈕的 title：把「按下去等於同意什麼」講白話。未宣告權限（風險
// 不明）與宣告了權限但全部是無法辨識的 id（壞掉的 catalog 資料）各自有
// 專屬文案，避免顯示「安裝後將授權：」卻後面空白。
export function installConfirmText(
    permissions: PluginPermissionId[] | undefined,
): string {
    if (permissions === undefined) {
        return '此外掛未宣告權限（舊版 manifest 格式），風險範圍無法確認，請確認來源可信後再安裝。';
    }
    const counts = riskCounts(permissions);
    const parts: string[] = [];
    if (counts.high > 0) parts.push(`${counts.high} 項高風險`);
    if (counts.medium > 0) parts.push(`${counts.medium} 項中風險`);
    if (counts.low > 0) parts.push(`${counts.low} 項低風險`);
    if (parts.length === 0) {
        return '此外掛宣告的權限包含無法辨識的項目，請確認來源可信後再安裝。';
    }
    return `安裝後將授權：${parts.join('、')}。確定要繼續安裝嗎？`;
}

// PLUGIN_ICONS 是物件字面值，`in` / `[]` 索引都會查到 Object.prototype
// 鏈上的成員（'toString'、'constructor'、'hasOwnProperty'…）。manifest 的
// icon 欄位是外部字串，若外掛（或壞掉的 catalog）宣告 icon: 'toString'，
// PLUGIN_ICONS['toString'] 會拿到 Object.prototype.toString 這個函式，被
// 當成 React 元件渲染會炸掉。Object.hasOwn 只認字面值裡真的存在的鍵。
export function lookupIcon(icon: string): LucideIcon | undefined {
    return Object.hasOwn(PLUGIN_ICONS, icon) ? PLUGIN_ICONS[icon] : undefined;
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
                <Icon size={13} />
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

// 可安裝區塊用：安裝前的知情同意才是重點，風險要用文字看得見（不是一顆
// 點就打發），沿用既有的計數 chips。
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

// 已安裝區塊用：使用者早就同意過權限了，只用一顆色點提示最高風險等級，
// 詳情要看逐條說明就展開。
function RiskDot({
    permissions,
}: {
    permissions: PluginPermissionId[] | undefined;
}) {
    const kind = riskDotKind(permissions);
    const label = riskDotLabel(kind);
    return (
        <span
            className={styles.riskDot[riskDotVariant(kind)]}
            role='img'
            aria-label={label}
            title={label}
        />
    );
}

function PermissionDetail({
    permissions,
}: {
    permissions: PluginPermissionId[] | undefined;
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
                            <span className={styles.permDesc}>
                                {info.description}
                            </span>
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

// entry 與 installed 至少有一個：未安裝的商店項目只有 entry，side-load
// 或目錄抓不到的已安裝外掛只有 installed，兩者都在時是「商店裡也裝了」。
// 密實列表：一列一顆外掛（圖示／名稱＋描述／風險＋版本／動作），點展開
// 鈕才看完整說明與逐條權限。
function PluginRow({
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
}) {
    // 安裝前的二次確認：僅這一列自己的狀態，安裝成功後這一列會從「可
    // 安裝」搬到「已安裝」清單（換一個 React 節點掛載），狀態自然歸零；
    // 安裝失敗則留在原地讓使用者重試。
    const [confirmInstall, setConfirmInstall] = useState(false);

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
    const sideloaded = installed?.sideloaded ?? false;
    const permissions = resolvePermissions(entry, installed);
    const added = showUpdate ? addedPermissions(entry, installed) : [];
    const detailId = `plugin-detail-${id}`;
    const confirmNeeded = needsInstallConfirm(permissions);

    const handleInstallClick = () => {
        if (confirmNeeded && !confirmInstall) {
            setConfirmInstall(true);
            return;
        }
        setConfirmInstall(false);
        onInstall();
    };

    return (
        <div className={styles.item}>
            <div
                className={styles.row[expanded ? 'expanded' : 'normal']}
                tabIndex={0}
            >
                <PluginIcon icon={icon} name={name} sideloaded={sideloaded} />
                <div className={styles.rowMain}>
                    <span className={styles.rowName}>{name}</span>
                    {kind !== 'notInstalled' && (
                        <span
                            className={badgeClass(kind)}
                            title={
                                kind === 'failed' && reason
                                    ? reason
                                    : undefined
                            }
                        >
                            {badgeLabel(kind)}
                        </span>
                    )}
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
                    <span className={styles.rowDesc}>{description}</span>
                </div>
                <div className={styles.rowMeta}>
                    {installed ? (
                        <RiskDot permissions={permissions} />
                    ) : (
                        <PermissionChips permissions={permissions} />
                    )}
                    <span className={styles.rowVersion}>
                        {installed ? `v${installed.version}` : null}
                        {!installed && entry ? `v${entry.version}` : null}
                        {/* 同版號但 bundle 內容變了（發佈者忘了升版）也算
                            有更新，此時不畫 v1.0.0 → v1.0.0 這種無意義箭頭，
                            改標「內容已更新」讓使用者知道為什麼要按更新 */}
                        {showUpdate &&
                            entry &&
                            installed &&
                            (entry.version === installed.version ? (
                                <span className={styles.versionNext}>
                                    {' 內容已更新'}
                                </span>
                            ) : (
                                <>
                                    {' → '}
                                    <span className={styles.versionNext}>
                                        v{entry.version}
                                    </span>
                                </>
                            ))}
                    </span>
                </div>
                <div className={styles.actions}>
                    {showInstall && !confirmInstall && (
                        <button
                            className={styles.actionBtn}
                            disabled={busy}
                            onClick={handleInstallClick}
                        >
                            {busy ? '處理中…' : '安裝'}
                        </button>
                    )}
                    {/* 兩段式安裝確認：宣告了權限（或舊 manifest 未宣告、
                        風險不明）的外掛，第一擊只顯示確認列，第二擊才真的
                        送出安裝。零權限的外掛不用同意什麼，直接裝。 */}
                    {showInstall && confirmInstall && (
                        <>
                            <button
                                className={styles.removeBtn}
                                disabled={busy}
                                onClick={() => setConfirmInstall(false)}
                            >
                                取消
                            </button>
                            <button
                                className={styles.actionBtn}
                                disabled={busy}
                                title={installConfirmText(permissions)}
                                onClick={handleInstallClick}
                            >
                                {busy ? '處理中…' : '確認安裝'}
                            </button>
                        </>
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
                                hud.switchTrack[
                                    installed.enabled ? 'on' : 'off'
                                ]
                            }
                            role='switch'
                            aria-checked={installed.enabled}
                            aria-label={`啟用${name}`}
                            title={
                                installed.enabled
                                    ? '停用此外掛'
                                    : '啟用此外掛'
                            }
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
                    <button
                        className={styles.detailBtn}
                        aria-expanded={expanded}
                        aria-controls={detailId}
                        aria-label={expanded ? '收合詳情' : '詳細資訊與權限'}
                        title={expanded ? '收合詳情' : '詳細資訊與權限'}
                        onClick={onToggleDetail}
                    >
                        {expanded ? (
                            <ChevronDown size={13} />
                        ) : (
                            <ChevronRight size={13} />
                        )}
                    </button>
                </div>
            </div>
            {error && (
                <div className={styles.rowErrorLine}>
                    <span className={styles.errorText}>{error}</span>
                </div>
            )}
            {expanded && (
                <div className={styles.detail} id={detailId}>
                    {kind === 'failed' && reason && (
                        <span className={styles.errorText}>
                            載入失敗原因：{reason}
                        </span>
                    )}
                    <div>
                        <div className={styles.detailLabel}>說明</div>
                        <div className={styles.detailText}>{description}</div>
                    </div>
                    <div>
                        <div className={styles.detailLabel}>
                            這個外掛能存取什麼
                        </div>
                        <PermissionDetail permissions={permissions} />
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
}: {
    open: boolean;
    onClose: () => void;
}) {
    const { installed, loaded, catalog } = usePluginsState();
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
    // 一次只展開一列：詳情很長（逐條權限），同時開多列會失焦
    const [detailId, setDetailId] = useState<string | null>(null);

    // 分區照使用者的心智：「我裝了什麼」對「我還能裝什麼」。catalog 拿不到
    // （離線）時所有已安裝外掛仍列在「已安裝」，可安裝為 0，管理流程不因
    // 離線而斷掉；side-load 與不在目錄的外掛也一併留在已安裝節。
    const installedIds = new Set(installed.map((p) => p.id));
    const catalogEntries = catalog?.plugins ?? [];
    const entryById = new Map(catalogEntries.map((e) => [e.id, e]));
    const available = catalogEntries.filter((e) => !installedIds.has(e.id));

    useEffect(() => {
        if (!open) {
            setDetailId(null);
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

    const rowProps = (id: string) => ({
        loaded,
        busy: busyIds.has(id),
        error: rowErrors[id],
        expanded: detailId === id,
        onToggleDetail: () =>
            setDetailId((current) => (current === id ? null : id)),
        onInstall: () => {
            const target = entryById.get(id);
            if (target) void withBusy(id, () => installPlugin(target));
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
                        {installed.length > 0 && (
                            <>
                                <div className={styles.sectionHeader}>
                                    已安裝
                                    <span className={styles.sectionCount}>
                                        {installed.length}
                                    </span>
                                </div>
                                <div className={styles.list}>
                                    {installed.map((p) => (
                                        <PluginRow
                                            key={p.id}
                                            id={p.id}
                                            entry={entryById.get(p.id)}
                                            installed={p}
                                            {...rowProps(p.id)}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                        {available.length > 0 && (
                            <>
                                <div className={styles.sectionHeader}>
                                    可安裝
                                    <span className={styles.sectionCount}>
                                        {available.length}
                                    </span>
                                </div>
                                <div className={styles.list}>
                                    {available.map((entry) => (
                                        <PluginRow
                                            key={entry.id}
                                            id={entry.id}
                                            entry={entry}
                                            {...rowProps(entry.id)}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    <DevSection />
                </div>
            </div>
        </>
    );
}
