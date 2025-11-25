/**
 * Core Google Maps scraping logic
 */

import { Page } from 'playwright';
import { randomDelay } from './utils/delay';
import { logger } from './utils/logger';
import { savePartialResults } from './utils/export';
import { parseCityFromAddress, extractActualUrl, cleanText, isGoogleUrl } from './parser';
import { SearchOptions, PlaceData } from './types';

const MAX_RETRIES = 3;
const PARTIAL_SAVE_INTERVAL = 10;

export class GoogleMapsScraper {
  private page: Page;
  
  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Main search method that orchestrates the scraping workflow
   * @param options Search options including query and max results
   */
  async search(options: SearchOptions): Promise<PlaceData[]> {
    const { query, maxResults = 50 } = options;
    const results: PlaceData[] = [];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Step 1: Navigate to Google Maps
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    logger.info(`Navigating to: ${searchUrl}`);
    
    await this.navigateWithRetry(searchUrl);
    
    // Step 2: Handle consent dialog if present
    await this.handleConsentDialog();
    
    // Step 3: Wait for results to load
    try {
      await this.page.waitForSelector('[role="feed"]', { timeout: 10000 });
    } catch {
      logger.error('Could not find results feed. The page structure may have changed.');
      return results;
    }
    
    // Step 4: Scroll to load more results and collect links
    logger.info('Scrolling to collect place links...');
    const placeLinks = await this.scrollAndCollectLinks(maxResults);
    logger.info(`Found ${placeLinks.length} place links`);
    
    // Step 5: Visit each place and extract data
    for (let i = 0; i < placeLinks.length; i++) {
      const link = placeLinks[i];
      try {
        const placeData = await this.extractPlaceData(link);
        if (placeData) {
          results.push(placeData);
          logger.progress(i + 1, placeLinks.length, placeData.name);
        }
        
        // Save partial results periodically
        if (results.length % PARTIAL_SAVE_INTERVAL === 0 && results.length > 0) {
          savePartialResults(results, `google-maps-${timestamp}`);
        }
        
        await randomDelay(1000, 3000); // Human-like delay between places
      } catch (error) {
        logger.error(`Error scraping place: ${error}`);
      }
    }
    
    return results;
  }

