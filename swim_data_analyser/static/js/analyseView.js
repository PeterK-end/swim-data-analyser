import Plotly from 'plotly.js-basic-dist-min'

// Helper function for formatting seconds
function formatTime(secs, prec = 2) {
  if (typeof secs !== 'number' || secs < 0) return '0:00';

  const factor = Math.pow(10, prec);
  const rounded = Math.round(secs * factor) / factor;

  const minutes = Math.floor(rounded / 60);
  const remainder = rounded - minutes * 60;
  const wholeSec = Math.floor(remainder);
  const secStr = String(wholeSec).padStart(2, '0');

  const hasFraction = prec > 0 && (rounded % 1 !== 0);
  if (!hasFraction) return `${minutes}:${secStr}`;

  const fraction = Math.round((remainder - wholeSec) * factor);
  const fracStr = String(fraction).padStart(prec, '0');

  return `${minutes}:${secStr}.${fracStr}`;
}

function ordinalSuffixOf(i) {
    const j = i % 10, k = i % 100;
    if (j === 1 && k !== 11) return i + "st";
    if (j === 2 && k !== 12) return i + "nd";
    if (j === 3 && k !== 13) return i + "rd";
    return i + "th";
}

export function renderSummary() {
    // Retrieve the modified data from session storage
    const data = JSON.parse(sessionStorage.getItem('modifiedData'));
    const lengthData = data.lengthMesgs;
    const activeLengths = data.lengthMesgs.filter(d => d.event === 'length' && d.lengthType === 'active');
    const sessionData = data.sessionMesgs[0];
    const grouped_data = {};

    // Group data by swim stroke and calculate required metrics
    activeLengths.forEach(entry => {
        const stroke = entry.swimStroke;

        // Initialize if stroke group doesn't exist
        if (!grouped_data[stroke]) {
            grouped_data[stroke] = {
                totalLengths: 0,
                totalTime: 0,
                totalStrokes: 0,
                avg_spl: 0,
                avg_spm: 0,
            };
        }

        // Update totals for the stroke
        grouped_data[stroke].totalLengths++;
        grouped_data[stroke].totalTime += entry.totalElapsedTime;
        grouped_data[stroke].totalStrokes += entry.totalStrokes;
        grouped_data[stroke].avg_spm += entry.avgSwimmingCadence || 0; // Handle undefined gracefully
    });

    // Calculate averages for SPM and SPL
    for (const stroke in grouped_data) {
        const strokeData = grouped_data[stroke];
        strokeData.avg_spl = (strokeData.totalStrokes > 0) ? strokeData.totalStrokes / strokeData.totalLengths : 0;
        strokeData.avg_spm = (strokeData.totalLengths > 0) ? (strokeData.avg_spm / strokeData.totalLengths) : 0;
    }

    // Initialize table with headers
    let tableHTML = `
    <table>
    <thead>
    <tr>
    <th>Style</th>
    <th>Lengths</th>
    <th>Distance</th>
    <th>Time</th>
    <th>Pace</th>
    <th>SPM</th>
    <th>SPL</th>
    </tr>
    </thead>
    <tbody>
    `;

    // Variables to accumulate subtotal values
    let totalLengths = 0;
    let totalDistance = 0;
    let totalTime = 0;
    let totalSPM = 0;
    let totalSPL = 0;
    let strokeCount = 0; // To calculate average for SPM and SPL

    // Iterate over the grouped data and create rows
    for (const stroke in grouped_data) {
        if (grouped_data.hasOwnProperty(stroke)) {

            const strokeData = grouped_data[stroke];
            const poolLength =  sessionData.poolLength;
            const distance = strokeData.totalLengths * poolLength ;
            const pace = (strokeData.totalTime / distance) * 100;

            // Accumulate totals
            totalLengths += strokeData.totalLengths;
            totalDistance += distance;
            totalTime += strokeData.totalTime;
            totalSPM += strokeData.avg_spm;
            totalSPL += strokeData.avg_spl;
            strokeCount++;

            // Add row for this stroke
            tableHTML += `
            <tr class="${stroke}">
            <td>${stroke.charAt(0).toUpperCase() + stroke.slice(1)}</td>
            <td>${strokeData.totalLengths}</td>
            <td>${distance}m</td>
            <td>${formatTime(strokeData.totalTime, 0)}</td>
            <td>${formatTime(pace, 0)}</td>
            <td>${strokeData.avg_spm.toFixed(2)}</td>
            <td>${strokeData.avg_spl.toFixed(2)}</td>
            </tr>
            `;
        }
    }

    // Calculate total time, distance, and averages for SPM and SPL
    const totalRest = lengthData
          .filter(d => d.lengthType === 'idle') // Filter the data for 'idle' lengths
          .reduce((acc, curr) => acc + curr.totalElapsedTime , 0); // Sum the values

    const totalPace = (totalTime/totalDistance) * 100;

    // Add subtotal row
    tableHTML += `
    <tr class="subTotal">
        <td>Sub Total</td>
        <td></td>
        <td></td>
        <td>${formatTime(totalTime, 0)}</td>
        <td></td>
        <td></td>
        <td></td>
    </tr>
    <tr class="rest">
        <td>Rest</td>
        <td></td>
        <td></td>
        <td>${formatTime(totalRest, 0)}</td>
        <td></td>
        <td></td>
        <td></td>
    </tr>
    `;

    // Add total row (interval class for box styling)
    tableHTML += `
    <tr class="interval">
        <td>Total</td>
        <td>${totalLengths}</td>
        <td>${totalDistance}m</td>
        <td>${formatTime(totalTime + totalRest, 0)}</td>
        <td>${formatTime(totalPace, 0)}</td>
        <td>${(strokeCount > 0) ? (totalSPM / strokeCount).toFixed(2) : '0.00'}</td>
        <td>${(strokeCount > 0) ? (totalSPL / strokeCount).toFixed(2) : '0.00'}</td>
    </tr>
    `;

    // Close the table
    tableHTML += `</tbody></table>`;

    // Insert the dynamically created table into the DOM
    document.getElementById('summaryData').innerHTML = tableHTML;
}

