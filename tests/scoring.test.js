import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state.js to avoid Supabase client initialization
vi.mock('../js/state.js', () => ({
  S: {
    plan: {
      meals: [
        {
          name: 'Breakfast',
          items: [
            { name: 'Oatmeal', qty: 50, unit: 'g', calories: 180, protein: 6, carbs: 27, fat: 4 },
            { name: 'Banana', qty: 1, unit: 'medium', calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
          ]
        },
        {
          name: 'Lunch',
          items: [
            { name: 'Chicken', qty: 150, unit: 'g', calories: 165, protein: 35, carbs: 0, fat: 5 },
          ]
        }
      ],
      workout: { type: 'split', days: [{ name: 'Push', exercises: [{ name: 'Bench' }] }] }
    },
    settings: { stepTarget: 10000 }
  },
  sb: {}
}));

import { calcScore, consumedMacros, planTargets, parsePlanText, hasDayData, validatePlan } from '../js/scoring.js';

describe('planTargets', () => {
  it('sums macros from all meals', () => {
    const t = planTargets();
    expect(t.calories).toBe(180 + 105 + 165);
    expect(t.protein).toBe(6 + 1.3 + 35);
    expect(t.carbs).toBe(27 + 27 + 0);
    expect(t.fat).toBe(4 + 0.4 + 5);
  });
});

describe('consumedMacros', () => {
  it('returns zero for empty log', () => {
    const result = consumedMacros({ items: {}, extras: [] });
    expect(result.calories).toBe(0);
    expect(result.protein).toBe(0);
  });

  it('calculates ratio-based macros for checked items', () => {
    const log = {
      items: {
        '0_0': { checked: true, actualQty: 50 }, // Full portion of Oatmeal
      },
      extras: []
    };
    const result = consumedMacros(log);
    expect(result.calories).toBe(180);
    expect(result.protein).toBe(6);
  });

  it('calculates half portion correctly', () => {
    const log = {
      items: {
        '0_0': { checked: true, actualQty: 25 }, // Half portion of Oatmeal (50g plan)
      },
      extras: []
    };
    const result = consumedMacros(log);
    expect(result.calories).toBe(90);
    expect(result.protein).toBe(3);
  });

  it('adds extras to consumed', () => {
    const log = {
      items: {},
      extras: [{ calories: 200, protein: 10, carbs: 20, fat: 8 }]
    };
    const result = consumedMacros(log);
    expect(result.calories).toBe(200);
    expect(result.protein).toBe(10);
  });
});

describe('calcScore', () => {
  it('returns null when no data', () => {
    expect(calcScore({})).toBe(null);
    expect(calcScore({ steps: 0, sleep: 0, resistanceTraining: false })).toBe(null);
  });

  it('returns gold for perfect day', () => {
    const log = {
      items: {
        '0_0': { checked: true, actualQty: 50 },
        '0_1': { checked: true, actualQty: 1 },
        '1_0': { checked: true, actualQty: 150 },
      },
      extras: [],
      steps: 12000,
      resistanceTraining: false,
      sleep: 8,
      water: 8
    };
    const score = calcScore(log);
    expect(score).not.toBe(null);
    expect(score.combined).toBe('gold');
  });

  it('returns fail for bad day', () => {
    const log = {
      items: {},
      extras: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      steps: 1000,
      resistanceTraining: false,
      sleep: 0,
      water: 0
    };
    const score = calcScore(log);
    expect(score).not.toBe(null);
    expect(score.combined).toBe('fail');
  });
});

describe('parsePlanText', () => {
  it('parses meal text format', () => {
    const text = 'Breakfast\nOatmeal, 50g, 180cal, 6p, 27c, 4f\n\nLunch\nChicken, 150g, 165cal, 35p, 0c, 5f';
    const result = parsePlanText(text);
    expect(result.meals.length).toBe(2);
    expect(result.meals[0].name).toBe('Breakfast');
    expect(result.meals[0].items[0].name).toBe('Oatmeal');
    expect(result.meals[0].items[0].calories).toBe(180);
    expect(result.meals[1].items[0].protein).toBe(35);
  });

  it('handles empty text', () => {
    const result = parsePlanText('');
    expect(result.meals.length).toBe(0);
  });
});

describe('hasDayData', () => {
  it('returns false for null/empty log', () => {
    expect(hasDayData(null)).toBe(false);
    expect(hasDayData({})).toBe(false);
    expect(hasDayData({ steps: 0, sleep: 0 })).toBe(false);
  });

  it('returns true when steps > 0', () => {
    expect(hasDayData({ steps: 100 })).toBe(true);
  });

  it('returns true when has checked items', () => {
    expect(hasDayData({ items: { '0_0': { checked: true } } })).toBe(true);
  });

  it('returns true when has extras', () => {
    expect(hasDayData({ extras: [{ name: 'snack' }] })).toBe(true);
  });

  it('returns true when resistance training on', () => {
    expect(hasDayData({ resistanceTraining: true })).toBe(true);
  });
});

describe('validatePlan', () => {
  it('returns empty errors for valid plan', () => {
    const plan = {
      meals: [{ name: 'Breakfast', items: [{ name: 'Egg', qty: 2, unit: 'pcs', calories: 150, protein: 12, carbs: 1, fat: 10 }] }],
      workout: { type: 'split', days: [] }
    };
    const errors = validatePlan(plan);
    expect(errors.length).toBe(0);
  });

  it('sanitizes numeric fields', () => {
    const plan = {
      meals: [{ name: 'M', items: [{ name: 'F', qty: -5, unit: 'g', calories: 'abc', protein: 999999, carbs: 0, fat: 0 }] }]
    };
    validatePlan(plan);
    expect(plan.meals[0].items[0].qty).toBe(0);
    expect(plan.meals[0].items[0].calories).toBe(0);
    expect(plan.meals[0].items[0].protein).toBe(9999);
  });

  it('handles null plan', () => {
    const errors = validatePlan(null);
    expect(errors.length).toBeGreaterThan(0);
  });
});
