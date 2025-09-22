// Brainwave Sync (Isochronic pulses) + Schedule canvas

// ====================================================================
// Standalone utility functions for calculation and rendering
// ====================================================================

function getTotalDuration(opts) {
  return opts.stages.reduce((sum, s) => sum + s.duration, 0);
}

function getBeatAt(sec, opts) {
  const { startBeatHz, stages } = opts;
  if (sec <= 0) return startBeatHz;

  let cumulativeTime = 0;
  let previousBeat = startBeatHz;

  for (const stage of stages) {
    const stageStartTime = cumulativeTime;
    const stageEndTime = cumulativeTime + stage.duration;

    if (sec < stageEndTime) {
      const timeIntoStage = sec - stageStartTime;
      if (stage.duration === 0) return previousBeat; // Avoid division by zero
      const k = timeIntoStage / stage.duration;
      return previousBeat + (stage.beat - previousBeat) * k;
    }

    cumulativeTime = stageEndTime;
    previousBeat = stage.beat;
  }

  return previousBeat;
}

function drawSchedule(canvas, opts, elapsed = 0) {
  const ctx = canvas.getContext('2d');
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(W * dpr));
  canvas.height = Math.max(1, Math.floor(H * dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);

  const { startBeatHz, stages } = opts;
  const totalDuration = Math.max(1, getTotalDuration(opts));
  const allBeats = [startBeatHz, ...stages.map(s => s.beat)];

  const margin = {top: 20, right: 20, bottom: 30, left: 35};
  
  const yMin = Math.min(...allBeats) - 1;
  const yMax = Math.max(...allBeats) + 1;

  const xMap = s => margin.left + (s/totalDuration)*(W - margin.left - margin.right);
  const yMap = hz => H - margin.bottom - ((hz - yMin)/(yMax - yMin)) * (H - margin.top - margin.bottom);

  // Draw Grid
  ctx.globalAlpha = .2; ctx.strokeStyle = '#94a3b8'; ctx.beginPath();
  const numGridX = 10, numGridY = 6;
  for (let i=0;i<=numGridX;i++){ const x = margin.left + (i/numGridX)*(W - margin.left - margin.right); ctx.moveTo(x,margin.top); ctx.lineTo(x,H-margin.bottom); }
  for (let i=0;i<=numGridY;i++){ const y = margin.top + (i/numGridY)*(H - margin.top - margin.bottom); ctx.moveTo(margin.left,y); ctx.lineTo(W-margin.right,y); }
  ctx.stroke(); ctx.globalAlpha = 1;

  // Draw Axis Labels
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px system-ui';
  
  // Y-Axis (Hz)
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const numYLabels = numGridY;
  for (let i = 0; i <= numYLabels; i++) {
    const hz = yMin + (i / numYLabels) * (yMax - yMin);
    const y = yMap(hz);
    if (y < margin.top || y > H - margin.bottom + 5) continue;
    ctx.fillText(hz.toFixed(1), margin.left - 8, y);
  }

  // X-Axis (Time)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const numXLabels = numGridX / 2;
  for (let i = 0; i <= numXLabels; i++) {
    const seconds = (i / numXLabels) * totalDuration;
    const x = xMap(seconds);
    if (x < margin.left - 10 || x > W - margin.right + 10) continue;
    
    let timeString;
    if (totalDuration < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      timeString = `${String(mins).padStart(2, '0')}'${String(secs).padStart(2, '0')}"`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      timeString = `${String(hours).padStart(2, '0')}h${String(mins).padStart(2, '0')}'`;
    }
    ctx.fillText(timeString, x, H - margin.bottom + 8);
  }

  // Draw Program Line
  ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xMap(0), yMap(startBeatHz));
  let cumulativeTime = 0;
  for (const stage of stages) {
    cumulativeTime += stage.duration;
    ctx.lineTo(xMap(cumulativeTime), yMap(getBeatAt(cumulativeTime, opts)));
  }
  ctx.stroke();

  // Draw Progress Indicator
  const t = Math.min(elapsed, totalDuration);
  const x = xMap(t);
  const y = yMap(getBeatAt(t, opts));
  ctx.setLineDash([6,4]); ctx.strokeStyle = '#e5e7eb';
  ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, H-margin.bottom); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#e5e7eb'; ctx.font = '12px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(`beat≈${getBeatAt(t, opts).toFixed(2)} Hz`, x+8, y-8);
}

