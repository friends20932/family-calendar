// ============================================================
// todos.js — Todo list logic
// ============================================================

const TODO_STORAGE_KEY = 'family_calendar_todos';

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

export function deleteTodo(id) {
  const todos = loadTodos().filter(t => t.id !== id);
  saveTodos(todos);
}

export function clearDoneTodos() {
  saveTodos(loadTodos().filter(t => !t.done));
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
