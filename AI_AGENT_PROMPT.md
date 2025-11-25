# AI Agent Prompt: Build a Google Maps Scraper

## Objective
Build a Google Maps scraper that extracts business information WITHOUT using the paid Google Maps API. The scraper should use browser automation (Playwright) to simulate human interaction with Google Maps.

---

## Target Data Fields (ONLY extract these)
| Field | Description | Example |
|-------|-------------|---------|
| **name** | Business/place name | "Joe's Pizza" |
| **city** | City where business is located | "New York" |
| **category** | Business category/type | "Pizza Restaurant" |
| **website** | Business website URL | "https://joespizza.com" |

---

## Technical Requirements

### Technology Stack
- **Language**: Node.js (TypeScript preferred) OR Python 3.10+
- **Browser Automation**: Playwright (preferred) or Puppeteer
- **Output Format**: JSON and CSV

### Project Structure
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

---

## Implementation Steps

### Step 1: Browser Setup
Create a Playwright browser instance with anti-detection measures:

```typescript
// browser.ts
import { chromium, Browser, BrowserContext, Page } from 'playwright';

interface BrowserConfig {
  headless: boolean;
  slowMo?: number;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
}

export async function createBrowser(config: BrowserConfig): Promise<Browser> {
  return await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMo || 50,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });
}

export async function createContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { latitude: 40.7128, longitude: -74.0060 },
    permissions: ['geolocation']
  });
  
  // Add stealth scripts to avoid detection
  await context.addInitScript(() => {
    // Override the navigator.webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
    
    // Override plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });
    
    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });
  });
  
  return context;
}
```

### Step 2: Core Scraper Logic
Implement the main scraping workflow:

