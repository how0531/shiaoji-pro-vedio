// src/lib/agent/runner.ts — the agentic loop: model ↔ tools until the
// model stops calling tools (or the round cap). Provider-agnostic.

import { getAgentConfig } from './config';
import {
    anthropicSession,
    codexSession,
    openaiSession,
    type ProviderSession,
} from './providers';
import { buildSystemPrompt } from './skill';
import { skillCatalogue } from './skills';
import { executeTool, toolsForPolicy } from './tools';
import type { AgentBlock, AgentPolicy, ToolResult } from './types';

const MAX_ROUNDS = 10;

export interface AgentSession {
    send(text: string, onBlocks: (blocks: AgentBlock[]) => void): Promise<void>;
    policy: AgentPolicy;
}

export function createAgentSession(
    overridePolicy?: AgentPolicy,
    history?: { role: 'user' | 'assistant'; text: string }[],
): AgentSession {
    const cfg = getAgentConfig();
    const policy = overridePolicy ?? cfg.policy;
    if (cfg.provider !== 'codex' && !cfg.apiKey) {
        throw new Error(
            cfg.provider === 'anthropic'
                ? '尚未設定 Anthropic API Key'
                : '尚未設定 OpenAI API Key',
        );
    }
    const system = buildSystemPrompt(policy) + skillCatalogue();
    const tools = toolsForPolicy(policy);
    const session: ProviderSession =
        cfg.provider === 'anthropic'
            ? anthropicSession(cfg.apiKey, cfg.model, system, tools)
            : cfg.provider === 'openai'
              ? openaiSession(cfg.apiKey, cfg.model, system, tools)
              : codexSession(cfg.model, system, tools);
    if (history && history.length > 0) session.preload(history);

    return {
        policy,
        async send(text, onBlocks) {
            session.sendUser(text);
            for (let round = 0; round < MAX_ROUNDS; round++) {
                const turn = await session.next();
                // surface reasoning + text right away, then stream each tool
                // call as its own block so the chat stacks them Claude-Code
                // style (one row per call, expandable, in execution order)
                const pre: AgentBlock[] = [
                    ...(turn.thinking ?? [])
                        .filter((t) => t.trim())
                        .map((t) => ({ type: 'thinking' as const, text: t })),
                    ...turn.texts.map((t) => ({
                        type: 'text' as const,
                        text: t,
                    })),
                ];
                if (pre.length) onBlocks(pre);
                if (turn.toolCalls.length === 0) return;

                const results: ToolResult[] = [];
                for (const call of turn.toolCalls) {
                    const args = JSON.stringify(call.input);
                    try {
                        const { result, proposal } = await executeTool(
                            call.name,
                            call.input,
                            policy,
                        );
                        const resultJson = JSON.stringify(result);
                        if (proposal) {
                            onBlocks([
                                { type: 'proposal', proposal, id: call.id },
                            ]);
                        } else if (call.name !== 'use_skill') {
                            onBlocks([
                                {
                                    type: 'tool',
                                    name: call.name,
                                    summary: resultJson.slice(0, 80),
                                    args,
                                    result: resultJson,
                                },
                            ]);
                        }
                        results.push({ id: call.id, content: resultJson });
                    } catch (e) {
                        const msg =
                            e instanceof Error ? e.message : String(e);
                        onBlocks([
                            {
                                type: 'tool',
                                name: call.name,
                                summary: msg.slice(0, 80),
                                args,
                                result: JSON.stringify({ error: msg }),
                                isError: true,
                            },
                        ]);
                        results.push({
                            id: call.id,
                            content: JSON.stringify({ error: msg }),
                            isError: true,
                        });
                    }
                }
                session.pushToolResults(results);
            }
            onBlocks([
                { type: 'text', text: '（已達單次執行的工具回合上限）' },
            ]);
        },
    };
}
