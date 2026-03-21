import sharp from 'sharp';

export async function generateThumbnail(
  inputBuffer: Buffer,
  options: { width: number; height: number; quality: number } = { width: 400, height: 400, quality: 80 }
): Promise<Buffer> {
  return sharp(inputBuffer)
    .resize(options.width, options.height, {
      fit: 'cover',
      position: 'centre',
    })
    .webp({ quality: options.quality })
    .toBuffer();
}
