(function(){
  const wsUrlInput = document.getElementById('wsUrl');
  const btnConnect = document.getElementById('btnConnect');
  const btnDisconnect = document.getElementById('btnDisconnect');
  const btnStartMic = document.getElementById('btnStartMic');
  const btnStopMic = document.getElementById('btnStopMic');
  const btnEndSession = document.getElementById('btnEndSession');
  const logBox = document.getElementById('logBox');
  const partialBox = document.getElementById('partialBox');
  const finalBox = document.getElementById('finalBox');

  let ws = null;
  let audioCtx = null;
  let source = null;
  let processor = null;
  let micStream = null;
  let srcRate = 44100; // will be replaced by actual
  const TARGET_RATE = 16000;
  const PACKET_SAMPLES = 3200; // 200ms at 16k
  let resampledQueue = [];

  function log(msg){
    const ts = new Date().toLocaleTimeString();
    logBox.textContent += `[${ts}] ${msg}\n`;
    logBox.scrollTop = logBox.scrollHeight;
  }

  function enableControls(state){
    // state: 'disconnected' | 'connected' | 'capturing'
    if (state === 'disconnected'){
      btnConnect.disabled = false;
      btnDisconnect.disabled = true;
      btnStartMic.disabled = true;
      btnStopMic.disabled = true;
      btnEndSession.disabled = true;
    } else if (state === 'connected'){
      btnConnect.disabled = true;
      btnDisconnect.disabled = false;
      btnStartMic.disabled = false;
      btnStopMic.disabled = true;
      btnEndSession.disabled = false;
    } else if (state === 'capturing'){
      btnConnect.disabled = true;
      btnDisconnect.disabled = false;
      btnStartMic.disabled = true;
      btnStopMic.disabled = false;
      btnEndSession.disabled = false;
    }
  }

  function connectWS(){
    const url = wsUrlInput.value.trim();
    if (!url){ log('请填写 WebSocket 服务地址'); return; }
    ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { log('WebSocket 已连接'); enableControls('connected'); };
    ws.onclose = () => { log('WebSocket 已断开'); enableControls('disconnected'); };
    ws.onerror = (e) => { log('WebSocket 错误: ' + e); };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'result'){
          if (msg.final){
            finalBox.textContent = msg.text || '';
          } else {
            partialBox.textContent = msg.text || '';
          }
        } else if (msg.type === 'error'){
          log('后端错误: ' + (msg.message || 'unknown'));
        } else if (msg.type === 'pong'){
          // ignore
        }
      } catch(err){
        log('消息解析错误');
      }
    };
  }

  function disconnectWS(){
    try { if (ws && ws.readyState === WebSocket.OPEN){ ws.close(); } } catch(e){}
    ws = null;
    enableControls('disconnected');
  }

  function startMic(){
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      micStream = stream;
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: TARGET_RATE });
      srcRate = audioCtx.sampleRate; // actual sampleRate may differ
      source = audioCtx.createMediaStreamSource(stream);
      processor = audioCtx.createScriptProcessor(4096, 1, 1);
      source.connect(processor);
      processor.connect(audioCtx.destination);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0); // Float32Array
        const resampled = resampleTo16k(input, srcRate);
        appendResampled(resampled);
        flushSegments();
      };
      enableControls('capturing');
      log('开始采集麦克风，源采样率=' + srcRate + '，目标采样率=16000');
    }).catch(err => {
      log('麦克风采集失败: ' + err.message);
    });
  }

  function stopMic(){
    try {
      if (processor){ processor.disconnect(); processor.onaudioprocess = null; }
      if (source){ source.disconnect(); }
      if (audioCtx){ audioCtx.close(); }
    } catch(e){}
    try { if (micStream){ micStream.getTracks().forEach(t => t.stop()); } } catch(e){}
    processor = null; source = null; audioCtx = null; micStream = null;
    resampledQueue = [];
    enableControls('connected');
    log('已停止采集');
  }

  function endSession(){
    if (ws && ws.readyState === WebSocket.OPEN){
      ws.send(JSON.stringify({ event: 'end' }));
      log('已发送结束事件');
    }
  }

  function appendResampled(arr){
    for (let i=0;i<arr.length;i++){ resampledQueue.push(arr[i]); }
  }

  function flushSegments(){
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    while (resampledQueue.length >= PACKET_SAMPLES){
      const segment = resampledQueue.splice(0, PACKET_SAMPLES);
      const pcm16 = new Int16Array(PACKET_SAMPLES);
      for (let i=0;i<PACKET_SAMPLES;i++){
        let s = Math.max(-1, Math.min(1, segment[i] || 0));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      try { ws.send(pcm16.buffer); } catch(e){ log('发送失败: ' + e.message); break; }
    }
  }

  function resampleTo16k(src, srcRate){
    if (srcRate === TARGET_RATE){ return src; }
    const factor = TARGET_RATE / srcRate;
    const destLen = Math.round(src.length * factor);
    const dest = new Float32Array(destLen);
    for (let i=0;i<destLen;i++){
      const t = i / factor;
      const j = Math.floor(t);
      const k = Math.min(j+1, src.length-1);
      const frac = t - j;
      dest[i] = src[j] + (src[k] - src[j]) * frac;
    }
    return dest;
  }

  btnConnect.addEventListener('click', connectWS);
  btnDisconnect.addEventListener('click', disconnectWS);
  btnStartMic.addEventListener('click', startMic);
  btnStopMic.addEventListener('click', stopMic);
  btnEndSession.addEventListener('click', endSession);

  enableControls('disconnected');
  log('请先启动后端：python f:\\work\\singa\\spark_asr\\sauc_asr_server.py');
  log('前端推荐通过本地静态服务器打开以支持麦克风：例如 PowerShell 运行 "python -m http.server 5500 -d F:\\work\\singa\\asr-frontend" 并访问 http://localhost:5500');
})();
