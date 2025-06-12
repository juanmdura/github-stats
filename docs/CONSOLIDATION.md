# Daily Batches CSV Consolidation

This document explains how to use the daily batch consolidation feature to merge all individual daily CSV files into a single comprehensive dataset.

## 📊 Overview

The consolidation script merges all CSV files from the `output/daily-batches/` directory into a single file called `consolidated_daily_batches.csv` in the `output/` directory.

## 🚀 Usage

### Option 1: Using npm script (Recommended)
```bash
npm run consolidate
```

### Option 2: Direct execution
```bash
node src/consolidate-daily-batches.js
```

## 📁 Input and Output

### Input Files
- **Location**: `output/daily-batches/`
- **Format**: `Zubale_daily_YYYY-MM-DD.csv`
- **Content**: Individual daily commit data with AI analysis

### Output File
- **Location**: `output/consolidated_daily_batches.csv`
- **Content**: All daily data merged chronologically
- **Size**: Typically 60KB+ depending on data volume

## 📋 Data Structure

The consolidated CSV maintains the same structure as individual daily files:

| Column | Description |
|--------|-------------|
| Date | Commit date (YYYY-MM-DD) |
| Team | Team name |
| TeamSlug | Team identifier |
| TeamMembers | Number of team members |
| Repository | Repository name |
| Contributor | Developer username |
| CommitSHA | Full commit SHA hash |
| CommitMessage | Commit message text |
| CodeLines | Lines of code in commit |
| AILines | AI-assisted lines of code |
| AIPercentage | Percentage of AI assistance |
| Additions | Lines added |
| Deletions | Lines deleted |
| TotalChanges | Total lines changed |

## 📊 Features

### Data Processing
- ✅ **Chronological Sorting**: Data sorted by date for time-series analysis
- ✅ **Data Cleaning**: Removes quotes and validates data types
- ✅ **Duplicate Handling**: Preserves all commit records individually
- ✅ **Error Handling**: Skips invalid rows with warnings

### Statistics
The script provides comprehensive statistics including:
- 📅 Date range coverage
- 🏢 Number of unique teams
- 👥 Number of unique contributors
- 📦 Number of unique repositories
- 📝 Total commit count
- 💻 Total lines of code
- 🤖 Total AI-assisted lines
- 📊 Average AI assistance percentage

## 🔧 Requirements

### Dependencies
The script automatically installs required dependencies:
- `csv-parser`: For reading CSV files
- `csv-writer`: For writing the consolidated CSV

### Node.js Version
- Node.js 12+ required
- Tested with Node.js 20+

## 📈 Example Output

```
🔄 Starting daily batch consolidation...
📁 Reading from: /path/to/output/daily-batches
📝 Output file: /path/to/output/consolidated_daily_batches.csv
📊 Found 20 CSV files to consolidate
📖 Processing: Zubale_daily_2025-05-15.csv
   ✓ Added 34 records from Zubale_daily_2025-05-15.csv
...
✅ Consolidation complete!
📊 Total records: 326

📊 CONSOLIDATION SUMMARY
══════════════════════════════════════════════════
📅 Date Range: 2025-05-15 to 2025-06-10
🏢 Teams: 7
👥 Contributors: 22
📦 Repositories: 19
📝 Total Commits: 326
💻 Total Code Lines: 61,247
🤖 Total AI Lines: 2,804
📊 Average AI Assistance: 4.6%
══════════════════════════════════════════════════
```

## 🔍 Use Cases

### Dashboard Integration
The consolidated file can be used with the web dashboard for:
- Complete historical analysis
- Long-term trend visualization
- Cross-team comparisons
- AI adoption tracking

### Data Analysis
Perfect for:
- 📊 Business intelligence tools
- 📈 Custom analytics scripts
- 📋 Reporting and presentations
- 🔄 Data backup and archival

### Performance Benefits
- **Faster Loading**: Single file vs. multiple files
- **Simplified Queries**: No need to join multiple datasets
- **Complete Dataset**: All historical data in one place

## ⚠️ Important Notes

1. **File Size**: The consolidated file grows with each daily batch
2. **Regeneration**: Run consolidation after new daily batches are created
3. **Backup**: Consider backing up individual daily files before consolidation
4. **Memory Usage**: Large datasets may require increased Node.js memory limits

## 🛠️ Troubleshooting

### Common Issues

**Permission Errors**
```bash
# Ensure output directory is writable
chmod 755 output/
```

**Memory Issues (Large Datasets)**
```bash
# Increase Node.js memory limit
node --max-old-space-size=4096 src/consolidate-daily-batches.js
```

**Missing Dependencies**
```bash
# Install dependencies manually
npm install csv-parser csv-writer
```

## 📝 Integration with Package.json

The consolidation script is integrated into the project's npm scripts:

```json
{
  "scripts": {
    "consolidate": "node src/consolidate-daily-batches.js"
  },
  "dependencies": {
    "csv-parser": "^3.0.0",
    "csv-writer": "^1.6.0"
  }
}
```
