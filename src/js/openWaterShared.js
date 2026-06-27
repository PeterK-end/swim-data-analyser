// Pure helpers shared by the open-water edit view and analyse view.
import * as Units from './units.js';

export const SEMI_TO_DEG = 180 / 2 ** 31;

export function recSpeed(rec) {
    return rec.enhancedSpeed ?? rec.speed ?? 0;
}

export function recLatLng(rec) {
    if (rec.positionLat == null || rec.positionLong == null) return null;
    return [rec.positionLat * SEMI_TO_DEG, rec.positionLong * SEMI_TO_DEG];
}

// Returns the position-bearing records in order as { rec, lat, lng }.
export function loadTrackPoints(data) {
    const points = [];
    (data?.recordMesgs || []).forEach(rec => {
        const ll = recLatLng(rec);
        if (ll) points.push({ rec, lat: ll[0], lng: ll[1] });
    });
    return points;
}

export function haversine(aLat, aLng, bLat, bLng) {
    const R = 6371000; // meters
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const h = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

export function speedBounds(points) {
    const speeds = points.map(p => recSpeed(p.rec));
    if (speeds.length === 0) return { min: 0, max: 1 };
    return { min: Math.min(...speeds), max: Math.max(...speeds) };
}

// Perceptually-uniform Viridis ramp (slow = blue/purple, fast = yellow) — calmer
// and more legible than a rainbow, and colorblind-friendly.
const VIRIDIS = ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'];
const hexRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Maps a speed to a color along the ramp.
export function speedToColor(speed, min, max) {
    const t = max > min ? Math.min(Math.max((speed - min) / (max - min), 0), 1) : 0;
    const scaled = t * (VIRIDIS.length - 1);
    const i = Math.floor(scaled);
    const f = scaled - i;
    const c0 = hexRgb(VIRIDIS[i]);
    const c1 = hexRgb(VIRIDIS[Math.min(i + 1, VIRIDIS.length - 1)]);
    const mix = j => Math.round(c0[j] + (c1[j] - c0[j]) * f);
    return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

// Formats a speed (m/s) as swim pace "m:ss" per 100 m/yd.
export function formatPace(speed, session) {
    const secs = Units.getPaceSeconds(speed, session);
    if (!secs || secs <= 0) return '–';
    const total = Math.round(secs);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function paceUnitLabel(session) {
    return `/100${Units.getUnitLabel(session)}`;
}

// Formats a duration in seconds as h:mm:ss (or m:ss when under an hour).
export function formatDuration(secs) {
    const t = Math.round(secs || 0);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// Pace in seconds/100 → speed (m/s), unit-aware.
export function paceSecondsToSpeed(secs, session) {
    if (!secs || secs <= 0) return 0;
    const dist = Units.isYards(session) ? 91.44 : 100;
    return dist / secs;
}

function toMs(t) {
    if (t == null) return NaN;
    return t instanceof Date ? t.getTime() : new Date(t).getTime();
}

// Swim stroke enum (FIT swim_stroke). Index = enum value.
export const SWIM_STROKE_NAMES = ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Drill', 'Mixed', 'IM'];
// Lower-case keys double as the existing table-row CSS classes (tr.freestyle, …).
export const SWIM_STROKE_KEYS = ['freestyle', 'backstroke', 'breaststroke', 'butterfly', 'drill', 'mixed', 'im'];
// Colors match the existing stroke row classes in styles.css.
export const STROKE_COLORS = ['#AA96DA', '#FCBAD3', '#A8D8EA', '#FFFFD2', '#fde725', '#C8C8C8', '#B5EAD7'];

export function strokeName(v) {
    return SWIM_STROKE_NAMES[v] ?? `Stroke ${v}`;
}
export function strokeClass(v) {
    return SWIM_STROKE_KEYS[v] ?? '';
}
export function strokeColor(v) {
    return STROKE_COLORS[v] ?? '#777';
}

// Signature of the open-water stroke-change message (reverse engineered from
// Garmin files): field0 and field1 are constants we use to confirm we're
// reading the right unknown message before trusting field5/field253.
const STROKE_MSG_FIELD0 = 44;
const STROKE_MSG_FIELD1 = 18432;

// Reads Garmin open-water stroke-change events (unknown message 89, reverse
// engineered): field253 = seconds from start, field5 = swim_stroke enum.
// Only trusts entries matching the known signature. Returns sorted
// [{ offsetSec, stroke }].
export function strokeChanges(data) {
    const arr = data?.mesg89Mesgs || [];
    const matched = arr.filter(m =>
        m.field5 != null && m.field253 != null &&
        m.field0 === STROKE_MSG_FIELD0 && m.field1 === STROKE_MSG_FIELD1
    );
    // Help future verification: flag files that have message 89 but a different shape.
    if (arr.length && !matched.length) {
        console.warn('mesg89 present but signature mismatch — not treating as stroke changes:', arr);
    }
    return matched
        .map(m => ({ offsetSec: m.field253, stroke: m.field5 }))
        .sort((a, b) => a.offsetSec - b.offsetSec);
}

// Maps stroke changes onto point-index ranges: [{ stroke, startIdx, endIdx }].
export function strokeSegments(data, points) {
    const changes = strokeChanges(data);
    if (!changes.length || !points.length) return [];
    const startMs = toMs(points[0].rec.timestamp);
    const idxOf = sec => {
        const t = startMs + sec * 1000;
        const i = points.findIndex(p => toMs(p.rec.timestamp) >= t);
        return i < 0 ? points.length - 1 : i;
    };
    const segs = [];
    for (let i = 0; i < changes.length; i++) {
        const startIdx = i === 0 ? 0 : idxOf(changes[i].offsetSec);
        const endIdx = i + 1 < changes.length ? idxOf(changes[i + 1].offsetSec) : points.length - 1;
        if (endIdx > startIdx) segs.push({ stroke: changes[i].stroke, startIdx, endIdx });
    }
    return segs;
}

// Aggregates per-stroke distance/time from the segments.
export function strokeStats(data, points, dist) {
    const segs = strokeSegments(data, points);
    const byStroke = {};
    segs.forEach(s => {
        const distM = (dist[s.endIdx] || 0) - (dist[s.startIdx] || 0);
        const timeS = (toMs(points[s.endIdx].rec.timestamp) - toMs(points[s.startIdx].rec.timestamp)) / 1000;
        const g = byStroke[s.stroke] || (byStroke[s.stroke] = { stroke: s.stroke, distance: 0, time: 0 });
        g.distance += distM;
        g.time += timeS;
    });
    return Object.values(byStroke).map(g => ({ ...g, speed: g.time > 0 ? g.distance / g.time : 0 }));
}

// Per-lap statistics derived from lapMesgs.
export function lapStats(data) {
    return (data?.lapMesgs || []).map((lap, i) => {
        const distance = lap.totalDistance ?? 0;
        const time = lap.totalElapsedTime ?? lap.totalTimerTime ?? 0;
        const speed = lap.enhancedAvgSpeed ?? lap.avgSpeed ??
            (distance && time ? distance / time : 0);
        return {
            lap: i + 1,
            distance,
            time,
            speed,
            hr: lap.avgHeartRate,
            cadence: lap.avgCadence,
            // With expandSubFields disabled (upload.js), swim strokes arrive as totalCycles.
            strokes: lap.totalStrokes ?? lap.totalCycles,
            startMs: toMs(lap.startTime),
        };
    });
}

// For each lap, the index into `points` where the lap starts (by timestamp).
export function lapStartPointIndices(points, lapMesgs) {
    return (lapMesgs || []).map(lap => {
        const startMs = toMs(lap.startTime);
        const idx = points.findIndex(p => toMs(p.rec.timestamp) >= startMs);
        return idx < 0 ? 0 : idx;
    });
}

// Cumulative along-track distance (meters) for each point.
export function cumulativeDistances(points) {
    const out = new Array(points.length).fill(0);
    for (let i = 1; i < points.length; i++) {
        out[i] = out[i - 1] +
            haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    }
    return out;
}
