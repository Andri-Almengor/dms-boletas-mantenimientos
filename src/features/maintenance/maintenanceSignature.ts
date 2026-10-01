export type SignaturePoint = {
  x: number;
  y: number;
};

export type SignatureStroke = SignaturePoint[];

export type SignatureDraft =
  | {
      kind: 'drawing';
      strokes: SignatureStroke[];
    }
  | {
      kind: 'image';
      uri: string;
      mimeType: string;
      fileName: string;
      fileSize: number;
    };

export const SIGNATURE_MAX_BYTES = 4 * 1024 * 1024;
export const SIGNATURE_OUTPUT_WIDTH = 900;
export const SIGNATURE_OUTPUT_HEIGHT = 320;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function u32(value: number) {
  const output = new Uint8Array(4);
  const normalized = value >>> 0;
  output[0] = (normalized >>> 24) & 0xff;
  output[1] = (normalized >>> 16) & 0xff;
  output[2] = (normalized >>> 8) & 0xff;
  output[3] = normalized & 0xff;
  return output;
}

function ascii(value: string) {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crcTable[n] = c >>> 0;
    }
  }

  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data = new Uint8Array(0)) {
  const typeBytes = ascii(type);
  const crcInput = concatBytes([typeBytes, data]);
  return concatBytes([
    u32(data.length),
    typeBytes,
    data,
    u32(crc32(crcInput)),
  ]);
}

function adler32(bytes: Uint8Array) {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return (((b << 16) | a) >>> 0);
}

function zlibStore(bytes: Uint8Array) {
  const parts: Uint8Array[] = [Uint8Array.from([0x78, 0x01])];
  let offset = 0;

  while (offset < bytes.length) {
    const length = Math.min(65535, bytes.length - offset);
    const final = offset + length >= bytes.length;
    const inverse = (~length) & 0xffff;
    parts.push(Uint8Array.from([
      final ? 1 : 0,
      length & 0xff,
      (length >>> 8) & 0xff,
      inverse & 0xff,
      (inverse >>> 8) & 0xff,
    ]));
    parts.push(bytes.slice(offset, offset + length));
    offset += length;
  }

  parts.push(u32(adler32(bytes)));
  return concatBytes(parts);
}

function bytesToBase64(bytes: Uint8Array) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const value = (a << 16) | (b << 8) | c;
    output += alphabet[(value >>> 18) & 63];
    output += alphabet[(value >>> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(value >>> 6) & 63] : '=';
    output += index + 2 < bytes.length ? alphabet[value & 63] : '=';
  }
  return output;
}

function setPixel(
  rgba: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = (y * width + x) * 4;
  rgba[offset] = 24;
  rgba[offset + 1] = 32;
  rgba[offset + 2] = 43;
  rgba[offset + 3] = 255;
}

function drawDot(
  rgba: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
) {
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);
  for (let py = roundedY - radius; py <= roundedY + radius; py += 1) {
    for (let px = roundedX - radius; px <= roundedX + radius; px += 1) {
      const dx = px - roundedX;
      const dy = py - roundedY;
      if ((dx * dx) + (dy * dy) <= radius * radius) {
        setPixel(rgba, width, height, px, py);
      }
    }
  }
}

function drawSegment(
  rgba: Uint8Array,
  width: number,
  height: number,
  from: SignaturePoint,
  to: SignaturePoint,
) {
  const padding = 18;
  const usableWidth = width - (padding * 2);
  const usableHeight = height - (padding * 2);
  const x1 = padding + clamp(from.x, 0, 1) * usableWidth;
  const y1 = padding + clamp(from.y, 0, 1) * usableHeight;
  const x2 = padding + clamp(to.x, 0, 1) * usableWidth;
  const y2 = padding + clamp(to.y, 0, 1) * usableHeight;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    drawDot(
      rgba,
      width,
      height,
      x1 + (dx * ratio),
      y1 + (dy * ratio),
      3,
    );
  }
}

export function signatureDrawingPngBase64(
  strokes: SignatureStroke[],
  width = SIGNATURE_OUTPUT_WIDTH,
  height = SIGNATURE_OUTPUT_HEIGHT,
) {
  const usableStrokes = strokes.filter((stroke) => stroke.length > 0);
  if (!usableStrokes.length) {
    throw new Error('Debe dibujar la firma antes de guardarla.');
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = 255;
    rgba[index + 1] = 255;
    rgba[index + 2] = 255;
    rgba[index + 3] = 255;
  }

  for (const stroke of usableStrokes) {
    if (stroke.length === 1) {
      drawSegment(rgba, width, height, stroke[0], stroke[0]);
      continue;
    }
    for (let index = 1; index < stroke.length; index += 1) {
      drawSegment(rgba, width, height, stroke[index - 1], stroke[index]);
    }
  }

  const scanlines = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const destination = y * (width * 4 + 1);
    scanlines[destination] = 0;
    scanlines.set(
      rgba.subarray(y * width * 4, (y + 1) * width * 4),
      destination + 1,
    );
  }

  const ihdr = concatBytes([
    u32(width),
    u32(height),
    Uint8Array.from([8, 6, 0, 0, 0]),
  ]);
  const png = concatBytes([
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlibStore(scanlines)),
    pngChunk('IEND'),
  ]);

  if (png.length > SIGNATURE_MAX_BYTES) {
    throw new Error('La firma supera el tamaño máximo permitido de 4 MB.');
  }
  return bytesToBase64(png);
}

export function normalizeSignatureMimeType(value: unknown, fileName = '') {
  const direct = String(value || '').trim().toLowerCase();
  if (direct === 'image/png') return 'image/png';
  if (direct === 'image/jpeg' || direct === 'image/jpg') return 'image/jpeg';

  const extension = String(fileName || '').toLowerCase().split('?')[0].split('.').pop();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';

  throw new Error('La firma debe ser una imagen PNG o JPEG.');
}

export function maintenanceHasServerSignature(
  maintenance: Record<string, unknown> = {},
) {
  return Boolean(
    String(
      maintenance.FirmaArchivoID
        || maintenance.FirmaFileID
        || maintenance.FirmaURL
        || maintenance.FirmaUrl
        || maintenance.Firma
        || '',
    ).trim(),
  );
}
