// popup.js

// ─── FIELD DEFINITIONS ──────────────────────────────────────────────────────
const DEFAULT_FIELDS = [
  { id: 'productName', label: 'Product Name' },
  { id: 'price',       label: 'Price' },
  { id: 'asin',        label: 'ASIN' },
  { id: 'brandName',   label: 'Brand Name' },
  { id: 'monthlySales',label: 'Monthly Sales' },
];

const ADDITIONAL_FIELDS = [
  { id: 'bsr',         label: 'BSR Ranking' },
  { id: 'ratings',     label: 'Ratings' },
  { id: 'reviews',     label: 'Reviews' },
  { id: 'pieces',      label: 'No. of Pieces' },
  { id: 'weight',      label: 'Item Weight' },
  { id: 'dimensions',  label: 'Item Dimensions' },
  { id: 'variants',    label: 'Variants (Colour/Size/Style)' },
  { id: 'releaseDate', label: 'Date First Available' },
  { id: 'scrapedAt',   label: 'Scraped Date & Time' },
];

// ─── STATE ───────────────────────────────────────────────────────────────────
let pageData = null;        // result from content.js
let selectedFields = new Set(DEFAULT_FIELDS.map(f => f.id));
let selectedAsins = new Set();
let allAsins = [];          // { asin, productName, monthlySales, sponsored, price }
let lastResults = null;
let progressTimer = null;
let isScraping = false;
let currentTabId = null;
let variantSalesFetchToken = 0;
let isMinimized = false;
let currentTheme = 'dark';
const THEME_STORAGE_KEY = 'popupTheme';

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadThemePreference();
  buildFieldUI();
  setupEventListeners();
  await initPage();
});

async function initPage() {
  showState('state-scanning');

  const tab = await getActiveTab();
  currentTabId = tab?.id;
  
  if (!tab || !isAmazonTab(tab.url)) {
    showState('state-not-amazon');
    return;
  }

  try {
    pageData = await requestPageData(tab.id);

    if (!pageData || pageData.pageType === 'unknown') {
      showState('state-not-amazon');
      return;
    }

    updatePageBadge(pageData.pageType);
    buildAsinList(pageData);
    showState('state-configure');
    
    // If search page, inject highlight CSS
    if (pageData.pageType === 'search') {
      await injectHighlightCSS(tab.id);
    }

  } catch (err) {
    showState('state-not-amazon');
    document.querySelector('#state-not-amazon .empty-state p').innerHTML =
      `Could not read the page.<br><strong>Try refreshing the Amazon tab.</strong>`;
  }
}

async function requestPageData(tabId) {
  try {
    return await sendMessage(tabId, { action: 'detectAndScrape' });
  } catch (err) {
    const msg = String(err?.message || '');
    const needsInjection =
      /Receiving end does not exist/i.test(msg) ||
      /Could not establish connection/i.test(msg);

    if (!needsInjection) throw err;

    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return await sendMessage(tabId, { action: 'detectAndScrape' });
  }
}

// ─── FIELD UI ─────────────────────────────────────────────────────────────────
async function loadThemePreference() {
  try {
    const data = await new Promise(resolve => {
      chrome.storage.local.get(THEME_STORAGE_KEY, result => resolve(result || {}));
    });
    const theme = data?.[THEME_STORAGE_KEY] === 'light' ? 'light' : 'dark';
    applyTheme(theme, false);
  } catch {
    applyTheme('dark', false);
  }
}

function applyTheme(theme, persist = true) {
  currentTheme = theme === 'light' ? 'light' : 'dark';
  const isLight = currentTheme === 'light';

  document.body.classList.toggle('theme-light', isLight);

  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.textContent = isLight ? '🌙' : '☀';
    btn.title = isLight ? 'Switch to dark theme' : 'Switch to light theme';
  }

  if (persist) {
    chrome.storage.local.set({ [THEME_STORAGE_KEY]: currentTheme });
  }
}

function toggleTheme() {
  applyTheme(currentTheme === 'light' ? 'dark' : 'light', true);
}

