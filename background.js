// background.js — service worker for orchestrating deep scraping

let scrapeState = {
  active: false,
  total: 0,
  completed: 0,
  results: [],
  errors: []
};

const ASIN_CACHE_KEY = 'asinScrapeCacheV7';
const ASIN_CACHE_TTL_MS = 45 * 60 * 1000;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'deepScrapeASINs') {
    handleDeepScrape(
      message.asins,
      message.fields,
      message.domain,
      message.sourceTabId,
      message.variantLabelMap || null
    );
    sendResponse({ started: true });
    return true;
  }

  if (message.action === 'getProgress') {
    sendResponse({ ...scrapeState });
    return true;
  }

  if (message.action === 'cancelScrape') {
    scrapeState.active = false;
    sendResponse({ cancelled: true });
    return true;
  }

  if (message.action === 'fetchVariantMonthlySales') {
    fetchVariantMonthlySales(message.asins || [], message.domain)
      .then(salesMap => sendResponse({ success: true, salesMap }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

function getStorageValue(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, result => resolve(result[key]));
  });
}

function setStorageValues(values) {
  return new Promise(resolve => {
    chrome.storage.local.set(values, resolve);
  });
}

async function loadAsinCache() {
  const cache = await getStorageValue(ASIN_CACHE_KEY);
  return (cache && typeof cache === 'object') ? cache : {};
}

async function saveAsinCache(cache) {
  await setStorageValues({ [ASIN_CACHE_KEY]: cache });
}

function pruneExpiredAsinCache(cache, now = Date.now()) {
  Object.keys(cache || {}).forEach(asin => {
    const entry = cache[asin];
    if (!entry?.updatedAt || (now - entry.updatedAt) > ASIN_CACHE_TTL_MS) {
      delete cache[asin];
    }
  });
}

function getCachedResultForFields(cache, asin, fields, now = Date.now()) {
  const entry = cache?.[asin];
  if (!entry?.updatedAt || (now - entry.updatedAt) > ASIN_CACHE_TTL_MS) return null;

  const scrapedFields = new Set(entry.scrapedFields || []);
  const requiredFields = (fields || []).filter(field => field && field !== 'asin');
  if (requiredFields.some(field => !scrapedFields.has(field))) return null;

  const result = { asin };
  requiredFields.forEach(field => {
    if (entry.data && Object.prototype.hasOwnProperty.call(entry.data, field)) {
      result[field] = entry.data[field];
    } else if (field === 'bsr' || field === 'variants') {
      result[field] = {};
    } else {
      result[field] = '';
    }
  });
  return result;
}

function upsertCachedResult(cache, asin, data, scrapedFields, now = Date.now()) {
  if (!cache || !asin) return;

  const previous = cache[asin] || { data: { asin }, scrapedFields: [], updatedAt: 0 };
  const nextData = { ...(previous.data || {}), ...(data || {}), asin };
  const nextFields = new Set(previous.scrapedFields || []);
  (scrapedFields || []).forEach(field => {
    if (field && field !== 'asin') nextFields.add(field);
  });

  cache[asin] = {
    data: nextData,
    scrapedFields: Array.from(nextFields),
    updatedAt: now
  };
}

async function handleDeepScrape(asins, fields, domain, sourceTabId, variantLabelMap = null) {
  const now = Date.now();
  const asinCache = await loadAsinCache();
  pruneExpiredAsinCache(asinCache, now);

  scrapeState = {
    active: true,
    total: asins.length,
    completed: 0,
    results: [],
    errors: []
  };

  // Notify popup that scraping started
  notifyProgress();

  for (let i = 0; i < asins.length; i++) {
    if (!scrapeState.active) break;

    const asin = asins[i];
    const url = `https://${domain}/dp/${asin}`;

    try {
      const cachedResult = getCachedResultForFields(asinCache, asin, fields);
      const result = cachedResult || await scrapeProductPage(url, asin, fields, sourceTabId);

      if (fields.includes('variants') && variantLabelMap && variantLabelMap[asin]) {
        result.variants = variantLabelMap[asin];
      }

      scrapeState.results.push(result);

      if (!cachedResult && !result.error) {
        upsertCachedResult(asinCache, asin, result, fields);
      }
    } catch (err) {
      scrapeState.errors.push({ asin, error: err.message });
      scrapeState.results.push({ asin, error: err.message });
    }

    scrapeState.completed = i + 1;
    notifyProgress();

    // Small delay between requests to avoid rate limiting
    if (i < asins.length - 1) {
      await sleep(1200);
    }
  }

  scrapeState.active = false;
  await saveAsinCache(asinCache);
  notifyProgress();
}

