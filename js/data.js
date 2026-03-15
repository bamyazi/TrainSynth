// Train data fetching and simulation
// Attempts to fetch live data from signalbox.io API, falls back to simulated UK trains

const API_BASE = 'https://api.signalbox.io';

// Major UK rail routes (approximate coordinates for simulation)
const UK_ROUTES = [
    // WCML: London Euston → Birmingham → Manchester → Glasgow
    { name: 'WCML', toc: 'VT', points: [
        [51.528, -0.134], [52.056, -1.156], [52.479, -1.899], [52.681, -2.157],
        [53.087, -2.432], [53.378, -2.233], [53.477, -2.248], [53.755, -2.709],
        [54.313, -2.776], [54.893, -2.938], [55.860, -4.258]
    ]},
    // ECML: London King's Cross → Peterborough → York → Edinburgh
    { name: 'ECML', toc: 'GR', points: [
        [51.532, -0.124], [51.897, -0.182], [52.575, -0.248], [53.090, -0.540],
        [53.596, -0.871], [53.958, -1.093], [54.305, -1.534], [54.779, -1.578],
        [55.254, -1.609], [55.952, -3.189]
    ]},
    // GWR: London Paddington → Reading → Bristol → Cardiff
    { name: 'GWR', toc: 'GW', points: [
        [51.516, -0.176], [51.458, -0.372], [51.460, -0.971], [51.430, -1.321],
        [51.377, -1.858], [51.375, -2.258], [51.449, -2.581], [51.476, -3.179]
    ]},
    // CrossCountry: Edinburgh → York → Birmingham → Bristol/Southampton
    { name: 'XC', toc: 'XC', points: [
        [55.952, -3.189], [54.779, -1.578], [53.958, -1.093], [53.382, -1.470],
        [52.842, -1.297], [52.479, -1.899], [52.193, -1.829], [51.880, -1.751],
        [51.449, -2.581], [51.377, -2.358], [50.905, -1.404]
    ]},
    // Northern routes
    { name: 'Northern', toc: 'NT', points: [
        [53.477, -2.248], [53.483, -2.065], [53.540, -1.800], [53.592, -1.568],
        [53.645, -1.430], [53.799, -1.548]
    ]},
    // ScotRail
    { name: 'ScotRail', toc: 'SR', points: [
        [55.860, -4.258], [55.873, -4.069], [55.934, -3.586], [55.952, -3.189],
        [56.116, -3.170], [56.392, -3.437], [56.467, -2.970]
    ]},
    // South Western Railway
    { name: 'SWR', toc: 'SW', points: [
        [51.503, -0.113], [51.413, -0.300], [51.318, -0.476], [51.243, -0.588],
        [51.066, -1.319], [50.905, -1.404], [50.720, -1.880]
    ]},
    // Greater Anglia
    { name: 'GA', toc: 'LE', points: [
        [51.518, -0.081], [51.585, 0.011], [51.733, 0.183], [51.881, 0.438],
        [51.987, 0.752], [52.189, 0.952], [52.630, 1.170], [52.631, 1.299]
    ]},
    // TransPennine Express
    { name: 'TPE', toc: 'TP', points: [
        [53.750, -2.485], [53.590, -2.098], [53.477, -2.248], [53.477, -1.920],
        [53.592, -1.568], [53.799, -1.548], [53.867, -1.283], [53.960, -1.093]
    ]},
    // Southeastern
    { name: 'SE', toc: 'SE', points: [
        [51.504, -0.087], [51.479, -0.019], [51.441, 0.069], [51.389, 0.173],
        [51.350, 0.296], [51.278, 0.523], [51.272, 1.078]
    ]}
];

