export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchConnector {
  search(query: string): Promise<SearchResult[]>;
}

export class PlaceholderSearchConnector implements SearchConnector {
  async search(query: string): Promise<SearchResult[]> {
    const normalized = query.trim();
    if (!normalized) {
      return [];
    }

    return [
      {
        title: `External insight for: ${normalized}`,
        url: `https://example.com/search?q=${encodeURIComponent(normalized)}`,
        snippet: "Placeholder external search result. Replace connector with real API integration.",
      },
    ];
  }
}
