import JSZip from "jszip";
import { Decoder, Encoder, Stream, Profile, Utils } from '@garmin/fitsdk';
import { renderEditPlot } from './editView.js';
import { getItem, saveItem } from './storage.js';

// Helper for communicating to the user
function displayFlashMessage(message, category) {
    const flashMessage = document.createElement('div');
    flashMessage.className = `flash-message ${category}`;
    flashMessage.textContent = message;

    document.body.appendChild(flashMessage);

    setTimeout(() => {
        flashMessage.remove();
    }, 3000);  // Message disappears after 3 seconds
}

// Function to check if the parsed data represents a pool swimming workout
function isPoolSwimming(parsedData) {
    if (parsedData.sportMesgs && parsedData.sportMesgs[0]) {
        return parsedData.sportMesgs[0].sport === 'swimming' &&
               parsedData.sportMesgs[0].subSport === 'lapSwimming';
    } else {
        // can't check, will fail later (probably)
        return true;
    }
}

// Some devices (e.g. Suunto) write laps and lengths without the index
// fields that link them (messageIndex, firstLengthIndex, numLengths,
// numActiveLengths). Their lap start/elapsed times are also shifted
// against the lengths, so lengths are assigned by count instead: each lap
// takes the next totalDistance / poolLength active lengths plus the rests
// that follow them (Suunto keeps rests inside the swim lap; Garmin-style
// rest laps with distance 0 take them instead). Files that already carry
// the fields are left untouched.
//
// The assignment is only written if it checks out: every length used,
// every swim lap filled, and each lap's active swim time matching its
// totalTimerTime. Otherwise laps stay unlinked (no intervals) rather than
// showing wrong ones. Returns false in that case.
const LAP_TIMER_TOLERANCE_S = 1;

function fillMissingLapLengthIndices(parsedData) {
    const lengths = parsedData.lengthMesgs;
    const laps = parsedData.lapMesgs;
    const poolLength = parsedData.sessionMesgs?.[0]?.poolLength;
    if (!lengths?.length || !laps?.length) return true;

    if (lengths.every(l => l.messageIndex == null)) {
        lengths.forEach((l, i) => { l.messageIndex = i; });
    }
    if (laps.every(l => l.messageIndex == null)) {
        laps.forEach((l, i) => { l.messageIndex = i; });
    }

    if (laps.some(l => l.firstLengthIndex != null)) return true;
    if (!poolLength) return false;

    const assignment = [];
    let next = 0;
    laps.forEach((lap, i) => {
        const first = next;
        const wanted = Math.round((lap.totalDistance ?? 0) / poolLength);
        let active = 0;
        while (next < lengths.length && active < wanted) {
            if (lengths[next].lengthType === 'active') active++;
            next++;
        }
        // Trailing rests stay in this lap unless a rest lap follows to own
        // them; a rest lap followed by another rest lap keeps a single one
        const nextIsRestLap = i < laps.length - 1 && !laps[i + 1].totalDistance;
        let rests = !nextIsRestLap ? Infinity : (wanted === 0 ? 1 : 0);
        while (rests-- > 0 && next < lengths.length && lengths[next].lengthType === 'idle') next++;

        assignment.push({ lap, first, slice: lengths.slice(first, next), wanted });
    });

    const matches = next === lengths.length && assignment.every(({ lap, slice, wanted }) => {
        const active = slice.filter(l => l.lengthType === 'active');
        if (active.length !== wanted) return false;
        if (wanted === 0 || lap.totalTimerTime == null) return true;
        const swimTime = active.reduce((s, l) => s + (l.totalTimerTime ?? 0), 0);
        return Math.abs(swimTime - lap.totalTimerTime) <= LAP_TIMER_TOLERANCE_S;
    });

    if (!matches) {
        console.warn('Laps could not be matched to lengths; leaving them unlinked.');
        return false;
    }

    for (const { lap, first, slice } of assignment) {
        lap.firstLengthIndex = first;
        lap.numLengths = slice.length;
        lap.numActiveLengths = slice.filter(l => l.lengthType === 'active').length;
    }
    return true;
}

// Parsing with Garmin-SDK
function parseFitFile(file, onSuccess) {
    const extension = file.name.split('.').pop().toLowerCase();

    if (extension === "zip") {
        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                const zip = await JSZip.loadAsync(e.target.result);
                const fitFiles = Object.values(zip.files).filter(f => f.name.toLowerCase().endsWith(".fit"));
                if (fitFiles.length === 0) {
                    displayFlashMessage("No .fit file found inside zip.", "error");
                    return;
                }
                const fitBlob = await fitFiles[0].async("blob");
                const fitFile = new File([fitBlob], fitFiles[0].name, { type: "application/octet-stream" });
                await runFitDecoding(fitFile, onSuccess);
            } catch (err) {
                console.error("Error reading zip file:", err);
                displayFlashMessage("Invalid or corrupted zip file.", "error");
            }
        };
        reader.readAsArrayBuffer(file);
        return;
    }

    if (extension === "fit") {
        runFitDecoding(file, onSuccess);
    } else {
        displayFlashMessage("Invalid file type. Please upload a .fit or .zip file.", "error");
    }
}

