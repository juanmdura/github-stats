// GitHub Stats Dashboard - AI-Focused Visualizations
class GitHubStatsDashboard {
    constructor() {
        this.timeSeriesData = null;
        this.teamPerformanceData = null;
        this.repositoryActivityData = null;
        this.dailyBatchesData = null;
        this.charts = {};
        this.filteredData = {};
        this.currentSort = { column: 'date', direction: 'desc', type: 'date' };
        this.tableSortingInitialized = false;

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Filter listeners
        document.getElementById('teamFilter').addEventListener('change', () => {
            this.applyFilters();
        });

        document.getElementById('contributorFilter').addEventListener('change', () => {
            this.applyFilters();
        });

        document.getElementById('repositoryFilter').addEventListener('change', () => {
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

    initializeTableSorting() {
        const tableHeaders = document.querySelectorAll('.data-table th.sortable');
        tableHeaders.forEach(header => {
            // Remove any existing listeners to prevent duplicates
            const existingHandler = header._sortHandler;
            if (existingHandler) {
                header.removeEventListener('click', existingHandler);
            }

            // Create new handler and store reference
            const handler = (e) => {
                const column = e.target.getAttribute('data-column');
                const type = e.target.getAttribute('data-type');
                this.sortTable(column, type);
            };

            header._sortHandler = handler;
            header.addEventListener('click', handler);
        });
    }

    sortTable(column, type) {
        // Toggle sort direction if same column, otherwise default to descending
        if (this.currentSort.column === column) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.direction = 'desc';
        }

        this.currentSort.column = column;
        this.currentSort.type = type;

        // Update table header styles
        this.updateTableHeaderStyles();

        // Re-render the table with sorted data
        this.renderValidationTable();
    }

    updateTableHeaderStyles() {
        const tableHeaders = document.querySelectorAll('.data-table th.sortable');
        tableHeaders.forEach(header => {
            header.classList.remove('sort-asc', 'sort-desc');
            const headerColumn = header.getAttribute('data-column');
            if (headerColumn === this.currentSort.column) {
                header.classList.add(this.currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });
    }

    sortTableData(data, column, direction, type) {
        return [...data].sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];

            // Handle different data types
            switch (type) {
                case 'number':
                    aVal = parseFloat(aVal) || 0;
                    bVal = parseFloat(bVal) || 0;
                    break;
                case 'date':
                    aVal = new Date(aVal);
                    bVal = new Date(bVal);
                    break;
                case 'text':
                    aVal = String(aVal).toLowerCase();
                    bVal = String(bVal).toLowerCase();
                    break;
            }

            let comparison = 0;
            if (aVal > bVal) comparison = 1;
            if (aVal < bVal) comparison = -1;

            return direction === 'asc' ? comparison : -comparison;
        });
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

    updateContributorFilter() {
        const contributorFilter = document.getElementById('contributorFilter');
        const contributors = new Set();

        if (this.dailyBatchesData) {
            this.dailyBatchesData.forEach(row => {
                if (row.Contributor) contributors.add(row.Contributor);
            });
        }

        if (this.repositoryActivityData) {
            this.repositoryActivityData.forEach(row => {
                if (row.Author) contributors.add(row.Author);
            });
        }

        // Clear existing options except "All Contributors"
        contributorFilter.innerHTML = '<option value="">All Contributors</option>';

        // Add contributor options
        Array.from(contributors).sort().forEach(contributor => {
            const option = document.createElement('option');
            option.value = contributor;
            option.textContent = contributor;
            contributorFilter.appendChild(option);
        });
    }

    updateRepositoryFilter() {
        const repositoryFilter = document.getElementById('repositoryFilter');
        const repositories = new Set();

        if (this.dailyBatchesData) {
            this.dailyBatchesData.forEach(row => {
                if (row.Repository) repositories.add(row.Repository);
            });
        }

        if (this.repositoryActivityData) {
            this.repositoryActivityData.forEach(row => {
                if (row.Repository) repositories.add(row.Repository);
            });
        }

        // Clear existing options except "All Repositories"
        repositoryFilter.innerHTML = '<option value="">All Repositories</option>';

        // Add repository options
        Array.from(repositories).sort().forEach(repository => {
            const option = document.createElement('option');
            option.value = repository;
            option.textContent = repository;
            repositoryFilter.appendChild(option);
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
        const contributorFilter = document.getElementById('contributorFilter').value;
        const repositoryFilter = document.getElementById('repositoryFilter').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        // Filter time series data
        if (this.timeSeriesData) {
            this.filteredData.timeSeries = this.timeSeriesData.filter(row => {
                let include = true;

                if (teamFilter && row.Team !== teamFilter) include = false;
                // Apply contributor filter if available in time series data
                if (contributorFilter && row.Contributor && row.Contributor !== contributorFilter) include = false;
                // Apply repository filter if available in time series data  
                if (repositoryFilter && row.Repository && row.Repository !== repositoryFilter) include = false;
                if (startDate && row.Date < startDate) include = false;
                if (endDate && row.Date > endDate) include = false;

                return include;
            });
        }

        // Filter team performance data
        if (this.teamPerformanceData) {
            this.filteredData.teamPerformance = this.teamPerformanceData.filter(row => {
                let include = true;

                if (teamFilter && row.Team !== teamFilter) include = false;
                // Apply contributor filter if available in team performance data
                if (contributorFilter && row.Contributor && row.Contributor !== contributorFilter) include = false;
                // Apply repository filter if available in team performance data
                if (repositoryFilter && row.Repository && row.Repository !== repositoryFilter) include = false;
                if (startDate && row.Date && row.Date < startDate) include = false;
                if (endDate && row.Date && row.Date > endDate) include = false;

                return include;
            });
        }

        // Filter repository activity data
        if (this.repositoryActivityData) {
            this.filteredData.repositoryActivity = this.repositoryActivityData.filter(row => {
                let include = true;

                if (teamFilter && row.Team && row.Team !== teamFilter) include = false;
                if (contributorFilter && row.Author !== contributorFilter) include = false;
                if (repositoryFilter && row.Repository !== repositoryFilter) include = false;
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
                if (contributorFilter && row.Contributor !== contributorFilter) include = false;
                if (repositoryFilter && row.Repository !== repositoryFilter) include = false;
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
        this.renderValidationTable();
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
            this.updateContributorFilter();
            this.updateRepositoryFilter();
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
        // Clear all section metrics containers
        const locMetrics = document.getElementById('locMetrics');
        const teamMetrics = document.getElementById('teamMetrics');
        const repoMetrics = document.getElementById('repoMetrics');

        locMetrics.innerHTML = '';
        teamMetrics.innerHTML = '';
        repoMetrics.innerHTML = '';

        const stats = this.calculateSummaryStats();

        // Lines of Code section metrics
        const locStats = ['totalCodeLines', 'totalAILines', 'aiPercentage'];
        locStats.forEach(statKey => {
            if (stats.hasOwnProperty(statKey)) {
                const statCard = document.createElement('div');
                statCard.className = 'metric-card';
                statCard.innerHTML = `
                    <h4>${this.formatStatLabel(statKey)}</h4>
                    <div class="value">${this.formatStatValue(statKey, stats[statKey])}</div>
                `;
                locMetrics.appendChild(statCard);
            }
        });

        // Teams & Contributors section metrics
        const teamStats = ['activeContributors', 'uniqueAuthors'];
        teamStats.forEach(statKey => {
            if (stats.hasOwnProperty(statKey)) {
                const statCard = document.createElement('div');
                statCard.className = 'metric-card';
                statCard.innerHTML = `
                    <h4>${this.formatStatLabel(statKey)}</h4>
                    <div class="value">${this.formatStatValue(statKey, stats[statKey])}</div>
                `;
                teamMetrics.appendChild(statCard);
            }
        });

        // Repositories & Commits section metrics
        const repoStats = ['repositories', 'totalCommits'];
        repoStats.forEach(statKey => {
            if (stats.hasOwnProperty(statKey)) {
                const statCard = document.createElement('div');
                statCard.className = 'metric-card';
                statCard.innerHTML = `
                    <h4>${this.formatStatLabel(statKey)}</h4>
                    <div class="value">${this.formatStatValue(statKey, stats[statKey])}</div>
                `;
                repoMetrics.appendChild(statCard);
            }
        });
    }

    calculateSummaryStats() {
        const stats = {};

        // Prioritize daily batch data for accurate filtered calculations
        if (this.filteredData.dailyBatches && this.filteredData.dailyBatches.length > 0) {
            const data = this.filteredData.dailyBatches;            // Deduplicate commits to avoid double-counting contributors in multiple teams
            const uniqueCommits = new Map();
            const contributors = new Set();
            const repositories = new Set();
            const teams = new Set();

            data.forEach(row => {
                const commitKey = `${row.Contributor}_${row.CommitSHA}_${row.Repository}`;
                const codeLines = parseInt(row.CodeLines) || 0;
                const aiLines = parseInt(row.AILines) || 0;

                // If commit already exists, keep the one with higher AI assistance
                if (!uniqueCommits.has(commitKey) || (uniqueCommits.get(commitKey).aiLines < aiLines)) {
                    uniqueCommits.set(commitKey, {
                        codeLines: codeLines,
                        aiLines: aiLines,
                        contributor: row.Contributor,
                        repository: row.Repository,
                        team: row.Team
                    });
                }

                contributors.add(row.Contributor);
                repositories.add(row.Repository);
                teams.add(row.Team);
            });

            // Calculate totals from unique commits only
            const uniqueCommitValues = Array.from(uniqueCommits.values());
            stats.totalCodeLines = uniqueCommitValues.reduce((sum, commit) => sum + commit.codeLines, 0);
            stats.totalAILines = uniqueCommitValues.reduce((sum, commit) => sum + commit.aiLines, 0);
            stats.totalCommits = uniqueCommits.size; // Count of unique commits
            stats.activeContributors = teams.size;
            stats.repositories = repositories.size;
            stats.uniqueAuthors = contributors.size;

            if (stats.totalCodeLines > 0) {
                stats.aiPercentage = (stats.totalAILines / stats.totalCodeLines * 100);
            } else {
                stats.aiPercentage = 0;
            }
        }
        // Fallback to time series data if daily batches not available
        else if (this.filteredData.timeSeries && this.filteredData.timeSeries.length > 0) {
            const data = this.filteredData.timeSeries;

            // Use daily data, not cumulative, for filtered views
            stats.totalCodeLines = data.reduce((sum, row) => sum + (row.DailyCodeLines || 0), 0);
            stats.totalAILines = data.reduce((sum, row) => sum + (row.DailyAILines || 0), 0);
            stats.totalCommits = data.reduce((sum, row) => sum + (row.CommitCount || 0), 0);
            stats.activeContributors = new Set(data.map(row => row.Team)).size;

            if (stats.totalCodeLines > 0) {
                stats.aiPercentage = (stats.totalAILines / stats.totalCodeLines * 100);
            } else {
                stats.aiPercentage = 0;
            }

            // Try to get repository and contributor stats from repository activity data
            if (this.filteredData.repositoryActivity && this.filteredData.repositoryActivity.length > 0) {
                const repoData = this.filteredData.repositoryActivity;
                stats.repositories = new Set(repoData.map(row => row.Repository)).size;
                stats.uniqueAuthors = new Set(repoData.map(row => row.Author)).size;
            }
        }

        // Ensure all stats have default values
        stats.totalCodeLines = stats.totalCodeLines || 0;
        stats.totalAILines = stats.totalAILines || 0;
        stats.totalCommits = stats.totalCommits || 0;
        stats.activeContributors = stats.activeContributors || 0;
        stats.aiPercentage = stats.aiPercentage || 0;
        stats.repositories = stats.repositories || 0;
        stats.uniqueAuthors = stats.uniqueAuthors || 0;

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
        // Clear all section chart containers
        const locCharts = document.getElementById('locCharts');
        const teamCharts = document.getElementById('teamCharts');
        const repoCharts = document.getElementById('repoCharts');

        locCharts.innerHTML = '';
        teamCharts.innerHTML = '';
        repoCharts.innerHTML = '';

        // Destroy existing charts
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.charts = {};

        let hasTimeSeriesData = this.filteredData.timeSeries && this.filteredData.timeSeries.length > 0;
        let hasDailyBatchData = this.filteredData.dailyBatches && this.filteredData.dailyBatches.length > 0;

        // Lines of Code section: AI Trend chart
        if (hasTimeSeriesData || hasDailyBatchData) {
            this.renderAITrendChart(locCharts);
        } else {
            locCharts.innerHTML = `
                <div class="chart-container">
                    <h3>AI Assistance Trend</h3>
                    <p>No trend data available with current filters. Try adjusting your filters to see the AI assistance trend over time.</p>
                </div>
            `;
        }

        // Teams & Contributors section: AI Teams and AI Contributors charts
        if (hasDailyBatchData) {
            this.renderAITeamsChart(teamCharts);
        } else {
            teamCharts.innerHTML = `
                <div class="chart-container">
                    <h3>AI Teams</h3>
                    <p>No team data available with current filters. Team charts require daily batch data.</p>
                </div>
            `;
        }

        if (hasDailyBatchData) {
            this.renderAIContributorsChart(teamCharts);
        }

        // Repositories & Commits section: AI Repos chart
        if (hasDailyBatchData) {
            this.renderAIReposChart(repoCharts);
        } else {
            repoCharts.innerHTML = `
                <div class="chart-container">
                    <h3>AI Repositories</h3>
                    <p>No repository data available with current filters. Repository charts require daily batch data.</p>
                </div>
            `;
        }

        // Show comprehensive message if no data is available at all
        if (!hasTimeSeriesData && !hasDailyBatchData) {
            const noDataMessage = `
                <div class="chart-container">
                    <h3>📊 No Data Available</h3>
                    <p>No data matches the current filter criteria. Try adjusting your filters:</p>
                    <ul style="text-align: left; margin: 1rem 0;">
                        <li>🏢 Try selecting "All Teams" if you have a team filter</li>
                        <li>👥 Try selecting "All Contributors" if you have a contributor filter</li>
                        <li>📦 Try selecting "All Repositories" if you have a repository filter</li>
                        <li>📅 Try expanding your date range</li>
                    </ul>
                </div>
            `;
            locCharts.innerHTML = noDataMessage;
            teamCharts.innerHTML = noDataMessage;
            repoCharts.innerHTML = noDataMessage;
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
    } renderAITrendChart(container) {
        const chartContainer = this.createChartContainer('AI Assistance Trend');
        container.appendChild(chartContainer);

        const canvas = chartContainer.querySelector('canvas');
        const ctx = canvas.getContext('2d');

        // Check if contributor or repository filter is active
        const contributorFilter = document.getElementById('contributorFilter').value;
        const repositoryFilter = document.getElementById('repositoryFilter').value;

        let data, dates, aiPercentages;

        // Use daily batch data if contributor/repository filtering is active or if time series is not available
        if ((contributorFilter || repositoryFilter) && this.filteredData.dailyBatches && this.filteredData.dailyBatches.length > 0) {
            data = this.filteredData.dailyBatches;

            // Group daily batch data by date
            const groupedData = {};
            data.forEach(row => {
                const date = row.Date;
                if (!groupedData[date]) {
                    groupedData[date] = [];
                }
                groupedData[date].push(row);
            });

            dates = Object.keys(groupedData).sort();

            if (dates.length === 0) {
                chartContainer.innerHTML = '<h3>🤖 AI Assistance Trend</h3><p>No date data available for current filters</p>';
                return;
            }

            // Calculate AI percentages from daily batch data
            aiPercentages = dates.map(date => {
                const dayData = groupedData[date];
                const totalCode = dayData.reduce((sum, row) => sum + (parseInt(row.CodeLines) || 0), 0);
                const totalAI = dayData.reduce((sum, row) => sum + (parseInt(row.AILines) || 0), 0);
                return totalCode > 0 ? (totalAI / totalCode * 100) : 0;
            });
        }
        // Fallback to time series data
        else if (this.filteredData.timeSeries && this.filteredData.timeSeries.length > 0) {
            data = this.filteredData.timeSeries;

            const groupedData = this.groupDataByDate(data);
            dates = Object.keys(groupedData).sort();

            if (dates.length === 0) {
                chartContainer.innerHTML = '<h3>🤖 AI Assistance Trend</h3><p>No date data available for current filters</p>';
                return;
            }

            // Calculate AI percentages from time series data
            aiPercentages = dates.map(date => {
                const dayData = groupedData[date];
                const totalCode = dayData.reduce((sum, row) => sum + (row.DailyCodeLines || 0), 0);
                const totalAI = dayData.reduce((sum, row) => sum + (row.DailyAILines || 0), 0);
                return totalCode > 0 ? (totalAI / totalCode * 100) : 0;
            });
        }
        else {
            chartContainer.innerHTML = '<h3>🤖 AI Assistance Trend</h3><p>No data available for current filters</p>';
            return;
        }

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
        const chartContainer = this.createChartContainer('AI Teams');
        container.appendChild(chartContainer);

        const canvas = chartContainer.querySelector('canvas');
        const ctx = canvas.getContext('2d');

        const data = this.filteredData.dailyBatches;
        const teamFilter = document.getElementById('teamFilter').value;

        if (!data || data.length === 0) {
            chartContainer.innerHTML = '<h3>AI Teams</h3><p>No team data available for current filters</p>';
            return;
        }

        // If a specific team is filtered, show a different visualization
        if (teamFilter) {
            chartContainer.innerHTML = `
                <h3>AI Teams</h3>
                <div style="padding: 2rem; text-align: center;">
                    <p><strong>Filtered by Team:</strong> ${teamFilter}</p>
                    <p>Use "All Teams" to see team comparison chart</p>
                    <div style="margin-top: 1rem; padding: 1rem; background: rgba(16, 185, 129, 0.1); border-radius: 8px;">
                        📊 Other charts show ${teamFilter}'s specific metrics
                    </div>
                </div>
            `;
            return;
        }

        const teamData = {};
        const uniqueCommits = new Map();

        // Calculate AI assistance percentage per team, avoiding double-counting
        // and taking the maximum AI assistance value for duplicate commits
        data.forEach(row => {
            const commitKey = `${row.Contributor}_${row.CommitSHA}_${row.Repository}`;
            const codeLines = parseInt(row.CodeLines) || 0;
            const aiLines = parseInt(row.AILines) || 0;

            // If commit already exists, keep the one with higher AI assistance
            if (!uniqueCommits.has(commitKey) || (uniqueCommits.get(commitKey).aiLines < aiLines)) {
                uniqueCommits.set(commitKey, {
                    codeLines: codeLines,
                    aiLines: aiLines,
                    team: row.Team
                });
            }
        });

        // Now aggregate by team using the unique commits
        uniqueCommits.forEach(commit => {
            if (!teamData[commit.team]) {
                teamData[commit.team] = { totalCodeLines: 0, totalAILines: 0 };
            }
            teamData[commit.team].totalCodeLines += commit.codeLines;
            teamData[commit.team].totalAILines += commit.aiLines;
        });

        // Calculate AI percentages and sort teams by AI percentage
        const teamAIData = Object.entries(teamData)
            .map(([team, stats]) => ({
                team,
                aiPercentage: stats.totalCodeLines > 0 ? (stats.totalAILines / stats.totalCodeLines * 100) : 0
            }))
            .filter(item => item.aiPercentage > 0 || Object.keys(teamData).length <= 5) // Show all teams if few teams, or only teams with AI activity
            .sort((a, b) => b.aiPercentage - a.aiPercentage);

        if (teamAIData.length === 0) {
            chartContainer.innerHTML = '<h3>AI Teams</h3><p>No team AI data available for current filters</p>';
            return;
        }

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
        const chartContainer = this.createChartContainer('AI Repos');
        container.appendChild(chartContainer);

        const canvas = chartContainer.querySelector('canvas');
        const ctx = canvas.getContext('2d'); const data = this.filteredData.dailyBatches;
        const repoData = {};
        const uniqueCommits = new Map();

        // Calculate actual AI percentages per repository from daily batch data, avoiding double-counting
        // and taking the maximum AI assistance value for duplicate commits
        data.forEach(row => {
            const commitKey = `${row.Contributor}_${row.CommitSHA}_${row.Repository}`;
            const codeLines = parseInt(row.CodeLines) || 0;
            const aiLines = parseInt(row.AILines) || 0;

            // If commit already exists, keep the one with higher AI assistance
            if (!uniqueCommits.has(commitKey) || (uniqueCommits.get(commitKey).aiLines < aiLines)) {
                uniqueCommits.set(commitKey, {
                    codeLines: codeLines,
                    aiLines: aiLines,
                    repository: row.Repository
                });
            }
        });

        // Now aggregate by repository using the unique commits
        uniqueCommits.forEach(commit => {
            if (!repoData[commit.repository]) {
                repoData[commit.repository] = { totalCodeLines: 0, totalAILines: 0, commits: 0 };
            }
            repoData[commit.repository].totalCodeLines += commit.codeLines;
            repoData[commit.repository].totalAILines += commit.aiLines;
            repoData[commit.repository].commits += 1;
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
            chartContainer.innerHTML = '<h3>AI Repos</h3><p>No repository data available</p>';
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
                            label: function (context) {
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
        const chartContainer = this.createChartContainer('AI Contributors');
        container.appendChild(chartContainer);

        const canvas = chartContainer.querySelector('canvas');
        const ctx = canvas.getContext('2d'); const data = this.filteredData.dailyBatches;
        const contributorData = {};
        const uniqueCommits = new Map();

        // Calculate actual AI percentages per contributor from daily batch data, avoiding double-counting
        // and taking the maximum AI assistance value for duplicate commits
        data.forEach(row => {
            const commitKey = `${row.Contributor}_${row.CommitSHA}_${row.Repository}`;
            const codeLines = parseInt(row.CodeLines) || 0;
            const aiLines = parseInt(row.AILines) || 0;

            // If commit already exists, keep the one with higher AI assistance
            if (!uniqueCommits.has(commitKey) || (uniqueCommits.get(commitKey).aiLines < aiLines)) {
                uniqueCommits.set(commitKey, {
                    codeLines: codeLines,
                    aiLines: aiLines,
                    contributor: row.Contributor
                });
            }
        });

        // Now aggregate by contributor using the unique commits
        uniqueCommits.forEach(commit => {
            if (!contributorData[commit.contributor]) {
                contributorData[commit.contributor] = { totalCodeLines: 0, totalAILines: 0, commits: 0 };
            }
            contributorData[commit.contributor].totalCodeLines += commit.codeLines;
            contributorData[commit.contributor].totalAILines += commit.aiLines;
            contributorData[commit.contributor].commits += 1;
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
            chartContainer.innerHTML = '<h3>AI Contributors</h3><p>No contributor data available</p>';
            return;
        }

        const contributors = contributorAIData.map(item => item.author);
        const aiPercentages = contributorAIData.map(item => item.aiPercentage);
        const colors = this.generateColors(contributors.length);

        this.charts.aiContributors = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: contributors,
                datasets: [{
                    label: 'AI Assistance %',
                    data: aiPercentages,
                    backgroundColor: colors.map(color => color + '80'),
                    borderColor: colors,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y', // This makes it a horizontal bar chart
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'AI Assistance %'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Contributors'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false // Hide legend since we only have one dataset
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const item = contributorAIData[context.dataIndex];
                                return `${item.aiPercentage.toFixed(1)}% AI assistance (${item.commits} commits)`;
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

    renderValidationTable() {
        const validationTable = document.getElementById('validationTable');
        const tableBody = document.getElementById('validationTableBody');
        const tableStats = document.getElementById('tableStats');

        // Clear existing table content
        tableBody.innerHTML = '';
        tableStats.innerHTML = '';

        if (!this.filteredData.dailyBatches || this.filteredData.dailyBatches.length === 0) {
            validationTable.style.display = 'none';
            return;
        }

        validationTable.style.display = 'block';

        // Use individual commit data instead of aggregating
        const tableData = this.filteredData.dailyBatches.map(row => ({
            date: row.Date,
            team: row.Team,
            contributor: row.Contributor,
            repository: row.Repository,
            commitSHA: row.CommitSHA,
            commitMessage: row.CommitMessage,
            commits: 1, // Each row is one commit
            codeLines: parseInt(row.CodeLines) || 0,
            aiLines: parseInt(row.AILines) || 0,
            aiPercentage: parseFloat(row.AIPercentage) || 0
        }));

        // Apply current sorting
        const sortedData = this.sortTableData(
            tableData,
            this.currentSort.column,
            this.currentSort.direction,
            this.currentSort.type
        );

        let totalCommits = 0;
        let totalCodeLines = 0;
        let totalAILines = 0;

        // Populate table rows
        sortedData.forEach(row => {
            const tr = document.createElement('tr');

            const aiClass = row.aiPercentage >= 15 ? 'ai-high' :
                row.aiPercentage >= 5 ? 'ai-medium' : 'ai-low';

            // Create GitHub commit link (assuming GitHub.com/Zubale org)
            const commitLink = `https://github.com/Zubale/${row.repository}/commit/${row.commitSHA}`;
            const shortSHA = row.commitSHA ? row.commitSHA.substring(0, 7) : 'N/A';
            const commitLinkHtml = row.commitSHA ?
                `<a href="${commitLink}" target="_blank" class="commit-link" title="${row.commitMessage}">${shortSHA}</a>` :
                'N/A';

            tr.innerHTML = `
                <td>${row.date}</td>
                <td>${row.team}</td>
                <td>${row.contributor}</td>
                <td title="${row.repository}">${row.repository.length > 25 ? row.repository.substring(0, 25) + '...' : row.repository}</td>
                <td>${commitLinkHtml}</td>
                <td>${row.commits}</td>
                <td>${row.codeLines.toLocaleString()}</td>
                <td>${row.aiLines.toLocaleString()}</td>
                <td><span class="ai-percentage ${aiClass}">${row.aiPercentage.toFixed(1)}%</span></td>
            `;

            tableBody.appendChild(tr);

            totalCommits += row.commits;
            totalCodeLines += row.codeLines;
            totalAILines += row.aiLines;
        });

        // Calculate and display table statistics
        const avgAIPercentage = totalCodeLines > 0 ? (totalAILines / totalCodeLines * 100) : 0;
        const uniqueContributors = new Set(sortedData.map(row => row.contributor)).size;
        const uniqueRepositories = new Set(sortedData.map(row => row.repository)).size;

        tableStats.innerHTML = `
            <div class="table-stat">
                <div class="label">Total Rows</div>
                <div class="value">${sortedData.length}</div>
            </div>
            <div class="table-stat">
                <div class="label">Total Commits</div>
                <div class="value">${totalCommits}</div>
            </div>
            <div class="table-stat">
                <div class="label">Contributors</div>
                <div class="value">${uniqueContributors}</div>
            </div>
            <div class="table-stat">
                <div class="label">Repositories</div>
                <div class="value">${uniqueRepositories}</div>
            </div>
            <div class="table-stat">
                <div class="label">Total Code Lines</div>
                <div class="value">${totalCodeLines.toLocaleString()}</div>
            </div>
            <div class="table-stat">
                <div class="label">Total AI Lines</div>
                <div class="value">${totalAILines.toLocaleString()}</div>
            </div>
            <div class="table-stat">
                <div class="label">Average AI %</div>
                <div class="value">${avgAIPercentage.toFixed(1)}%</div>
            </div>
        `;

        // Initialize table sorting only once
        if (!this.tableSortingInitialized) {
            this.initializeTableSorting();
            this.tableSortingInitialized = true;
        }
        this.updateTableHeaderStyles();
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new GitHubStatsDashboard();
});