export function renderHeartratePlot(data) {
    const heartrateRecords = data.recordMesgs;
    const lengthData = data.lengthMesgs;

    if (!heartrateRecords?.length || !lengthData?.length) {
        console.warn('Missing heartrate or length data');
        return;
    }

    const strokeColors = {
        breaststroke: '#A8D8EA',
        freestyle: '#AA96DA',
        backstroke: '#FCBAD3',
        butterfly: '#FFFFD2',
        default: '#fde725'
    };

    // Compute elapsed minutes from timestamps
    const timestamps = heartrateRecords.map(d => new Date(d.timestamp));
    const startTime = timestamps[0];

    const elapsedMinutes = timestamps.map(t => (t - startTime) / 1000 / 60); // ms → minutes

    const heartrateData = {
        x: elapsedMinutes,
        y: heartrateRecords.map(d => d.heartRate),
        name: 'Heart Rate',
        type: 'scatter',
        mode: 'lines',
        line: { color: 'black' }
    };

    const maxHeartRate = Math.max(...heartrateRecords.map(d => d.heartRate));

    // Background colored shapes for each length
    const shapes = lengthData.map((length, i) => {
        const lengthStart = new Date(length.startTime);
        const lengthEnd = i < lengthData.length - 1
              ? new Date(lengthData[i + 1].startTime)
              : new Date(lengthStart.getTime() + length.totalElapsedTime * 1000); // fallback for last one

        const x0 = (lengthStart - startTime) / 1000 / 60;
        const x1 = (lengthEnd - startTime) / 1000 / 60;

        const color = length.lengthType === "active"
              ? (strokeColors[length.swimStroke] || strokeColors.default)
              : 'rgba(255, 255, 255, 0)'; // transparent for rest

        return {
            type: 'rect',
            xref: 'x',
            yref: 'y',
            x0,
            x1,
            y0: 0,
            y1: maxHeartRate,
            fillcolor: color,
            line: { width: 0 },
            layer: 'below'
        };
    });

    // Vertical dashed lines at each length start
    const lengthLines = lengthData.map((length) => {
        const lineTime = new Date(length.startTime);
        const x = (lineTime - startTime) / 1000 / 60;

        return {
            type: 'line',
            xref: 'x',
            yref: 'y',
            x0: x,
            x1: x,
            y0: 0,
            y1: maxHeartRate,
            line: {
                color: 'gray',
                width: 1,
                dash: 'dot'
            }
        };
    });

    // Invisible markers for hover text
    let activeLengthCount = 0;
    const hoverMarkers = {
        x: lengthData.map(length => {
            const lengthStart = new Date(length.startTime);
            return (lengthStart - startTime) / 1000 / 60;
        }),
        y: Array(lengthData.length).fill(0.5),
        mode: 'markers',
        marker: {
            opacity: 0,
            color: lengthData.map(length => {
                return length.lengthType === "active"
                    ? (strokeColors[length.swimStroke] || strokeColors.default)
                    : 'rgba(255, 255, 255, 0)';
            })
        },
        hovertext: lengthData.map(length => {
            if (length.lengthType === "active") {
                activeLengthCount++;
                return `Length: ${activeLengthCount}<br>Stroke: ${length.swimStroke || 'Unknown'}<br>Duration: ${length.totalElapsedTime}s`;
            }
            return `Rest`;
        }),
        hoverinfo: 'text'
    };

    const totalTimeMinutes = (new Date(lengthData[lengthData.length - 1].endTime) - startTime) / 1000 / 60;

    const layout = {
        margin: { l: 50, r: 50, t: 0, b: 50 },
        xaxis: {
            title: 'Elapsed Time (Minutes)',
            range: [0, totalTimeMinutes]
        },
        yaxis: {
            title: 'Heart Rate',
            titlefont: { color: 'black' },
            tickfont: { color: 'black' }
        },
        shapes: [...shapes, ...lengthLines],
        showlegend: false
    };

    Plotly.newPlot('heartratePlot', [heartrateData, hoverMarkers], layout, { displayModeBar: false });
}

