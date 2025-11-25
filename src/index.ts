/**
 * Main entry point for Google Maps Scraper
 */

import { createBrowser, createContext } from './browser';
import { GoogleMapsScraper } from './scraper';
import { exportToJSON, exportToCSV } from './utils/export';
import { logger } from './utils/logger';
import { ScraperOptions } from './types';

async function main(): Promise<void> {
  // Parse command line arguments or use defaults
  const options: ScraperOptions = {
    query: process.argv[2] || 'restaurants in New York',
    maxResults: process.argv[3] ? parseInt(process.argv[3]) : undefined, // undefined = crawl all available
    headless: process.argv[4] !== 'false',
    outputFormat: 'both'
  };

  logger.info('Starting Google Maps Scraper...');
  logger.info(`Query: ${options.query}`);
  logger.info(`Max Results: ${options.maxResults !== undefined ? options.maxResults : 'unlimited (crawl all available)'}`);
  logger.info(`Headless: ${options.headless}`);
  logger.info(`Debug log file: ${logger.getLogFilePath()}`);

  let browser;
  
  try {
    // Initialize browser
    browser = await createBrowser({ headless: options.headless ?? true });
    const context = await createContext(browser);
    const page = await context.newPage();
    
    // Create scraper instance
    const scraper = new GoogleMapsScraper(page);
    
    // Run scraper
    const results = await scraper.search({
      query: options.query,
      maxResults: options.maxResults
    });
    
    logger.info(`Scraped ${results.length} places`);
    
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
    logger.info('Sample Results:');
    results.slice(0, 5).forEach((place, index) => {
      console.log(`${index + 1}. ${place.name} | ${place.city} | ${place.category} | ${place.website}`);
    });
    
  } catch (error) {
    logger.error('Scraper error:', error as Error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main();
