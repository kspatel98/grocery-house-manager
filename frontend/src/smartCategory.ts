import type { Section } from './types';

export function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const CATEGORY_RULES: Array<{ targets: string[]; keywords: string[]; icon: string; unit?: string }> = [
  { targets: ['dairy'], icon: '🥛', unit: 'pcs', keywords: ['milk', 'cheese', 'paneer', 'yogurt', 'yoghurt', 'cream', 'butter', 'egg', 'eggs', 'sour cream', 'cottage cheese'] },
  { targets: ['fruits', 'fruit', 'produce'], icon: '🍎', unit: 'pcs', keywords: ['banana', 'apple', 'orange', 'grape', 'berry', 'berries', 'mango', 'pear', 'peach', 'melon', 'kiwi', 'avocado', 'pineapple'] },
  { targets: ['vegetables', 'vegetable', 'produce'], icon: '🥦', unit: 'pcs', keywords: ['tomato', 'onion', 'potato', 'lettuce', 'spinach', 'pepper', 'carrot', 'cucumber', 'broccoli', 'cauliflower', 'cilantro', 'coriander'] },
  { targets: ['meat', 'seafood', 'deli'], icon: '🥩', unit: 'kg', keywords: ['chicken', 'beef', 'pork', 'fish', 'salmon', 'turkey', 'shrimp', 'meat', 'ham', 'sausage'] },
  { targets: ['bakery', 'bread'], icon: '🍞', unit: 'pcs', keywords: ['bread', 'bun', 'bagel', 'naan', 'tortilla', 'cake', 'muffin', 'croissant'] },
  { targets: ['pantry', 'dry goods', 'grocery'], icon: '🥫', unit: 'pcs', keywords: ['rice', 'flour', 'sugar', 'oil', 'pasta', 'beans', 'lentil', 'cereal', 'sauce', 'spice', 'salt', 'pepper', 'can', 'noodle'] },
  { targets: ['snacks'], icon: '🍿', unit: 'pack', keywords: ['chips', 'cookie', 'cookies', 'snack', 'chocolate', 'candy', 'cracker', 'popcorn'] },
  { targets: ['frozen'], icon: '🧊', unit: 'pack', keywords: ['frozen', 'ice cream', 'fries', 'pizza', 'nuggets'] },
  { targets: ['beverages', 'drinks', 'drink'], icon: '🧃', unit: 'bottle', keywords: ['juice', 'pop', 'soda', 'water', 'coffee', 'tea', 'drink', 'beverage', 'coke', 'pepsi'] },
  { targets: ['household', 'cleaning'], icon: '🧽', unit: 'pcs', keywords: ['soap', 'detergent', 'tissue', 'paper towel', 'toilet paper', 'cleaner', 'bag', 'foil', 'dish', 'laundry', 'garbage'] },
  { targets: ['personal care', 'toiletries', 'health'], icon: '🧴', unit: 'pcs', keywords: ['shampoo', 'toothpaste', 'toothbrush', 'deodorant', 'lotion', 'body wash', 'conditioner', 'razor'] },
  { targets: ['baby'], icon: '🍼', unit: 'pcs', keywords: ['baby', 'diaper', 'diapers', 'wipes', 'formula'] },
  { targets: ['pets', 'pet'], icon: '🐾', unit: 'pcs', keywords: ['dog food', 'cat food', 'pet', 'litter', 'treats'] },
];

export function smartSectionId(name: string, sections: Section[], hints: Array<string | null | undefined> = []): number | '' {
  const text = normalizeText([name, ...hints.filter(Boolean)].join(' '));
  if (!text) return sections[0]?.id || '';

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => text.includes(normalizeText(keyword)))) {
      const match = sections.find((section) => {
        const sectionName = normalizeText(section.name);
        return rule.targets.some((target) => sectionName.includes(normalizeText(target)) || normalizeText(target).includes(sectionName));
      });
      if (match) return match.id;
    }
  }

  for (const hint of hints) {
    const cleanHint = normalizeText(String(hint || ''));
    if (!cleanHint) continue;
    const direct = sections.find((section) => cleanHint.includes(normalizeText(section.name)) || normalizeText(section.name).includes(cleanHint));
    if (direct) return direct.id;
  }

  const pantry = sections.find((section) => normalizeText(section.name).includes('pantry'));
  return pantry?.id || sections[0]?.id || '';
}

export function smartProductIcon(name: string, fallback = '🛒', hints: Array<string | null | undefined> = []) {
  const text = normalizeText([name, ...hints.filter(Boolean)].join(' '));
  const match = CATEGORY_RULES.find((rule) => rule.keywords.some((keyword) => text.includes(normalizeText(keyword))));
  return match?.icon || fallback;
}

export function smartProductUnit(name: string, fallback = 'pcs', hints: Array<string | null | undefined> = []) {
  const text = normalizeText([name, ...hints.filter(Boolean)].join(' '));
  const match = CATEGORY_RULES.find((rule) => rule.keywords.some((keyword) => text.includes(normalizeText(keyword))));
  return match?.unit || fallback;
}
