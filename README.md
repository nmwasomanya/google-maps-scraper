# Google Maps Scraper

A web scraper that extracts business information from Google Maps using browser automation (Playwright) instead of the paid Google Maps API.

## Target Data Fields
- **Name** - Business/place name
- **City** - City where business is located
- **Category** - Business category/type
- **Website** - Business website URL

## Documentation

See [AI_AGENT_PROMPT.md](./AI_AGENT_PROMPT.md) for a detailed implementation guide that can be used to build this scraper.

## How It Works

This scraper uses **browser automation** (Playwright) to:
1. Navigate to Google Maps search URLs
2. Scroll through results to load more listings
3. Visit each place's detail page
4. Extract structured data from the DOM

## Cost Comparison

| Method | Cost |
|--------|------|
| Google Places API | $17-$40 per 1000 requests |
| Web Scraper | Compute/proxy costs only |

## Legal Notice

This tool is for educational purposes only. Web scraping Google Maps may violate Google's Terms of Service.