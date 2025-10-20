# ASR Frontend (WebSocket + WebAudio)

该项目为实时流式语音识别的前端示例，使用 WebAudio 采集麦克风音频并通过 WebSocket 将 PCM16/16kHz/mono 原始数据发送到后端 `sauc_asr_server.py`，后端桥接至火山引擎 SAUC v3（bigmodel_async）。

## 使用步骤

1) 启动后端服务（PowerShell）：

```powershell
python f:\work\singa\spark_asr\sauc_asr_server.py --host 0.0.0.0 --port 8080
```

2) 启动一个本地静态服务器以支持 getUserMedia（浏览器要求在安全上下文或 localhost）：

```powershell
python -m http.server 5500 -d f:\work\singa\asr-frontend
```

3) 打开浏览器访问 `http://localhost:5500`，确认 WebSocket 地址为 `ws://localhost:8080/ws-asr`，点击连接，随后开始采集。

4) 说话，观测增量结果和最终结果。结束时点击结束会话。

## 说明

- 每次连接后端都会生成唯一 session_id，并在 `f:\work\singa\spark_asr\sessions/<YYYYMMDD>/<session_id>/` 下保存会话日志。
- 前端每 200ms 打包一次音频为 PCM16/16kHz/mono 原始字节并发送给后端；后端将按到达顺序转发至 SAUC v3。
- 收到最终结果（final=true）表示一次会话的最终识别文本。可再次使用开始采集继续发送新的音频片段。
- 如果你的设备采样率不是 16kHz，前端会在浏览器中做简单的线性插值重采样到 16kHz。

## 常见问题

- 打不开麦克风：请确保通过 `http://localhost` 访问页面，或使用 HTTPS。file:// 页面通常无法调用 getUserMedia。
- 无结果或错误：检查后端服务是否已启动；查看后端生成的 `session.log` 和 `responses.jsonl`（其中包含 X-Tt-Logid）。
- 音频断续：请保持网络稳定，建议每包约 200ms；过小的分包会带来更高的开销和抖动。

## 安全

- 前端不包含任何密钥，后端凭据请不要硬编码在生产环境。建议通过环境变量或安全配置中心注入。