export function renderBestTimes(data) {
    const active = data.lengthMesgs
        .filter(l => l.event === 'length' && l.lengthType === 'active')
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    const poolLen = data.sessionMesgs[0].poolLength;

    const best = {}; // best[stroke][distance] = {time, count, lengths[]}

    const allowedDistances = new Set([50, 100, 200, 500, 1000, 1500, 3000, 5000, 10000]);

    let curStroke = null;
    let curLengths = [];

    const flushStreak = () => {
        if (!curStroke) return;
        // evaluate every prefix of the just‑ended streak
        let prefixTime = 0;
        for (let i = 0; i < curLengths.length; i++) {
            const len = curLengths[i];
            prefixTime += len.totalElapsedTime;
            const distance = (i + 1) * poolLen;

            // keep only the distances we care about
            if (!allowedDistances.has(distance)) continue;

            if (!best[curStroke]) best[curStroke] = {};
            if (!best[curStroke][distance] ||
                prefixTime < best[curStroke][distance].time) {
                best[curStroke][distance] = {
                    time:    prefixTime,
                    count:   i + 1,
                    lengths: curLengths.slice(0, i + 1)
                };
            }
        }
    };

    active.forEach(l => {
        if (l.swimStroke !== curStroke) {
            flushStreak();                     // finish previous streak
            curStroke = l.swimStroke;          // start new streak
            curLengths = [];
        }
        curLengths.push(l);
    });

    // Flush the final streak
    flushStreak();

    // If nothing was found (empty best table), show a message instead
    if (Object.keys(best).length === 0) {
        document.getElementById('bestTimesTable').innerHTML = `
        <div class="no-best-times-message" style="text-align:center; font-style:italic; color:#555; padding:1em;">
            <p>No valid intervals found for a pool length of ${poolLen} m.</p>
            <p>The pool length must divide evenly into one of the predefined interval distances: 50, 100, 200, 500, 1000, 1500, 3000, 5000, or 10000 m.</p>
        </div>`
        return;
    }

    let rows = '';
    Object.keys(best).sort().forEach(stroke => {
        const entries = Object.entries(best[stroke])
            .map(([dist, info]) => ({
                distance: Number(dist),
                stroke,
                time:     info.time,
                count:    info.count,
                lengths:  info.lengths
            }))
            .sort((a, b) => a.distance - b.distance);

        entries.forEach(e => {
            const pace = (e.time / e.distance) * 100; // min per 100 m
            const spm  = e.lengths.reduce((s, l) => s + (l.avgSwimmingCadence || 0), 0) / e.count;
            const spl  = e.lengths.reduce((s, l) => s + (l.totalStrokes || 0), 0) / e.count;

            rows += `
                <tr class="${e.stroke}">
                    <td>${e.distance}</td>
                    <td>${e.stroke.charAt(0).toUpperCase() + e.stroke.slice(1)}</td>
                    <td>${formatTime(e.time, 1)}</td>
                    <td>${formatTime(pace, 0)}</td>
                    <td>${spm.toFixed(2)}</td>
                    <td>${spl.toFixed(2)}</td>
                    <td>${e.lengths[0].messageIndex+1}-${e.lengths[e.lengths.length-1].messageIndex+1}</td>
                </tr>`;
        });
    });

    const tableHTML = `
        <table id="bestTimesTable">
            <thead>
                <tr>
                    <th>Distance</th>
                    <th>Style</th>
                    <th>Best Time</th>
                    <th>Pace</th>
                    <th>SPM</th>
                    <th>SPL</th>
                    <th>Lengths</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>`;

    document.getElementById('bestTimesTable').innerHTML = tableHTML;
}

