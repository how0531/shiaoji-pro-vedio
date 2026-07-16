// src/components/command-palette.tsx — Cmd+K symbol jump

import { useEffect, useRef, useState } from 'react';
import { primeContract } from '../lib/contracts-cache';
import {
    searchProducts,
    type ProductSuggestion,
} from '../lib/product-search';
import * as styles from './command-palette.css';

export function CommandPalette({
    open,
    onClose,
    onJump,
}: {
    open: boolean;
    onClose: () => void;
    onJump: (code: string) => Promise<unknown>;
}) {
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setValue('');
            setError(false);
            setSuggestions([]);
            setActiveIndex(0);
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [open]);

    useEffect(() => {
        if (!open || !value.trim()) {
            setSuggestions([]);
            return;
        }
        let active = true;
        const timer = setTimeout(() => {
            void searchProducts(value, 8)
                .then((items) => {
                    if (active) {
                        setSuggestions(items);
                        setActiveIndex(0);
                    }
                })
                .catch(() => {
                    if (active) setSuggestions([]);
                });
        }, 120);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [open, value]);

    if (!open) return null;

    const submit = async (picked?: ProductSuggestion) => {
        const item = picked ?? suggestions[activeIndex];
        const code = item?.code ?? value.trim().toUpperCase();
        if (!code || busy) return;
        setBusy(true);
        setError(false);
        try {
            if (item?.contract) primeContract(item.contract);
            await onJump(code);
            onClose();
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.box} onClick={(e) => e.stopPropagation()}>
                <input
                    ref={inputRef}
                    className={styles.input}
                    placeholder='輸入代碼跳轉商品（2330、TXFR1…）'
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        setError(false);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowDown' && suggestions.length > 0) {
                            e.preventDefault();
                            setActiveIndex(
                                (index) => (index + 1) % suggestions.length,
                            );
                        }
                        if (e.key === 'ArrowUp' && suggestions.length > 0) {
                            e.preventDefault();
                            setActiveIndex(
                                (index) =>
                                    (index - 1 + suggestions.length) %
                                    suggestions.length,
                            );
                        }
                        if (e.key === 'Enter') void submit();
                        if (e.key === 'Escape') onClose();
                    }}
                />
                {suggestions.length > 0 && (
                    <div className={styles.results}>
                        {suggestions.map((item, index) => (
                            <button
                                key={`${item.security_type}:${item.code}`}
                                className={
                                    index === activeIndex
                                        ? styles.resultActive
                                        : styles.result
                                }
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => void submit(item)}
                            >
                                <span className={styles.resultCode}>
                                    {item.code}
                                </span>
                                <span className={styles.resultName}>
                                    {item.name}
                                </span>
                                <span className={styles.resultType}>
                                    {item.detail}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
                <div className={styles.hint}>
                    <span className={error ? styles.err : ''}>
                        {busy
                            ? '查詢中…'
                            : error
                              ? '找不到此商品代碼'
                              : 'Enter 跳轉 · Esc 關閉'}
                    </span>
                    <span>⌘K</span>
                </div>
            </div>
        </div>
    );
}
