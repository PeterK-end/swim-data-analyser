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

// Update laps after changes to lengths
function updateLaps() {
    const data = JSON.parse(sessionStorage.getItem('modifiedData'));

    if (!data || !data.lengthMesgs || !data.sessionMesgs || !data.lapMesgs) {
        console.error("Missing data in sessionStorage.");
        return;
    }

    const lengths = data.lengthMesgs;
    const laps = data.lapMesgs;

    laps.forEach(lap => {
        const { firstLengthIndex, numLengths } = lap;

        // ignore empty laps
        if (firstLengthIndex == null || numLengths == null || numLengths === 0) {
            return;
        }

        const lapLengths = lengths.filter(len =>
            len.messageIndex >= firstLengthIndex &&
            len.messageIndex < firstLengthIndex + numLengths
        );

        if (lapLengths.length === 0) {
            console.warn("No matching lengths found for lap:", lap);
            return;
        }

        const sum = (attr) =>
              lapLengths.reduce((total, len) => total + (len[attr] || 0), 0);

        const totalElapsedTime = sum('totalElapsedTime');
        const totalTimerTime = sum('totalTimerTime');
        const totalStrokes = sum('totalStrokes');
        const totalCalories = sum('totalCalories');
        const totalCycles = totalStrokes; // Assuming 1 cycle = 1 stroke for swimming

        const poolLength = data.sessionMesgs[0]?.poolLength || 25; // Default to 25m if not found
        const totalDistance = lapLengths.length * poolLength;

        // Recalculate average values
        const avgCadence = totalTimerTime > 0 ? (totalStrokes / totalTimerTime) * 60 : 0;
        const avgSpeed = totalTimerTime > 0 ? totalDistance / totalTimerTime : 0;

        // Update lap fields
        lap.totalElapsedTime = totalElapsedTime;
        lap.totalTimerTime = totalTimerTime;
        lap.totalStrokes = totalStrokes;
        lap.totalCalories = totalCalories;
        lap.totalCycles = totalCycles;
        lap.totalDistance = totalDistance;
        lap.numActiveLengths = lapLengths.length;
        lap.numLengths = lapLengths.length;
        lap.avgCadence = Math.round(avgCadence);
        lap.avgSpeed = avgSpeed;
        lap.enhancedAvgSpeed = avgSpeed;
    });

    sessionStorage.setItem('modifiedData', JSON.stringify(data));
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
    sessionData.totalDistance = activeLengths.length * sessionData.poolLength;
    const restTime   = lengths.filter(l => l.lengthType === 'idle')
          .reduce((acc, l) => acc + l.totalElapsedTime, 0);
    sessionData.totalTimerTime   = activeTime;            // Moving Time
    sessionData.totalElapsedTime = activeTime + restTime; // Elapsed Time
    sessionData.totalStrokes = lengths.reduce((acc, entry) => {
        const strokes = entry.totalStrokes || 0; // Fallback to 0 if totalStrokes is undefined or null
        return acc + strokes;
    }, 0);
    sessionData.numActiveLengths = activeLengths.length;

    const speedMps = activeTime > 0 ? (sessionData.totalDistance / activeTime) : 0;
    sessionData.avgSpeed = speedMps;
    sessionData.enhancedAvgSpeed = speedMps;

    // Find fastest active length (highest avgSpeed)
    const fastestLength = activeLengths.reduce((best, l) =>
        (l.avgSpeed || 0) > (best.avgSpeed || 0) ? l : best, { avgSpeed: 0 });
    sessionData.enhancedMaxSpeed = fastestLength.avgSpeed || 0;

    // Save the updated data back to sessionStorage
    sessionStorage.setItem('modifiedData', JSON.stringify(data));

    // Extract metadata for display
    const metadata = sessionData;

    // Format date and time
    const date = new Date(metadata.timestamp);
    const day = date.toLocaleDateString('en-CA'); // 'en-CA' forces YYYY-MM-DD format
    const daytime = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    // Pace calculation
    const pace100mSec  = speedMps > 0 ? 100 / speedMps   : 0;
    const pace100ydSec = speedMps > 0 ? 91.44 / speedMps : 0;
    const isYards = sessionData.poolLengthUnit === 'statute';
    const poolLabel = isYards ? 'yd' : 'm';

    // Calculate average strokes per active length
    const avgStrokesPerLength = sessionData.numActiveLengths > 0
          ? Math.floor(metadata.totalStrokes / sessionData.numActiveLengths)
          : 0;

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
      <span id="totalLength">${metadata.totalDistance.toFixed(2)}m</span>
    </div>
    <div class="metadata-box">
      <strong>Avg. Pace:</strong>
      <span id="avgPace">${
  isYards ? `${formatTime(pace100ydSec)}/100yd`
          : `${formatTime(pace100mSec)}/100m`
}</span>
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
    // Update Metadata
    loadMeta();
    // console.log(data);

    const fixedStrokeColors = {
        breaststroke: '#A8D8EA',
        freestyle: '#AA96DA',
        backstroke: '#FCBAD3',
        butterfly: '#FFFFD2',
        default: '#fde725'
    };

    const lengths = data.lengthMesgs;
    const laps = data.lapMesgs.filter(d => d.numActiveLengths > 0);
    const lengthData = lengths.filter(d => d.event === 'length' && d.lengthType === 'active');

    const yValues = lengthData.map(d => d.totalElapsedTime || 0);
    const maxY = Math.max(...yValues) + 2; // Add 2s for lap indicator height

    // === LAP INDICATORS ===
    const lapShapes = [];
    const lapAnnotations = [];

    laps.forEach((lap, i) => {
        const lapStartIndex = lengthData.findIndex(l => l.messageIndex === lap.firstLengthIndex);
        if (lapStartIndex === -1) return;

        const x = lapStartIndex + 1;

        lapShapes.push({
            type: 'line',
            x0: x,
            x1: x,
            y0: 0,
            y1: maxY,
            line: {
                color: 'black',
                width: 2,
                dash: 'dot'
            }
        });

        lapAnnotations.push({
            x: x,
            y: maxY,
            text: `${i + 1}`,
            showarrow: false,
            yanchor: 'bottom',
            font: {
                color: 'black',
                size: 12
            }
        });
    });

    const plotData = [{
        x: lengthData.map((_, index) => index + 1),
        y: yValues,
        type: 'bar',
        text: lengthData.map(d => `Stroke: ${d.swimStroke || 'Unknown'}<br>Time: ${d.totalElapsedTime} s`),
        hoverinfo: 'text',
        textposition: 'none',
        marker: {
            color: lengthData.map((d) => {
                const stroke = d.swimStroke || 'default';
                const baseColor = fixedStrokeColors[stroke] || fixedStrokeColors['default'];
                return selectedLabels.includes(d.messageIndex) ? '#2A4D69' : baseColor;
            }),
            opacity: lengthData.map((d) => selectedLabels.includes(d.messageIndex) ? 1 : 0.9),
            line: {
                width: lengthData.map((d) => selectedLabels.includes(d.messageIndex) ? 2 : 1),
                color: lengthData.map((d) => selectedLabels.includes(d.messageIndex) ? 'rgba(0, 0, 0, 1)' : 'rgba(0, 0, 0, 0.5)')
            }
        },
    }];

    const layout = {
        margin: {
            l: 50,
            r: 50,
            t: 0,
            b: 50
        },
        xaxis: {
            title: 'Length',
            titlefont: { size: 14 },
            tickfont: { size: 12 },
        },
        yaxis: {
            title: 'Duration (seconds)',
            titlefont: { size: 14 },
            tickfont: { size: 12 }
        },
        showlegend: false,
        shapes: lapShapes,
        annotations: lapAnnotations,
    };

    Plotly.newPlot('editDataPlot', plotData, layout, { displayModeBar: false });

    const plotElement = document.getElementById('editDataPlot');
    plotElement.on('plotly_click', function (event) {
        const displayedIndex = event.points[0].x - 1;
        const messageIndexValue = lengthData[displayedIndex].messageIndex;

        if (selectedLabels.includes(messageIndexValue)) {
            selectedLabels = selectedLabels.filter(l => l !== messageIndexValue);
        } else {
            selectedLabels.push(messageIndexValue);
        }

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
    selectedLabels.sort((a, b) => a - b);

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
        avgSpeed: modifiedData.sessionMesgs[0].poolLength / sumAttribute('totalTimerTime', lengthsToMerge),
        avgSwimmingCadence: Math.round(sumAttribute('totalStrokes', lengthsToMerge) / (sumAttribute('totalTimerTime', lengthsToMerge)/60), 0),
        messageIndex: Math.min(...lengthsToMerge.map(entry => entry.messageIndex)),
    };
    const toRemove = selectedLabels.slice(1);

    // Filter out the merged lengths from the data based on messageIndex and keep the first entry
    const remainingLengths = modifiedData.lengthMesgs.filter(entry =>
        !toRemove.includes(entry.messageIndex)
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

    // Adjust laps if their firstLengthIndex was merged
    modifiedData.lapMesgs.forEach(lap => {
        // Check if the lap’s firstLengthIndex was among the removed lengths
        if (toRemove.includes(lap.firstLengthIndex)) {
            // Try to move lap start to the next messageIndex (e.g., increment by 1)
            const nextMsgIndex = lap.firstLengthIndex + 1;
            const nextExists = remainingLengths.some(l => l.messageIndex === nextMsgIndex);

            if (nextExists) {
                lap.firstLengthIndex = nextMsgIndex;
            } else {
                console.warn(`Cannot adjust lap start index for lap at index ${lap.firstLengthIndex} – next messageIndex does not exist.`);
            }
        }
    });

    // Update the sessionStorage with the new merged data
    modifiedData.lengthMesgs = remainingLengths;
    sessionStorage.setItem('modifiedData', JSON.stringify(modifiedData));

    // Update Lap Records
    updateLaps();

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
    const newStrokes = Math.floor(Math.floor(entryToSplit.totalStrokes / nSplit));
    const newTimerTime = entryToSplit.totalTimerTime / nSplit;
    const poolLength = modifiedData.sessionMesgs[0].poolLength;


    // Create nSplit entries
    const splitEntries = [];

    for (let i = 0; i < nSplit; i++) {
        const splitEntry = {
            ...entryToSplit,
            avgSpeed: poolLength / newTimerTime,
            avgSwimmingCadence: Math.round(newStrokes / (newTimerTime/60), 0),
            totalElapsedTime: entryToSplit.totalElapsedTime / nSplit,
            totalTimerTime: newTimerTime,
            totalStrokes: newStrokes,
            totalCalories: entryToSplit.totalCalories / nSplit,
            messageIndex: entryToSplit.messageIndex + i * splitOffset
        };

        splitEntries.push(splitEntry);
    }

    // Replace the original entry with the generated split entries
    modifiedData.lengthMesgs.splice(lengthToSplitIndex, 1, ...splitEntries);

    // Update sessionStorage with modified data
    sessionStorage.setItem('modifiedData', JSON.stringify(modifiedData));

    // Clear selected labels after splitting
    selectedLabels = [];

    // Update Lap Records
    updateLaps();

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

    // Update Lap Records
    updateLaps();

    // Render the updated plot
    renderEditPlot(modifiedData);
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
            return { ...entry, swimStroke: selectedStroke };  // Update stroke
        }
        return entry;  // No changes if messageIndex not in selectedLabels
    });

    // Save the updated data back to sessionStorage
    sessionStorage.setItem('modifiedData', JSON.stringify(modifiedData));

    // Reset selectedLabels
    selectedLabels = [];

    // Update Lap Records
    updateLaps();

    // Re-render the plot with updated data
    renderEditPlot(modifiedData);
});

