// content.js — injected into active Amazon tab to detect page type and scrape surface data

(function () {
if (window.__AMAZON_SCRAPER_CONTENT_V2__) return;
window.__AMAZON_SCRAPER_CONTENT_V2__ = true;

function detectPageType() {
  const url = window.location.href;
  if (url.includes('/dp/') || url.includes('/gp/product/')) return 'product';
  if (/\/gp\/bestsellers\/|\/zgbs\//i.test(url)) return 'search';
  if (url.includes('/s?') || url.includes('/s/')) return 'search';
  return 'unknown';
}

function getAmazonDomain() {
  return window.location.hostname;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sanitizeVariantLabel(value) {
  const cleaned = normalizeText(
    String(value || '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/[.#][\w-]+(?:\s+[.#][\w-]+)+/g, ' ')
      .replace(/temporarily\s+out\s+of\s+stock[:\s-]*/gi, ' ')
      .replace(/currently\s+unavailable[:\s-]*/gi, ' ')
      .replace(/click\s+to\s+select[:\s-]*/gi, ' ')
  );
  if (/^[.#]/.test(cleaned)) return '';
  if (/centralized|apexprice|price\s*to\s*pay|a-offscreen|desktop/i.test(cleaned)) return '';
  return cleaned;
}

function looksLikePriceText(value) {
  const txt = normalizeText(value).toLowerCase();
  if (!txt) return false;
  return /(?:£|\$|€|¥|₹)\s*\d|rrp|with prime|per\s*count|\/\s*count|save\s*\d+%|deal/i.test(txt) ||
         /^\d+[.,]\d{2}$/.test(txt);
}

function extractAsinFromText(value) {
  const text = String(value || '');
  const inUrl = text.match(/\/dp\/([A-Z0-9]{10})/i);
  if (inUrl) return inUrl[1].toUpperCase();
  const direct = text.match(/\b([A-Z0-9]{10})\b/i);
  return direct ? direct[1].toUpperCase() : '';
}

function extractVariantOptionLabel(element) {
  if (!element) return '';

  const rawCandidates = [
    element.getAttribute?.('aria-label'),
    element.getAttribute?.('title')
  ];

  const selectorCandidates = element.querySelectorAll(
    '.twisterText, .twisterTextDiv, .twisterTextDiv span, ' +
    '.a-button-text .a-size-base-plus, .a-button-text .a-size-base, .a-button-text span, ' +
    '.swatch-title-text-display, .selection, img[alt], .imgSwatch img[alt]'
  );

  selectorCandidates.forEach(node => {
    const txt = node.getAttribute?.('alt') || node.textContent;
    if (txt) rawCandidates.push(txt);
  });

  const lineCandidates = normalizeText(element.textContent)
    .split(/\s{2,}|\n/)
    .map(segment => segment.trim())
    .filter(Boolean);
  rawCandidates.push(...lineCandidates);

  for (const candidate of rawCandidates) {
    const cleaned = sanitizeVariantLabel(candidate);
    if (!cleaned || isVariantPlaceholder(cleaned)) continue;
    if (looksLikePriceText(cleaned)) continue;
    if (/^[A-Z0-9]{10}$/i.test(cleaned)) continue;
    if (cleaned.length < 2) continue;
    return cleaned;
  }

  return '';
}

function isVariantPlaceholder(value) {
  const cleaned = sanitizeVariantLabel(value).toLowerCase();
  if (!cleaned) return true;
  return ['select', 'choose', 'choose option', 'options', 'n/a', '-'].includes(cleaned);
}

function extractMonthlySalesText(root = document) {
  const salesPattern = /(?:\d[\d.,]*|\d+(?:\.\d+)?\s*[kKmM])\+?\s*bought in past month/i;
  const candidates = root.querySelectorAll('span, [aria-label]');

  for (const node of candidates) {
    const txt = normalizeText(node.textContent || node.getAttribute?.('aria-label') || '');
    const match = txt.match(salesPattern);
    if (match) return normalizeText(match[0]);
  }
  return '';
}

function extractCardTitle(card) {
  if (!card) return '';

  const selectors = [
    'h2 a span',
    'h2 span',
    'a.a-link-normal.a-text-normal > span',
    '.p13n-sc-truncate',
    '[class*="p13n-sc-css-line-clamp"]',
    '.a-link-normal[href*="/dp/"] span',
    '.a-link-normal[href*="/gp/product/"] span',
    'img[alt]',
    'a[href*="/dp/"]',
    'a[href*="/gp/product/"]'
  ];

  for (const selector of selectors) {
    const nodes = card.querySelectorAll(selector);
    for (const node of nodes) {
      const raw =
        node.getAttribute?.('aria-label') ||
        node.getAttribute?.('title') ||
        node.getAttribute?.('alt') ||
        node.textContent ||
        '';
      const text = normalizeText(raw);
      if (!text) continue;
      if (text.length < 6) continue;
      if (/out of 5 stars|ratings?|\(\d[\d,]*\)/i.test(text)) continue;
      if (/^(£|\$|€|¥|₹)\s*[\d.,]+/i.test(text)) continue;
      if (/^#\d+/.test(text)) continue;
      return text;
    }
  }

  return '';
}

const SEARCH_CARD_SELECTOR =
  'div.s-result-item[data-asin], ' +
  'div[data-component-type="s-search-result"][data-asin], ' +
  'div[data-component-type="sp-sponsored-result"][data-asin], ' +
  '#zg-ordered-list > li, ' +
  'li.zg-grid-general-faceout, ' +
  'li.zg-item-immersion, ' +
  'div[id^="gridItemRoot"]';

let pageSelectedAsins = new Set();
let searchSelectionInitialized = false;
let searchSelectionObserver = null;

function isValidAsin(asin) {
  return /^[A-Z0-9]{10}$/.test(String(asin || ''));
}

function getCardAsin(card) {
  if (!card) return '';

  const direct =
    card.getAttribute('data-asin') ||
    card.dataset?.asin ||
    '';
  const directAsin = extractAsinFromText(direct);
  if (isValidAsin(directAsin)) return directAsin;

  const dataNodes = card.querySelectorAll('[data-asin], [data-defaultasin], [data-dp-url]');
  for (const node of dataNodes) {
    const value =
      node.getAttribute('data-asin') ||
      node.getAttribute('data-defaultasin') ||
      node.getAttribute('data-dp-url') ||
      '';
    const asin = extractAsinFromText(value);
    if (isValidAsin(asin)) return asin;
  }

  const links = card.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]');
  for (const link of links) {
    const asin = extractAsinFromText(link.getAttribute('href') || '');
    if (isValidAsin(asin)) return asin;
  }

  return '';
}

function getSearchResultCards() {
  const cards = [];
  const seenNodes = new Set();
  const nodes = Array.from(document.querySelectorAll(SEARCH_CARD_SELECTOR));

  nodes.forEach(card => {
    if (!card || seenNodes.has(card)) return;
    seenNodes.add(card);

    const asin = getCardAsin(card);
    if (!isValidAsin(asin)) return;
    card.setAttribute('data-asin', asin);
    cards.push(card);
  });

  return cards;
}

function ensureSearchCardToggle(card) {
  if (!card || card.querySelector('.amazon-scraper-select-btn')) return;

  card.classList.add('amazon-scraper-card');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'amazon-scraper-select-btn';
  btn.textContent = '✓';
  btn.setAttribute('aria-label', 'Toggle product selection');
  btn.title = 'Select product for scraping';
  card.appendChild(btn);
}

function syncSearchCardSelectionUI() {
  const cards = getSearchResultCards();
  cards.forEach(card => {
    ensureSearchCardToggle(card);
    const asin = card.getAttribute('data-asin');
    const selected = pageSelectedAsins.has(asin);
    card.classList.toggle('amazon-scraper-selected', selected);
    card.setAttribute('data-amazon-scraper-selected', selected ? 'true' : 'false');
    const btn = card.querySelector('.amazon-scraper-select-btn');
    if (btn) {
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
      btn.title = selected ? 'Deselect product' : 'Select product for scraping';
    }
  });
}

function notifyPopupSelectionChanged() {
  chrome.runtime.sendMessage({
    action: 'searchSelectionChanged',
    selectedAsins: Array.from(pageSelectedAsins)
  }, () => void chrome.runtime.lastError);
}

function handleSearchCardToggleClick(event) {
  const btn = event.target.closest('.amazon-scraper-select-btn');
  if (!btn) return;

  const card = btn.closest('[data-asin]');
  if (!card) return;

  const asin = card.getAttribute('data-asin');
  if (!isValidAsin(asin)) return;

  event.preventDefault();
  event.stopPropagation();

  if (pageSelectedAsins.has(asin)) pageSelectedAsins.delete(asin);
  else pageSelectedAsins.add(asin);

  syncSearchCardSelectionUI();
  notifyPopupSelectionChanged();
}

function initSearchSelectionControls(initialSelectedAsins = null) {
  if (Array.isArray(initialSelectedAsins)) {
    pageSelectedAsins = new Set(initialSelectedAsins.filter(isValidAsin));
  }

  syncSearchCardSelectionUI();

  if (searchSelectionInitialized) return;
  searchSelectionInitialized = true;

  document.addEventListener('click', handleSearchCardToggleClick, true);

  searchSelectionObserver = new MutationObserver(() => {
    syncSearchCardSelectionUI();
  });
  searchSelectionObserver.observe(document.body, { childList: true, subtree: true });
}

// ─── SEARCH PAGE ─────────────────────────────────────────────────────────────
function scrapeSearchPage() {
  const results = [];
  const seenAsins = new Set();
  const cards = getSearchResultCards();

  for (const card of cards) {
    const asin = getCardAsin(card) || card.getAttribute('data-asin');
    if (!asin || asin.length !== 10) continue;
    if (seenAsins.has(asin)) continue;

    const item = { asin };

    // Title (full, for CSV)
    item.productName = extractCardTitle(card);
    if (!item.productName) continue;
    seenAsins.add(asin);

    // Brand — try dedicated brand element first, then extract from title
    const brandEl = card.querySelector('.a-size-base-plus.a-color-base:not(.a-text-normal), .s-line-clamp-1 .a-size-base-plus');
    if (brandEl) {
      item.brandName = brandEl.textContent.trim();
    } else {
      item.brandName = '';
    }

    // Price
    const priceEl = card.querySelector('.a-price .a-offscreen, .p13n-sc-price, [class*="p13n-sc-price"]');
    item.price = priceEl ? normalizeText(priceEl.textContent) : '';

    // Rating
    const ratingEl = card.querySelector('.a-icon-star-small .a-icon-alt, .a-star-small .a-icon-alt, .a-icon-alt, [aria-label*="out of 5"]');
    if (ratingEl) {
      const t = normalizeText(ratingEl.textContent || ratingEl.getAttribute('aria-label') || '');
      const m = t.match(/([\d.]+)\s*out of/);
      item.ratings = m ? m[1] : '';
    } else item.ratings = '';

    // Reviews
    const reviewEl = card.querySelector('[aria-label$="ratings"], .a-size-base.s-underline-text, [class*="p13n-sc-price"] + .a-size-small');
    item.reviews = reviewEl ? normalizeText(reviewEl.textContent).replace(/[()]/g, '') : '';

    // Monthly Sales
    item.monthlySales = extractMonthlySalesText(card);

    // Sponsored
    item.sponsored =
      !!card.querySelector('.puis-sponsored-label-text, .s-sponsored-label-text, [aria-label="Sponsored"]') ||
      /\bsponsored\b/i.test(card.textContent.slice(0, 600));

    // Badge
    const badgeEl = card.querySelector('.a-badge-label-inner, .s-label-popover-default span');
    item.badge = badgeEl ? normalizeText(badgeEl.textContent) : '';

    // Thumbnail
    const imgEl = card.querySelector('img.s-image, img');
    item.imageUrl = imgEl ? imgEl.src : '';

    item.url = `https://${window.location.hostname}/dp/${asin}`;
    results.push(item);
  }

  return results;
}

// ─── PRODUCT PAGE ─────────────────────────────────────────────────────────────
function scrapeProductPageSurface() {
  const result = {};

  // Current ASIN from URL
  const asinMatch = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
  result.asin = asinMatch ? asinMatch[1] : '';

  // ── Variant extraction: Extract colour, size, style names ──
  const variantMap = {}; // { asin: { label, price } }
  const upsertVariant = (asin, label = '', price = '') => {
    if (!asin || asin.length !== 10) return;
    if (!variantMap[asin]) {
      variantMap[asin] = { label: '', price: '' };
    }
    if (label && !isVariantPlaceholder(label) && !variantMap[asin].label) {
      variantMap[asin].label = sanitizeVariantLabel(label);
    }
    if (price && !variantMap[asin].price) {
      variantMap[asin].price = normalizeText(price);
    }
  };

  // Method 1: Inline twister buttons (the style/weight/size selector on page)
  const twisterItems = document.querySelectorAll(
    '#inline-twister-expanded-dimension-values-list li, ' +
    '#twister-plus-inline-twister li, ' +
    '.inline-twister-col li, ' +
    '[id^="variation_"] li'
  );

  twisterItems.forEach(li => {
    const asin =
      li.getAttribute('data-asin') ||
      li.getAttribute('data-defaultasin') ||
      li.querySelector('[data-asin]')?.getAttribute('data-asin') ||
      li.querySelector('[data-defaultasin]')?.getAttribute('data-defaultasin') ||
      extractAsinFromText(li.querySelector('a[href*="/dp/"]')?.getAttribute('href') || '');
    if (!asin || asin.length !== 10) return;

    const label = extractVariantOptionLabel(li);

    // Price for this variant
    const priceEl = li.querySelector('.a-color-price, .a-price .a-offscreen');
    const price = priceEl ? normalizeText(priceEl.textContent) : '';

    upsertVariant(asin, label, price);
  });

  // Method 2: Swatch elements (colour/image swatches)
  const swatchInputs = document.querySelectorAll(
    '.swatchSelect input[data-dp-url], ' +
    '.swatch-list .swatchAvailable input, ' +
    '.swatch-list input[type="radio"][value]'
  );

  swatchInputs.forEach(input => {
    const dpUrl = input.getAttribute('data-dp-url') || '';
    const asin = extractAsinFromText(dpUrl);
    if (!asin) return;

    const li = input.closest('li');
    const label = extractVariantOptionLabel(li || input);

    upsertVariant(asin, label, '');
  });

  // Method 3: Dropdown selectors for size/color/style
  const dropdowns = document.querySelectorAll(
    'select[name="dropdown_selected_color_name"], ' +
    'select[name="dropdown_selected_size_name"], ' +
    'select[name="dropdown_selected_style_name"], ' +
    'select[id^="native_dropdown"]'
  );

  dropdowns.forEach(select => {
    const options = select.querySelectorAll('option[data-dp-url], option[value]');
    options.forEach(option => {
      const dpUrl = option.getAttribute('data-dp-url') || option.getAttribute('value') || '';
      const asin = extractAsinFromText(dpUrl);
      if (!asin || asin.length !== 10) return;

      const label = sanitizeVariantLabel(option.textContent);
      if (label && !isVariantPlaceholder(label) && !looksLikePriceText(label)) {
        upsertVariant(asin, label, '');
      }
    });
  });

  // Method 4: data-defaultasin on anchor/li elements
  document.querySelectorAll('[data-defaultasin]').forEach(el => {
    const asin = el.getAttribute('data-defaultasin');
    if (!asin || asin.length !== 10) return;
    const label = extractVariantOptionLabel(el);
    upsertVariant(asin, label, '');
  });

  // Method 5: anchor links to /dp/<asin> inside variation blocks
  document.querySelectorAll(
    '#twister-plus-inline-twister a[href*="/dp/"], ' +
    '#inline-twister-expanded-dimension-values-list a[href*="/dp/"], ' +
    '[id^="variation_"] a[href*="/dp/"]'
  ).forEach(anchor => {
    const asin = extractAsinFromText(anchor.getAttribute('href') || '');
    if (!asin) return;
    const label = extractVariantOptionLabel(anchor.closest('li') || anchor);
    upsertVariant(asin, label, '');
  });

  // Build ordered array — current ASIN first
  const variantAsins = [];
  if (result.asin) variantAsins.push(result.asin);
  Object.keys(variantMap).forEach(a => {
    if (!variantAsins.includes(a)) variantAsins.push(a);
  });

  // Ensure current ASIN is in map
  if (result.asin && !variantMap[result.asin]) {
    variantMap[result.asin] = { label: '', price: '' };
  }

  result.variantMap = variantMap;
  result.variantAsins = variantAsins.filter(a => /^[A-Z0-9]{10}$/.test(a));

  // ── Extract current variant name (colour/size/style) ──
  result.currentStyleName = '';

  // Try to find selected variant text
  const selectionDisplays = document.querySelectorAll(
    '.selection, ' +
    '.selection-display-value, ' +
    '#inline-twister-expanded-dimension-values-subtitle span, ' +
    '[class*="twister-byline-title"] span, ' +
    '.twisterSwatchInput:checked + span, ' +
    '#variation_style_name .selection, ' +
    '#variation_size_name .selection, ' +
    '#variation_color_name .selection'
  );

  for (const el of selectionDisplays) {
    const txt = sanitizeVariantLabel(el.textContent);
    if (txt && !isVariantPlaceholder(txt)) {
      result.currentStyleName = txt;
      break;
    }
  }

  // Try dropdown selected options
  if (!result.currentStyleName) {
    const selectedOptions = document.querySelectorAll(
      'select[name*="dropdown_selected"] option:checked, ' +
      'select[id^="native_dropdown"] option:checked'
    );
    for (const opt of selectedOptions) {
      const txt = sanitizeVariantLabel(opt.textContent);
      if (txt && !isVariantPlaceholder(txt)) {
        result.currentStyleName = txt;
        break;
      }
    }
  }

  // Try "Style Name:" text pattern
  if (!result.currentStyleName) {
    const allText = document.body.innerText;
    const patterns = [
      /Style Name:\s*([^\n]+)/i,
      /Size:\s*([^\n]+)/i,
      /Colo[u]?r:\s*([^\n]+)/i,
      /Scent:\s*([^\n]+)/i,
      /Flavor:\s*([^\n]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = allText.match(pattern);
      if (match && match[1]) {
        const parsed = sanitizeVariantLabel(match[1]);
        if (!isVariantPlaceholder(parsed)) {
          result.currentStyleName = parsed;
        }
        break;
      }
    }
  }

  // If we have the current ASIN in variantMap with a label, use that
  if (!result.currentStyleName && result.asin && variantMap[result.asin]?.label) {
    result.currentStyleName = variantMap[result.asin].label;
  }

  // ── Surface data ──
  const titleEl = document.getElementById('productTitle');
  result.productName = titleEl ? normalizeText(titleEl.textContent) : '';

  // Brand
  const brandEl = document.querySelector('#bylineInfo, .po-brand .po-break-word, a#bylineInfo');
  result.brandName = brandEl ? normalizeText(brandEl.textContent).replace(/^(Visit the |Brand: )/i, '') : '';

  // Price
  const priceEl = document.querySelector(
    '.priceToPay .a-offscreen, .apexPriceToPay .a-offscreen, #corePrice_desktop .a-offscreen, .a-price .a-offscreen'
  );
  result.price = priceEl ? normalizeText(priceEl.textContent) : '';

  // Monthly sales
  result.monthlySales = extractMonthlySalesText(document);

  result.domain = window.location.hostname;
  result.url = window.location.href;
  result.pageType = 'product';

  return result;
}

// ─── SEARCH PAGE HIGHLIGHTING ────────────────────────────────────────────────
function highlightSelectedProducts(selectedAsins) {
  pageSelectedAsins = new Set((selectedAsins || []).filter(isValidAsin));
  initSearchSelectionControls();
  syncSearchCardSelectionUI();
}

// ─── MESSAGE LISTENER ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'detectAndScrape') {
    const pageType = detectPageType();
    const domain = getAmazonDomain();

    if (pageType === 'search') {
      const cards = scrapeSearchPage();
      if (pageSelectedAsins.size === 0) {
        pageSelectedAsins = new Set(cards.map(card => card.asin).filter(isValidAsin));
      }
      initSearchSelectionControls(Array.from(pageSelectedAsins));
      sendResponse({
        pageType: 'search',
        domain,
        cards,
        selectedAsins: Array.from(pageSelectedAsins)
      });
    } else if (pageType === 'product') {
      sendResponse({ pageType: 'product', domain, ...scrapeProductPageSurface() });
    } else {
      sendResponse({ pageType: 'unknown', domain });
    }
  }
  
  if (request.action === 'highlightSelected') {
    highlightSelectedProducts(request.selectedAsins || []);
    sendResponse({ success: true });
  }
  
  return true;
});

})();
