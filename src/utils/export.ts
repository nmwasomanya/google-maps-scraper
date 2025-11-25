/**
 * Export utilities for JSON and CSV output
 */

import * as fs from 'fs';
import * as path from 'path';
import { PlaceData } from '../types';
import { logger } from './logger';

/**
 * Exports place data to a JSON file
 * @param data Array of place data to export
 * @param filename Output filename (without extension)
 */
export function exportToJSON(data: PlaceData[], filename: string): void {
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const filepath = path.join(outputDir, `${filename}.json`);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  logger.info(`Data exported to: ${filepath}`);
}

/**
 * Exports place data to a CSV file
 * @param data Array of place data to export
 * @param filename Output filename (without extension)
 */
export function exportToCSV(data: PlaceData[], filename: string): void {
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const headers: (keyof PlaceData)[] = ['name', 'city', 'category', 'website'];
  const csvRows = [headers.join(',')];
  
  for (const item of data) {
    const row = headers.map(header => {
      const value = item[header] || '';
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
  logger.info(`Data exported to: ${filepath}`);
}

/**
 * Saves partial results for crash recovery
 * @param data Array of place data to save
 * @param filename Output filename (without extension)
 */
export function savePartialResults(data: PlaceData[], filename: string): void {
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const filepath = path.join(outputDir, `${filename}_partial.json`);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  logger.debug(`Partial results saved to: ${filepath}`);
}
