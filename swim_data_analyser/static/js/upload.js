import FitParser from 'fit-file-parser';
import {renderEditPlot} from './editView.js';

// Declare 'data' as a global variable
let data = null;

// Function to check if the parsed data represents a pool swimming workout
function isPoolSwimming(parsedData) {
    // Check if the sport is swimming and if there is pool length data
    console.log("Parsed Data:", parsedData);
    return parsedData.sports[0].sport === 'swimming' && parsedData.sports[0].sub_sport === 'lap_swimming';
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
            } else {
                // Check if the workout is pool swimming
                if (isPoolSwimming(parsedData)) {
                    displayFlashMessage('File successfully parsed.', 'success');
                    sessionStorage.setItem('originalData', JSON.stringify(parsedData));
                    sessionStorage.setItem('modifiedData', JSON.stringify(parsedData));
                    const lengthsData = parsedData.lengths;
                    renderEditPlot(lengthsData);
                } else {
                    displayFlashMessage('The uploaded file is not a pool swimming workout.', 'error');
                }
            }
        });
    };

    reader.readAsArrayBuffer(file); // Read the file as an ArrayBuffer
});

function displayFlashMessage(message, category) {
    const flashMessage = document.createElement('div');
    flashMessage.className = `flash-message ${category}`;
    flashMessage.textContent = message;

    document.body.appendChild(flashMessage);

    setTimeout(() => {
        flashMessage.remove();
    }, 3000);  // Message disappears after 3 seconds
}

// Fetch default data and render it when the page loads
function loadDefaultData() {

    fetch('/getDefaultData')
        .then(response => response.json())
        .then(data => {

            sessionStorage.setItem('originalData', JSON.stringify(data));
            sessionStorage.setItem('modifiedData', JSON.stringify(data));

            // Assuming your new data structure has multiple blocks like 'lengths'
            if (data.lengths) {
                const lengthData = data.lengths;
                renderEditPlot(lengthData); // Render the plot with the 'lengths' data block
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
            renderEditPlot(data.lengths); // Use existing data if available
        } catch (error) {
            console.error('Error parsing modifiedData:', error);
            loadDefaultData(); // If parsing fails, load default data
        }
    }
});