// helper: runs the decoding pipeline, always on a FIT file
async function runFitDecoding(file, onSuccess) {
    const reader = new FileReader();

    reader.onload = async function (e) {
        const arrayBuffer = e.target.result;
        const byteArray = new Uint8Array(arrayBuffer);
        const stream = Stream.fromByteArray(byteArray);
        const decode = new Decoder(stream);

        const mesgDefinitions = [];
        const fieldDescriptions = {};

        if (!decode.isFIT()) {
            displayFlashMessage("Invalid FIT file.", "error");
            return;
        }

        const { messages, errors } = decode.read({
            expandComponents: false,
            mergeHeartRates: false,
            expandSubFields: false,
            converDateTimesToDates: false,
            mesgDefinitionListener: (mesgDefinition) => {
                onMesgDefinition(mesgDefinition);
                mesgDefinitions.push(mesgDefinition);
            },
            fieldDescriptionListener: (key, developerDataIdMesg, fieldDescriptionMesg) => {
                fieldDescriptions[key] = { developerDataIdMesg, fieldDescriptionMesg };
            },
        });

        // Save parsed structures to IndexedDB
        await saveItem('mesgDefinitions', mesgDefinitions);
        await saveItem('fieldDescriptions', fieldDescriptions);
        await saveItem('originalFileName', file.name);

        if (!messages || errors?.length) {
            displayFlashMessage("Error decoding FIT file.", "error");
            return;
        }

        errors.forEach((error) => {
            console.error(error.name, error.message, JSON.stringify(error?.cause, null, 2));
        });

        const parsedData = messages;

        function onMesgDefinition(mesgDefinition) {
            const mesgNum = mesgDefinition.globalMessageNumber;
            let mesgProfile = Profile.messages[mesgDefinition.globalMessageNumber];
            if (mesgProfile == null) {
                mesgProfile = {
                    num: mesgNum,
                    name: `mesg${mesgNum}`,
                    messagesKey: `mesg${mesgNum}Mesgs`,
                    fields: {},
                };
                Profile.messages[mesgDefinition.globalMessageNumber] = mesgProfile;
            }

            mesgDefinition.fieldDefinitions.forEach((fieldDefinition) => {
                if (!mesgProfile.fields[fieldDefinition.fieldDefinitionNumber]) {
                    mesgProfile.fields[fieldDefinition.fieldDefinitionNumber] = {
                        num: fieldDefinition.fieldDefinitionNumber,
                        name: `field${fieldDefinition.fieldDefinitionNumber}`,
                        type: Utils.BaseTypeToFieldType[fieldDefinition.baseType],
                        baseType: Utils.BaseTypeToFieldType[fieldDefinition.baseType],
                        array: fieldDefinition.size / fieldDefinition.baseTypeSize > 1,
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

        if (!isPoolSwimming(parsedData)) {
            displayFlashMessage("This is not a pool swimming workout.", "error");
            return;
        }

        if (!fillMissingLapLengthIndices(parsedData)) {
            displayFlashMessage("Laps could not be matched to lengths, intervals are unavailable for this file.", "error");
        }

        await saveItem('originalData', parsedData);
        await saveItem('modifiedData', parsedData);
        onSuccess(parsedData);
    };

    reader.readAsArrayBuffer(file);
}

// Upload form handler
document.getElementById('uploadForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fileInput = document.getElementById('fileInput');
    const file = fileInput?.files?.[0];

    if (!file) {
        displayFlashMessage('Please select a file to upload.', 'error');
        return;
    }

    parseFitFile(file, async (finalData) => {
        await saveItem('originalData', finalData);
        await saveItem('modifiedData', finalData);
        renderEditPlot();
    });
});

// Load default data on startup
async function loadDefaultData() {
    try {
        const response = await fetch('/data/example.fit');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const blob = await response.blob();
        const file = new File([blob], 'example.fit', { type: 'application/octet-stream' });
        parseFitFile(file, async (finalData) => {
            await saveItem('originalData', finalData);
            await saveItem('modifiedData', finalData);
            renderEditPlot();
        });
    } catch (error) {
        console.error('Error loading default FIT file:', error);
        displayFlashMessage('Error loading default FIT file.', 'error');
    }
}

// Initialize on DOM ready
// Stored data can be unusable, e.g. left over from another app version
function isUsableActivity(data) {
    return Array.isArray(data?.lengthMesgs) &&
           Array.isArray(data?.lapMesgs) &&
           data?.sessionMesgs?.[0] != null;
}

document.addEventListener('DOMContentLoaded', async function () {
    const modifiedData = await getItem('modifiedData');

    if (!isUsableActivity(modifiedData)) {
        if (modifiedData) {
            console.warn('Stored activity is incomplete, loading the demo file instead.');
            displayFlashMessage('Your last activity could not be restored. Please load your file again.', 'info');
        }
        await loadDefaultData();
    } else {
        try {
            renderEditPlot();
        } catch (error) {
            console.error('Error rendering stored data:', error);
            await loadDefaultData();
        }
    }
});
