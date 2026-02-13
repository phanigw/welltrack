import { escH } from './helpers.js';

// ============================================================
// FOOD SEARCH — OpenFoodFacts API
// ============================================================

const API_BASE = 'https://world.openfoodfacts.org/cgi/search.pl';
let debounceTimer = null;

export function openFoodSearch(onSelect) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'food-search-overlay';
    overlay.innerHTML = `
    <div class="food-search-modal">
      <div class="fs-header">
        <input type="text" id="fs-input" placeholder="Search foods..." autocomplete="off">
        <button class="btn btn-sm btn-secondary" id="fs-close">Cancel</button>
      </div>
      <div class="fs-results" id="fs-results">
        <div class="fs-hint">Type to search OpenFoodFacts database</div>
      </div>
    </div>`;
    document.body.appendChild(overlay);

    const input = document.getElementById('fs-input');
    const results = document.getElementById('fs-results');

    input.focus();

    // Close
    document.getElementById('fs-close').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    // Search with debounce
    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = input.value.trim();
        if (query.length < 2) {
            results.innerHTML = '<div class="fs-hint">Type at least 2 characters</div>';
            return;
        }
        results.innerHTML = '<div class="fs-hint">Searching...</div>';
        debounceTimer = setTimeout(() => doSearch(query, results, onSelect, overlay), 400);
    });
}

async function doSearch(query, resultsEl, onSelect, overlay) {
    try {
        const url = `${API_BASE}?search_terms=${encodeURIComponent(query)}&json=1&page_size=10&fields=product_name,nutriments,serving_size`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('API error');
        const data = await resp.json();
        const products = (data.products || []).filter(p => p.product_name);

        if (products.length === 0) {
            resultsEl.innerHTML = '<div class="fs-hint">No results found</div>';
            return;
        }

        let html = '';
        products.forEach((p, i) => {
            const n = p.nutriments || {};
            const cal = Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0);
            const pro = Math.round((n.proteins_100g || 0) * 10) / 10;
            const carbs = Math.round((n.carbohydrates_100g || 0) * 10) / 10;
            const fat = Math.round((n.fat_100g || 0) * 10) / 10;

            html += `<div class="fs-item" data-fs-idx="${i}">
        <div class="fs-item-name">${escH(p.product_name)}</div>
        <div class="fs-item-macros">
          <span class="mc-cal">${cal}cal</span>
          <span class="mc-pro">${pro}p</span>
          <span class="mc-carb">${carbs}c</span>
          <span class="mc-fat">${fat}f</span>
          <span class="fs-per">per 100g</span>
        </div>
      </div>`;
        });
        resultsEl.innerHTML = html;

        // Attach click handlers
        resultsEl.querySelectorAll('.fs-item').forEach(el => {
            el.onclick = () => {
                const idx = +el.dataset.fsIdx;
                const p = products[idx];
                const n = p.nutriments || {};
                onSelect({
                    name: p.product_name,
                    calories: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
                    protein: Math.round((n.proteins_100g || 0) * 10) / 10,
                    carbs: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
                    fat: Math.round((n.fat_100g || 0) * 10) / 10,
                    qty: 100,
                    unit: 'g'
                });
                overlay.remove();
            };
        });
    } catch (err) {
        console.error('Food search error:', err);
        resultsEl.innerHTML = '<div class="fs-hint">Search failed. Check connection.</div>';
    }
}
