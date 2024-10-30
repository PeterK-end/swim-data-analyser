import Plotly from 'plotly.js-basic-dist-min'

// Helper function for formatting seconds to minute:sec
function formatTime(seconds){
    const totalMinutes = Math.floor(seconds / 60);
    const totalSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${totalMinutes}:${totalSeconds.toString().padStart(2, '0')}`;
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
    const lengthData = data.lengths;
    const activeLengths = data.lengths.filter(d => d.event === 'length' && d.length_type === 'active');
    const sessionData = data.sessions[0];
    const grouped_data = {};

    // Group data by swim stroke and calculate required metrics
    activeLengths.forEach(entry => {
        const stroke = entry.swim_stroke;

        // Initialize if stroke group doesn't exist
        if (!grouped_data[stroke]) {
            grouped_data[stroke] = {
                total_lengths: 0,
                total_time: 0,
                total_strokes: 0,
                avg_spl: 0,
                avg_spm: 0,
            };
        }

        // Update totals for the stroke
        grouped_data[stroke].total_lengths++;
        grouped_data[stroke].total_time += entry.total_elapsed_time;
        grouped_data[stroke].total_strokes += entry.total_strokes;
        grouped_data[stroke].avg_spm += entry.avg_swimming_cadence || 0; // Handle undefined gracefully
    });

    // Calculate averages for SPM and SPL
    for (const stroke in grouped_data) {
        const strokeData = grouped_data[stroke];
        strokeData.avg_spl = (strokeData.total_strokes > 0) ? strokeData.total_strokes / strokeData.total_lengths : 0;
        strokeData.avg_spm = (strokeData.total_lengths > 0) ? (strokeData.avg_spm / strokeData.total_lengths) : 0;
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
            const poolLength =  sessionData.pool_length;
            const distance = strokeData.total_lengths * poolLength ;
            const pace = (strokeData.total_time / distance) * 100;

            // Accumulate totals
            totalLengths += strokeData.total_lengths;
            totalDistance += distance;
            totalTime += strokeData.total_time;
            totalSPM += strokeData.avg_spm;
            totalSPL += strokeData.avg_spl;
            strokeCount++;

            // Add row for this stroke
            tableHTML += `
            <tr class="${stroke}">
            <td>${stroke.charAt(0).toUpperCase() + stroke.slice(1)}</td>
            <td>${strokeData.total_lengths}</td>
            <td>${distance}m</td>
            <td>${formatTime(strokeData.total_time)}</td>
            <td>${formatTime(pace)}</td>
            <td>${strokeData.avg_spm.toFixed(2)}</td>
            <td>${strokeData.avg_spl.toFixed(2)}</td>
            </tr>
            `;
        }
    }

    // Calculate total time, distance, and averages for SPM and SPL
    const totalRest = lengthData
          .filter(d => d.length_type === 'idle') // Filter the data for 'idle' lengths
          .reduce((acc, curr) => acc + curr.total_elapsed_time , 0); // Sum the values

    const totalPace = (totalTime/totalDistance) * 100;

    // Add subtotal row
    tableHTML += `
    <tr class="subTotal">
        <td>Sub Total</td>
        <td></td>
        <td></td>
        <td>${formatTime(totalTime)}</td>
        <td></td>
        <td></td>
        <td></td>
    </tr>
    <tr class="rest">
        <td>Rest</td>
        <td></td>
        <td></td>
        <td>${formatTime(totalRest)}</td>
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
        <td>${formatTime(totalTime + totalRest)}</td>
        <td>${formatTime(totalPace)}</td>
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
    const heartrateRecords = data.records;
    const lengthData = data.lengths;

    const strokeColors = {
        breaststroke: '#A8D8EA',
        freestyle: '#AA96DA',
        backstroke: '#FCBAD3',
        butterfly: '#FFFFD2',
        default: '#fde725'  // Yellow for unknown strokes
    };

    // Heart rate trace
    const heartrateData = {
        x: heartrateRecords.map(d => d.elapsed_time / 60),  // Convert to minutes
        y: heartrateRecords.map(d => d.heart_rate),
        name: 'Heart Rate',
        type: 'scatter',
        mode: 'lines',
        line: { color: 'black' }
    };

    // Calculate cumulative elapsed time for each length
    let cumulativeElapsedTime = 0;
    const shapes = lengthData.map((length, index) => {
        const startTime = cumulativeElapsedTime / 60;  // Start time in minutes
        cumulativeElapsedTime += length.total_elapsed_time;  // Increment cumulative time
        const endTime = cumulativeElapsedTime / 60;  // End time in minutes

        const color = length.length_type === "active"
              ? (strokeColors[length.swim_stroke] || strokeColors.default)
              : 'rgba(255, 255, 255, 0)';  // Transparent for idle lengths

        return {
            type: 'rect',
            xref: 'x',
            yref: 'y',  // Reference to y-axis to stay within the axis bounds
            x0: startTime,
            x1: endTime,
            y0: 0,  // Set y0 based on the minimum heart rate value
            y1: Math.max(...heartrateRecords.map(d => d.heart_rate)),  // Set y1 based on the maximum heart rate value
            fillcolor: color,
            line: { width: 0 },
            layer: 'below',
        };
    });

    // Vertical lines for each length start
    cumulativeElapsedTime = 0;  // Reset for line positioning
    const lengthLines = lengthData.map((length, index) => {
        const linePosition = cumulativeElapsedTime / 60;  // Current cumulative time in minutes
        cumulativeElapsedTime += length.total_elapsed_time;  // Increment cumulative time

        return {
            type: 'line',
            xref: 'x',
            yref: 'y',  // Align lines with y-axis
            x0: linePosition,
            x1: linePosition,
            y0: 0,
            y1: Math.max(...heartrateRecords.map(d => d.heart_rate)),  // Set y1 based on heart rate range
            line: {
                color: 'gray',
                width: 1,
                dash: 'dot'
            }
        };
    });

    // Invisible markers for hover labels with cumulative length count for active lengths
    cumulativeElapsedTime = 0;
    let cumulativeLengthCount = 0;  // Track only active lengths
    const hoverMarkers = {
        x: lengthData.map((length, index) => {
            const time = cumulativeElapsedTime / 60;
            cumulativeElapsedTime += length.total_elapsed_time;
            return time;
        }),
        y: Array(lengthData.length).fill(0.5),  // Place markers halfway up the y-axis
        mode: 'markers',
        marker: {
            opacity: 0,  // Make markers invisible
            color: lengthData.map(length => {
                // Return stroke color for active lengths or transparent for idle lengths
                return length.length_type === "active"
                    ? (strokeColors[length.swim_stroke] || strokeColors.default)  // Use defined colors
                    : 'rgba(255, 255, 255, 0)';  // Transparent for idle lengths
            })
        },
        hovertext: lengthData.map((length) => {
            // Increment count only for active lengths
            if (length.length_type === "active") {
                cumulativeLengthCount++;
                return `Length: ${cumulativeLengthCount} <br>Stroke: ${length.swim_stroke || 'Unknown'} <br>Total Time: ${length.total_elapsed_time}s`;
            }
            return `Rest`;
        }),
        hoverinfo: 'text'
    };

    // Define max elapsed time for consistent x-axis range based on the last cumulative time
    const maxElapsedTime = cumulativeElapsedTime / 60;  // Convert to minutes

    const layout = {
        margin: { l: 50, r: 50, t: 0, b: 50 },
        xaxis: {
            title: 'Elapsed Time (Minutes)',
            range: [0, maxElapsedTime]  // Explicit x-axis range
        },
        yaxis: {
            title: 'Heart Rate',
            titlefont: { color: 'black' },
            tickfont: { color: 'black' },
        },
        shapes: [...shapes, ...lengthLines],  // Add both rectangles and lines
        showlegend: false
    };

    // Render the plot with heartrateData and invisible hoverMarkers traces
    Plotly.newPlot('heartratePlot', [heartrateData, hoverMarkers], layout, { displayModeBar: false });
}

