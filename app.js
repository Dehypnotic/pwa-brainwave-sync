// Brainwave Sync (Isochronic pulses) + Schedule canvas
class BrainwaveIso {
  constructor({carrierHz=400, startBeatHz=7, endBeatHz=4, rampSeconds=1800, holdSeconds=1800, muted=false}) {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.opts = {carrierHz, startBeatHz, endBeatHz, rampSeconds, holdSeconds, muted};
    this.started = false;
    this.nodes = {};
    this.pulseTimer = null;
  }

  _build() {
    const ctx = this.ctx;
    const o = this.opts;

    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = o.carrierHz;

    const outGain = ctx.createGain();
    outGain.gain.value = 0; // Start at 0 for fade-in

    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0; // This will be controlled by the scheduler

    carrier.connect(pulseGain).connect(outGain).connect(ctx.destination);

    carrier.start();

    this.nodes = {carrier, outGain, pulseGain};
    this.t0 = ctx.currentTime;
  }

  start() {
    if (this.started) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this._build();
    const t = this.ctx.currentTime;
    try {
      if (!this.opts.muted) {
        this.nodes.outGain.gain.setTargetAtTime(1.0, t, 0.05);
      }
    } catch {}
    this.started = true;
    this.schedulePulses(this.ctx.currentTime);
  }

  stop() {
    if (!this.started) return;
    this.started = false; // Stop the scheduler loop
    if (this.pulseTimer) {
      clearTimeout(this.pulseTimer);
      this.pulseTimer = null;
    }
    const t = this.ctx.currentTime;
    try {
      this.nodes.pulseGain.gain.cancelScheduledValues(t); // Clear any future pulses
      this.nodes.outGain.gain.setTargetAtTime(0.0001, t, 0.05);
    } catch {}
    setTimeout(() => {
      Object.values(this.nodes).forEach(n => { try { n.stop?.(); n.disconnect?.(); } catch{} });
      this.nodes = {};
    }, 200);
  }

  schedulePulses(startTime) {
    if (!this.started) return;

    const now = this.ctx.currentTime;
    const scheduleAheadTime = 0.2; // How far ahead to schedule
    let nextPulseTime = startTime;

    while (nextPulseTime < now + scheduleAheadTime) {
      const elapsed = nextPulseTime - this.t0;
      const beatHz = this.beatAt(elapsed);
      if (beatHz <= 0) { // Avoid division by zero
          nextPulseTime += 0.5; // If beat is 0, wait a bit and check again
          continue;
      }
      const period = 1 / beatHz;
      const pulseDuration = period / 2;
      
      // Make the ramp time a small fraction of the pulse, e.g., 5%, but not too long
      const rampTime = Math.min(pulseDuration * 0.05, 0.01);

      const gain = this.nodes.pulseGain.gain;
      
      // Schedule one pulse (a trapezoid shape)
      gain.setValueAtTime(0, nextPulseTime);
      gain.linearRampToValueAtTime(1, nextPulseTime + rampTime);
      gain.setValueAtTime(1, nextPulseTime + pulseDuration - rampTime);
      gain.linearRampToValueAtTime(0, nextPulseTime + pulseDuration);

      nextPulseTime += period;
    }

    this.pulseTimer = setTimeout(() => this.schedulePulses(nextPulseTime), 100); // Check again in 100ms
  }

  setMute(m) {
    this.opts.muted = m;
    if (this.nodes.outGain) {
      const targetGain = m ? 0 : 1;
      try { this.nodes.outGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05); } catch {}
    }
  }

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
  muted: q('mute').checked,
});

q('mute').addEventListener('change', e => { if (engine) engine.setMute(e.target.checked); });

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
