// Canvas-based map visualization
// Renders UK outline, train positions, scanning beam, and audio waveform

// Simplified UK coastline (longitude, latitude pairs)
const UK_OUTLINE = [
    [-5.71, 50.07], [-5.04, 50.04], [-4.22, 50.37], [-3.64, 50.22],
    [-3.17, 50.69], [-2.97, 50.72], [-2.10, 50.73], [-1.64, 50.74],
    [-1.14, 50.81], [-0.76, 50.77], [0.12, 50.81], [0.96, 50.88],
    [1.38, 51.16], [1.42, 51.38], [0.87, 51.62], [0.72, 51.49],
    [0.38, 51.45], [0.29, 51.51], [0.70, 51.72], [1.02, 51.78],
    [1.73, 52.41], [1.75, 52.74], [1.15, 52.88], [0.50, 52.95],
    [0.16, 53.03], [0.07, 53.51], [-0.21, 53.72], [-0.36, 54.00],
    [-0.66, 54.49], [-1.18, 54.63], [-1.57, 55.06], [-1.64, 55.59],
    [-2.03, 55.81], [-1.96, 55.75], [-1.79, 55.64], [-2.01, 55.80],
    [-2.25, 56.08], [-2.72, 56.32], [-2.86, 56.41], [-3.31, 56.36],
    [-3.61, 56.47], [-3.36, 56.65], [-2.61, 56.60], [-2.09, 56.71],
    [-2.53, 56.79], [-3.07, 57.08], [-2.07, 57.70], [-3.38, 58.06],
    [-3.40, 58.51], [-5.01, 58.62], [-4.98, 58.44], [-5.27, 58.25],
    [-5.02, 57.85], [-5.68, 57.66], [-5.58, 57.42], [-5.16, 57.36],
    [-5.63, 57.23], [-5.69, 56.79], [-5.42, 56.75], [-5.20, 56.56],
    [-5.57, 56.49], [-5.81, 56.31], [-5.58, 56.13], [-5.10, 55.87],
    [-5.36, 55.68], [-5.40, 55.50], [-5.17, 55.43], [-4.82, 55.26],
    [-5.02, 55.33], [-5.14, 55.00], [-4.57, 54.82], [-3.99, 54.78],
    [-3.43, 54.87], [-3.24, 54.97], [-3.58, 54.62], [-3.40, 54.26],
    [-3.03, 53.94], [-2.91, 53.85], [-3.10, 53.56], [-3.06, 53.44],
    [-3.08, 53.26], [-3.07, 53.09], [-3.14, 53.01], [-3.42, 53.01],
    [-4.10, 52.91], [-4.76, 52.80], [-4.58, 52.62], [-4.13, 52.46],
    [-4.79, 52.19], [-5.10, 51.98], [-5.28, 51.87], [-5.26, 51.68],
    [-4.86, 51.63], [-4.36, 51.65], [-4.17, 51.67], [-3.76, 51.57],
    [-3.22, 51.55], [-2.98, 51.53], [-3.02, 51.38], [-3.62, 51.38],
    [-4.26, 51.33], [-4.65, 51.19], [-4.24, 51.08], [-4.24, 51.08],
    [-3.56, 51.04], [-3.20, 51.05], [-3.61, 50.76], [-4.00, 50.69],
    [-4.68, 50.54], [-5.06, 50.36], [-5.06, 50.04], [-5.71, 50.07]
];

// TOC color mapping (matches signalbox.io colors)
const TOC_COLORS = {
    VT: '#ff5100', GR: '#cc0000', GW: '#004bdd', XC: '#ee0000',
    NT: '#00c400', SR: '#00a200', SW: '#ff9d00', LE: '#00aa93',
    TP: '#ffb900', SE: '#3bff00', LM: '#00a668', ME: '#00b200',
    CH: '#770088', HT: '#009bd7', GC: '#0000c5', TW: '#f4e200',
    EM: '#83009a', SN: '#ccf900', TL: '#fdcf00', IL: '#6927A5'
};

