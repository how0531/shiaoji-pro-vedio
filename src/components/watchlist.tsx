// src/components/watchlist.tsx — server-backed editable watchlists.
// Pick a list, add symbols (type auto-detected), hover a row to remove,
// drag rows to reorder (persisted to the server).

import { memo, useRef, useState } from 'react';
import { useQuote } from '../hooks/use-stream';
import type { WatchItem } from '../hooks/use-watchlist';
import type { ServerWatchlist } from '../lib/shioaji';
import type { ContractInfo } from '../lib/types/contract';
import { fmtPct, fmtPrice, fmtSigned } from '../lib/utils/format';
import * as panel from './panel.css';
import * as styles from './watchlist.css';

const WatchRow = memo(function WatchRow({
    item,
    selected,
    dropTarget,
    onSelect,
    onRemove,
    onDragStart,
    onDragOver,
    onDrop,
}: {
    item: WatchItem;
    selected: boolean;
    dropTarget: boolean;
    onSelect: (c: ContractInfo) => void;
    onRemove: (code: string) => void;
    onDragStart: (code: string) => void;
    onDragOver: (code: string) => void;
    onDrop: () => void;
}) {
    const quote = useQuote(item.contract.code);
    const tick = quote?.tick;

    const close = tick ? Number(tick.close) : item.snapshot?.close;
    const ref = item.contract.reference;
    const chg = tick?.price_chg
        ? Number(tick.price_chg)
        : close !== undefined && ref
          ? close - ref
          : undefined;
    const pct = tick?.pct_chg
        ? Number(tick.pct_chg)
        : chg !== undefined && ref
          ? (chg / ref) * 100
          : undefined;

    const dir = chg === undefined || chg === 0 ? 'flat' : chg > 0 ? 'up' : 'down';
    // the flash overlay is re-keyed by flashSeq so the animation replays on
    // every real deal — the row itself stays mounted (hover state survives)
    const flashDir = !quote?.flashSeq
        ? null
        : quote.lastDir === -1
          ? ('down' as const)
          : ('up' as const);

    return (
        <div
            className={`${styles.row[selected ? 'selected' : 'normal']} ${
                dropTarget ? styles.dropTarget : ''
            }`}
            draggable
            onClick={() => onSelect(item.contract)}
            onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                onDragStart(item.contract.code);
            }}
            onDragOver={(e) => {
                e.preventDefault();
                onDragOver(item.contract.code);
            }}
            onDrop={(e) => {
                e.preventDefault();
                onDrop();
            }}
        >
            {flashDir && (
                <span
                    key={quote?.flashSeq}
                    className={styles.flashOverlay[flashDir]}
                />
            )}
            <span className={styles.code}>{item.contract.code}</span>
            <span className={`${styles.price} ${panel.dirText[dir]}`}>
                {fmtPrice(close)}
            </span>
            <span className={styles.name}>{item.contract.name}</span>
            <span className={`${styles.change} ${panel.dirText[dir]}`}>
                {fmtSigned(chg)} {fmtPct(pct)}
            </span>
            <button
                className={styles.rowRemove}
                title='從清單移除'
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.contract.code);
                }}
            >
                ✕
            </button>
        </div>
    );
});