function buildFieldUI() {
  const defaultGrid = document.getElementById('default-fields');
  const additionalGrid = document.getElementById('additional-fields-grid');

  DEFAULT_FIELDS.forEach(f => {
    defaultGrid.appendChild(makeFieldItem(f, true, true));
  });

  ADDITIONAL_FIELDS.forEach(f => {
    additionalGrid.appendChild(makeFieldItem(f, false, false));
  });
}

function makeFieldItem(field, isDefault, checked) {
  const div = document.createElement('div');
  div.className = 'field-item' + (checked ? ' checked' : '');
  div.dataset.fieldId = field.id;

  div.innerHTML = `
    <div class="checkmark"></div>
    <span class="field-label">${field.label}</span>
    ${isDefault ? '<div class="default-dot" title="Default field"></div>' : ''}
  `;

  div.addEventListener('click', () => toggleField(field.id, div));
  return div;
}

function toggleField(fieldId, el) {
  if (selectedFields.has(fieldId)) {
    selectedFields.delete(fieldId);
    el.classList.remove('checked');
  } else {
    selectedFields.add(fieldId);
    el.classList.add('checked');
  }
}

// ─── ASIN LIST ────────────────────────────────────────────────────────────────
function buildAsinList(data) {
  variantSalesFetchToken++;
  allAsins = [];
  selectedAsins = new Set();
  const hasPersistedSelection = data.pageType === 'search' && Array.isArray(data.selectedAsins);
  const salesOnlyBtn = document.getElementById('btn-sales-only');
  if (salesOnlyBtn) {
    salesOnlyBtn.style.display = data.pageType === 'search' ? 'inline' : 'none';
  }

  if (data.pageType === 'search') {
    document.getElementById('asin-section-title').textContent = 'Products on Search Page';
    allAsins = (data.cards || []).map(card => ({
      asin: card.asin,
      // Use product name as primary label
      label: card.productName ? card.productName.substring(0, 50) : card.asin,
      sublabel: card.productName || '',
      monthlySales: card.monthlySales,
      price: card.price,
      ratings: card.ratings,
      reviews: card.reviews,
      sponsored: card.sponsored,
      badge: card.badge,
      brandName: card.brandName,
      productName: card.productName,
      imageUrl: card.imageUrl,
      url: card.url,
    }));
  } else {
    document.getElementById('asin-section-title').textContent = 'Product Variants';
    const variantMap = data.variantMap || {};
    const variantAsins = data.variantAsins || [data.asin];

    allAsins = variantAsins.map((asin, i) => {
      const vInfo = variantMap[asin] || {};
      let label = cleanVariantLabel(vInfo.label || '');
      
      // If no label and it's the current ASIN, try to use currentStyleName
      if (!label && i === 0) {
        label = cleanVariantLabel(data.currentStyleName || '');
      }

      // If still no variant label, fallback to price (preferred) before ASIN
      if (!label) {
        label = cleanVariantLabel(vInfo.price || (i === 0 ? data.price : ''));
      }
      
      // Fallback to ASIN if still no label
      if (!label) {
        label = asin;
      }
      
      return {
        asin,
        label,                              // variant name (colour/size/style)
        sublabel: asin,                     // show ASIN as sublabel
        price: vInfo.price || (i === 0 ? data.price : ''),
        monthlySales: vInfo.monthlySales || (i === 0 ? data.monthlySales : ''),
        sponsored: false,
        badge: '',
        productName: data.productName,
        brandName: data.brandName,
      };
    });
  }

  if (hasPersistedSelection) {
    const availableAsins = new Set(allAsins.map(item => item.asin));
    selectedAsins = new Set((data.selectedAsins || []).filter(asin => availableAsins.has(asin)));
  } else {
    allAsins.forEach(item => selectedAsins.add(item.asin));
  }

  renderAsinList();
  
  // Update highlights on search page
  if (pageData?.pageType === 'search') {
    updateSearchPageHighlights();
  } else if (data.pageType === 'product') {
    prefetchVariantMonthlySales(data.domain);
  }
}

