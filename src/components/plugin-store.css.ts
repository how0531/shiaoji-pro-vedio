// src/components/plugin-store.css.ts：外掛商店樣式。
// 外框比照 panel-library.css.ts 的 backdrop + shell + dialog 三層。列表
// 改比照 bottom-dock.css.ts 的密實 table/cardRow 語彙（每列一條底線分隔，
// 不再各自套一個完整邊框盒），一列約 48px，一螢幕看得完更多外掛。

import { style, styleVariants } from '@vanilla-extract/css';
import { vars } from '../theme.css';

export const backdrop = style({
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    background: 'rgba(0, 0, 0, 0.45)',
});

export const shell = style({
    position: 'fixed',
    top: '10vh',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 2001,
    width: 'min(680px, calc(100vw - 32px))',
});

export const dialog = style({
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '78vh',
    background: vars.color.panelRaised,
    border: `1px solid ${vars.color.borderBright}`,
    borderRadius: vars.radius.lg,
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
});

export const header = style({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${vars.space.md} ${vars.space.lg}`,
    borderBottom: `1px solid ${vars.color.border}`,
    fontFamily: vars.font.display,
    fontSize: '0.85rem',
    fontWeight: 700,
    color: vars.color.foreground,
});

export const closeBtn = style({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    background: 'transparent',
    border: 'none',
    borderRadius: vars.radius.sm,
    color: vars.color.mutedForeground,
    cursor: 'pointer',
    ':hover': { color: vars.color.foreground, background: vars.color.muted },
});

export const body = style({
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: `${vars.space.sm} ${vars.space.sm} ${vars.space.md}`,
});

// 列與列之間靠 item 的底線分隔，不再靠 gap 撐開，密度才出得來
export const list = style({
    display: 'flex',
    flexDirection: 'column',
});

// 分節標題（已安裝／可安裝），比照 panel-library 的 sectionHeader
export const sectionHeader = style({
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    width: '100%',
    margin: 0,
    padding: `${vars.space.sm} ${vars.space.xs} 3px`,
    border: 0,
    background: 'transparent',
    color: vars.color.mutedForeground,
    fontFamily: vars.font.display,
    fontSize: '0.66rem',
    fontWeight: 600,
    textAlign: 'left',
});

export const sectionCount = style({
    marginLeft: 'auto',
    fontFamily: vars.font.mono,
    fontWeight: 400,
});

// 離線：拿不到目錄是「暫時的異常」，用琥珀色跟「本來就沒東西」的空狀態
// 區分開。琥珀底／框沿用 badgeWarn 與 devWarning 的既有硬編色（vars 沒有
// amberDim 這一階，警示色比照既有慣例直接寫 rgba）
export const offlineHint = style({
    display: 'flex',
    alignItems: 'flex-start',
    gap: vars.space.sm,
    margin: `${vars.space.sm} ${vars.space.xs}`,
    padding: vars.space.md,
    fontSize: '0.72rem',
    lineHeight: 1.5,
    color: vars.color.amber,
    background: 'rgba(224, 164, 60, 0.08)',
    border: '1px solid rgba(224, 164, 60, 0.45)',
    borderRadius: vars.radius.sm,
});

export const emptyHint = style({
    padding: `${vars.space.lg} ${vars.space.md}`,
    fontSize: '0.76rem',
    color: vars.color.mutedForeground,
    textAlign: 'center',
});

// ---- 密實列 ----

// 一顆外掛的外層：summary 列＋（可選）錯誤列／展開詳情，底線分隔到下一顆
export const item = style({
    borderBottom: `1px solid ${vars.color.border}`,
    selectors: {
        '&:last-child': { borderBottom: 'none' },
    },
});

const rowBase = style({
    display: 'flex',
    alignItems: 'center',
    gap: vars.space.sm,
    padding: '8px 10px',
    outline: 'none',
    selectors: {
        '&:hover': { background: vars.color.muted },
        '&:focus-visible': {
            outline: `2px solid ${vars.color.accent}`,
            outlineOffset: '-2px',
        },
    },
});

export const row = styleVariants({
    normal: [rowBase, {}],
    expanded: [rowBase, { background: vars.color.accentDim }],
});

const iconTileBase = style({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    flexShrink: 0,
    borderRadius: vars.radius.sm,
    border: `1px solid ${vars.color.border}`,
    background: vars.color.inset,
    fontFamily: vars.font.display,
    fontSize: '0.72rem',
    fontWeight: 700,
    lineHeight: 1,
    userSelect: 'none',
});

export const iconTile = styleVariants({
    official: [iconTileBase, { color: vars.color.accent }],
    // side-load 的外掛不經官方簽驗，圖示也跟著換成警示色，掃一眼就分得出來
    sideload: [iconTileBase, { color: vars.color.amber }],
});

// 名稱＋狀態徽章＋描述同一行，描述截斷吃掉多餘空間
export const rowMain = style({
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
    flex: 1,
    minWidth: 0,
    fontFamily: vars.font.body,
});

export const rowName = style({
    flexShrink: 0,
    maxWidth: '11rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.76rem',
    fontWeight: 600,
    color: vars.color.foreground,
});

// 單行截斷（原本兩行 clamp），密度優先，完整說明展開詳情看
export const rowDesc = style({
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.68rem',
    color: vars.color.mutedForeground,
});

// 風險（點或 chips）＋版本，靠右、不參與截斷
export const rowMeta = style({
    display: 'flex',
    alignItems: 'center',
    gap: vars.space.xs,
    flexShrink: 0,
});

export const rowVersion = style({
    fontFamily: vars.font.mono,
    fontSize: '0.62rem',
    fontWeight: 400,
    color: vars.color.mutedForeground,
    whiteSpace: 'nowrap',
});

export const versionNext = style({
    color: vars.color.accent,
});

export const errorText = style({
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    fontSize: '0.66rem',
    lineHeight: 1.45,
    color: vars.color.danger,
});

// 動作列下方單獨一行，寬度對齊 row 的左右內距
export const rowErrorLine = style({
    padding: `0 10px 8px`,
});

// 展開詳情鈕：改成純圖示，密實列容不下「詳細資訊與權限」這種長文案
export const detailBtn = style({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    flexShrink: 0,
    padding: 0,
    border: 0,
    borderRadius: vars.radius.sm,
    background: 'transparent',
    color: vars.color.mutedForeground,
    cursor: 'pointer',
    ':hover': { color: vars.color.accent, background: vars.color.muted },
});

// ---- 權限 ----

export const permRow = style({
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '4px',
});

const permChipBase = {
    fontFamily: vars.font.display,
    fontSize: '0.6rem',
    fontWeight: 600,
    letterSpacing: '0.02em',
    padding: '1px 6px',
    borderRadius: '999px',
    border: '1px solid',
    whiteSpace: 'nowrap' as const,
};

export const permChip = styleVariants({
    high: [
        permChipBase,
        {
            color: vars.color.danger,
            borderColor: vars.color.danger,
            background: 'transparent',
        },
    ],
    // 中風險用琥珀，硬編 rgba 比照 badgeWarn（theme vars 沒有 amberDim）
    medium: [
        permChipBase,
        {
            color: vars.color.amber,
            borderColor: 'rgba(224, 164, 60, 0.45)',
            background: 'rgba(224, 164, 60, 0.08)',
        },
    ],
    low: [
        permChipBase,
        {
            color: vars.color.mutedForeground,
            borderColor: vars.color.border,
            background: vars.color.inset,
        },
    ],
    // 舊 manifest 沒宣告 permissions：不是「零權限」，要看得出是未知
    unknown: [
        permChipBase,
        {
            color: vars.color.amber,
            borderColor: 'rgba(224, 164, 60, 0.45)',
            background: 'rgba(224, 164, 60, 0.08)',
        },
    ],
    // 用 success（恆為綠）而非 up：台股慣例下 up 是紅色，「不需權限」不該
    // 看起來像警示
    none: [
        permChipBase,
        {
            color: vars.color.success,
            borderColor: vars.color.success,
            background: 'transparent',
        },
    ],
});

export const detail = style({
    display: 'flex',
    flexDirection: 'column',
    gap: vars.space.sm,
    padding: `4px 10px ${vars.space.sm}`,
});

export const detailLabel = style({
    fontFamily: vars.font.display,
    fontSize: '0.62rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: vars.color.mutedForeground,
});

export const detailText = style({
    fontSize: '0.68rem',
    lineHeight: 1.55,
    color: vars.color.foreground,
});

export const permList = style({
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
});

export const permItem = style({
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    gap: vars.space.sm,
    alignItems: 'start',
});

const permDotBase = style({
    width: '7px',
    height: '7px',
    marginTop: '5px',
    borderRadius: '50%',
    flexShrink: 0,
});

// 展開詳情裡逐條權限的點：靠 marginTop 對齊文字第一行（permItem 是
// alignItems: 'start' 的 grid，權限說明可能兩行）
export const permDot = styleVariants({
    high: [permDotBase, { background: vars.color.danger }],
    medium: [permDotBase, { background: vars.color.amber }],
    low: [permDotBase, { background: vars.color.mutedForeground }],
});

const riskDotBase = style({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
});

// 商店列上的單顆風險點（已安裝區塊）：置身 rowMeta 這個 alignItems:
// center 的 flex 列，不需要 permDot 那個對齊文字用的 marginTop
export const riskDot = styleVariants({
    high: [riskDotBase, { background: vars.color.danger }],
    medium: [riskDotBase, { background: vars.color.amber }],
    low: [riskDotBase, { background: vars.color.mutedForeground }],
});

export const permText = style({
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: 0,
});

export const permLabel = style({
    fontSize: '0.7rem',
    fontWeight: 600,
    color: vars.color.foreground,
});

export const permDesc = style({
    fontSize: '0.64rem',
    lineHeight: 1.5,
    color: vars.color.mutedForeground,
});

// 未宣告權限／更新後新增權限的提醒框（琥珀，比照 devWarning）
export const permNotice = style({
    display: 'flex',
    gap: '6px',
    padding: vars.space.sm,
    fontSize: '0.66rem',
    lineHeight: 1.5,
    color: vars.color.amber,
    background: 'rgba(224, 164, 60, 0.08)',
    border: '1px solid rgba(224, 164, 60, 0.45)',
    borderRadius: vars.radius.sm,
});

export const metaGrid = style({
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    columnGap: vars.space.sm,
    rowGap: '3px',
    fontSize: '0.64rem',
    color: vars.color.mutedForeground,
});

export const metaValue = style({
    fontFamily: vars.font.mono,
    color: vars.color.foreground,
    overflowWrap: 'anywhere',
});

// ---- 徽章 ----

const badgeBase = {
    fontFamily: vars.font.display,
    fontSize: '0.62rem',
    fontWeight: 600,
    letterSpacing: '0.02em',
    padding: '1px 7px',
    borderRadius: '999px',
    border: '1px solid',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
};

export const badge = style([
    badgeBase,
    {
        color: vars.color.mutedForeground,
        borderColor: vars.color.border,
        background: vars.color.inset,
    },
]);

export const badgeOk = style([
    badgeBase,
    {
        color: vars.color.up,
        borderColor: vars.color.up,
        background: 'transparent',
    },
]);

export const badgeUpdate = style([
    badgeBase,
    {
        color: vars.color.accent,
        borderColor: vars.color.accent,
        background: vars.color.accentDim,
    },
]);

export const badgeWarn = style([
    badgeBase,
    {
        color: vars.color.amber,
        borderColor: 'rgba(224, 164, 60, 0.45)',
        background: 'rgba(224, 164, 60, 0.08)',
    },
]);

export const badgeDanger = style([
    badgeBase,
    {
        color: vars.color.danger,
        borderColor: vars.color.danger,
        background: 'transparent',
    },
]);

// ---- 動作 ----

export const actions = style({
    display: 'flex',
    alignItems: 'center',
    gap: vars.space.xs,
    flexShrink: 0,
});

export const actionBtn = style({
    fontFamily: vars.font.display,
    fontSize: '0.68rem',
    fontWeight: 600,
    padding: '4px 9px',
    cursor: 'pointer',
    borderRadius: vars.radius.sm,
    border: `1px solid ${vars.color.border}`,
    background: vars.color.inset,
    color: vars.color.accent,
    transition: 'all 0.12s',
    whiteSpace: 'nowrap',
    ':hover': {
        borderColor: vars.color.accent,
        background: vars.color.accentDim,
    },
    ':disabled': {
        cursor: 'wait',
        color: vars.color.mutedForeground,
        borderColor: vars.color.border,
        background: vars.color.inset,
    },
});

export const removeBtn = style({
    fontFamily: vars.font.display,
    fontSize: '0.68rem',
    fontWeight: 600,
    padding: '4px 9px',
    cursor: 'pointer',
    borderRadius: vars.radius.sm,
    border: `1px solid ${vars.color.border}`,
    background: 'transparent',
    color: vars.color.mutedForeground,
    transition: 'all 0.12s',
    whiteSpace: 'nowrap',
    ':hover': { borderColor: vars.color.danger, color: vars.color.danger },
    ':disabled': { cursor: 'wait', opacity: 0.5 },
});

export const rowError = style({
    fontSize: '0.68rem',
    color: vars.color.danger,
});

// ---- 開發者模式 ----

export const devSection = style({
    borderTop: `1px solid ${vars.color.border}`,
    padding: vars.space.md,
    display: 'flex',
    flexDirection: 'column',
    gap: vars.space.sm,
});

export const devToggle = style({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: vars.font.display,
    fontSize: '0.66rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: vars.color.mutedForeground,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    ':hover': { color: vars.color.foreground },
});

export const devRow = style({
    display: 'flex',
    gap: vars.space.xs,
});

export const devInput = style({
    flex: 1,
    minWidth: 0,
    fontFamily: vars.font.mono,
    fontSize: '0.72rem',
    color: vars.color.foreground,
    background: vars.color.inset,
    border: `1px solid ${vars.color.border}`,
    borderRadius: vars.radius.sm,
    padding: '5px 8px',
    outline: 'none',
    ':focus': { borderColor: vars.color.accent },
    '::placeholder': { color: vars.color.mutedForeground },
});

export const devWarning = style({
    display: 'flex',
    flexDirection: 'column',
    gap: vars.space.sm,
    fontSize: '0.72rem',
    lineHeight: 1.5,
    color: vars.color.amber,
    background: 'rgba(224, 164, 60, 0.08)',
    border: '1px solid rgba(224, 164, 60, 0.45)',
    borderRadius: vars.radius.sm,
    padding: vars.space.md,
});

export const devConfirmActions = style({
    display: 'flex',
    justifyContent: 'flex-end',
    gap: vars.space.xs,
});