```typescript
// scraper.ts
import { Page } from 'playwright';
import { randomDelay } from './utils/delay';

interface SearchOptions {
  query: string;           // e.g., "restaurants in New York"
  maxResults?: number;     // Maximum results to scrape (default: 50)
  scrollDelay?: number;    // Delay between scrolls in ms
}

interface PlaceData {
  name: string;
  city: string;
  category: string;
  website: string;
}

export class GoogleMapsScraper {
  private page: Page;
  
  constructor(page: Page) {
    this.page = page;
  }

  async search(options: SearchOptions): Promise<PlaceData[]> {
    const { query, maxResults = 50 } = options;
    const results: PlaceData[] = [];
    
    // Step 1: Navigate to Google Maps
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await this.page.goto(searchUrl, { waitUntil: 'networkidle' });
    
    // Step 2: Handle consent dialog if present
    await this.handleConsentDialog();
    
    // Step 3: Wait for results to load
    await this.page.waitForSelector('[role="feed"]', { timeout: 10000 });
    
    // Step 4: Scroll to load more results
    const placeLinks = await this.scrollAndCollectLinks(maxResults);
    
    // Step 5: Visit each place and extract data
    for (const link of placeLinks) {
      try {
        const placeData = await this.extractPlaceData(link);
        if (placeData) {
          results.push(placeData);
          console.log(`Scraped: ${placeData.name}`);
        }
        await randomDelay(1000, 3000); // Human-like delay between places
      } catch (error) {
        console.error(`Error scraping place: ${error}`);
      }
    }
    
    return results;
  }

  private async handleConsentDialog(): Promise<void> {
    try {
      // Click "Accept all" on Google consent dialog
      const acceptButton = await this.page.$('button:has-text("Accept all")');
      if (acceptButton) {
        await acceptButton.click();
        await randomDelay(500, 1000);
      }
    } catch {
      // No consent dialog present
    }
  }

  private async scrollAndCollectLinks(maxResults: number): Promise<string[]> {
    const links: Set<string> = new Set();
    let previousCount = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 50;
    
    // Find the scrollable results container
    const feedSelector = '[role="feed"]';
    
    while (links.size < maxResults && scrollAttempts < maxScrollAttempts) {
      // Collect current visible place links
      const newLinks = await this.page.$$eval(
        'a[href*="/maps/place/"]',
        (elements) => elements.map(el => el.getAttribute('href')).filter(Boolean) as string[]
      );
      
      newLinks.forEach(link => links.add(link));
      
      // Check if we've stopped getting new results
      if (links.size === previousCount) {
        scrollAttempts++;
      } else {
        scrollAttempts = 0;
        previousCount = links.size;
      }
      
      // Scroll down the feed
      await this.page.evaluate((selector) => {
        const feed = document.querySelector(selector);
        if (feed) {
          feed.scrollTop += 500;
        }
      }, feedSelector);
      
      await randomDelay(800, 1500);
      
      // Check for "end of results" indicator
      const endOfResults = await this.page.$('span:has-text("You\'ve reached the end of the list")');
      if (endOfResults) break;
    }
    
    return Array.from(links).slice(0, maxResults);
  }

  private async extractPlaceData(placeUrl: string): Promise<PlaceData | null> {
    try {
      // Navigate to place details page
      const fullUrl = placeUrl.startsWith('http') ? placeUrl : `https://www.google.com${placeUrl}`;
      await this.page.goto(fullUrl, { waitUntil: 'networkidle' });
      
      // Wait for place details to load
      await this.page.waitForSelector('h1', { timeout: 10000 });
      
      // Extract NAME
      const name = await this.extractName();
      
      // Extract CATEGORY
      const category = await this.extractCategory();
      
      // Extract CITY (from address)
      const city = await this.extractCity();
      
      // Extract WEBSITE
      const website = await this.extractWebsite();
      
      return {
        name: name || 'N/A',
        city: city || 'N/A',
        category: category || 'N/A',
        website: website || 'N/A'
      };
    } catch (error) {
      console.error(`Failed to extract place data: ${error}`);
      return null;
    }
  }

  private async extractName(): Promise<string> {
    try {
      // Primary selector: Main heading
      const nameElement = await this.page.$('h1');
      if (nameElement) {
        return await nameElement.textContent() || '';
      }
      return '';
    } catch {
      return '';
    }
  }

  private async extractCategory(): Promise<string> {
    try {
      // Category is usually in a button near the rating
      const selectors = [
        'button[jsaction*="category"]',
        '[data-item-id="authority"]',
        '.DkEaL', // Category class (may change)
        'button.DkEaL'
      ];
      
      for (const selector of selectors) {
        const element = await this.page.$(selector);
        if (element) {
          const text = await element.textContent();
          if (text && !text.includes('·') && text.length < 100) {
            return text.trim();
          }
        }
      }
      
      // Fallback: Look for category text pattern
      const categoryText = await this.page.evaluate(() => {
        const elements = document.querySelectorAll('button');
        for (const el of elements) {
          const text = el.textContent || '';
          // Categories typically don't contain numbers and are short
          if (text.length > 2 && text.length < 50 && !/\d/.test(text) && !text.includes('Directions')) {
            return text;
          }
        }
        return '';
      });
      
      return categoryText;
    } catch {
      return '';
    }
  }

  private async extractCity(): Promise<string> {
    try {
      // Address is usually in a data-item-id="address" element
      const addressSelectors = [
        '[data-item-id="address"]',
        'button[data-item-id="address"]',
        '[aria-label*="Address"]'
      ];
      
      for (const selector of addressSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          const fullAddress = await element.textContent();
          if (fullAddress) {
            // Parse city from address (usually format: "123 Street, City, State ZIP")
            return this.parseCityFromAddress(fullAddress);
          }
        }
      }
      
      return '';
    } catch {
      return '';
    }
  }

  private parseCityFromAddress(address: string): string {
    // Common address patterns:
    // "123 Main St, New York, NY 10001"
    // "456 Oak Ave, Los Angeles, CA"
    const parts = address.split(',').map(part => part.trim());
    
    if (parts.length >= 2) {
      // City is typically the second-to-last part (before state/zip)
      const cityPart = parts[parts.length - 2] || parts[1];
      // Remove any numbers (street numbers, zip codes)
      return cityPart.replace(/\d+/g, '').trim();
    }
    
    return address;
  }

  private async extractWebsite(): Promise<string> {
    try {
      // Website link selectors
      const websiteSelectors = [
        '[data-item-id="authority"]',
        'a[data-item-id="authority"]',
        'a[aria-label*="Website"]',
        'a[href*="url?q="]' // Google's redirect URL
      ];
      
      for (const selector of websiteSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          const href = await element.getAttribute('href');
          if (href) {
            // Parse actual URL from Google's redirect URL
            if (href.includes('url?q=')) {
              const match = href.match(/url\?q=([^&]+)/);
              if (match) {
                return decodeURIComponent(match[1]);
              }
            }
            if (href.startsWith('http') && !href.includes('google.com')) {
              return href;
            }
          }
        }
      }
      
      // Alternative: Look for website button text
      const websiteButton = await this.page.$('a[aria-label*="website" i]');
      if (websiteButton) {
        const href = await websiteButton.getAttribute('href');
        return href || '';
      }
      
      return '';
    } catch {
      return '';
    }
  }
}
```

### Step 3: Utility Functions

```typescript
// utils/delay.ts
export function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
```

```typescript
// utils/export.ts
import * as fs from 'fs';
import * as path from 'path';