function renderAsinList() {
  const listEl = document.getElementById('asin-list');
  listEl.innerHTML = '';

  allAsins.forEach(item => {
    const isSelected = selectedAsins.has(item.asin);
    const row = document.createElement('div');
    row.className = 'asin-row' + (isSelected ? ' selected' : '');
    row.dataset.asin = item.asin;

    // Sales: strip "bought in past month" for compact display
    const salesShort = item.monthlySales
      ? item.monthlySales.replace(/\s*bought in past month/i, '').trim()
      : '';

    row.innerHTML = `
      <div class="chk"></div>
      <span class="asin-label">${escapeHtml(item.label || item.asin)}</span>
      <span class="asin-sub">${escapeHtml(item.sublabel || '')}</span>
      ${salesShort ? `<span class="asin-sales">${escapeHtml(salesShort)}</span>` : ''}
      ${item.price && !salesShort ? `<span class="asin-price">${escapeHtml(item.price)}</span>` : ''}
      ${item.sponsored ? `<span class="asin-sponsored">AD</span>` : ''}
      ${item.badge && !item.sponsored ? `<span class="asin-badge-tag">${escapeHtml(item.badge.substring(0,12))}</span>` : ''}
    `;

    row.addEventListener('click', () => {
      toggleAsin(item.asin, row);
      updateSearchPageHighlights();
    });
    listEl.appendChild(row);
  });

  updateAsinCount();
}

// ─── SEARCH PAGE HIGHLIGHT INJECTION ─────────────────────────────────────────
async function injectHighlightCSS(tabId) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tabId },
      css: `
        .amazon-scraper-card {
          position: relative !important;
        }
        .amazon-scraper-select-btn {
          position: absolute !important;
          top: 8px !important;
          right: 8px !important;
          width: 22px !important;
          height: 22px !important;
          border-radius: 999px !important;
          border: 1.5px solid rgba(255, 255, 255, 0.75) !important;
          background: rgba(17, 18, 20, 0.82) !important;
          color: transparent !important;
          cursor: pointer !important;
          z-index: 4 !important;
          font-size: 13px !important;
          font-weight: 700 !important;
          line-height: 1 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          transition: all .14s ease !important;
        }
        .amazon-scraper-select-btn:hover {
          border-color: #f5a623 !important;
          background: rgba(17, 18, 20, 0.94) !important;
        }
        .amazon-scraper-selected {
          position: relative !important;
          box-shadow: inset 0 0 0 3px #f5a623, 0 0 0 2px rgba(245, 166, 35, 0.26) !important;
          border-radius: 4px !important;
        }
        .amazon-scraper-selected .amazon-scraper-select-btn {
          border-color: #f5a623 !important;
          background: #f5a623 !important;
          color: #111214 !important;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35) !important;
        }
      `
    });
  } catch (err) {
    console.error('Failed to inject CSS:', err);
  }
}

async function updateSearchPageHighlights() {
  if (!currentTabId || pageData?.pageType !== 'search') return;
  
  try {
    await chrome.tabs.sendMessage(currentTabId, {
      action: 'highlightSelected',
      selectedAsins: Array.from(selectedAsins)
    });
  } catch (err) {
    console.error('Failed to update highlights:', err);
  }
}

async function prefetchVariantMonthlySales(domain) {
  const token = ++variantSalesFetchToken;
  const variantAsins = allAsins.map(item => item.asin).filter(Boolean);
  if (variantAsins.length <= 1 || !domain) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'fetchVariantMonthlySales',
      asins: variantAsins,
      domain
    });

    if (!response?.success || token !== variantSalesFetchToken) return;

    const salesMap = response.salesMap || {};
    let changed = false;

    allAsins = allAsins.map(item => {
      const sales = salesMap[item.asin] || '';
      if (sales && sales !== item.monthlySales) {
        changed = true;
        return { ...item, monthlySales: sales };
      }
      return item;
    });

    if (changed) renderAsinList();
  } catch (err) {
    console.error('Failed to prefetch variant monthly sales:', err);
  }
}

