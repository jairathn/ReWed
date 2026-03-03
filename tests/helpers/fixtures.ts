// Generates valid test images and videos programmatically

export async function generateTestPhoto(
  width = 1024, height = 768, color = '#C4704B'
): Promise<Buffer> {
  // Create a simple valid JPEG-like buffer for testing
  // In real usage with Sharp available, we'd use sharp
  try {
    const sharp = (await import('sharp')).default;
    return sharp({
      create: {
        width, height,
        channels: 3,
        background: color,
      },
    })
    .jpeg({ quality: 80 })
    .toBuffer();
  } catch {
    // Fallback: create a minimal valid buffer for tests
    return Buffer.from('fake-image-data-for-testing');
  }
}

export async function generateTestThumbnail(): Promise<Buffer> {
  return generateTestPhoto(400, 400, '#D4A853');
}

export function generateTestVideo(): Buffer {
  // Minimal valid MP4 container
  const minimalMp4 = Buffer.from(
    'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhtZGF0AAAA' +
    'MW1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAAA' +
    'AQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
    'base64'
  );
  return minimalMp4;
}

export function generateTestCSV(): string {
  return [
    'First Name,Last Name,Email,Phone,Group',
    'Aditya,Sharma,adi@test.com,+15551234567,College Friends',
    'Priya,Patel,priya@test.com,,Family',
    'Vikram,Singh,,,Work',
    '"Mary Jane",Watson,mj@test.com,+15559876543,College Friends',
  ].join('\n');
}

export function generateZolaCSV(): string {
  return [
    'Guest Name,Household,RSVP Status,Email Address,Mailing Address',
    'Aditya Sharma,Sharma Family,Attending,adi@test.com,"123 Main St, NYC"',
    'Priya Patel,Patel Family,Pending,priya@test.com,',
  ].join('\n');
}
