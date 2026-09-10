# Skin Manager Testing Guide

This document outlines how to test the new Skin Manager feature implemented for issue #13.

## Overview

The Skin Manager feature includes:
- Import local PNG skin files
- Download skins by Minecraft username using vrc.lol API
- Skin validation (64x32 and 64x64 PNG formats)
- Skin library management (rename, delete, set active)
- Integration with instance configuration
- Dedicated UI with search and preview capabilities

## Manual Testing Steps

### 1. Backend Validation Testing

**Test Skin Validator:**
```typescript
// Test with valid 64x64 skin
const result1 = await SkinValidator.validateSkin('path/to/valid_64x64_skin.png');
console.log('Valid 64x64 skin:', result1); // Should return isValid: true

// Test with valid 64x32 legacy skin
const result2 = await SkinValidator.validateSkin('path/to/valid_64x32_skin.png');
console.log('Valid 64x32 skin:', result2); // Should return isValid: true

// Test with invalid dimensions
const result3 = await SkinValidator.validateSkin('path/to/invalid_128x128.png');
console.log('Invalid dimensions:', result3); // Should return isValid: false with error

// Test with non-PNG file
const result4 = await SkinValidator.validateSkin('path/to/skin.jpg');
console.log('Non-PNG file:', result4); // Should return isValid: false
```

**Test Skin Browser (API Integration):**
```typescript
// Test player search
const searchResult = await SkinBrowser.searchPlayer('Notch');
console.log('Notch search:', searchResult); // Should return success: true with skin data

// Test invalid username
const invalidResult = await SkinBrowser.searchPlayer('invalid_username_123456789');
console.log('Invalid username:', invalidResult); // Should return success: false
```

### 2. UI Testing

**Test Skin Manager Modal:**
1. Navigate to the "Skins" page in the sidebar
2. Click "Open Skin Manager" button
3. Test search functionality:
   - Enter a valid Minecraft username (e.g., "Notch")
   - Verify search results display correctly
   - Click "Download Skin" button
   - Verify skin appears in library
4. Test import functionality:
   - Click "Import Skin File" button
   - Select a valid PNG skin file
   - Verify validation passes
   - Verify skin appears in library
5. Test skin management:
   - Click "Rename" on a skin
   - Enter new name and verify it updates
   - Click "Delete" on a skin
   - Confirm deletion and verify it's removed
   - Click "Set Active" on a skin
   - Verify active badge appears

**Test Instance Integration:**
1. Navigate to any instance details page
2. Go to the "Overview" tab
3. Find the "Character Skin" section in the appearance customization
4. Click the skin selector button
5. Verify skin selector modal appears with available skins
6. Select a skin and verify it's applied to the instance
7. Verify instance metadata includes the skinId

### 3. Integration Testing

**Test Skin Storage Persistence:**
1. Import/download several skins
2. Close and restart the application
3. Verify all skins are still present in the library
4. Verify active skin selection persists

**Test Instance-Skin Association:**
1. Set different skins for multiple instances
2. Navigate between instances
3. Verify each instance shows its correct skin
4. Launch an instance and verify the skin is applied (if Minecraft integration is complete)

### 4. Edge Cases

**Test Error Handling:**
- Try importing a corrupted PNG file
- Try importing a file with invalid dimensions (e.g., 128x128)
- Try searching for non-existent usernames
- Try downloading when offline
- Try renaming with empty string
- Try deleting the active skin (should auto-select another)

**Test API Failures:**
- Test with vrc.lol API down (simulate network error)
- Test with rate limiting (if applicable)
- Verify graceful error messages display to user

## Expected Results

### Success Criteria
✅ Users can import valid Minecraft skin PNG files (64x32 or 64x64)
✅ Invalid files are rejected with clear error messages
✅ Users can search for Minecraft players by username
✅ Users can download skins from search results
✅ Downloaded skins are validated before storage
✅ Skin library persists across application restarts
✅ Users can rename, delete, and set active skins
✅ Active skin selection is clearly indicated in UI
✅ Skins can be associated with specific instances
✅ UI follows existing Voxel⁺ design language
✅ Error messages are clear and actionable

### Known Limitations
- Skin model detection (Steve vs Alex) is currently simplified
- Full Minecraft launch integration to apply skins in-game may require additional work
- Skin preview rendering uses basic thumbnail generation
- No cape support currently implemented

## Files Modified/Created

### Backend Files
- `electron/types.ts` - Added skin-related type definitions
- `electron/backend/skins/skinValidator.ts` - NEW: Skin validation logic
- `electron/backend/skins/skinStore.ts` - NEW: Skin storage and persistence
- `electron/backend/skins/skinBrowser.ts` - NEW: API integration for skin search/download
- `electron/backend/skins/skinManager.ts` - NEW: Main skin management orchestrator
- `electron/backend/commandManager.ts` - Added skin command methods
- `electron/backend/instances/instanceManager.ts` - Added instance skin association
- `electron/main.ts` - Added IPC handlers for skin operations
- `electron/preload.ts` - Exposed skin APIs to renderer

### Frontend Files
- `frontend/src/services/api.ts` - Added skin API methods
- `frontend/src/components/SkinManagerModal.ts` - NEW: Skin manager UI modal
- `frontend/src/pages/SkinsPage.ts` - NEW: Main skins page
- `frontend/src/components/Sidebar.ts` - Added skins navigation
- `frontend/src/components/InstanceDetails.ts` - Added skin selector to instance customization
- `frontend/src/main.ts` - Integrated skins page into app routing
- `frontend/src/styles/index.css` - Added skin manager UI styles

## API Integration Details

**vrc.lol API Used:**
- Base URL: `https://vrc.lol/api`
- Search endpoint: `GET /api?username={username}`
- Skin endpoint: `GET /skin?username={username}&type=java`
- Cape endpoint: `GET /cape?username={username}`

**API Features:**
- No authentication required
- CORS enabled
- Rate limiting applies (respectful usage)
- Returns UUID, skin URL, cape URL, and name history

## Troubleshooting

**Common Issues:**

1. **Skin validation fails for valid PNG:**
   - Check PNG file integrity
   - Verify dimensions are exactly 64x32 or 64x64
   - Ensure file is not corrupted

2. **API search returns no results:**
   - Verify username is 3-16 characters
   - Check network connectivity
   - Ensure username exists on Java Edition

3. **Skins not persisting:**
   - Check file permissions in config directory
   - Verify skin-library.json is being written
   - Check for disk space issues

4. **UI not displaying skins:**
   - Check browser console for errors
   - Verify IPC communication is working
   - Check CSS styles are loaded

## Future Enhancements

Potential improvements for future iterations:
- Enhanced skin model detection (pixel analysis for Alex vs Steve)
- Cape support and management
- Skin preview with 3D rendering
- Bulk skin operations
- Skin categories/tags
- Integration with additional skin APIs (NameMC, etc.)
- Skin sharing/export functionality
- Custom skin upload to Minecraft accounts (if authentication added)