// ============================================================
// todos.js — Todo list logic
// ============================================================

const TODO_STORAGE_KEY = 'family_calendar_todos';
// IDs that were explicitly deleted locally — used to prevent pull from restoring them
const TODO_DELETED_IDS_KEY = 'family_calendar_todos_deleted';

const PRIORITY_CONFIG = {
  high:   { label: '高', color: '#d97373', bg: '#fef2f2', border: '#fecaca' },
  medium: { label: '中', color: '#d9ab55', bg: '#fffbeb', border: '#fde68a' },
  low:    { label: '低', color: '#678b7b', bg: '#f0fdf4', border: '#bbf7d0' },
};

export function loadTodos() {
  try {
    return JSON.parse(localStorage.getItem(TODO_STORAGE_KEY)) || [];
  } catch { return []; }
}

export function saveTodos(todos) {
  localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos));
}

export function addTodo({ text, priority = 'medium', category = '' }) {
  const todos = loadTodos();
  const todo = {
    id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text,
    priority,
    category,
    done: false,
    createdAt: new Date().toISOString(),
  };
  todos.push(todo);
  saveTodos(todos);
  return todo;
}

export function toggleTodo(id) {
  const todos = loadTodos();
  const todo = todos.find(t => t.id === id);
  if (todo) { todo.done = !todo.done; saveTodos(todos); }
  return todo;
}

/** 取得本機已明確刪除的 Todo ID 黑名單 */
export function loadDeletedTodoIds() {
  try {
    return JSON.parse(localStorage.getItem(TODO_DELETED_IDS_KEY)) || [];
  } catch { return []; }
}

/** 將 ID 加入黑名單，避免 pull 時被遠端覆蓋回來 */
function markAsDeleted(ids) {
  const existing = new Set(loadDeletedTodoIds());
  ids.forEach(id => existing.add(id));
  // 只保留最近 500 筆，避免無限增長
  const trimmed = [...existing].slice(-500);
  localStorage.setItem(TODO_DELETED_IDS_KEY, JSON.stringify(trimmed));
}

export function deleteTodo(id) {
  markAsDeleted([id]);
  const todos = loadTodos().filter(t => t.id !== id);
  saveTodos(todos);
}

export function clearDoneTodos() {
  const all = loadTodos();
  const doneIds = all.filter(t => t.done).map(t => t.id);
  markAsDeleted(doneIds);
  saveTodos(all.filter(t => !t.done));
}

export function updateTodo(id, changes) {
  const todos = loadTodos();
  const idx = todos.findIndex(t => t.id === id);
  if (idx !== -1) {
    todos[idx] = { ...todos[idx], ...changes };
    saveTodos(todos);
    return todos[idx];
  }
  return null;
}

export { PRIORITY_CONFIG };
