// assets/js/plot.js

let selectedLabels = [];

function renderPlot(data) {
    const plotData = [{
        x: data.map(d => d.label),
        y: data.map(d => d.value),
        type: 'bar',
        marker: {
            color: data.map(d =>
                selectedLabels.includes(d.label) ? 'rgba(255, 99, 71, 0.6)' : 'rgba(55, 128, 191, 0.7)'
            )
        }
    }];

    const layout = {
        title: '',  // You can set a title here if needed
        // plot_bgcolor: 'rgba(240, 240, 240, 1)',  // Light gray background for the plot area
        // paper_bgcolor: 'rgba(255, 255, 255, 1)', // White background for the area around the plot
        margin: {
            l: 50,  // Left margin
            r: 50,  // Right margin
            t: 50,  // Top margin
            b: 50   // Bottom margin
        }// ,
        // xaxis: {
        //     title: 'Labels',
        //     titlefont: { size: 14 },
        //     tickfont: { size: 12 }
        // },
        // yaxis: {
        //     title: 'Values',
        //     titlefont: { size: 14 },
        //     tickfont: { size: 12 }
        // }
    };

    Plotly.newPlot('plot', plotData, layout, {displayModeBar: false});

    const plotElement = document.getElementById('plot');
    plotElement.on('plotly_click', function(event) {
        const label = event.points[0].x;

        // Toggle selection
        if (selectedLabels.includes(label)) {
            selectedLabels = selectedLabels.filter(l => l !== label);
        } else {
            selectedLabels.push(label);
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

// Initial plot rendering
renderPlot(data);
