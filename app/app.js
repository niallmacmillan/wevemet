/* =====================================================================
 * Faces & Names — a networking / memory flashcard app.
 *
 * No backend, no build step. All data lives in localStorage on the
 * device (photos are stored as compressed data URLs). The app works
 * fully offline; screenshot OCR is an optional enhancement that lazily
 * loads Tesseract.js from a CDN when available.
 * ===================================================================== */

import { Store } from './store.js';
import { initOCR } from './ocr.js';

/* ----------------------------- Utilities ---------------------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null || c === false) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
};

const initials = (name) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || '?';

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const sample = (arr, n) => shuffle(arr).slice(0, n);

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, kind = '') {
  const root = $('#toast-root');
  const t = el('div', { class: `toast ${kind ? 'toast--' + kind : ''}` }, msg);
  root.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 250);
  }, 2200);
}

/* Build an avatar element (photo or coloured initials). */
function avatar(person, big = false) {
  const cls = `avatar${big ? ' avatar--lg' : ''}`;
  if (person.photo) {
    return el('img', { class: cls, src: person.photo, alt: person.name });
  }
  const node = el('div', { class: cls }, initials(person.name));
  // Deterministic colour from the name so the same person is consistent.
  let hash = 0;
  for (const ch of person.name || '') hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  node.style.background = `hsl(${hash}, 55%, 45%)`;
  return node;
}

/* Resize + compress an uploaded image file into a data URL. */
function fileToDataURL(file, maxDim = 640) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = el('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ----------------------------- Modal -------------------------------- */

function openModal(title, bodyBuilder) {
  const root = $('#modal-root');
  root.hidden = false;
  const close = () => {
    root.hidden = true;
    root.innerHTML = '';
  };
  const body = el('div', { class: 'modal' }, [el('h2', { class: 'modal__title' }, title)]);
  const content = bodyBuilder(close);
  (Array.isArray(content) ? content : [content]).forEach((c) => c && body.appendChild(c));
  root.innerHTML = '';
  root.appendChild(body);
  root.onclick = (e) => {
    if (e.target === root) close();
  };
  return close;
}

function field(labelText, control, hint) {
  return el('div', { class: 'field' }, [
    el('label', {}, labelText),
    control,
    hint ? el('p', { class: 'hint' }, hint) : null,
  ]);
}

/* =====================================================================
 * People editor (shared by Add and Edit)
 * ===================================================================== */

function personForm(existing, onSave) {
  let photo = existing?.photo || null;

  const photoEl = avatar(existing || { name: '' }, true);
  const photoInput = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: 'photo-input' });
  photoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    photo = await fileToDataURL(file);
    const fresh = avatar({ name: nameInput.value, photo }, true);
    photoEl.replaceWith(fresh);
    photoWrap.querySelector('.avatar')?.replaceWith(fresh);
  });

  const photoWrap = el('div', { class: 'photo-picker' }, [
    photoEl,
    el('label', { class: 'btn btn--soft btn--sm', for: 'photo-input' }, photo ? 'Change photo' : 'Add photo'),
    photoInput,
    el('span', { class: 'photo-picker__hint' }, 'A face photo makes the quiz work best'),
  ]);

  const nameInput = el('input', { class: 'input', placeholder: 'e.g. Jessica Taylor', value: existing?.name || '' });
  const titleInput = el('input', { class: 'input', placeholder: 'e.g. Product Manager', value: existing?.title || '' });
  const companyInput = el('input', { class: 'input', placeholder: 'e.g. Acme Ltd', value: existing?.company || '' });
  const aboutInput = el('textarea', { class: 'input', placeholder: 'How you met, shared interests, a memory hook…' }, existing?.about || '');

  const form = el('div', {}, [
    photoWrap,
    field('Name *', nameInput),
    field('Job title', titleInput),
    field('Company', companyInput),
    field('About / notes', aboutInput),
  ]);

  const save = () => {
    const name = nameInput.value.trim();
    if (!name) {
      toast('Name is required', 'bad');
      nameInput.focus();
      return false;
    }
    onSave({
      name,
      title: titleInput.value.trim(),
      company: companyInput.value.trim(),
      about: aboutInput.value.trim(),
      photo,
    });
    return true;
  };

  return { form, save };
}