document.getElementById('confirmPoolSize').addEventListener('click', function() {

    // Get the modified data from sessionStorage
    const modifiedData = JSON.parse(sessionStorage.getItem('modifiedData'));

    // Get the current pool size from the metadata
    const newPoolSize = document.getElementById('poolSizeEntered').value;
    const currentPoolSize = modifiedData.sessionMesgs[0].poolLength;

    // Hide the modal
    document.getElementById('poolSizeModal').style.display = 'none';

    // Adjust the relevant values in the lengths data
    modifiedData.lengthMesgs = modifiedData.lengthMesgs.map(entry => {
        return {
            ...entry,
            avgSpeed: newPoolSize / entry.totalTimerTime,
        };
    });
    // Update the pool size in the modifiedData object
    modifiedData.sessionMesgs[0].poolLength = newPoolSize;

    // Update Lap Records
    updateLaps();

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

document.getElementById('exportBtn').addEventListener('click', function() {

});

// Download

document.getElementById('exportBtn').addEventListener('click', function() {
    document.getElementById('downloadModal').style.display = 'block';
});

document.getElementById('cancelDownload').addEventListener('click', function() {
    document.getElementById('downloadModal').style.display = 'none';
});

// Encode the JS-Object to fit with Garmin-SDK
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

            } catch (err) {
                console.warn(`Skipping unknown message: ${message}`, err.message);
            }
        }

        const encoder = new Encoder();

        mesgs.forEach((mesg) => {
            encoder.writeMesg(mesg);
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
