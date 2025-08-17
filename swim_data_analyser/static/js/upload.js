import JSZip from "jszip";
import { Decoder, Stream, Profile, Utils } from '@garmin/fitsdk';
import {renderEditPlot} from './editView.js';

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
    // Check if the sport is swimming and if there is pool length data
    if (parsedData.sportMesgs && parsedData.sportMesgs[0]){
        return parsedData.sportMesgs[0].sport === 'swimming' && parsedData.sportMesgs[0].subSport === 'lapSwimming';
    } else {
        //can't check will fail later (probably) -> reason: some swim
        //workouts don't include this but can be parsed anyway
        return true;
    }
}

// Try to fit the workout into session memory with 5MB limit
function reduceWorkoutSize(parsedData, maxQuotaKB, getSizeKB) {
    const keepIntervals = [2, 3, 4, 5, 6]; // Try these in order

    let finalData = null;
    let finalInterval = null;

    const reducedData = structuredClone(parsedData);

    if (getSizeKB(reducedData) < maxQuotaKB) {
        displayFlashMessage("File successfully parsed.");
        console.log("Removed laps without active lengths.");
        return reducedData;
    }

    for (const interval of keepIntervals) {

        if (Array.isArray(reducedData.recordMesgs)) {
            reducedData.recordMesgs = reducedData.recordMesgs.filter((_, i) => i % interval === 0);
        }

        const sizeKB = getSizeKB(reducedData);
        console.log(`Attempt with every ${interval}th record: ${sizeKB.toFixed(2)} KB`);

        if (sizeKB <= maxQuotaKB) {
            finalData = reducedData;
            finalInterval = interval;
            break;
        }
    }

    if (!finalData) {
        console.error('Unable to store FIT file: exceeds browser storage limits.');
        displayFlashMessage('The FIT file is too large to store in browser memory.', 'error');
        return;
    }

    const msg = finalInterval === 1
          ? 'File successfully parsed.'
          : `Large file detected — keeping every ${finalInterval}th heartrate record for performance.`;

    displayFlashMessage(msg, 'success');
    return finalData;
}

// Parsing with Garmin-SDK
function parseFitFile(file, onSuccess) {
    const extension = file.name.slice(((file.name.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase();

    // Special case: ZIP input (Garmin Connect "Export file")
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

                if (fitFiles.length > 1) {
                    displayFlashMessage(`Multiple .fit files found, using ${fitFiles[0].name}`, "warning");
                }

                const fitBlob = await fitFiles[0].async("blob");
                const fitFile = new File([fitBlob], fitFiles[0].name, { type: "application/octet-stream" });

                // Continue as if the user uploaded this .fit file directly
                runFitDecoding(fitFile, onSuccess);
            } catch (err) {
                console.error("Error reading zip file:", err);
                displayFlashMessage("Invalid or corrupted zip file.", "error");
            }
        };
        reader.readAsArrayBuffer(file);
        return;
    }

    // Normal case: FIT input
    if (extension === "fit") {
        runFitDecoding(file, onSuccess);
    } else {
        displayFlashMessage("Invalid file type. Please upload a .fit or .zip file.", "error");
    }
}

// helper: runs the decoding pipeline, always on a FIT file
function runFitDecoding(file, onSuccess) {
    const reader = new FileReader();

    reader.onload = function (e) {
        const arrayBuffer = e.target.result;
        const byteArray = new Uint8Array(arrayBuffer);
        const stream = Stream.fromByteArray(byteArray);
        const decoder = new Decoder(stream);

        if (!decoder.isFIT()) {
            displayFlashMessage("Invalid FIT file.", "error");
            return;
        }

        const result = decoder.read();

        if (!result || result.errors?.length) {
            console.error("Error decoding FIT:", result.errors);
            displayFlashMessage("Error decoding FIT file.", "error");
            return;
        }

        // const removeTopLevelKeys = (dataObject, keysToRemove = []) => {
        //     const cleanedData = structuredClone(dataObject);
        //     for (const key of keysToRemove) {
        //         delete cleanedData[key];
        //     }
        //     return cleanedData;
        // };

        const parsedData = result.messages;

        if (!isPoolSwimming(parsedData)) {
            displayFlashMessage("This is not a pool swimming workout.", "error");
            return;
        }

        const maxQuotaKB = 2400;
        const getSizeKB = obj => new Blob([JSON.stringify(obj)]).size / 1024;

        let finalData = parsedData;
        if (getSizeKB(parsedData) > maxQuotaKB) {
            finalData = reduceWorkoutSize(parsedData, maxQuotaKB, getSizeKB);
            if (!finalData) return;
        }

        onSuccess(finalData);
    };

    // Start reading the file (this kicks off async operation)
    reader.readAsArrayBuffer(file);
}

document.getElementById('uploadForm')?.addEventListener('submit', (event) => {
    event.preventDefault();

    const fileInput = document.getElementById('fileInput');
    const file = fileInput?.files?.[0];

    if (!file) {
        displayFlashMessage('Please select a file to upload.', 'error');
        return;
    }

    parseFitFile(file, (finalData) => {
        sessionStorage.setItem('originalData', JSON.stringify(finalData));
        sessionStorage.setItem('modifiedData', JSON.stringify(finalData));
        renderEditPlot(finalData);
    });
});

// Fetch default data and render it when the page loads
function loadDefaultData() {
    fetch('static/data/example.fit')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            const file = new File([blob], 'example.fit', { type: 'application/octet-stream' });
            parseFitFile(file, (finalData) => {
                sessionStorage.setItem('originalData', JSON.stringify(finalData));
                sessionStorage.setItem('modifiedData', JSON.stringify(finalData));
                renderEditPlot(finalData);
            });
        })
        .catch(error => {
            console.error('Error loading default FIT file:', error);
            displayFlashMessage('Error loading default FIT file.', 'error');
        });
}

document.addEventListener('DOMContentLoaded', function() {
    const modifiedData = sessionStorage.getItem('modifiedData');

    // Check if 'modifiedData' is null or an empty string
    if (!modifiedData || modifiedData === 'null' || modifiedData === '') {
        // Fetch the default data if no file was uploaded
        loadDefaultData();
    } else {
        // Render the plot with the existing 'data'
        try {
            const data = JSON.parse(modifiedData);
            renderEditPlot(data); // Use existing data if available
        } catch (error) {
            console.error('Error parsing modifiedData:', error);
            loadDefaultData(); // If parsing fails, load default data
        }
    }
});