async function scrapeProductPage(url, asin, fields, sourceTabId) {
  return new Promise(async (resolve, reject) => {
    let tab = null;

    try {
      // Create a hidden tab
      tab = await chrome.tabs.create({
        url: url,
        active: false,
        index: 0
      });

      // Wait for page to load
      await waitForTabLoad(tab.id, 12000);

      // Give JS a moment to render
      await sleep(800);

      // Inject scraper and get result
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: deepScrapeProductPage,
        args: [asin, fields]
      });

      const data = results?.[0]?.result;
      if (!data) throw new Error('No data returned');

      resolve(data);
    } catch (err) {
      reject(new Error(err.message || 'Failed to scrape ' + asin));
    } finally {
      // Always close the tab
      if (tab?.id) {
        try { await chrome.tabs.remove(tab.id); } catch (_) {}
      }
    }
  });
}

async function fetchVariantMonthlySales(asins, domain) {
  const salesMap = {};
  const now = Date.now();
  const asinCache = await loadAsinCache();
  pruneExpiredAsinCache(asinCache, now);
  const uniqueAsins = Array.from(new Set(
    (asins || []).filter(asin => /^[A-Z0-9]{10}$/.test(asin))
  ));

  if (!domain || uniqueAsins.length === 0) return salesMap;

  for (let i = 0; i < uniqueAsins.length; i++) {
    const asin = uniqueAsins[i];
    const url = `https://${domain}/dp/${asin}`;

    const cachedMonthlySales = getCachedResultForFields(asinCache, asin, ['monthlySales'], now);
    if (cachedMonthlySales) {
      salesMap[asin] = cachedMonthlySales.monthlySales || '';
      continue;
    }

    try {
      salesMap[asin] = await scrapeMonthlySalesOnly(url);
      upsertCachedResult(asinCache, asin, { asin, monthlySales: salesMap[asin] }, ['monthlySales']);
    } catch (_) {
      salesMap[asin] = '';
    }

    if (i < uniqueAsins.length - 1) {
      await sleep(250);
    }
  }

  await saveAsinCache(asinCache);
  return salesMap;
}

async function scrapeMonthlySalesOnly(url) {
  let tab = null;
  try {
    tab = await chrome.tabs.create({
      url: url,
      active: false,
      index: 0
    });

    await waitForTabLoad(tab.id, 10000);
    await sleep(500);

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractMonthlySalesFromProductPage
    });

    return results?.[0]?.result || '';
  } finally {
    if (tab?.id) {
      try { await chrome.tabs.remove(tab.id); } catch (_) {}
    }
  }
}

function extractMonthlySalesFromProductPage() {
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const pattern = /(?:\d[\d.,]*|\d+(?:\.\d+)?\s*[kKmM])\+?\s*bought in past month/i;
  const candidates = document.querySelectorAll('span, [aria-label]');

  for (const node of candidates) {
    const txt = normalize(node.textContent || node.getAttribute?.('aria-label') || '');
    const match = txt.match(pattern);
    if (match) return normalize(match[0]);
  }

  return '';
}

function waitForTabLoad(tabId, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(); // resolve anyway, page might be partially loaded
    }, timeout);

    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

