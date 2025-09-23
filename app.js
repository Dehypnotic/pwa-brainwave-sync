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

  // Draw stage point markers
  ctx.fillStyle = '#60a5fa';
  ctx.beginPath();
  ctx.arc(xMap(0), yMap(startBeatHz), 3.5, 0, Math.PI * 2);
  ctx.fill();
  cumulativeTime = 0;
  for (const stage of stages) {
    cumulativeTime += stage.duration;
    ctx.beginPath();
    ctx.arc(xMap(cumulativeTime), yMap(getBeatAt(cumulativeTime, opts)), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw point labels
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '11px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  const formatTimeLabel = (seconds) => {
      if (seconds === 0) return 'Start';
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
  };

  // Label for start point
  ctx.fillText(`${startBeatHz.toFixed(1)}Hz`, xMap(0), yMap(startBeatHz) - 18);
  ctx.fillText(formatTimeLabel(0), xMap(0), yMap(startBeatHz) - 7);

  // Labels for other points
  cumulativeTime = 0;
  for (const stage of stages) {
      if (stage.duration === 0) continue;
      cumulativeTime += stage.duration;
      const beat = getBeatAt(cumulativeTime, opts);
      const x = xMap(cumulativeTime);
      const y = yMap(beat);
      ctx.fillText(`${beat.toFixed(1)}Hz`, x, y - 18);
      ctx.fillText(formatTimeLabel(cumulativeTime), x, y - 7);
  }

  // Draw Progress Indicator
  if (elapsed > 0) {
    const t = Math.min(elapsed, totalDuration);
    const x = xMap(t);
    const y = yMap(getBeatAt(t, opts));
    ctx.setLineDash([6,4]); ctx.strokeStyle = '#e5e7eb';
    ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, H-margin.bottom); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#e5e7eb'; ctx.font = '12px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`beat≈${getBeatAt(t, opts).toFixed(2)} Hz`, x+8, y-8);
  }
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
        requestAnimationFrame(() => { q('togglePlaybackBtn').textContent = 'Start'; });
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
              requestAnimationFrame(() => { q('togglePlaybackBtn').textContent = 'Start'; });
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
const exportSampleRateInput = q('exportSampleRate');
const togglePlaybackBtn = q('togglePlaybackBtn');
const presetDescription = q('presetDescription');

// Modal elements
const renamePresetModal = q('renamePresetModal');
const renamePresetForm = q('renamePresetForm');
const presetNameInput = q('presetNameInput');
const presetDescriptionInput = q('presetDescriptionInput');
const cancelPresetNameBtn = q('cancelPresetNameBtn');

let engine = null;
let currentEditingPoint = 2;
let currentEditingPresetIndex = -1;

const presetsContainer = q('presetsContainer');
let presets = [];
let activePresetIndex = 0;

const defaultPreset = {
  name: 'Default',
  description: '',
  carrierHz: 400,
  startBeatHz: 7,
  totalPoints: 1,
  singlePointHours: 0,
  singlePointMinutes: 30,
  stages: [],
  endAction: 'hold',
  exportSampleRate: 44100,
  muted: false,
};

// --- Point Editor Logic ---
function savePoint(pointNumber) {
  const index = pointNumber - 2;
  const currentStages = presets[activePresetIndex].stages;
  if (index < 0 || index >= currentStages.length) return;

  currentStages[index] = {
    beat: +pointBeatInput.value,
    hours: +pointHoursInput.value,
    minutes: +pointMinutesInput.value,
  };
  savePresets(); // Save changes to localStorage
}

function loadPoint(pointNumber) {
  const index = pointNumber - 2;
  const currentStages = presets[activePresetIndex].stages;
  if (index < 0 || index >= currentStages.length) return;

  const data = currentStages[index];
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
        // Ensure editPointSelector is set to a valid point, defaulting to 2 if total is 2
        if (+editPointSelector.value > total || (+editPointSelector.value === 1 && total >= 2)) {
            editPointSelector.value = 2;
            loadPoint(2);
        } else if (total === 2 && +editPointSelector.value !== 2) {
            editPointSelector.value = 2;
            loadPoint(2);
        }
    }
}

