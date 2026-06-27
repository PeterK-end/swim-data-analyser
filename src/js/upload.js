import JSZip from "jszip";
import { Decoder, Encoder, Stream, Profile, Utils } from '@garmin/fitsdk';
import { renderEditPlot } from './editView.js';
import * as OpenWaterView from './openWaterView.js';
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

// Classifies the parsed activity so the UI can pick the right editor.
// Returns 'pool', 'openWater' or 'other'.
function classifyActivity(parsedData) {
    const subSport = parsedData.sportMesgs?.[0]?.subSport
                  ?? parsedData.sessionMesgs?.[0]?.subSport;
    const sport = parsedData.sportMesgs?.[0]?.sport
               ?? parsedData.sessionMesgs?.[0]?.sport;

    if (subSport === 'openWater') return 'openWater';
    if (subSport === 'lapSwimming') return 'pool';
    // No sport/subSport info: keep previous lenient behavior and assume pool.
    if (sport == null && subSport == null) return 'pool';
    return 'other';
}

// Renders the editor matching the stored activity type.
async function renderActivity() {
    const activityType = await getItem('activityType');
    if (activityType === 'openWater') {
        await OpenWaterView.render();
    } else {
        // Restore the pool editor UI in case an open-water swim was shown before.
        const show = (id, display) => {
            const el = document.getElementById(id);
            if (el) el.style.display = display;
        };
        show('openWaterEditor', 'none');
        show('editPlot', 'block');
        show('metadata-container', 'block');
        show('poolEditHint', 'block');
        show('analyseView', '');
        renderEditPlot();
    }
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

        const activityType = classifyActivity(parsedData);
        if (activityType === 'other') {
            displayFlashMessage("This is not a supported swim (pool or open water).", "error");
            return;
        }

        await saveItem('activityType', activityType);
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

    parseFitFile(file, async () => {
        await renderActivity();
    });
});

// Load default data on startup
async function loadDefaultData() {
    try {
        const response = await fetch('/data/example.fit');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const blob = await response.blob();
        const file = new File([blob], 'example.fit', { type: 'application/octet-stream' });
        parseFitFile(file, async () => {
            await renderActivity();
        });
    } catch (error) {
        console.error('Error loading default FIT file:', error);
        displayFlashMessage('Error loading default FIT file.', 'error');
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async function () {
    const modifiedData = await getItem('modifiedData');

    if (!modifiedData) {
        await loadDefaultData();
    } else {
        try {
            await renderActivity();
        } catch (error) {
            console.error('Error rendering stored data:', error);
            await loadDefaultData();
        }
    }
});
