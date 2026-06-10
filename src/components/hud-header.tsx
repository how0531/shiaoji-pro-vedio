// src/components/hud-header.tsx — top status bar with workspace menus

import { useEffect, useState } from 'react';
import { useStreamStatus } from '../hooks/use-stream';
import { fetchHealth, fetchInfo } from '../lib/shioaji';
import {
    setThemeSettings,
    useThemeSettings,
    type Convention,
    type ThemeMode,
} from '../lib/theme-store';
import { fmtMoney } from '../lib/utils/format';
import type { BlockType } from '../lib/workspace';
import * as panel from './panel.css';
import * as styles from './hud-header.css';

const STATUS_LABEL = {
    live: 'LIVE',
    connecting: 'SYNC',
    down: 'LOST',
} as const;

const MODE_OPTIONS: { key: ThemeMode; label: string }[] = [
    { key: 'dark', label: '深色' },
    { key: 'midnight', label: '純黑' },
    { key: 'light', label: '淺色' },
];

const CONVENTION_OPTIONS: { key: Convention; label: string }[] = [
    { key: 'tw', label: '紅漲綠跌' },
    { key: 'intl', label: '綠漲紅跌' },
];

function Menu({
    label,
    children,
}: {
    label: string;
    children: (close: () => void) => React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className={styles.settingsWrap}>
            <button
                className={styles.resetBtn}
                onClick={() => setOpen((o) => !o)}
            >
                {label}
            </button>
            {open && (
                <>
                    <div
                        className={styles.popoverBackdrop}
                        onClick={() => setOpen(false)}
                    />
                    <div className={styles.popover}>
                        {children(() => setOpen(false))}
                    </div>
                </>
            )}
        </div>
    );
}

