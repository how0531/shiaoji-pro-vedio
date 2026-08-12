// src/components/news-digest.css.ts

import { style, styleVariants } from '@vanilla-extract/css';
import { vars } from '../theme.css';

export const wrap = style({
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
});

export const list = style({
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
});

// 排行列：整列可點展開該股當日頭條。底色深淺＝新聞熱度（見 heatFill）
export const rankRow = style({
    position: 'relative',
    display: 'flex',
    width: '100%',
    padding: `5px ${vars.space.sm}`,
    background: 'transparent',
    border: 'none',
    borderBottom: `1px solid ${vars.color.border}`,
    cursor: 'pointer',
    textAlign: 'left',
    overflow: 'hidden',
    ':hover': { background: vars.color.muted },
});

// 熱度底條：整列由左往右的淺色填滿，寬度＝該股提及數 / 榜首提及數
export const heatFill = style({
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 0,
    background: vars.color.accent,
    opacity: 0.16,
    pointerEvents: 'none',
});

// 內容層：疊在熱度底條之上
export const rowInner = style({
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: vars.space.xs,
    flex: 1,
    minWidth: 0,
});

export const rankNum = style({
    fontFamily: vars.font.mono,
    fontSize: '0.6rem',
    fontVariantNumeric: 'tabular-nums',
    color: vars.color.mutedForeground,
    width: '1.1rem',
    flexShrink: 0,
    textAlign: 'right',
});

// 點個股 chip → 全終端連動該商品（同新聞面板/排行榜的行為）
export const stockChip = style({
    fontFamily: vars.font.mono,
    fontSize: '0.66rem',
    fontWeight: 600,
    color: vars.color.accent,
    background: vars.color.accentDim,
    border: `1px solid transparent`,
    borderRadius: vars.radius.sm,
    padding: '0 5px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    ':hover': { borderColor: vars.color.accent },
});

export const stockChipName = style({
    fontFamily: vars.font.body,
    fontWeight: 400,
    marginLeft: '3px',
    opacity: 0.8,
});

export const sectorTag = style({
    fontFamily: vars.font.body,
    fontSize: '0.58rem',
    color: vars.color.mutedForeground,
    background: vars.color.muted,
    border: `1px solid ${vars.color.border}`,
    borderRadius: vars.radius.sm,
    padding: '0 4px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
});

const pctBase = style({
    fontFamily: vars.font.mono,
    fontSize: '0.64rem',
    fontVariantNumeric: 'tabular-nums',
    marginLeft: 'auto',
    flexShrink: 0,
});

export const pct = styleVariants({
    up: [pctBase, { color: vars.color.up }],
    down: [pctBase, { color: vars.color.down }],
    flat: [pctBase, { color: vars.color.flat }],
});

// 利多/利空（規則層分類，台股慣例紅多綠空）：排行列的聚合小計
const sentiBase = style({
    fontFamily: vars.font.mono,
    fontSize: '0.6rem',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    flexShrink: 0,
});

export const senti = styleVariants({
    bull: [sentiBase, { color: vars.color.up }],
    bear: [sentiBase, { color: vars.color.down }],
});

// 展開列表的逐則「多/空」標籤（中性不掛，減少視覺噪音）
const sentiTagBase = style({
    fontFamily: vars.font.body,
    fontSize: '0.58rem',
    lineHeight: 1.4,
    borderRadius: vars.radius.sm,
    padding: '0 3px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
});

export const sentiTag = styleVariants({
    bull: [
        sentiTagBase,
        { color: vars.color.up, border: `1px solid ${vars.color.up}` },
    ],
    bear: [
        sentiTagBase,
        { color: vars.color.down, border: `1px solid ${vars.color.down}` },
    ],
});

// 展開後的該股當日頭條
export const itemList = style({
    background: vars.color.inset,
    borderBottom: `1px solid ${vars.color.border}`,
    padding: `2px 0`,
});

export const itemRow = style({
    display: 'flex',
    alignItems: 'baseline',
    gap: vars.space.xs,
    padding: `2px ${vars.space.sm} 2px 1.6rem`,
});

export const time = style({
    fontFamily: vars.font.mono,
    fontSize: '0.6rem',
    fontVariantNumeric: 'tabular-nums',
    color: vars.color.mutedForeground,
    flexShrink: 0,
});

