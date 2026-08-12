// src/components/plugin-store.tsx：外掛商店對話框，瀏覽官方 catalog、
// 安裝/更新/啟停/移除已安裝外掛；底部收合的開發者模式可 side-load
// 自訂外掛（僅限信任來源，操作前要求使用者明確確認風險）。

import { ChevronDown, ChevronRight, Puzzle, X } from 'lucide-react';
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
import type { StoreCatalog } from '../lib/plugins/types';
import * as hud from './hud-header.css';
import * as styles from './plugin-store.css';

type CatalogEntry = StoreCatalog['plugins'][number];

// 徽章與可用動作各自獨立判斷：徽章反映「目前狀態」，動作反映「現在能做
// 什麼」。可更新的外掛徽章顯示 update，但停用開關／移除仍要能操作（不用
// 逼使用者先更新才能關閉或移除）。
type BadgeKind =
    | 'notInstalled'
    | 'installed'
    | 'update'
    | 'disabled'
    | 'failed'
    | 'delisted';

function badgeOf(
    entry: CatalogEntry,
    installed: InstalledPlugin | undefined,
    loaded: Record<string, string>,
): { kind: BadgeKind; reason?: string } {
    if (entry.disabled) return { kind: 'delisted' };
    if (!installed) return { kind: 'notInstalled' };
    if (hasUpdate(installed, entry)) return { kind: 'update' };
    if (!installed.enabled) return { kind: 'disabled' };
    const reason = loaded[installed.id];
    if (reason && reason !== 'ok') return { kind: 'failed', reason };
    return { kind: 'installed' };
}

