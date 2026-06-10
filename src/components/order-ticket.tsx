// src/components/order-ticket.tsx — buy/sell ticket with two-step EXECUTE.
// Stock vs futures aware; price autofills from the live quote.

import { useEffect, useRef, useState } from 'react';
import { useQuote } from '../hooks/use-stream';
import { usePickedPrice } from '../lib/price-sync';
import { placeFuturesOrder, placeStockOrder } from '../lib/shioaji';
import type { ContractInfo } from '../lib/types/contract';
import type {
    Action,
    FuturesOCType,
    OrderType,
    StockOrderLot,
} from '../lib/types/order';
import { fmtPrice } from '../lib/utils/format';
import * as panel from './panel.css';
import * as styles from './order-ticket.css';

export function OrderTicket({
    contract,
    onPlaced,
}: {
    contract: ContractInfo;
    onPlaced: () => void;
}) {
    const isFutures =
        contract.security_type === 'FUT' || contract.security_type === 'OPT';
    const quote = useQuote(contract.code);

    const [action, setAction] = useState<Action>('Buy');
    const [price, setPrice] = useState('');
    const [qty, setQty] = useState(1);
    const [priceType, setPriceType] = useState('LMT');
    const [orderType, setOrderType] = useState<OrderType>('ROD');
    const [orderLot, setOrderLot] = useState<StockOrderLot>('Common');
    const [octype, setOctype] = useState<FuturesOCType>('Auto');
    const [armed, setArmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<{
        kind: 'ok' | 'err';
        text: string;
    } | null>(null);
    const priceTouched = useRef(false);

    // reset on symbol change
    useEffect(() => {
        setPrice('');
        priceTouched.current = false;
        setArmed(false);
        setFeedback(null);
        setPriceType('LMT');
        setOrderType('ROD');
        setOrderLot('Common');
        setOctype('Auto');
    }, [contract.code]);

    // autofill price from live quote until user edits it
    const liveClose = quote?.tick?.close;
    useEffect(() => {
        if (!priceTouched.current && liveClose) {
            setPrice(String(Number(liveClose)));
        }
    }, [liveClose]);

    // price picked from chart hover/click or depth ladder (same symbol only)
    const picked = usePickedPrice(contract.code);
    useEffect(() => {
        if (picked) {
            priceTouched.current = true;
            setPrice(String(picked.price));
            setArmed(false);
        }
    }, [picked]);

    const execute = async () => {
        if (!armed) {
            setArmed(true);
            setFeedback(null);
            return;
        }
        setArmed(false);
        setBusy(true);
        try {
            const p = priceType === 'LMT' ? Number(price) : 0;
            if (priceType === 'LMT' && (!Number.isFinite(p) || p <= 0)) {
                throw new Error('限價單需要有效價格');
            }
            const trade = isFutures
                ? await placeFuturesOrder(contract, {
                      action,
                      price: p,
                      quantity: qty,
                      price_type: priceType as 'LMT' | 'MKT' | 'MKP',
                      order_type: orderType,
                      octype,
                  })
                : await placeStockOrder(contract, {
                      action,
                      price: p,
                      quantity: qty,
                      price_type: priceType as 'LMT' | 'MKT',
                      order_type: orderType,
                      order_lot: orderLot,
                  });
            setFeedback({
                kind: 'ok',
                text: `▸ ${trade.status.status} #${trade.order.seqno || trade.order.id.slice(0, 8)}`,
            });
            onPlaced();
        } catch (e) {
            setFeedback({
                kind: 'err',
                text: `✕ ${e instanceof Error ? e.message : String(e)}`,
            });
        } finally {
            setBusy(false);
        }
    };

    const qtyUnit = isFutures ? '口' : orderLot === 'IntradayOdd' ? '股' : '張';

    return (
        <div className={styles.body}>
                <div className={styles.sideTabs}>
                    <button
                        className={styles.buyTab[action === 'Buy' ? 'on' : 'off']}
                        onClick={() => {
                            setAction('Buy');
                            setArmed(false);
                        }}
                    >
                        買進 Buy
                    </button>
                    <button
                        className={
                            styles.sellTab[action === 'Sell' ? 'on' : 'off']
                        }
                        onClick={() => {
                            setAction('Sell');
                            setArmed(false);
                        }}
                    >
                        賣出 Sell
                    </button>
                </div>

                <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>價格</span>
                    <button
                        className={styles.stepBtn}
                        onClick={() => {
                            priceTouched.current = true;
                            setPrice((p) =>
                                String(
                                    Math.max(0, Number(p || 0) - 1),
                                ),
                            );
                        }}
                    >
                        −
                    </button>
                    <input
                        className={styles.numInput}
                        value={priceType === 'LMT' ? price : 'MKT'}
                        disabled={priceType !== 'LMT'}
                        onChange={(e) => {
                            priceTouched.current = true;
                            setPrice(e.target.value);
                            setArmed(false);
                        }}
                        inputMode='decimal'
                    />
                    <button
                        className={styles.stepBtn}
                        onClick={() => {
                            priceTouched.current = true;
                            setPrice((p) => String(Number(p || 0) + 1));
                        }}
                    >
                        +
                    </button>
                </div>

                <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>數量{qtyUnit}</span>
                    <button
                        className={styles.stepBtn}
                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                    >
                        −
                    </button>
                    <input
                        className={styles.numInput}
                        value={qty}
                        onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isInteger(v) && v >= 0) setQty(v);
                        }}
                        inputMode='numeric'
                    />
                    <button
                        className={styles.stepBtn}
                        onClick={() => setQty((q) => q + 1)}
                    >
                        +
                    </button>
                </div>

                <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>價別</span>
                    <div className={styles.segGroup}>
                        {(isFutures
                            ? ['LMT', 'MKT', 'MKP']
                            : ['LMT', 'MKT']
                        ).map((pt) => (
                            <button
                                key={pt}
                                className={
                                    styles.seg[priceType === pt ? 'on' : 'off']
                                }
                                onClick={() => {
                                    setPriceType(pt);
                                    setArmed(false);
                                    if (pt !== 'LMT') setOrderType('IOC');
                                    else setOrderType('ROD');
                                }}
                            >
                                {pt}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>效期</span>
                    <div className={styles.segGroup}>
                        {(['ROD', 'IOC', 'FOK'] as OrderType[]).map((ot) => (
                            <button
                                key={ot}
                                className={
                                    styles.seg[orderType === ot ? 'on' : 'off']
                                }
                                onClick={() => {
                                    setOrderType(ot);
                                    setArmed(false);
                                }}
                            >
                                {ot}
                            </button>
                        ))}
                    </div>
                </div>

                {isFutures ? (
                    <div className={styles.fieldRow}>
                        <span className={styles.fieldLabel}>倉別</span>
                        <div className={styles.segGroup}>
                            {(
                                [
                                    ['Auto', '自動'],
                                    ['New', '新倉'],
                                    ['Cover', '平倉'],
                                    ['DayTrade', '當沖'],
                                ] as [FuturesOCType, string][]
                            ).map(([oc, label]) => (
                                <button
                                    key={oc}
                                    className={
                                        styles.seg[octype === oc ? 'on' : 'off']
                                    }
                                    onClick={() => {
                                        setOctype(oc);
                                        setArmed(false);
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className={styles.fieldRow}>
                        <span className={styles.fieldLabel}>單位</span>
                        <div className={styles.segGroup}>
                            {(
                                [
                                    ['Common', '整股'],
                                    ['IntradayOdd', '零股'],
                                ] as [StockOrderLot, string][]
                            ).map(([lot, label]) => (
                                <button
                                    key={lot}
                                    className={
                                        styles.seg[
                                            orderLot === lot ? 'on' : 'off'
                                        ]
                                    }
                                    onClick={() => {
                                        setOrderLot(lot);
                                        setArmed(false);
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <button
                    className={
                        styles.execBtn[
                            armed ? 'armed' : action === 'Buy' ? 'buy' : 'sell'
                        ]
                    }
                    onClick={execute}
                    disabled={busy || qty < 1}
                >
                    {busy
                        ? '傳送中…'
                        : armed
                          ? `確認${action === 'Buy' ? '買進' : '賣出'} ${qty}${qtyUnit} @ ${priceType === 'LMT' ? fmtPrice(Number(price)) : priceType}`
                          : action === 'Buy'
                            ? '買進下單'
                            : '賣出下單'}
                </button>

            {feedback && (
                <span
                    className={`${styles.feedback} ${
                        panel.dirText[feedback.kind === 'ok' ? 'down' : 'up']
                    }`}
                >
                    {feedback.text}
                </span>
            )}
        </div>
    );
}