export const sourceTag = style({
    fontFamily: vars.font.body,
    fontSize: '0.58rem',
    color: vars.color.mutedForeground,
    background: vars.color.muted,
    border: `1px solid ${vars.color.border}`,
    borderRadius: vars.radius.sm,
    padding: '0 4px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
});

// 標題本身就是外部連結；沒有連結的（MOPS 重大訊息）用 titleFlat
const titleBase = style({
    fontFamily: vars.font.body,
    fontSize: '0.68rem',
    lineHeight: 1.35,
    color: vars.color.foreground,
    textAlign: 'left',
    background: 'none',
    border: 'none',
    padding: 0,
    minWidth: 0,
});

export const title = style([
    titleBase,
    {
        cursor: 'pointer',
        ':hover': { color: vars.color.accent, textDecoration: 'underline' },
    },
]);

export const titleFlat = style([titleBase, { cursor: 'default' }]);

export const notice = style({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: vars.space.xs,
    padding: '1.2rem 1rem',
    textAlign: 'center',
    fontFamily: vars.font.body,
    fontSize: '0.66rem',
    color: vars.color.mutedForeground,
    lineHeight: 1.6,
});

export const retryBtn = style({
    fontFamily: vars.font.body,
    fontSize: '0.66rem',
    color: vars.color.accent,
    background: 'transparent',
    border: `1px solid ${vars.color.accent}`,
    borderRadius: vars.radius.sm,
    padding: '2px 12px',
    cursor: 'pointer',
});

// ---- 多空總覽（頂部固定區）：一眼看今天利多最強 / 利空最重是誰 ----

export const overview = style({
    flexShrink: 0,
    borderBottom: `1px solid ${vars.color.border}`,
    padding: `3px 0 4px`,
});

export const ovRow = style({
    display: 'flex',
    alignItems: 'center',
    gap: vars.space.xs,
    padding: `2px ${vars.space.sm}`,
    minWidth: 0,
    overflow: 'hidden',
});

const ovLabelBase = style({
    fontFamily: vars.font.body,
    fontSize: '0.6rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    flexShrink: 0,
});

export const ovLabel = styleVariants({
    bull: [ovLabelBase, { color: vars.color.up }],
    bear: [ovLabelBase, { color: vars.color.down }],
});

// 個股 chip：點了連動全終端（同排行列的 stockChip 行為），邊框帶多空色
const ovChipBase = style({
    fontFamily: vars.font.mono,
    fontSize: '0.62rem',
    background: 'transparent',
    borderRadius: vars.radius.sm,
    padding: '0 5px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
});

export const ovChip = styleVariants({
    bull: [
        ovChipBase,
        {
            color: vars.color.up,
            border: `1px solid ${vars.color.up}`,
            ':hover': { background: vars.color.muted },
        },
    ],
    bear: [
        ovChipBase,
        {
            color: vars.color.down,
            border: `1px solid ${vars.color.down}`,
            ':hover': { background: vars.color.muted },
        },
    ],
});

export const ovChipName = style({
    fontFamily: vars.font.body,
    marginLeft: '3px',
    opacity: 0.85,
});

export const ovChipCount = style({
    fontFamily: vars.font.mono,
    fontVariantNumeric: 'tabular-nums',
    marginLeft: '4px',
    opacity: 0.8,
});

// ---- 利多/利空篩選列 ----

export const filterBar = style({
    display: 'flex',
    alignItems: 'center',
    gap: vars.space.xs,
    padding: `3px ${vars.space.sm}`,
    borderBottom: `1px solid ${vars.color.border}`,
    flexShrink: 0,
});

const filterBtnBase = style({
    fontFamily: vars.font.body,
    fontSize: '0.6rem',
    background: 'transparent',
    border: `1px solid ${vars.color.border}`,
    borderRadius: vars.radius.sm,
    color: vars.color.mutedForeground,
    padding: '0 8px',
    lineHeight: 1.7,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ':hover': { color: vars.color.foreground },
});

export const filterBtn = styleVariants({
    off: [filterBtnBase],
    on: [
        filterBtnBase,
        {
            color: vars.color.accent,
            borderColor: vars.color.accent,
            background: vars.color.accentDim,
        },
    ],
});

export const footer = style({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: vars.space.xs,
    padding: `2px ${vars.space.sm}`,
    borderTop: `1px solid ${vars.color.border}`,
    fontFamily: vars.font.body,
    fontSize: '0.56rem',
    color: vars.color.mutedForeground,
    flexShrink: 0,
});

export const warn = style({
    color: vars.color.amber,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
});
