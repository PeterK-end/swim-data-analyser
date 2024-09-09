// static/js/plot.js

let selectedLabels = [];

// fetch default data if no data is provided yet
document.addEventListener('DOMContentLoaded', function() {
    // Check if data is already available (for example, after file upload)
    // Otherwise, load the default data from the backend

    if (!data) {
        // Fetch the default data if no file was uploaded
        fetch('/get_default_data')
            .then(response => response.json())
            .then(data => {
                renderPlot(data); // Render the plot with the default data
            });
    } else {
        renderPlot(data); // If data is already available (e.g., after file upload)
    }
});


function renderPlot(data) {
    const plotData = [{
        x: data.map(d => d.length),
        y: data.map(d => d.duration),
        type: 'bar',
        marker: {
            color: data.map(d =>
                selectedLabels.includes(d.length) ? 'rgba(255, 99, 71, 0.6)' : 'rgba(55, 128, 191, 0.7)'
            )
        }
    }];

    const layout = {
        //title: '',  // You can set a title here if needed
        margin: {
            l: 50,  // Left margin
            r: 50,  // Right margin
            t: 0,  // Top margin
            b: 50   // Bottom margin
        },
        xaxis: {
            title: 'length',
            titlefont: { size: 14 },
            tickfont: { size: 12 }
        },
        yaxis: {
            title: 'duration in s',
            titlefont: { size: 14 },
            tickfont: { size: 12 }
        }
    };

    Plotly.newPlot('plot', plotData, layout, {displayModeBar: false});

    const plotElement = document.getElementById('plot');
    plotElement.on('plotly_click', function(event) {
        const length = event.points[0].x;

        // Toggle selection
        if (selectedLabels.includes(length)) {
            selectedLabels = selectedLabels.filter(l => l !== length);
        } else {
            selectedLabels.push(length);
        }

        // Re-render the plot to update the highlight
        renderPlot(data);
    });
}

document.getElementById('mergeBtn').addEventListener('click', function() {
    if (selectedLabels.length < 2) {
        alert("Select at least two bars to merge.");
        return;
    }

    fetch('/merge', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ labels: selectedLabels })
    })
    .then(response => response.json())
    .then(data => {
        selectedLabels = [];
        renderPlot(data); // Re-render the plot with updated data
    });
});

document.getElementById('splitBtn').addEventListener('click', function() {
    if (selectedLabels.length > 2) {
        alert("Select a single length to be split.");
        return;
    }

    fetch('/split', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ labels: selectedLabels })
    })
    .then(response => response.json())
    .then(data => {
        selectedLabels = [];
        renderPlot(data); // Re-render the plot with updated data
    });
});

document.getElementById('poolSizeBtn').addEventListener('click', function() {

    fetch('/changePoolSize', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ labels: selectedLabels })
    })
    .then(response => response.json())
    .then(data => {
        selectedLabels = [];
        renderPlot(data); // Re-render the plot with updated data
    });
});

document.getElementById('changeStrokeBtn').addEventListener('click', function() {

    fetch('/changeStroke', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ labels: selectedLabels })
    })
    .then(response => response.json())
    .then(data => {
        selectedLabels = [];
        renderPlot(data); // Re-render the plot with updated data
    });
});
document.getElementById('deleteBtn').addEventListener('click', function() {

    fetch('/deleteLength', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ labels: selectedLabels })
    })
    .then(response => response.json())
    .then(data => {
        selectedLabels = [];
        renderPlot(data); // Re-render the plot with updated data
    });
});
document.getElementById('undoBtn').addEventListener('click', function() {

    fetch('/undoChanges', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ labels: selectedLabels })
    })
    .then(response => response.json())
    .then(data => {
        selectedLabels = [];
        renderPlot(data); // Re-render the plot with updated data
    });
});
