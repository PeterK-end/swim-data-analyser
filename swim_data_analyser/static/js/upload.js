import FitParser from 'fit-file-parser';
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
    if (parsedData.sports[0]){
        return parsedData.sports[0].sport === 'swimming' && parsedData.sports[0].sub_sport === 'lap_swimming';
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
    // remove laps with no lengths to get rid of redundant lengths information
    reducedData.laps = reducedData.laps.filter(d => d.num_active_lengths > 0);

    if (getSizeKB(reducedData) < maxQuotaKB) {
        displayFlashMessage("File successfully parsed.");
        console.log("Removed laps without active lengths.");
        return reducedData;
    }

    for (const interval of keepIntervals) {

        if (Array.isArray(reducedData.records)) {
            reducedData.records = reducedData.records.filter((_, i) => i % interval === 0);
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
          : `Large file detected — keeping every ${finalInterval}th record for performance.`;

    displayFlashMessage(msg, 'success');
    return finalData;
}

document.getElementById('uploadForm').addEventListener('submit', function(event) {
    event.preventDefault(); // Prevent the default form submission

    const formData = new FormData();
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    if (!file) {
        displayFlashMessage('Please select a file to upload.', 'error');
        return;
    }

    // Check for valid file extension
    const validExtensions = ['.fit'];
    const fileExtension = file.name.slice((file.name.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase();

    if (!validExtensions.includes(`.${fileExtension}`)) {
        displayFlashMessage('Invalid file type. Please upload a .fit file.', 'error');
        return;
    }

    formData.append('file', file);

    // New parsing logic using fit-file-parser
    const reader = new FileReader();

    reader.onload = function(event) {
        const arrayBuffer = event.target.result;

        // Validate FIT file header before parsing
        const headerView = new DataView(arrayBuffer, 0, 14); // Read the first 14 bytes
        const headerSize = headerView.getUint8(0);
        const fileSignature = String.fromCharCode(
            headerView.getUint8(8),
            headerView.getUint8(9),
            headerView.getUint8(10),
            headerView.getUint8(11)
        );

        // Check if the header is correct
        if (headerSize !== 14 || fileSignature !== '.FIT') {
            displayFlashMessage('Invalid FIT file header. Please upload a valid .fit file.', 'error');
            return; // Stop further processing
        }

        const fitParser = new FitParser({
            force: true,
            speedUnit: 'km/h',
            lengthUnit: 'm',
            temperatureUnit: 'celsius',
            pressureUnit: 'bar',
            elapsedRecordField: true,
            mode: 'both',
        });

        fitParser.parse(arrayBuffer, function (error, parsedData) {
            if (error || !parsedData) {
                console.error('Error parsing FIT file:', error);
                displayFlashMessage('Error parsing FIT file.', 'error');
                return;
            }

            if (!isPoolSwimming(parsedData)) {
                displayFlashMessage('The uploaded file is not a pool swimming workout.', 'error');
                return;
            }

            // Session storage is limited to 5MB
            const maxQuotaKB = 2400; // Safety margin for sessionStorage
            const getSizeKB = obj => new Blob([JSON.stringify(obj)]).size / 1024;

            let finalData = parsedData;

            if (getSizeKB(parsedData) > maxQuotaKB) {
                finalData = reduceWorkoutSize(parsedData, maxQuotaKB, getSizeKB);
            }

            // Save
            sessionStorage.setItem('originalData', JSON.stringify(finalData));
            sessionStorage.setItem('modifiedData', JSON.stringify(finalData));
            renderEditPlot(finalData);
        });
    };

    reader.readAsArrayBuffer(file); // Read the file as an ArrayBuffer
});

// Fetch default data and render it when the page loads
function loadDefaultData() {

    fetch('/getDefaultData')
        .then(response => response.json())
        .then(data => {

            sessionStorage.setItem('originalData', JSON.stringify(data));
            sessionStorage.setItem('modifiedData', JSON.stringify(data));

            // Assuming your new data structure has multiple blocks like 'lengths'
            if (data.lengths) {
                renderEditPlot(data);
            } else {
                console.error("No 'length' data found in the response");
            }
        })
        .catch(error => {
            console.error('Error fetching default data:', error);
            displayFlashMessage('Error fetching default data.', 'error');
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
