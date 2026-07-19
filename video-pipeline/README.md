# 影片製作管線（video pipeline）

本系列教學影片的自動化製作腳本——Playwright 實錄 → 逐段對齊組裝 → 2K 成片。

| 檔案 | 作用 |
|---|---|
| `topics_spec.py` | 每一集的分鏡腳本：段落 id、動作、旁白（旁白↔畫面的對齊契約） |
| `record-topics.py` | Playwright 錄影器：驅動 live app（模擬環境）逐段實錄，2560×1440、虛擬游標、金框標註 |
| `generate-cards.py` | 章節卡/大綱卡/觀念卡產生器（永豐配色、雅黑粗標/正黑內文/Barlow 數字） |
| `assemble3.py` | 組裝器：每段旁白 edge-tts 配音、逐段對時、卡片動態、字幕燒錄、片頭片尾淡入淡出 |

用法（需先起 shioaji 模擬 server 與 app dev server）：

```sh
python record-topics.py t1-login     # 錄一集
python assemble3.py t1-login        # 組裝該集 → final3/T1-login.mp4
python generate-cards.py            # 重產所有字卡
```

安全原則：全程模擬環境；非交易日不實際送單（避免錯誤畫面）；帳號遮蔽、無金鑰入鏡。
