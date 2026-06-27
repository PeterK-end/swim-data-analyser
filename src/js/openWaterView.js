// Open-water (GPS) editor: renders the swim track on an OpenStreetMap map,
// colored by speed, and offers tools to fix speed-based coloring (auto-clamp
// outliers, set speed on a selected segment) and to cut parts of the track.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../css/openWaterView.css';
import { getItem, saveItem } from './storage.js';
import { encodeFit, downloadBlob } from './fitExport.js';
import { toGpx } from './gpxExport.js';
import * as Units from './units.js';
import {
    recSpeed, recLatLng, loadTrackPoints, haversine, speedBounds,
    speedToColor, formatDuration, paceSecondsToSpeed, lapStartPointIndices,
    formatPace as fmtPace, paceUnitLabel as paceUnit,
} from './openWaterShared.js';

// Thin wrappers that inject the current session into the shared pace helpers.
const formatPace = speed => fmtPace(speed, session());
const paceUnitLabel = () => paceUnit(session());

// Module state. `data` is the live modifiedData object; `points` is the subset
// of recordMesgs that carry a GPS position, in order, each keeping a reference
// to the underlying record so edits mutate `data` directly.
const G = {
    data: null,
    points: [],
    selStart: 0,
    selEnd: 0,
};

let map = null;
let trackLayer = null;       // base colored track
let selectionLayer = null;   // highlight of the selected segment
let listenersAttached = false;
let clampLow = null;         // lower speed cutoff in the clamp histogram (m/s)
let clampHigh = null;        // upper speed cutoff in the clamp histogram (m/s)
let clampMax = 1;            // data max speed (x-axis scale of the histogram)
let selCasing = null;        // selection halo polyline
let startHandle = null;      // draggable selection handles
let endHandle = null;
let nextClickSetsEnd = false; // map clicks alternate start/end (first sets start)
let mapClickBound = false;

// ---------- helpers ----------

function session() {
    return G.data?.sessionMesgs?.[0];
}

// Parses a pace string ("m:ss" or seconds) back into speed (m/s).
function parsePaceToSpeed(text) {
    const m = String(text).trim().match(/^(\d+):(\d{1,2})$/);
    let secs;
    if (m) secs = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    else secs = parseFloat(text);
    if (!secs || secs <= 0 || Number.isNaN(secs)) return NaN;
    return paceSecondsToSpeed(secs, session());
}

function loadPoints() {
    G.points = loadTrackPoints(G.data);
}

function selRange() {
    return [Math.min(G.selStart, G.selEnd), Math.max(G.selStart, G.selEnd)];
}

// ---------- rendering ----------

function drawTrack() {
    trackLayer.clearLayers();
    const { min, max } = speedBounds(G.points);
    const pts = G.points;

    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const speed = recSpeed(b.rec);
        const color = speedToColor(speed, min, max);
        L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
            color,
            weight: 5,
            opacity: 1,
        })
            .bindTooltip(`${formatPace(speed)} ${paceUnitLabel()}`, { sticky: true })
            .addTo(trackLayer);
    }

    if (pts.length) {
        L.circleMarker([pts[0].lat, pts[0].lng], {
            radius: 6, color: '#1a7f37', fillColor: '#1a7f37', fillOpacity: 1,
        }).bindTooltip('Start').addTo(trackLayer);
        L.circleMarker([pts.at(-1).lat, pts.at(-1).lng], {
            radius: 6, color: '#b91c1c', fillColor: '#b91c1c', fillOpacity: 1,
        }).bindTooltip('End').addTo(trackLayer);
    }

    drawLapMarkers();
    renderLegend(min, max);
    renderMetadata();
}

// Whole-workout totals (distance, elapsed time, average speed) from the live
// data. Shared by the metadata strip and the set-pace default.
function workoutTotals() {
    const s = session() || {};
    const recs = G.data.recordMesgs || [];
    const times = recs
        .map(r => (r.timestamp instanceof Date ? r.timestamp.getTime() : new Date(r.timestamp).getTime()))
        .filter(n => !Number.isNaN(n));
    const totalTime = times.length >= 2 ? (Math.max(...times) - Math.min(...times)) / 1000 : (s.totalElapsedTime || 0);

    let dist = s.totalDistance;
    if (dist == null) {
        dist = 0;
        for (let i = 0; i < G.points.length - 1; i++) {
            dist += haversine(G.points[i].lat, G.points[i].lng, G.points[i + 1].lat, G.points[i + 1].lng);
        }
    }
    return { times, totalTime, dist, avgSpeed: totalTime > 0 ? dist / totalTime : 0 };
}