function ThemeSettings() {
    const settings = useThemeSettings();
    return (
        <Menu label='主題'>
            {() => (
                <>
                    <span className={styles.settingLabel}>主題 Theme</span>
                    <div className={styles.settingGroup}>
                        {MODE_OPTIONS.map((m) => (
                            <button
                                key={m.key}
                                className={
                                    styles.opt[
                                        settings.mode === m.key ? 'on' : 'off'
                                    ]
                                }
                                onClick={() =>
                                    setThemeSettings({ mode: m.key })
                                }
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                    <span className={styles.settingLabel}>
                        漲跌顏色 Price Colors
                    </span>
                    <div className={styles.settingGroup}>
                        {CONVENTION_OPTIONS.map((c) => (
                            <button
                                key={c.key}
                                className={
                                    styles.opt[
                                        settings.convention === c.key
                                            ? 'on'
                                            : 'off'
                                    ]
                                }
                                onClick={() =>
                                    setThemeSettings({ convention: c.key })
                                }
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                    <div className={styles.convPreview}>
                        <span className={panel.dirText.up}>▲ +1.25 上漲</span>
                        <span className={panel.dirText.down}>
                            ▼ -1.25 下跌
                        </span>
                    </div>
                </>
            )}
        </Menu>
    );
}

function AddBlockMenu({
    addableTypes,
    onAddBlock,
}: {
    addableTypes: { type: BlockType; label: string; disabled: boolean }[];
    onAddBlock: (type: BlockType) => void;
}) {
    return (
        <Menu label='＋ 新增面板'>
            {(close) => (
                <>
                    <span className={styles.settingLabel}>
                        新增面板 Add Panel
                    </span>
                    {addableTypes.map((t) => (
                        <button
                            key={t.type}
                            className={styles.menuItem}
                            disabled={t.disabled}
                            onClick={() => {
                                onAddBlock(t.type);
                                close();
                            }}
                        >
                            {t.label}
                            {t.disabled && '（已存在）'}
                        </button>
                    ))}
                </>
            )}
        </Menu>
    );
}

function ProfilesMenu({
    profiles,
    onSaveProfile,
    onLoadProfile,
    onDeleteProfile,
    onResetWorkspace,
}: {
    profiles: string[];
    onSaveProfile: (name: string) => void;
    onLoadProfile: (name: string) => void;
    onDeleteProfile: (name: string) => void;
    onResetWorkspace: () => void;
}) {
    const [name, setName] = useState('');
    return (
        <Menu label='版面'>
            {(close) => (
                <>
                    <span className={styles.settingLabel}>
                        儲存目前版面 Save Layout
                    </span>
                    <div className={styles.saveRow}>
                        <input
                            className={styles.saveInput}
                            placeholder='版面名稱'
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && name.trim()) {
                                    onSaveProfile(name.trim());
                                    setName('');
                                }
                            }}
                        />
                        <button
                            className={styles.resetBtn}
                            disabled={!name.trim()}
                            onClick={() => {
                                if (name.trim()) {
                                    onSaveProfile(name.trim());
                                    setName('');
                                }
                            }}
                        >
                            儲存
                        </button>
                    </div>
                    <span className={styles.settingLabel}>
                        版面列表 Saved Layouts
                    </span>
                    {profiles.length === 0 && (
                        <span className={styles.emptyHint}>
                            尚無儲存的版面
                        </span>
                    )}
                    {profiles.map((p) => (
                        <div key={p} className={styles.profileRow}>
                            <button
                                className={styles.menuItem}
                                style={{ flex: 1 }}
                                onClick={() => {
                                    onLoadProfile(p);
                                    close();
                                }}
                            >
                                {p}
                            </button>
                            <button
                                className={styles.profileDelete}
                                title='刪除此版面'
                                onClick={() => onDeleteProfile(p)}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                    <button
                        className={styles.menuItem}
                        onClick={() => {
                            onResetWorkspace();
                            close();
                        }}
                    >
                        ↺ 重設為預設版面
                    </button>
                </>
            )}
        </Menu>
    );
}

export function HudHeader({
    accBalance,
    addableTypes,
    onAddBlock,
    profiles,
    onSaveProfile,
    onLoadProfile,
    onDeleteProfile,
    onResetWorkspace,
}: {
    accBalance?: number;
    addableTypes: { type: BlockType; label: string; disabled: boolean }[];
    onAddBlock: (type: BlockType) => void;
    profiles: string[];
    onSaveProfile: (name: string) => void;
    onLoadProfile: (name: string) => void;
    onDeleteProfile: (name: string) => void;
    onResetWorkspace: () => void;
}) {
    const streamStatus = useStreamStatus();
    const [simulation, setSimulation] = useState<boolean | null>(null);
    const [version, setVersion] = useState('');
    const [contractCount, setContractCount] = useState<number | null>(null);
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        fetchInfo()
            .then((info) => {
                setSimulation(info.simulation);
                setVersion(info.version);
            })
            .catch(() => setSimulation(null));
        fetchHealth()
            .then((h) => setContractCount(h.contract_count))
            .catch(() => undefined);
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    return (
        <header className={styles.header}>
            <div className={styles.logoBlock}>
                <span className={styles.logoMain}>Shioaji Pro</span>
                <span className={styles.logoSub}>
                    交易終端 {version && `v${version}`}
                </span>
            </div>

            {simulation !== null &&
                (simulation ? (
                    <span className={styles.simBadge}>模擬環境</span>
                ) : (
                    <span className={styles.prodBadge}>正式環境</span>
                ))}

            <div className={styles.spacer} />

            {accBalance !== undefined && (
                <div className={styles.chip}>
                    <span className={styles.chipLabel}>銀行水位</span>
                    <span>{fmtMoney(accBalance)}</span>
                </div>
            )}

            {contractCount !== null && (
                <div className={styles.chip}>
                    <span className={styles.chipLabel}>Contracts</span>
                    <span>{contractCount.toLocaleString()}</span>
                </div>
            )}

            <div className={styles.chip}>
                <span className={styles.led[streamStatus]} />
                <span>{STATUS_LABEL[streamStatus]}</span>
            </div>

            <AddBlockMenu
                addableTypes={addableTypes}
                onAddBlock={onAddBlock}
            />
            <ProfilesMenu
                profiles={profiles}
                onSaveProfile={onSaveProfile}
                onLoadProfile={onLoadProfile}
                onDeleteProfile={onDeleteProfile}
                onResetWorkspace={onResetWorkspace}
            />
            <ThemeSettings />

            <span className={styles.clock}>
                {now.toLocaleTimeString('en-GB', { hour12: false })}
            </span>
        </header>
    );
}
