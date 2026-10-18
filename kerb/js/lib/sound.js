// Every sound is synthesised with Web Audio, so there are no audio files to host.
let ctx = null;
function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, start, dur, { type = "sine", vol = 0.2, slide = 0 } = {}) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(start, dur, vol = 0.2, hp = 800) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + start;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
  const g = a.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const SOUNDS = {
  airhorn: { label: "Air horn", emoji: "📯", play() { [0, 0.18, 0.36].forEach(s => { tone(466, s, 0.16, { type: "sawtooth", vol: 0.12 }); tone(587, s, 0.16, { type: "sawtooth", vol: 0.08 }); }); } },
  rimshot: { label: "Ba dum tss", emoji: "🥁", play() { tone(180, 0, 0.12, { vol: 0.4, slide: -80 }); tone(150, 0.16, 0.12, { vol: 0.4, slide: -60 }); noise(0.32, 0.5, 0.25, 5000); } },
  tada: { label: "Ta-da", emoji: "🎉", play() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.4, { type: "triangle", vol: 0.15 })); } },
  sad: { label: "Sad trombone", emoji: "😢", play() { [392, 370, 349, 330].forEach((f, i) => tone(f, i * 0.35, i === 3 ? 0.9 : 0.32, { type: "sawtooth", vol: 0.08, slide: i === 3 ? -40 : 0 })); } },
  boing: { label: "Boing", emoji: "🪀", play() { tone(200, 0, 0.5, { type: "sine", vol: 0.3, slide: 600 }); } },
  applause: { label: "Applause", emoji: "👏", play() { for (let i = 0; i < 24; i++) noise(i * 0.06 + Math.random() * 0.04, 0.05, 0.25, 1500); } },
  bruh: { label: "Bruh", emoji: "🗿", play() { tone(110, 0, 0.45, { type: "square", vol: 0.12, slide: -20 }); } },
  ding: { label: "Ding", emoji: "🔔", play() { tone(1318, 0, 0.8, { vol: 0.2 }); tone(2636, 0, 0.5, { vol: 0.05 }); } },
};

export function ping() { tone(880, 0, 0.12, { vol: 0.12 }); tone(1320, 0.1, 0.18, { vol: 0.1 }); }
export function softPop() { tone(600, 0, 0.06, { vol: 0.06, slide: 200 }); }
export function joinSound() { tone(523, 0, 0.12, { vol: 0.1 }); tone(784, 0.1, 0.16, { vol: 0.1 }); }
export function leaveSound() { tone(784, 0, 0.12, { vol: 0.1 }); tone(523, 0.1, 0.16, { vol: 0.1 }); }

// taxi app sounds
export function offerSound() { tone(988, 0, 0.14, { vol: 0.16 }); tone(1319, 0.16, 0.14, { vol: 0.16 }); tone(988, 0.34, 0.14, { vol: 0.16 }); tone(1319, 0.5, 0.2, { vol: 0.16 }); }
export function alarm() { for (let i = 0; i < 6; i++) tone(i % 2 ? 660 : 880, i * 0.22, 0.2, { type: "square", vol: 0.1 }); }
export function vibrate(p = [120, 60, 120]) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }
