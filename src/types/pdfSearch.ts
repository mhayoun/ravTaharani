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
}
