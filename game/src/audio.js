// Sound, synthesised with WebAudio only: no audio files, no network. One
// shared noise buffer and a handful of tiny envelopes; every effect is a
// function of a few numbers so the mix stays coherent.
export function createAudio() {
  let context = null;
  let master = null;
  let noise = null;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      context = new AC();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      const length = context.sampleRate;
      noise = context.createBuffer(1, length, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      context = null;
    }
    return context !== null;
  }

  function burst(seconds, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure() || muted) return;
    const t = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    source.connect(filter).connect(gain).connect(master);
    source.start(t, Math.random());
    source.stop(t + seconds);
  }

  function tone(freq, seconds, gainValue, type = 'sine', slideTo = null) {
    if (!ensure() || muted) return;
    const t = context.currentTime;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t + seconds);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + seconds);
  }

  return {
    unlock() {
      ensure();
      if (context && context.state === 'suspended') context.resume();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    shot(kind) {
      if (kind === 'shotgun') burst(0.22, 900, 0.7);
      else if (kind === 'dmr') burst(0.3, 1400, 0.75);
      else if (kind === 'pistol') burst(0.12, 1800, 0.45);
      else burst(0.14, 1200, 0.55);
      tone(180, 0.08, 0.25, 'square', 60);
    },
    dryFire() {
      tone(1400, 0.03, 0.12, 'square');
    },
    reload() {
      tone(900, 0.04, 0.15, 'square');
      setTimeout(() => tone(600, 0.05, 0.15, 'square'), 260);
    },
    hit(kill) {
      tone(kill ? 1400 : 1000, 0.06, 0.2, 'triangle');
    },
    hurt() {
      tone(220, 0.12, 0.25, 'sawtooth', 110);
    },
    beep(final) {
      tone(final ? 1750 : 1250, 0.09, 0.22, 'sine');
    },
    plant() {
      tone(880, 0.1, 0.2, 'sine');
      setTimeout(() => tone(1320, 0.12, 0.2, 'sine'), 120);
    },
    explosion() {
      burst(1.1, 320, 0.9);
      tone(70, 0.9, 0.5, 'sine', 32);
    },
    step() {
      burst(0.05, 500, 0.06);
    },
    buy() {
      tone(660, 0.05, 0.15, 'triangle');
      setTimeout(() => tone(990, 0.07, 0.15, 'triangle'), 70);
    },
    roundWin() {
      tone(523, 0.12, 0.2, 'triangle');
      setTimeout(() => tone(659, 0.12, 0.2, 'triangle'), 120);
      setTimeout(() => tone(784, 0.2, 0.22, 'triangle'), 240);
    },
    roundLose() {
      tone(392, 0.14, 0.2, 'triangle');
      setTimeout(() => tone(330, 0.14, 0.2, 'triangle'), 140);
      setTimeout(() => tone(262, 0.26, 0.22, 'triangle'), 280);
    },
  };
}