// ─── CHIP PANEL ───────────────────────────────────────────────────────────────
function renderChipPanel() {
  const panel = document.getElementById('chip-panel');
  if (!panel) return;
  // Only show chip panel on search page
  if (pageData?.pageType !== 'search') {
    panel.classList.remove('visible');
    return;
  }

  panel.innerHTML = '';

  if (selectedAsins.size === 0) {
    panel.classList.remove('visible');
    return;
  }

  panel.classList.add('visible');

  selectedAsins.forEach(asin => {
    const item = allAsins.find(a => a.asin === asin);
    const label = item ? (item.label || asin) : asin;
    const displayLabel = label.length > 40 ? label.substring(0, 40) + '...' : label;

    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.title = `${label} - Click to deselect`;
    chip.innerHTML = `<span class="chip-label">${escapeHtml(displayLabel)}</span><span class="chip-x">✕</span>`;

    chip.addEventListener('click', () => {
      selectedAsins.delete(asin);
      // Also uncheck in list
      const row = document.querySelector(`.asin-row[data-asin="${asin}"]`);
      if (row) row.classList.remove('selected');
      renderChipPanel();
      updateAsinCount();
      updateSearchPageHighlights();
    });

    panel.appendChild(chip);
  });
}

function toggleAsin(asin, row) {
  if (selectedAsins.has(asin)) {
    selectedAsins.delete(asin);
    row.classList.remove('selected');
  } else {
    selectedAsins.add(asin);
    row.classList.add('selected');
  }
  updateAsinCount();
}

function updateAsinCount() {
  document.getElementById('asin-count').textContent = `${selectedAsins.size}/${allAsins.length} selected`;
}

function syncAsinRowSelectionUI() {
  const rows = document.querySelectorAll('.asin-row[data-asin]');
  rows.forEach(row => {
    const asin = row.dataset.asin;
    row.classList.toggle('selected', selectedAsins.has(asin));
  });
  updateAsinCount();
}

// ─── EVENT LISTENERS ─────────────────────────────────────────────────────────
function setupEventListeners() {
  document.getElementById('additional-toggle').addEventListener('click', () => {
    const fields = document.getElementById('additional-fields');
    const arrow = document.getElementById('toggle-arrow');
    fields.classList.toggle('open');
    arrow.classList.toggle('open');
  });

  document.getElementById('btn-additional-select-all').addEventListener('click', () => {
    setAdditionalFieldsSelection(true);
  });

  document.getElementById('btn-additional-deselect-all').addEventListener('click', () => {
    setAdditionalFieldsSelection(false);
  });

  document.getElementById('btn-select-all').addEventListener('click', () => {
    allAsins.forEach(item => selectedAsins.add(item.asin));
    renderAsinList();
    updateSearchPageHighlights();
  });

  document.getElementById('btn-deselect-all').addEventListener('click', () => {
    selectedAsins.clear();
    renderAsinList();
    updateSearchPageHighlights();
  });

  document.getElementById('btn-sales-only').addEventListener('click', () => {
    applyMonthlySalesOnlyFilter();
  });

  document.getElementById('btn-run').addEventListener('click', runScrape);
  document.getElementById('btn-cancel').addEventListener('click', cancelScrape);
  document.getElementById('btn-rescan').addEventListener('click', () => {
    initPage();
  });

  document.getElementById('btn-copy-csv').addEventListener('click', copyCSV);
  document.getElementById('btn-download-excel').addEventListener('click', downloadExcel);
  document.getElementById('btn-download-csv').addEventListener('click', downloadCSV);
  document.getElementById('btn-back').addEventListener('click', () => {
    showState('state-configure');
  });
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  document.getElementById('btn-minimize').addEventListener('click', toggleMinimize);
  document.getElementById('btn-close').addEventListener('click', () => window.close());

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.action !== 'searchSelectionChanged' || pageData?.pageType !== 'search') return;

    const availableAsins = new Set(allAsins.map(item => item.asin));
    selectedAsins = new Set((message.selectedAsins || []).filter(asin => availableAsins.has(asin)));
    syncAsinRowSelectionUI();
    sendResponse?.({ success: true });
  });
}

