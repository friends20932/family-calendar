// ============================================================
// members.js — Family member management
// ============================================================

const MEMBERS_KEY = 'family_calendar_members';

const DEFAULT_MEMBERS = [
  { id: 'member-1', name: '爸爸', color: '#818cf8', emoji: '👨' },
  { id: 'member-2', name: '媽媽', color: '#f472b6', emoji: '👩' },
  { id: 'member-3', name: '孩子', color: '#34d399', emoji: '🧒' },
];

export function loadMembers() {
  try {
    const stored = JSON.parse(localStorage.getItem(MEMBERS_KEY));
    return stored && stored.length ? stored : DEFAULT_MEMBERS;
  } catch {
    return DEFAULT_MEMBERS;
  }
}

export function saveMembers(members) {
  localStorage.setItem(MEMBERS_KEY, JSON.stringify(members));
}

export function addMember(data) {
  const members = loadMembers();
  const newMember = {
    id: crypto.randomUUID(),
    name: data.name,
    color: data.color || randomColor(),
    emoji: data.emoji || '👤',
  };
  members.push(newMember);
  saveMembers(members);
  return newMember;
}

export function updateMember(id, data) {
  const members = loadMembers();
  const idx = members.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  members[idx] = { ...members[idx], ...data, id };
  saveMembers(members);
  return members[idx];
}

export function deleteMember(id) {
  const members = loadMembers().filter((m) => m.id !== id);
  saveMembers(members);
}

export function getMemberById(id) {
  return loadMembers().find((m) => m.id === id) || null;
}

function randomColor() {
  const colors = [
    '#818cf8', '#f472b6', '#34d399', '#fb923c',
    '#60a5fa', '#a78bfa', '#f87171', '#facc15',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
