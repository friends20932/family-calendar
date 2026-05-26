// ============================================================
// categories.js — Event category management
// ============================================================

const CATEGORIES_KEY = 'family_calendar_categories';

export const DEFAULT_CATEGORIES = [
  { id: 'family',   label: '家庭',  emoji: '🏠', color: '#6366f1' },
  { id: 'work',     label: '工作',  emoji: '💼', color: '#3b82f6' },
  { id: 'health',   label: '醫療',  emoji: '🏥', color: '#10b981' },
  { id: 'birthday', label: '生日',  emoji: '🎂', color: '#ec4899' },
  { id: 'travel',   label: '旅遊',  emoji: '✈️', color: '#f59e0b' },
  { id: 'school',   label: '學校',  emoji: '📚', color: '#8b5cf6' },
  { id: 'other',    label: '其他',  emoji: '📌', color: '#64748b' },
];

export function loadCategories() {
  try {
    const stored = JSON.parse(localStorage.getItem(CATEGORIES_KEY));
    return stored && stored.length ? stored : [...DEFAULT_CATEGORIES];
  } catch {
    return [...DEFAULT_CATEGORIES];
  }
}

export function saveCategories(cats) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats));
}

export function addCategory(data) {
  const cats = loadCategories();
  const newCat = {
    id: crypto.randomUUID(),
    label: data.label,
    emoji: data.emoji || '🏷️',
    color: data.color || '#6366f1',
  };
  cats.push(newCat);
  saveCategories(cats);
  return newCat;
}

export function updateCategory(id, data) {
  const cats = loadCategories();
  const idx = cats.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  cats[idx] = { ...cats[idx], ...data, id };
  saveCategories(cats);
  return cats[idx];
}

export function deleteCategory(id) {
  const cats = loadCategories().filter((c) => c.id !== id);
  saveCategories(cats);
}

export function getCategoryById(id) {
  return loadCategories().find((c) => c.id === id) || null;
}

export function getCategoryColor(id) {
  const cat = getCategoryById(id);
  return cat?.color || '#64748b';
}
