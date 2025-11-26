/**
 * Web server for Google Maps Scraper UI
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { createBrowser, createContext } from '../browser';
import { logger } from '../utils/logger';
import { database, PlaceDataWithKeyword } from '../utils/database';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// Store active scraping sessions
interface ScrapingSession {
  status: 'idle' | 'running' | 'completed' | 'error';
  progress: number;
  total: number;
  results: PlaceDataWithKeyword[];
  error?: string;
  startTime?: Date;
  endTime?: Date;
  currentKeyword?: string;
  keywordIndex?: number;
  totalKeywords?: number;
}

const sessions: Map<string, ScrapingSession> = new Map();

// Generate unique session ID
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// API Routes

// Start a new scraping job with batch keywords
app.post('/api/scrape', async (req: Request, res: Response) => {
  const { location, keywords, maxResults, headless = true } = req.body;

  if (!location || typeof location !== 'string') {
    return res.status(400).json({ error: 'Location is required' });
  }

  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return res.status(400).json({ error: 'At least one keyword is required' });
  }

  const sessionId = generateSessionId();
  // When maxResults is undefined, we'll update the total as we discover places
  const estimatedPlaces = maxResults ? keywords.length * maxResults : 0;
  
  sessions.set(sessionId, {
    status: 'running',
    progress: 0,
    total: estimatedPlaces,
    results: [],
    startTime: new Date(),
    currentKeyword: keywords[0],
    keywordIndex: 1,
    totalKeywords: keywords.length
  });

  logger.info(`Starting scrape session ${sessionId} - maxResults: ${maxResults !== undefined ? maxResults : 'unlimited (crawl all available)'}`);
  logger.info(`Only places with websites will be recorded`);
  logger.debug(`Debug log file: ${logger.getLogFilePath()}`);

  // Start scraping in background
  (async () => {
    let browser;
    try {
      browser = await createBrowser({ headless });
      const context = await createContext(browser);
      const page = await context.newPage();
      
      const allResults: PlaceDataWithKeyword[] = [];
      
      // Process each keyword
      for (let keywordIdx = 0; keywordIdx < keywords.length; keywordIdx++) {
        const keyword = keywords[keywordIdx];
        const query = `${keyword} in ${location}`;
        
        // Update current keyword in session
        const session = sessions.get(sessionId);
        if (session) {
          session.currentKeyword = keyword;
          session.keywordIndex = keywordIdx + 1;
        }
        
        logger.info(`Processing keyword ${keywordIdx + 1}/${keywords.length}: "${keyword}"`);
        
        // Navigate to search
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
        try {
          await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
        } catch (e) {
          logger.error(`Failed to navigate for keyword "${keyword}": ${e}`);
          continue;
        }
        
        // Handle consent dialog
        try {
          const acceptButton = await page.$('button:has-text("Accept all")');
          if (acceptButton) await acceptButton.click();
        } catch {}
        
        // Wait for feed - try multiple selectors
        const resultSelectors = [
          '[role="feed"]',
          'div.m6QErb',
          '.m6QErb[aria-label]',
          'div[role="main"] a[href*="/maps/place/"]',
          'a.hfpxzc'
        ];
        
        let resultsFound = false;
        for (const selector of resultSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 5000 });
            logger.info(`Found results for "${keyword}" using selector: ${selector}`);
            resultsFound = true;
            break;
          } catch {
            // Try next selector
          }
        }
        
        if (!resultsFound) {
          logger.warn(`No results feed found for keyword "${keyword}"`);
          continue;
        }
        
        // Add a small delay to ensure results are fully loaded
        await new Promise(r => setTimeout(r, 1500));
        
        // Multiple selectors for the scrollable container
        const feedSelectors = [
          '[role="feed"]',
          'div[role="main"] div[aria-label]',
          '.m6QErb[aria-label]',
          '.m6QErb.DxyBCb',
          'div.m6QErb'
        ];
        
        // Collect links for this keyword
        const links: Set<string> = new Set();
        let scrollAttempts = 0;
        const stableCountThreshold = 10; // Number of scroll attempts without new results before stopping
        const maxScrollAttempts = 100; // Maximum scroll attempts
        
        // Continue scrolling until we reach maxResults (if set) or find no more results
        while ((maxResults === undefined || links.size < maxResults) && scrollAttempts < maxScrollAttempts) {
          // Try multiple link selectors
          const linkSelectors = [
            'a[href*="/maps/place/"]',
            'a.hfpxzc',
            'div[role="feed"] a[href*="maps"]',
            '.Nv2PK a[href]'
          ];
          
          let newLinks: string[] = [];
          for (const linkSelector of linkSelectors) {
            try {
              newLinks = await page.$$eval(
                linkSelector,
                (elements) => elements
                  .map(el => el.getAttribute('href'))
                  .filter((href): href is string => href !== null && href.includes('/maps/place/'))
              );
              if (newLinks.length > 0) break;
            } catch {
              // Selector not found, try next
            }
          }
          
          const prevSize = links.size;
          newLinks.forEach(link => links.add(link));
          
          if (links.size === prevSize) {
            scrollAttempts++;
            if (scrollAttempts >= stableCountThreshold) {
              logger.debug(`No new results after ${stableCountThreshold} scroll attempts for keyword "${keyword}"`);
              break;
            }
          } else {
            scrollAttempts = 0;
            logger.debug(`Found ${links.size} links so far for keyword "${keyword}"`);
          }
          
          // Scroll using multiple selectors
          await page.evaluate((selectors: string[]) => {
            for (const selector of selectors) {
              const feed = document.querySelector(selector);
              if (feed && feed.scrollHeight > feed.clientHeight) {
                feed.scrollTop += 500;
                return;
              }
            }
            // Fallback: scroll the first scrollable div within main
            const mainArea = document.querySelector('div[role="main"]');
            if (mainArea) {
              const scrollables = Array.from(mainArea.querySelectorAll('div'));
              for (const div of scrollables) {
                if (div.scrollHeight > div.clientHeight) {
                  div.scrollTop += 500;
                  return;
                }
              }
            }
          }, feedSelectors);
          
          await new Promise(r => setTimeout(r, 800));
        }
        
        // Return all links if maxResults is undefined, otherwise slice to maxResults
        const collectedLinks = Array.from(links);
        const placeLinks = maxResults !== undefined ? collectedLinks.slice(0, maxResults) : collectedLinks;
        logger.info(`Found ${placeLinks.length} places for keyword "${keyword}"`);
        
        // Update total based on actual links found
        const currentSession = sessions.get(sessionId);
        if (currentSession) {
          // Recalculate total based on what we've found
          const remainingKeywords = keywords.length - keywordIdx - 1;
          const estimatedRemaining = maxResults !== undefined ? remainingKeywords * maxResults : remainingKeywords * placeLinks.length;
          currentSession.total = allResults.length + placeLinks.length + estimatedRemaining;
        }
        
        // Extract data from each place (only record places with websites)
        for (let i = 0; i < placeLinks.length; i++) {
          try {
            const link = placeLinks[i];
            const fullUrl = link.startsWith('http') ? link : `https://www.google.com${link}`;
            logger.debug(`Processing place ${i + 1}/${placeLinks.length} for keyword "${keyword}": ${fullUrl}`);
            await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForSelector('h1', { timeout: 10000 });
            
            const name = await page.$eval('h1', el => el.textContent?.trim() || 'N/A').catch(() => 'N/A');
            
            let category = 'N/A';
            try {
              const catElement = await page.$('button[jsaction*="category"]');
              if (catElement) {
                category = await catElement.textContent() || 'N/A';
              }
            } catch {}
            
            let city = 'N/A';
            try {
              const addrElement = await page.$('[data-item-id="address"]');
              if (addrElement) {
                const addr = await addrElement.textContent() || '';
                const parts = addr.split(',');
                if (parts.length >= 2) {
                  city = parts[parts.length - 2].replace(/\d+/g, '').trim();
                }
              }
            } catch {}
            
            let website = 'N/A';
            try {
              const webElement = await page.$('a[data-item-id="authority"]');
              if (webElement) {
                const href = await webElement.getAttribute('href');
                if (href && href.includes('url?q=')) {
                  const match = href.match(/url\?q=([^&]+)/);
                  if (match) website = decodeURIComponent(match[1]);
                } else if (href && href.startsWith('http')) {
                  website = href;
                }
              }
            } catch {}
            
            // Only add places that have a valid website (not 'N/A' or empty)
            if (website && website !== 'N/A' && website.startsWith('http')) {
              allResults.push({ name, city, category, website, keyword });
              logger.debug(`Added place: ${name}, website: ${website}`);
              
              const updateSession = sessions.get(sessionId);
              if (updateSession) {
                updateSession.results = [...allResults];
                updateSession.progress = allResults.length;
              }
            } else {
              logger.debug(`Skipped place without website: ${name}`);
            }
            
            await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
          } catch (err) {
            logger.error(`Error extracting place for keyword "${keyword}": ${err}`);
          }
        }
      }
      
      // Mark completed and save to database
      const finalSession = sessions.get(sessionId);
      if (finalSession) {
        finalSession.status = 'completed';
        finalSession.results = allResults;
        finalSession.total = allResults.length;
        finalSession.progress = allResults.length;
        finalSession.endTime = new Date();
        
        // Save results to persistent database
        const addedCount = database.addPlaces(allResults);
        logger.info(`Scraping completed. Total places with websites: ${allResults.length}`);
        logger.info(`Added ${addedCount} new places to database (${allResults.length - addedCount} duplicates skipped)`);
      }
      
    } catch (error) {
      const session = sessions.get(sessionId);
      if (session) {
        session.status = 'error';
        session.error = error instanceof Error ? error.message : 'Unknown error';
        session.endTime = new Date();
      }
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  })();

  res.json({ sessionId, message: 'Scraping started' });
});

// Get scraping status
app.get('/api/status/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    status: session.status,
    progress: session.progress,
    total: session.total,
    resultsCount: session.results.length,
    error: session.error,
    startTime: session.startTime,
    endTime: session.endTime,
    currentKeyword: session.currentKeyword,
    keywordIndex: session.keywordIndex,
    totalKeywords: session.totalKeywords
  });
});

// Get results
app.get('/api/results/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({ results: session.results });
});

// Download results as JSON
app.get('/api/download/:sessionId/json', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=google-maps-results-${Date.now()}.json`);
  res.send(JSON.stringify(session.results, null, 2));
});

// Download results as CSV
app.get('/api/download/:sessionId/csv', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const headers = ['name', 'city', 'category', 'website', 'keyword'];
  const csvRows = [headers.join(',')];
  
  for (const item of session.results) {
    const row = headers.map(header => {
      const value = item[header as keyof PlaceDataWithKeyword] || '';
      if (value.includes(',') || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvRows.push(row.join(','));
  }
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=google-maps-results-${Date.now()}.csv`);
  res.send(csvRows.join('\n'));
});

// === Database API Endpoints ===

// Get all places from the database
app.get('/api/database', (req: Request, res: Response) => {
  const places = database.getAllPlaces();
  const stats = database.getStats();
  res.json({ places, stats });
});

// Get database statistics
app.get('/api/database/stats', (req: Request, res: Response) => {
  const stats = database.getStats();
  res.json(stats);
});

// Reset (clear) the database
app.post('/api/database/reset', (req: Request, res: Response) => {
  database.reset();
  res.json({ success: true, message: 'Database has been reset' });
});

// Search places in the database
app.get('/api/database/search', (req: Request, res: Response) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Search query is required' });
  }
  const results = database.search(q);
  res.json({ results });
});

// Download all database data as JSON
app.get('/api/database/download/json', (req: Request, res: Response) => {
  const places = database.getAllPlaces();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=database-export-${Date.now()}.json`);
  res.send(JSON.stringify(places, null, 2));
});

// Download all database data as CSV
app.get('/api/database/download/csv', (req: Request, res: Response) => {
  const places = database.getAllPlaces();
  const headers = ['name', 'city', 'category', 'website', 'keyword', 'scrapedAt'];
  const csvRows = [headers.join(',')];
  
  for (const item of places) {
    const row = headers.map(header => {
      const value = item[header as keyof PlaceDataWithKeyword] || '';
      if (value.includes(',') || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvRows.push(row.join(','));
  }
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=database-export-${Date.now()}.csv`);
  res.send(csvRows.join('\n'));
});

// Serve the main UI
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// Start server
export function startServer(): void {
  app.listen(PORT, () => {
    logger.info(`Google Maps Scraper UI running at http://localhost:${PORT}`);
  });
}

// Run if called directly
if (require.main === module) {
  startServer();
}
