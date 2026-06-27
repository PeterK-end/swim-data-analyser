// Open-water analyse view: a read-only speed-colored map plus an interactive
// metric profile (pace / heart rate / cadence / speed). Hovering the chart moves
// a marker on the map, and hovering the map scrubs the chart — OSMand-style.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../css/openWaterView.css';
import Plotly from 'plotly.js-basic-dist-min';
import { getItem } from './storage.js';
import {
    recSpeed, loadTrackPoints, speedBounds, speedToColor,
    formatPace, paceUnitLabel, formatDuration, cumulativeDistances,
    lapStats, lapStartPointIndices,
    strokeChanges, strokeSegments, strokeStats, strokeName, strokeColor, strokeClass,
} from './openWaterShared.js';
import * as Units from './units.js';

const A = {
    data: null,
    points: [],
    dist: [],        // cumulative distance per point (m)
    metric: 'pace',
};

let map = null;
let trackLayer = null;
let marker = null;
let chartReady = false;

function session() {
    return A.data?.sessionMesgs?.[0];
}

// ---------- metric definitions ----------

// Each metric maps a record/point to a y-value plus presentation info.
function availableMetrics() {
    const recs = A.points.map(p => p.rec);
    const has = key => recs.some(r => r[key] != null);
    const metrics = {
        pace: {
            label: 'Pace',
            unit: paceUnitLabel(session()),
            reversed: true, // faster (lower pace) shown higher
            value: p => {
                const s = Units.getPaceSeconds(recSpeed(p.rec), session());
                return s > 0 ? s : null;
            },
            fmt: v => (v == null ? '–' : `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`),
        },
        speed: {
            label: 'Speed',
            unit: 'm/s',
            value: p => recSpeed(p.rec),
            fmt: v => (v == null ? '–' : v.toFixed(2)),
        },
    };
    if (has('heartRate')) {
        metrics.heartRate = {
            label: 'Heart rate', unit: 'bpm',
            value: p => p.rec.heartRate ?? null,
            fmt: v => (v == null ? '–' : `${Math.round(v)}`),
        };
    }
    if (has('cadence')) {
        metrics.cadence = {
            label: 'Cadence', unit: 'spm',
            value: p => (p.rec.cadence != null ? p.rec.cadence + (p.rec.fractionalCadence || 0) : null),
            fmt: v => (v == null ? '–' : `${Math.round(v)}`),
        };
    }
    return metrics;
}

// ---------- map ----------

function initMap() {
    if (map) return;
    map = L.map('owAnalyseMap');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    trackLayer = L.layerGroup().addTo(map);
    marker = L.circleMarker([0, 0], {
        radius: 8, color: '#111', weight: 3, fillColor: '#fff', fillOpacity: 1,
    });
}

function drawTrack() {
    trackLayer.clearLayers();
    const { min, max } = speedBounds(A.points);
    const pts = A.points;
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
            color: speedToColor(recSpeed(b.rec), min, max),
            weight: 5,
            opacity: 1,
        }).addTo(trackLayer);
    }
    if (pts.length) {
        L.circleMarker([pts[0].lat, pts[0].lng], {
            radius: 6, color: '#1a7f37', fillColor: '#1a7f37', fillOpacity: 1,
        }).bindTooltip('Start').addTo(trackLayer);
        L.circleMarker([pts.at(-1).lat, pts.at(-1).lng], {
            radius: 6, color: '#b91c1c', fillColor: '#b91c1c', fillOpacity: 1,
        }).bindTooltip('End').addTo(trackLayer);
    }
    // Lap boundary flags (skip lap 1 = start).
    lapStartPointIndices(pts, A.data.lapMesgs).forEach((idx, i) => {
        if (i === 0 || idx <= 0 || idx >= pts.length) return;
        const p = pts[idx];
        L.marker([p.lat, p.lng], {
            icon: L.divIcon({ className: 'ow-lap-flag', html: `${i + 1}`, iconSize: [20, 20], iconAnchor: [10, 10] }),
        }).bindTooltip(`Lap ${i + 1} start`).addTo(trackLayer);
    });
    // Stroke-change markers (skip the first = swim start).
    strokeSegments(A.data, pts).forEach((seg, i) => {
        if (i === 0) return;
        const p = pts[seg.startIdx];
        if (!p) return;
        L.marker([p.lat, p.lng], {
            icon: L.divIcon({
                className: 'ow-stroke-flag',
                html: `<span style="background:${strokeColor(seg.stroke)}">${strokeName(seg.stroke)[0]}</span>`,
                iconSize: [18, 18], iconAnchor: [9, 9],
            }),
        }).bindTooltip(`${strokeName(seg.stroke)} from here`).addTo(trackLayer);
    });
    renderLegend(min, max);
}

