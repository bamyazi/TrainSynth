// Web Audio sonification engine
// Maps train positions to musical parameters

const PENTATONIC = [0, 2, 4, 7, 9]; // C pentatonic intervals
const BASE_FREQ = 130.81; // C3

// TOC → waveform + character mapping
// filterType: lowpass=warm, bandpass=nasal, highpass=thin, notch=hollow, peaking=resonant
const TOC_VOICE = {
    VT: { wave: 'triangle', attack: 0.05, release: 0.8, filterType: 'lowpass',  filterFreq: 2000, filterQ: 3,  filterSweep: true  },  // Avanti - warm sweep
    GR: { wave: 'triangle', attack: 0.03, release: 1.0, filterType: 'lowpass',  filterFreq: 2500, filterQ: 5,  filterSweep: true  },  // LNER - rich resonant
    GW: { wave: 'sawtooth', attack: 0.01, release: 0.6, filterType: 'bandpass', filterFreq: 1800, filterQ: 8,  filterSweep: false },  // GWR - nasal bark
    XC: { wave: 'sawtooth', attack: 0.02, release: 0.5, filterType: 'lowpass',  filterFreq: 1600, filterQ: 4,  filterSweep: true  },  // CrossCountry - acid sweep
    NT: { wave: 'square',   attack: 0.01, release: 0.3, filterType: 'highpass', filterFreq: 600,  filterQ: 2,  filterSweep: false },  // Northern - thin pluck
    SR: { wave: 'triangle', attack: 0.04, release: 0.7, filterType: 'notch',    filterFreq: 1400, filterQ: 6,  filterSweep: true  },  // ScotRail - hollow
    SW: { wave: 'sine',     attack: 0.02, release: 0.5, filterType: 'lowpass',  filterFreq: 3000, filterQ: 1,  filterSweep: false },  // SWR - clean open
    LE: { wave: 'square',   attack: 0.01, release: 0.4, filterType: 'bandpass', filterFreq: 1000, filterQ: 10, filterSweep: true  },  // Anglia - wah sweep
    TP: { wave: 'sawtooth', attack: 0.02, release: 0.6, filterType: 'peaking',  filterFreq: 1500, filterQ: 7,  filterSweep: false },  // TPE - resonant peak
    SE: { wave: 'sine',     attack: 0.01, release: 0.3, filterType: 'highpass', filterFreq: 2800, filterQ: 3,  filterSweep: false },  // Southeastern - bright thin
};

const DEFAULT_VOICE = { wave: 'triangle', attack: 0.02, release: 0.5, filterType: 'lowpass', filterFreq: 1500, filterQ: 2, filterSweep: false };

const C2_FREQ = 65.41;

// Chord voicings: semitone offsets from C2, pentatonic-compatible
const CHORD_PROGRESSION = [
    [0, 7, 12, 16],     // C  (C2, G2, C3, E3)
    [5, 9, 12, 17],     // F  (F2, A2, C3, F3)
    [9, 12, 16, 21],    // Am (A2, C3, E3, A3)
    [7, 12, 14, 19],    // G  (G2, C3, D3, G3)
];

// 16-step beat pattern (velocity 0-1, 0 = silent)
const BEAT_PATTERN = {
    kick:  [1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0.3],
    hat:   [0.3, 0, 0.5, 0, 0.3, 0, 0.5, 0, 0.3, 0, 0.5, 0, 0.3, 0, 0.6, 0],
};

