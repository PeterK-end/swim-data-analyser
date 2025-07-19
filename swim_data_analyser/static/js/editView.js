import Plotly from 'plotly.js-basic-dist-min'
import { Encoder, Stream, Profile, Utils } from '@garmin/fitsdk';

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

    if (!data || !data.lengthMesgs || !data.sessionMesgs) {
        console.error("No 'modifiedData' found in sessionStorage or data is complete.");
        return;
    }

    const lengths = data.lengthMesgs;
    const sessionData = data.sessionMesgs[0];

    // Filter active lengths
    const activeLengths = lengths.filter(entry => entry.event === 'length' && entry.lengthType === 'active');
    const activeTime = activeLengths.reduce((acc, length) => acc + length.totalElapsedTime, 0);

    // Recalculate session metadata
    sessionData.totalElapsedTime = lengths.reduce((acc, entry) => acc + entry.totalElapsedTime, 0);
    sessionData.total_distance = activeLengths.length * sessionData.poolLength; // Total distance is based on pool length and active lengths
    sessionData.totalStrokes = lengths.reduce((acc, entry) => {
        const strokes = entry.totalStrokes || 0; // Fallback to 0 if totalStrokes is undefined or null
        return acc + strokes;
    }, 0);
    sessionData.num_active_lengths = activeLengths.length;
    sessionData.enhanced_avgSpeed = (sessionData.totalDistance/activeTime) *3.6
    //TODO: update sessionData.enhanced_max_speed based on laps (or fastest lengths?)

    // Save the updated data back to sessionStorage
    sessionStorage.setItem('modifiedData', JSON.stringify(data));

    // Extract metadata for display
    const metadata = sessionData;

    // Format date and time
    const date = new Date(metadata.timestamp);
    const day = date.toLocaleDateString('en-CA'); // 'en-CA' forces YYYY-MM-DD format
    const daytime = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    // Pace calculation
    const pace = (activeTime/metadata.totalDistance)*100;

    // Calculate average strokes per active length
    const avgStrokesPerLength = Math.floor(metadata.totalStrokes / sessionData.num_active_lengths);

    // Update the content dynamically with recalculated metadata
    document.getElementById('metadata-container').innerHTML = `
    <div class="metadata-flex">
    <div class="metadata-box">
      <strong>Pool Length:</strong>
      <span id="poolLength">${metadata.poolLength}m</span>
    </div>
    <div class="metadata-box">
      <strong>Total Time:</strong>
      <span id="totalTime">${formatTime(metadata.totalElapsedTime)}m</span>
    </div>
    <div class="metadata-box">
      <strong>Total Lengths:</strong>
      <span id="numLengths">${activeLengths.length}</span>
    </div>
    <div class="metadata-box">
      <strong>Total Distance:</strong>
      <span id="totalLength">${metadata.totalDistance}m</span>
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
      <span id="avgStrokes">${metadata.avgHeartRate} bpm</span>
    </div>
    <div class="metadata-box">
      <strong>Calories</strong>
      <span id="avgStrokes">${metadata.totalCalories} kcal</span>
    </div>
  </div>
`;
}

