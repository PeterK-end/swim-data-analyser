import * as AnalyseView from './analyseView.js';
import * as OpenWaterAnalyse from './openWaterAnalyse.js';
import { getItem, saveItem } from './storage.js';

// JavaScript to handle view switching
document.addEventListener('DOMContentLoaded', function () {
    const editView = document.getElementById('editView');
    const analyseView = document.getElementById('analyseView');
    const editContent = document.getElementById('editContent');
    const analyseContent = document.getElementById('analyseContent');
    const owAnalyseContent = document.getElementById('owAnalyseContent');

    // Function to switch views
    async function switchView(view) {
        const activityType = await getItem('activityType');
        const isOpenWater = activityType === 'openWater';

        if (view === 'edit') {
            editContent.style.display = 'block';
            analyseContent.style.display = 'none';
            owAnalyseContent.style.display = 'none';
            editView.classList.add('highlighted');
            analyseView.classList.remove('highlighted');
        } else if (view === 'analyse') {
            editContent.style.display = 'none';
            analyseView.classList.add('highlighted');
            editView.classList.remove('highlighted');

            if (isOpenWater) {
                // Open water gets its own map + metric-profile analyse view.
                analyseContent.style.display = 'none';
                owAnalyseContent.style.display = 'block';
                await OpenWaterAnalyse.render();
                return;
            }

            owAnalyseContent.style.display = 'none';
            analyseContent.style.display = 'block';

            const data = await getItem('modifiedData');
            AnalyseView.renderSummary();
            AnalyseView.renderBestTimes();
            AnalyseView.renderHeartratePlot(data);
            AnalyseView.renderPacePlot(data);
            AnalyseView.renderStrokeRateStrokeCountPlot(data);
            AnalyseView.renderIntervalSummaryTable();
        }
    }

    // Event listeners for icon clicks
    editView.addEventListener('click', function () {
        switchView('edit');
    });

    analyseView.addEventListener('click', function () {
        switchView('analyse');
    });

    // Default to edit view on page load
    switchView('edit');
});
