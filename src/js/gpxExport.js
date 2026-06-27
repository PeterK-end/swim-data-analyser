// GPX 1.1 export for open-water (GPS) activities. Serializes recordMesgs into a
// track, carrying speed via the Garmin TrackPointExtension so the value travels
// with the track (e.g. for color-by-speed in OSMand+).

const SEMI_TO_DEG = 180 / 2 ** 31;

function semiToDeg(semicircles) {
    return semicircles * SEMI_TO_DEG;
}

function toIso(timestamp) {
    if (timestamp == null) return null;
    const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Builds a GPX document string from modifiedData.
export function toGpx(modifiedData, trackName = 'Open Water Swim') {
    const records = (modifiedData.recordMesgs || []).filter(
        r => r.positionLat != null && r.positionLong != null
    );

    const trkpts = records.map(r => {
        const lat = semiToDeg(r.positionLat).toFixed(7);
        const lon = semiToDeg(r.positionLong).toFixed(7);
        const time = toIso(r.timestamp);
        const speed = r.enhancedSpeed ?? r.speed;
        const ele = r.enhancedAltitude ?? r.altitude;

        const lines = [`      <trkpt lat="${lat}" lon="${lon}">`];
        if (ele != null) lines.push(`        <ele>${ele}</ele>`);
        if (time) lines.push(`        <time>${time}</time>`);
        if (speed != null) {
            lines.push('        <extensions>');
            lines.push('          <gpxtpx:TrackPointExtension>');
            lines.push(`            <gpxtpx:speed>${speed}</gpxtpx:speed>`);
            lines.push('          </gpxtpx:TrackPointExtension>');
            lines.push('        </extensions>');
        }
        lines.push('      </trkpt>');
        return lines.join('\n');
    });

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="swim-data-analyser"',
        '     xmlns="http://www.topografix.com/GPX/1/1"',
        '     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"',
        '     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        '     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
        '  <trk>',
        `    <name>${escapeXml(trackName)}</name>`,
        '    <trkseg>',
        trkpts.join('\n'),
        '    </trkseg>',
        '  </trk>',
        '</gpx>',
        '',
    ].join('\n');
}
