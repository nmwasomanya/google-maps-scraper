/**
 * Simple JSON file-based database for storing scraped results
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

// Extended PlaceData with keyword
export interface PlaceDataWithKeyword {
  name: string;
  city: string;
  category: string;
  website: string;
  keyword: string;
  scrapedAt?: string;
}

interface DatabaseSchema {
  places: PlaceDataWithKeyword[];
  lastUpdated: string;
  totalScraped: number;
}

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'database.json');

class Database {
  private dbPath: string;
  private data: DatabaseSchema;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    this.data = this.load();
  }

  /**
   * Ensures the data directory exists
   */
  private ensureDataDir(): void {
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  /**
   * Loads the database from disk
   */
  private load(): DatabaseSchema {
    this.ensureDataDir();
    
    if (fs.existsSync(this.dbPath)) {
      try {
        const content = fs.readFileSync(this.dbPath, 'utf-8');
        const parsed = JSON.parse(content);
        // Validate structure
        if (parsed && Array.isArray(parsed.places)) {
          return parsed;
        }
      } catch (error) {
        logger.error(`Failed to load database: ${error}`);
      }
    }
    
    // Return empty database
    return {
      places: [],
      lastUpdated: new Date().toISOString(),
      totalScraped: 0
    };
  }

  /**
   * Saves the database to disk
   */
  private save(): void {
    this.ensureDataDir();
    
    try {
      this.data.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      logger.error(`Failed to save database: ${error}`);
    }
  }

  /**
   * Adds a place to the database (avoids duplicates by website URL)
   */
  addPlace(place: PlaceDataWithKeyword): boolean {
    // Check for duplicates by website URL
    const exists = this.data.places.some(
      p => p.website === place.website && p.website !== 'N/A'
    );
    
    if (!exists) {
      this.data.places.push({
        ...place,
        scrapedAt: new Date().toISOString()
      });
      this.data.totalScraped++;
      this.save();
      return true;
    }
    
    return false;
  }

  /**
   * Adds multiple places to the database
   */
  addPlaces(places: PlaceDataWithKeyword[]): number {
    let added = 0;
    for (const place of places) {
      if (this.addPlace(place)) {
        added++;
      }
    }
    return added;
  }

  /**
   * Gets all places from the database
   */
  getAllPlaces(): PlaceDataWithKeyword[] {
    return [...this.data.places];
  }

  /**
   * Gets the total count of places
   */
  getCount(): number {
    return this.data.places.length;
  }

  /**
   * Gets database statistics
   */
  getStats(): { count: number; lastUpdated: string; totalScraped: number } {
    return {
      count: this.data.places.length,
      lastUpdated: this.data.lastUpdated,
      totalScraped: this.data.totalScraped
    };
  }

  /**
   * Resets (clears) the database without deleting the file
   */
  reset(): void {
    this.data = {
      places: [],
      lastUpdated: new Date().toISOString(),
      totalScraped: 0
    };
    this.save();
    logger.info('Database has been reset');
  }

  /**
   * Searches places by keyword or name
   */
  search(query: string): PlaceDataWithKeyword[] {
    const lowerQuery = query.toLowerCase();
    return this.data.places.filter(
      p => p.name.toLowerCase().includes(lowerQuery) ||
           p.keyword.toLowerCase().includes(lowerQuery) ||
           p.city.toLowerCase().includes(lowerQuery)
    );
  }
}

// Export singleton instance
export const database = new Database();