function openPersonEditor(person) {
  openModal(person ? 'Edit person' : 'Add person', (close) => {
    const { form, save } = personForm(person, (data) => {
      if (person) Store.updatePerson(person.id, data);
      else Store.addPerson(data);
      toast(person ? 'Saved' : `Added ${data.name}`, 'good');
      render();
    });
    const actions = el('div', { class: 'modal__actions' }, [
      el('button', { class: 'btn btn--soft', onclick: close }, 'Cancel'),
      el('button', {
        class: 'btn',
        onclick: () => {
          if (save()) close();
        },
      }, person ? 'Save' : 'Add person'),
    ]);
    const extra = [];
    if (person) {
      extra.push(
        el('button', {
          class: 'btn btn--danger btn--block',
          style: 'margin-top:10px',
          onclick: () => {
            if (confirm(`Delete ${person.name}?`)) {
              Store.deletePerson(person.id);
              toast('Deleted');
              close();
              render();
            }
          },
        }, 'Delete person')
      );
    }
    return [form, actions, ...extra];
  });
}

/* =====================================================================
 * VIEW: People
 * ===================================================================== */

function viewPeople(view) {
  const people = Store.people();
  view.appendChild(el('h2', { class: 'section-title' }, `Attendees · ${people.length}`));

  if (!people.length) {
    view.appendChild(
      el('div', { class: 'empty' }, [
        el('span', { class: 'empty__emoji' }, '👋'),
        el('p', {}, 'No people yet in this event.'),
        el('button', { class: 'btn', onclick: () => switchView('add') }, 'Add your first person'),
      ])
    );
    return;
  }

  const search = el('input', { class: 'input', placeholder: 'Search name, title or company…', type: 'search' });
  const list = el('div', {});

  const draw = (q = '') => {
    list.innerHTML = '';
    const filtered = people.filter((p) =>
      [p.name, p.title, p.company, p.about].join(' ').toLowerCase().includes(q.toLowerCase())
    );
    if (!filtered.length) {
      list.appendChild(el('p', { class: 'hint' }, 'No matches.'));
      return;
    }
    filtered.forEach((p) => {
      const mastery = Store.mastery(p);
      const meta = [p.title, p.company].filter(Boolean).join(' · ') || 'No details yet';
      const row = el('div', { class: 'person-row', onclick: () => openPersonEditor(p) }, [
        avatar(p),
        el('div', { class: 'person-row__info' }, [
          el('div', { class: 'person-row__name' }, p.name),
          el('div', { class: 'person-row__meta' }, meta),
          el('div', { class: 'mastery-bar' }, [
            (() => {
              const f = el('div', { class: 'mastery-bar__fill' });
              f.style.width = `${Math.round(mastery * 100)}%`;
              return f;
            })(),
          ]),
        ]),
        el('span', { style: 'color:var(--muted);font-size:20px' }, '›'),
      ]);
      list.appendChild(row);
    });
  };

  search.addEventListener('input', () => draw(search.value));
  view.appendChild(el('div', { class: 'search-bar' }, [search]));
  view.appendChild(list);
  draw();
}

/* =====================================================================
 * VIEW: Add / Import
 * ===================================================================== */

