/**
 * Browser setup and configuration with anti-detection measures
 */

import { chromium, Browser, BrowserContext } from 'playwright';
import { BrowserConfig } from './types';

/**
 * Creates a new Playwright browser instance with anti-detection configuration
 * @param config Browser configuration options
 */
export async function createBrowser(config: BrowserConfig): Promise<Browser> {
  const launchOptions: Parameters<typeof chromium.launch>[0] = {
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
  };

  if (config.proxy) {
    launchOptions.proxy = {
      server: config.proxy.server,
      username: config.proxy.username,
      password: config.proxy.password
    };
  }

  return await chromium.launch(launchOptions);
}

/**
 * Creates a browser context with stealth configuration
 * @param browser Browser instance to create context from
 */
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
