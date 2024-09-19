// static/js/plot.js

let selectedLabels = [];

function loadMeta() {
    fetch('/getCurrentData')
        .then(response => response.json())
        .then(data => {
            const metadata = data.session[0]

            console.log("Metadata:", metadata);

            const date = new Date(metadata.timestamp);
            // Format date based on local timezone (YYYY-MM-DD format)
            const day = date.toLocaleDateString('en-CA'); // 'en-CA' forces YYYY-MM-DD format
            const daytime = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            const totalMinutes = Math.floor(metadata.total_elapsed_time/60);
            const totalSeconds = Math.floor(metadata.total_elapsed_time % 60);

            const paceMinutes = Math.floor(((metadata.total_elapsed_time/(metadata.total_distance/100))/60));
            const paceSeconds = Math.floor(((metadata.total_elapsed_time/(metadata.total_distance/100)) % 60)).toString().padStart(2, '0');


            // Update the content dynamically with fetched metadata
            document.getElementById('metadata-container').innerHTML = `
    <div class="metadata-flex">
    <div class="metadata-box">
      <strong>Pool Length:</strong>
      <span id="poolLength">${metadata.pool_length}m</span>
    </div>
    <div class="metadata-box">
      <strong>Total Time:</strong>
      <span id="totalTime">${totalMinutes}m ${totalSeconds}s</span>
    </div>
    <div class="metadata-box">
      <strong>Total Length:</strong>
      <span id="totalLength">${metadata.total_distance}m</span>
    </div>
    <div class="metadata-box">
      <strong>Workout Date:</strong>
      <span id="workoutDate">${day} ${daytime}</span>
    </div>
    <div class="metadata-box">
      <strong>Avg. Pace:</strong>
      <span id="avgPace">${paceMinutes}:${paceSeconds}min/100m</span>
    </div>
    <div class="metadata-box">
      <strong>Avg. Strokes:</strong>
      <span id="avgStrokes">${Math.floor(metadata.total_strokes/metadata.num_lengths)}/length</span>
    </div>
  </div>
`;
        })
        .catch(error => console.error('Error fetching metadata:', error));
}


function renderEditPlot(data) {
    console.log("Plot data received:", data);

    // Update Metada, reasoning: plot is intitially rendered with
    // default data, every change leads to rerendering of the plot
    loadMeta()

    // Filter data to include only entries where event is 'length' and length_type is 'active'
    const lengthData = data.filter(d => d.event === 'length' && d.length_type === 'active')

    // Define a fixed Viridis color map for swim strokes
    const fixedStrokeColors = {
        breaststroke: '#440154',   // Dark purple
        freestyle: '#3b528b',     // Purple-blue
        backstroke: '#21918c',    // Cyan-green
        butterfly: '#5ec962',     // Green
        // Add more strokes here with fixed values if necessary
        default: '#fde725'        // Yellow
    };

    // Create plot data with the fixed colors for each swim stroke and hover text
    const plotData = [{
        x: lengthData.map((d, index) => index + 1),  // X-axis as the length index (1, 2, 3, etc.)
        y: lengthData.map(d => d.total_elapsed_time || 0),  // Y-axis as 'total_elapsed_time', fallback to 0
        type: 'bar',
        text: lengthData.map(d => `Stroke: ${d.swim_stroke || 'Unknown'}<br>Time: ${d.total_elapsed_time} s`),  // Hover text
        hoverinfo: 'text',  // Show the hover text defined above
        marker: {
            color: lengthData.map((d, index) => {
                const stroke = d.swim_stroke || 'default';  // Get stroke, use default if missing
                const baseColor = fixedStrokeColors[stroke] || fixedStrokeColors['default'];

                // Highlight selected lengths by making the color brighter (adjust brightness for selection)
                return selectedLabels.includes(index) ? 'rgba(255, 127, 14, 1)' : baseColor;  // Highlight with orange
            }),
            opacity: lengthData.map((d, index) => selectedLabels.includes(index) ? 1 : 0.7),  // Full opacity if selected
            line: {
                width: lengthData.map((d, index) => selectedLabels.includes(index) ? 2 : 1),  // Thicker border for selected
                color: lengthData.map((d, index) => selectedLabels.includes(index) ? 'rgba(0, 0, 0, 1)' : 'rgba(0, 0, 0, 0.5)')  // Stronger border color for selected
            }
        }
    }];

    const layout = {
        margin: {
            l: 50,  // Left margin
            r: 50,  // Right margin
            t: 0,   // Top margin
            b: 50   // Bottom margin
        },
        xaxis: {
            title: 'Length',
            titlefont: { size: 14 },
            tickfont: { size: 12 }
        },
        yaxis: {
            title: 'Duration (seconds)',
            titlefont: { size: 14 },
            tickfont: { size: 12 }
        },
        showlegend: false  // No need for a legend if color directly indicates stroke type
    };

    // Render the plot
    Plotly.newPlot('editDataPlot', plotData, layout, { displayModeBar: false });

    // Handle clicking on a plot bar to toggle selection
    const plotElement = document.getElementById('editDataPlot');
    plotElement.on('plotly_click', function(event) {
        const lengthIndex = event.points[0].x - 1;  // Get the index from the x-axis label (0-based)

        // Toggle the selection state of the clicked bar (length)
        if (selectedLabels.includes(lengthIndex)) {
            selectedLabels = selectedLabels.filter(l => l !== lengthIndex);
        } else {
            selectedLabels.push(lengthIndex);
        }

        // Re-render the plot to update the highlighting
        renderEditPlot(data);
    });
}