function viewAdd(view) {
  view.appendChild(el('h2', { class: 'section-title' }, 'Add one person'));
  view.appendChild(
    el('div', { class: 'card' }, [
      el('p', { class: 'hint', style: 'margin-top:0' }, 'Add a single attendee with a photo and details.'),
      el('button', { class: 'btn btn--block', onclick: () => openPersonEditor(null) }, '＋ Add a person'),
    ])
  );

  view.appendChild(el('h2', { class: 'section-title' }, 'Bulk add (paste a list)'));
  const bulkInput = el('textarea', {
    class: 'input',
    placeholder:
      'One person per line. Optionally add details with commas:\n\nJessica Taylor, Product Manager, Acme\nEmma Wright, Designer\nGeorgina Hall, CEO, Nimbus',
  });
  view.appendChild(
    el('div', { class: 'card' }, [
      field('Paste names', bulkInput, 'Format per line: Name, Job title, Company (title & company optional)'),
      el('button', {
        class: 'btn btn--block',
        onclick: () => {
          const added = parseBulk(bulkInput.value);
          if (!added) return toast('Nothing to add', 'bad');
          toast(`Added ${added} ${added === 1 ? 'person' : 'people'}`, 'good');
          bulkInput.value = '';
          switchView('people');
        },
      }, 'Add everyone'),
    ])
  );

  view.appendChild(el('h2', { class: 'section-title' }, 'Import from screenshot 📸'));
  const screenshotInput = el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', id: 'shot-input' });
  screenshotInput.addEventListener('change', (e) => handleScreenshots([...e.target.files]));
  view.appendChild(
    el('div', { class: 'card' }, [
      el('p', { class: 'hint', style: 'margin-top:0' },
        'Upload screenshots of an attendee list, guest list or contacts. We read the names off the image and let you review them before adding.'),
      el('label', { class: 'btn btn--block', for: 'shot-input' }, 'Choose screenshot(s)'),
      screenshotInput,
    ])
  );
}

function parseBulk(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let count = 0;
  lines.forEach((line) => {
    const [name, title, company] = line.split(',').map((s) => s.trim());
    if (!name) return;
    Store.addPerson({ name, title: title || '', company: company || '', about: '', photo: null });
    count++;
  });
  return count;
}

/* ---- Screenshot OCR flow ---- */

async function handleScreenshots(files) {
  if (!files.length) return;

  let close;
  close = openModal('Reading screenshot…', () => {
    const bar = el('div', { class: 'progress' }, [el('div', { class: 'progress__fill', id: 'ocr-fill' })]);
    return [
      el('p', { class: 'hint' }, 'Scanning the image for names. The first scan downloads the text-recognition engine, so it can take a moment.'),
      bar,
    ];
  });

  let text = '';
  try {
    const ocr = await initOCR((p) => {
      const fill = $('#ocr-fill');
      if (fill) fill.style.width = `${Math.round(p * 100)}%`;
    });
    for (const file of files) {
      const url = await fileToDataURL(file, 1400);
      text += '\n' + (await ocr.recognize(url));
    }
  } catch (err) {
    console.warn('OCR unavailable', err);
    if (close) close();
    return offlineScreenshotFallback(files);
  }

  if (close) close();
  reviewExtracted(extractNames(text), files);
}

/* When OCR can't load (offline / blocked), still let the user attach the
 * screenshot as a reference and type the names in manually. */
function offlineScreenshotFallback(files) {
  toast('Text recognition unavailable offline — type names below', 'bad');
  openModal('Add names from screenshot', (close) => {
    const previews = files.slice(0, 3).map((f) => {
      const img = el('img', { class: 'ocr-preview' });
      fileToDataURL(f, 1000).then((u) => (img.src = u));
      return img;
    });
    const ta = el('textarea', { class: 'input', placeholder: 'One name per line…' });
    return [
      ...previews,
      field('Names you can see', ta),
      el('div', { class: 'modal__actions' }, [
        el('button', { class: 'btn btn--soft', onclick: close }, 'Cancel'),
        el('button', {
          class: 'btn',
          onclick: () => {
            const n = parseBulk(ta.value);
            if (n) {
              toast(`Added ${n}`, 'good');
              close();
              switchView('people');
            }
          },
        }, 'Add'),
      ]),
    ];
  });
}

/* Heuristic: pull likely person names out of raw OCR text. */
function extractNames(text) {
  const stop = /(attendee|guest|name|list|page|email|phone|company|title|role|register|check|confirmed)/i;
  return [...new Set(
    text
      .split('\n')
      .map((l) => l.replace(/[•·|→\-–—*\d.]+/g, ' ').replace(/\s+/g, ' ').trim())
      .filter((l) => {
        if (l.length < 3 || l.length > 48) return false;
        if (stop.test(l)) return false;
        const words = l.split(' ');
        // Looks like a name: 1-4 words, mostly capitalised letters.
        if (words.length < 1 || words.length > 4) return false;
        return /^[A-Z][a-zA-Z'’.-]+(\s+[A-Z][a-zA-Z'’.-]+){0,3}$/.test(l);
      })
  )];
}

