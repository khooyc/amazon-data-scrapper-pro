# Changelog - Amazon Scraper Pro

## [2.1.0] - 2026-04-06

### ✨ Added
- **Auto-download Excel files** (.xlsx format with SheetJS library)
  - Properly formatted spreadsheets with auto-sized columns
  - Timestamp in filename: `amazon-scraper-YYYY-MM-DDTHH-MM-SS.xlsx`
  - Click "📊 Download Excel" button to download

- **Auto-download CSV files** (.csv format)
  - Standard CSV with UTF-8 encoding
  - Timestamp in filename
  - Click "📄 Download CSV" button to download

- **Visual product selection on search pages**
  - Orange borders (3px solid #f5a623) highlight selected products
  - Real-time updates when selecting/deselecting products
  - Subtle shadow effect for emphasis
  - Automatically injected CSS into Amazon page

- **Improved variant name extraction**
  - Now extracts actual color names (e.g., "Black", "Navy Blue")
  - Now extracts actual size names (e.g., "M", "Large", "24KG-Pair")
  - Now extracts actual style names (e.g., "Classic", "Premium")
  - Multiple extraction methods for reliability:
    1. Inline twister buttons
    2. Color/image swatches
    3. Dropdown selectors
    4. Selected variant display text
    5. Pattern matching ("Style Name: X")
    6. data-defaultasin attributes

- **Current variant name extraction**
  - Shows which variant is currently selected on product page
  - Extracts from selection displays, dropdowns, and text patterns
  - Fallback to variant map if no current selection found

### 🔄 Changed
- **Chip panel now shows product names** instead of brand names on search pages
  - More useful for identifying products
  - Truncated to 40 characters with ellipsis
  - Full name shown in tooltip

- **Updated results screen layout**
  - Two rows of buttons in footer
  - Primary row: Download Excel + Download CSV
  - Secondary row: Copy CSV + Back
  - Better visual hierarchy

- **Improved popup.html version display**
  - Now shows "v2.1 — Auto Download Edition"
  - Updated manifest description

### 🐛 Fixed
- Fixed variant labels showing as CSS classes or temporary placeholders
- Fixed brand name extraction not working properly in some cases
- Fixed chip panel overflow when many products selected
- Fixed ASIN label fallback when no variant name available

### 📝 Technical Changes

#### popup.js
- Added `downloadExcel()` function using XLSX library
- Added `downloadCSV()` function with blob creation
- Added `updateSearchPageHighlights()` for real-time visual feedback
- Added `injectHighlightCSS()` to inject styles into Amazon page
- Added `currentTabId` variable to track active tab
- Improved `buildAsinList()` to use product names in chips
- Modified variant label logic to prioritize actual names over ASINs
- Enhanced `generateCSV()` to be reusable for both copy and download

#### popup.html
- Added SheetJS CDN library (xlsx.full.min.js v0.20.1)
- Added "Download Excel" button with 📊 icon
- Added "Download CSV" button with 📄 icon
- Restructured results footer to 2 rows
- Updated version number to v2.1

#### content.js
- Added `highlightSelectedProducts()` function
- Enhanced variant extraction with 4 different methods
- Added `currentStyleName` extraction logic
- Added pattern matching for common variant labels
- Added message listener for 'highlightSelected' action
- Improved dropdown selector detection
- Enhanced swatch element detection

#### manifest.json
- Bumped version to "2.1"
- Updated description to mention new features

#### Files Added
- README.md - Comprehensive documentation
- INSTALL.md - Quick installation guide
- CHANGELOG.md - This file

### 🎯 User-Facing Changes

**Before v2.1:**
```
1. Scrape data
2. Click "Copy CSV"
3. Open Excel
4. Paste manually
5. Format columns manually
6. Save file
```

**After v2.1:**
```
1. Scrape data
2. Click "Download Excel"
3. Done! ✨
```

---

## [2.0.0] - Previous Version

### Features
- Deep scraping with background service worker
- Bulk ASIN extraction from search pages
- Product variant detection
- Multiple field extraction
- Progress tracking
- BSR ranking extraction
- Monthly sales detection
- Sponsored product detection
- Badge detection
- CSV clipboard copy

### Limitations (Fixed in v2.1)
- ❌ No auto-download (had to copy-paste)
- ❌ No visual feedback on selected products
- ❌ Variant names showed as CSS classes
- ❌ Brand names in chips (not useful)

---

## Migration Guide: v2.0 → v2.1

### No Breaking Changes
All existing functionality remains intact. New features are additive only.

### What You Get
1. Keep using the extension exactly as before
2. Plus: Click "Download Excel" instead of copy-paste
3. Plus: See orange borders on selected products
4. Plus: See real variant names instead of ASINs

### Update Steps
1. Remove v2.0 from chrome://extensions/
2. Load v2.1 folder as unpacked extension
3. Refresh any open Amazon tabs
4. Done!

---

## Upcoming Features (Roadmap)

### v2.2 (Planned)
- [ ] Export to Google Sheets directly
- [ ] Save/load scraping presets
- [ ] Filter products by price range
- [ ] Sort products by sales/rating
- [ ] Batch scraping with scheduling

### v3.0 (Ideas)
- [ ] Historical price tracking
- [ ] Competitor comparison mode
- [ ] Auto-refresh for price monitoring
- [ ] Email alerts for price drops
- [ ] API integration

---

## Known Issues

### v2.1
- Orange borders may disappear if Amazon page reloads
  - **Workaround**: Click "Rescan" button to reapply
  
- Some products don't have variant labels
  - **Expected**: Amazon doesn't provide labels, falls back to ASIN
  
- Excel download may be blocked by popup blocker
  - **Workaround**: Allow downloads in browser settings

---

## Support

### Getting Help
1. Read INSTALL.md for setup instructions
2. Read README.md for full documentation
3. Check this CHANGELOG for recent changes

### Reporting Issues
When reporting issues, please include:
- Extension version (v2.1)
- Browser and version
- Amazon domain (e.g., amazon.co.uk)
- Product URL or search query
- Screenshot if possible

---

## Credits

### Libraries Used
- [SheetJS](https://sheetjs.com/) - Excel file generation
- Chrome Extensions API - Manifest V3
- IBM Plex Fonts - Typography

### Development
- Built with vanilla JavaScript
- No external frameworks
- Optimized for performance
- Privacy-focused (no data collection)

---

**Thank you for using Amazon Scraper Pro!** 🎉