function renderLapTable() {
    const el = document.getElementById('owLapTable');
    if (!el) return;
    const s = session();
    const unit = Units.getUnitLabel(s);
    const laps = lapStats(A.data);
    if (!laps.length) { el.innerHTML = '<p>No laps recorded.</p>'; return; }

    const rows = laps.map(l => `
        <tr>
          <td>${l.lap}</td>
          <td>${Math.round(Units.toDisplayDistance(l.distance, s))}${unit}</td>
          <td>${formatDuration(l.time)}</td>
          <td>${formatPace(l.speed, s)}</td>
          <td>${l.hr != null ? l.hr : '–'}</td>
          <td>${l.cadence != null ? l.cadence : '–'}</td>
          <td>${l.strokes != null ? l.strokes : '–'}</td>
        </tr>`).join('');

    // Totals: distance/time/strokes summed; pace from totals; HR/cadence time-weighted.
    const totDist = laps.reduce((a, l) => a + (l.distance || 0), 0);
    const totTime = laps.reduce((a, l) => a + (l.time || 0), 0);
    const totStrokes = laps.reduce((a, l) => a + (l.strokes || 0), 0);
    const wAvg = key => {
        const num = laps.reduce((a, l) => a + (l[key] != null ? l[key] * (l.time || 0) : 0), 0);
        return totTime > 0 ? Math.round(num / totTime) : null;
    };
    const totHr = wAvg('hr');
    const totCad = wAvg('cadence');
    const totalRow = `
        <tr class="subTotal">
          <td>Total</td>
          <td>${Math.round(Units.toDisplayDistance(totDist, s))}${unit}</td>
          <td>${formatDuration(totTime)}</td>
          <td>${formatPace(totTime > 0 ? totDist / totTime : 0, s)}</td>
          <td>${totHr != null ? totHr : '–'}</td>
          <td>${totCad != null ? totCad : '–'}</td>
          <td>${totStrokes || '–'}</td>
        </tr>`;

    el.innerHTML = `
      <table>
        <thead>
          <tr><th>Lap</th><th>Distance</th><th>Time</th><th>Pace (${paceUnitLabel(s)})</th><th>Avg HR (bpm)</th><th>Avg Cadence (spm)</th><th>Strokes</th></tr>
        </thead>
        <tbody>${rows}${totalRow}</tbody>
      </table>`;
}

