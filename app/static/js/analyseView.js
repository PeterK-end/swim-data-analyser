import Plotly from 'plotly.js-basic-dist-min'

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
            const totalMinutes = Math.floor(strokeData.total_time / 60);
            const totalSeconds = Math.floor(strokeData.total_time % 60).toString().padStart(2, '0');
            const distance = strokeData.total_lengths * sessionData.pool_length; // Assuming pool_length is in session data
            const paceMinutes = (distance > 0) ? Math.floor(((strokeData.total_time / (distance / 100)) / 60)) : 0;
            const paceSeconds = (distance > 0) ? Math.floor(((strokeData.total_time / (distance / 100)) % 60)).toString().padStart(2, '0') : '00';

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
            <td>${totalMinutes}:${totalSeconds}</td>
            <td>${paceMinutes}:${paceSeconds}</td>
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

    const totalRestMinutes = Math.floor(totalRest / 60);
    const totalRestSeconds = Math.floor(totalRest % 60).toString().padStart(2, '0');

    const totalActiveMinutes = Math.floor(totalTime / 60);
    const totalActiveSeconds = Math.floor(totalTime % 60).toString().padStart(2, '0');

    const overallTotalMinutes = Math.floor((totalTime + totalRest) / 60);
    const overallTotalSeconds = Math.floor((totalTime + totalRest) % 60).toString().padStart(2, '0');

    // Add subtotal row
    tableHTML += `
    <tr class="subTotal">
        <td>Sub Total</td>
        <td>${totalLengths}</td>
        <td>${totalDistance}m</td>
        <td>${totalActiveMinutes}:${totalActiveSeconds}</td>
        <td></td>
        <td></td>
        <td></td>
    </tr>
    <tr class="rest">
        <td>Rest</td>
        <td></td>
        <td></td>
        <td>${totalRestMinutes}:${totalRestSeconds}</td>
        <td></td>
        <td></td>
        <td></td>
    </tr>
    `;

    // Add total row
    tableHTML += `
    <tr class="total">
        <td>Total</td>
        <td>${totalLengths}</td>
        <td>${totalDistance}m</td>
        <td>${overallTotalMinutes}:${overallTotalSeconds}</td>
        <td></td>
        <td>${(strokeCount > 0) ? (totalSPM / strokeCount).toFixed(2) : '0.00'}</td>
        <td>${(strokeCount > 0) ? (totalSPL / strokeCount).toFixed(2) : '0.00'}</td>
    </tr>
    `;

    // Close the table
    tableHTML += `</tbody></table>`;

    // Insert the dynamically created table into the DOM
    document.getElementById('summaryData').innerHTML = tableHTML;
}

function formatPace(seconds, poolLengthMultiplier) {
    const secPer100 = seconds * poolLengthMultiplier;
    const minutes = Math.floor(secPer100 / 60);
    const secs = Math.floor(secPer100 % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`; // Ensure seconds are two digits
}

export function renderPacePlot(data) {

    // Filter data to include only entries where event is 'length' and length_type is 'active'
    const lengthData = data.lengths.filter(d => d.event === 'length' && d.length_type === 'active');
    const poolLengthMultiplier = 100/data.sessions[0].pool_length;

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
        y: lengthData.map(d => ((d.total_elapsed_time * poolLengthMultiplier) / 60) || 0),  // Pace in minutes per 100m
        name: '',
        type: 'bar',
        text: lengthData.map(d => `Stroke: ${d.swim_stroke || 'Unknown'}<br>Pace:
${formatPace(d.total_elapsed_time, poolLengthMultiplier)}<br>SPM:
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
        line: {color: 'purple'}, // Darker shade of --second-color
        yaxis: 'y2'  // Specify the second y-axis
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
            title: 'Pace (min/100m)',
            titlefont: { color: 'black' },
            tickfont: { color: 'black' },
            autorange: 'reversed',
            showticklabels: false
        },
        yaxis2: {
            title: 'Total Strokes',  // Second Y-axis for total strokes
            titlefont: {color: 'purple'},
            tickfont: {color: 'purple'},
            overlaying: 'y',
            side: 'right'
        },
        yaxis3: {
            title: '',  // Y-axis for cadence
            titlefont: {color: 'blue'},
            tickfont: {color: 'blue'},
            overlaying: 'y',  // Overlay the second y-axis on the same plot
            showticklabels: false
        },
        showlegend: false
    };

    // Render the plot
    Plotly.newPlot('pacePlot', [paceData, strokeData, spmData], layout, { displayModeBar: false });
}