function reviewExtracted(names, files) {
  openModal(`Review ${names.length} name(s)`, (close) => {
    const preview = files[0] ? (() => {
      const img = el('img', { class: 'ocr-preview' });
      fileToDataURL(files[0], 800).then((u) => (img.src = u));
      return img;
    })() : null;

    const rows = [];
    const container = el('div', {});
    const addRow = (val = '') => {
      const inp = el('input', { class: 'input', value: val, placeholder: 'Name' });
      const row = el('div', { class: 'ocr-candidate' }, [
        inp,
        el('button', { class: 'btn btn--soft btn--sm', onclick: () => { row.remove(); rows.splice(rows.indexOf(inp), 1); } }, '✕'),
      ]);
      rows.push(inp);
      container.appendChild(row);
    };

    if (names.length) names.forEach(addRow);
    else addRow('');

    return [
      preview,
      el('p', { class: 'hint' }, names.length
        ? 'Edit or remove any mistakes, then add them all. You can add photos & details later.'
        : "Couldn't confidently read names — add them manually below."),
      container,
      el('button', { class: 'btn btn--soft btn--sm', onclick: () => addRow('') }, '＋ Add a row'),
      el('div', { class: 'modal__actions' }, [
        el('button', { class: 'btn btn--soft', onclick: close }, 'Cancel'),
        el('button', {
          class: 'btn',
          onclick: () => {
            let n = 0;
            rows.forEach((inp) => {
              const name = inp.value.trim();
              if (name) { Store.addPerson({ name, title: '', company: '', about: '', photo: null }); n++; }
            });
            if (!n) return toast('Nothing to add', 'bad');
            toast(`Added ${n} from screenshot`, 'good');
            close();
            switchView('people');
          },
        }, 'Add all'),
      ]),
    ];
  });
}

/* =====================================================================
 * VIEW: Quiz
 * ===================================================================== */

let quizState = null;

function viewQuiz(view) {
  if (quizState) return renderQuizQuestion(view);

  const people = Store.people();
  view.appendChild(el('h2', { class: 'section-title' }, 'Quiz yourself'));

  if (people.length < 2) {
    view.appendChild(
      el('div', { class: 'empty' }, [
        el('span', { class: 'empty__emoji' }, '🎯'),
        el('p', {}, 'Add at least 2 people to start a quiz.'),
        el('button', { class: 'btn', onclick: () => switchView('add') }, 'Add people'),
      ])
    );
    return;
  }

  // Quiz configuration
  let mode = 'mixed';
  let length = Math.min(10, people.length);

  const modeChips = el('div', { class: 'chips' });
  const modes = [
    ['mixed', '🔀 Mixed'],
    ['faces', '🖼️ Faces → name'],
    ['details', '💼 Name → details'],
  ];
  const drawModes = () => {
    modeChips.innerHTML = '';
    modes.forEach(([val, label]) => {
      modeChips.appendChild(
        el('button', {
          class: `chip ${mode === val ? 'chip--active' : ''}`,
          onclick: () => { mode = val; drawModes(); },
        }, label)
      );
    });
  };
  drawModes();

  const lenChips = el('div', { class: 'chips' });
  const drawLens = () => {
    lenChips.innerHTML = '';
    [5, 10, 20, people.length].filter((n, i, a) => n <= people.length && a.indexOf(n) === i).forEach((n) => {
      lenChips.appendChild(
        el('button', {
          class: `chip ${length === n ? 'chip--active' : ''}`,
          onclick: () => { length = n; drawLens(); },
        }, n === people.length ? `All (${n})` : `${n}`)
      );
    });
  };
  drawLens();

  const facesPossible = people.some((p) => p.photo);

  view.appendChild(
    el('div', { class: 'card' }, [
      field('Question type', modeChips),
      !facesPossible ? el('p', { class: 'hint' }, '💡 Add photos to unlock face quizzes.') : null,
      field('How many questions', lenChips),
      el('button', {
        class: 'btn btn--block',
        style: 'margin-top:8px',
        onclick: () => {
          quizState = buildQuiz(people, mode, length);
          if (!quizState) { toast('Not enough data for that mode', 'bad'); return; }
          render();
        },
      }, 'Start quiz'),
    ])
  );

  // Quick "focus on weak spots" option
  const weak = people.filter((p) => Store.mastery(p) < 0.6 && (p.stats?.seen || 0) > 0);
  if (weak.length >= 2) {
    view.appendChild(
      el('div', { class: 'card' }, [
        el('p', { class: 'hint', style: 'margin-top:0' }, `You have ${weak.length} people you keep getting wrong.`),
        el('button', {
          class: 'btn btn--soft btn--block',
          onclick: () => {
            quizState = buildQuiz(weak, mode, Math.min(weak.length, 15), people);
            render();
          },
        }, '🔁 Practise weak spots'),
      ])
    );
  }
}