export function renderPacePlot(data) {

    // Filter data to include only entries where event is 'length' and lengthType is 'active'
    const lengthData = data.lengthMesgs.filter(d => d.event === 'length' && d.lengthType === 'active');
    const poolLength = data.sessionMesgs[0].poolLength;

    // Define a fixed Viridis color map for swim strokes
    const fixedStrokeColors = {
        breaststroke: '#A8D8EA',
        freestyle: '#AA96DA',
        backstroke: '#FCBAD3',
        butterfly: '#FFFFD2',
        // Add more strokes here with fixed values if necessary
        default: '#fde725'        // Yellow
    };

    // Create paceData with stroke-based colors for the bars
    const paceData = {
        x: lengthData.map((d, index) => index + 1),  // X-axis as the length index
        y: lengthData.map(d => (d.totalElapsedTime / poolLength)*100 || 0),  // Pace in minutes per 100m
        name: '',
        type: 'bar',
        text: lengthData.map(d => `Stroke: ${d.swimStroke || 'Unknown'}<br>Pace:
${formatTime((d.totalElapsedTime / poolLength)*100)}<br>SPM:
${d.avgSwimmingCadence}<br>SPL: ${d.totalStrokes}`),  // Hover text
        hoverinfo: 'text',
        textposition: 'none', // Prevent the text from being shown on the bars
        marker: {
            color: lengthData.map(d => {
                const stroke = d.swimStroke || 'default';  // Get stroke, fallback to default
                return fixedStrokeColors[stroke] || fixedStrokeColors['default'];  // Apply color based on stroke
            }),
            opacity: 0.6
        }
    };

    const strokeData = {
        x: lengthData.map((d, index) => index + 1),  // X-axis as the length index (1, 2, 3, etc.)
        y: lengthData.map(d => d.totalStrokes || 0),
        type: 'scatter',
        name: 'Total Strokes',  // Label for the second line
        line: {color: 'purple'}, // Darker shade of --second-
        yaxis: 'y2'
    };

    const spmData = {
        x: lengthData.map((d, index) => index + 1),  // X-axis as the length index (1, 2, 3, etc.)
        y: lengthData.map(d => d.avgSwimmingCadence || 0),
        name: 'Cadence (SPM)',
        type: 'scatter',
        line: {color: 'blue'}, // Darker shade of --third-color
        yaxis: 'y3'
    };

    const layout = {
        margin: {
            l: 50,  // Left margin
            r: 50,  // Right margin
            t: 0,   // Top margin
            b: 50   // Bottom margin
        },
        xaxis: {title: 'Length'},
        yaxis: {
            title: '',
            titlefont: { color: 'black' },
            tickfont: { color: 'black' },
            autorange: 'reversed',
            showticklabels: false
        },
        yaxis2: {
            title: 'Total Strokes (SPL)',  // Second Y-axis for total strokes
            titlefont: {color: 'purple'},
            tickfont: {color: 'purple'},
            overlaying: 'y',
            side: 'right'
        },
        yaxis3: {
            title: 'Cadence (SPM)',
            titlefont: {color: 'blue'},
            tickfont: {color: 'blue'},
            overlaying: 'y',  // Overlay the second y-axis on the same plot
            side: 'left'
        },
        showlegend: false
    };

    // Render the plot
    Plotly.newPlot('pacePlot', [paceData, strokeData, spmData], layout, { displayModeBar: false });
}

