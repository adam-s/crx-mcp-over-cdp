import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IAlgoliaSearchService = createDecorator<IAlgoliaSearchService>('algoliaSearchService');

/**
 * Field-level highlighting details.
 */
export interface HighlightField {
  value: string;
  matchLevel: 'none' | 'partial' | 'full';
  fullyHighlighted: boolean;
  matchedWords: string[];
}

/**
 * Highlighting results for configurable fields.
 */
export interface HighlightResult {
  title: HighlightField;
  url: HighlightField;
  author: HighlightField;
}

/**
 * Ranking information for a hit.
 */
export interface RankingInfo {
  forcedTypoFirstInRanking: boolean;
  nbTypos: number;
  firstMatchedWord: number;
  proximityDistance: number;
  userScore: number;
  geoDistance: number;
  geoPrecision: number;
  nbExactWords: number;
  words: number;
  filters: number;
}

/**
 * Single search hit from Algolia.
 */
export interface IHit {
  title: string;
  url: string;
  author: string;
  points: number;
  num_comments: number;
  story_id: number;
  created_at_i: number;
  created_at: string;
  updated_at: string;
  _tags: string[];
  children: number[];
  objectID: string;
  _highlightResult: HighlightResult;
  _rankingInfo: RankingInfo;
}

/**
 * Full Algolia search response.
 */
export interface IAlgoliaSearchResponse {
  hits: IHit[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
  exhaustiveNbHits: boolean;
  exhaustiveTypo: boolean;
  exhaustive: {
    nbHits: boolean;
    typo: boolean;
  };
  query: string;
  params: string;
  queryID: string;
  serverUsed: string;
  indexUsed: string;
  parsedQuery: string;
  timeoutCounts: boolean;
  timeoutHits: boolean;
  processingTimeMS: number;
  processingTimingsMS: {
    _request: { roundTrip: number };
    fetch: { query: number; total: number };
    total: number;
  };
  serverTimeMS: number;
}

/**
 * Payload for performing an Algolia search.
 */
export interface AlgoliaQueryPayload {
  query: string;
  analyticsTags: string[];
  page: number;
  hitsPerPage: number;
  minWordSizefor1Typo: number;
  minWordSizefor2Typos: number;
  advancedSyntax: boolean;
  ignorePlurals: boolean;
  clickAnalytics: boolean;
  minProximity: number;
  numericFilters: string[];
  tagFilters: [string[], string[]];
  typoTolerance: 'min' | 'strict';
  queryType: 'prefixAll' | 'prefixLast' | 'prefixNone';
  restrictSearchableAttributes: string[];
  getRankingInfo: boolean;
}

export interface IAlgoliaSearchService {
  _serviceBrand: undefined;
  /**
   * Performs an Algolia query.
   * @param query The search string.
   * @param restrictSearchableAttributes Optional list of attributes to restrict search to. Defaults to ['url'].
   */
  search: (
    query: string,
    restrictSearchableAttributes?: string[],
  ) => Promise<IAlgoliaSearchResponse>;
}

export class AlgoliaSearchService extends Disposable implements IAlgoliaSearchService {
  declare readonly _serviceBrand: undefined;

  private readonly endpoint =
    'https://uj5wyc0l7x-dsn.algolia.net/1/indexes/Item_dev_sort_date/query';

  private readonly queryParams: Record<string, string> = {
    'x-algolia-agent': 'Algolia for JavaScript (4.13.1); Browser (lite)',
    'x-algolia-api-key': '28f0e1ec37a5e792e6845e67da5f20dd',
    'x-algolia-application-id': 'UJ5WYC0L7X',
  };

  /**
   * Executes the search against Algolia.
   * @param query The search string.
   * @param restrictSearchableAttributes Fields to restrict search to (default ['url']).
   */
  async search(
    query: string,
    restrictSearchableAttributes: string[] = ['url'],
  ): Promise<IAlgoliaSearchResponse> {
    const url = `${this.endpoint}?${new URLSearchParams(this.queryParams).toString()}`;

    const payload: AlgoliaQueryPayload = {
      query,
      analyticsTags: ['web'],
      page: 0,
      hitsPerPage: 30,
      minWordSizefor1Typo: 4,
      minWordSizefor2Typos: 8,
      advancedSyntax: true,
      ignorePlurals: false,
      clickAnalytics: true,
      minProximity: 7,
      numericFilters: [],
      tagFilters: [['story'], []],
      typoTolerance: 'min',
      queryType: 'prefixNone',
      restrictSearchableAttributes,
      getRankingInfo: true,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Algolia search failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}