/* Build a quiz: an array of question objects.
 * pool = people the *answers* (distractors) are drawn from. */
function buildQuiz(subjects, mode, length, pool) {
  pool = pool || subjects;
  if (pool.length < 2) return null;

  // Weight selection toward weaker people (lower mastery => higher weight).
  const weighted = [];
  subjects.forEach((p) => {
    const w = Math.max(1, Math.round((1 - Store.mastery(p)) * 4) + 1);
    for (let i = 0; i < w; i++) weighted.push(p);
  });

  const chosen = [];
  const used = new Set();
  const shuffledW = shuffle(weighted);
  for (const p of shuffledW) {
    if (chosen.length >= length) break;
    if (used.has(p.id)) continue;
    used.add(p.id);
    chosen.push(p);
  }
  // top up if needed
  if (chosen.length < length) {
    shuffle(subjects).forEach((p) => {
      if (chosen.length < length && !used.has(p.id)) { used.add(p.id); chosen.push(p); }
    });
  }

  const questions = chosen.map((p) => makeQuestion(p, mode, pool)).filter(Boolean);
  if (!questions.length) return null;

  return { questions, index: 0, correct: 0, mode, answers: [] };
}

function makeQuestion(person, mode, pool) {
  let kind = mode;
  if (mode === 'mixed') {
    const options = ['faces', 'title', 'company', 'name-from-detail'];
    kind = options[Math.floor(Math.random() * options.length)];
  } else if (mode === 'faces') {
    kind = 'faces';
  } else if (mode === 'details') {
    kind = Math.random() < 0.5 ? 'title' : 'company';
  }

  // Faces requires a photo; fall back to a name question if missing.
  if (kind === 'faces' && !person.photo) kind = 'title';

  if (kind === 'faces') {
    const distractors = sample(pool.filter((p) => p.id !== person.id), 3).map((p) => p.name);
    if (distractors.length < 1) return null;
    return {
      kind,
      prompt: 'Who is this?',
      photo: person.photo,
      correct: person.name,
      options: shuffle([person.name, ...distractors]),
      personId: person.id,
    };
  }

  if (kind === 'title' || kind === 'company') {
    const fieldName = kind;
    const value = person[fieldName];
    if (!value) {
      // No data for this field — try the other, else a name-from-photo.
      const alt = kind === 'title' ? 'company' : 'title';
      if (person[alt]) return makeFieldQuestion(person, alt, pool);
      if (person.photo) return makeQuestion(person, 'faces', pool);
      return null;
    }
    return makeFieldQuestion(person, fieldName, pool);
  }

  if (kind === 'name-from-detail') {
    const detail = person.title || person.company || person.about;
    if (!detail) return person.photo ? makeQuestion(person, 'faces', pool) : null;
    const distractors = sample(pool.filter((p) => p.id !== person.id), 3).map((p) => p.name);
    if (distractors.length < 1) return null;
    return {
      kind,
      prompt: `Who ${person.title ? 'is the ' + person.title : person.company ? 'works at ' + person.company : 'matches'}: “${detail}”?`,
      photo: person.photo,
      correct: person.name,
      options: shuffle([person.name, ...distractors]),
      personId: person.id,
    };
  }

  return null;
}

