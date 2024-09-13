// static/js/plot.js

let selectedLabels = [];

function renderPlot(data) {
    console.log("Plot data received:", data);

    // Filter data to include only entries where event is 'length' and length_type is 'active'
    const lengthData = data.filter(d => d.event === 'length' && d.length_type === 'active');

    if (lengthData.length === 0) {
        console.error("No valid 'length' data found.");
        return; // Stop execution if no valid length data
    }

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
    Plotly.newPlot('plot', plotData, layout, { displayModeBar: false });

    // Handle clicking on a plot bar to toggle selection
    const plotElement = document.getElementById('plot');
    plotElement.on('plotly_click', function(event) {
        const lengthIndex = event.points[0].x - 1;  // Get the index from the x-axis label (0-based)

        // Toggle the selection state of the clicked bar (length)
        if (selectedLabels.includes(lengthIndex)) {
            selectedLabels = selectedLabels.filter(l => l !== lengthIndex);
        } else {
            selectedLabels.push(lengthIndex);
        }

        // Re-render the plot to update the highlighting
        renderPlot(data);
    });
}

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
                renderPlot(lengthData); // Render the plot with the 'length' data block
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
                renderPlot(lengthData); // Render the plot with the 'length' data block
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
//                 renderPlot(lengthData); // Render the plot with the 'length' data block
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
            renderPlot(lengthData); // Render the plot with the 'length' data block
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
                renderPlot(lengthData); // Render the plot with the 'length' data block
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
                renderPlot(lengthData); // Render the plot with the 'length' data block
            } else {
                console.error("No 'length' data found in the response");
            }
        });

});
