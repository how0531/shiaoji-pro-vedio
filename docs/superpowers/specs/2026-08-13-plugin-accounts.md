# 外掛帳戶選擇（PluginHost accounts）

日期：2026-08-13
狀態：設計定案，待市集升級工作流落地後實作

## 問題

三個帳務外掛（statement、margin-ratio、credit-expiry）呼叫 API 時只送
`{ account_type: 'S' }`，不帶 `broker_id` / `account_id`，由伺服器挑預設帳戶。

單一帳戶時沒事，**多帳戶時會查錯戶**。實測：

| 帳戶 | 持倉 | 8月已實現損益 | 交割金額 |
|---|---|---|---|
| 9A92 / 9805600（伺服器預設，外掛查到的） | 空 | 空 | 0 / 0 / 0 |
| 9A9J / 9802004（使用者實際在用） | 有 | 3441 賺 1,955 | -136,054 / -217,378 / -228,706 |

外掛顯示「本月尚無已實現損益」，但那是另一個帳戶的事實。**顯示錯誤的帳務數字比
顯示錯誤訊息更危險**，因為使用者不會察覺。

根因是設計缺口：`PluginHost` 從來沒有「帳戶」這個概念，外掛無從指定。
Task 8 審查標記過此風險（判定為「單一帳戶可行」），多帳戶下失效。

受影響：statement（3 處呼叫）、margin-ratio（1 處）、credit-expiry（1 處）。
warrant-finder 不碰帳務，不受影響。

## 設計

### PluginHost 新增 accounts 能力

```ts
export interface PluginAccount {
    account_type: 'S' | 'F';
    broker_id: string;
    account_id: string;
    signed: boolean;
}

// PluginHost 內新增
accounts: {
    /** 全部帳戶，供外掛自建選擇器 */
    list(): Promise<PluginAccount[]>;
    /** App 當前選擇的帳戶（跟隨 header 帳戶下拉），無則 null */
    current(type: 'S' | 'F'): Promise<PluginAccount | null>;
    /** 使用者在 App 切換帳戶時觸發，回傳退訂函數 */
    onChange(cb: () => void): () => void;
};
```

### 個資邊界（重要）

`/api/v1/auth/accounts` 回傳含 `person_id`（身分證字號）與 `username`（姓名）。
**`PluginAccount` 刻意不含這兩個欄位**：外掛查帳只需要 broker_id 與 account_id，
給姓名與身分證字號沒有功能上的必要，卻讓每個外掛都變成個資持有者。

但**投影本身不構成邊界**：外掛仍可自己 `api.get('/api/v1/auth/accounts')`
拿到完整回應。要讓它成為真正的邊界，必須同時把該端點加進 `host.ts`
`assertAllowedPath` 的 deny-list，`accounts.list()` 成為唯一合法管道。

決策：**兩者都做**。理由與 v1 下單 deny-list 一致，宣告用來揭露、deny-list
用來強制，能便宜擋掉的就擋。四個外掛目前都沒呼叫該端點，零破壞性。

連帶影響：權限 `account-identity` 的描述要改寫，不能再宣稱「能讀到你的姓名、
身分證字號」，因為擋掉之後外掛拿不到。改為「能看到你有哪些券商帳號」。

### 資料來源

接既有的 `src/lib/account-store.ts`，不另建狀態：

- `list()` → `getAccountState().accounts` 投影
- `current(type)` → `accountFor(type)` 投影（該函數已保證只回 signed 帳戶）
- `onChange(cb)` → 訂閱 account-store 的 listener

`accountFor` 回 `undefined` 代表「讓伺服器挑預設」，投影成 `null`。

### 外掛端

SDK 提供 helper，避免五個呼叫點各自拼 body：

```ts
export function accountBody(
    acc: PluginAccount | null,
    type: 'S' | 'F',
): Record<string, unknown> {
    if (!acc) return { account_type: type };
    return {
        account_type: type,
        broker_id: acc.broker_id,
        account_id: acc.account_id,
    };
}
```

三個帳務外掛：

1. 抓資料前先 `const acc = await host.accounts.current('S')`
2. body 改用 `accountBody(acc, 'S')`
3. 面板標題列顯示當前帳戶（如 `9A9J-9802004`），讓使用者知道看的是哪一戶
4. `host.accounts.onChange` 訂閱，切帳戶時自動重抓
5. 沒有帳戶時（尚未載入或無 signed 帳戶）顯示「尚未選擇帳戶」而非空資料

### 與權限模型的關係

市集升級同時在做權限揭露。`accounts.list()` 能看到使用者有哪些帳戶，
屬於應揭露的能力，權限清單要涵蓋它（可併入「讀取帳務資料」或獨立一條，
由權限模型定案時決定）。

## 測試

- host：`accounts.current` 投影不含 person_id / username（明確斷言這兩個 key 不存在）
- host：`accountFor` 回 undefined 時 `current()` 回 null
- SDK：`accountBody` 三種情境（有帳戶、null、期貨型別）
- 外掛：既有 logic 測試不受影響；面板層的帳戶顯示不強制測試

## 不做（YAGNI）

- 外掛自訂帳戶選擇器：v1 跟隨 App 選擇即可，等有外掛真的需要跨帳戶比較再開
- 每外掛獨立記憶帳戶：會與 App 的選擇不一致，徒增困惑