function makeFieldQuestion(person, fieldName, pool) {
  const value = person[fieldName];
  const label = fieldName === 'title' ? 'job title' : 'company';
  const distractors = sample(
    pool.filter((p) => p.id !== person.id && p[fieldName] && p[fieldName] !== value),
    3
  ).map((p) => p[fieldName]);

  // Pad with generic distractors if not enough unique ones exist.
  const generic = fieldName === 'title'
    ? ['Manager', 'Director', 'Consultant', 'Engineer', 'Founder', 'Analyst']
    : ['Globex', 'Initech', 'Umbrella', 'Hooli', 'Stark Industries', 'Wayne Enterprises'];
  while (distractors.length < 3) {
    const g = generic[Math.floor(Math.random() * generic.length)];
    if (g !== value && !distractors.includes(g)) distractors.push(g);
  }

  return {
    kind: fieldName,
    prompt: `What is ${person.name}'s ${label}?`,
    photo: person.photo,
    name: person.name,
    correct: value,
    options: shuffle([value, ...distractors]),
    personId: person.id,
  };
}

function renderQuizQuestion(view) {
  const q = quizState.questions[quizState.index];
  const total = quizState.questions.length;

  const wrap = el('div', { class: 'quiz-wrap' });
  wrap.appendChild(
    el('div', { class: 'quiz-progress' }, [
      el('span', {}, `Question ${quizState.index + 1} / ${total}`),
      el('span', {}, `Score ${quizState.correct}`),
    ])
  );

  // Visual: photo for face/name questions, name badge for detail questions.
  if (q.photo && q.kind !== 'title' && q.kind !== 'company') {
    wrap.appendChild(el('img', { class: 'quiz-photo', src: q.photo, alt: 'Who is this?' }));
  } else if (q.kind === 'title' || q.kind === 'company') {
    if (q.photo) wrap.appendChild(el('img', { class: 'quiz-photo', src: q.photo, alt: q.name }));
    else {
      const badge = el('div', { class: 'quiz-photo' }, initials(q.name));
      wrap.appendChild(badge);
    }
  }

  wrap.appendChild(el('div', { class: 'quiz-question' }, q.prompt));

  const feedback = el('div', { class: 'quiz-feedback' });
  const optionsWrap = el('div', { class: 'quiz-options' });

  q.options.forEach((opt) => {
    const btn = el('button', { class: 'option' }, opt || '—');
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const isCorrect = opt === q.correct;
      [...optionsWrap.children].forEach((b) => {
        b.disabled = true;
        if (b.textContent === q.correct) b.classList.add('option--correct');
      });
      if (!isCorrect) btn.classList.add('option--wrong');

      Store.recordResult(q.personId, isCorrect);
      quizState.answers.push({ q, opt, isCorrect });
      if (isCorrect) {
        quizState.correct++;
        feedback.textContent = '✅ Correct!';
        feedback.className = 'quiz-feedback quiz-feedback--good';
      } else {
        feedback.textContent = `❌ It was ${q.correct}`;
        feedback.className = 'quiz-feedback quiz-feedback--bad';
      }

      const nextBtn = el('button', {
        class: 'btn btn--block',
        style: 'margin-top:16px',
        onclick: () => {
          quizState.index++;
          if (quizState.index >= total) finishQuiz();
          else render();
        },
      }, quizState.index + 1 >= total ? 'See results' : 'Next →');
      wrap.appendChild(nextBtn);
      nextBtn.focus();
    });
    optionsWrap.appendChild(btn);
  });

  wrap.appendChild(optionsWrap);
  wrap.appendChild(feedback);

  wrap.appendChild(
    el('button', {
      class: 'btn btn--soft btn--sm',
      style: 'margin-top:20px',
      onclick: () => { quizState = null; render(); },
    }, 'Quit quiz')
  );

  view.appendChild(wrap);
}

