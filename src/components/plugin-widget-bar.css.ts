// src/components/plugin-widget-bar.css.ts：頂欄外掛小工具的「殼」。
// chip 本體沿用 hud-header.css 的 chip／chipLabel（market-bar.tsx 已是這個
// 寫法），這裡只補外掛專屬的尺寸與圍堵規則，hud-header.css.ts 一行都不用改。

import { style } from '@vanilla-extract/css';
import { vars } from '../theme.css';

// 壓縮順序寫死：視窗變窄時第一個被裁掉的一定是外掛小工具。
// flexShrink 1 + minWidth 0 讓這一段先讓步，加權/基差 chip 與右側所有按鈕
// 都不會位移（右組本來就靠 spacer 貼右，位置完全不動）。
export const bar = style({
    display: 'flex',
    alignItems: 'center',
    gap: vars.space.md,
    flex: '0 1 auto',
    minWidth: 0,
    overflow: 'hidden',
});

// 單一 widget 的外框。高度／邊框／字級由 hud.chip 決定（頂欄統一 25px），
// 這裡只加寬度上限：外掛的內容再長也只能吃掉 8rem。
export const widgetChip = style({
    maxWidth: '8rem',
    minWidth: 0,
    overflow: 'hidden',
});

// 外掛真正能畫的地方。contain: content 是唯一能實體擋住「外掛用 position
// absolute／超大字級把頂欄畫爛」的一行 CSS：它把 layout/paint/style 都圍在
// 這一格內，而且讓這一格成為絕對定位子孫的 containing block。
export const slot = style({
    display: 'inline-block',
    verticalAlign: 'middle',
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    lineHeight: 1.1,
    contain: 'content',
});

// widget 自己丟例外時的替身：保留一格的寬度，不讓整條頂欄崩掉。
export const slotError = style({
    color: vars.color.danger,
    fontFamily: vars.font.mono,
    cursor: 'help',
});