// This function runs IN the product page tab context
function deepScrapeProductPage(asin, fields) {
  const get = (selectors) => {
    if (!Array.isArray(selectors)) selectors = [selectors];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const txt = el.textContent.trim().replace(/\s+/g, ' ');
        if (txt) return txt;
      }
    }
    return null;
  };

  const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const cleanVariantValue = (value) => cleanText(
    String(value || '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/temporarily\s+out\s+of\s+stock[:\s-]*/gi, ' ')
      .replace(/currently\s+unavailable[:\s-]*/gi, ' ')
      .replace(/click\s+to\s+select[:\s-]*/gi, ' ')
  );
  const isVariantPlaceholder = (value) => {
    const cleaned = cleanVariantValue(value).toLowerCase();
    return !cleaned || ['select', 'choose', 'choose option', 'options', 'n/a', '-'].includes(cleaned);
  };
  const extractAsinFromText = (value) => {
    const text = String(value || '');
    const inUrl = text.match(/\/dp\/([A-Z0-9]{10})/i);
    if (inUrl) return inUrl[1].toUpperCase();
    const direct = text.match(/\b([A-Z0-9]{10})\b/i);
    return direct ? direct[1].toUpperCase() : '';
  };
  const looksLikeVariantPrice = (value) => {
    const cleaned = cleanVariantValue(value).toLowerCase();
    return /(?:£|\$|€|¥|₹)\s*\d|rrp|with prime|\/\s*count/i.test(cleaned) || /^\d+[.,]\d{2}$/.test(cleaned);
  };
  const normalizeVariantDisplay = (value) => {
    return cleanVariantValue(value)
      .replace(/^(?:colour|color|size|style|set name|number of items?|collection item)\s*(?:name)?\s*:\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  };
  const looksLikeVariantNoise = (value) => {
    const text = cleanText(value).toLowerCase();
    if (!text) return true;
    if (text.length > 90) return true;
    if (/[{};]/.test(text)) return true;
    if (/\bvar\b|\bconst\b|\blet\b|function\s*\(|p\.when|a\.declarative|ue\.count|onclick|addEventListener/i.test(text)) return true;
    if (/out of 5 stars|ratings?|customer reviews?|amazon'?s choice|limited time deal|add to basket|buy now|free delivery/i.test(text)) return true;
    return false;
  };
  const isAsinText = (value) => /^[A-Z0-9]{10}$/i.test(cleanVariantValue(value));
  const pickVariantValue = (...candidates) => {
    for (const candidate of candidates) {
      const fragments = [
        String(candidate || ''),
        ...String(candidate || '')
          .split(/\r?\n| {2,}/)
          .map(part => part.trim())
          .filter(Boolean)
      ];

      for (const fragment of fragments) {
        const normalized = normalizeVariantDisplay(fragment);
        if (!normalized) continue;
        if (isVariantPlaceholder(normalized)) continue;
        if (looksLikeVariantPrice(normalized)) continue;
        if (looksLikeVariantNoise(normalized)) continue;
        if (isAsinText(normalized)) continue;
        return normalized;
      }
    }
    return '';
  };
  const extractVariantFromNode = (node) => {
    if (!node) return '';

    const candidates = [
      node.getAttribute?.('aria-label'),
      node.getAttribute?.('title')
    ];

    const textNodes = node.querySelectorAll(
      '.twisterText, .twisterTextDiv, .a-button-text, .selection, ' +
      '.swatch-title-text-display, .a-size-base, .a-size-base-plus, img[alt]'
    );
    textNodes.forEach(el => {
      const text = el.getAttribute?.('alt') || el.textContent;
      if (text) candidates.push(text);
    });

    candidates.push(node.textContent || '');
    return pickVariantValue(...candidates);
  };
  const normalizeVariantKey = (rawKey) => {
    const key = String(rawKey || '')
      .replace(/^dropdown_selected_/i, '')
      .replace(/^native_/i, '')
      .replace(/^variation_/i, '')
      .replace(/_name$/i, '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!key) return '';

    if (/number of items?|item count|number of item/.test(key)) return 'Number of Items';
    if (/size/.test(key)) return 'Size';
    if (/colour|color/.test(key)) return 'Colour';
    if (/set name|set/.test(key)) return 'Set Name';
    if (/collection item/.test(key)) return 'Collection Item';
    if (/style/.test(key)) return 'Style';

    return key.charAt(0).toUpperCase() + key.slice(1);
  };

  const result = { asin };

  // Product Name
  if (fields.includes('productName')) {
    result.productName = get(['#productTitle', '#title span', 'h1.a-size-large']) || '';
  }

  // Brand
  if (fields.includes('brandName')) {
    result.brandName =
      get(['#bylineInfo', '.po-brand .po-break-word', 'a#bylineInfo']) ||
      get(['tr.po-brand td.a-span9']) || '';
    result.brandName = result.brandName.replace(/^(Visit the |Brand: )/i, '').trim();
  }

  // Price
  if (fields.includes('price')) {
    const priceSelectors = [
      '.priceToPay .a-offscreen',
      '.apexPriceToPay .a-offscreen',
      '#corePrice_desktop .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '.a-price .a-offscreen'
    ];
    for (const sel of priceSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const txt = el.textContent.trim();
        if (txt && /[\d.,]/.test(txt)) { result.price = txt; break; }
      }
    }
  }

  // Monthly Sales
  if (fields.includes('monthlySales')) {
    result.monthlySales = '';
    const spans = document.querySelectorAll('span');
    for (const span of spans) {
      const txt = cleanText(span.textContent);
      if (/(?:\d[\d.,]*|\d+(?:\.\d+)?\s*[kKmM])\+?\s*bought in past month/i.test(txt)) {
        result.monthlySales = txt;
        break;
      }
    }
  }

  // BSR Ranking
  if (fields.includes('bsr')) {
    let bsrRawText = '';
    const detailRows = document.querySelectorAll('#productDetails_detailBullets_sections1 tr, #productDetails_db_sections tr');
    for (const row of detailRows) {
      const th = row.querySelector('th');
      const td = row.querySelector('td');
      if (th && td && /best.?seller/i.test(th.textContent)) {
        bsrRawText = cleanText(td.textContent);
        break;
      }
    }

    // Try detail bullets
    if (!bsrRawText) {
      const bullets = document.querySelectorAll('#detailBullets_feature_div li span.a-list-item');
      for (const li of bullets) {
        const text = li.textContent;
        if (/best.?seller/i.test(text)) {
          bsrRawText = cleanText(text);
          break;
        }
      }
    }

    // Try rank widget
    const rankWidget = document.querySelector('#detailBulletsWrapper_feature_div');
    if (rankWidget && !bsrRawText) {
      const rankText = rankWidget.textContent;
      if (/best.?seller/i.test(rankText)) {
        bsrRawText = cleanText(rankText);
      }
    }

    result.bsr = formatBsrText(bsrRawText);
  }

  // Ratings
  if (fields.includes('ratings')) {
    const ratingEl = document.querySelector('#acrPopover, .reviewCountTextLinkedHistogram');
    if (ratingEl) {
      const t = ratingEl.getAttribute('title') || ratingEl.textContent;
      const m = t.match(/[\d.]+/);
      result.ratings = m ? m[0] : '';
    } else result.ratings = '';
  }

  // Reviews
  if (fields.includes('reviews')) {
    const reviewEl = document.getElementById('acrCustomerReviewText');
    result.reviews = reviewEl ? reviewEl.textContent.trim() : '';
  }

  // Technical details from product info table
  const techDetails = {};
  const allRows = document.querySelectorAll(
    '#productDetails_techSpec_section_1 tr, #productDetails_techSpec_section_2 tr, ' +
    '#tech-specs-table tr, .a-keyvalue tr, #technical-specifications_feature_div tr'
  );
  for (const row of allRows) {
    const th = row.querySelector('th');
    const td = row.querySelector('td');
    if (th && td) {
      techDetails[th.textContent.trim().toLowerCase()] = td.textContent.trim().replace(/\s+/g, ' ');
    }
  }

  // Also check detail bullets
  const bulletItems = document.querySelectorAll('#detailBullets_feature_div li .a-list-item');
  for (const item of bulletItems) {
    const spans = item.querySelectorAll('span');
    if (spans.length >= 2) {
      const key = spans[0].textContent.trim().replace(/:$/, '').toLowerCase();
      const val = spans[1].textContent.trim();
      if (key && val && !/best.?seller/i.test(key)) {
        techDetails[key] = val;
      }
    }
  }

  // Number of Pieces
  if (fields.includes('pieces')) {
    result.pieces = findInDetails(techDetails, ['number of pieces', 'pieces', 'item count', 'piece count', 'unit count']) || '';
  }

  // Item Weight
  if (fields.includes('weight')) {
    result.weight = findInDetails(techDetails, ['item weight', 'weight', 'product weight']) || '';
  }

  // Item Dimensions
  if (fields.includes('dimensions')) {
    result.dimensions = findInDetails(techDetails, ['item dimensions', 'product dimensions', 'dimensions', 'package dimensions']) || '';
  }

  // Product Release Date / Date First Available
  if (fields.includes('releaseDate')) {
    result.releaseDate = findInDetails(techDetails, ['date first available', 'release date', 'date available']) || '';

    if (!result.releaseDate) {
      const dateRows = document.querySelectorAll(
        '#productDetails_techSpec_section_1 tr, ' +
        '#productDetails_detailBullets_sections1 tr, ' +
        '#productDetails_db_sections tr'
      );
      for (const row of dateRows) {
        const keyEl = row.querySelector('th, .a-span3');
        const valueEl = row.querySelector('td, .a-span9');
        const keyText = cleanText(keyEl?.textContent || '');
        if (/date first available|release date|date available/i.test(keyText)) {
          const valueText = cleanText(valueEl?.textContent || '');
          if (valueText) {
            result.releaseDate = valueText;
            break;
          }
        }
      }
    }

    if (!result.releaseDate) {
      const bullet = Array.from(document.querySelectorAll('#detailBullets_feature_div li .a-list-item'))
        .find(el => /date first available|release date|date available/i.test(el.textContent || ''));
      if (bullet) {
        const text = cleanText(bullet.textContent || '');
        const parsed = text.split(':').slice(1).join(':').trim();
        if (parsed) result.releaseDate = parsed;
      }
    }

    if (!result.releaseDate) {
      result.releaseDate = 'Not Available';
    }
  }

  // Variants (colour, size, style etc)
  if (fields.includes('variants')) {
    result.variants = {};

    const setVariantValue = (rawLabel, rawValue) => {
      const value = pickVariantValue(rawValue);
      if (!value) return;

      const baseLabel = normalizeVariantKey(rawLabel) || 'Variant';
      let label = baseLabel;
      let suffix = 2;
      while (result.variants[label] && result.variants[label] !== value) {
        label = `${baseLabel} ${suffix++}`;
      }
      result.variants[label] = value;
    };

    const getAsinMatchedVariantValue = (rootNode) => {
      if (!rootNode) return '';

      const asinNodes = rootNode.querySelectorAll(
        '[data-defaultasin], [data-asin], [data-dp-url], input[data-dp-url], option[data-dp-url], option[value*="/dp/"]'
      );

      for (const node of asinNodes) {
        const rawAsinSource =
          node.getAttribute('data-defaultasin') ||
          node.getAttribute('data-asin') ||
          node.getAttribute('data-dp-url') ||
          node.getAttribute('value') ||
          node.getAttribute('href') ||
          '';
        const nodeAsin = extractAsinFromText(rawAsinSource);
        if (!nodeAsin || nodeAsin !== String(asin || '').toUpperCase()) continue;

        const fromNode = extractVariantFromNode(
          node.closest('li') ||
          node.closest('.a-button') ||
          node.closest('.swatchAvailable') ||
          node
        );
        if (fromNode) return fromNode;
      }

      return '';
    };

    // 1) Inline twister expanded dimension spans
    const inlineTwisterSpans = document.querySelectorAll('span[id^="inline-twister-expanded-dimension-text-"]');
    inlineTwisterSpans.forEach(span => {
      const id = span.id || '';
      const match = id.match(/^inline-twister-expanded-dimension-text-(.+)$/i);
      const keyFromId = match?.[1] || '';
      const label = normalizeVariantKey(keyFromId);
      setVariantValue(label, span.textContent || '');
    });

    // 2) Known variation blocks only (strict selected-value extraction)
    const knownVariationBlocks = [
      '#variation_number_of_items_name',
      '#variation_size_name',
      '#variation_colour_name',
      '#variation_color_name',
      '#variation_set_name',
      '#variation_collection_item_name',
      '#variation_style_name'
    ];

    knownVariationBlocks.forEach(selector => {
      const block = document.querySelector(selector);
      if (!block) return;

      const label = normalizeVariantKey(block.id || block.getAttribute('data-variation-name') || '');
      const selectedNodes = block.querySelectorAll(
        'li.a-button-selected .swatch-title-text-display, ' +
        'li.a-button-selected .twisterTextDiv, ' +
        'li.a-button-selected .twisterText, ' +
        'li.a-button-selected .a-button-text, ' +
        '.a-button-selected .swatch-title-text-display, ' +
        '.a-button-selected .selection, ' +
        'select option:checked, .selection, .a-dropdown-prompt'
      );

      const selectedTexts = Array.from(selectedNodes).map(node => node.getAttribute?.('alt') || node.textContent || '');
      const matchedAsinValue = getAsinMatchedVariantValue(block);
      const subtitleValue = block.querySelector('.text-swatch-container .swatch-title-text-display')?.textContent || '';

      setVariantValue(label, pickVariantValue(...selectedTexts, matchedAsinValue, subtitleValue));
    });

    // 3) Generic dropdown fallback
    const variantSelects = document.querySelectorAll('[name^="dropdown_selected_"], select[id^="native_"]');
    for (const sel of variantSelects) {
      const cleanLabel = normalizeVariantKey(sel.getAttribute('name') || sel.id);
      const selectedOpt = sel.options?.[sel.selectedIndex] || sel.querySelector('option[selected]');
      const asinOption = Array.from(sel.options || []).find(option => {
        const source = option.getAttribute('data-dp-url') || option.getAttribute('value') || '';
        return extractAsinFromText(source) === String(asin || '').toUpperCase();
      });
      setVariantValue(cleanLabel, pickVariantValue(selectedOpt?.textContent || '', asinOption?.textContent || ''));
    }

    // 4) Direct selected variant text (e.g. "Style Name: 24KG-Pair" panel)
    const directVariantValue = pickVariantValue(
      document.querySelector('#inline-twister-expanded-dimension-values-subtitle .swatch-title-text-display')?.textContent,
      document.querySelector('#inline-twister-expanded-dimension-values-subtitle .selection')?.textContent,
      document.querySelector('.text-swatch-container .swatch-title-text-display')?.textContent,
      document.querySelector('#variation_style_name .selection')?.textContent,
      document.querySelector('#variation_size_name .selection')?.textContent,
      document.querySelector('#variation_color_name .selection')?.textContent,
      document.querySelector('#variation_colour_name .selection')?.textContent,
      document.querySelector('#variation_set_name .selection')?.textContent,
      document.querySelector('#variation_number_of_items_name .selection')?.textContent,
      document.querySelector('#variation_collection_item_name .selection')?.textContent
    );
    if (directVariantValue) {
      setVariantValue('Variant', directVariantValue);
    }

    if (Object.keys(result.variants).length === 0) {
      const pageVariantLabel = pickVariantValue(
        getAsinMatchedVariantValue(document.querySelector('#twister') || document.querySelector('#inline-twister-expanded-dimension-values-list')),
        document.querySelector('#inline-twister-expanded-dimension-values-subtitle .swatch-title-text-display')?.textContent,
        document.querySelector('li.a-button-selected .swatch-title-text-display')?.textContent
      );

      if (pageVariantLabel) {
        result.variants = pageVariantLabel;
      } else {
        let itemWeightValue = findInDetails(techDetails, ['item weight', 'weight', 'product weight']) || '';
        if (!itemWeightValue) {
          const detailRows = document.querySelectorAll(
            '#prodDetails .prodDetTable tr, #productDetails_techSpec_section_1 tr, #productDetails_techSpec_section_2 tr, .a-keyvalue.prodDetTable tr'
          );
          for (const row of detailRows) {
            const th = row.querySelector('th');
            const td = row.querySelector('td');
            const keyText = cleanText(th?.textContent || '');
            if (/item weight|product weight|weight/i.test(keyText)) {
              itemWeightValue = cleanText(td?.textContent || '');
              if (itemWeightValue) break;
            }
          }
        }

        const weightFallback = pickVariantValue(itemWeightValue);
        if (weightFallback) {
          result.variants = weightFallback;
        }
      }
    }

    if (result.variants && typeof result.variants === 'object') {
      const summary = summarizeVariantSelections(result.variants);
      result.variants = summary || 'Not Available';
    }

    if (!result.variants || (typeof result.variants === 'object' && Object.keys(result.variants).length === 0)) {
      result.variants = 'Not Available';
    }
  }

  // Scraped timestamp
  if (fields.includes('scrapedAt')) {
    result.scrapedAt = new Date().toLocaleString('en-GB');
  }

  return result;

  // Helper: normalize BSR into concise text e.g. "6,351 in Sports & Outdoors, 94 in Dumbbells"
  function formatBsrText(text) {
    const normalized = cleanText(text).replace(/^best sellers rank[:\s]*/i, '').trim();
    if (!normalized) return 'Not Available';

    const parts = [];
    const pattern = /#?\s*([\d,]+)\s+in\s+([^\n,#()]+)/gi;
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      const rank = (match[1] || '').trim();
      const category = cleanText(match[2] || '');
      if (rank && category) {
        parts.push(`${rank} in ${category}`);
      }
    }

    if (parts.length > 0) return parts.join(', ');
    return normalized || 'Not Available';
  }

  function summarizeVariantSelections(variantObj) {
    if (!variantObj || typeof variantObj !== 'object') return '';
    const entries = Object.entries(variantObj)
      .map(([rawKey, rawValue]) => {
        const key = normalizeVariantKey(rawKey) || 'Variant';
        const value = pickVariantValue(rawValue);
        return value ? { key, value } : null;
      })
      .filter(Boolean);

    if (entries.length === 0) return '';

    const specificValues = new Set(
      entries
        .filter(entry => entry.key !== 'Variant')
        .map(entry => entry.value.toLowerCase())
    );

    const deduped = [];
    const seen = new Set();
    for (const entry of entries) {
      if (entry.key === 'Variant' && specificValues.has(entry.value.toLowerCase())) continue;
      const dedupeKey = `${entry.key}|${entry.value}`.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      deduped.push(`${entry.key}: ${entry.value}`);
    }

    if (deduped.length === 1) {
      return deduped[0].split(':').slice(1).join(':').trim();
    }
    return deduped.join(' | ');
  }

  // Helper: find key in details object with multiple possible keys
  function findInDetails(details, keys) {
    for (const key of keys) {
      for (const detailKey of Object.keys(details)) {
        if (detailKey.includes(key)) return details[detailKey];
      }
    }
    return null;
  }
}

function notifyProgress() {
  // Store progress in chrome.storage so popup can poll it
  chrome.storage.local.set({
    scrapeProgress: {
      active: scrapeState.active,
      total: scrapeState.total,
      completed: scrapeState.completed,
      results: scrapeState.results,
      errors: scrapeState.errors,
      timestamp: Date.now()
    }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
