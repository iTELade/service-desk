// Never infer a preview renderer from a user-controlled filename or MIME alone.
export function previewMime(value) {
  const b = Buffer.from(value), ascii = (start,end) => b.subarray(start,end).toString('ascii');
  if (b.length >= 24 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && ascii(12,16) === 'IHDR') return 'image/png';
  if (b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (b.length >= 10 && ['GIF87a','GIF89a'].includes(ascii(0,6))) return 'image/gif';
  if (b.length >= 20 && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') return 'image/webp';
  if (b.length >= 8 && /^%PDF-[12]\.\d/.test(ascii(0,8))) return 'application/pdf';
  return null;
}
