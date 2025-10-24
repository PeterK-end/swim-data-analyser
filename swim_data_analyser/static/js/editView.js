import Plotly from 'plotly.js-basic-dist-min'
import { Encoder, Stream, Profile, Utils } from '@garmin/fitsdk';
import { getItem, saveItem } from './storage.js';

let selectedLabels = [];

// Helper function for formatting seconds to minute:sec
function formatTime(seconds){
    const totalMinutes = Math.floor(seconds / 60);
    const totalSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${totalMinutes}:${totalSeconds.toString().padStart(2, '0')}`;
}

// Helper function to sum specific attributes of objects in an array
function sumAttribute(attribute, entries) {
    return entries.reduce((total, entry) => total + (entry[attribute] || 0), 0);
}

function renumberMessageIndices(modifiedData) {
    const oldToNew = {}; // or Map<number, number[]>

    // renumber and build mapping to old one
    modifiedData.lengthMesgs.forEach((entry, i) => {
        if (!oldToNew[entry.messageIndex]) {
            oldToNew[entry.messageIndex] = [];
        }
        oldToNew[entry.messageIndex].push(i);
        entry.messageIndex = i;
    });

    // Update lap references (pick the first new index if multiple)
    modifiedData.lapMesgs.forEach(lap => {
        if (lap.firstLengthIndex != null && oldToNew[lap.firstLengthIndex]) {
            lap.firstLengthIndex = oldToNew[lap.firstLengthIndex][0];
        }
    });

    return modifiedData;
}

// Helper function to update laps after changes to lengths
async function updateLaps() {
    const data = await getItem('modifiedData');

    if (!data || !data.lengthMesgs || !data.sessionMesgs || !data.lapMesgs) {
        console.error("Missing data in IndexedDB.");
        return;
    }

    const lengths = data.lengthMesgs;
    const laps = data.lapMesgs;
    const updatedLaps = [];

    laps.forEach((lap, i) => {
        const { firstLengthIndex } = lap;

        // ignore empty laps
        if (firstLengthIndex == null) {
            return;
        }

        // Don't modify pause laps (push as is)
        if (lap.numActiveLengths ===0){
            updatedLaps.push(lap);
            return
        }

        // Determine last length index for this lap
        const nextLap = laps[i + 1];
        const lastLengthIndex = nextLap
            ? nextLap.firstLengthIndex - 1
            : lengths[lengths.length - 1]?.messageIndex; // until end if last lap

        if (lastLengthIndex == null || lastLengthIndex < firstLengthIndex) {
            console.warn("Invalid length range for lap:", lap);
            return;
        }

        const lapLengths = lengths.filter(len =>
            len.messageIndex >= firstLengthIndex &&
            len.messageIndex <= lastLengthIndex &&
            len.lengthType === 'active'
        );

        // delete empty laps (no active lengths)
        if (lapLengths.length === 0) {
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

        updatedLaps.push(lap);
    });

    // Replace laps with cleaned, updated list
    data.lapMesgs = updatedLaps;

    await saveItem('modifiedData', data);
}

export async function loadMeta() {
    const data = await getItem('modifiedData');


    if (!data || !data.lengthMesgs || !data.sessionMesgs) {
        console.error("No 'modifiedData' found in IndexedDB or data is complete.");
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
    sessionData.totalTimerTime   = activeTime + restTime;
    sessionData.totalMovingTime = activeTime; // is not used by Garmin Connect
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
    sessionData.avgStrokeDistance = sessionData.totalDistance/sessionData.totalStrokes;

    // Save the updated data back to db
    await saveItem('modifiedData', data);

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
      <strong>Workout Date:</strong>
      <span id="workoutDate">${day} ${daytime}</span>
    </div>
    <div class="metadata-box">
      <strong>Pool Length:</strong>
      <span id="poolLength">${metadata.poolLength}m</span>
    </div>
    <div class="metadata-box">
      <strong>Total Time:</strong>
      <span id="totalTime">${formatTime(metadata.totalElapsedTime)}</span>
    </div>
    <div class="metadata-box">
      <strong>Total Lengths:</strong>
      <span id="numLengths">${activeLengths.length}</span>
    </div>
    <div class="metadata-box">
      <strong>Total Distance:</strong>
      <span id="totalLength">${Math.round(metadata.totalDistance)}m</span>
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
      <strong>Avg. Distance/Stroke:</strong>
      <span id="avgStrokeDistance">${metadata.avgStrokeDistance.toFixed(2)}m</span>
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
        text:  lengthData.map((l, index) => `Length: ${index+1}<br>Stroke: ${l.swimStroke || 'Unknown'}<br>Time: ${l.totalElapsedTime} s`),
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
            tick0: 1,
            dtick: 2,
        },
        yaxis: {
            title: 'Duration (seconds)',
            titlefont: { size: 14 },
            tickfont: { size: 12 },
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
document.getElementById('mergeBtn').addEventListener('click', async function() {
    // check selected Label conditionmessageIndex
    if (selectedLabels.length < 2) {
        alert("Select at least two bars to merge.");
        return;
    }

    // sort the labels to slice them later
    selectedLabels.sort((a, b) => a - b);

    // Get modified data from db
    let modifiedData = await getItem('modifiedData');

    if (!modifiedData || !modifiedData.lengthMesgs) {
        console.error("No 'modifiedData' found in IndexedDB.");
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

    // Update the IndexedDB with the new merged data
    modifiedData.lengthMesgs = remainingLengths;
    renumberMessageIndices(modifiedData);
    await saveItem('modifiedData', modifiedData);

    // Update Lap Records
    updateLaps();

    // Clear selected labels after merging
    selectedLabels = [];

    // Re-render the plot with updated data
    renderEditPlot(modifiedData);
});

document.getElementById('confirmSplits').addEventListener('click', async function() {

    const nSplit = document.getElementById('numberOfSplitsInput').value;

    // Validate the number of splits
    if (isNaN(nSplit) || nSplit < 2 || nSplit > 10) {
        alert("Please enter a number between 2 and 10 for splits.", "error");
        return; // Exit early
    }

    // Get modified data from IndexedDB
    let modifiedData = await getItem('modifiedData');

    if (!modifiedData || !modifiedData.lengthMesgs) {
        console.error("No 'modifiedData' found in IndexedDB.");
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
    const newStrokes = Math.floor(entryToSplit.totalStrokes / nSplit);
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
        };

        splitEntries.push(splitEntry);
    }

    // Replace the original entry with the generated split entries
    modifiedData.lengthMesgs.splice(lengthToSplitIndex, 1, ...splitEntries);

    // Update IndexedDB with modified data
    renumberMessageIndices(modifiedData);
    await saveItem('modifiedData', modifiedData);

    // Clear selected labels after splitting
    selectedLabels = [];

    // Update Lap Records
    updateLaps();

    document.getElementById('numberOfSplitsModal').style.display = 'none';

    // Re-render the plot with updated data
    renderEditPlot(modifiedData);
});

document.getElementById('deleteBtn').addEventListener('click', async function() {

    // Ensure at least one label is selected for deletion
    if (selectedLabels.length < 1) {
        alert("Select at least one length to delete.");
        return;
    }

    // Get the current modified data from IndexedDB
    let modifiedData = await getItem('modifiedData');

    // Filter to only keep the 'length' entries where the messageIndex is not in selectedLabels
    const remainingLengths = modifiedData.lengthMesgs.filter(entry => !selectedLabels.includes(entry.messageIndex));
    modifiedData.lengthMesgs = remainingLengths;

    // Update the modified data with the new length data
    renumberMessageIndices(modifiedData);
    await saveItem('modifiedData', modifiedData);

    // Clear the selected labels after deletion
    selectedLabels = [];

    // Update Lap Records
    updateLaps();

    // Render the updated plot
    renderEditPlot(modifiedData);
});

// Confirm button inside the modal
document.getElementById('confirmStroke').addEventListener('click', async function() {
    // Get the selected stroke from the modal
    const selectedStroke = document.getElementById('strokeSelect').value;

    // Hide the modal
    document.getElementById('strokeModal').style.display = 'none';

    // Get the modified data from IndexedDB
    const modifiedData = await getItem('modifiedData');


    if (!modifiedData || !modifiedData.lengthMesgs) {
        console.error("No 'modifiedData' found in IndexedDB.");
        return;
    }

    // Update swim_stroke for lengths where messageIndex is in selectedLabels
    modifiedData.lengthMesgs = modifiedData.lengthMesgs.map(entry => {
        if (selectedLabels.includes(entry.messageIndex)) {
            return { ...entry, swimStroke: selectedStroke };  // Update stroke
        }
        return entry;  // No changes if messageIndex not in selectedLabels
    });

    // Save the updated data back to IndexedDB
    await saveItem('modifiedData', modifiedData);

    // Reset selectedLabels
    selectedLabels = [];

    // Update Lap Records
    updateLaps();

    // Re-render the plot with updated data
    renderEditPlot(modifiedData);
});

document.getElementById('confirmPoolSize').addEventListener('click', async function() {

    // Get the modified data from IndexedDB
    const modifiedData = await getItem('modifiedData');


    // Get the current pool size from the metadata
    const newPoolSize = parseFloat(document.getElementById('poolSizeEntered').value);
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

    // Update the IndexedDB with the modified data
    await saveItem('modifiedData', modifiedData);

    // Update Lap Records
    updateLaps();

    // Re-render the plot with the updated pool size and data
    renderEditPlot(modifiedData);
});

document.getElementById('undoBtn').addEventListener('click', async function() {
    // Reset selected labels
    selectedLabels = [];

    // Restore modifiedData from originalData
    const originalData = await getItem('originalData');
    await saveItem('modifiedData', originalData);

    // Retrieve and parse the modified data
    const data = await getItem('modifiedData');
    renumberMessageIndices(data);

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
    document.getElementById('downloadModal').style.display = 'block';
});

document.getElementById('cancelDownload').addEventListener('click', function() {
    document.getElementById('downloadModal').style.display = 'none';
});

// Rebuilds message definitions in the Profile for unknown messages
function ensureProfileDefinitions(mesgDefinitions) {
    function onMesgDefinition(mesgDefinition) {
        const mesgNum = mesgDefinition.globalMessageNumber;
        let mesgProfile = Profile.messages[mesgNum];

        if (!mesgProfile) {
            mesgProfile = {
                num: mesgNum,
                name: `mesg${mesgNum}`,
                messagesKey: `mesg${mesgNum}Mesgs`,
                fields: {},
            };
            Profile.messages[mesgNum] = mesgProfile;
        }

        mesgDefinition.fieldDefinitions.forEach((fieldDefinition) => {
            const fieldProfile = mesgProfile.fields[fieldDefinition.fieldDefinitionNumber];
            if (!fieldProfile) {
                mesgProfile.fields[fieldDefinition.fieldDefinitionNumber] = {
                    num: fieldDefinition.fieldDefinitionNumber,
                    name: `field${fieldDefinition.fieldDefinitionNumber}`,
                    type: Utils.BaseTypeToFieldType[fieldDefinition.baseType],
                    baseType: Utils.BaseTypeToFieldType[fieldDefinition.baseType],
                    scale: 1,
                    offset: 0,
                    units: "",
                    bits: [],
                    components: [],
                    isAccumulated: false,
                    hasComponents: false,
                    subFields: [],
                };
            }
        });
    }
    mesgDefinitions.forEach(onMesgDefinition);
}

// Converts modifiedData into a flat message list for export
function prepareExportData(modifiedData) {
    const messageGroups = Object.entries(modifiedData)
        .filter(([key, val]) => Array.isArray(val) && key.endsWith('Mesgs'));
    const allMessages = [];

    for (const [messageName, messages] of messageGroups) {
        const mesgNum = getMesgNumByMessagesKey(messageName);
        if (mesgNum == null) continue;
        for (const fields of messages) allMessages.push({ mesgNum, ...fields });
    }
    return allMessages;
}

// FIT export handler
async function downloadFitFromJson() {
    try {
        const modifiedData = await getItem('modifiedData');
        const mesgDefinitions = await getItem('mesgDefinitions');
        const fieldDescriptions = await getItem('fieldDescriptions');
        if (!modifiedData) return alert("No modified data found in IndexedDB.");

        ensureProfileDefinitions(mesgDefinitions);
        const allMessages = prepareExportData(modifiedData);

        const encoder = new Encoder({ fieldDescriptions });
        allMessages.forEach((msg) => encoder.writeMesg(msg));
        const uint8Array = encoder.close();

        const original = (await getItem('originalFileName')) || "activity.fit";
        const baseName = original.replace(/\.[^.]+$/, "") + "_NEW.fit";

        const blob = new Blob([uint8Array], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = baseName;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error("Encoding FIT failed:", error);
        alert("Failed to encode FIT file.");
    }
}

// JSON export handler
async function downloadJson() {
    try {
        const modifiedData = await getItem('modifiedData');
        const mesgDefinitions = await getItem('mesgDefinitions');
        const fieldDescriptions = await getItem('fieldDescriptions');
        if (!modifiedData) return alert("No data available to download.");

        ensureProfileDefinitions(mesgDefinitions);
        const allMessages = prepareExportData(modifiedData);

        const jsonExport = { messages: allMessages, mesgDefinitions, fieldDescriptions };
        const jsonString = JSON.stringify(jsonExport, null, 2);

        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const original = (await getItem('originalFileName')) || "activity.json";
        const baseName = original.replace(/\.[^.]+$/, "") + "_NEW.json";

        const link = document.createElement('a');
        link.href = url;
        link.download = baseName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Error generating JSON file:", error);
        alert("Failed to generate JSON file.");
    }
}

// Resolves message number from Profile key
function getMesgNumByMessagesKey(messagesKey) {
    const messages = Profile.messages;
    if (typeof messages !== 'object') return null;
    for (const key in messages) {
        const definition = messages[key];
        if (definition.messagesKey === messagesKey) return parseInt(key, 10);
    }
    return null;
}

// Handles download modal confirmation
document.getElementById('confirmDownloadChoice').addEventListener('click', async function() {
    const downloadOption = document.getElementById('downloadSelect').value;
    document.getElementById('downloadModal').style.display = 'none';

    if (downloadOption === "json") {
        await downloadJson();
    } else if (downloadOption === "fit") {
        await downloadFitFromJson();
    } else {
        alert("Please select a valid download option.");
    }
});