// Stroke Analysis
export function renderStrokeRateStrokeCountPlot(data) {

    // Get the dropdown element and attach an event listener for when the stroke changes
    const strokeFilter = document.getElementById('strokeFilter');

    strokeFilter.addEventListener('change', function() {
        const selectedStroke = strokeFilter.value;
        updatePlot(selectedStroke);
    });

    // Initial rendering with "breaststroke" selected
    updatePlot('breaststroke');

    function updatePlot(stroke) {

        const activeData = data.lengthMesgs
              .filter(d => d.event === 'length' && d.lengthType === 'active')
              .map((d, index) => ({
                  index: index + 1,
                  ...d
              }));
        const filteredData = activeData.filter(d => d.swimStroke === stroke);
        const poolLength = data.sessionMesgs[0].poolLength;

        // Reverse the color scale to align with faster times being darker colors and slower times being lighter
        const paceColorScale = [
            [0, '#6B285E'],
            [0.25, '#87439C'],
            [0.5, '#7E80D5'],
            [0.75, '#9BB7E1'],
            [1, '#B9E1EC']
        ];

        // Calculate the pace values (min/100m) for the color bar
        const paceValues = filteredData.map(d => (d.totalElapsedTime / poolLength)*100 || 0);
        const paceMin = Math.min(...paceValues);
        const paceMax = Math.max(...paceValues);

        // Create a scatter plot for stroke rate vs stroke count, with color representing pace
        const strokeRateStrokeCountData = {
            x: filteredData.map(d => d.avgSwimmingCadence || 0),  // X-axis: Stroke Rate (SPM)
            y: filteredData.map(d => d.totalStrokes || 0),  // Y-axis: Stroke Count (SPL)
            mode: 'markers',
            text: filteredData.map(d => `Length: ${d.index} <br>Pace: ${formatTime((d.totalElapsedTime /
poolLength)*100)} min/100m<br>SPM: ${d.avgSwimmingCadence}<br>SPL:
${d.totalStrokes}`),  // Hover text
            hoverinfo: 'text',
            marker: {
                size: 12,  // Size of the points
                color: paceValues,  // Color: Pace (min/100m)
                colorscale: paceColorScale,
                cmin: paceMin,
                cmax: paceMax,
                colorbar: {
                    title: 'Pace (min/100m)',
                    titleside: 'right',
                    tickmode: 'array',
                    tickvals: [paceMin, paceMax],
                    ticktext: ['Fast', 'Slow'],
                    ticks: 'outside'
                }
            }
        };

        const layout = {
            margin: {
                l: 50,  // Left margin
                r: 50,  // Right margin
                t: 0,   // Top margin
                b: 50   // Bottom margin
            },
            xaxis: {
                title: 'Stroke Rate (SPM)',
                titlefont: { color: 'black' },
                tickfont: { color: 'black' },
            },
            yaxis: {
                title: 'Stroke Count (SPL)',
                titlefont: { color: 'black' },
                tickfont: { color: 'black' }
            },
            showlegend: false
        };

        // Render the plot with updated data
        Plotly.newPlot('strokeRateStrokeCountPlot', [strokeRateStrokeCountData], layout, { displayModeBar: false });
    }
}

