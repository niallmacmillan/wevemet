/* =====================================================================
 * Store — all persistence for Faces & Names.
 *
 * Data shape (localStorage key "facesnames.v1"):
 * {
 *   activeEventId: string,
 *   events:  [{ id, name, createdAt }],
 *   people:  [{ id, eventId, name, title, company, about, photo, stats }],
 *   quizzes: [{ id, eventId, date, total, correct, mode }]
 * }
 * stats = { seen, correct, wrong, streak }
 * ===================================================================== */

const KEY = 'facesnames.v1';

let state = null;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    // Most likely the photo data pushed us over the storage quota.
    console.error('Persist failed', e);
    alert('Storage is full — try removing some photos or exporting your data.');
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Could not parse stored data', e);
  }
  return null;
}

function seed() {
  const ev = { id: uid(), name: 'My first event', createdAt: Date.now() };
  return { activeEventId: ev.id, events: [ev], people: [], quizzes: [] };
}

export const Store = {
  init() {
    state = load() || seed();
    // Safety: ensure there is always a valid active event.
    if (!state.events?.length) state = seed();
    if (!state.events.find((e) => e.id === state.activeEventId)) {
      state.activeEventId = state.events[0].id;
    }
    persist();
  },

  /* ---- Events ---- */
  events() {
    return state.events;
  },
  activeEventId() {
    return state.activeEventId;
  },
  setActiveEvent(id) {
    state.activeEventId = id;
    persist();
  },
  addEvent(name) {
    const ev = { id: uid(), name, createdAt: Date.now() };
    state.events.push(ev);
    persist();
    return ev;
  },
  renameEvent(id, name) {
    const ev = state.events.find((e) => e.id === id);
    if (ev) {
      ev.name = name;
      persist();
    }
  },
  deleteEvent(id) {
    state.events = state.events.filter((e) => e.id !== id);
    state.people = state.people.filter((p) => p.eventId !== id);
    state.quizzes = state.quizzes.filter((q) => q.eventId !== id);
    if (state.activeEventId === id && state.events[0]) {
      state.activeEventId = state.events[0].id;
    }
    persist();
  },

  /* ---- People (scoped to active event) ---- */
  people() {
    return state.people.filter((p) => p.eventId === state.activeEventId);
  },
  getPerson(id) {
    return state.people.find((p) => p.id === id);
  },
  addPerson(data) {
    const person = {
      id: uid(),
      eventId: state.activeEventId,
      name: '',
      title: '',
      company: '',
      about: '',
      photo: null,
      stats: { seen: 0, correct: 0, wrong: 0, streak: 0 },
      ...data,
    };
    state.people.push(person);
    persist();
    return person;
  },
  updatePerson(id, data) {
    const p = state.people.find((x) => x.id === id);
    if (p) {
      Object.assign(p, data);
      persist();
    }
  },
  deletePerson(id) {
    state.people = state.people.filter((p) => p.id !== id);
    persist();
  },

  /* ---- Quiz results ---- */
  recordResult(personId, isCorrect) {
    const p = state.people.find((x) => x.id === personId);
    if (!p) return;
    p.stats = p.stats || { seen: 0, correct: 0, wrong: 0, streak: 0 };
    p.stats.seen++;
    if (isCorrect) {
      p.stats.correct++;
      p.stats.streak = Math.max(1, (p.stats.streak || 0) + 1);
    } else {
      p.stats.wrong++;
      p.stats.streak = 0;
    }
    persist();
  },
  recordQuiz({ total, correct, mode }) {
    state.quizzes.push({
      id: uid(),
      eventId: state.activeEventId,
      date: Date.now(),
      total,
      correct,
      mode,
    });
    persist();
  },
  quizHistory() {
    return state.quizzes.filter((q) => q.eventId === state.activeEventId);
  },

  /* ---- Mastery: a 0..1 estimate combining accuracy and streak. ---- */
  mastery(person) {
    const s = person.stats;
    if (!s || !s.seen) return 0;
    const accuracy = s.correct / s.seen;
    const streakBonus = Math.min(0.2, (s.streak || 0) * 0.05);
    // Down-weight when very few attempts so confidence builds with reps.
    const confidence = Math.min(1, s.seen / 3);
    return Math.min(1, (accuracy * 0.8 + streakBonus) * confidence + accuracy * 0.2 * confidence);
  },

  /* ---- Backup ---- */
  exportJSON() {
    return JSON.stringify(state, null, 2);
  },
  importJSON(text) {
    const data = JSON.parse(text);
    if (!data.events || !data.people) throw new Error('Invalid file');
    state = data;
    if (!state.quizzes) state.quizzes = [];
    if (!state.events.find((e) => e.id === state.activeEventId)) {
      state.activeEventId = state.events[0]?.id;
    }
    persist();
  },
};
