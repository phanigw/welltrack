import { searchFood } from './food-search.js';
import { escH } from './helpers.js';

let currentDropdown = null;

function closeDropdown() {
    if (currentDropdown) {
        currentDropdown.remove();
        currentDropdown = null;
    }
}

// Close on outside click
document.addEventListener('click', (e) => {
    if (!currentDropdown) return;
    if (!currentDropdown.contains(e.target) && e.target !== currentDropdown._input) {
        closeDropdown();
    }
});

export function attachAutocomplete(input, onSelect) {
    let debounceTimer = null;

    input.addEventListener('input', () => {
        const query = input.value.trim();
        clearTimeout(debounceTimer);

        if (query.length < 2) {
            closeDropdown();
            return;
        }

        debounceTimer = setTimeout(async () => {
            // If input is no longer focused, don't show info
            if (document.activeElement !== input) return;

            const results = await searchFood(query);

            // Should we show results?
            if (results.length === 0) {
                closeDropdown();
                return;
            }

            // Create or reuse dropdown
            if (!currentDropdown) {
                currentDropdown = document.createElement('div');
                currentDropdown.className = 'autocomplete-dropdown';
                document.body.appendChild(currentDropdown);
            }

            // Link input
            currentDropdown._input = input;

            // Position
            const rect = input.getBoundingClientRect();
            // Handle window scroll
            const top = rect.bottom + window.scrollY;
            const left = rect.left + window.scrollX;
            const width = rect.width;

            // Check if it fits below, else move above? (Simple version: always below)
            currentDropdown.style.top = `${top}px`;
            currentDropdown.style.left = `${left}px`;
            currentDropdown.style.width = `${Math.max(width, 240)}px`;

            // Render content
            let html = '';
            results.forEach((item, i) => {
                html += `<div class="ac-item" data-idx="${i}">
                    <div class="ac-name">${escH(item.name)}</div>
                    <div class="ac-meta">${item.calories}cal • ${item.protein}p ${item.carbs}c ${item.fat}f / 100g</div>
                 </div>`;
            });
            currentDropdown.innerHTML = html;

            // Click handlers
            currentDropdown.querySelectorAll('.ac-item').forEach(el => {
                el.onmousedown = (e) => e.preventDefault(); // Prevent blur of input
                el.onclick = () => {
                    onSelect(results[+el.dataset.idx]);
                    closeDropdown();
                };
            });

        }, 400); // 400ms debounce
    });

    // Close on blur (delayed slightly to allow click)
    input.addEventListener('blur', () => {
        setTimeout(closeDropdown, 200);
    });

    // Close on keydown Escape
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDropdown();
    });
}