function finishQuiz() {
  const total = quizState.questions.length;
  const correct = quizState.correct;
  const pct = Math.round((correct / total) * 100);
  Store.recordQuiz({ total, correct, mode: quizState.mode });

  const missed = quizState.answers.filter((a) => !a.isCorrect);
  const finished = quizState;
  quizState = null;

  const view = $('#view');
  view.innerHTML = '';

  const ring = el('div', { class: 'score-ring' }, [
    el('div', { class: 'score-ring__inner' }, [
      el('div', { class: 'score-ring__pct' }, `${pct}%`),
      el('div', { class: 'score-ring__label' }, `${correct} / ${total}`),
    ]),
  ]);
  ring.style.setProperty('--pct', `${pct * 3.6}deg`);

  const message = pct === 100 ? '🏆 Perfect! You know everyone.'
    : pct >= 70 ? '🎉 Great recall!'
    : pct >= 40 ? '👍 Getting there — keep practising.'
    : '💪 Early days. Run it again to lock them in.';

  view.appendChild(el('h2', { class: 'section-title' }, 'Results'));
  view.appendChild(ring);
  view.appendChild(el('p', { style: 'text-align:center;font-weight:700;font-size:18px' }, message));

  if (missed.length) {
    view.appendChild(el('h2', { class: 'section-title' }, 'Worth reviewing'));
    missed.forEach((a) => {
      const p = Store.getPerson(a.q.personId);
      if (!p) return;
      view.appendChild(
        el('div', { class: 'person-row', onclick: () => openPersonEditor(p) }, [
          avatar(p),
          el('div', { class: 'person-row__info' }, [
            el('div', { class: 'person-row__name' }, p.name),
            el('div', { class: 'person-row__meta' }, [p.title, p.company].filter(Boolean).join(' · ') || '—'),
          ]),
        ])
      );
    });
  }

  view.appendChild(
    el('div', { style: 'display:flex;gap:10px;margin-top:18px' }, [
      el('button', { class: 'btn btn--block', onclick: () => switchView('quiz') }, 'Play again'),
      el('button', { class: 'btn btn--soft btn--block', onclick: () => switchView('people') }, 'Done'),
    ])
  );
}

/* =====================================================================
 * VIEW: Stats
 * ===================================================================== */

