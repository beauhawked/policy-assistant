declare module "pdf-parse/lib/pdf-parse.js" {
  const parse: (dataBuffer: Buffer) => Promise<{ text: string }>;
  export default parse;
}
