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

// 排行列：整列可點展開該股當日頭條
export const rankRow = style({
    display: 'flex',
    alignItems: 'center',
    gap: vars.space.xs,
    width: '100%',
    padding: `4px ${vars.space.sm}`,
    background: 'transparent',
    border: 'none',
    borderBottom: `1px solid ${vars.color.border}`,
    cursor: 'pointer',
    textAlign: 'left',
    ':hover': { background: vars.color.muted },
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

// 提及次數＋量條（相對於榜首的比例）
export const mentionWrap = style({
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    width: '3.6rem',
    flexShrink: 0,
});

export const mentionBarTrack = style({
    flex: 1,
    height: '3px',
    borderRadius: '2px',
    background: vars.color.muted,
    overflow: 'hidden',
});

export const mentionBarFill = style({
    height: '100%',
    background: vars.color.accent,
    opacity: 0.75,
});

export const mentionCount = style({
    fontFamily: vars.font.mono,
    fontSize: '0.6rem',
    fontVariantNumeric: 'tabular-nums',
    color: vars.color.mutedForeground,
    width: '1.2rem',
    textAlign: 'right',
    flexShrink: 0,
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
