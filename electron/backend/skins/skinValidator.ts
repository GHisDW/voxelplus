import fs from 'node:fs';
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
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return {
          isValid: false,
          error: 'File does not exist'
        };
      }

      // Check file extension
      if (!filePath.toLowerCase().endsWith('.png')) {
        return {
          isValid: false,
          error: 'Skin must be a PNG file'
        };
      }

      // Read file to get dimensions
      const buffer = fs.readFileSync(filePath);
      const dimensions = this.getPngDimensions(buffer);

      if (!dimensions) {
        return {
          isValid: false,
          error: 'Invalid PNG file or corrupted image'
        };
      }

      // Validate dimensions
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

      // Detect skin model (Steve vs Alex)
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
      // PNG signature: 89 50 4E 47 0D 0A 1A 0A
      if (buffer.length < 24 || 
          buffer[0] !== 0x89 || 
          buffer[1] !== 0x50 || 
          buffer[2] !== 0x4E || 
          buffer[3] !== 0x47) {
        return null;
      }

      // IHDR chunk starts at byte 8
      // Width and height are 4 bytes each at positions 16-19 and 20-23
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
      // Basic check for uncompressed IDAT or scan for transparent pixels in the arm region
      // If decompressed pixels aren't readily available without zlib, check transparency
      // by inspecting PNG chunks or checking if Alex arm area contains transparent markers.
      const hasAlpha = this.checkPngHasAlpha(buffer);
      if (!hasAlpha) {
        return 'steve';
      }

      // Check if IDAT has transparent pixels in the slim arm column
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
    // Color type is at byte 25
    const colorType = buffer[25];
    return colorType === 6 || colorType === 4;
  }

  /**
   * Decompress PNG IDAT and check the right arm 4th pixel column (X: 54-55, Y: 20-31)
   */
  private static checkSlimArmTransparency(buffer: Buffer, dimensions: { width: number; height: number }): boolean {
    const zlib = require('node:zlib');
    // Collect IDAT chunks
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

    // For RGBA 64x64, each scanline has 1 filter byte + 64 * 4 bytes = 257 bytes
    const bytesPerScanline = 1 + dimensions.width * 4;
    let transparentCount = 0;
    let testedCount = 0;

    // Check pixels at X=54, Y=20..31 and X=55, Y=20..31 (Right arm outer layer)
    for (let y = 20; y <= 31; y++) {
      const scanlineStart = y * bytesPerScanline;
      for (let x = 54; x <= 55; x++) {
        // Pixel starts after filter byte + x * 4
        const pixelOffset = scanlineStart + 1 + x * 4;
        if (pixelOffset + 3 < decompressed.length) {
          const alpha = decompressed[pixelOffset + 3];
          testedCount++;
          if (alpha === 0) {
            transparentCount++;
          }
        }
      }
    }

    // If more than 80% of these pixels are transparent, it's an Alex (slim) model
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