// src/components/plugin-block.tsx — 版面上的外掛面板容器。
// 外掛崩潰只毀這一格：class ErrorBoundary 包住外掛元件。

import React from 'react';
import type { Block } from '../lib/workspace';
import { getPanelDef, usePluginsState } from '../lib/plugins/store';

class PanelBoundary extends React.Component<
    { children: React.ReactNode; onRetry: () => void },
    { error: string | null }
> {
    state = { error: null as string | null };
    static getDerivedStateFromError(e: unknown) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
    render() {
        if (this.state.error !== null) {
            return (
                <div style={{ padding: 12 }}>
                    <p>外掛面板發生錯誤：{this.state.error}</p>
                    <button
                        onClick={() => {
                            this.setState({ error: null });
                            this.props.onRetry();
                        }}
                    >
                        重新載入
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export function PluginBlock({
    block,
    code,
}: {
    block: Block;
    code: string | null;
}) {
    const { loaded } = usePluginsState();
    const [retry, setRetry] = React.useState(0);
    const def =
        block.pluginId && block.panelKey
            ? getPanelDef(block.pluginId, block.panelKey)
            : null;
    if (!def) {
        const reason =
            (block.pluginId && loaded[block.pluginId]) || '外掛已停用或未安裝';
        return (
            <div style={{ padding: 12, opacity: 0.7 }}>
                外掛面板不可用：{reason === 'ok' ? '面板不存在' : reason}
            </div>
        );
    }
    const Comp = def.Component;
    return (
        <PanelBoundary key={retry} onRetry={() => setRetry((n) => n + 1)}>
            <Comp code={code} />
        </PanelBoundary>
    );
}
