/**
 * Navigation utilities for Google Maps scraping
 * Handles navigation with proper timeout settings and retry logic
 */

import { Page } from 'playwright';
import { logger } from './logger';
import { randomDelay } from './delay';

// Configuration constants with environment variable overrides
const NAVIGATION_TIMEOUT = parseInt(process.env.NAVIGATION_TIMEOUT || '60000', 10);
const SELECTOR_TIMEOUT = parseInt(process.env.SELECTOR_TIMEOUT || '15000', 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);

// Selectors for Google Maps pages
const MAPS_SEARCH_SELECTORS = [
  '[role="feed"]',
  'div.m6QErb',
  '.m6QErb[aria-label]',
  'a.hfpxzc'
];

const MAPS_PLACE_DETAIL_SELECTORS = [
  'h1'
];

export interface NavigateOptions {
  waitForSelector?: string;
  isPlaceDetailPage?: boolean;
}

/**
 * Calculates exponential backoff delay
 * @param attempt Current attempt number (1-based)
 * @returns Base delay in milliseconds
 */
function getExponentialBackoffDelay(attempt: number): { min: number; max: number } {
  // Attempt 1: 2-4 seconds, Attempt 2: 4-8 seconds, Attempt 3: 8-16 seconds
  const baseMin = Math.pow(2, attempt) * 1000;
  const baseMax = baseMin * 2;
  return { min: baseMin, max: baseMax };
}

/**
 * Navigates to a URL with retry logic and proper wait conditions for Google Maps
 * Uses domcontentloaded instead of networkidle to avoid timeouts on SPAs
 * 
 * @param page Playwright page instance
 * @param url URL to navigate to
 * @param options Navigation options
 * @returns true on success, false on failure
 */
export async function navigateToUrl(
  page: Page, 
  url: string, 
  options?: NavigateOptions
): Promise<boolean> {
  const { waitForSelector, isPlaceDetailPage = false } = options || {};
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.debug(`Navigation attempt ${attempt}/${MAX_RETRIES} to: ${url}`);
      
      // Use domcontentloaded instead of networkidle for SPA compatibility
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: NAVIGATION_TIMEOUT 
      });
      
      // Wait for specific selector if provided
      if (waitForSelector) {
        try {
          await page.waitForSelector(waitForSelector, { timeout: SELECTOR_TIMEOUT });
          logger.debug(`Found custom selector: ${waitForSelector}`);
          return true;
        } catch {
          logger.warn(`Custom selector not found: ${waitForSelector}`);
        }
      }
      
      // Wait for appropriate Google Maps selectors based on page type
      const selectors = isPlaceDetailPage 
        ? MAPS_PLACE_DETAIL_SELECTORS 
        : MAPS_SEARCH_SELECTORS;
      
      for (const selector of selectors) {
        try {
          await page.waitForSelector(selector, { timeout: SELECTOR_TIMEOUT });
          logger.debug(`Found selector: ${selector}`);
          return true;
        } catch {
          // Try next selector
        }
      }
      
      // If we get here, page loaded but no expected selectors found
      // This is still a successful navigation, but might need a longer wait
      logger.warn(`Navigation succeeded but expected selectors not found for: ${url}`);
      return true;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Navigation attempt ${attempt}/${MAX_RETRIES} failed for URL: ${url}`);
      logger.warn(`Error: ${errorMessage}`);
      
      if (attempt === MAX_RETRIES) {
        logger.error(`All navigation attempts failed for URL: ${url}`);
        logger.error(`Suggestion: Check network connectivity and proxy settings if configured.`);
        return false;
      }
      
      // Exponential backoff before retry
      const { min, max } = getExponentialBackoffDelay(attempt);
      logger.debug(`Waiting ${min}-${max}ms before retry...`);
      await randomDelay(min, max);
    }
  }
  
  return false;
}

/**
 * Exports timeout configuration for use in other modules
 */
export const config = {
  NAVIGATION_TIMEOUT,
  SELECTOR_TIMEOUT,
  MAX_RETRIES
};
