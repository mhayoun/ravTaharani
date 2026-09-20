export interface PdfManifestEntry {
  id: string;
  title: string;
  url: string;
  pages: number;
}

export interface PdfPageText {
  page: number;
  text: string;
}

export interface PdfIndex {
  id: string;
  title: string;
  url: string;
  pages: PdfPageText[];
}

export interface PdfMatch {
  id: string;
  title: string;
  url: string;
  page: number;
  before: string;
  match: string;
  after: string;
  /** Set for "all the words, not as a phrase" results: the individual query
   * words to highlight inside `match`, which is then the shortest stretch of
   * page text containing all of them. */
  words?: string[];
  /** Length in characters of that stretch (used to rank such results). */
  span?: number;
}