// ====================================================================
// Audio Engine Class
// ====================================================================

class BrainwaveIso {
  constructor(opts) {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.opts = opts;
    this.totalDuration = getTotalDuration(opts);
    this.started = false;
    this.nodes = {};
    this.pulseTimer = null;
  }

  _build() {
    const o = this.opts;
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = o.carrierHz;

    const outGain = this.ctx.createGain();
    outGain.gain.value = 0; // Start at 0 for fade-in

    const pulseGain = this.ctx.createGain();
    pulseGain.gain.value = 0; // This will be controlled by the scheduler

    carrier.connect(pulseGain).connect(outGain).connect(this.ctx.destination);

    carrier.start();

    this.nodes = {carrier, outGain, pulseGain};
    this.t0 = this.ctx.currentTime;
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
    } catch {} // Ignore errors
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
      this.nodes.pulseGain.gain.cancelScheduledValues(t);
      this.nodes.outGain.gain.setTargetAtTime(0.0001, t, 0.05);
    } catch {} // Ignore errors
    setTimeout(() => {
      Object.values(this.nodes).forEach(n => { try { n.stop?.(); n.disconnect?.(); } catch{} });
      this.nodes = {};
    }, 200);
  }

  schedulePulses(startTime) {
    if (!this.started) return;

    const now = this.ctx.currentTime;
    const elapsed = now - this.t0;

    if (this.opts.endAction !== 'hold' && elapsed > this.totalDuration) {
        this.stop();
        requestAnimationFrame(() => { statusEl.textContent = 'Ferdig'; });
        return;
    }

    const scheduleAheadTime = 0.2;
    let nextPulseTime = startTime;

    while (nextPulseTime < now + scheduleAheadTime) {
      const currentElapsed = nextPulseTime - this.t0;
      const beatHz = getBeatAt(currentElapsed, this.opts);
      if (beatHz <= 0) {
          if (this.opts.endAction !== 'hold' && currentElapsed > this.totalDuration) {
              this.stop();
              requestAnimationFrame(() => { statusEl.textContent = 'Ferdig'; });
              return;
          }
          nextPulseTime += 0.5;
          continue;
      }
      const period = 1 / beatHz;
      const pulseDuration = period / 2;
      const peakTime = nextPulseTime + pulseDuration / 2;
      const endTime = nextPulseTime + pulseDuration;

      const gain = this.nodes.pulseGain.gain;
      
      gain.setValueAtTime(0, nextPulseTime);
      gain.linearRampToValueAtTime(1, peakTime);
      gain.linearRampToValueAtTime(0, endTime);

      nextPulseTime += period;
    }

    this.pulseTimer = setTimeout(() => this.schedulePulses(nextPulseTime), 100);
  }

  setMute(m) {
    this.opts.muted = m;
    if (this.nodes.outGain) {
      const targetGain = m ? 0 : 1;
      try { this.nodes.outGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05); } catch {} // Ignore errors
    }
  }

  elapsed() { return this.started ? (this.ctx.currentTime - this.t0) : 0; }
}

// ====================================================================
// UI and Application Logic
// ====================================================================

const q = id => document.getElementById(id);

// --- Global State & UI Elements ---
const sched = q('sched');
const readout = q('readout');
const statusEl = q('status');
const pointEditor = q('pointEditor');
const totalPointsInput = q('totalPoints');
const editPointSelector = q('editPointSelector');
const pointBeatInput = q('pointBeat');
const pointHoursInput = q('pointHours');
const pointMinutesInput = q('pointMinutes');
const singlePointDurationContainer = q('singlePointDurationContainer');
const singlePointHoursInput = q('singlePointHours');
const singlePointMinutesInput = q('singlePointMinutes');
const endActionInput = q('endAction');

let engine = null;
let currentEditingPoint = 2;