function renderStrokeTable() {
    const section = document.getElementById('owStrokeSection');
    const el = document.getElementById('owStrokeTable');
    if (!section || !el) return;
    const stats = strokeStats(A.data, A.points, A.dist);
    if (!stats.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';

    const s = session();
    const unit = Units.getUnitLabel(s);
    const totalDist = stats.reduce((a, x) => a + x.distance, 0) || 1;
    const rows = stats
        .sort((a, b) => b.distance - a.distance)
        .map(x => `
        <tr class="${strokeClass(x.stroke)}">
          <td>${strokeName(x.stroke)}</td>
          <td>${Math.round(Units.toDisplayDistance(x.distance, s))}${unit}</td>
          <td>${formatDuration(x.time)}</td>
          <td>${formatPace(x.speed, s)}</td>
          <td>${Math.round((x.distance / totalDist) * 100)}%</td>
        </tr>`).join('');

    el.innerHTML = `
      <table>
        <thead>
          <tr><th>Stroke</th><th>Distance</th><th>Time</th><th>Pace (${paceUnitLabel(s)})</th><th>% Distance</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
}

function renderLegend(min, max) {
    const el = document.getElementById('owAnalyseLegend');
    if (!el) return;
    const stops = 6;
    const swatches = [];
    for (let i = 0; i < stops; i++) {
        const t = 1 - i / (stops - 1);
        const speed = min + t * (max - min);
        swatches.push(
            `<span class="ow-legend-item">` +
            `<span class="ow-legend-swatch" style="background:${speedToColor(speed, min, max)}"></span>` +
            `${formatPace(speed, session())}</span>`
        );
    }
    el.innerHTML = `<span class="ow-legend-label">Pace (${paceUnitLabel(session())}):</span> ${swatches.join('')}`;
}

function showMarker(idx) {
    const p = A.points[idx];
    if (!p) return;
    marker.setLatLng([p.lat, p.lng]).addTo(map);
}

function hideMarker() {
    if (marker) marker.remove();
}

function nearestPointIndex(latlng) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < A.points.length; i++) {
        const d = (A.points[i].lat - latlng.lat) ** 2 + (A.points[i].lng - latlng.lng) ** 2;
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

// ---------- chart ----------

function populateMetricSelect() {
    const sel = document.getElementById('owAnalyseMetric');
    if (!sel) return;
    const metrics = availableMetrics();
    sel.innerHTML = Object.entries(metrics)
        .map(([key, m]) => `<option value="${key}">${m.label}</option>`)
        .join('');
    if (!metrics[A.metric]) A.metric = 'pace';
    sel.value = A.metric;
}

function drawChart() {
    const gd = document.getElementById('owAnalyseChart');
    if (!gd) return;
    const metrics = availableMetrics();
    const m = metrics[A.metric] || metrics.pace;

    const x = A.dist;
    const y = A.points.map(p => m.value(p));
    const customdata = A.points.map((p, i) => {
        const s = session();
        return [
            formatPace(recSpeed(p.rec), s),               // pace
            p.rec.heartRate != null ? `${p.rec.heartRate} bpm` : '–',
            p.rec.cadence != null ? `${Math.round(p.rec.cadence + (p.rec.fractionalCadence || 0))} spm` : '–',
            formatDuration(secondsAt(i)),                  // elapsed time
        ];
    });

    const unitLabel = A.metric === 'pace' ? paceUnitLabel(session()) : m.unit;
    const trace = {
        x, y, customdata,
        type: 'scatter', mode: 'lines',
        line: { color: '#77529e', width: 2 },
        connectgaps: true,
        hovertemplate:
            `<b>${m.label}: %{customdata[4]}</b>` +
            `<br>Dist: %{x:.0f} m` +
            `<br>Pace: %{customdata[0]} ${paceUnitLabel(session())}` +
            `<br>HR: %{customdata[1]}` +
            `<br>Cadence: %{customdata[2]}` +
            `<br>Time: %{customdata[3]}<extra></extra>`,
    };
    // hovertemplate references customdata[4]; inject the formatted metric value there.
    trace.customdata = customdata.map((c, i) => [...c, `${m.fmt(y[i])} ${unitLabel}`.trim()]);

    // Fit the y-axis to the data range (with padding) instead of starting at 0,
    // so the interesting variation fills the plot. Recomputed each draw, so it
    // also refreshes after outliers are clamped.
    const yaxis = { title: `${m.label} (${unitLabel})`, fixedrange: true };
    const yvals = y.filter(v => v != null);
    if (yvals.length) {
        const minV = Math.min(...yvals);
        const maxV = Math.max(...yvals);
        const pad = (maxV - minV) * 0.08 || Math.max(maxV * 0.05, 1);
        const lo = Math.max(0, minV - pad);
        const hi = maxV + pad;
        yaxis.range = m.reversed ? [hi, lo] : [lo, hi]; // reversed: fast (low) on top
    } else {
        yaxis.autorange = m.reversed ? 'reversed' : true;
    }
    if (A.metric === 'pace') applyPaceTicks(yaxis, y, session());

    // Vertical lines at lap boundaries (skip lap 1 = start).
    const lapLines = lapStartPointIndices(A.points, A.data.lapMesgs)
        .filter((idx, i) => i > 0 && idx > 0 && idx < A.dist.length)
        .map(idx => ({
            type: 'line', x0: A.dist[idx], x1: A.dist[idx], yref: 'paper', y0: 0, y1: 1,
            line: { color: 'rgba(0,0,0,0.45)', width: 1, dash: 'dash' },
        }));

    // Colored background bands per stroke segment.
    const strokeBands = strokeSegments(A.data, A.points).map(seg => ({
        type: 'rect', xref: 'x', yref: 'paper',
        x0: A.dist[seg.startIdx], x1: A.dist[seg.endIdx], y0: 0, y1: 1,
        fillcolor: strokeColor(seg.stroke), opacity: 0.12, line: { width: 0 }, layer: 'below',
    }));

    const layout = {
        margin: { l: 50, r: 50, t: 0, b: 50 },
        height: 300,
        xaxis: { title: 'Distance (m)', fixedrange: true },
        yaxis,
        shapes: [...strokeBands, ...lapLines],
        hovermode: 'x unified',
        showlegend: false,
    };

    Plotly.react(gd, [trace], layout, { displayModeBar: false, responsive: true });

    if (!chartReady) {
        gd.on('plotly_hover', ev => {
            const pt = ev.points?.[0];
            if (pt) showMarker(pt.pointIndex);
        });
        gd.on('plotly_unhover', hideMarker);
        chartReady = true;
    }
}

// Returns elapsed seconds at point i from the first record timestamp.
function secondsAt(i) {
    const t0 = pointTime(0);
    const ti = pointTime(i);
    return (t0 != null && ti != null) ? (ti - t0) / 1000 : 0;
}
function pointTime(i) {
    const ts = A.points[i]?.rec?.timestamp;
    if (ts == null) return null;
    const ms = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
    return Number.isNaN(ms) ? null : ms;
}

// Builds nice m:ss tick labels for the (reversed) pace axis.
function applyPaceTicks(yaxis, paceValues, sess) {
    const vals = paceValues.filter(v => v != null);
    if (!vals.length) return;
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const steps = 5;
    const tickvals = [];
    const ticktext = [];
    for (let i = 0; i <= steps; i++) {
        const v = lo + (i / steps) * (hi - lo);
        tickvals.push(v);
        ticktext.push(`${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`);
    }
    yaxis.tickvals = tickvals;
    yaxis.ticktext = ticktext;
    yaxis.title = `Pace (${paceUnitLabel(sess)})`;
}

// ---------- entry ----------

export async function render() {
    A.data = await getItem('modifiedData');
    if (!A.data) return;
    A.points = loadTrackPoints(A.data);
    A.dist = cumulativeDistances(A.points);

    initMap();
    drawTrack();
    renderLapTable();
    renderStrokeTable();
    populateMetricSelect();

    const sel = document.getElementById('owAnalyseMetric');
    if (sel && !sel.dataset.bound) {
        sel.addEventListener('change', () => { A.metric = sel.value; drawChart(); });
        sel.dataset.bound = '1';
    }

    map.invalidateSize();
    if (A.points.length) {
        map.fitBounds(L.latLngBounds(A.points.map(p => [p.lat, p.lng])), { padding: [20, 20] });
        // Scrub the chart from the map.
        map.off('mousemove').on('mousemove', e => {
            const idx = nearestPointIndex(e.latlng);
            showMarker(idx);
            const gd = document.getElementById('owAnalyseChart');
            if (gd && gd.data) Plotly.Fx.hover(gd, [{ curveNumber: 0, pointNumber: idx }]);
        });
        map.off('mouseout').on('mouseout', hideMarker);
    }

    drawChart();
}
