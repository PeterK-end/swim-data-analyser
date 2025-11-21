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

document.addEventListener("DOMContentLoaded", () => {

    const fileInput = document.getElementById("fileInput");
    const fileName = document.getElementById("fileName");
    const dropZone = document.getElementById("uploadDropZone");

    if (!fileInput || !fileName || !dropZone) {
        console.error("Upload elements not found in DOM");
        return;
    }

    // Update filename when chosen via dialog
    fileInput.addEventListener("change", () => {
        fileName.textContent = fileInput.files.length
            ? fileInput.files[0].name
            : "No file chosen";
    });

    // Prevent default browser behavior
    ["dragenter", "dragover", "dragleave", "drop"].forEach(event => {
        dropZone.addEventListener(event, e => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    // Add subtle highlight
    ["dragenter", "dragover"].forEach(event => {
        dropZone.addEventListener(event, () => dropZone.classList.add("dragover"));
    });
    ["dragleave", "drop"].forEach(event => {
        dropZone.addEventListener(event, () => dropZone.classList.remove("dragover"));
    });

    // Handle files dropped
    dropZone.addEventListener("drop", e => {
        if (!e.dataTransfer.files.length) return;

        fileInput.files = e.dataTransfer.files;
        fileName.textContent = e.dataTransfer.files[0].name;
    });
});

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
        renderEditPlot(finalData);
    });
});

// Load default data on startup
async function loadDefaultData() {
    try {
        const response = await fetch('static/data/example.fit');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const blob = await response.blob();
        const file = new File([blob], 'example.fit', { type: 'application/octet-stream' });
        parseFitFile(file, async (finalData) => {
            await saveItem('originalData', finalData);
            await saveItem('modifiedData', finalData);
            renderEditPlot(finalData);
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
            renderEditPlot(modifiedData);
        } catch (error) {
            console.error('Error rendering stored data:', error);
            await loadDefaultData();
        }
    }
});