  /**
   * Navigates to a URL with retry logic
   * @param url URL to navigate to
   */
  private async navigateWithRetry(url: string): Promise<void> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        return;
      } catch (error) {
        logger.warn(`Navigation attempt ${attempt}/${MAX_RETRIES} failed`);
        if (attempt === MAX_RETRIES) {
          throw error;
        }
        await randomDelay(2000, 5000);
      }
    }
  }

  /**
   * Handles Google consent dialog if present
   * Tries multiple button selectors to handle different consent dialog variations
   */
  private async handleConsentDialog(): Promise<void> {
    try {
      // Multiple selectors for consent buttons (handles different locales and variations)
      const consentSelectors = [
        'button:has-text("Accept all")',
        'button:has-text("Accept")',
        'button:has-text("I agree")',
        'button[aria-label*="Accept"]',
        'form[action*="consent"] button'
      ];
      
      for (const selector of consentSelectors) {
        const acceptButton = await this.page.$(selector);
        if (acceptButton) {
          await acceptButton.click();
          await randomDelay(500, 1000);
          logger.info('Handled consent dialog');
          return;
        }
      }
    } catch {
      // No consent dialog present or unable to handle
    }
  }

  /**
   * Scrolls the results feed and collects place links
   * @param maxResults Maximum number of results to collect
   */
  private async scrollAndCollectLinks(maxResults: number): Promise<string[]> {
    const links: Set<string> = new Set();
    let previousCount = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 50;
    const stableCountThreshold = 5; // Number of scroll attempts without new results before stopping
    
    // Find the scrollable results container
    const feedSelector = '[role="feed"]';
    
    while (links.size < maxResults && scrollAttempts < maxScrollAttempts) {
      // Collect current visible place links
      const newLinks = await this.page.$$eval(
        'a[href*="/maps/place/"]',
        (elements) => elements.map(el => el.getAttribute('href')).filter(Boolean) as string[]
      );
      
      newLinks.forEach(link => links.add(link));
      
      // Check if we've stopped getting new results (robust end detection)
      if (links.size === previousCount) {
        scrollAttempts++;
        // If no new results after multiple attempts, we've likely reached the end
        if (scrollAttempts >= stableCountThreshold) {
          logger.info('No new results found after multiple scroll attempts - assuming end of list');
          break;
        }
      } else {
        scrollAttempts = 0;
        previousCount = links.size;
      }
      
      // Scroll down the feed with random increment for human-like behavior
      const scrollAmount = Math.floor(Math.random() * 200) + 400; // 400-600 pixels
      await this.page.evaluate(({ selector, amount }: { selector: string; amount: number }) => {
        const feed = document.querySelector(selector);
        if (feed) {
          feed.scrollTop += amount;
        }
      }, { selector: feedSelector, amount: scrollAmount });
      
      await randomDelay(800, 1500);
      
      // Check for "end of results" indicator (multiple possible texts for different locales)
      const endOfResults = await this.page.evaluate(() => {
        // Check for common end-of-list indicators in the DOM
        const indicators = Array.from(document.querySelectorAll('[role="feed"] > div:last-child'));
        for (const indicator of indicators) {
          const text = indicator.textContent || '';
          // Look for patterns that indicate end of results
          if (text.toLowerCase().includes('end') || text.toLowerCase().includes('no more')) {
            return true;
          }
        }
        return false;
      });
      
      if (endOfResults) {
        logger.info('Reached end of results list');
        break;
      }
    }
    
    return Array.from(links).slice(0, maxResults);
  }

  /**
   * Extracts place data from a place detail page
   * @param placeUrl URL of the place to extract data from
   */
  private async extractPlaceData(placeUrl: string): Promise<PlaceData | null> {
    try {
      // Navigate to place details page
      const fullUrl = placeUrl.startsWith('http') ? placeUrl : `https://www.google.com${placeUrl}`;
      
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await this.page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 30000 });
          break;
        } catch (error) {
          if (attempt === MAX_RETRIES) throw error;
          await randomDelay(1000, 2000);
        }
      }
      
      // Wait for place details to load
      await this.page.waitForSelector('h1', { timeout: 10000 });
      
      // Extract all data fields
      const name = await this.extractName();
      const category = await this.extractCategory();
      const city = await this.extractCity();
      const website = await this.extractWebsite();
      
      return {
        name: name || 'N/A',
        city: city || 'N/A',
        category: category || 'N/A',
        website: website || 'N/A'
      };
    } catch (error) {
      logger.error(`Failed to extract place data: ${error}`);
      return null;
    }
  }

  /**
   * Extracts the business name from the page
   */
  private async extractName(): Promise<string> {
    try {
      // Primary selector: Main heading
      const nameElement = await this.page.$('h1');
      if (nameElement) {
        const text = await nameElement.textContent();
        return cleanText(text);
      }
      return '';
    } catch {
      return '';
    }
  }

  /**
   * Extracts the business category from the page
   */
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
            return cleanText(text);
          }
        }
      }
      
      // Fallback: Look for category text pattern
      const categoryText = await this.page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('button'));
        for (const el of elements) {
          const text = el.textContent || '';
          // Categories typically don't contain numbers and are short
          if (text.length > 2 && text.length < 50 && !/\d/.test(text) && !text.includes('Directions')) {
            return text;
          }
        }
        return '';
      });
      
      return cleanText(categoryText);
    } catch {
      return '';
    }
  }

  /**
   * Extracts the city from the business address
   */
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
            // Parse city from address
            return parseCityFromAddress(fullAddress);
          }
        }
      }
      
      return '';
    } catch {
      return '';
    }
  }

  /**
   * Extracts the business website from the page
   */
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
            const actualUrl = extractActualUrl(href);
            // Use proper hostname-based check to filter out Google URLs
            if (actualUrl.startsWith('http') && !isGoogleUrl(actualUrl)) {
              return actualUrl;
            }
          }
        }
      }
      
      // Alternative: Look for website button text
      const websiteButton = await this.page.$('a[aria-label*="website" i]');
      if (websiteButton) {
        const href = await websiteButton.getAttribute('href');
        if (href) {
          const actualUrl = extractActualUrl(href);
          if (!isGoogleUrl(actualUrl)) {
            return actualUrl;
          }
        }
      }
      
      return '';
    } catch {
      return '';
    }
  }
}