interface PlaceData {
  name: string;
  city: string;
  category: string;
  website: string;
}

export function exportToJSON(data: PlaceData[], filename: string): void {
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const filepath = path.join(outputDir, `${filename}.json`);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`Data exported to: ${filepath}`);
}

export function exportToCSV(data: PlaceData[], filename: string): void {
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const headers = ['name', 'city', 'category', 'website'];
  const csvRows = [headers.join(',')];
  
  for (const item of data) {
    const row = headers.map(header => {
      const value = item[header as keyof PlaceData] || '';
      // Escape commas and quotes in CSV
      if (value.includes(',') || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvRows.push(row.join(','));
  }
  
  const filepath = path.join(outputDir, `${filename}.csv`);
  fs.writeFileSync(filepath, csvRows.join('\n'));
  console.log(`Data exported to: ${filepath}`);
}
```

### Step 4: Main Entry Point

```typescript
// index.ts
import { createBrowser, createContext } from './browser';
import { GoogleMapsScraper } from './scraper';
import { exportToJSON, exportToCSV } from './utils/export';

interface ScraperOptions {
  query: string;
  maxResults?: number;
  headless?: boolean;
  outputFormat?: 'json' | 'csv' | 'both';
}

async function main() {
  // Parse command line arguments or use defaults
  const options: ScraperOptions = {
    query: process.argv[2] || 'restaurants in New York',
    maxResults: parseInt(process.argv[3]) || 50,
    headless: process.argv[4] !== 'false',
    outputFormat: 'both'
  };

  console.log('Starting Google Maps Scraper...');
  console.log(`Query: ${options.query}`);
  console.log(`Max Results: ${options.maxResults}`);
  console.log(`Headless: ${options.headless}`);

  let browser;
  
  try {
    // Initialize browser
    browser = await createBrowser({ headless: options.headless });
    const context = await createContext(browser);
    const page = await context.newPage();
    
    // Create scraper instance
    const scraper = new GoogleMapsScraper(page);
    
    // Run scraper
    const results = await scraper.search({
      query: options.query,
      maxResults: options.maxResults
    });
    
    console.log(`\nScraped ${results.length} places`);
    
    // Export results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `google-maps-${timestamp}`;
    
    if (options.outputFormat === 'json' || options.outputFormat === 'both') {
      exportToJSON(results, filename);
    }
    
    if (options.outputFormat === 'csv' || options.outputFormat === 'both') {
      exportToCSV(results, filename);
    }
    
    // Print sample results
    console.log('\nSample Results:');
    results.slice(0, 5).forEach((place, index) => {
      console.log(`${index + 1}. ${place.name} | ${place.city} | ${place.category} | ${place.website}`);
    });
    
  } catch (error) {
    console.error('Scraper error:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main();
```

---

## Package.json Configuration

```json
{
  "name": "google-maps-scraper",
  "version": "1.0.0",
  "description": "Google Maps scraper using Playwright",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "scrape": "npm run build && node dist/index.js"
  },
  "dependencies": {
    "playwright": "^1.40.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "typescript": "^5.3.0",
    "ts-node": "^10.9.0"
  }
}
```

---

## TypeScript Configuration (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Usage Instructions

### Installation
```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

### Running the Scraper
```bash
# Basic usage (default: restaurants in New York, 50 results)
npm run scrape

# Custom search query
npm run scrape "coffee shops in San Francisco" 100

# Run in visible browser mode (for debugging)
npm run scrape "hotels in Miami" 50 false
```

### Output
Results are saved in the `output/` directory in both JSON and CSV formats:
```
output/
├── google-maps-2024-01-15T10-30-00.json
└── google-maps-2024-01-15T10-30-00.csv
```

---

## Important Selector Reference

Google Maps DOM changes frequently. Here are the key selectors to update if the scraper breaks:

| Element | Selector | Notes |
|---------|----------|-------|
| Results feed | `[role="feed"]` | Container for search results |
| Place links | `a[href*="/maps/place/"]` | Links to individual places |
| Place name | `h1` | Main heading on place page |
| Category | `button[jsaction*="category"]` | May need updating |
| Address | `[data-item-id="address"]` | Full address string |
| Website | `a[data-item-id="authority"]` | Website link |

---

## Anti-Detection Best Practices

1. **Random Delays**: Always add random delays (1-3 seconds) between actions
2. **Human-like Scrolling**: Scroll in random increments, not fixed amounts
3. **Viewport Variation**: Occasionally resize viewport slightly
4. **Session Limits**: Don't scrape more than 100-200 places per session
5. **Proxy Rotation**: Use residential proxies for large-scale scraping
6. **User-Agent Rotation**: Rotate user agents periodically

---

## Error Handling Requirements

1. **Retry Logic**: Implement 3 retries for failed page loads
2. **Timeout Handling**: Set reasonable timeouts (10-30 seconds)
3. **Graceful Degradation**: If a field can't be extracted, set it to "N/A"
4. **Progress Saving**: Save partial results periodically in case of crashes
5. **Logging**: Log all errors with timestamps for debugging

---

## Testing Checklist

- [ ] Scraper navigates to Google Maps successfully
- [ ] Consent dialog is handled properly
- [ ] Results scroll and load correctly
- [ ] Place names are extracted accurately
- [ ] Categories are extracted accurately
- [ ] Cities are parsed from addresses correctly
- [ ] Websites are extracted and decoded properly
- [ ] JSON export works correctly
- [ ] CSV export handles special characters
- [ ] Scraper handles missing data gracefully
- [ ] Scraper respects rate limits

---

## Legal Notice

This scraper is for educational purposes only. Web scraping Google Maps may violate Google's Terms of Service. Users are responsible for ensuring their use complies with all applicable laws and terms of service.

---

## Output Data Format Example

### JSON Output
```json
[
  {
    "name": "Joe's Pizza",
    "city": "New York",
    "category": "Pizza Restaurant",
    "website": "https://joespizzanyc.com"
  },
  {
    "name": "Shake Shack",
    "city": "New York",
    "category": "Burger Restaurant",
    "website": "https://shakeshack.com"
  }
]
```

### CSV Output
```csv
name,city,category,website
Joe's Pizza,New York,Pizza Restaurant,https://joespizzanyc.com
Shake Shack,New York,Burger Restaurant,https://shakeshack.com
```

---

## Summary

This prompt provides everything needed to build a complete Google Maps scraper that extracts:
- **Name**: Business name from the h1 heading
- **City**: Parsed from the full address
- **Category**: Business type/category
- **Website**: Business website URL

The implementation uses Playwright for browser automation with anti-detection measures to mimic human behavior.