function setAdditionalFieldsSelection(selectAll) {
  ADDITIONAL_FIELDS.forEach(field => {
    const shouldSelect = !!selectAll;
    if (shouldSelect) selectedFields.add(field.id);
    else selectedFields.delete(field.id);

    const fieldEl = document.querySelector(`.field-item[data-field-id="${field.id}"]`);
    if (fieldEl) fieldEl.classList.toggle('checked', shouldSelect);
  });
}

function applyMonthlySalesOnlyFilter() {
  if (pageData?.pageType !== 'search') return;

  selectedAsins.clear();
  allAsins.forEach(item => {
    if (String(item.monthlySales || '').trim()) {
      selectedAsins.add(item.asin);
    }
  });

  renderAsinList();
  updateSearchPageHighlights();
  showToast(`Selected ${selectedAsins.size} with monthly sales`);
}

function toggleMinimize() {
  isMinimized = !isMinimized;
  document.body.classList.toggle('minimized', isMinimized);
  const btn = document.getElementById('btn-minimize');
  if (btn) {
    btn.textContent = isMinimized ? '▢' : '—';
    btn.title = isMinimized ? 'Restore' : 'Minimize';
  }
}

// ─── RUN SCRAPE ──────────────────────────────────────────────────────────────
async function runScrape() {
  if (isScraping) return;
  if (selectedAsins.size === 0) {
    showToast('Please select at least one product', true);
    return;
  }

  const fields = Array.from(selectedFields);
  const asins = Array.from(selectedAsins);
  const variantLabelMap = pageData?.pageType === 'product'
    ? Object.fromEntries(
        allAsins
          .filter(item => item?.asin)
          .map(item => [item.asin, item.label || ''])
      )
    : null;

  isScraping = true;
  setScrapingUI(true, asins.length);

  const tab = await getActiveTab();

  try {
    chrome.runtime.sendMessage({
      action: 'deepScrapeASINs',
      asins,
      fields,
      domain: pageData.domain,
      sourceTabId: tab.id,
      variantLabelMap
    });

    startProgressPolling(asins.length, fields);

  } catch (err) {
    showToast('Scraping failed: ' + err.message, true);
    isScraping = false;
    setScrapingUI(false, 0);
  }
}

async function cancelScrape() {
  chrome.runtime.sendMessage({ action: 'cancelScrape' });
  stopProgressPolling();
  isScraping = false;
  setScrapingUI(false, 0);
  showToast('Scraping cancelled');
}

function startProgressPolling(total, fields) {
  let lastCompleted = -1;

  progressTimer = setInterval(async () => {
    const data = await new Promise(resolve => {
      chrome.storage.local.get('scrapeProgress', result => {
        resolve(result.scrapeProgress || null);
      });
    });

    if (!data) return;

    const pct = total > 0 ? (data.completed / total) * 100 : 0;
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-count').textContent = `${data.completed} / ${data.total}`;
    document.getElementById('progress-label').textContent =
      data.active ? `Scraping… (${data.completed}/${data.total})` : 'Complete!';

    if (!data.active && data.completed > lastCompleted) {
      lastCompleted = data.completed;
      stopProgressPolling();
      isScraping = false;
      setScrapingUI(false, 0);

      if (data.results && data.results.length > 0) {
        showResults(data.results, fields);
      }
    }
  }, 600);
}

function stopProgressPolling() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