export class MapView {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.trains = [];
        this.beamLon = -6.5;
        this.triggeredTrains = new Set();
        this.recentTriggers = []; // { train, time }
        this.analyserData = null;

        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.width = rect.width;
        this.height = rect.height;
    }

    // Map geo coordinates to canvas coordinates
    geoToCanvas(lon, lat) {
        const bounds = { minLat: 49.5, maxLat: 59.0, minLon: -7.0, maxLon: 2.5 };
        const mapWidth = this.width * 0.65;
        const mapHeight = this.height * 0.92;
        const mapX = this.width * 0.05;
        const mapY = this.height * 0.04;

        const x = mapX + ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * mapWidth;
        const y = mapY + (1 - (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * mapHeight;
        return { x, y };
    }

    setTrains(trains) {
        this.trains = trains;
    }

    setBeamPosition(lon) {
        this.beamLon = lon;
    }

    addTrigger(train) {
        this.recentTriggers.push({ train, time: performance.now() });
    }

    render() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const now = performance.now();

        // Clear
        ctx.fillStyle = '#0a0c14';
        ctx.fillRect(0, 0, w, h);

        // Draw subtle grid
        this._drawGrid(ctx, w, h);

        // Draw UK outline
        this._drawCoastline(ctx);

        // Draw trains
        this._drawTrains(ctx, now);

        // Draw scanning beam
        this._drawBeam(ctx, h);

        // Draw recent trigger flashes
        this._drawTriggerFlashes(ctx, now);

        // Draw waveform visualizer
        if (this.analyserData) {
            this._drawWaveform(ctx, w, h);
        }

        // Expire old triggers
        this.recentTriggers = this.recentTriggers.filter(t => now - t.time < 1500);
    }

    _drawGrid(ctx, w, h) {
        ctx.strokeStyle = 'rgba(40, 50, 80, 0.3)';
        ctx.lineWidth = 0.5;
        for (let lat = 50; lat <= 59; lat++) {
            const p = this.geoToCanvas(-6.5, lat);
            const p2 = this.geoToCanvas(2.0, lat);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p.y);
            ctx.stroke();
        }
        for (let lon = -6; lon <= 2; lon++) {
            const p = this.geoToCanvas(lon, 50);
            const p2 = this.geoToCanvas(lon, 59);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x, p2.y);
            ctx.stroke();
        }
    }

    _drawCoastline(ctx) {
        ctx.strokeStyle = 'rgba(80, 140, 200, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        UK_OUTLINE.forEach(([lon, lat], i) => {
            const { x, y } = this.geoToCanvas(lon, lat);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(20, 30, 50, 0.6)';
        ctx.fill();
        ctx.stroke();
    }

    _drawTrains(ctx, now) {
        this.trains.forEach(train => {
            const { x, y } = this.geoToCanvas(train.lon, train.lat);
            const color = TOC_COLORS[train.tocCode] || '#888888';
            const isTriggered = this.recentTriggers.some(t =>
                t.train.rid === train.rid && now - t.time < 500
            );

            if (isTriggered) {
                // Glow effect for triggered trains
                const alpha = 1 - (now - this.recentTriggers.find(t => t.train.rid === train.rid).time) / 500;
                ctx.beginPath();
                ctx.arc(x, y, 12 * alpha + 4, 0, Math.PI * 2);
                ctx.fillStyle = color + Math.floor(alpha * 99).toString(16).padStart(2, '0');
                ctx.fill();
            }

            // Train dot
            ctx.beginPath();
            ctx.arc(x, y, train.delay > 0 ? 3.5 : 2.5, 0, Math.PI * 2);
            ctx.fillStyle = train.delay > 5 ? '#ff4444' : color;
            ctx.fill();
        });
    }

    _drawBeam(ctx, h) {
        const { x: beamX } = this.geoToCanvas(this.beamLon, 54);
        const grad = ctx.createLinearGradient(beamX - 15, 0, beamX + 15, 0);
        grad.addColorStop(0, 'rgba(0, 255, 200, 0)');
        grad.addColorStop(0.4, 'rgba(0, 255, 200, 0.08)');
        grad.addColorStop(0.5, 'rgba(0, 255, 200, 0.35)');
        grad.addColorStop(0.6, 'rgba(0, 255, 200, 0.08)');
        grad.addColorStop(1, 'rgba(0, 255, 200, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(beamX - 15, 0, 30, h);

        // Beam center line
        ctx.strokeStyle = 'rgba(0, 255, 200, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(beamX, 0);
        ctx.lineTo(beamX, h);
        ctx.stroke();
    }

    _drawTriggerFlashes(ctx, now) {
        this.recentTriggers.forEach(({ train, time }) => {
            const elapsed = now - time;
            if (elapsed > 1500) return;
            const { x, y } = this.geoToCanvas(train.lon, train.lat);
            const alpha = Math.max(0, 1 - elapsed / 1500);
            const radius = 6 + elapsed / 50;

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 255, 200, ${alpha * 0.6})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });
    }

    _drawWaveform(ctx, w, h) {
        const data = this.analyserData;
        if (!data || data.length === 0) return;

        const barWidth = w / data.length;
        const vizY = h - 60;
        const vizHeight = 50;

        ctx.fillStyle = 'rgba(0, 255, 200, 0.03)';
        ctx.fillRect(0, vizY, w, vizHeight);

        for (let i = 0; i < data.length; i++) {
            const barH = (data[i] / 255) * vizHeight;
            const hue = 160 + (data[i] / 255) * 40;
            ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.6)`;
            ctx.fillRect(i * barWidth, vizY + vizHeight - barH, barWidth - 1, barH);
        }
    }
}