const TOC_NAMES = {
    VT: 'Avanti West Coast', GR: 'LNER', GW: 'GWR', XC: 'CrossCountry',
    NT: 'Northern', SR: 'ScotRail', SW: 'South Western', LE: 'Greater Anglia',
    TP: 'TransPennine', SE: 'Southeastern', LM: 'West Midlands', ME: 'Merseyrail',
    CH: 'Chiltern', HT: 'Hull Trains', GC: 'Grand Central', TW: 'TfW',
    EM: 'East Midlands', SN: 'Southern', TL: 'Thameslink', IL: 'Elizabeth Line'
};

function generateSimulatedTrains(count = 80) {
    const trains = [];
    for (let i = 0; i < count; i++) {
        const route = UK_ROUTES[Math.floor(Math.random() * UK_ROUTES.length)];
        const segIndex = Math.floor(Math.random() * (route.points.length - 1));
        const t = Math.random();
        const p1 = route.points[segIndex];
        const p2 = route.points[segIndex + 1];
        const lat = p1[0] + (p2[0] - p1[0]) * t;
        const lon = p1[1] + (p2[1] - p1[1]) * t;
        const heading = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * (180 / Math.PI);
        const delay = Math.random() < 0.7 ? 0 : Math.floor(Math.random() * 30);

        trains.push({
            rid: `SIM${String(i).padStart(4, '0')}`,
            lat, lon,
            heading: (heading + 360) % 360,
            delay,
            tocCode: route.toc,
            tocName: TOC_NAMES[route.toc] || route.name,
            routeName: route.name
        });
    }
    return trains;
}

// Convert API response format to our internal format
function parseApiTrains(data) {
    if (!data || !data.train_locations) return null;
    return data.train_locations.map(t => ({
        rid: t.rid,
        lat: t.lat || (t.location && t.location.lat),
        lon: t.lon || (t.location && t.location.lon),
        heading: t.heading || 0,
        delay: t.delay || 0,
        tocCode: t.tocCode || 'ZZ',
        tocName: TOC_NAMES[t.tocCode] || t.tocCode || 'Unknown'
    })).filter(t => t.lat && t.lon);
}

export class TrainDataManager {
    constructor() {
        this.trains = [];
        this.isLive = false;
        this.lastFetch = 0;
        this.fetchInterval = 15000; // 15 seconds between fetches
        this.onUpdate = null;
        this._polling = false;
    }

    async fetchLiveData() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(`${API_BASE}/api/locations`, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(timeout);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const trains = parseApiTrains(data);
            if (trains && trains.length > 0) {
                this.trains = trains;
                this.isLive = true;
                this.lastFetch = Date.now();
                return true;
            }
            throw new Error('No train data');
        } catch (e) {
            console.warn('Live data unavailable, using simulation:', e.message);
            return false;
        }
    }

    loadSimulated() {
        this.trains = generateSimulatedTrains(80);
        this.isLive = false;
        this.lastFetch = Date.now();
    }

    async init() {
        const live = await this.fetchLiveData();
        if (!live) this.loadSimulated();
        if (this.onUpdate) this.onUpdate(this.trains, this.isLive);
        return this.trains;
    }

    startPolling() {
        if (this._polling) return;
        this._polling = true;
        this._poll();
    }

    async _poll() {
        if (!this._polling) return;
        const now = Date.now();
        if (now - this.lastFetch >= this.fetchInterval) {
            if (this.isLive) {
                await this.fetchLiveData();
            } else {
                // Gently drift simulated trains
                this.trains = this.trains.map(t => ({
                    ...t,
                    lat: t.lat + (Math.random() - 0.5) * 0.005,
                    lon: t.lon + (Math.random() - 0.5) * 0.005,
                    delay: Math.random() < 0.05 ? Math.floor(Math.random() * 20) : t.delay
                }));
                this.lastFetch = now;
            }
            if (this.onUpdate) this.onUpdate(this.trains, this.isLive);
        }
        setTimeout(() => this._poll(), 2000);
    }

    stopPolling() {
        this._polling = false;
    }

    // Get UK geographic bounds
    static get bounds() {
        return { minLat: 50.0, maxLat: 58.5, minLon: -6.5, maxLon: 2.0 };
    }
}
