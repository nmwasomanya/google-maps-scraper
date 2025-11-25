/**
 * Data extraction and parsing functions
 */

/**
 * Parses city from a full address string
 * Common address patterns:
 * "123 Main St, New York, NY 10001"
 * "456 Oak Ave, Los Angeles, CA"
 * @param address Full address string
 * @returns Extracted city name
 */
export function parseCityFromAddress(address: string): string {
  const parts = address.split(',').map(part => part.trim());
  
  if (parts.length >= 2) {
    // City is typically the second-to-last part (before state/zip)
    const cityPart = parts[parts.length - 2] || parts[1];
    // Remove any numbers (street numbers, zip codes)
    return cityPart.replace(/\d+/g, '').trim();
  }
  
  return address;
}

/**
 * Extracts actual URL from Google's redirect URL
 * @param googleUrl URL that may contain Google redirect
 * @returns Decoded actual URL
 */
export function extractActualUrl(googleUrl: string): string {
  if (googleUrl.includes('url?q=')) {
    const match = googleUrl.match(/url\?q=([^&]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }
  return googleUrl;
}

/**
 * Cleans and normalizes text content
 * @param text Raw text content
 * @returns Cleaned text
 */
export function cleanText(text: string | null): string {
  if (!text) return '';
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Validates if a string looks like a valid website URL
 * @param url URL to validate
 * @returns True if URL appears valid
 */
export function isValidWebsite(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Checks if a URL is a Google domain URL
 * Uses proper hostname parsing to avoid substring matching vulnerabilities
 * @param url URL to check
 * @returns True if URL is a Google domain
 */
export function isGoogleUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    // Check if hostname is google.com or ends with .google.com
    return hostname === 'google.com' || hostname.endsWith('.google.com');
  } catch {
    return false;
  }
}
