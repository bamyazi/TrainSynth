// Main application - orchestrates data, audio, and visualization

import { TrainDataManager } from './data.js';
import { AudioEngine } from './audio.js';
import { MapView } from './map.js';

class TrainSynth {
    constructor() {
        this.data = new TrainDataManager();
        this.audio = new AudioEngine();
        this.map = new MapView('map-canvas');

        this.isPlaying = false;
        this.beamSpeed = 0.02; // longitude degrees per frame (~16ms)
        this.beamLon = -6.5;
        this.beamWidth = 0.15; // threshold for triggering trains
        this.triggeredThisSweep = new Set();
        this.sweepCount = 0;
        this._animFrame = null;

        this._bindUI();
    }

    async init() {
        this._showStatus('Loading train data...');
        const trains = await this.data.init();
        this.map.setTrains(trains);
        this._updateTrainCount();

        this.data.onUpdate = (trains, isLive) => {
            this.map.setTrains(trains);
            this._updateTrainCount();
            this._showDataSource(isLive);
        };

        this._showStatus(this.data.isLive
            ? `Live: ${trains.length} trains loaded`
            : `Simulated: ${trains.length} trains`
        );
        this._showDataSource(this.data.isLive);

        // Initial render
        this.map.render();
    }

    async start() {
        if (this.isPlaying) return;
        await this.audio.init();
        await this.audio.resume();
        this.isPlaying = true;
        this.data.startPolling();
        document.getElementById('play-btn').textContent = '⏸ Pause';
        document.getElementById('play-btn').classList.add('active');
        this._loop();
    }

    stop() {
        this.isPlaying = false;
        this.audio.suspend();
        this.data.stopPolling();
        document.getElementById('play-btn').textContent = '▶ Play';
        document.getElementById('play-btn').classList.remove('active');
        if (this._animFrame) cancelAnimationFrame(this._animFrame);
    }

    toggle() {
        this.isPlaying ? this.stop() : this.start();
    }

    _loop() {
        if (!this.isPlaying) return;

        // Advance beam
        this.beamLon += this.beamSpeed;

        // Wrap beam and reset triggers
        if (this.beamLon > 2.5) {
            this.beamLon = -7.0;
            this.triggeredThisSweep.clear();
            this.sweepCount++;
            this.audio.advanceChord();
        }

        // Check for trains in beam path
        this.data.trains.forEach(train => {
            if (this.triggeredThisSweep.has(train.rid)) return;
            if (Math.abs(train.lon - this.beamLon) < this.beamWidth) {
                this.triggeredThisSweep.add(train.rid);
                this.audio.playTrain(train);
                this.map.addTrigger(train);
            }
        });

        // Update visualization
        this.map.setBeamPosition(this.beamLon);
        this.map.analyserData = this.audio.getAnalyserData();
        this.map.render();

        // Update sweep counter
        document.getElementById('sweep-count').textContent = this.sweepCount;

        this._animFrame = requestAnimationFrame(() => this._loop());
    }

    _bindUI() {
        document.getElementById('play-btn').addEventListener('click', () => this.toggle());

        // Volume
        const volumeSlider = document.getElementById('volume');
        volumeSlider.addEventListener('input', (e) => {
            this.audio.volume = parseFloat(e.target.value);
            document.getElementById('volume-val').textContent = Math.round(e.target.value * 100) + '%';
        });

        // Tempo (beam speed)
        const tempoSlider = document.getElementById('tempo');
        tempoSlider.addEventListener('input', (e) => {
            this.beamSpeed = parseFloat(e.target.value);
            document.getElementById('tempo-val').textContent = this._tempoLabel(e.target.value);
        });

        // Reverb
        const reverbSlider = document.getElementById('reverb');
        reverbSlider.addEventListener('input', (e) => {
            this.audio.reverbMix = parseFloat(e.target.value);
            document.getElementById('reverb-val').textContent = Math.round(e.target.value * 100) + '%';
        });

        // Retry live data button
        document.getElementById('retry-live').addEventListener('click', async () => {
            this._showStatus('Retrying live data...');
            await this.data.fetchLiveData();
            if (this.data.isLive) {
                this.map.setTrains(this.data.trains);
                this._updateTrainCount();
                this._showStatus(`Live: ${this.data.trains.length} trains`);
            } else {
                this._showStatus('Live data unavailable, using simulation');
            }
            this._showDataSource(this.data.isLive);
        });

        // Regenerate simulated data
        document.getElementById('regen-btn').addEventListener('click', () => {
            this.data.loadSimulated();
            this.map.setTrains(this.data.trains);
            this._updateTrainCount();
            this.triggeredThisSweep.clear();
            this._showStatus(`Regenerated ${this.data.trains.length} simulated trains`);
        });
    }

    _tempoLabel(speed) {
        const s = parseFloat(speed);
        if (s < 0.01) return 'Glacial';
        if (s < 0.02) return 'Slow';
        if (s < 0.04) return 'Medium';
        if (s < 0.07) return 'Fast';
        return 'Rapid';
    }

    _showStatus(msg) {
        document.getElementById('status').textContent = msg;
    }

    _showDataSource(isLive) {
        const el = document.getElementById('data-source');
        el.textContent = isLive ? '● LIVE' : '○ SIMULATED';
        el.className = isLive ? 'live' : 'simulated';
    }

    _updateTrainCount() {
        document.getElementById('train-count').textContent = this.data.trains.length;
    }
}

// Boot
const app = new TrainSynth();
app.init();