// ─── RESULTS ─────────────────────────────────────────────────────────────────
function showResults(results, fields) {
  lastResults = { results, fields };

  // Build column headers
  // BSR needs special handling — collect all BSR category keys
  const variantKeys = new Set();

  if (fields.includes('variants')) {
    results.forEach(r => {
      if (r.variants && typeof r.variants === 'object') {
        Object.keys(r.variants).forEach(k => variantKeys.add(k));
      }
    });
  }

  const columns = buildColumns(fields, variantKeys);

  // Render thead
  const thead = document.getElementById('results-thead');
  thead.innerHTML = `<tr>${columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr>`;

  // Render tbody
  const tbody = document.getElementById('results-tbody');
  tbody.innerHTML = '';

  results.forEach(row => {
    const tr = document.createElement('tr');
    columns.forEach(col => {
      const td = document.createElement('td');
      let val = getCellValue(row, col);

      if (row.error && col.key === 'productName') val = `Error: ${row.error}`;

      td.textContent = val;
      td.title = val;
      if (col.key === 'asin') td.className = 'asin';
      else if (col.key === 'monthlySales') td.className = 'sales';
      else if (col.key === 'productName' || col.key === 'brandName') td.className = 'text';
      if (row.error) td.className = 'error';

      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  const errors = results.filter(r => r.error).length;
  document.getElementById('results-meta').textContent =
    `${results.length} products${errors > 0 ? ` · ${errors} errors` : ''}`;

  showState('state-results');
}

function buildColumns(fields, variantKeys) {
  const cols = [];
  const fieldOrder = ['asin','productName','brandName','price','monthlySales','bsr','ratings','reviews','pieces','weight','dimensions','variants','releaseDate','scrapedAt'];

  fieldOrder.forEach(fid => {
    if (!fields.includes(fid)) return;

    if (fid === 'bsr') {
      cols.push({ key: 'bsr', label: 'Best Sellers Rank', type: 'bsr' });
    } else if (fid === 'variants') {
      cols.push({ key: 'variants', label: 'Variants', type: 'text' });
    } else {
      const fieldDef = [...DEFAULT_FIELDS, ...ADDITIONAL_FIELDS].find(f => f.id === fid);
      cols.push({ key: fid, label: fieldDef ? fieldDef.label : fid, type: 'text' });
    }
  });

  return cols;
}

// ─── CSV/EXCEL EXPORT ────────────────────────────────────────────────────────
function getCellValue(row, col) {
  if (col.type === 'bsr' || col.key === 'bsr') {
    return formatBsrValue(row.bsr);
  }

  if (col.type === 'variant') {
    return formatVariantValue(row.variants && row.variants[col.key]);
  }

  if (col.key === 'variants') {
    return formatVariantSummary(row.variants);
  }

  return formatGenericValue(row[col.key]);
}

function formatBsrValue(value) {
  if (!value) return 'Not Available';
  if (typeof value === 'string') {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned || 'Not Available';
  }
  if (typeof value === 'object') {
    const parts = Object.entries(value)
      .map(([category, rank]) => `${rank} in ${category}`.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Not Available';
  }
  return 'Not Available';
}

function formatVariantSummary(value) {
  if (!value) return 'Not Available';
  if (typeof value === 'string') {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned || 'Not Available';
  }
  if (typeof value === 'object') {
    const parts = Object.entries(value)
      .map(([key, val]) => `${key}: ${String(val || '').trim()}`)
      .filter(entry => entry && !entry.endsWith(':'));
    return parts.length > 0 ? parts.join(', ') : 'Not Available';
  }
  return 'Not Available';
}

function formatVariantValue(value) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  return cleaned || 'Not Available';
}

function formatGenericValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  return String(value);
}

function copyCSV() {
  const csvData = generateCSV();
  if (!csvData) return;
  
  navigator.clipboard.writeText(csvData).then(() => {
    showToast(`CSV copied! (${lastResults.results.length} rows)`);
  });
}

function downloadCSV() {
  const csvData = generateCSV();
  if (!csvData) return;
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const filename = `amazon-scraper-${timestamp}.csv`;
  
  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast(`CSV downloaded: ${filename}`);
}

function downloadExcel() {
  if (!lastResults) return;
  
  try {
    const { results, fields } = lastResults;
    const variantKeys = new Set();
    
    if (fields.includes('variants')) {
      results.forEach(r => {
        if (r.variants && typeof r.variants === 'object') {
          Object.keys(r.variants).forEach(k => variantKeys.add(k));
        }
      });
    }

    const columns = buildColumns(fields, variantKeys);
    
    // Build Excel XML content
    let xmlContent = '<?xml version="1.0"?>\n';
    xmlContent += '<?mso-application progid="Excel.Sheet"?>\n';
    xmlContent += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
    xmlContent += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
    xmlContent += '<Worksheet ss:Name="Amazon Products">\n';
    xmlContent += '<Table>\n';
    
    // Header row
    xmlContent += '<Row>\n';
    columns.forEach(col => {
      xmlContent += `<Cell><Data ss:Type="String">${escapeXml(col.label)}</Data></Cell>\n`;
    });
    xmlContent += '</Row>\n';
    
    // Data rows
    results.forEach(row => {
      xmlContent += '<Row>\n';
      columns.forEach(col => {
        let val = getCellValue(row, col);
        
        xmlContent += `<Cell><Data ss:Type="String">${escapeXml(String(val))}</Data></Cell>\n`;
      });
      xmlContent += '</Row>\n';
    });
    
    xmlContent += '</Table>\n';
    xmlContent += '</Worksheet>\n';
    xmlContent += '</Workbook>';
    
    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `amazon-scraper-${timestamp}.xls`;
    
    // Create blob and download
    const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast(`Excel downloaded: ${filename}`);
  } catch (err) {
    console.error('Excel download error:', err);
    showToast(`Excel download failed: ${err.message}`, true);
  }
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateCSV() {
  if (!lastResults) return null;
  
  const { results, fields } = lastResults;
  const variantKeys = new Set();
  
  if (fields.includes('variants')) {
    results.forEach(r => {
      if (r.variants && typeof r.variants === 'object') {
        Object.keys(r.variants).forEach(k => variantKeys.add(k));
      }
    });
  }

  const columns = buildColumns(fields, variantKeys);

  const rows = [columns.map(c => csvEscape(c.label)).join(',')];

  results.forEach(row => {
    const cells = columns.map(col => {
      let val = getCellValue(row, col);
      return csvEscape(val);
    });
    rows.push(cells.join(','));
  });

  return rows.join('\n');
}

function csvEscape(val) {
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function setScrapingUI(scraping, total) {
  const runBtn = document.getElementById('btn-run');
  const cancelBtn = document.getElementById('btn-cancel');
  const rescanBtn = document.getElementById('btn-rescan');
  const progressWrap = document.getElementById('progress-wrap');

  runBtn.disabled = scraping;
  runBtn.textContent = scraping ? '⏳ Scraping…' : '⚡ Extract Data';
  cancelBtn.style.display = scraping ? 'flex' : 'none';
  rescanBtn.style.display = scraping ? 'none' : 'flex';
  progressWrap.classList.toggle('active', scraping && total > 1);

  if (scraping) {
    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('progress-count').textContent = `0 / ${total}`;
    document.getElementById('progress-label').textContent = 'Starting scrape…';
  }
}

function updatePageBadge(type) {
  const badge = document.getElementById('page-badge');
  badge.textContent = type === 'search' ? 'Search' : 'Product';
  badge.className = 'page-badge ' + type;
}

function showState(id) {
  document.querySelectorAll('.state').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = isError ? 'var(--red)' : 'var(--green)';
  el.style.color = isError ? '#fff' : '#000';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function getActiveTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0]));
  });
}

function isAmazonTab(url) {
  if (!url) return false;
  return /amazon\.(co\.uk|com|de|fr|es|it|ca|com\.au)/.test(url);
}

function sendMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function cleanVariantLabel(label) {
  let cleaned = String(label || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/[.#][\w-]+(?:\s+[.#][\w-]+)+/g, ' ')
    .replace(/temporarily\s+out\s+of\s+stock[:\s-]*/gi, ' ')
    .replace(/currently\s+unavailable[:\s-]*/gi, ' ')
    .replace(/click\s+to\s+select[:\s-]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^(select|choose|options|n\/a|-)\b/i.test(cleaned)) return '';
  if (/^[.#]/.test(cleaned)) return '';
  if (/centralized|apexprice|price\s*to\s*pay|a-offscreen|desktop/i.test(cleaned)) {
    cleaned = '';
  }
  if (!cleaned) return '';
  return cleaned;
}
