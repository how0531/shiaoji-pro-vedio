// src/components/plugin-store.css.ts：比照 command-palette.css.ts 的
// overlay＋panel 模式，列表改用逐列 row 而非搜尋結果。

import { style } from '@vanilla-extract/css';
import { vars } from '../theme.css';

export const overlay = style({
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    background: 'rgba(0, 0, 0, 0.45)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '10vh',
});

export const dialog = style({
    width: '30rem',
    maxHeight: '78vh',
    display: 'flex',
    flexDirection: 'column',
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

export const list = style({
    overflowY: 'auto',
    padding: vars.space.sm,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
});

export const offlineHint = style({
    padding: `${vars.space.lg} ${vars.space.md}`,
    fontSize: '0.76rem',
    color: vars.color.mutedForeground,
    textAlign: 'center',
});

export const emptyHint = style({
    padding: `${vars.space.lg} ${vars.space.md}`,
    fontSize: '0.76rem',
    color: vars.color.mutedForeground,
    textAlign: 'center',
});

// 「已安裝但不在商店目錄」清單的分節標籤（side-load／catalog 抓不到時
// 仍能管理的既有外掛）
export const sectionLabel = style({
    fontFamily: vars.font.display,
    fontSize: '0.64rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: vars.color.mutedForeground,
    padding: `${vars.space.sm} ${vars.space.md} 0`,
});

export const row = style({
    display: 'flex',
    alignItems: 'center',
    gap: vars.space.sm,
    padding: `${vars.space.sm} ${vars.space.md}`,
    borderRadius: vars.radius.sm,
    ':hover': { background: vars.color.muted },
});

export const rowMain = style({
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
});

export const rowTitle = style({
    display: 'flex',
    alignItems: 'center',
    gap: vars.space.xs,
    fontFamily: vars.font.body,
    fontSize: '0.78rem',
    fontWeight: 600,
    color: vars.color.foreground,
});

export const rowDesc = style({
    fontSize: '0.68rem',
    color: vars.color.mutedForeground,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
});

export const rowError = style({
    fontSize: '0.68rem',
    color: vars.color.danger,
});

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
