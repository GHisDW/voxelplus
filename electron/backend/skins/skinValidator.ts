import fs from 'node:fs';
import zlib from 'node:zlib';
import { SkinValidationResult, SkinModel } from '../../types';

export class SkinValidator {
  private static readonly VALID_DIMENSIONS = [
    { width: 64, height: 32 }, // Legacy format
    { width: 64, height: 64 }  // Modern format
  ];

  /**
   * Validate a Minecraft skin file
   */
  public static async validateSkin(filePath: string): Promise<SkinValidationResult> {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          isValid: false,
          error: 'File does not exist'
        };
      }

      if (!filePath.toLowerCase().endsWith('.png')) {
        return {
          isValid: false,
          error: 'Skin must be a PNG file'
        };
      }

      const buffer = fs.readFileSync(filePath);
      const dimensions = this.getPngDimensions(buffer);

      if (!dimensions) {
        return {
          isValid: false,
          error: 'Invalid PNG file or corrupted image'
        };
      }

      const isValidDimensions = this.VALID_DIMENSIONS.some(
        valid => valid.width === dimensions.width && valid.height === dimensions.height
      );

      if (!isValidDimensions) {
        return {
          isValid: false,
          error: `Invalid dimensions: ${dimensions.width}x${dimensions.height}. Expected 64x32 or 64x64`,
          dimensions,
          sizeBytes: buffer.length
        };
      }

      const model = this.detectSkinModel(buffer, dimensions);

      return {
        isValid: true,
        dimensions,
        model,
        sizeBytes: buffer.length
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Extract PNG dimensions from buffer without loading full image
   */
  private static getPngDimensions(buffer: Buffer): { width: number; height: number } | null {
    try {
      if (buffer.length < 24 || 
          buffer[0] !== 0x89 || 
          buffer[1] !== 0x50 || 
          buffer[2] !== 0x4E || 
          buffer[3] !== 0x47) {
        return null;
      }

      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);

      return { width, height };
    } catch {
      return null;
    }
  }

  /**
   * Detect skin model based on pixel/alpha data.
   * Modern 64x64 skins have an arm section where slim (Alex) models
   * have a 3-pixel wide arm (pixels at X=54..55, Y=20..31 are completely transparent / alpha=0).
   * Steve models have a 4-pixel wide arm where those pixels are fully opaque skin texture.
   */
  public static detectSkinModel(buffer: Buffer, dimensions: { width: number; height: number }): SkinModel {
    // Legacy 64x32 format skins (pre-1.8) only supported the classic 4-pixel Steve model
    if (dimensions.height === 32) {
      return 'steve';
    }

    try {
      const hasAlpha = this.checkPngHasAlpha(buffer);
      if (!hasAlpha) {
        return 'steve';
      }

      const isSlim = this.checkSlimArmTransparency(buffer, dimensions);
      return isSlim ? 'alex' : 'steve';
    } catch {
      return 'steve';
    }
  }

  /**
   * Check if PNG color type includes alpha (color type 6 = RGBA, color type 4 = Grayscale+Alpha)
   */
  private static checkPngHasAlpha(buffer: Buffer): boolean {
    if (buffer.length < 26) return false;
    const colorType = buffer[25];
    return colorType === 6 || colorType === 4;
  }

  private static paethPredictor(a: number, b: number, c: number): number {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }

  /**
   * Decompress PNG IDAT and check the right arm 4th pixel column (X: 54-55, Y: 20-31)
   */
  private static checkSlimArmTransparency(buffer: Buffer, dimensions: { width: number; height: number }): boolean {
    let offset = 8;
    const idatBuffers: Buffer[] = [];

    while (offset < buffer.length - 8) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      if (type === 'IDAT') {
        idatBuffers.push(buffer.subarray(offset + 8, offset + 8 + length));
      }
      offset += 12 + length;
    }

    if (idatBuffers.length === 0) return false;

    const compressed = Buffer.concat(idatBuffers);
    const decompressed = zlib.inflateSync(compressed);

    const width = dimensions.width;
    const height = dimensions.height;
    const bpp = 4; // RGBA
    const bytesPerScanline = 1 + width * bpp;

    if (decompressed.length < bytesPerScanline * height) return false;

    // Unfilter PNG scanlines to get raw RGBA pixel buffer
    const unfiltered = Buffer.alloc(width * height * bpp);

    for (let y = 0; y < height; y++) {
      const lineStart = y * bytesPerScanline;
      const filterType = decompressed[lineStart];
      const unfilteredLineStart = y * width * bpp;

      for (let x = 0; x < width; x++) {
        for (let c = 0; c < bpp; c++) {
          const rawByte = decompressed[lineStart + 1 + x * bpp + c];
          const byteIdx = unfilteredLineStart + x * bpp + c;

          const a = x > 0 ? unfiltered[byteIdx - bpp] : 0; // Left
          const b = y > 0 ? unfiltered[byteIdx - width * bpp] : 0; // Above
          const cVal = (x > 0 && y > 0) ? unfiltered[byteIdx - width * bpp - bpp] : 0; // Upper Left

          let val = rawByte;
          if (filterType === 1) { // Sub
            val = (rawByte + a) & 0xff;
          } else if (filterType === 2) { // Up
            val = (rawByte + b) & 0xff;
          } else if (filterType === 3) { // Average
            val = (rawByte + Math.floor((a + b) / 2)) & 0xff;
          } else if (filterType === 4) { // Paeth
            val = (rawByte + this.paethPredictor(a, b, cVal)) & 0xff;
          }

          unfiltered[byteIdx] = val;
        }
      }
    }

    let transparentCount = 0;
    let testedCount = 0;

    // Check pixels at X=54, Y=20..31 and X=55, Y=20..31 (Slim model right arm outer column)
    for (let y = 20; y <= 31; y++) {
      for (let x = 54; x <= 55; x++) {
        const alphaIdx = (y * width + x) * bpp + 3;
        if (alphaIdx < unfiltered.length) {
          testedCount++;
          if (unfiltered[alphaIdx] === 0) {
            transparentCount++;
          }
        }
      }
    }

    return testedCount > 0 && transparentCount / testedCount > 0.8;
  }

  /**
   * Validate skin data URL
   */
  public static async validateSkinDataUrl(dataUrl: string): Promise<SkinValidationResult> {
    try {
      if (!dataUrl.startsWith('data:image/png;base64,')) {
        return {
          isValid: false,
          error: 'Invalid data URL format. Must be a PNG base64 data URL'
        };
      }

      const base64Data = dataUrl.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const dimensions = this.getPngDimensions(buffer);

      if (!dimensions) {
        return {
          isValid: false,
          error: 'Invalid PNG data'
        };
      }

      const isValidDimensions = this.VALID_DIMENSIONS.some(
        valid => valid.width === dimensions.width && valid.height === dimensions.height
      );

      if (!isValidDimensions) {
        return {
          isValid: false,
          error: `Invalid dimensions: ${dimensions.width}x${dimensions.height}`,
          dimensions,
          sizeBytes: buffer.length
        };
      }

      const model = this.detectSkinModel(buffer, dimensions);

      return {
        isValid: true,
        dimensions,
        model,
        sizeBytes: buffer.length
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Data URL validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}