export function renderEditPlot(data) {

    // Update Metadata (e.g., for loading new plot)
    loadMeta();
    console.log("data_object", data);

    // Filter data to include only entries where event is 'length' and lengthType is 'active'
    const lengths = data.lengthMesgs;
    const lengthData = lengths.filter(d => d.event === 'length' && d.lengthType === 'active');

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
        y: lengthData.map(d => d.totalElapsedTime || 0),  // Y-axis as 'totalElapsedTime', fallback to 0
        type: 'bar',
        text: lengthData.map(d => `Stroke: ${d.swimStroke || 'Unknown'}<br>Time: ${d.totalElapsedTime} s`),  // Hover text
        hoverinfo: 'text',  // Show the hover text defined above
        textposition: 'none', // Prevent the text from being shown on the bars
        marker: {
            color: lengthData.map((d) => {
                const stroke = d.swimStroke || 'default';  // Get stroke, use default if missing
                const baseColor = fixedStrokeColors[stroke] || fixedStrokeColors['default'];

                // Highlight selected lengths by making the color brighter (adjust brightness for selection)
                return selectedLabels.includes(d.messageIndex) ? '#2A4D69' : baseColor;  // Highlight with Navy Teal
            }),
            opacity: lengthData.map((d) => selectedLabels.includes(d.messageIndex) ? 1 : 0.9),  // Full opacity if selected
            line: {
                width: lengthData.map((d) => selectedLabels.includes(d.messageIndex) ? 2 : 1),  // Thicker border for selected
                color: lengthData.map((d) => selectedLabels.includes(d.messageIndex) ? 'rgba(0, 0, 0, 1)' : 'rgba(0, 0, 0, 0.5)')  // Stronger border color for selected
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
        const messageIndexValue = lengthData[displayedIndex].messageIndex;

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
    // check selected Label conditionmessageIndex
    if (selectedLabels.length < 2) {
        alert("Select at least two bars to merge.");
        return;
    }

    // sort the labels to slice them later
    selectedLabels.sort();

    // Get modified data from sessionStorage
    const modifiedData = JSON.parse(sessionStorage.getItem('modifiedData'));

    if (!modifiedData || !modifiedData.lengthMesgs) {
        console.error("No 'modifiedData' found in sessionStorage.");
        return;
    }

    // Extract the lengths of type 'active' that will be merged based on messageIndex
    const lengthsToMerge = modifiedData.lengthMesgs.filter(entry =>
        selectedLabels.includes(entry.messageIndex)
    );

    if (lengthsToMerge.length < 2) {
        console.error("Selected labels do not match enough lengths for merging.");
        return;
    }

    // Create a new merged entry based on selected lengths
    const newEntry = {
        ...lengthsToMerge[0],  // Copy all properties from first entry
        totalElapsedTime: sumAttribute('totalElapsedTime', lengthsToMerge),
        totalTimerTime: sumAttribute('totalTimerTime', lengthsToMerge),
        totalStrokes: sumAttribute('totalStrokes', lengthsToMerge),
        totalCalories: sumAttribute('totalCalories', lengthsToMerge),
        avgSpeed: sumAttribute('avgSpeed', lengthsToMerge) / lengthsToMerge.length,
        avgSwimmingCadence: sumAttribute('avgSwimmingCadence', lengthsToMerge) / lengthsToMerge.length,
        messageIndex: Math.min(...lengthsToMerge.map(entry => entry.messageIndex)),
    };

    // Filter out the merged lengths from the data based on messageIndex and keep the first entry
    const remainingLengths = modifiedData.lengthMesgs.filter(entry =>
        !selectedLabels.slice(1).includes(entry.messageIndex)
    );

    // Find index of first selected length to place merged entry
    const firstIndexLength = remainingLengths.findIndex(entry =>
        entry.messageIndex === Math.min(...selectedLabels)
    );

    if (firstIndexLength === -1) {
        console.error("First index length for insertion not found.");
        return;
    }

    // Replace first length with merged entry
    remainingLengths.splice(firstIndexLength, 1, newEntry);

    // Update the sessionStorage with the new merged data
    modifiedData.lengthMesgs = remainingLengths;
    sessionStorage.setItem('modifiedData', JSON.stringify(modifiedData));

    // Clear selected labels after merging
    selectedLabels = [];

    // Re-render the plot with updated data
    renderEditPlot(modifiedData);
});

document.getElementById('confirmSplits').addEventListener('click', function() {

    const nSplit = document.getElementById('numberOfSplitsInput').value;
    const splitOffset = nSplit/1000;

    // Validate the number of splits
    if (isNaN(nSplit) || nSplit < 2 || nSplit > 10) {
        alert("Please enter a number between 2 and 10 for splits.", "error");
        return; // Exit early
    }

    // Get modified data from sessionStorage
    const modifiedData = JSON.parse(sessionStorage.getItem('modifiedData'));

    if (!modifiedData || !modifiedData.lengthMesgs) {
        console.error("No 'modifiedData' found in sessionStorage.");
        return;
    }

    // Find the length that matches the selected label (using messageIndex)
    const labelToSplit = selectedLabels[0];
    const lengthToSplitIndex = modifiedData.lengthMesgs.findIndex(entry =>
        entry.messageIndex === labelToSplit
    );

    if (lengthToSplitIndex === -1) {
        console.error("Selected label not found in lengths.");
        return;
    }

    // Get the entry to be split
    const entryToSplit = modifiedData.lengthMesgs[lengthToSplitIndex];

    // Create nSplit entries
    const splitEntries = [];

    for (let i = 0; i < nSplit; i++) {
        const splitEntry = {
            ...entryToSplit,
            totalElapsedTime: entryToSplit.totalElapsedTime / nSplit,
            totalTimerTime: entryToSplit.totalTimerTime / nSplit,
            totalStrokes: Math.floor(entryToSplit.totalStrokes / nSplit),
            totalCalories: entryToSplit.totalCalories / nSplit,
            messageIndex: {
                value: entryToSplit.messageIndex + i * splitOffset
            }
        };

        splitEntries.push(splitEntry);
    }

    // Replace the original entry with the generated split entries
    modifiedData.lengthMesgs.splice(lengthToSplitIndex, 1, ...splitEntries);

    // Update sessionStorage with modified data
    sessionStorage.setItem('modifiedData', JSON.stringify(modifiedData));

    // Clear selected labels after splitting
    selectedLabels = [];

    document.getElementById('numberOfSplitsModal').style.display = 'none';

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

    // Filter to only keep the 'length' entries where the messageIndex is not in selectedLabels
    const remainingLengths = modifiedData.lengthMesgs.filter(entry => !selectedLabels.includes(entry.messageIndex));
    modifiedData.lengthMesgs = remainingLengths;

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

document.getElementById('splitBtn').addEventListener('click', function() {
    if (selectedLabels.length !== 1) {
        alert("Select a single length to be split.");
        return;
    }
    document.getElementById('numberOfSplitsModal').style.display = 'block';
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

document.getElementById('cancelSplits').addEventListener('click', function() {
    document.getElementById('numberOfSplitsModal').style.display = 'none';
});


// Confirm button inside the modal
document.getElementById('confirmStroke').addEventListener('click', function() {
    // Get the selected stroke from the modal
    const selectedStroke = document.getElementById('strokeSelect').value;

    // Hide the modal
    document.getElementById('strokeModal').style.display = 'none';

    // Get the modified data from sessionStorage
    const modifiedData = JSON.parse(sessionStorage.getItem('modifiedData'));

    if (!modifiedData || !modifiedData.lengthMesgs) {
        console.error("No 'modifiedData' found in sessionStorage.");
        return;
    }

    // Update swim_stroke for lengths where messageIndex is in selectedLabels
    modifiedData.lengthMesgs = modifiedData.lengthMesgs.map(entry => {
        if (selectedLabels.includes(entry.messageIndex)) {
            return { ...entry, swim_stroke: selectedStroke };  // Update stroke
        }
        return entry;  // No changes if messageIndex not in selectedLabels
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
    const currentPoolSize = modifiedData.sessionMesgs[0].poolLength;

    // Hide the modal
    document.getElementById('poolSizeModal').style.display = 'none';


    if (!modifiedData || !modifiedData.lengthMesgs) {
        console.error("No 'modifiedData' found in sessionStorage.");
        return;
    }

    // Adjust the relevant values in the lengths data
    modifiedData.lengthMesgs = modifiedData.lengthMesgs.map(entry => {
        const adjustmentFactor = currentPoolSize / newPoolSize ;
        return {
            ...entry,
            totalDistance: entry.totalDistance * adjustmentFactor,
        };
    });
    // Update the pool size in the modifiedData object
    modifiedData.sessionMesgs[0].poolLength = newPoolSize;

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
    if (data && data.lengthMesgs) {
        renderEditPlot(data); // Render the plot with the length data
    } else {
        console.error("No 'length' data found in the original data.");
    }
});

document.getElementById('exportBtn').addEventListener('click', function() {

});

// Download

document.getElementById('exportBtn').addEventListener('click', function() {
    document.getElementById('downloadModal').style.display = 'block';
});

document.getElementById('cancelDownload').addEventListener('click', function() {
    document.getElementById('downloadModal').style.display = 'none';
});

document.getElementById('downloadSelect').addEventListener('change', function() {
    var fitWarning = document.getElementById('fitWarning');
    if (this.value === 'fit') {
        fitWarning.style.display = 'block';
    } else {
        fitWarning.style.display = 'none';
    }
});

// Replace this function in your code
function downloadFitFromJson(nestedData) {

    function convertTimeFieldsToDate(obj) {
        const timeFields = [
            "timestamp",
            "timeCreated",
            "startTime",
            "endTime",
            "localTimestamp",
            "eventTimestamp",
            "triggerTimestamp",
            "systemTimestamp",
        ];

        const result = {};

        for (const [key, value] of Object.entries(obj)) {
            if (timeFields.includes(key) && typeof value === "string") {
                const date = new Date(value);
                if (!isNaN(date)) {
                    result[key] = date;
                } else {
                    console.warn(`Invalid date for key "${key}": ${value}`);
                    result[key] = value; // leave untouched if invalid
                }
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    function convertNestedToFlatMessages(nestedJson) {
        const flat = [];

        for (const [messageName, messages] of Object.entries(nestedJson)) {
            if (!Array.isArray(messages)) continue;
            for (const fields of messages) {
                flat.push({
                    message: messageName,
                    fields: fields,
                });
            }
        }

        return flat;
    }

    function getMesgNumByMessagesKey(messagesKey) {
        const messages = Profile.messages;

        if (typeof messages !== 'object') {
            console.error("Profile.messages is not an object");
            return null;
        }

        for (const key in messages) {
            if (!messages.hasOwnProperty(key)) continue;

            const definition = messages[key];
            if (definition.messagesKey === messagesKey) {
                return parseInt(key, 10); // message number is the key
            }
        }

        return null; // not found
    }

    try {
        const flatMessages = convertNestedToFlatMessages(nestedData);
        const mesgs = [];
        // const DOUGHNUTS_EARNED_KEY = 0;
        // const HEART_RATE_KEY = 1;

        // Create the Developer Id message for the developer data fields.
        const developerDataIdMesg = {
            mesgNum: Profile.MesgNum.DEVELOPER_DATA_ID,
            applicationId: Array(16).fill(0), // In practice, this should be a UUID converted to a byte array
            applicationVersion: 1,
            developerDataIndex: 0,
        };
        mesgs.push(developerDataIdMesg);

        for (const { message, fields } of flatMessages) {
            try {
                const mesgNum = getMesgNumByMessagesKey(message);

                // Convert time strings to Date objects
                const convertedFields = convertTimeFieldsToDate(fields);

                // Only push if record is not empty
                if (fields && Object.keys(fields).length > 0) {
                    const mesg = {
                        mesgNum: mesgNum,
                        ...convertedFields,
                    };

                    mesgs.push(mesg);
                }

                // console.log("messages, decoded", mesg);
            } catch (err) {
                console.warn(`Skipping unknown message: ${message}`, err.message);
            }
        }

        const encoder = new Encoder();

        mesgs.forEach((mesg) => {
            const mesgS = mesg;
            console.log("hello");
            console.log(mesgS);
            encoder.writeMesg(mesgS);
        });

        const uint8Array = encoder.close();
        const blob = new Blob([uint8Array], { type: 'application/octet-stream' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'activity.fit';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Encoding FIT failed:', error);
        alert('Failed to encode FIT file.');
    }
}

document.getElementById('confirmDownloadChoice').addEventListener('click', function() {
    const downloadOption = document.getElementById('downloadSelect').value;

    // Hide the modal
    document.getElementById('downloadModal').style.display = 'none';

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

    if (downloadOption === "json") {
        const data = sessionStorage.getItem('modifiedData');

        if (!data) {
            console.error("No 'modifiedData' found in sessionStorage.");
            alert("No data available to download.");
            return;
        }

        try {
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = 'workout-data.json';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url); // Revoke the object URL after download
        } catch (error) {
            console.error("Error generating JSON file:", error);
            alert("Failed to generate JSON file.");
        }
    } else if (downloadOption === "fit") {
        const data = sessionStorage.getItem('modifiedData');

        if (!data) {
            console.error("No 'modifiedData' found in sessionStorage.");
            alert("No data available to download.");
            return;
        }

        try {
            const modifiedData = JSON.parse(data); // Ensure data is parsed into an object

            downloadFitFromJson(modifiedData)

        } catch (error) {
            console.error("Error preparing data for FIT download:", error);
            alert("Invalid data format for FIT download.");
        }
    } else {
        alert("Please select a valid download option.");
    }
});
