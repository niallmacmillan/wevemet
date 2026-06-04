/* =====================================================================
 * Store — all persistence for WeveMet.
 *
 * Data shape (localStorage key "facesnames.v1"):
 * {
 *   activeEventId: string,
 *   events:  [{ id, name, createdAt }],
 *   people:  [{ id, eventId, name, title, company, about, photo,
 *              socials, media, stats }],
 *   quizzes: [{ id, eventId, date, total, correct, mode }]
 * }
 * stats   = { seen, correct, wrong, streak }
 * socials = { linkedin, twitter, instagram, facebook, tiktok, website }
 * media   = [{ id, kind: 'image'|'video', name }]  (blobs live in IndexedDB)
 *
 * Settings (API keys etc.) live under a SEPARATE key and are deliberately
 * NOT part of exportJSON, so backups never contain secrets.
 * ===================================================================== */

const KEY = 'facesnames.v1';
const SETTINGS_KEY = 'wevemet.settings';

let state = null;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const DAY = 24 * 60 * 60 * 1000;

/* A fresh spaced-repetition card. New people are "due" immediately so
 * they show up in the next review session. */
const newSRS = () => ({ due: Date.now(), interval: 0, ease: 2.5, reps: 0, lapses: 0 });

/* SM-2-flavoured scheduler. Returns the updated srs object. */
function scheduleNext(srs, correct) {
  const s = { ...newSRS(), ...srs };
  if (correct) {
    s.reps += 1;
    if (s.reps === 1) s.interval = 1;
    else if (s.reps === 2) s.interval = 3;
    else s.interval = Math.round(s.interval * s.ease);
    s.ease = Math.min(3.0, s.ease + 0.1);
  } else {
    s.reps = 0;
    s.lapses += 1;
    s.interval = 1;
    s.ease = Math.max(1.3, s.ease - 0.2);
  }
  s.due = Date.now() + s.interval * DAY;
  return s;
}

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
    // Migration: backfill fields added in later versions.
    state.people.forEach((p) => {
      if (!p.socials) p.socials = {};
      if (!Array.isArray(p.media)) p.media = [];
      if (!p.srs) p.srs = newSRS();
    });
    persist();
  },

  /* ---- Settings (kept separate; never exported) ---- */
  getSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch {
      return {};
    }
  },
  setSettings(partial) {
    const merged = { ...this.getSettings(), ...partial };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    return merged;
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
      socials: {},
      media: [],
      stats: { seen: 0, correct: 0, wrong: 0, streak: 0 },
      srs: newSRS(),
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
    // Update the spaced-repetition schedule.
    p.srs = scheduleNext(p.srs, isCorrect);
    persist();
  },

  /* ---- Spaced repetition ---- */
  duePeople() {
    const now = Date.now();
    return this.people()
      .filter((p) => (p.srs?.due ?? 0) <= now)
      .sort((a, b) => (a.srs?.due ?? 0) - (b.srs?.due ?? 0));
  },
  dueCount() {
    return this.duePeople().length;
  },
  /* Consecutive days (ending today or yesterday) with at least one quiz. */
  dayStreak() {
    const days = new Set(
      this.quizHistory().map((q) => new Date(q.date).toDateString())
    );
    if (!days.size) return 0;
    let streak = 0;
    const cursor = new Date();
    // Allow the streak to still count if they haven't played yet today.
    if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
    while (days.has(cursor.toDateString())) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
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
