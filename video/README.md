# video — Shioaji Pro 教學影片專案

本目錄＝影片專案的全部內容（成片、企劃、製作管線、文件）。
上層是 app 本身的原始碼，兩者互不混雜。

| 資料夾 | 內容 |
|---|---|
| [`成品/教學七集/`](成品/教學七集/) | 入門系列 T1–T7 成片（2K・實錄・獨立檢核通過） |
| [`成品/進階系列/`](成品/進階系列/) | 進階系列成片：A5 效率工具、AI-Agent、進6–進12（2K） |
| [`企劃/`](企劃/) | 全部企劃文件：總規劃、分鏡腳本、風格指南、完成追蹤、分眾觀看路線圖… |
| [`pipeline/`](pipeline/) | 自動化製作管線（Playwright 實錄 → TTS 對時 → 組裝 → 檢核） |
| [`agent-demos/`](agent-demos/) | AI 交易代理實作（Shioaji SDK，模擬環境，含實跑紀錄） |
| [`素材/sinopac-shots/`](素材/sinopac-shots/) | 永豐官網申請金鑰實錄（PII 已遮罩） |
| [`素材/seedance-branding/`](素材/seedance-branding/) | 品牌片頭/轉場的 Seedance 生成提示詞 |
| [`文件/`](文件/) | 介紹文、功能操作手冊、開發日誌、Shioaji 生態系整理清單 |

## 製作管線

```text
企劃/影片腳本與分鏡.md
  └→ pipeline/topics_spec.py     旁白↔動作契約（單一事實來源）
      └→ pipeline/record-topics.py   Playwright 實錄 2560×1440
          └→ pipeline/assemble3.py   逐句 TTS、逐段對時、字幕、BGM
              └→ pipeline/qc-tools.py    Whisper 轉寫比對＋逐格抖動檢核
```

`pipeline/generate-cards.py` 產生字卡、`pipeline/qc-precompute.py` 產出全系列檢核證據。

> 舊版產出（第一代 EP1–5、未遮罩原始素材）在本機 `_archive/`，不入版控。
> BGM 音檔授權免署名可商用但不得散布，故不入 repo。