// Renders swim metadata (distance, time, pace, …) above the map. Recomputed
// from the live data so it reflects edits.
function renderMetadata() {
    const el = document.getElementById('owMetadata');
    if (!el) return;
    const s = session() || {};
    const { times, totalTime, dist, avgSpeed } = workoutTotals();

    const speeds = G.points.map(p => recSpeed(p.rec));
    const bestSpeed = speeds.length ? Math.max(...speeds) : 0;
    const unit = Units.getUnitLabel(s);
    const dispDist = Units.toDisplayDistance(dist, s);

    const dateMs = s.timestamp ? new Date(s.timestamp).getTime() : (times.length ? Math.min(...times) : NaN);
    const date = Number.isNaN(dateMs) ? null : new Date(dateMs);
    const dateStr = date
        ? `${date.toLocaleDateString('en-CA')} ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
        : '–';

    const box = (label, value) => `
      <div class="metadata-box"><strong>${label}</strong><span>${value}</span></div>`;
    const boxes = [
        box('Workout Date:', dateStr),
        box('Type:', 'Open Water'),
        box('Total Distance:', `${Math.round(dispDist)}${unit}`),
        box('Total Time:', formatDuration(totalTime)),
        box('Avg. Pace:', `${formatPace(avgSpeed)}${paceUnitLabel()}`),
        box('Best Pace:', `${formatPace(bestSpeed)}${paceUnitLabel()}`),
    ];
    if (s.avgHeartRate != null) boxes.push(box('Avg. Heartrate', `${s.avgHeartRate} bpm`));
    if (s.totalCalories != null) boxes.push(box('Calories', `${s.totalCalories} kcal`));

    el.innerHTML = `<div class="metadata-flex">${boxes.join('')}</div>`;
}

// Flags where each lap begins (skips lap 1 = the track start).
function drawLapMarkers() {
    const starts = lapStartPointIndices(G.points, G.data.lapMesgs);
    starts.forEach((idx, i) => {
        if (i === 0 || idx <= 0 || idx >= G.points.length) return;
        const p = G.points[idx];
        L.marker([p.lat, p.lng], {
            icon: L.divIcon({ className: 'ow-lap-flag', html: `${i + 1}`, iconSize: [20, 20], iconAnchor: [10, 10] }),
        }).bindTooltip(`Lap ${i + 1} start`).addTo(trackLayer);
    });
}


// Index of the track point nearest to a lat/lng (planar distance is fine here).
function nearestPointIndex(latlng) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < G.points.length; i++) {
        const d = (G.points[i].lat - latlng.lat) ** 2 + (G.points[i].lng - latlng.lng) ** 2;
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

function updateCasing() {
    const [a, b] = selRange();
    const seg = G.points.slice(a, b + 1).map(p => [p.lat, p.lng]);
    // White casing UNDER the colored track (lower pane): speed colors stay
    // visible while the selected stretch is haloed.
    if (!selCasing) {
        selCasing = L.polyline(seg, {
            pane: 'owSelectionPane',
            color: '#ffffff',
            weight: 13,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
        }).addTo(selectionLayer);
    } else {
        selCasing.setLatLngs(seg);
    }
}

function ensureHandles() {
    if (startHandle) return;
    const icon = L.divIcon({ className: 'ow-handle', iconSize: [18, 18], iconAnchor: [9, 9] });
    const make = which => {
        const m = L.marker([0, 0], { draggable: true, icon, zIndexOffset: 1000 });
        m.on('drag', () => {
            const idx = nearestPointIndex(m.getLatLng());
            if (which === 'start') G.selStart = idx; else G.selEnd = idx;
            updateCasing();
        });
        m.on('dragend', () => {
            const idx = which === 'start' ? G.selStart : G.selEnd;
            const p = G.points[idx];
            if (p) m.setLatLng([p.lat, p.lng]); // snap to the track point
        });
        return m.addTo(selectionLayer);
    };
    startHandle = make('start');
    endHandle = make('end');
}

function drawSelection() {
    if (!G.points.length) return;
    ensureHandles();
    // Handles keep their identity (start/end) even if the range crosses over.
    startHandle.setLatLng([G.points[G.selStart].lat, G.points[G.selStart].lng]);
    endHandle.setLatLng([G.points[G.selEnd].lat, G.points[G.selEnd].lng]);
    updateCasing();
}

function renderLegend(min, max) {
    const el = document.getElementById('owLegend');
    if (!el) return;
    const stops = 6;
    const swatches = [];
    // Walk fast -> slow so the pace labels read low (fast) to high (slow).
    for (let i = 0; i < stops; i++) {
        const t = 1 - i / (stops - 1);
        const speed = min + t * (max - min);
        swatches.push(
            `<span class="ow-legend-item">` +
            `<span class="ow-legend-swatch" style="background:${speedToColor(speed, min, max)}"></span>` +
            `${formatPace(speed)}</span>`
        );
    }
    el.innerHTML = `<span class="ow-legend-label">Pace (${paceUnitLabel()}):</span> ${swatches.join('')}`;
}


// Keeps the selection indices within the valid point range.
function clampSelection() {
    const maxIdx = Math.max(G.points.length - 1, 0);
    G.selStart = Math.min(Math.max(G.selStart, 0), maxIdx);
    G.selEnd = Math.min(Math.max(G.selEnd, 0), maxIdx);
}

// ---------- edit operations ----------

async function persist() {
    await saveItem('modifiedData', G.data);
}

// Recomputes cumulative record distance (and session total) from positions.
function recomputeDistances() {
    let cumulative = 0;
    let prev = null;
    (G.data.recordMesgs || []).forEach(rec => {
        const ll = recLatLng(rec);
        if (ll) {
            if (prev) cumulative += haversine(prev[0], prev[1], ll[0], ll[1]);
            prev = ll;
        }
        if (rec.distance != null) rec.distance = Math.round(cumulative * 100) / 100;
    });
    const session = G.data.sessionMesgs?.[0];
    if (session && session.totalDistance != null) {
        session.totalDistance = Math.round(cumulative * 100) / 100;
    }
}

// Clamps every record speed into the [clampLow, clampHigh] range (m/s).
async function clampSpeed(low, high) {
    const apply = v => Math.min(Math.max(v, low), high);
    G.data.recordMesgs?.forEach(rec => {
        if (rec.enhancedSpeed != null) rec.enhancedSpeed = apply(rec.enhancedSpeed);
        if (rec.speed != null) rec.speed = apply(rec.speed);
    });
    await persist();
    drawTrack();
    drawSelection();
}

// Draws a speed histogram on the clamp-modal canvas; bars outside
// [clampLow, clampHigh] are marked as "to be clamped".
function drawHistogram() {
    const canvas = document.getElementById('owHistCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const speeds = G.points.map(p => recSpeed(p.rec)).filter(s => s > 0);
    if (!speeds.length) return;
    const max = clampMax || Math.max(...speeds);
    if (max <= 0) return;

    const bins = 40;
    const counts = new Array(bins).fill(0);
    speeds.forEach(s => {
        let b = Math.floor((s / max) * bins);
        if (b >= bins) b = bins - 1;
        counts[b]++;
    });
    const maxCount = Math.max(...counts);
    const bw = W / bins;

    for (let i = 0; i < bins; i++) {
        const binSpeed = ((i + 0.5) / bins) * max;
        const bh = (counts[i] / maxCount) * (H - 6);
        ctx.fillStyle = (binSpeed < clampLow || binSpeed > clampHigh)
            ? 'rgba(150, 30, 30, 0.55)'
            : speedToColor(binSpeed, 0, max);
        ctx.fillRect(i * bw, H - bh, Math.max(bw - 1, 1), bh);
    }

    // cutoff lines
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    for (const t of [clampLow, clampHigh]) {
        const tx = (t / max) * W;
        ctx.beginPath();
        ctx.moveTo(tx, 0);
        ctx.lineTo(tx, H);
        ctx.stroke();
    }
}

function updateClampReadout() {
    const el = document.getElementById('owClampReadout');
    if (!el) return;
    const affected = G.points.filter(p => {
        const s = recSpeed(p.rec);
        return s < clampLow || s > clampHigh;
    }).length;
    el.textContent =
        `Keep ${formatPace(clampHigh)}–${formatPace(clampLow)} ${paceUnitLabel()} ` +
        `(${clampLow.toFixed(2)}–${clampHigh.toFixed(2)} m/s) — ${affected} point(s) clamped`;
}

// Maps a clientX over the histogram canvas to a speed value (m/s).
function histSpeedAt(clientX) {
    const canvas = document.getElementById('owHistCanvas');
    const rect = canvas.getBoundingClientRect();
    const frac = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return frac * clampMax;
}

function attachHistogramHandlers() {
    const canvas = document.getElementById('owHistCanvas');
    if (canvas.dataset.bound) return;
    canvas.dataset.bound = '1';
    let activeEdge = null; // 'low' | 'high' — the cutoff line being dragged
    const pickEdge = s => (Math.abs(s - clampLow) <= Math.abs(s - clampHigh) ? 'low' : 'high');
    const moveEdge = s => {
        if (activeEdge === 'low') clampLow = Math.min(Math.max(s, 0), clampHigh);
        else clampHigh = Math.max(Math.min(s, clampMax), clampLow);
        drawHistogram();
        updateClampReadout();
    };
    canvas.addEventListener('mousedown', e => {
        const s = histSpeedAt(e.clientX);
        activeEdge = pickEdge(s); // grab the nearer cutoff line
        moveEdge(s);
    });
    window.addEventListener('mousemove', e => {
        if (!activeEdge) return;
        moveEdge(histSpeedAt(e.clientX));
    });
    window.addEventListener('mouseup', () => { activeEdge = null; });
}

function openClampModal() {
    const speeds = G.points.map(p => recSpeed(p.rec)).filter(s => s > 0);
    clampMax = speeds.length ? Math.max(...speeds) : 1;
    clampLow = 0;
    clampHigh = clampMax;
    showModal('owClampModal');
    attachHistogramHandlers();
    drawHistogram();
    updateClampReadout();
}

// Opens the set-pace modal, defaulting to the whole-workout average pace (the
// same value shown in the metadata strip) — so applying it neutralizes the
// selected segment's influence on the average.
function openSpeedModal() {
    const avg = workoutTotals().avgSpeed;
    const input = document.getElementById('owSpeedInput');
    if (avg > 0) input.value = formatPace(avg);
    showModal('owSpeedModal');
}

async function setSpeed(value) {
    const [a, b] = selRange();
    for (let i = a; i <= b; i++) {
        const rec = G.points[i]?.rec;
        if (!rec) continue;
        if (rec.enhancedSpeed != null || rec.speed == null) rec.enhancedSpeed = value;
        if (rec.speed != null) rec.speed = value;
    }
    await persist();
    drawTrack();
    drawSelection();
}

async function cutSelection() {
    const [a, b] = selRange();
    const toRemove = new Set(G.points.slice(a, b + 1).map(p => p.rec));
    if (toRemove.size === 0) return;
    G.data.recordMesgs = (G.data.recordMesgs || []).filter(rec => !toRemove.has(rec));
    recomputeDistances();
    await persist();
    loadPoints();
    G.selStart = G.selEnd = Math.min(a, Math.max(G.points.length - 1, 0));
    clampSelection();
    fitBounds();
    drawTrack();
    drawSelection();
}

async function undoAll() {
    const original = await getItem('originalData');
    if (!original) return;
    // structuredClone so subsequent edits don't mutate the stored original
    G.data = structuredClone(original);
    await persist();
    loadPoints();
    G.selStart = 0;
    G.selEnd = Math.max(G.points.length - 1, 0);
    clampSelection();
    fitBounds();
    drawTrack();
    drawSelection();
}

async function exportAs(format) {
    const baseName = ((await getItem('originalFileName')) || 'activity.fit')
        .replace(/\.[^.]+$/, '') + '_NEW';
    if (format === 'gpx') {
        downloadBlob(toGpx(G.data), `${baseName}.gpx`, 'application/gpx+xml');
    } else if (format === 'fit') {
        const mesgDefinitions = await getItem('mesgDefinitions');
        const fieldDescriptions = await getItem('fieldDescriptions');
        const bytes = encodeFit(G.data, mesgDefinitions, fieldDescriptions);
        downloadBlob(bytes, `${baseName}.fit`, 'application/octet-stream');
    }
}

// ---------- wiring ----------

function showModal(id) { document.getElementById(id).style.display = 'block'; }
function hideModal(id) { document.getElementById(id).style.display = 'none'; }

function attachListeners() {
    if (listenersAttached) return;
    listenersAttached = true;

    document.getElementById('owClampBtn').addEventListener('click', openClampModal);
    document.getElementById('owClampCancel').addEventListener('click', () => hideModal('owClampModal'));
    document.getElementById('owClampConfirm').addEventListener('click', async () => {
        hideModal('owClampModal');
        if (clampLow != null && clampHigh != null) await clampSpeed(clampLow, clampHigh);
    });

    document.getElementById('owSetSpeedBtn').addEventListener('click', openSpeedModal);
    document.getElementById('owSpeedCancel').addEventListener('click', () => hideModal('owSpeedModal'));
    document.getElementById('owSpeedConfirm').addEventListener('click', async () => {
        const v = parsePaceToSpeed(document.getElementById('owSpeedInput').value);
        hideModal('owSpeedModal');
        if (!Number.isNaN(v)) await setSpeed(v);
    });

    document.getElementById('owCutBtn').addEventListener('click', cutSelection);
    document.getElementById('owUndoBtn').addEventListener('click', undoAll);

    document.getElementById('owExportBtn').addEventListener('click', () => showModal('owExportModal'));
    document.getElementById('owExportCancel').addEventListener('click', () => hideModal('owExportModal'));
    document.getElementById('owExportConfirm').addEventListener('click', async () => {
        const fmt = document.getElementById('owExportSelect').value;
        hideModal('owExportModal');
        await exportAs(fmt);
    });
}

function initMap() {
    if (map) return;
    map = L.map('owMap');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    // A pane below the default overlay (zIndex 400) so the selection halo is
    // drawn beneath the colored track instead of covering it.
    map.createPane('owSelectionPane');
    map.getPane('owSelectionPane').style.zIndex = 350;
    trackLayer = L.layerGroup().addTo(map);
    selectionLayer = L.layerGroup().addTo(map);

    // Clicking the map sets a selection endpoint at the nearest track point,
    // alternating start/end so you never have to find the handles. (Clicks on
    // the draggable handle markers don't reach the map, so dragging still works.)
    if (!mapClickBound) {
        map.on('click', e => {
            if (!G.points.length) return;
            const idx = nearestPointIndex(e.latlng);
            if (nextClickSetsEnd) G.selEnd = idx; else G.selStart = idx;
            nextClickSetsEnd = !nextClickSetsEnd;
            drawSelection();
        });
        mapClickBound = true;
    }
}

function fitBounds() {
    if (!G.points.length) return;
    map.fitBounds(L.latLngBounds(G.points.map(p => [p.lat, p.lng])), { padding: [20, 20] });
}

// Entry point called from upload.js when an open-water activity is loaded.
export async function render() {
    G.data = await getItem('modifiedData');
    if (!G.data) return;

    // Show the open-water editor, hide the pool editor.
    const owEditor = document.getElementById('openWaterEditor');
    const poolEditor = document.getElementById('editPlot');
    const metadata = document.getElementById('metadata-container');
    const poolHint = document.getElementById('poolEditHint');
    if (poolEditor) poolEditor.style.display = 'none';
    if (metadata) metadata.style.display = 'none';
    if (poolHint) poolHint.style.display = 'none';
    if (owEditor) owEditor.style.display = 'block';

    loadPoints();
    G.selStart = 0;
    G.selEnd = Math.max(G.points.length - 1, 0);
    nextClickSetsEnd = false;

    initMap();
    attachListeners();
    clampSelection();
    // Map was hidden during init; recompute its size now that it's visible.
    map.invalidateSize();
    fitBounds();
    drawTrack();
    drawSelection();
}
