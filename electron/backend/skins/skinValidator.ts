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
   * Detect skin model based on pixel data
   * Alex (slim) models have transparent pixels in specific arm areas
   */
  private static detectSkinModel(buffer: Buffer, dimensions: { width: number; height: number }): SkinModel {
    // For legacy 64x32 skins, default to Steve
    if (dimensions.height === 32) {
      return 'steve';
    }

    // For modern 64x64 skins, check for slim model indicators
    // Alex models typically have transparent pixels in the right arm area
    // This is a simplified detection - full detection would require pixel analysis
    
    // Default to 'steve' for now - can be enhanced with proper pixel analysis
    return 'steve';
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