export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.compressor = null;
        this.reverb = null;
        this.reverbGain = null;
        this.dryGain = null;
        this.analyser = null;
        this.isRunning = false;
        this._volume = 0.5;
        this._reverbMix = 0.4;
        this._chordIndex = 0;
        this._chordOscs = [];
        this._beatStep = 0;
        this._beatTimer = null;
        this._beatsRunning = false;
        this._bpm = 85;
    }

    async init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Master chain: notes → compressor → dry/wet reverb → master gain → destination
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -20;
        this.compressor.knee.value = 10;
        this.compressor.ratio.value = 4;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this._volume;

        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;

        // Reverb send
        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = this._reverbMix;
        this.dryGain = this.ctx.createGain();
        this.dryGain.gain.value = 1 - this._reverbMix;

        // Create convolution reverb
        this.reverb = this.ctx.createConvolver();
        this.reverb.buffer = this._createReverbIR(2.5, 3.0);

        this.compressor.connect(this.dryGain);
        this.compressor.connect(this.reverbGain);
        this.reverbGain.connect(this.reverb);
        this.reverb.connect(this.masterGain);
        this.dryGain.connect(this.masterGain);
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        // Noise buffer for drum synthesis (reused)
        this._noiseBuffer = this._createNoiseBuffer(0.5);

        // Chord pad layer
        this._startChords();

        // Beat machine
        this._startBeats();

        this.isRunning = true;
    }

    _createReverbIR(duration, decay) {
        const length = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            }
        }
        return buffer;
    }

    _startChords() {
        this._chordIndex = 0;
        const now = this.ctx.currentTime;

        this._chordGain = this.ctx.createGain();
        this._chordGain.gain.value = 0.035;

        this._chordFilter = this.ctx.createBiquadFilter();
        this._chordFilter.type = 'lowpass';
        this._chordFilter.frequency.value = 600;
        this._chordFilter.Q.value = 0.7;

        const chord = CHORD_PROGRESSION[0];
        this._chordOscs = chord.map(semi => {
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = C2_FREQ * Math.pow(2, semi / 12);
            osc.connect(this._chordFilter);
            osc.start(now);
            return osc;
        });

        this._chordFilter.connect(this._chordGain);
        this._chordGain.connect(this.compressor);
    }

    advanceChord() {
        if (!this._chordOscs || !this._chordOscs.length) return;
        this._chordIndex = (this._chordIndex + 1) % CHORD_PROGRESSION.length;
        const chord = CHORD_PROGRESSION[this._chordIndex];
        const now = this.ctx.currentTime;

        this._chordOscs.forEach((osc, i) => {
            const freq = C2_FREQ * Math.pow(2, chord[i] / 12);
            osc.frequency.setTargetAtTime(freq, now, 0.5);
        });

        // Gentle filter movement per chord
        const filterFreqs = [600, 800, 500, 700];
        this._chordFilter.frequency.setTargetAtTime(
            filterFreqs[this._chordIndex], now, 0.3
        );
    }

    _createNoiseBuffer(duration) {
        const length = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    _startBeats() {
        if (this._beatsRunning) return;
        this._beatsRunning = true;
        this._beatStep = 0;
        this._nextBeatTime = this.ctx.currentTime + 0.1;
        this._scheduleBeats();
    }

    _stopBeats() {
        this._beatsRunning = false;
        if (this._beatTimer) {
            clearTimeout(this._beatTimer);
            this._beatTimer = null;
        }
    }

    _scheduleBeats() {
        if (!this._beatsRunning) return;
        const lookahead = 0.1;
        while (this._nextBeatTime < this.ctx.currentTime + lookahead) {
            this._playBeatStep(this._beatStep, this._nextBeatTime);
            this._nextBeatTime += 60 / this._bpm / 4; // 16th notes
            this._beatStep = (this._beatStep + 1) % 16;
        }
        this._beatTimer = setTimeout(() => this._scheduleBeats(), 50);
    }

    _playBeatStep(step, time) {
        const kv = BEAT_PATTERN.kick[step];
        const sv = BEAT_PATTERN.snare[step];
        const hv = BEAT_PATTERN.hat[step];
        if (kv > 0) this._playKick(time, kv);
        if (sv > 0) this._playSnare(time, sv);
        if (hv > 0) this._playHihat(time, hv);
    }

    _playKick(time, vel) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(30, time + 0.12);
        gain.gain.setValueAtTime(0.25 * vel, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
        osc.connect(gain);
        gain.connect(this.compressor);
        osc.start(time);
        osc.stop(time + 0.35);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }

    _playSnare(time, vel) {
        // Noise burst
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 3000;
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.1 * vel, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.compressor);
        noise.start(time);
        noise.stop(time + 0.15);

        // Body tone
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, time);
        osc.frequency.exponentialRampToValueAtTime(60, time + 0.05);
        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(0.1 * vel, time);
        oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
        osc.connect(oscGain);
        oscGain.connect(this.compressor);
        osc.start(time);
        osc.stop(time + 0.12);

        osc.onended = () => { osc.disconnect(); oscGain.disconnect(); };
        noise.onended = () => { noise.disconnect(); noiseFilter.disconnect(); noiseGain.disconnect(); };
    }

    _playHihat(time, vel) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 8000;
        filter.Q.value = 3;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.04 * vel, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.compressor);
        noise.start(time);
        noise.stop(time + 0.06);
        noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
    }

    // Convert latitude to frequency using pentatonic scale
    latToFreq(lat) {
        const bounds = { minLat: 50.0, maxLat: 58.5 };
        const normalized = Math.max(0, Math.min(1, (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)));
        // Map to 3 octaves of pentatonic (15 notes)
        const noteIndex = Math.floor(normalized * 14.99);
        const octave = Math.floor(noteIndex / 5);
        const degree = noteIndex % 5;
        const semitones = PENTATONIC[degree] + (octave * 12);
        return BASE_FREQ * Math.pow(2, semitones / 12);
    }

    // Convert longitude to stereo pan
    lonToPan(lon) {
        const bounds = { minLon: -6.5, maxLon: 2.0 };
        return Math.max(-1, Math.min(1,
            ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 2 - 1
        ));
    }

    // Play a note for a train
    playTrain(train) {
        if (!this.ctx || this.ctx.state === 'suspended') return;
        const now = this.ctx.currentTime;
        const voice = TOC_VOICE[train.tocCode] || DEFAULT_VOICE;

        const freq = this.latToFreq(train.lat);
        const pan = this.lonToPan(train.lon);

        // Delay affects detuning and filter
        const detuneAmount = Math.min(train.delay * 3, 50);
        const filterMod = Math.max(0.3, 1 - train.delay * 0.03);

        // Create oscillator
        const osc = this.ctx.createOscillator();
        osc.type = voice.wave;
        osc.frequency.value = freq;
        osc.detune.value = detuneAmount;

        // Operator-specific filter
        const filter = this.ctx.createBiquadFilter();
        filter.type = voice.filterType;
        const baseFilterFreq = voice.filterFreq * filterMod;
        filter.frequency.value = baseFilterFreq;
        filter.Q.value = (voice.filterQ || 2) + train.delay * 0.2;
        if (voice.filterType === 'peaking') filter.gain.value = 8;

        // Filter envelope sweep (TB-303 style for operators that have it)
        const noteDuration = voice.attack + voice.release;
        if (voice.filterSweep) {
            const sweepStart = baseFilterFreq * 2.5;
            const sweepEnd = baseFilterFreq * 0.4;
            filter.frequency.setValueAtTime(sweepStart, now);
            filter.frequency.exponentialRampToValueAtTime(
                Math.max(sweepEnd, 20), now + noteDuration * 0.7
            );
        }

        // Envelope
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(0.15, now + voice.attack);
        env.gain.exponentialRampToValueAtTime(0.001, now + voice.attack + voice.release);

        // Chorus: second detuned oscillator for thickness
        const osc2 = this.ctx.createOscillator();
        osc2.type = voice.wave;
        osc2.frequency.value = freq;
        osc2.detune.value = detuneAmount + 7; // slight chorus offset
        const chorusGain = this.ctx.createGain();
        chorusGain.gain.value = 0.07;

        // Stereo panning
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = pan;

        // Delay send (echo effect)
        const delayNode = this.ctx.createDelay(1.0);
        delayNode.delayTime.value = 0.25;
        const delayFeedback = this.ctx.createGain();
        delayFeedback.gain.value = 0.3;
        const delayFilter = this.ctx.createBiquadFilter();
        delayFilter.type = 'lowpass';
        delayFilter.frequency.value = 2000;
        const delaySend = this.ctx.createGain();
        delaySend.gain.value = 0.2;

        // Connect main path (unchanged — same as original)
        osc.connect(filter);
        osc2.connect(chorusGain);
        chorusGain.connect(filter);
        filter.connect(env);
        env.connect(panner);
        panner.connect(this.compressor);

        // Connect delay path
        panner.connect(delaySend);
        delaySend.connect(delayNode);
        delayNode.connect(delayFilter);
        delayFilter.connect(delayFeedback);
        delayFeedback.connect(delayNode);
        delayFilter.connect(this.compressor);

        osc.start(now);
        osc2.start(now);
        osc.stop(now + noteDuration + 0.1);
        osc2.stop(now + noteDuration + 0.1);

        // Octave layers on a separate bus — don't compete with core note
        // High octave — sine shimmer
        const octHigh = this.ctx.createOscillator();
        octHigh.type = 'sine';
        octHigh.frequency.value = freq * 2;
        octHigh.detune.value = detuneAmount + 3;
        const octHighEnv = this.ctx.createGain();
        octHighEnv.gain.setValueAtTime(0, now);
        octHighEnv.gain.linearRampToValueAtTime(0.03, now + voice.attack * 1.5);
        octHighEnv.gain.exponentialRampToValueAtTime(0.001, now + voice.attack + voice.release * 1.3);
        const octHighFilter = this.ctx.createBiquadFilter();
        octHighFilter.type = 'lowpass';
        octHighFilter.frequency.value = 3500;
        octHighFilter.Q.value = 0.5;

        // Sub octave — triangle warmth
        const octSub = this.ctx.createOscillator();
        octSub.type = 'triangle';
        octSub.frequency.value = freq * 0.5;
        octSub.detune.value = detuneAmount;
        const octSubEnv = this.ctx.createGain();
        octSubEnv.gain.setValueAtTime(0, now);
        octSubEnv.gain.linearRampToValueAtTime(0.04, now + voice.attack * 2);
        octSubEnv.gain.exponentialRampToValueAtTime(0.001, now + voice.attack + voice.release * 0.7);

        // Separate panner for octave layers
        const octPanner = this.ctx.createStereoPanner();
        octPanner.pan.value = pan;

        octHigh.connect(octHighFilter);
        octHighFilter.connect(octHighEnv);
        octHighEnv.connect(octPanner);
        octSub.connect(octSubEnv);
        octSubEnv.connect(octPanner);
        octPanner.connect(this.masterGain); // bypass compressor — won't duck the core

        const octEnd = now + noteDuration + 0.3;
        octHigh.start(now);
        octSub.start(now);
        octHigh.stop(octEnd);
        octSub.stop(octEnd);

        // Cleanup
        const cleanup = () => {
            [osc, osc2, filter, env, chorusGain, panner,
             delayNode, delayFeedback, delayFilter, delaySend
            ].forEach(n => { try { n.disconnect(); } catch(e) {} });
        };
        osc.onended = cleanup;
        octHigh.onended = () => {
            [octHigh, octHighEnv, octHighFilter, octSub, octSubEnv, octPanner
            ].forEach(n => { try { n.disconnect(); } catch(e) {} });
        };
    }

    // Play a subtle tick for the scanning beam position
    playBeamTick() {
        if (!this.ctx || this.ctx.state === 'suspended') return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 8000;
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0.005, now);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        osc.connect(env);
        env.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.06);
        osc.onended = () => { osc.disconnect(); env.disconnect(); };
    }

    getAnalyserData() {
        if (!this.analyser) return new Uint8Array(0);
        const data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(data);
        return data;
    }

    set volume(v) {
        this._volume = v;
        if (this.masterGain) this.masterGain.gain.value = v;
    }

    set reverbMix(v) {
        this._reverbMix = v;
        if (this.reverbGain) this.reverbGain.gain.value = v;
        if (this.dryGain) this.dryGain.gain.value = 1 - v;
    }

    async resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            await this.ctx.resume();
            this._startBeats();
        }
    }

    suspend() {
        this._stopBeats();
        if (this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend();
        }
    }
}