export function Watchlist({
    items,
    selectedCode,
    onSelect,
    onAdd,
    onRemove,
    onReorder,
    serverLists,
    activeListId,
    onSelectList,
    onCreateList,
    onDeleteList,
    loading,
}: {
    items: WatchItem[];
    selectedCode: string | null;
    onSelect: (c: ContractInfo) => void;
    onAdd: (code: string) => Promise<unknown>;
    onRemove: (code: string) => void;
    onReorder: (fromCode: string, toCode: string) => void;
    serverLists: ServerWatchlist[];
    activeListId: string;
    onSelectList: (id: string) => void;
    onCreateList: (name: string) => Promise<unknown>;
    onDeleteList: () => Promise<unknown>;
    loading: boolean;
}) {
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const dragCode = useRef<string | null>(null);
    // ref mirrors the state — drop can fire in the same frame as the last
    // dragover, before React commits the state update
    const dropCodeRef = useRef<string | null>(null);
    const [dropCode, setDropCode] = useState<string | null>(null);
    const setDropTarget = (code: string) => {
        dropCodeRef.current = code;
        setDropCode(code);
    };

    const handleDrop = () => {
        const from = dragCode.current;
        const to = dropCodeRef.current;
        dragCode.current = null;
        dropCodeRef.current = null;
        setDropCode(null);
        if (from && to && from !== to) onReorder(from, to);
    };

    const submit = async () => {
        const code = input.trim().toUpperCase();
        if (!code || busy) return;
        setBusy(true);
        try {
            await onAdd(code);
            setInput('');
        } catch {
            // keep input so user can fix typo
        } finally {
            setBusy(false);
        }
    };

    const submitNewList = async () => {
        const name = newName.trim();
        if (!name) return;
        try {
            await onCreateList(name);
            setCreating(false);
            setNewName('');
        } catch {
            // notified upstream
        }
    };

    return (
        <>
            <div className={styles.listPicker}>
                {creating ? (
                    <>
                        <input
                            autoFocus
                            className={styles.addInput}
                            placeholder='新清單名稱'
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') submitNewList();
                                if (e.key === 'Escape') setCreating(false);
                            }}
                        />
                        <button
                            className={panel.btn}
                            onClick={submitNewList}
                        >
                            建立
                        </button>
                    </>
                ) : (
                    <>
                        <select
                            className={styles.listSelect}
                            value={activeListId}
                            onChange={(e) => {
                                setConfirmDelete(false);
                                onSelectList(e.target.value);
                            }}
                        >
                            {serverLists.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.name}（{l.contracts.length}）
                                </option>
                            ))}
                        </select>
                        <button
                            className={styles.listBtn}
                            title='建立新清單'
                            onClick={() => setCreating(true)}
                        >
                            ＋
                        </button>
                        <button
                            className={`${styles.listBtn} ${
                                confirmDelete ? styles.listBtnDanger : ''
                            }`}
                            title={
                                confirmDelete
                                    ? '再按一次確認刪除整個清單'
                                    : '刪除目前清單'
                            }
                            onClick={() => {
                                if (confirmDelete) {
                                    setConfirmDelete(false);
                                    void onDeleteList();
                                } else {
                                    setConfirmDelete(true);
                                    setTimeout(
                                        () => setConfirmDelete(false),
                                        2500,
                                    );
                                }
                            }}
                        >
                            {confirmDelete ? '確認?' : '🗑'}
                        </button>
                    </>
                )}
            </div>
            <div className={panel.panelBody}>
                <div className={styles.list}>
                    {loading && items.length === 0 && (
                        <div className={styles.loadingHint}>載入清單…</div>
                    )}
                    {!loading && items.length === 0 && (
                        <div className={styles.loadingHint}>
                            清單是空的 — 在下方輸入代碼加入
                        </div>
                    )}
                    {items.map((item) => (
                        <WatchRow
                            key={item.contract.code}
                            item={item}
                            selected={item.contract.code === selectedCode}
                            dropTarget={item.contract.code === dropCode}
                            onSelect={onSelect}
                            onRemove={onRemove}
                            onDragStart={(code) => {
                                dragCode.current = code;
                            }}
                            onDragOver={setDropTarget}
                            onDrop={handleDrop}
                        />
                    ))}
                </div>
            </div>
            <div className={styles.addRow}>
                <input
                    className={styles.addInput}
                    placeholder='代碼（自動判別股/期/指數）'
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
                <button className={panel.btn} onClick={submit} disabled={busy}>
                    {busy ? '…' : '+'}
                </button>
            </div>
        </>
    );
}
