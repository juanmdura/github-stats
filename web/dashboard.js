// GitHub Stats Dashboard - AI-Focused Visualizations
class GitHubStatsDashboard {
    constructor() {
        this.timeSeriesData = null;
        this.teamPerformanceData = null;
        this.repositoryActivityData = null;
        this.dailyBatchesData = null;
        this.charts = {};
        this.filteredData = {};

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Filter listeners
        document.getElementById('teamFilter').addEventListener('change', () => {
            this.applyFilters();
        });

        document.getElementById('startDate').addEventListener('change', () => {
            this.applyFilters();
        });

        document.getElementById('endDate').addEventListener('change', () => {
            this.applyFilters();
        });

        // Auto-load all available CSV files on startup
        this.loadAllAvailableFiles();
    }

    showStatus(message, type = 'success') {
        const statusEl = document.getElementById('status');
        statusEl.textContent = message;
        statusEl.className = `status show ${type}`;

        setTimeout(() => {
            statusEl.classList.remove('show');
        }, 5000);
    }

    showLoading(show = true) {
        document.getElementById('loading').style.display = show ? 'block' : 'none';
    }

    parseCSV(text) {
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());

        return lines.slice(1).map(line => {
            const values = this.parseCSVLine(line);
            const row = {};
            headers.forEach((header, index) => {
                let value = values[index] || '';
                value = value.replace(/"/g, '').trim();

                // Try to convert to number if it looks like one
                if (/^\d+\.?\d*$/.test(value)) {
                    row[header] = parseFloat(value);
                } else if (/^\d+$/.test(value)) {
                    row[header] = parseInt(value);
                } else {
                    row[header] = value;
                }
            });
            return row;
        });
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current);
        return result;
    }

    updateTeamFilter() {
        const teamFilter = document.getElementById('teamFilter');
        const teams = new Set();

        if (this.timeSeriesData) {
            this.timeSeriesData.forEach(row => {
                if (row.Team) teams.add(row.Team);
            });
        }

        if (this.teamPerformanceData) {
            this.teamPerformanceData.forEach(row => {
                if (row.Team) teams.add(row.Team);
            });
        }

        if (this.dailyBatchesData) {
            this.dailyBatchesData.forEach(row => {
                if (row.Team) teams.add(row.Team);
            });
        }

        // Clear existing options except "All Teams"
        teamFilter.innerHTML = '<option value="">All Teams</option>';

        // Add team options
        Array.from(teams).sort().forEach(team => {
            const option = document.createElement('option');
            option.value = team;
            option.textContent = team;
            teamFilter.appendChild(option);
        });
    }

    updateDateRange() {
        const allDates = [];
        
        if (this.timeSeriesData) {
            this.timeSeriesData.forEach(row => {
                if (row.Date) allDates.push(new Date(row.Date));
            });
        }

        if (this.dailyBatchesData) {
            this.dailyBatchesData.forEach(row => {
                if (row.Date) allDates.push(new Date(row.Date));
            });
        }

        const validDates = allDates.filter(d => !isNaN(d));
        if (validDates.length === 0) return;

        const minDate = new Date(Math.min(...validDates));
        const maxDate = new Date(Math.max(...validDates));

        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');

        startDateInput.value = minDate.toISOString().split('T')[0];
        endDateInput.value = maxDate.toISOString().split('T')[0];
        startDateInput.min = minDate.toISOString().split('T')[0];
        startDateInput.max = maxDate.toISOString().split('T')[0];
        endDateInput.min = minDate.toISOString().split('T')[0];
        endDateInput.max = maxDate.toISOString().split('T')[0];
    }

    applyFilters() {
        const teamFilter = document.getElementById('teamFilter').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        // Filter time series data
        if (this.timeSeriesData) {
            this.filteredData.timeSeries = this.timeSeriesData.filter(row => {
                let include = true;

                if (teamFilter && row.Team !== teamFilter) include = false;
                if (startDate && row.Date < startDate) include = false;
                if (endDate && row.Date > endDate) include = false;

                return include;
            });
        }

        // Filter team performance data
        if (this.teamPerformanceData) {
            this.filteredData.teamPerformance = this.teamPerformanceData.filter(row => {
                return !teamFilter || row.Team === teamFilter;
            });
        }

        // Filter repository activity data
        if (this.repositoryActivityData) {
            this.filteredData.repositoryActivity = this.repositoryActivityData.filter(row => {
                let include = true;

                if (startDate && row.Date < startDate) include = false;
                if (endDate && row.Date > endDate) include = false;

                return include;
            });
        }

        // Filter daily batch data
        if (this.dailyBatchesData) {
            this.filteredData.dailyBatches = this.dailyBatchesData.filter(row => {
                let include = true;

                if (teamFilter && row.Team !== teamFilter) include = false;
                if (startDate && row.Date < startDate) include = false;
                if (endDate && row.Date > endDate) include = false;

                return include;
            });
        }

        this.updateDashboard();
    }

    updateDashboard() {
        this.renderStats();
        this.renderCharts();
    }

    async loadAllAvailableFiles() {
        this.showLoading(true);
        this.showStatus('🔍 Loading all CSV files from output directory...', 'success');

        try {
            const response = await fetch('/api/csv-files');
            const csvFiles = await response.json();

            if (csvFiles.summary && csvFiles.summary.length > 0) {
                // Load all time series files and combine them
                const timeSeriesFiles = csvFiles.summary.filter(f => f.name.includes('time_series'));
                const teamPerformanceFiles = csvFiles.summary.filter(f => f.name.includes('team_performance'));
                const repositoryActivityFiles = csvFiles.summary.filter(f => f.name.includes('repository_activity'));

                // Auto-load all time series files and combine them
                if (timeSeriesFiles.length > 0) {
                    await this.loadAndCombineFiles(timeSeriesFiles, 'timeSeries');
                }
                
                // Auto-load all team performance files and combine them
                if (teamPerformanceFiles.length > 0) {
                    await this.loadAndCombineFiles(teamPerformanceFiles, 'teamPerformance');
                }
                
                // Auto-load all repository activity files and combine them
                if (repositoryActivityFiles.length > 0) {
                    await this.loadAndCombineFiles(repositoryActivityFiles, 'repositoryActivity');
                }

                // Load daily batch files for detailed AI data
                if (csvFiles.dailyBatches && csvFiles.dailyBatches.length > 0) {
                    await this.loadAndCombineFiles(csvFiles.dailyBatches, 'dailyBatches');
                }

                this.showAllFilesLoaded(csvFiles);
            } else {
                this.showStatus('No CSV files found in output directory. Please run the GitHub stats analysis first.', 'error');
            }
        } catch (error) {
            console.log('Could not auto-load files:', error.message);
            this.showStatus('Could not load files from server. Please check that the server is running and CSV files exist.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadAndCombineFiles(files, dataType) {
        const allData = [];
        let loadedCount = 0;

        for (const file of files) {
            try {
                const response = await fetch(file.path);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const text = await response.text();
                const data = this.parseCSV(text);
                allData.push(...data);
                loadedCount++;

                console.log(`Loaded ${file.name}: ${data.length} records`);

            } catch (error) {
                console.log(`Could not load ${file.name}:`, error.message);
            }
        }

        if (allData.length > 0) {
            this[`${dataType}Data`] = allData;
            console.log(`Combined ${dataType} data: ${allData.length} total records from ${loadedCount} files`);

            this.updateTeamFilter();
            this.updateDateRange();
            this.applyFilters();
        }
    }

    showAllFilesLoaded(csvFiles) {
        const statusEl = document.getElementById('status');

        statusEl.innerHTML = `
            <h4>✅ Dashboard Ready!</h4>
            <p>Successfully loaded all ${csvFiles.summary.length} summary CSV files</p>
            <p>📊 Data includes ${csvFiles.dailyBatches.length} daily batch files spanning multiple time periods</p>
            <p>🎛️ Use the filters above to explore different teams and date ranges</p>
        `;
        statusEl.className = 'status show success';

        setTimeout(() => {
            statusEl.classList.remove('show');
        }, 10000);
    }

    renderStats() {
        const statsGrid = document.getElementById('statsGrid');
        statsGrid.innerHTML = '';

        const stats = this.calculateSummaryStats();

        Object.entries(stats).forEach(([key, value]) => {
            const statCard = document.createElement('div');
            statCard.className = 'stat-card';
            statCard.innerHTML = `
                <h4>${this.formatStatLabel(key)}</h4>
                <div class="value">${this.formatStatValue(key, value)}</div>
            `;
            statsGrid.appendChild(statCard);
        });
    }

    calculateSummaryStats() {
        const stats = {};

        // Calculate stats from time series data
        if (this.filteredData.timeSeries && this.filteredData.timeSeries.length > 0) {
            const data = this.filteredData.timeSeries;
            stats.totalCodeLines = data.reduce((sum, row) => sum + (row.CumulativeCodeLines || 0), 0);
            stats.totalAILines = data.reduce((sum, row) => sum + (row.CumulativeAILines || 0), 0);
            stats.totalCommits = data.reduce((sum, row) => sum + (row.CommitCount || 0), 0);
            stats.activeContributors = new Set(data.map(row => row.Team)).size;

            if (stats.totalCodeLines > 0) {
                stats.aiPercentage = (stats.totalAILines / stats.totalCodeLines * 100);
            }
        }

        // Add repository and contributor stats from daily batches
        if (this.filteredData.dailyBatches && this.filteredData.dailyBatches.length > 0) {
            const data = this.filteredData.dailyBatches;
            stats.repositories = new Set(data.map(row => row.Repository)).size;
            stats.uniqueAuthors = new Set(data.map(row => row.Contributor)).size;
        } else if (this.filteredData.repositoryActivity && this.filteredData.repositoryActivity.length > 0) {
            const data = this.filteredData.repositoryActivity;
            stats.repositories = new Set(data.map(row => row.Repository)).size;
            stats.uniqueAuthors = new Set(data.map(row => row.Author)).size;
        }

        return stats;
    }

    formatStatLabel(key) {
        const labels = {
            totalCodeLines: 'Total Code Lines',
            totalAILines: 'AI-Assisted Lines',
            totalCommits: 'Total Commits',
            activeContributors: 'Active Teams',
            aiPercentage: 'AI Assistance %',
            repositories: 'Repositories',
            uniqueAuthors: 'Contributors'
        };
        return labels[key] || key;
    }

    formatStatValue(key, value) {
        if (key === 'aiPercentage') {
            return `${value.toFixed(1)}%`;
        }
        if (typeof value === 'number' && value >= 1000) {
            return (value / 1000).toFixed(1) + 'K';
        }
        return value.toLocaleString();
    }

    renderCharts() {
        const chartsContainer = document.getElementById('chartsContainer');
        chartsContainer.innerHTML = '';

        // Destroy existing charts
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.charts = {};

        // Render AI-focused charts
        if (this.filteredData.timeSeries && this.filteredData.timeSeries.length > 0) {
            this.renderAITrendChart(chartsContainer);
            this.renderAITeamsChart(chartsContainer);
            this.renderAIDaysChart(chartsContainer);
        }

        if (this.filteredData.dailyBatches && this.filteredData.dailyBatches.length > 0) {
            this.renderAIReposChart(chartsContainer);
            this.renderAIContributorsChart(chartsContainer);
        }
    }

    createChartContainer(title) {
        const container = document.createElement('div');
        container.className = 'chart-container';
        container.innerHTML = `
            <h3>${title}</h3>
            <div class="chart-wrapper">
                <canvas></canvas>
            </div>
        `;
        return container;
    }

    renderAITrendChart(container) {
        const chartContainer = this.createChartContainer('🤖 AI Assistance Trend');
        container.appendChild(chartContainer);

        const canvas = chartContainer.querySelector('canvas');
        const ctx = canvas.getContext('2d');

        const data = this.filteredData.timeSeries;
        const groupedData = this.groupDataByDate(data);

        const dates = Object.keys(groupedData).sort();
        const aiPercentages = dates.map(date => {
            const dayData = groupedData[date];
            const totalCode = dayData.reduce((sum, row) => sum + (row.DailyCodeLines || 0), 0);
            const totalAI = dayData.reduce((sum, row) => sum + (row.DailyAILines || 0), 0);
            return totalCode > 0 ? (totalAI / totalCode * 100) : 0;
        });

        this.charts.aiTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'AI Assistance %',
                    data: aiPercentages,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'AI Assistance %'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    renderAITeamsChart(container) {
        const chartContainer = this.createChartContainer('🏢 AI Teams');
        container.appendChild(chartContainer);

        const canvas = chartContainer.querySelector('canvas');
        const ctx = canvas.getContext('2d');

        const data = this.filteredData.timeSeries;
        const teamData = {};

        // Calculate AI assistance percentage per team
        data.forEach(row => {
            if (!teamData[row.Team]) {
                teamData[row.Team] = { totalCodeLines: 0, totalAILines: 0 };
            }
            teamData[row.Team].totalCodeLines += row.DailyCodeLines || 0;
            teamData[row.Team].totalAILines += row.DailyAILines || 0;
        });

        // Calculate AI percentages and sort teams by AI percentage
        const teamAIData = Object.entries(teamData)
            .map(([team, stats]) => ({
                team,
                aiPercentage: stats.totalCodeLines > 0 ? (stats.totalAILines / stats.totalCodeLines * 100) : 0
            }))
            .sort((a, b) => b.aiPercentage - a.aiPercentage);

        const teams = teamAIData.map(item => item.team);
        const aiPercentages = teamAIData.map(item => item.aiPercentage);
        const colors = this.generateColors(teams.length);

        this.charts.aiTeams = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: teams.map(team => `${team} (${teamAIData.find(t => t.team === team).aiPercentage.toFixed(1)}%)`),
                datasets: [{
                    data: aiPercentages,
                    backgroundColor: colors.map(color => color + '80'),
                    borderColor: colors,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return `${context.label}: ${context.parsed.toFixed(1)}%`;
                            }
                        }
                    }
                }
            }
        });
    }

    renderAIReposChart(container) {
        const chartContainer = this.createChartContainer('📦 AI Repos');
        container.appendChild(chartContainer);

        const canvas = chartContainer.querySelector('canvas');
        const ctx = canvas.getContext('2d');

        const data = this.filteredData.dailyBatches;
        const repoData = {};

        // Calculate actual AI percentages per repository from daily batch data
        data.forEach(row => {
            if (!repoData[row.Repository]) {
                repoData[row.Repository] = { totalCodeLines: 0, totalAILines: 0, commits: 0 };
            }
            repoData[row.Repository].totalCodeLines += parseInt(row.CodeLines) || 0;
            repoData[row.Repository].totalAILines += parseInt(row.AILines) || 0;
            repoData[row.Repository].commits += 1;
        });

        // Calculate AI percentages and prepare data for chart
        const repoAIData = Object.entries(repoData)
            .map(([repo, stats]) => ({
                repo: repo.length > 20 ? repo.substring(0, 20) + '...' : repo,
                aiPercentage: stats.totalCodeLines > 0 ? (stats.totalAILines / stats.totalCodeLines * 100) : 0,
                commits: stats.commits,
                totalCodeLines: stats.totalCodeLines
            }))
            .filter(item => item.commits >= 3) // Only include repos with meaningful activity
            .sort((a, b) => b.aiPercentage - a.aiPercentage)
            .slice(0, 8); // Top 8 repos

        if (repoAIData.length === 0) {
            chartContainer.innerHTML = '<h3>📦 AI Repos</h3><p>No repository data available</p>';
            return;
        }

        const repos = repoAIData.map(item => item.repo);
        const aiPercentages = repoAIData.map(item => item.aiPercentage);
        const colors = this.generateColors(repos.length);

        this.charts.aiRepos = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: repos.map((repo, index) => `${repo} (${repoAIData[index].aiPercentage.toFixed(1)}%)`),
                datasets: [{
                    data: aiPercentages,
                    backgroundColor: colors.map(color => color + '80'),
                    borderColor: colors,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const item = repoAIData[context.dataIndex];
                                return `${context.label}: ${context.parsed.toFixed(1)}% AI (${item.commits} commits)`;
                            }
                        }
                    }
                }
            }
        });
    }

    renderAIContributorsChart(container) {
        const chartContainer = this.createChartContainer('👥 AI Contributors');
        container.appendChild(chartContainer);

        const canvas = chartContainer.querySelector('canvas');
        const ctx = canvas.getContext('2d');

        const data = this.filteredData.dailyBatches;
        const contributorData = {};

        // Calculate actual AI percentages per contributor from daily batch data
        data.forEach(row => {
            if (!contributorData[row.Contributor]) {
                contributorData[row.Contributor] = { totalCodeLines: 0, totalAILines: 0, commits: 0 };
            }
            contributorData[row.Contributor].totalCodeLines += parseInt(row.CodeLines) || 0;
            contributorData[row.Contributor].totalAILines += parseInt(row.AILines) || 0;
            contributorData[row.Contributor].commits += 1;
        });

        // Calculate AI percentages and prepare data for chart
        const contributorAIData = Object.entries(contributorData)
            .map(([author, stats]) => ({
                author: author.length > 15 ? author.substring(0, 15) + '...' : author,
                aiPercentage: stats.totalCodeLines > 0 ? (stats.totalAILines / stats.totalCodeLines * 100) : 0,
                commits: stats.commits,
                totalCodeLines: stats.totalCodeLines
            }))
            .filter(item => item.commits >= 3) // Only include contributors with meaningful activity
            .sort((a, b) => b.aiPercentage - a.aiPercentage)
            .slice(0, 10); // Top 10 contributors

        if (contributorAIData.length === 0) {
            chartContainer.innerHTML = '<h3>👥 AI Contributors</h3><p>No contributor data available</p>';
            return;
        }

        const contributors = contributorAIData.map(item => item.author);
        const aiPercentages = contributorAIData.map(item => item.aiPercentage);
        const colors = this.generateColors(contributors.length);

        this.charts.aiContributors = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: contributors.map((author, index) => `${author} (${contributorAIData[index].aiPercentage.toFixed(1)}%)`),
                datasets: [{
                    data: aiPercentages,
                    backgroundColor: colors.map(color => color + '80'),
                    borderColor: colors,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const item = contributorAIData[context.dataIndex];
                                return `${context.label}: ${context.parsed.toFixed(1)}% AI (${item.commits} commits)`;
                            }
                        }
                    }
                }
            }
        });
    }

    renderAIDaysChart(container) {
        const chartContainer = this.createChartContainer('📅 AI Days');
        container.appendChild(chartContainer);

        const canvas = chartContainer.querySelector('canvas');
        const ctx = canvas.getContext('2d');

        const data = this.filteredData.timeSeries;
        const dayAIData = {
            'Monday': { totalCode: 0, totalAI: 0 },
            'Tuesday': { totalCode: 0, totalAI: 0 },
            'Wednesday': { totalCode: 0, totalAI: 0 },
            'Thursday': { totalCode: 0, totalAI: 0 },
            'Friday': { totalCode: 0, totalAI: 0 },
            'Saturday': { totalCode: 0, totalAI: 0 },
            'Sunday': { totalCode: 0, totalAI: 0 }
        };

        // Calculate AI assistance by day of week
        data.forEach(row => {
            if (row.Date) {
                const date = new Date(row.Date);
                const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });

                if (dayAIData[dayOfWeek]) {
                    dayAIData[dayOfWeek].totalCode += row.DailyCodeLines || 0;
                    dayAIData[dayOfWeek].totalAI += row.DailyAILines || 0;
                }
            }
        });

        // Calculate AI percentage for each day
        const dayLabels = Object.keys(dayAIData);
        const aiPercentages = dayLabels.map(day => {
            const dayStats = dayAIData[day];
            return dayStats.totalCode > 0 ? (dayStats.totalAI / dayStats.totalCode * 100) : 0;
        });

        this.charts.aiDays = new Chart(ctx, {
            type: 'polarArea',
            data: {
                labels: dayLabels.map((day, index) => `${day} (${aiPercentages[index].toFixed(1)}%)`),
                datasets: [{
                    data: aiPercentages,
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.8)', 'rgba(5, 150, 105, 0.8)', 'rgba(4, 120, 87, 0.8)', 
                        'rgba(6, 95, 70, 0.8)', 'rgba(6, 78, 59, 0.8)', 'rgba(2, 44, 34, 0.8)', 
                        'rgba(16, 185, 129, 0.6)'
                    ],
                    borderColor: [
                        '#10B981', '#059669', '#047857', '#065F46',
                        '#064E3B', '#022C22', '#10B981'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return `${context.label}: ${context.parsed.toFixed(1)}% AI assistance`;
                            }
                        }
                    }
                }
            }
        });
    }

    groupDataByDate(data) {
        const grouped = {};
        data.forEach(row => {
            const date = row.Date;
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(row);
        });
        return grouped;
    }

    generateColors(count) {
        const colors = [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
            '#FF9F40', '#C9CBCF', '#10B981', '#F59E0B', '#EF4444'
        ];

        while (colors.length < count) {
            colors.push(`hsl(${Math.random() * 360}, 70%, 60%)`);
        }

        return colors.slice(0, count);
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new GitHubStatsDashboard();
});