/*Edit Buttons Listener*/
document.getElementById('mergeBtn').addEventListener('click', function() {
    if (selectedLabels.length < 2) {
        alert("Select at least two bars to merge.");
        return;
    }

    fetch('/merge', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ labels: selectedLabels })
    })
        .then(response => response.json())
        .then(data => {
            selectedLabels = [];
            if (data.length) {
                const lengthData = data.length;
                renderEditPlot(lengthData); // Render the plot with the 'length' data block
            } else {
                console.error("No 'length' data found in the response");
            }
        });
});

document.getElementById('splitBtn').addEventListener('click', function() {

    if (selectedLabels.length > 1) {
        alert("Select a single length to be split.");
        return;
    }

    fetch('/split', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ labels: selectedLabels })
    })
        .then(response => response.json())
        .then(data => {
            selectedLabels = [];
            if (data.length) {
                const lengthData = data.length;
                renderEditPlot(lengthData); // Render the plot with the 'length' data block
            } else {
                console.error("No 'length' data found in the response");
            }
        });

});

// document.getElementById('poolSizeBtn').addEventListener('click', function() {

//     fetch('/changePoolSize', {
//         method: 'POST',
//         headers: {
//             'Content-Type': 'application/json'
//         },
//         body: JSON.stringify({ labels: selectedLabels })
//     })
//         .then(response => response.json())
//         .then(data => {
//             selectedLabels = [];
//             if (data.length) {
//                 const lengthData = data.length;
//                 renderEditPlot(lengthData); // Render the plot with the 'length' data block
//             } else {
//                 console.error("No 'length' data found in the response");
//             }
//         });

// });

document.getElementById('changeStrokeBtn').addEventListener('click', function() {
    // Show the modal
    document.getElementById('strokeModal').style.display = 'block';
});

// Confirm button inside the modal
document.getElementById('confirmStroke').addEventListener('click', function() {
    // Get selected stroke
    const selectedStroke = document.getElementById('strokeSelect').value;

    // Hide the modal
    document.getElementById('strokeModal').style.display = 'none';

    // Send the selected labels and stroke to the server
    fetch('/changeStroke', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ labels: selectedLabels, stroke: selectedStroke })
    })
    .then(response => response.json())
    .then(data => {
        selectedLabels = [];
        if (data.length) {
            const lengthData = data.length;
            renderEditPlot(lengthData); // Render the plot with the 'length' data block
        } else {
            console.error("No 'length' data found in the response");
        }
    });
});

// Cancel button inside the modal
document.getElementById('cancelStroke').addEventListener('click', function() {
    // Hide the modal without doing anything
    document.getElementById('strokeModal').style.display = 'none';
});

document.getElementById('deleteBtn').addEventListener('click', function() {

    if (selectedLabels.length < 1) {
        alert("Select at least on length to delete.");
        return;
    }

    fetch('/deleteLength', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ labels: selectedLabels })
    })
        .then(response => response.json())
        .then(data => {
            selectedLabels = [];
            if (data.length) {
                const lengthData = data.length;
                renderEditPlot(lengthData); // Render the plot with the 'length' data block
            } else {
                console.error("No 'length' data found in the response");
            }
        });

});

document.getElementById('undoBtn').addEventListener('click', function() {

    fetch('/undoChanges', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ labels: selectedLabels })
    })
        .then(response => response.json())
        .then(data => {
            selectedLabels = [];
            if (data.length) {
                const lengthData = data.length;
                renderEditPlot(lengthData); // Render the plot with the 'length' data block
            } else {
                console.error("No 'length' data found in the response");
            }
        });

});

// Renders all analyse plots
document.getElementById('analyseView').addEventListener('click', function() {

    fetch('/getCurrentData')
        .then(response => response.json())
        .then(data => {
            if (data.length) {
                const lengthData = data.length;
                renderPacePlot(lengthData); // Render the plot with the 'length' data block
            } else {
                console.error("No 'length' data found in the response");
            }
        });

});

function renderPacePlot(data) {

    // Filter data to include only entries where event is 'length' and length_type is 'active'
    const lengthData = data.filter(d => d.event === 'length' && d.length_type === 'active');
    // const time = lengthData.total_elapsed_time
    // const distance = lengthData.total_distance
    // const poolLength =

    // const paceMinutes = Math.floor(((/(/))/60));
    // const paceSeconds = Math.floor(((lengthData.total_elapsed_time/(lengthData.total_distance/)) % 60)).toString().padStart(2, '0');


    // Define a fixed Viridis color map for swim strokes
    const fixedStrokeColors = {
        breaststroke: '#440154',   // Dark purple
        freestyle: '#3b528b',     // Purple-blue
        backstroke: '#21918c',    // Cyan-green
        butterfly: '#5ec962',     // Green
        // Add more strokes here with fixed values if necessary
        default: '#fde725'        // Yellow
    };

    const paceData = {
        x: lengthData.map((d, index) => index + 1),
        y: lengthData.map(d => ((d.total_elapsed_time * 2)/60) || 0),  // pace in seconds per unit distance
        name: 'Pace (min/100m)',
        type: 'bar',
        marker: { color: 'lightblue', dash: 'dash' }
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
        xaxis: {title: 'Length Index'},
        yaxis: {
            title: 'Pace (min/100m)',
            titlefont: { color: 'lightblue' },
            tickfont: { color: 'lightblue' },
            autorange: 'reversed'
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
