import { extractText as unpdfExtract } from 'unpdf';

export async function extractText(buffer: Buffer, mime: string, filename: string): Promise<string> {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();

  if (mime === 'application/pdf' || ext === 'pdf') {
    try {
      const { text } = await unpdfExtract(new Uint8Array(buffer), { mergePages: true });
      if (!text || !text.trim()) {
        throw new Error('No selectable text found. The PDF may be a scanned image.');
      }
      return text;
    } catch (e) {
      const msg = (e as Error).message ?? 'unknown';
      throw new Error(`PDF extraction failed: ${msg}`);
    }
  }

  if (mime.startsWith('text/') || ['txt', 'md', 'markdown'].includes(ext)) {
    return buffer.toString('utf8');
  }

  throw new Error(`Unsupported file type: ${mime || ext || 'unknown'}. Use .pdf, .txt, or .md.`);
}
