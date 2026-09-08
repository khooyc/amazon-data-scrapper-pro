# AMZ Scrapper Pro

A free Chrome/Edge/Brave extension that extracts product data straight from Amazon search and product pages — price, ASIN, brand, ratings, reviews, BSR, variants, dimensions and more — with one-click export to Excel or CSV. Built and maintained by [Spectra](https://www.spectramsia.com).

- **Website:** [khooyc.github.io/amazon-data-scrapper-pro](https://khooyc.github.io/amazon-data-scrapper-pro/)
- **Download:** [latest source ZIP](https://github.com/khooyc/amazon-data-scrapper-pro/archive/refs/heads/master.zip)
- **Install:** see [INSTALL.md](INSTALL.md)
- **Privacy policy:** [amazon-data-scrapper-pro-policy](https://github.com/khooyc/amazon-data-scrapper-pro-policy)
- **License:** MIT — see [LICENSE](LICENSE)
- **Use responsibly:** this tool automates scrolling/reading pages you already have open in your own browser. You're responsible for complying with Amazon's Conditions of Use in your jurisdiction.

---

# Amazon Scraper Pro v2.1 - Improvements Summary

## 🎉 What's New in v2.1

### 1. **Auto-Download Excel & CSV Files** 
**No more copy-paste!** The scraper now automatically creates downloadable files with proper formatting.

#### Features:
- **Download Excel (.xlsx)** - Properly formatted spreadsheet with auto-sized columns
- **Download CSV (.csv)** - Standard CSV format for compatibility
- **Copy CSV** - Quick clipboard copy for pasting into other apps
- Files are named with timestamp: `amazon-scraper-2026-04-06T12-30-45.xlsx`

#### How it works:
1. After scraping completes, you'll see the results table
2. Click **"📊 Download Excel"** to get a formatted .xlsx file
3. Click **"📄 Download CSV"** to get a .csv file
4. Click **"📋 Copy CSV"** to copy data to clipboard

---

### 2. **Better Product Variant Names**
**No more CSS placeholders!** The scraper now properly extracts actual variant information.

#### What's extracted:
- ✅ **Color names** - "Black", "Navy Blue", "Red"
- ✅ **Size names** - "Small", "Medium", "Large", "24KG-Pair"
- ✅ **Style names** - "Classic", "Premium", "Sport Edition"
- ✅ **Scent names** - "Lavender", "Ocean Breeze"
- ✅ **Flavor names** - "Vanilla", "Chocolate"

#### Extraction methods (in order of priority):
1. Inline twister buttons (the variant selector on product page)
2. Color/image swatches
3. Dropdown selectors (Size/Color/Style dropdowns)
4. Selected variant display text
5. "Style Name: X" pattern matching in page text
6. data-defaultasin attributes

#### Example:
**Before:** Shows generic CSS class or ASIN
**After:** Shows "24KG-Pair - Black" or "Size M - Navy Blue"

---

### 3. **Visual Selection on Search Pages** 🎯
**Orange borders highlight selected products!** 

#### How it works:
- When you select a product in the extension, it gets an **orange border** on the Amazon page
- Deselect a product → border disappears
- Works in real-time as you click products in the extension

#### Visual Indicators:
- **Orange outline** - 3px solid #f5a623
- **Orange glow** - Subtle shadow for emphasis
- **Rounded corners** - 4px border radius

#### CSS Injection:
```css
.amazon-scraper-selected {
  outline: 3px solid #f5a623 !important;
  outline-offset: -3px !important;
  box-shadow: 0 0 0 3px rgba(245, 166, 35, 0.2) !important;
  border-radius: 4px !important;
}
```

---

## 📋 Installation Instructions

### Chrome/Edge/Brave:
1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the folder containing these files
5. The extension icon will appear in your toolbar

### Testing:
1. Go to Amazon.co.uk (or any supported Amazon domain)
2. Search for any product (e.g., "dumbbells")
3. Click the extension icon
4. Select products - you'll see orange borders appear!
5. Click "⚡ Extract Data"
6. After scraping, click "📊 Download Excel"

---

## 🔧 Technical Changes

### Files Modified:

#### 1. **popup.js**
- Added `downloadExcel()` function using SheetJS library
- Added `downloadCSV()` function with timestamp
- Added `updateSearchPageHighlights()` for real-time visual feedback
- Added `injectHighlightCSS()` to inject orange border styles
- Improved variant label extraction logic
- Fixed chip panel to show product names instead of brand names
- Added `currentTabId` tracking for highlight updates

#### 2. **popup.html**
- Added SheetJS CDN library: `xlsx.full.min.js`
- Added "📊 Download Excel" button
- Added "📄 Download CSV" button
- Updated version to v2.1
- Improved button layout (2 rows in results footer)

#### 3. **content.js**
- Added `highlightSelectedProducts()` function
- Improved variant extraction with 4 different methods
- Added `currentStyleName` extraction (color/size/style)
- Added pattern matching for "Style Name:", "Size:", "Colour:"
- Added message listener for 'highlightSelected' action
- Removed brand name from chip labels (now shows product name)

#### 4. **manifest.json**
- Updated version to "2.1"
- Updated description to mention new features

#### 5. **background.js**
- No changes (works perfectly as-is!)

---

## 🎨 Features Overview

### Search Page Mode:
✅ Visual orange borders on selected products  
✅ Product name chips (not brand names)  
✅ Bulk selection with Select All/Deselect All  
✅ Real-time highlight updates  
✅ Monthly sales, price, ratings display  

### Product Page Mode:
✅ Automatic variant detection (color/size/style)  
✅ Current variant name display  
✅ Variant pricing extraction  
✅ Multiple extraction methods for reliability  

### Export Options:
✅ Download Excel (.xlsx) with formatting  
✅ Download CSV (.csv) with timestamp  
✅ Copy CSV to clipboard  
✅ Auto-sized columns in Excel  
✅ Proper column headers  

---

## 📊 Supported Fields

### Default Fields (Always Available):
- Product Name
- Price
- ASIN
- Brand Name
- Monthly Sales

### Additional Fields (Optional):
- BSR Ranking (with category breakdown)
- Ratings
- Reviews
- Number of Pieces
- Item Weight
- Item Dimensions
- **Variants (Colour/Size/Style)** ← IMPROVED!
- Product Release Date
- Scraped Date & Time

---

## 🌍 Supported Amazon Domains

- amazon.co.uk (UK)
- amazon.com (US)
- amazon.de (Germany)
- amazon.fr (France)
- amazon.es (Spain)
- amazon.it (Italy)
- amazon.ca (Canada)
- amazon.com.au (Australia)

---

## 💡 Usage Tips

### For Best Results:

1. **Search Page Scraping:**
   - Scroll to load all products before opening extension
   - Use visual orange borders to verify your selection
   - Chips show full product names for clarity

2. **Product Page Scraping:**
   - The current variant is automatically selected
   - Other variants are detected from swatches/dropdowns
   - Variant names show actual color/size/style (not ASINs!)

3. **Excel Downloads:**
   - Files open directly in Excel/Google Sheets
   - Columns are auto-sized for readability
   - All data is properly escaped and formatted

4. **CSV Downloads:**
   - Compatible with all spreadsheet software
   - Timestamp in filename prevents overwrites
   - UTF-8 encoding for international characters

---

## 🐛 Troubleshooting

**Q: Orange borders not showing?**
A: Make sure you're on a search page and have selected at least one product. Try clicking Rescan.

**Q: Variant names showing as ASINs?**
A: Some products don't have variant labels. The scraper will fallback to ASIN if no label is found.

**Q: Excel download not working?**
A: Make sure your browser allows downloads. Check if pop-up blocker is preventing the download.

**Q: Highlights disappear when I click on Amazon page?**
A: This is normal. Amazon's page may reload. Click Rescan to reapply highlights.

---

## 📝 Version History

### v2.1 (Current)
- ✨ Auto-download Excel/CSV files
- ✨ Visual orange borders for selected products
- ✨ Improved variant name extraction (color/size/style)
- ✨ Product names in chips (instead of brand names)
- 🐛 Fixed variant label detection
- 🐛 Fixed chip panel overflow

### v2.0
- Initial release with deep scraping
- Bulk ASIN extraction
- Progress tracking
- Multiple field support

---

## 🙏 Credits

Built with:
- Chrome Extensions Manifest V3
- SheetJS (xlsx) for Excel export
- IBM Plex Sans & Mono fonts
- Love and coffee ☕

---

## 📄 License

For personal and commercial use.

---

**Enjoy your improved Amazon scraper!** 🎉