// --- Preset Management ---
function savePresets() {
  localStorage.setItem('brainwavePresets', JSON.stringify(presets));
}

function saveActivePresetIndex() {
  localStorage.setItem('brainwaveActivePresetIndex', activePresetIndex);
}

function loadPresetsAndState() {
  const initialDefaultPresets = [
      { ...defaultPreset, name: 'Preset 1', description: 'A standard default preset.' },
      { ...defaultPreset, name: 'Preset 2', description: 'From 10Hz down to 5Hz over 30 minutes.', startBeatHz: 10, stages: [{ beat: 5, hours: 0, minutes: 30 }] },
      { ...defaultPreset, name: 'Preset 3', description: 'From 4Hz up to 8Hz over 45 minutes.', startBeatHz: 4, stages: [{ beat: 8, hours: 0, minutes: 45 }] },
      { ...defaultPreset, name: 'Preset 4', description: 'Low carrier, short session.', carrierHz: 200, startBeatHz: 6, totalPoints: 2, stages: [{ beat: 12, hours: 0, minutes: 20 }] },
      { ...defaultPreset, name: 'Preset 5', description: 'High carrier, multi-stage session.', carrierHz: 600, startBeatHz: 8, totalPoints: 3, stages: [{ beat: 4, hours: 0, minutes: 15 }, { beat: 10, hours: 0, minutes: 15 }] },
    ];

  const storedPresets = localStorage.getItem('brainwavePresets');
  if (storedPresets) {
    presets = JSON.parse(storedPresets);
    // Add any new default presets that might have been added in a new version
    if (presets.length < initialDefaultPresets.length) {
      for (let i = presets.length; i < initialDefaultPresets.length; i++) {
        presets.push(initialDefaultPresets[i]);
      }
      savePresets(); // Save the updated presets to localStorage
    }
    // Ensure all loaded presets have a description field
    presets.forEach(p => {
        if (p.description === undefined) {
            p.description = '';
        }
    });
  } else {
    presets = initialDefaultPresets;
    savePresets();
  }

  const storedActivePresetIndex = localStorage.getItem('brainwaveActivePresetIndex');
  if (storedActivePresetIndex !== null && +storedActivePresetIndex < presets.length) {
    activePresetIndex = +storedActivePresetIndex;
  } else {
    activePresetIndex = 0;
    saveActivePresetIndex();
  }
}

function openRenameModal(index) {
  currentEditingPresetIndex = index;
  const preset = presets[index];
  presetNameInput.value = preset.name;
  presetDescriptionInput.value = preset.description || '';
  renamePresetModal.style.display = 'flex';
  presetNameInput.focus();
}

function closeRenameModal() {
  renamePresetModal.style.display = 'none';
}

function handleRenamePreset(event) {
  event.preventDefault();
  const newName = presetNameInput.value;
  if (newName && newName.trim() !== '') {
    const preset = presets[currentEditingPresetIndex];
    preset.name = newName.trim();
    preset.description = presetDescriptionInput.value.trim();
    savePresets();
    renderPresetButtons();
    updateUIFromPreset(presets[activePresetIndex]); // Update description display
    closeRenameModal();
  }
}

function renderPresetButtons() {
  presetsContainer.innerHTML = ''; // Clear existing buttons
  presets.forEach((preset, index) => {
    const button = document.createElement('button');
    button.classList.add('preset-btn');
    if (index === activePresetIndex) {
      button.classList.add('active');
    }
    button.textContent = preset.name;

    let pressTimer = null;
    let longPress = false;

    button.addEventListener('mousedown', (e) => {
      longPress = false;
      pressTimer = setTimeout(() => {
        longPress = true;
        openRenameModal(index);
      }, 750);
    });

    button.addEventListener('mouseup', () => {
      clearTimeout(pressTimer);
    });

    button.addEventListener('mouseleave', () => {
      clearTimeout(pressTimer);
    });

    button.addEventListener('click', (e) => {
      if (longPress) {
        e.preventDefault();
        return;
      }
      activePresetIndex = index;
      saveActivePresetIndex();
      updateUIFromPreset(presets[activePresetIndex]);
      renderPresetButtons(); // Re-render to highlight active button
      updatePreview();
    });

    button.addEventListener('dblclick', () => openRenameModal(index));

    presetsContainer.appendChild(button);
  });
}

