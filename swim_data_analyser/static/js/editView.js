import Plotly from 'plotly.js-basic-dist-min'

let selectedLabels = [];

// Helper function for formatting seconds to minute:sec
function formatTime(seconds){
    const totalMinutes = Math.floor(seconds / 60);
    const totalSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${totalMinutes}:${totalSeconds.toString().padStart(2, '0')}`;
}

// Utility function to sum specific attributes of objects in an array
function sumAttribute(attribute, entries) {
    return entries.reduce((total, entry) => total + (entry[attribute] || 0), 0);
}

export function loadMeta() {
    const data = JSON.parse(sessionStorage.getItem('modifiedData'));

    if (!data || !data.lengths || !data.sessions) {
        console.error("No 'modifiedData' found in sessionStorage.");
        return;
    }

    const lengths = data.lengths;
    const sessionData = data.sessions[0];

    // Filter active lengths
    const activeLengths = lengths.filter(entry => entry.event === 'length' && entry.length_type === 'active');

    // Recalculate session metadata
    sessionData.total_elapsed_time = lengths.reduce((acc, entry) => acc + entry.total_elapsed_time, 0);
    sessionData.total_distance = activeLengths.length * sessionData.pool_length; // Total distance is based on pool length and active lengths
    sessionData.total_strokes = lengths.reduce((acc, entry) => {
        const strokes = entry.total_strokes || 0; // Fallback to 0 if total_strokes is undefined or null
        return acc + strokes;
    }, 0);
    sessionData.num_active_lengths = activeLengths.length;

    // Save the updated data back to sessionStorage
    sessionStorage.setItem('modifiedData', JSON.stringify(data));

    // Extract metadata for display
    const metadata = sessionData;

    // Format date and time
    const date = new Date(metadata.timestamp);
    const day = date.toLocaleDateString('en-CA'); // 'en-CA' forces YYYY-MM-DD format
    const daytime = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    // Pace calculation
    const activeTime = activeLengths.reduce((acc, length) => acc + length.total_elapsed_time, 0);
    const pace = (activeTime/metadata.total_distance)*100;

    // Calculate average strokes per active length
    const avgStrokesPerLength = Math.floor(metadata.total_strokes / sessionData.num_active_lengths);

    // Update the content dynamically with recalculated metadata
    document.getElementById('metadata-container').innerHTML = `
    <div class="metadata-flex">
    <div class="metadata-box">
      <strong>Pool Length:</strong>
      <span id="poolLength">${metadata.pool_length}m</span>
    </div>
    <div class="metadata-box">
      <strong>Total Time:</strong>
      <span id="totalTime">${formatTime(metadata.total_elapsed_time)}m</span>
    </div>
    <div class="metadata-box">
      <strong>Total Lengths:</strong>
      <span id="numLengths">${activeLengths.length}</span>
    </div>
    <div class="metadata-box">
      <strong>Total Distance:</strong>
      <span id="totalLength">${metadata.total_distance}m</span>
    </div>
    <div class="metadata-box">
      <strong>Workout Date:</strong>
      <span id="workoutDate">${day} ${daytime}</span>
    </div>
    <div class="metadata-box">
      <strong>Avg. Pace:</strong>
      <span id="avgPace">${formatTime(pace)}</span>
    </div>
    <div class="metadata-box">
      <strong>Avg. SPL:</strong>
      <span id="avgStrokes">${avgStrokesPerLength}/length</span>
    </div>
    <div class="metadata-box">
      <strong>Avg. Heartrate</strong>
      <span id="avgStrokes">${metadata.avg_heart_rate} bpm</span>
    </div>
    <div class="metadata-box">
      <strong>Calories</strong>
      <span id="avgStrokes">${metadata.total_calories} kcal</span>
    </div>
  </div>
`;
}

export function renderEditPlot(data) {

    // Update Metadata (e.g., for loading new plot)
    loadMeta();

    // Filter data to include only entries where event is 'length' and length_type is 'active'
    const lengths = data.lengths;
    const lengthData = lengths.filter(d => d.event === 'length' && d.length_type === 'active');

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

// Edit Buttons Listener for Merge
document.getElementById('mergeBtn').addEventListener('click', function() {
    // check selected Label condition
    if (selectedLabels.length < 2) {
        alert("Select at least two bars to merge.");
        return;
    }

    // sort the labels to slice them later
    selectedLabels.sort();

    // Get modified data from sessionStorage
    const modifiedData = JSON.parse(sessionStorage.getItem('modifiedData'));

    if (!modifiedData || !modifiedData.lengths) {
        console.error("No 'modifiedData' found in sessionStorage.");
        return;
    }

    // Extract the lengths of type 'active' that will be merged based on message_index.value
    const lengthsToMerge = modifiedData.lengths.filter(entry =>
        selectedLabels.includes(entry.message_index.value)
    );

    if (lengthsToMerge.length < 2) {
        console.error("Selected labels do not match enough lengths for merging.");
        return;
    }

    // Create a new merged entry based on selected lengths
    const newEntry = {
        ...lengthsToMerge[0],  // Copy all properties from first entry
        total_elapsed_time: sumAttribute('total_elapsed_time', lengthsToMerge),
        total_timer_time: sumAttribute('total_timer_time', lengthsToMerge),
        total_strokes: sumAttribute('total_strokes', lengthsToMerge),
        total_calories: sumAttribute('total_calories', lengthsToMerge),
        avg_speed: sumAttribute('avg_speed', lengthsToMerge) / lengthsToMerge.length,
        avg_swimming_cadence: sumAttribute('avg_swimming_cadence', lengthsToMerge) / lengthsToMerge.length,
        message_index: { value: Math.min(...lengthsToMerge.map(entry => entry.message_index.value)) },
        event_group: null
    };

    // Filter out the merged lengths from the data based on message_index.value and keep the first entry
    const remainingLengths = modifiedData.lengths.filter(entry =>
        !selectedLabels.slice(1).includes(entry.message_index.value)
    );

    // Find index of first selected length to place merged entry
    const firstIndexLength = remainingLengths.findIndex(entry =>
        entry.message_index.value === Math.min(...selectedLabels)
    );

    if (firstIndexLength === -1) {
        console.error("First index length for insertion not found.");
        return;
    }

    // Replace first length with merged entry
    remainingLengths.splice(firstIndexLength, 1, newEntry);

    // Update the sessionStorage with the new merged data
    modifiedData.lengths = remainingLengths;
    sessionStorage.setItem('modifiedData', JSON.stringify(modifiedData));

    // Clear selected labels after merging
    selectedLabels = [];

    // Re-render the plot with updated data
    renderEditPlot(modifiedData);
});

document.getElementById('splitBtn').addEventListener('click', function() {
    if (selectedLabels.length !== 1) {
        alert("Select a single length to be split.");
        return;
    }

    // Get modified data from sessionStorage
    const modifiedData = JSON.parse(sessionStorage.getItem('modifiedData'));

    if (!modifiedData || !modifiedData.lengths) {
        console.error("No 'modifiedData' found in sessionStorage.");
        return;
    }

    // Find the length that matches the selected label (using message_index.value)
    const labelToSplit = selectedLabels[0];
    const lengthToSplitIndex = modifiedData.lengths.findIndex(entry =>
        entry.message_index.value === labelToSplit
    );

    if (lengthToSplitIndex === -1) {
        console.error("Selected label not found in lengths.");
        return;
    }

    // Get the entry to be split
    const entryToSplit = modifiedData.lengths[lengthToSplitIndex];

    // Create split entries by adjusting values
    const splitEntry = {
        ...entryToSplit,  // Copy all properties from original entry
        total_elapsed_time: entryToSplit.total_elapsed_time / 2,
        total_timer_time: entryToSplit.total_timer_time / 2,
        total_strokes: Math.floor(entryToSplit.total_strokes / 2),
        total_calories: entryToSplit.total_calories / 2,
        event_group: null
    };

    // Create second split entry with incremented message_index
    const secondSplitEntry = {
        ...splitEntry,
        // Increment message_index.value (by 0.01 because the index
        // value should still fall in the old intervall)
        message_index: { value: entryToSplit.message_index.value + 0.01 }
    };

    // Insert the split entries in place of the original
    modifiedData.lengths.splice(lengthToSplitIndex, 1, splitEntry, secondSplitEntry);

    // Update sessionStorage with modified data
    sessionStorage.setItem('modifiedData', JSON.stringify(modifiedData));

    // Clear selected labels after splitting
    selectedLabels = [];

    // Re-render the plot with updated data
    renderEditPlot(modifiedData);
});


document.getElementById('deleteBtn').addEventListener('click', function() {

    // Ensure at least one label is selected for deletion
    if (selectedLabels.length < 1) {
        alert("Select at least one length to delete.");
        return;
    }

    // Get the current modified data from sessionStorage
    const modifiedData = JSON.parse(sessionStorage.getItem('modifiedData'));

    // Filter to only keep the 'length' entries where the messageIndex.value is not in selectedLabels
    const remainingLengths = modifiedData.lengths.filter(entry => !selectedLabels.includes(entry.message_index.value));
    modifiedData.lengths = remainingLengths;

    // Update the modified data with the new length data
    sessionStorage.setItem('modifiedData', JSON.stringify(modifiedData));

    // Clear the selected labels after deletion
    selectedLabels = [];

    // Render the updated plot
    renderEditPlot(modifiedData);
});

// Event listener for choosing poolsize/stroke options
document.getElementById('changeStrokeBtn').addEventListener('click', function() {
    document.getElementById('strokeModal').style.display = 'block';
});

document.getElementById('cancelStroke').addEventListener('click', function() {
    document.getElementById('strokeModal').style.display = 'none';
});

document.getElementById('togglePoolSizeBtn').addEventListener('click', function() {
    document.getElementById('poolSizeModal').style.display = 'block';
});

document.getElementById('cancelPoolSize').addEventListener('click', function() {
    document.getElementById('poolSizeModal').style.display = 'none';
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
    renderEditPlot(modifiedData);
});

document.getElementById('confirmPoolSize').addEventListener('click', function() {

    // Get the modified data from sessionStorage
    const modifiedData = JSON.parse(sessionStorage.getItem('modifiedData'));

    // Get the current pool size from the metadata
    const newPoolSize = parseInt(document.getElementById('poolSizeSelect').value);
    const currentPoolSize = modifiedData.sessions[0].pool_length;

    // Hide the modal
    document.getElementById('poolSizeModal').style.display = 'none';


    if (!modifiedData || !modifiedData.lengths) {
        console.error("No 'modifiedData' found in sessionStorage.");
        return;
    }

    // Adjust the relevant values in the lengths data
    modifiedData.lengths = modifiedData.lengths.map(entry => {
        const adjustmentFactor = currentPoolSize / newPoolSize ;
        return {
            ...entry,
            total_distance: entry.total_distance * adjustmentFactor,
        };
    });
    // Update the pool size in the modifiedData object
    modifiedData.sessions[0].pool_length = newPoolSize;

    // Update the sessionStorage with the modified data
    sessionStorage.setItem('modifiedData', JSON.stringify(modifiedData));

    // Re-render the plot with the updated pool size and data
    renderEditPlot(modifiedData);
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
        renderEditPlot(data); // Render the plot with the length data
    } else {
        console.error("No 'length' data found in the original data.");
    }
});

document.getElementById('exportBtn').addEventListener('click', function() {
    const data = sessionStorage.getItem('modifiedData');
    if (!data) {
        console.error("No 'modifiedData' found in sessionStorage.");
        return;
    }

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'workout-data.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

document.getElementById('downloadFitBtn').addEventListener('click', function() {
    const modifiedData = JSON.parse(sessionStorage.getItem('modifiedData'));
    console.log(modifiedData);

    if (!modifiedData) {
        alert("No workout data available to export.");
        return;
    }

    // Helper function to get the CSRF token from cookies
    function getCookie(name) {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.startsWith(name + '=')) {
                return cookie.substring(name.length + 1);
            }
        }
        return null;
    }

    const csrfToken = getCookie('csrftoken'); // Retrieve the CSRF token from cookies

    fetch('/encode_js_object_to_fit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken // Add the CSRF token to the headers
        },
        body: JSON.stringify(modifiedData)
    })
        .then(response => {
        if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
        }
        return response.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'activity.fit';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    })
    .catch(error => {
        console.error('Error downloading FIT file:', error);
        alert('Failed to download FIT file.');
    });
});
