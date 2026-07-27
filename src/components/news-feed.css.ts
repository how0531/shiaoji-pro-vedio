// src/components/news-feed.css.ts

import { style, styleVariants } from '@vanilla-extract/css';
import { vars } from '../theme.css';

export const wrap = style({
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
});

export const toolbar = style({
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: `4px ${vars.space.sm}`,
    borderBottom: `1px solid ${vars.color.border}`,
    flexShrink: 0,
});

const tabBase = style({
    flex: 1,
    fontFamily: vars.font.body,
    fontSize: '0.66rem',
    fontWeight: 500,
    padding: '3px 0',
    cursor: 'pointer',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: vars.radius.sm,
    color: vars.color.mutedForeground,
    ':disabled': { opacity: 0.35, cursor: 'not-allowed' },
});

export const tab = styleVariants({
    off: [tabBase, { ':hover': { color: vars.color.foreground } }],
    on: [
        tabBase,
        {
            color: vars.color.foreground,
            background: vars.color.muted,
            fontWeight: 600,
        },
    ],
});

export const list = style({
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
});

export const row = style({
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: `5px ${vars.space.sm}`,
    borderBottom: `1px solid ${vars.color.border}`,
    ':hover': { background: vars.color.muted },
});

export const rowHead = style({
    display: 'flex',
    alignItems: 'baseline',
    gap: vars.space.xs,
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
    fontSize: '0.72rem',
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

export const summary = style({
    fontFamily: vars.font.body,
    fontSize: '0.62rem',
    lineHeight: 1.4,
    color: vars.color.mutedForeground,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
});

export const chipRow = style({
    display: 'flex',
    flexWrap: 'wrap',
    gap: '3px',
    marginTop: '1px',
});

// 點個股 chip → 全終端連動該商品（同排行榜/熱力圖的行為）
export const stockChip = style({
    fontFamily: vars.font.mono,
    fontSize: '0.6rem',
    fontWeight: 600,
    color: vars.color.accent,
    background: vars.color.accentDim,
    border: `1px solid transparent`,
    borderRadius: vars.radius.sm,
    padding: '0 5px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ':hover': { borderColor: vars.color.accent },
});

export const stockChipName = style({
    fontFamily: vars.font.body,
    fontWeight: 400,
    marginLeft: '3px',
    opacity: 0.8,
});

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