export function renderPacePlot(data) {

    // Filter data to include only entries where event is 'length' and length_type is 'active'
    const lengthData = data.lengths.filter(d => d.event === 'length' && d.length_type === 'active');
    const poolLength = data.sessions[0].pool_length;

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
        y: lengthData.map(d => (d.total_elapsed_time / poolLength)*100 || 0),  // Pace in minutes per 100m
        name: '',
        type: 'bar',
        text: lengthData.map(d => `Stroke: ${d.swim_stroke || 'Unknown'}<br>Pace:
${formatTime((d.total_elapsed_time / poolLength)*100)}<br>SPM:
${d.avg_swimming_cadence}<br>SPL: ${d.total_strokes}`),  // Hover text
        hoverinfo: 'text',
        textposition: 'none', // Prevent the text from being shown on the bars
        marker: {
            color: lengthData.map(d => {
                const stroke = d.swim_stroke || 'default';  // Get stroke, fallback to default
                return fixedStrokeColors[stroke] || fixedStrokeColors['default'];  // Apply color based on stroke
            }),
            opacity: 0.6
        }
    };

    const strokeData = {
        x: lengthData.map((d, index) => index + 1),  // X-axis as the length index (1, 2, 3, etc.)
        y: lengthData.map(d => d.total_strokes || 0),
        type: 'scatter',
        name: 'Total Strokes',  // Label for the second line
        line: {color: 'purple'}, // Darker shade of --second-
        yaxis: 'y2'
    };

     const spmData = {
        x: lengthData.map((d, index) => index + 1),  // X-axis as the length index (1, 2, 3, etc.)
        y: lengthData.map(d => d.avg_swimming_cadence || 0),
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

        const activeData = data.lengths
              .filter(d => d.event === 'length' && d.length_type === 'active')
              .map((d, index) => ({
                  index: index + 1,
                  ...d
              }));
        const filteredData = activeData.filter(d => d.swim_stroke === stroke);
        const poolLength = data.sessions[0].pool_length;

        // Reverse the color scale to align with faster times being darker colors and slower times being lighter
        const paceColorScale = [
            [0, '#6B285E'],
            [0.25, '#87439C'],
            [0.5, '#7E80D5'],
            [0.75, '#9BB7E1'],
            [1, '#B9E1EC']
        ];

        // Calculate the pace values (min/100m) for the color bar
        const paceValues = filteredData.map(d => (d.total_elapsed_time / poolLength)*100 || 0);
        const paceMin = Math.min(...paceValues);
        const paceMax = Math.max(...paceValues);

        // Create a scatter plot for stroke rate vs stroke count, with color representing pace
        const strokeRateStrokeCountData = {
            x: filteredData.map(d => d.avg_swimming_cadence || 0),  // X-axis: Stroke Rate (SPM)
            y: filteredData.map(d => d.total_strokes || 0),  // Y-axis: Stroke Count (SPL)
            mode: 'markers',
            text: filteredData.map(d => `Length: ${d.index} <br>Pace: ${formatTime((d.total_elapsed_time /
poolLength)*100)} min/100m<br>SPM: ${d.avg_swimming_cadence}<br>SPL:
${d.total_strokes}`),  // Hover text
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
    const lengthData = data.lengths;
    const activeLengths = lengthData.filter(d => d.event === 'length' && d.length_type === 'active');
    const activeLapsData = data.laps.filter(d => d.num_active_lengths > 0);
    const sessionData = data.sessions[0];
    const poolLength = sessionData.pool_length;

    // Define the intervals
    const intervals = activeLapsData.map((lap, index) => {
        const nextLap = activeLapsData[index + 1];
        return {
            lap,
            start: lap.first_length_index,
            end: nextLap ? nextLap.first_length_index - 1 : Infinity // Last interval extends to infinity
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
            length.message_index.value >= interval.start && length.message_index.value <= interval.end
        );

        if (intervalLengths.length === 0) {
            return
        }

        // Loop through each length within the interval
        intervalLengths.forEach(length => {
            const distance = poolLength; // Assuming each length is one pool length
            const time = length.total_elapsed_time;
            const pace = (time / distance) * 100;
            const spm = length.avg_swimming_cadence || 0;
            const spl = (length.total_strokes || 0);

            tableHTML += `
        <tr class="length ${length.swim_stroke}">
            <td>${lengthCounter}</td>
            <td>${distance}</td>
            <td>${length.swim_stroke.charAt(0).toUpperCase() + length.swim_stroke.slice(1)}</td>
            <td>${formatTime(time)}</td>
            <td>${formatTime(pace)}</td>
            <td>${spm}</td>
            <td>${spl}</td>
        </tr>
        `;

            totalTime += time;
            lengthCounter++;
        });

        // Add rest if applicable
        const intervalRest = lengthData
              .filter(d => d.length_type === 'idle' && d.message_index.value >= interval.start && d.message_index.value <= interval.end)
              .reduce((sum, length) => sum + length.total_elapsed_time, 0);

        if (intervalRest > 0) {
            tableHTML += `
        <tr class="rest">
            <td>Rest</td>
            <td></td>
            <td></td>
            <td>${formatTime(intervalRest)}</td>
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
        const intervalTime = intervalLengths.reduce((sum, length) => sum + length.total_elapsed_time, 0);
        const intervalSPM = intervalLengths.reduce((sum, length) => sum + (length.avg_swimming_cadence || 0), 0) / totalLengths;
        const intervalSPL = intervalLengths.reduce((sum, length) => sum + (length.total_strokes || 0), 0) / totalLengths;
        const intervalPace = (intervalTime / intervalDistance) * 100;

        // Calculate interval stroke
        const strokesInInterval = intervalLengths.map(length => length.swim_stroke);
        const uniqueStrokes = [...new Set(strokesInInterval)]; // Get unique strokes
        const intervalStroke = uniqueStrokes.length === 1 ? uniqueStrokes[0].charAt(0).toUpperCase() + uniqueStrokes[0].slice(1) : 'Mixed';

        // Add interval summary
        tableHTML += `
    <tr class="interval">
        <td>${ordinalSuffixOf(intervalIndex + 1)} Interval</td>
        <td>${intervalDistance}</td>
        <td>${intervalStroke}</td>
        <td>${formatTime(intervalTime)}</td>
        <td>${formatTime(intervalPace)}</td>
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
