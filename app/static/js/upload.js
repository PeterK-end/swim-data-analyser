// Declare 'data' as a global variable
let data = null;

console.log('upload.js loaded');

// Handle the form submission for file upload
document.getElementById('uploadForm').addEventListener('submit', function(event) {
    event.preventDefault(); // Prevent the default form submission

    const formData = new FormData();
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    if (!file) {
        displayFlashMessage('Please select a file to upload.', 'error');
        return;
    }

    formData.append('file', file);

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(fitData => {
        if (fitData.error) {
            displayFlashMessage(fitData.error, 'error');
        } else {
            displayFlashMessage('File successfully uploaded and parsed!', 'success');

            // Assign the received data to the global 'data' variable
            data = fitData;

            // Assuming your new data structure has multiple blocks like 'length'
            if (data.length) {
                const lengthData = data.length;
                renderPlot(lengthData); // Render the plot with the 'length' data block
            } else {
                console.error("No 'length' data found in the response");
            }
        }
    })
    .catch(error => {
        console.error('Error during upload:', error);
        displayFlashMessage('An error occurred during file upload.', 'error');
    });
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
    fetch('/get_default_data')
        .then(response => response.json())
        .then(fitData => {
            // Assign the fetched data to the global 'data' variable
            data = fitData;

            // Assuming your new data structure has multiple blocks like 'length'
            if (data.length) {
                const lengthData = data.length;
                renderPlot(lengthData); // Render the plot with the 'length' data block
            } else {
                console.error("No 'length' data found in the response");
            }
        })
        .catch(error => {
            console.error('Error fetching default data:', error);
            displayFlashMessage('Error fetching default data.', 'error');
        });
}

// Call loadDefaultData on page load if no file is uploaded
document.addEventListener('DOMContentLoaded', function() {
    // Check if 'data' is already available (e.g., after file upload)
    // If not, load the default data from the backend
    if (!data) {
        // Fetch the default data if no file was uploaded
        loadDefaultData();
    } else {
        // Render the plot with the existing 'data'
        renderPlot(data.length); // If data is already available (e.g., after file upload)
    }
});
