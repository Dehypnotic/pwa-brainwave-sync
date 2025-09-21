// Brainwave Sync (Isochronic pulses) + Schedule canvas
class BrainwaveIso {
  constructor({carrierHz=400, startBeatHz=7, endBeatHz=4, rampSeconds=1800, holdSeconds=1800, depth=1.0, smooth=true, muted=false}) {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.opts = {carrierHz, startBeatHz, endBeatHz, rampSeconds, holdSeconds, depth, smooth, muted};
    this.started = false;
    this.nodes = {};
  }

  _build() {
    const ctx = this.ctx;
    const o = this.opts;

    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = o.carrierHz;

    const outGain = ctx.createGain();
    outGain.gain.value = o.muted ? 0 : 1;

    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0;

    const depthGain = ctx.createGain();
    depthGain.gain.value = o.depth;

    const lfo = ctx.createOscillator();
    lfo.type = o.smooth ? 'sine' : 'square';
    lfo.frequency.setValueAtTime(o.startBeatHz, ctx.currentTime);
    lfo.frequency.linearRampToValueAtTime(o.endBeatHz, ctx.currentTime + o.rampSeconds);

    const lfoScale = ctx.createGain(); lfoScale.gain.value = 0.5;
    const lfoBias  = ctx.createConstantSource(); lfoBias.offset.value = 0.5;

    const lfoLP = ctx.createBiquadFilter();
    lfoLP.type = 'lowpass';
    lfoLP.frequency.value = o.smooth ? 20 : 20000;

    lfo.connect(lfoLP).connect(lfoScale).connect(depthGain).connect(pulseGain.gain);
    lfoBias.connect(pulseGain.gain);

    carrier.connect(pulseGain).connect(outGain).connect(ctx.destination);

    lfoBias.start();
    lfo.start();
    carrier.start();

    this.nodes = {carrier, outGain, pulseGain, depthGain, lfo, lfoBias, lfoLP};
    this.t0 = ctx.currentTime;
  }

  start() {
    if (this.started) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this._build();
    const t = this.ctx.currentTime;
    try { this.nodes.pulseGain.gain.setTargetAtTime(this.opts.depth, t, 0.05); } catch {}
    this.started = true;
  }

  stop() {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    try { this.nodes.outGain.gain.setTargetAtTime(0.0001, t, 0.05); } catch {}
    setTimeout(() => {
      Object.values(this.nodes).forEach(n => { try { n.stop?.(); n.disconnect?.(); } catch{} });
      this.nodes = {}; this.started = false;
    }, 200);
  }

  setDepth(val) { if (this.nodes.depthGain) this.nodes.depthGain.gain.value = val; this.opts.depth = val; }
  setMute(m)    { if (this.nodes.outGain) this.nodes.outGain.gain.value = m ? 0 : 1; this.opts.muted = m; }
  setSmooth(s)  { this.opts.smooth = s; if (this.nodes.lfoLP) this.nodes.lfoLP.frequency.value = s ? 20 : 20000; if (this.nodes.lfo) this.nodes.lfo.type = s ? 'sine' : 'square'; }

  beatAt(sec) {
    const {startBeatHz, endBeatHz, rampSeconds} = this.opts;
    if (sec <= 0) return startBeatHz;
    if (sec >= rampSeconds) return endBeatHz;
    const k = sec / rampSeconds;
    return startBeatHz + (endBeatHz - startBeatHz) * k;
  }
  elapsed() { return this.started ? (this.ctx.currentTime - this.t0) : 0; }
}

function drawSchedule(canvas, engine) {
  const ctx = canvas.getContext('2d');
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(W * dpr));
  canvas.height = Math.max(1, Math.floor(H * dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);

  const {startBeatHz, endBeatHz, rampSeconds, holdSeconds} = engine.opts;
  const total = rampSeconds + holdSeconds;
  const margin = 28;
  const xMap = s => margin + (s/total)*(W - 2*margin);
  const yMin = Math.min(startBeatHz, endBeatHz) - 1;
  const yMax = Math.max(startBeatHz, endBeatHz) + 1;
  const yMap = hz => H - margin - ((hz - yMin)/(yMax - yMin)) * (H - 2*margin);

  ctx.globalAlpha = .2; ctx.strokeStyle = '#94a3b8'; ctx.beginPath();
  for (let i=0;i<=10;i++){ const x = margin + (i/10)*(W-2*margin); ctx.moveTo(x,margin); ctx.lineTo(x,H-margin); }
  for (let i=0;i<=6;i++){ const y = margin + (i/6)*(H-2*margin); ctx.moveTo(margin,y); ctx.lineTo(W-margin,y); }
  ctx.stroke(); ctx.globalAlpha = 1;

  ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xMap(0), yMap(startBeatHz));
  ctx.lineTo(xMap(rampSeconds), yMap(endBeatHz));
  ctx.lineTo(xMap(total), yMap(endBeatHz));
  ctx.stroke();

  const t = Math.min(engine.elapsed(), total);
  const x = xMap(t);
  const y = yMap(engine.beatAt(t));
  ctx.setLineDash([6,4]); ctx.strokeStyle = '#e5e7eb';
  ctx.beginPath(); ctx.moveTo(x, margin); ctx.lineTo(x, H-margin); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#e5e7eb'; ctx.font = '12px system-ui';
  ctx.fillText(`beat≈${engine.beatAt(t).toFixed(2)} Hz`, x+8, y-8);
}

const sched = document.getElementById('sched');
const readout = document.getElementById('readout');
const statusEl = document.getElementById('status');
let engine = null;

function loop() {
  if (engine) {
    drawSchedule(sched, engine);
    readout.textContent = `Kjører: ${engine.started ? 'ja' : 'nei'}\\nForløpt: ${(engine.elapsed()/60).toFixed(1)} min\\nBeat nå: ${engine.beatAt(engine.elapsed()).toFixed(2)} Hz`;
  } else {
    const ctx = sched.getContext('2d'); ctx.clearRect(0,0,sched.width,sched.height);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

const q = id => document.getElementById(id);
const getOpts = () => ({
  carrierHz: +q('carrier').value || 400,
  startBeatHz: +q('startBeat').value || 7,
  endBeatHz: +q('endBeat').value || 4,
  rampSeconds: (+q('rampMin').value || 30) * 60,
  holdSeconds: (+q('holdMin').value || 30) * 60,
  depth: +q('depth').value,
  smooth: q('smooth').checked,
  muted: q('mute').checked,
});

q('depth').addEventListener('input', e => { if (engine) engine.setDepth(+e.target.value); });
q('mute').addEventListener('change', e => { if (engine) engine.setMute(e.target.checked); });
q('smooth').addEventListener('change', e => { if (engine) engine.setSmooth(e.target.checked); });

q('startBtn').onclick = async () => {
  try {
    if (engine) engine.stop();
    engine = new BrainwaveIso(getOpts());
    await engine.ctx.resume();
    engine.start();
    statusEl.textContent = 'Spiller';
  } catch (e) { statusEl.textContent = 'Kunne ikke starte: ' + e; }
};
q('stopBtn').onclick = () => { if (engine) engine.stop(); statusEl.textContent = 'Stoppet'; };