const pointsData = Array(9).fill(null).map((_, i) => ({
  beat: (i === 0) ? 2 : 4,
  hours: 0,
  minutes: 30,
}));

// --- Point Editor Logic ---
function savePoint(pointNumber) {
  const index = pointNumber - 2;
  if (index < 0 || index >= pointsData.length) return;

  pointsData[index] = {
    beat: +pointBeatInput.value,
    hours: +pointHoursInput.value,
    minutes: +pointMinutesInput.value,
  };
}

function loadPoint(pointNumber) {
  const index = pointNumber - 2;
  if (index < 0 || index >= pointsData.length) return;

  const data = pointsData[index];
  pointBeatInput.value = data.beat;
  pointHoursInput.value = data.hours;
  pointMinutesInput.value = data.minutes;
  currentEditingPoint = pointNumber;
}

function updateTotalPointsUI() {
    const total = +totalPointsInput.value;
    if (total <= 1) {
        pointEditor.style.display = 'none';
        singlePointDurationContainer.style.display = 'block';
    } else {
        pointEditor.style.display = 'flex';
        singlePointDurationContainer.style.display = 'none';
        editPointSelector.max = total;
        if (+editPointSelector.value > total) {
            editPointSelector.value = total;
            loadPoint(total);
        }
    }
}

// --- Main App Logic ---
const getOpts = () => {
  const total = +totalPointsInput.value;
  const numStages = total - 1;
  const stages = [];

  if (numStages > 0) {
    for (let i = 0; i < numStages; i++) {
      const point = pointsData[i];
      const duration = (point.hours * 3600) + (point.minutes * 60);
      stages.push({ beat: point.beat, duration });
    }
  } else {
    const hours = +singlePointHoursInput.value;
    const minutes = +singlePointMinutesInput.value;
    const duration = (hours * 3600) + (minutes * 60);
    if (duration > 0) {
      stages.push({ beat: +q('startBeat').value, duration });
    }
  }

  return {
    carrierHz: +q('carrier').value || 400,
    startBeatHz: +q('startBeat').value || 7,
    stages,
    muted: q('mute').checked,
    endAction: endActionInput.value,
  };
};

function updatePreview() {
    if (engine && engine.started) return;
    const opts = getOpts();
    drawSchedule(sched, opts, 0);
    readout.textContent = `Kjører: nei\nForløpt: 0.0 min\nBeat nå: ${opts.startBeatHz.toFixed(2)} Hz`;
}

// --- Event Listeners ---
[editPointSelector, totalPointsInput, endActionInput, q('startBeat'), q('carrier')].forEach(input => {
    input.addEventListener('change', updatePreview);
});
[pointBeatInput, pointHoursInput, pointMinutesInput, singlePointHoursInput, singlePointMinutesInput].forEach(input => {
  input.addEventListener('input', () => {
    savePoint(currentEditingPoint);
    updatePreview();
  });
});
totalPointsInput.addEventListener('input', updateTotalPointsUI);

q('mute').addEventListener('change', e => { if (engine) engine.setMute(e.target.checked); });

q('startBtn').onclick = async () => {
  try {
    if (engine) engine.stop();
    engine = new BrainwaveIso(getOpts());
    await engine.ctx.resume(); // Important for browsers that start context in suspended state
    engine.start();
    statusEl.textContent = 'Spiller';
  } catch (e) { 
    console.error(e);
    statusEl.textContent = 'Kunne ikke starte: ' + e.message;
  }
};
q('stopBtn').onclick = () => { if (engine) { engine.stop(); statusEl.textContent = 'Stoppet'; engine = null; updatePreview(); } };

function loop() {
  if (engine && engine.started) {
    drawSchedule(sched, engine.opts, engine.elapsed());
    readout.textContent = `Kjører: ja\nForløpt: ${(engine.elapsed()/60).toFixed(1)} min\nBeat nå: ${getBeatAt(engine.elapsed(), engine.opts).toFixed(2)} Hz`;
  }
  requestAnimationFrame(loop);
}

// --- Initial Setup ---
loadPoint(2);
updateTotalPointsUI();
updatePreview(); // Draw initial preview
requestAnimationFrame(loop);