function badgeLabel(
    kind: BadgeKind,
    entry: CatalogEntry,
    installed: InstalledPlugin | undefined,
    reason?: string,
): string {
    switch (kind) {
        case 'notInstalled':
            return '未安裝';
        case 'installed':
            return `已安裝 v${installed?.version}`;
        case 'update':
            return `可更新 v${installed?.version}→v${entry.version}`;
        case 'disabled':
            return '已停用';
        case 'failed':
            return `載入失敗:${reason ?? ''}`;
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

function PluginRow({
    entry,
    installed,
    loaded,
    busy,
    onInstall,
    onUpdate,
    onToggle,
    onUninstall,
    error,
}: {
    entry: CatalogEntry;
    installed: InstalledPlugin | undefined;
    loaded: Record<string, string>;
    busy: boolean;
    onInstall: () => void;
    onUpdate: () => void;
    onToggle: (on: boolean) => void;
    onUninstall: () => void;
    error?: string;
}) {
    const { kind, reason } = badgeOf(entry, installed, loaded);
    const canManage = !!installed; // 已安裝（含已停用/載入失敗/官方下架）都能開關與移除
    const showInstall = !installed && kind !== 'delisted';
    const showUpdate = installed && kind === 'update';

    return (
        <div className={styles.row}>
            <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                    {entry.name}
                    <span className={badgeClass(kind)}>
                        {badgeLabel(kind, entry, installed, reason)}
                    </span>
                </span>
                <span className={styles.rowDesc} title={entry.description}>
                    {entry.description}
                </span>
                {error && <span className={styles.rowError}>{error}</span>}
            </div>
            <div className={styles.actions}>
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
                {canManage && (
                    <>
                        <button
                            className={
                                hud.switchTrack[
                                    installed!.enabled ? 'on' : 'off'
                                ]
                            }
                            title={
                                installed!.enabled
                                    ? '停用此外掛'
                                    : '啟用此外掛'
                            }
                            disabled={busy}
                            onClick={() => onToggle(!installed!.enabled)}
                        />
                        <button
                            className={styles.removeBtn}
                            disabled={busy}
                            onClick={onUninstall}
                        >
                            {busy ? '處理中…' : '移除'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

// 已安裝但不在 catalog 的外掛（side-load，或官方 catalog 一時抓不到／
// 沒收錄）：沒有 catalog 來源可比對版本，不能安裝/更新，但仍要能停用/
// 移除，否則 side-load 完全無法從商店管理，開發者模式管理流程會斷掉。
function OrphanRow({
    installed,
    loaded,
    busy,
    onToggle,
    onUninstall,
    error,
}: {
    installed: InstalledPlugin;
    loaded: Record<string, string>;
    busy: boolean;
    onToggle: (on: boolean) => void;
    onUninstall: () => void;
    error?: string;
}) {
    const reason = loaded[installed.id];
    const showFailed = installed.enabled && !!reason && reason !== 'ok';

    return (
        <div className={styles.row}>
            <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                    {installed.manifest.name}
                    <span className={styles.badge}>v{installed.version}</span>
                    <span
                        className={
                            installed.sideloaded
                                ? styles.badgeWarn
                                : styles.badge
                        }
                    >
                        {installed.sideloaded ? 'side-load' : '不在商店目錄'}
                    </span>
                    {showFailed && (
                        <span className={styles.badgeDanger}>
                            載入失敗:{reason}
                        </span>
                    )}
                </span>
                <span
                    className={styles.rowDesc}
                    title={installed.manifest.description}
                >
                    {installed.manifest.description}
                </span>
                {error && <span className={styles.rowError}>{error}</span>}
            </div>
            <div className={styles.actions}>
                <button
                    className={hud.switchTrack[installed.enabled ? 'on' : 'off']}
                    title={installed.enabled ? '停用此外掛' : '啟用此外掛'}
                    disabled={busy}
                    onClick={() => onToggle(!installed.enabled)}
                />
                <button
                    className={styles.removeBtn}
                    disabled={busy}
                    onClick={onUninstall}
                >
                    {busy ? '處理中…' : '移除'}
                </button>
            </div>
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

    // catalog 拿不到（離線）時視為空集合，所有已安裝外掛都落進「不在
    // 商店目錄」清單，仍然可以停用/移除，管理流程不因離線而斷掉
    const catalogIds = new Set((catalog?.plugins ?? []).map((e) => e.id));
    const orphanInstalled = installed.filter((p) => !catalogIds.has(p.id));

    useEffect(() => {
        if (!open) return;
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

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div
                className={styles.dialog}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.header}>
                    <span>
                        <Puzzle
                            size={14}
                            style={{ verticalAlign: '-2px', marginRight: 6 }}
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

                {catalog === null && (
                    <div className={styles.offlineHint}>
                        無法取得外掛目錄（離線？），已安裝的外掛不受影響
                    </div>
                )}
                {catalog !== null &&
                    catalog.plugins.length === 0 &&
                    orphanInstalled.length === 0 && (
                        <div className={styles.emptyHint}>
                            目前沒有可用外掛
                        </div>
                    )}
                {catalog !== null && catalog.plugins.length > 0 && (
                    <div className={styles.list}>
                        {catalog.plugins.map((entry) => {
                            const inst = installed.find(
                                (p) => p.id === entry.id,
                            );
                            return (
                                <PluginRow
                                    key={entry.id}
                                    entry={entry}
                                    installed={inst}
                                    loaded={loaded}
                                    busy={busyIds.has(entry.id)}
                                    error={rowErrors[entry.id]}
                                    onInstall={() =>
                                        void withBusy(entry.id, () =>
                                            installPlugin(entry),
                                        )
                                    }
                                    onUpdate={() =>
                                        void withBusy(entry.id, () =>
                                            updatePlugin(entry.id),
                                        )
                                    }
                                    onToggle={(on) =>
                                        void withBusy(entry.id, () =>
                                            setPluginEnabled(entry.id, on),
                                        )
                                    }
                                    onUninstall={() => onUninstall(entry.id)}
                                />
                            );
                        })}
                    </div>
                )}
                {orphanInstalled.length > 0 && (
                    <>
                        <div className={styles.sectionLabel}>
                            已安裝（不在商店目錄）
                        </div>
                        <div className={styles.list}>
                            {orphanInstalled.map((p) => (
                                <OrphanRow
                                    key={p.id}
                                    installed={p}
                                    loaded={loaded}
                                    busy={busyIds.has(p.id)}
                                    error={rowErrors[p.id]}
                                    onToggle={(on) =>
                                        void withBusy(p.id, () =>
                                            setPluginEnabled(p.id, on),
                                        )
                                    }
                                    onUninstall={() => onUninstall(p.id)}
                                />
                            ))}
                        </div>
                    </>
                )}

                <DevSection />
            </div>
        </div>
    );
}
