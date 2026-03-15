# 🚂 TrainSynth

**Sonify UK train positions into music.**

A scanning beam sweeps west→east across the UK map. When it crosses a train, a note plays — turning the entire railway network into a generative musical instrument.

### [▶ Try it live](https://bamyazi.github.io/TrainSynth/)

![TrainSynth Screenshot](https://img.shields.io/badge/Web_Audio-API-00ffc8?style=flat-square) ![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-f7df1e?style=flat-square) ![No Dependencies](https://img.shields.io/badge/Dependencies-0-brightgreen?style=flat-square)

---

## How It Works

| Parameter | Mapped From |
|-----------|-------------|
| **Pitch** | Latitude — northern trains play higher notes (C pentatonic, 3 octaves) |
| **Stereo Pan** | Longitude — west = left ear, east = right ear |
| **Timbre** | Train operator (TOC) — each has a unique waveform, filter type, and character |
| **Detune** | Delay — late trains sound more dissonant |

## Audio Features

- **Per-operator voices** — 10 UK train operators each get a distinct synth voice with custom waveform, filter type (lowpass/bandpass/highpass/notch/peaking), and optional TB-303-style filter sweep
- **Chorus** — detuned second oscillator on every note for thickness
- **Octave layers** — high sine shimmer (+1 oct) and warm triangle sub (-1 oct) accompany each note
- **Echo delay** — 250ms filtered delay with feedback
- **Convolution reverb** — synthetic impulse response for spacious ambient sound
- **Chord pads** — evolving C → F → Am → G progression, advancing each beam sweep
- **Drum machine** — synthesized kick, snare, and hi-hat in a 16-step pattern at 85 BPM

## Controls

- **Volume** — master output level
- **Sweep Speed** — how fast the beam crosses the map (Glacial → Rapid)
- **Reverb** — wet/dry mix for the convolution reverb
- **Retry Live** — attempt to connect to the Signalbox API for real train positions
- **Regenerate** — create a new set of simulated trains

## Data

Train positions come from the [Signalbox API](https://www.map.signalbox.io/). When the API is unavailable (e.g. due to CORS), the app generates ~80 simulated trains placed along real UK rail routes:

- West Coast Main Line (WCML)
- East Coast Main Line (ECML)
- Great Western Main Line
- CrossCountry corridor
- Midland Main Line
- And 5 more regional routes

## Tech Stack

- **Pure vanilla JS** — no frameworks, no build tools, no dependencies
- **Web Audio API** — all synthesis is real-time (oscillators, filters, convolution, delay)
- **Canvas 2D** — map rendering with UK coastline, train dots, scanning beam, and frequency spectrum
- **ES Modules** — clean modular architecture (`data.js`, `audio.js`, `map.js`, `app.js`)

## Run Locally

```powershell
cd TrainSynth
.\start.ps1
```

Or serve with any static file server:

```bash
python -m http.server 8090
# Open http://localhost:8090
```

## License

MIT