export function renderIntervalSummaryTable() {
    const data = JSON.parse(sessionStorage.getItem('modifiedData'));
    const lengthData = data.lengthMesgs;
    const activeLengths = lengthData.filter(d => d.event === 'length' && d.lengthType === 'active');
    const activeLapsData = data.lapMesgs.filter(d => d.numActiveLengths > 0);
    const sessionData = data.sessionMesgs[0];
    const poolLength = sessionData.poolLength;

    // Define the intervals
    const intervals = activeLapsData.map((lap, index) => {
        const nextLap = activeLapsData[index + 1];
        return {
            lap,
            start: lap.firstLengthIndex,
            end: nextLap ? nextLap.firstLengthIndex - 1 : Infinity // Last interval extends to infinity
        };
    });

    // Initialize table with headers
    let tableHTML = `
    <table id="intervalSummaryTable">
    <thead>
    <tr>
      <th>Length</th>
      <th>Distance</th>
      <th>Stroke</th>
      <th>Time</th>
      <th>Pace</th>
      <th>SPM</th>
      <th>SPL</th>
    </tr>
    </thead>
    <tbody>
    `;

    let totalTime = 0;
    let totalRest = 0;

    // Process each length for each interval
    let lengthCounter = 1;
    intervals.forEach((interval, intervalIndex) => {
        const intervalLengths = activeLengths.filter(length =>
            length.messageIndex >= interval.start && length.messageIndex <= interval.end
        );

        if (intervalLengths.length === 0) {
            return
        }

        // Loop through each length within the interval
        intervalLengths.forEach(length => {
            const distance = poolLength; // Assuming each length is one pool length
            const time = length.totalElapsedTime;
            const pace = (time / distance) * 100;
            const spm = length.avgSwimmingCadence || 0;
            const spl = (length.totalStrokes || 0);

            tableHTML += `
        <tr class="length ${length.swimStroke}">
            <td>${lengthCounter}</td>
            <td>${distance}</td>
            <td>${length.swimStroke.charAt(0).toUpperCase() + length.swimStroke.slice(1)}</td>
            <td>${formatTime(time, 1)}</td>
            <td>${formatTime(pace, 0)}</td>
            <td>${spm}</td>
            <td>${spl}</td>
        </tr>
        `;

            totalTime += time;
            lengthCounter++;
        });

        // Add rest if applicable
        const intervalRest = lengthData
              .filter(d => d.lengthType === 'idle' && d.messageIndex >= interval.start && d.messageIndex <= interval.end)
              .reduce((sum, length) => sum + length.totalElapsedTime, 0);

        if (intervalRest > 0) {
            tableHTML += `
        <tr class="rest">
            <td>Rest</td>
            <td></td>
            <td></td>
            <td>${formatTime(intervalRest, 1)}</td>
            <td></td>
            <td></td>
            <td></td>
        </tr>
        `;
            totalRest += intervalRest;
        }

        // Calculate interval summary
        const totalLengths = intervalLengths.length;
        const intervalDistance = totalLengths * poolLength;
        const intervalTime = intervalLengths.reduce((sum, length) => sum + length.totalElapsedTime, 0);
        const intervalSPM = intervalLengths.reduce((sum, length) => sum + (length.avgSwimmingCadence || 0), 0) / totalLengths;
        const intervalSPL = intervalLengths.reduce((sum, length) => sum + (length.totalStrokes || 0), 0) / totalLengths;
        const intervalPace = (intervalTime / intervalDistance) * 100;

        // Calculate interval stroke
        const strokesInInterval = intervalLengths.map(length => length.swimStroke);
        const uniqueStrokes = [...new Set(strokesInInterval)]; // Get unique strokes
        const intervalStroke = uniqueStrokes.length === 1 ? uniqueStrokes[0].charAt(0).toUpperCase() + uniqueStrokes[0].slice(1) : 'Mixed';

        // Add interval summary
        tableHTML += `
    <tr class="interval">
        <td>${ordinalSuffixOf(intervalIndex + 1)} Interval</td>
        <td>${intervalDistance}</td>
        <td>${intervalStroke}</td>
        <td>${formatTime(intervalTime, 1)}</td>
        <td>${formatTime(intervalPace, 0)}</td>
        <td>${intervalSPM.toFixed(2)}</td>
        <td>${intervalSPL.toFixed(2)}</td>
    </tr>
    `;
    });

    // Close the table
    tableHTML += `</tbody></table>`;

    // Insert the dynamically created table into the DOM
    document.getElementById('intervalSummaryTable').innerHTML = tableHTML;
}
