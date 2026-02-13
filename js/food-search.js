import { escH } from './helpers.js';

// ============================================================
// FOOD SEARCH — OpenFoodFacts API
// ============================================================

const API_BASE = 'https://world.openfoodfacts.org/cgi/search.pl';

/**
 * Search the OpenFoodFacts API.
 * @param {string} query 
 * @returns {Promise<Array>} Array of product objects
 */
export async function searchFood(query) {
    if (!query || query.length < 2) return [];
    try {
        const url = `${API_BASE}?search_terms=${encodeURIComponent(query)}&json=1&page_size=10&fields=product_name,nutriments,serving_size`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('API error');
        const data = await resp.json();
        const products = (data.products || []).filter(p => p.product_name);

        return products.map(p => {
            const n = p.nutriments || {};
            return {
                name: p.product_name,
                calories: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
                protein: Math.round((n.proteins_100g || 0) * 10) / 10,
                carbs: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
                fat: Math.round((n.fat_100g || 0) * 10) / 10,
                qty: 100,
                unit: 'g' // OpenFoodFacts standardizes on 100g
            };
        });
    } catch (err) {
        console.warn('Food search error:', err);
        return [];
    }
}

// Legacy modal search (keeping for now, but internals use searchFood)
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
    let debounceTimer = null;

    input.focus();

    // Close
    const close = () => overlay.remove();
    document.getElementById('fs-close').onclick = close;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
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
        debounceTimer = setTimeout(async () => {
            const items = await searchFood(query);
            if (items.length === 0) {
                results.innerHTML = '<div class="fs-hint">No results found</div>';
                return;
            }
            renderResults(items, results, onSelect, close);
        }, 400);
    });
}

function renderResults(items, container, onSelect, closeFn) {
    let html = '';
    items.forEach((item, i) => {
        html += `<div class="fs-item" data-idx="${i}">
        <div class="fs-item-name">${escH(item.name)}</div>
        <div class="fs-item-macros">
          <span class="mc-cal">${item.calories}cal</span>
          <span class="mc-pro">${item.protein}p</span>
          <span class="mc-carb">${item.carbs}c</span>
          <span class="mc-fat">${item.fat}f</span>
          <span class="fs-per">per 100g</span>
        </div>
      </div>`;
    });
    container.innerHTML = html;
    container.querySelectorAll('.fs-item').forEach(el => {
        el.onclick = () => {
            onSelect(items[+el.dataset.idx]);
            closeFn();
        };
    });
}