// --- WAV Export Logic ---
function bufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels, length = buffer.length * numOfChan * 2 + 44;
  const bufferWav = new ArrayBuffer(length);
  const view = new DataView(bufferWav);
  const channels = [];
  let i, sample;
  let offset = 0, pos = 0;

  // Helper function
  const setUint16 = (data) => {
    view.setUint16(pos, data, true);
    pos += 2;
  }
  const setUint32 = (data) => {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // Write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // Write PCM samples
  for (i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++
  }

  return bufferWav;
}

async function exportToWav() {
  const opts = getOpts();
  const totalDuration = getTotalDuration(opts);
  if (totalDuration <= 0) {
    alert("Cannot save a session with 0 seconds duration.");
    return;
  }

  const originalBtnText = q('saveBtn').textContent;
  q('saveBtn').textContent = 'Generating...';
  q('saveBtn').disabled = true;

  try {
    const sampleRate = opts.exportSampleRate;
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, totalDuration * sampleRate, sampleRate);

    const carrier = offlineCtx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = opts.carrierHz;
    const pulseGain = offlineCtx.createGain();
    pulseGain.gain.value = 0;
    carrier.connect(pulseGain).connect(offlineCtx.destination);
    carrier.start();

    let currentTime = 0;
    while (currentTime < totalDuration) {
      const beatHz = getBeatAt(currentTime, opts);
      if (beatHz <= 0) { currentTime += 0.1; continue; }
      const period = 1 / beatHz;
      const pulseDuration = period / 2;
      const peakTime = currentTime + pulseDuration / 2;
      const endTime = currentTime + pulseDuration;
      if (endTime > totalDuration) break;
      pulseGain.gain.setValueAtTime(0, currentTime);
      pulseGain.gain.linearRampToValueAtTime(1, peakTime);
      pulseGain.gain.linearRampToValueAtTime(0, endTime);
      currentTime += period;
    }

    const renderedBuffer = await offlineCtx.startRendering();
    const wavData = bufferToWav(renderedBuffer);
    const blob = new Blob([wavData], { type: 'audio/wav' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = 'brainwave_session.wav';
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    alert('WAV file saved.');

  } catch (e) {
    console.error('Error saving WAV:', e);
    alert('An error occurred while generating the audio file: ' + e.message);
  } finally {
    q('saveBtn').textContent = originalBtnText;
    q('saveBtn').disabled = false;
  }
}


// --- Main App Logic ---
function updateUIFromPreset(preset) {
  q('carrier').value = preset.carrierHz;
  q('startBeat').value = preset.startBeatHz;
  q('endAction').value = preset.endAction;
  q('exportSampleRate').value = preset.exportSampleRate;
  q('mute').checked = preset.muted;
  presetDescription.textContent = preset.description || '';

  totalPointsInput.value = preset.totalPoints;
  singlePointHoursInput.value = preset.singlePointHours;
  singlePointMinutesInput.value = preset.singlePointMinutes;

  updateTotalPointsUI(); // This will handle showing/hiding pointEditor and setting editPointSelector.max

  // Load the currently selected point in the editor, or default to point 2
  const currentEditorPoint = +editPointSelector.value;
  if (currentEditorPoint > preset.totalPoints) {
      editPointSelector.value = preset.totalPoints;
      loadPoint(preset.totalPoints);
  } else {
      loadPoint(currentEditorPoint);
  }
}

function updateActivePresetFromUI() {
  const currentPreset = presets[activePresetIndex];

  currentPreset.carrierHz = +q('carrier').value;
  currentPreset.startBeatHz = +q('startBeat').value;
  currentPreset.endAction = q('endAction').value;
  currentPreset.exportSampleRate = +q('exportSampleRate').value;
  currentPreset.muted = q('mute').checked;

  currentPreset.totalPoints = +totalPointsInput.value;
  currentPreset.singlePointHours = +singlePointHoursInput.value;
  currentPreset.singlePointMinutes = +singlePointMinutesInput.value;

  // Adjust stages array length if totalPoints changed
  const newStagesLength = currentPreset.totalPoints - 1;
  if (newStagesLength > currentPreset.stages.length) {
      for (let i = currentPreset.stages.length; i < newStagesLength; i++) {
          currentPreset.stages.push({ beat: 4, hours: 0, minutes: 30 }); // Default new stage
      }
  } else if (newStagesLength < currentPreset.stages.length) {
      currentPreset.stages.splice(newStagesLength);
  }
  savePresets();
}

const getOpts = () => {
  const currentPreset = presets[activePresetIndex];
  const stages = [];

  if (currentPreset.totalPoints > 1) {
    for (let i = 0; i < currentPreset.stages.length; i++) {
      const point = currentPreset.stages[i];
      const duration = (point.hours * 3600) + (point.minutes * 60);
      stages.push({ beat: point.beat, duration });
    }
  } else { // totalPoints is 1
    const duration = (currentPreset.singlePointHours * 3600) + (currentPreset.singlePointMinutes * 60);
    if (duration > 0) {
      stages.push({ beat: currentPreset.startBeatHz, duration });
    }
  }

  return {
    carrierHz: currentPreset.carrierHz,
    startBeatHz: currentPreset.startBeatHz,
    stages,
    muted: currentPreset.muted,
    endAction: currentPreset.endAction,
    exportSampleRate: currentPreset.exportSampleRate,
  };
};

function updatePreview() {
    if (engine && engine.started) return;
    const opts = getOpts();
    drawSchedule(sched, opts, 0);
    readout.textContent = `Running: no
Elapsed: 0.0 min
Beat now: ${opts.startBeatHz.toFixed(2)} Hz`;
}

// --- Event Listeners ---
[q('carrier'), q('startBeat'), endActionInput, exportSampleRateInput, q('mute'), singlePointHoursInput, singlePointMinutesInput].forEach(input => {
    input.addEventListener('change', () => {
        updateActivePresetFromUI();
        updatePreview();
    });
});
[pointBeatInput, pointHoursInput, pointMinutesInput].forEach(input => {
  input.addEventListener('input', () => {
    savePoint(currentEditingPoint); // savePoint already calls savePresets()
    updatePreview();
  });
});
totalPointsInput.addEventListener('input', () => {
    updateActivePresetFromUI(); // Update preset data first
    updateTotalPointsUI(); // Then update UI based on new total points
    updatePreview();
});

editPointSelector.addEventListener('change', () => {
    loadPoint(+editPointSelector.value);
    updatePreview(); // Redraw graph to reflect potential point changes
});

q('saveBtn').addEventListener('click', exportToWav);

q('mute').addEventListener('change', e => { if (engine) engine.setMute(e.target.checked); });

renamePresetForm.addEventListener('submit', handleRenamePreset);
cancelPresetNameBtn.addEventListener('click', closeRenameModal);

togglePlaybackBtn.onclick = async () => {
  if (engine && engine.started) {
    engine.stop();
    engine = null;
    togglePlaybackBtn.textContent = 'Start';
    togglePlaybackBtn.classList.remove('secondary');
    updatePreview();
  } else {
    try {
      if (engine) engine.stop();
      engine = new BrainwaveIso(getOpts());
      await engine.ctx.resume();
      engine.start();
      togglePlaybackBtn.textContent = 'Stop';
      togglePlaybackBtn.classList.add('secondary');
    } catch (e) {
      console.error(e);
      alert('Could not start: ' + e.message);
      togglePlaybackBtn.textContent = 'Start';
      togglePlaybackBtn.classList.remove('secondary');
    }
  }
};

function loop() {
  if (engine && engine.started) {
    drawSchedule(sched, engine.opts, engine.elapsed());
    readout.textContent = `Running: yes
Elapsed: ${(engine.elapsed()/60).toFixed(1)} min
Beat now: ${getBeatAt(engine.elapsed(), engine.opts).toFixed(2)} Hz`;
  }
  requestAnimationFrame(loop);
}

// --- Initial Setup ---
loadPresetsAndState(); // Load presets and active index
updateUIFromPreset(presets[activePresetIndex]); // Populate UI with active preset
renderPresetButtons(); // Render preset buttons
updatePreview(); // Draw initial preview
requestAnimationFrame(loop);