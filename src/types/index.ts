/**
 * TypeScript interfaces for Google Maps Scraper
 */

/**
 * Configuration for browser launch
 */
export interface BrowserConfig {
  headless: boolean;
  slowMo?: number;
  userAgent?: string;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
}

/**
 * Search options for the scraper
 */
export interface SearchOptions {
  query: string;           // e.g., "restaurants in New York"
  maxResults?: number;     // Maximum results to scrape (optional - if not set, crawls all available)
  scrollDelay?: number;    // Delay between scrolls in ms
}

/**
 * Extracted place data structure
 */
export interface PlaceData {
  name: string;
  city: string;
  category: string;
  website: string;
}

/**
 * Main scraper options
 */
export interface ScraperOptions {
  query: string;
  maxResults?: number;
  headless?: boolean;
  outputFormat?: 'json' | 'csv' | 'both';
}
