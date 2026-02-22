declare module "pdf-parse" {
  export interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info?: Record<string, unknown>;
    metadata?: unknown;
    version?: string;
  }

  const parse: (dataBuffer: Buffer) => Promise<PdfParseResult>;
  export default parse;
}
