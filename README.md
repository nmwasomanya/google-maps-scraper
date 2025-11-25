# Google Maps Scraper

A web scraper that extracts business information from Google Maps using browser automation (Playwright) instead of the paid Google Maps API.

## Target Data Fields

| Field | Description | Example |
|-------|-------------|---------|
| **name** | Business/place name | "Joe's Pizza" |
| **city** | City where business is located | "New York" |
| **category** | Business category/type | "Pizza Restaurant" |
| **website** | Business website URL | "https://joespizza.com" |

## Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

## Usage

### Basic Usage
```bash
# Build and run with default settings (restaurants in New York, 50 results)
npm run scrape

# Or run directly after building
npm run build
npm start
```

### Custom Search
```bash
# Custom search query with different result count
npm run scrape "coffee shops in San Francisco" 100

# Run in visible browser mode (for debugging)
npm run scrape "hotels in Miami" 50 false
```

### Development Mode
```bash
# Run with ts-node (no build step)
npm run dev
```

## Output

Results are saved in the `output/` directory in both JSON and CSV formats:

```
output/
├── google-maps-2024-01-15T10-30-00.json
└── google-maps-2024-01-15T10-30-00.csv
```

### Sample Output

**JSON:**
```json
[
  {
    "name": "Joe's Pizza",
    "city": "New York",
    "category": "Pizza Restaurant",
    "website": "https://joespizzanyc.com"
  }
]
```

**CSV:**
```csv
name,city,category,website
Joe's Pizza,New York,Pizza Restaurant,https://joespizzanyc.com
```

## Project Structure

```
google-maps-scraper/
├── src/
│   ├── index.ts              # Main entry point
│   ├── scraper.ts            # Core scraping logic
│   ├── browser.ts            # Browser setup and configuration
│   ├── parser.ts             # Data extraction/parsing functions
│   ├── utils/
│   │   ├── delay.ts          # Random delay utilities
│   │   ├── logger.ts         # Logging utility
│   │   └── export.ts         # JSON/CSV export functions
│   └── types/
│       └── index.ts          # TypeScript interfaces
├── output/                   # Scraped data output directory
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

## How It Works

This scraper uses **browser automation** (Playwright) to:
1. Navigate to Google Maps search URLs
2. Handle consent dialogs automatically
3. Scroll through results to load more listings
4. Visit each place's detail page
5. Extract structured data from the DOM
6. Export results to JSON and CSV formats

## Anti-Detection Features

- Random delays between actions (1-3 seconds)
- Human-like scrolling behavior
- Browser fingerprint masking
- User-agent spoofing
- Stealth mode scripts

## Cost Comparison

| Method | Cost |
|--------|------|
| Google Places API | $17-$40 per 1000 requests |
| Web Scraper | Compute/proxy costs only |

## Documentation

See [AI_AGENT_PROMPT.md](./AI_AGENT_PROMPT.md) for a detailed implementation guide and technical specifications.

## Legal Notice

This tool is for educational purposes only. Web scraping Google Maps may violate Google's Terms of Service. Users are responsible for ensuring their use complies with all applicable laws and terms of service.