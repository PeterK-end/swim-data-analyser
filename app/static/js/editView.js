import Plotly from 'plotly.js-basic-dist-min'

// static/js/plot.js
let selectedLabels = [];

export function loadMeta() {

    const data = JSON.parse(sessionStorage.getItem('modifiedData'));
    const metadata = data.sessions[0];

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
      <span id="avgStrokes">${Math.floor(metadata.total_cycles/metadata.num_active_lengths)}/length</span>
    </div>
  </div>
`;
}

export function renderEditPlot(data) {

    // Update Metadata (e.g., for loading new plot)
    loadMeta();

    // Filter data to include only entries where event is 'length' and length_type is 'active'
    const lengthData = data.filter(d => d.event === 'length' && d.length_type === 'active');

    // Define a fixed Viridis color map for swim strokes
    const fixedStrokeColors = {
        breaststroke: '#A8D8EA',
        freestyle: '#AA96DA',
        backstroke: '#FCBAD3',
        butterfly: '#FFFFD2',
        default: '#fde725'        // Yellow
    };

    // Create plot data with the fixed colors for each swim stroke and hover text
    const plotData = [{
        x: lengthData.map((_, index) => index + 1),  // X-axis as the length index (1, 2, 3, etc.)
        y: lengthData.map(d => d.total_elapsed_time || 0),  // Y-axis as 'total_elapsed_time', fallback to 0
        type: 'bar',
        text: lengthData.map(d => `Stroke: ${d.swim_stroke || 'Unknown'}<br>Time: ${d.total_elapsed_time} s`),  // Hover text
        hoverinfo: 'text',  // Show the hover text defined above
        textposition: 'none', // Prevent the text from being shown on the bars
        marker: {
            color: lengthData.map((d) => {
                const stroke = d.swim_stroke || 'default';  // Get stroke, use default if missing
                const baseColor = fixedStrokeColors[stroke] || fixedStrokeColors['default'];

                // Highlight selected lengths by making the color brighter (adjust brightness for selection)
                return selectedLabels.includes(d.message_index.value) ? '#2A4D69' : baseColor;  // Highlight with Navy Teal
            }),
            opacity: lengthData.map((d) => selectedLabels.includes(d.message_index.value) ? 1 : 0.9),  // Full opacity if selected
            line: {
                width: lengthData.map((d) => selectedLabels.includes(d.message_index.value) ? 2 : 1),  // Thicker border for selected
                color: lengthData.map((d) => selectedLabels.includes(d.message_index.value) ? 'rgba(0, 0, 0, 1)' : 'rgba(0, 0, 0, 0.5)')  // Stronger border color for selected
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
        const displayedIndex = event.points[0].x - 1;  // Get the index from the x-axis label (0-based)
        const messageIndexValue = lengthData[displayedIndex].message_index.value;

        // Toggle the selection state of the clicked bar (length)
        if (selectedLabels.includes(messageIndexValue)) {
            selectedLabels = selectedLabels.filter(l => l !== messageIndexValue);
        } else {
            selectedLabels.push(messageIndexValue);
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
    // Get the selected stroke from the modal
    const selectedStroke = document.getElementById('strokeSelect').value;

    // Hide the modal
    document.getElementById('strokeModal').style.display = 'none';

    // Get the modified data from sessionStorage
    const modifiedData = JSON.parse(sessionStorage.getItem('modifiedData'));

    if (!modifiedData || !modifiedData.lengths) {
        console.error("No 'modifiedData' found in sessionStorage.");
        return;
    }
    console.log("Selected Lengths:", selectedLabels);

    // Update swim_stroke for lengths where message_index is in selectedLabels
    modifiedData.lengths = modifiedData.lengths.map(entry => {
        if (selectedLabels.includes(entry.message_index.value)) {
            return { ...entry, swim_stroke: selectedStroke };  // Update stroke
        }
        return entry;  // No changes if message_index not in selectedLabels
    });

    // Save the updated data back to sessionStorage
    sessionStorage.setItem('modifiedData', JSON.stringify(modifiedData));

    // Reset selectedLabels
    selectedLabels = [];

    // Re-render the plot with updated data
    renderEditPlot(modifiedData.lengths);
});

// Cancel button inside the modal
document.getElementById('cancelStroke').addEventListener('click', function() {
    // Hide the modal without doing anything
    document.getElementById('strokeModal').style.display = 'none';
});

document.getElementById('deleteBtn').addEventListener('click', function() {

    // Ensure at least one label is selected for deletion
    if (selectedLabels.length < 1) {
        alert("Select at least one length to delete.");
        return;
    }

    // Get the current modified data from sessionStorage
    const modifiedData = JSON.parse(sessionStorage.getItem('modifiedData'));

    console.log("selecteLabels:", selectedLabels);
    console.log("Full Data:", modifiedData.lengths);
    // Filter to only keep the 'length' entries where the messageIndex.value is not in selectedLabels
    const newLengthData = modifiedData.lengths.filter(entry => !selectedLabels.includes(entry.message_index.value));
    console.log("Data with deleted Data:", newLengthData);

    // Update the modified data with the new length data
    modifiedData.lengths = newLengthData;
    sessionStorage.setItem('modifiedData', JSON.stringify(modifiedData));

    // Clear the selected labels after deletion
    selectedLabels = [];

    // Render the updated plot
    renderEditPlot(newLengthData);
    console.log("Selected lengths deleted successfully.");
});

document.getElementById('undoBtn').addEventListener('click', function() {
    // Reset selected labels
    selectedLabels = [];

    // Restore modifiedData from originalData
    sessionStorage.setItem('modifiedData', sessionStorage.getItem('originalData'));

    // Retrieve and parse the modified data
    const data = JSON.parse(sessionStorage.getItem('modifiedData'));

    // Check if data exists before rendering
    if (data && data.lengths) {
        renderEditPlot(data.lengths); // Render the plot with the length data
    } else {
        console.error("No 'length' data found in the original data.");
    }
});
