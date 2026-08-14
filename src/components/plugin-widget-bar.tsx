// src/components/plugin-widget-bar.tsx — 頂欄的外掛小工具掛載點。
//
// 【host 畫殼，外掛只填值】外框（chip、25px 固定高度、字級、寬度上限、
// 溢位裁切）全部由這裡決定，外掛只負責 slot 裡的那一段文字或數字。
// 【炸掉只毀一格】每個 widget 各自包一層 ErrorBoundary，一個外掛丟例外
// 不會連帶毀掉加權、基差與右側所有按鈕。
// 【重繪預算】chip 用 React.memo 包住，props 只有 label／Component／code，
// 所以 HudHeader 因為時鐘每秒 setState 重繪時，widget 不會跟著陪跑；反向
// 也成立：widget 自己 setState 只影響它自己那一格。

import React from 'react';
import { listLoadedWidgets, usePluginsState } from '../lib/plugins/store';
import {
    selectHeaderWidgets,
    useWidgetPrefs,
} from '../lib/plugins/widget-prefs';
import type { PluginWidgetProps } from '../lib/plugins/types';
import * as hud from './hud-header.css';
import * as styles from './plugin-widget-bar.css';

class WidgetBoundary extends React.Component<
    { children: React.ReactNode },
    { error: string | null }
> {
    state = { error: null as string | null };
    static getDerivedStateFromError(e: unknown) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
    render() {
        if (this.state.error !== null) {
            // 頂欄沒有空間放錯誤訊息，也不該在這裡放重試按鈕（那要多一顆
            // 可點的東西）。留一個替身＋hover 說明。
            //
            // 【重置路徑在呼叫端，不在這裡】這個 class 本身不會自己清掉
            // state.error；靠的是 WidgetChip 的 key 帶 sha256，外掛升版
            // 換了新的 Component 時 key 跟著換，React 就會整顆重新掛載，
            // 等於重新 mount 出一個乾淨的 boundary。key 不帶版本資訊的話，
            // 這一格會永遠回不來，即使 Component 已經換成修好的新函式。
            // 提示文案跟著這個事實寫：版本沒變就是同一份程式碼仍在壞，
            // 不再叫使用者做「重新載入」這種其實沒有用的事。
            return (
                <span
                    className={styles.slotError}
                    title={`小工具發生錯誤：${this.state.error}（外掛更新後會自動恢復；若持續發生，可到設定關閉這個小工具）`}
                >
                    —
                </span>
            );
        }
        return this.props.children;
    }
}

const WidgetChip = React.memo(function WidgetChip({
    label,
    Component,
    code,
}: {
    label: string;
    Component: React.ComponentType<PluginWidgetProps>;
    code: string | null;
}) {
    return (
        // 刻意不掛 role='status'：那是 polite live region，一個每秒跳動的
        // 監控數字會讓螢幕閱讀器一直朗讀。可見的 chipLabel 已經是它的名稱。
        <div className={`${hud.chip} ${styles.widgetChip}`} title={label}>
            <span className={hud.chipLabel}>{label}</span>
            <span className={styles.slot}>
                <WidgetBoundary>
                    <Component code={code} />
                </WidgetBoundary>
            </span>
        </div>
    );
});

export const PluginWidgetBar = React.memo(function PluginWidgetBar({
    code,
}: {
    code: string | null;
}) {
    // 安裝／停用／移除外掛都會動到這個 store，重新取一次註冊表
    usePluginsState();
    const prefs = useWidgetPrefs();
    const shown = selectHeaderWidgets(prefs, listLoadedWidgets());
    // 沒有任何開著的小工具時完全不渲染（不是隱藏，是不存在），
    // 沒裝外掛的使用者頂欄與現在一模一樣
    if (shown.length === 0) return null;
    return (
        <div className={styles.bar}>
            {shown.map(({ pluginId, widget, sha256 }) => (
                // key 帶 sha256：外掛升版換掉 bundle 內容時 key 跟著變，
                // React 會整顆重新掛載 WidgetChip（連同裡面的
                // WidgetBoundary），舊版留下的 state.error 不會沿用到新版
                // 身上。同一版重複渲染時 sha256 不變，key 穩定，不會無謂
                // remount。
                <WidgetChip
                    key={`${pluginId}::${widget.key}::${sha256}`}
                    label={widget.label}
                    Component={widget.Component}
                    code={code}
                />
            ))}
        </div>
    );
});