function viewStats(view) {
  const people = Store.people();
  const history = Store.quizHistory();

  view.appendChild(el('h2', { class: 'section-title' }, 'Your progress'));

  const totalQuizzes = history.length;
  const avg = totalQuizzes
    ? Math.round(history.reduce((s, h) => s + h.correct / h.total, 0) / totalQuizzes * 100)
    : 0;
  const mastered = people.filter((p) => Store.mastery(p) >= 0.8 && (p.stats?.seen || 0) >= 2).length;

  view.appendChild(
    el('div', { class: 'stat-grid' }, [
      el('div', { class: 'stat-box' }, [el('div', { class: 'stat-box__num' }, String(people.length)), el('div', { class: 'stat-box__label' }, 'People')]),
      el('div', { class: 'stat-box' }, [el('div', { class: 'stat-box__num' }, String(mastered)), el('div', { class: 'stat-box__label' }, 'Mastered')]),
      el('div', { class: 'stat-box' }, [el('div', { class: 'stat-box__num' }, String(totalQuizzes)), el('div', { class: 'stat-box__label' }, 'Quizzes taken')]),
      el('div', { class: 'stat-box' }, [el('div', { class: 'stat-box__num' }, `${avg}%`), el('div', { class: 'stat-box__label' }, 'Avg score')]),
    ])
  );

  if (people.length) {
    view.appendChild(el('h2', { class: 'section-title' }, 'People to work on'));
    const ranked = [...people]
      .filter((p) => (p.stats?.seen || 0) > 0)
      .sort((a, b) => Store.mastery(a) - Store.mastery(b))
      .slice(0, 5);
    if (!ranked.length) {
      view.appendChild(el('p', { class: 'hint' }, 'Take a quiz to see who needs practice.'));
    } else {
      ranked.forEach((p) => {
        view.appendChild(
          el('div', { class: 'person-row', onclick: () => openPersonEditor(p) }, [
            avatar(p),
            el('div', { class: 'person-row__info' }, [
              el('div', { class: 'person-row__name' }, p.name),
              el('div', { class: 'person-row__meta' }, `${p.stats.correct}/${p.stats.seen} correct`),
            ]),
            el('div', { style: 'font-weight:700' }, `${Math.round(Store.mastery(p) * 100)}%`),
          ])
        );
      });
    }
  }

  if (history.length) {
    view.appendChild(el('h2', { class: 'section-title' }, 'Recent quizzes'));
    const card = el('div', { class: 'card' });
    history.slice(-8).reverse().forEach((h) => {
      card.appendChild(
        el('div', { class: 'history-row' }, [
          el('span', {}, new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
          el('span', {}, `${h.correct}/${h.total} · ${Math.round((h.correct / h.total) * 100)}%`),
        ])
      );
    });
    view.appendChild(card);
  }

  view.appendChild(el('h2', { class: 'section-title' }, 'Data'));
  view.appendChild(
    el('div', { class: 'card' }, [
      el('p', { class: 'hint', style: 'margin-top:0' }, 'Everything is stored privately on this device. Back it up or move it to another device with export / import.'),
      el('div', { class: 'row-actions' }, [
        el('button', { class: 'btn btn--soft btn--sm', onclick: exportData }, '⬇ Export'),
        el('button', { class: 'btn btn--soft btn--sm', onclick: importData }, '⬆ Import'),
      ]),
    ])
  );
}

function exportData() {
  const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `faces-names-${Date.now()}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('Exported', 'good');
}

function importData() {
  const input = el('input', { type: 'file', accept: 'application/json' });
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      Store.importJSON(await file.text());
      toast('Imported', 'good');
      buildEventSelect();
      render();
    } catch {
      toast('Could not read that file', 'bad');
    }
  });
  input.click();
}

/* =====================================================================
 * Event management
 * ===================================================================== */

function buildEventSelect() {
  const select = $('#event-select');
  select.innerHTML = '';
  Store.events().forEach((ev) => {
    const opt = el('option', { value: ev.id }, ev.name);
    if (ev.id === Store.activeEventId()) opt.selected = true;
    select.appendChild(opt);
  });
}

function openNewEvent() {
  openModal('New event', (close) => {
    const input = el('input', { class: 'input', placeholder: 'e.g. Tech Mixer — June' });
    return [
      field('Event name', input),
      el('div', { class: 'modal__actions' }, [
        el('button', { class: 'btn btn--soft', onclick: close }, 'Cancel'),
        el('button', {
          class: 'btn',
          onclick: () => {
            const name = input.value.trim() || 'Untitled event';
            const ev = Store.addEvent(name);
            Store.setActiveEvent(ev.id);
            buildEventSelect();
            close();
            switchView('add');
          },
        }, 'Create'),
      ]),
    ];
  });
}

function openEventMenu() {
  const ev = Store.events().find((e) => e.id === Store.activeEventId());
  if (!ev) return;
  openModal('Event options', (close) => {
    const renameInput = el('input', { class: 'input', value: ev.name });
    return [
      field('Rename event', renameInput),
      el('button', {
        class: 'btn btn--block',
        onclick: () => { Store.renameEvent(ev.id, renameInput.value.trim() || ev.name); buildEventSelect(); toast('Renamed', 'good'); close(); },
      }, 'Save name'),
      el('button', {
        class: 'btn btn--danger btn--block',
        style: 'margin-top:10px',
        onclick: () => {
          if (Store.events().length <= 1) return toast('Keep at least one event', 'bad');
          if (confirm(`Delete event "${ev.name}" and all its people?`)) {
            Store.deleteEvent(ev.id);
            buildEventSelect();
            close();
            render();
          }
        },
      }, 'Delete event'),
    ];
  });
}

/* =====================================================================
 * Router
 * ===================================================================== */

let currentView = 'people';

function switchView(name) {
  currentView = name;
  if (name !== 'quiz') quizState = null;
  render();
}

function render() {
  const view = $('#view');
  view.innerHTML = '';

  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('tab--active', t.dataset.view === currentView));

  ({
    people: viewPeople,
    add: viewAdd,
    quiz: viewQuiz,
    stats: viewStats,
  }[currentView] || viewPeople)(view);

  view.scrollIntoView({ block: 'start' });
}

/* ----------------------------- Boot --------------------------------- */

function boot() {
  Store.init();
  buildEventSelect();

  document.querySelectorAll('.tab').forEach((tab) =>
    tab.addEventListener('click', () => switchView(tab.dataset.view))
  );
  $('#event-select').addEventListener('change', (e) => {
    Store.setActiveEvent(e.target.value);
    switchView('people');
  });
  $('#new-event-btn').addEventListener('click', openNewEvent);
  $('#event-menu-btn').addEventListener('click', openEventMenu);

  render();

  // Register service worker for offline / installable use.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
