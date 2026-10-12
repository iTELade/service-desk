// Route-owned workspace. No DOM observer: mount and dispose follow router lifecycle.
export function createWorkspaceUI(ctx) {
  const { S, api, e, date, notify, route, showModal } = ctx,
    call = (path, data, method = 'POST') =>
      api('/desk/v21/' + path, { method: data === undefined ? 'GET' : method, data });
  const $ = (s, el = document) => el.querySelector(s),
    $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let dispose = () => {},
    prefs,
    requestKeys = new Map(),
    refreshActivity = () => {};
  const names = { incident: 'Incydenty', problem: 'Problemy', change: 'Zmiany' },
    states = {
      open: 'Nowa',
      investigating: 'Analiza',
      monitoring: 'Obserwacja',
      resolved: 'Rozwiązana',
      closed: 'Zamknięta',
      planned: 'Planowana',
      approved: 'Zatwierdzona',
      rejected: 'Odrzucona',
      implementing: 'Wdrożenie',
      operational: 'Działa',
      degraded: 'Ograniczenia',
      outage: 'Awaria',
      maintenance: 'Serwis',
    },
    badge = (v) => `<span class="w21-badge w21-${e(v)}">${e(states[v] || v)}</span>`;
  const opts = (items, value, blank) =>
    `${blank === undefined ? '' : `<option value="">${e(blank)}</option>`}${Object.entries(items)
      .map(
        ([k, v]) =>
          `<option value="${e(k)}"${String(k) === String(value) ? ' selected' : ''}>${e(v)}</option>`,
      )
      .join('')}`;
  const projects = (manage) =>
    Object.fromEntries(
      S.meta.projects.filter((p) => (manage ? p.can_manage : p.can_work)).map((p) => [p.id, p.name]),
    );
  const field = (name, label, value = '', attrs = '') =>
      `<label>${e(label)}<input name="${e(name)}" value="${e(value)}" ${attrs}></label>`,
    area = (name, label, value = '', rows = 4) =>
      `<label>${e(label)}<textarea name="${e(name)}" rows="${rows}">${e(value)}</textarea></label>`,
    select = (name, label, items, value = '', blank) =>
      `<label>${e(label)}<select name="${e(name)}">${opts(items, value, blank)}</select></label>`;
  const head = (k, title, extra = '') =>
      `<header class="w21-heading"><div><span class="w21-eyebrow">${e(k)}</span><h1>${e(title)}</h1></div>${extra}</header>`,
    panel = (title, html) => `<section class="w21-panel"><h2>${e(title)}</h2>${html}</section>`;
  const submit = (text = 'Zapisz') =>
    `<p class="form-error" role="alert"></p><button class="primary" type="submit">${text}</button>`;
  const formData = (form) => Object.fromEntries(new FormData(form));
  const guarded = (fn) => async (ev) => {
    try {
      await fn(ev);
    } catch (err) {
      notify(err.message, true);
    }
  };
  function bindForm(form, fn) {
    if (!form) return;
    form.addEventListener(
      'submit',
      guarded(async (ev) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        const button = $('button[type=submit],button:not([type])', form);
        button.disabled = true;
        try {
          await fn(formData(form), form);
        } finally {
          if (button.isConnected) button.disabled = false;
        }
      }),
    );
  }
  function markdown(value) {
    return e(value)
      .replace(/```([^]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>')
      .replaceAll('\n', '<br>');
  }
  function similarList(result, links = false) {
    if (!result.enabled) return '';
    return `<p class="hint">Dopasowanie tematów — sugestia, nie potwierdzenie duplikatu.</p>${result.matches.map((t) => `<article class="w21-similar-item"><a href="#/ticket/${e(t.key)}"${links ? ' target="_blank" rel="noopener"' : ''}><strong>${e(t.key)}</strong> ${e(t.title)}</a><small>${t.score} / 100 · ${e(S.meta.statuses[t.status] || t.status)}<br>${t.exact ? 'Ten sam temat' : 'Wspólne słowa: ' + e(t.shared.join(', '))}</small>${!links && !S.portalMode && S.ticket?.can_work && !S.ticket.project_archived && !S.ticket.archived_at && S.ticket.status !== 'closed' ? `<button type="button" data-smart-link="${e(t.key)}"${S.ticket.links?.some((l) => l.key === t.key) ? ' disabled' : ''}>${S.ticket.links?.some((l) => l.key === t.key) ? 'Powiązane' : 'Powiąż sprawy'}</button>` : ''}</article>`).join('') || '<p>Brak podobnych zgłoszeń przy wybranym progu.</p>'}<small>${e(result.definition)} Sprawdzono ${result.examined}.</small>`;
  }
  function mountCreate(form) {
    if (!form || form.dataset.smartMounted) return;
    form.dataset.smartMounted = '1';
    const box = document.createElement('section');
    box.className = 'w21-smart-create';
    box.hidden = true;
    box.setAttribute('aria-live', 'polite');
    form.elements.title.closest('label').after(box);
    let timer,
      generation = 0;
    const update = () => {
      clearTimeout(timer);
      const token = ++generation;
      const project = S.meta.projects.find((p) => p.id === Number(form.elements.project_id.value));
      const title = form.elements.title.value.trim();
      box.hidden = !project?.settings?.ticket_assistance?.similar || title.length < 3;
      box.replaceChildren();
      if (box.hidden) return;
      box.innerHTML = '<h3>Podobne zgłoszenia</h3><p>Sprawdzanie tematów…</p>';
      timer = setTimeout(async () => {
        try {
          const result = await call('similar', { project_id: project.id, title });
          if (token !== generation || !form.isConnected || !form.closest('dialog')?.open) return;
          box.hidden = !result.enabled;
          box.innerHTML = '<h3>Podobne zgłoszenia</h3>' + similarList(result, true);
        } catch (err) {
          if (token === generation && form.isConnected)
            box.innerHTML = '<p>Nie udało się pobrać podpowiedzi. Możesz utworzyć zgłoszenie.</p>';
        }
      }, 350);
    };
    form.elements.title.addEventListener('input', update);
    form.elements.project_id.addEventListener('change', update);
    update();
  }
  function knowledgePanel(main, t, sidebar) {
    const host = document.createElement('section');
    host.className = 'w21-panel w21-knowledge';
    host.innerHTML =
      '<h2>Artykuły pomocne w tej sprawie</h2><p data-kb-state role="status">Szukam na podstawie tematu i opisu…</p><form data-kb-search><label>Szukaj w bazie wiedzy<input name="q" minlength="2" maxlength="240" placeholder="Temat lub słowa kluczowe" required></label><button type="submit">Szukaj</button></form><div data-kb-results></div><h3>Powiązane artykuły</h3><div data-kb-links></div>';
    sidebar.append(host);
    let generation = 0;
    const kb = (path, data, method = 'POST') => api('/desk/knowledge/' + path, { method, data });
    const active = () => main.isConnected && S.ticket === t;
    const showArticle = guarded(async (id) => {
      showModal(
        '<h2>Artykuł bazy wiedzy</h2><p data-kb-loading>Wczytywanie…</p><button type=\"button\" data-kb-loading-close>Zamknij</button>',
      );
      const loading = $('[data-kb-loading]');
      $('[data-kb-loading-close]').onclick = () => $('#modal').close();
      const article = await kb('pages/' + encodeURIComponent(id), { project_id: t.project_id }).catch(
        (err) => {
          if (loading.isConnected) loading.textContent = err.message;
          throw err;
        },
      );
      if (!active() || !loading.isConnected || !$('#modal').open) return;
      showModal(
        `<h2>${e(article.title)}</h2><p>${e(article.summary)}</p><div class="w21-kb-content">${markdown(article.content)}</div><p><a href="${e(article.url)}" target="_blank" rel="noopener noreferrer">Otwórz w osobnej bazie wiedzy →</a></p><div class="button-row">${!t.archived_at && !t.project_archived && t.status !== 'closed' ? '<button type="button" data-kb-pin>Powiąż ze zgłoszeniem</button><button type="button" data-kb-insert>Wstaw odnośnik do szkicu</button>' : ''}<button type="button" data-kb-close>Zamknij</button></div><p data-kb-modal-status role="status"></p>`,
      );
      $('[data-kb-close]').onclick = () => $('#modal').close();
      const pin = $('[data-kb-pin]');
      if (pin)
        pin.onclick = guarded(async () => {
          pin.disabled = true;
          try {
            await kb('tickets/' + encodeURIComponent(t.key) + '/links', { page_id: id, version: t.version });
            if (active()) {
              $('#modal').close();
              await refreshLinks();
              notify('Powiązano artykuł.');
            }
          } finally {
            if (pin.isConnected) pin.disabled = false;
          }
        });
      const insert = $('[data-kb-insert]');
      if (insert)
        insert.onclick = guarded(async () => {
          const composer = $('[data-w21-composer]', main),
            field = $('[name=body]', composer),
            internal = $('[name=internal]', composer)?.checked;
          if (!composer || !field) throw Error('Edytor odpowiedzi nie jest dostępny.');
          let selected = article;
          if (!internal) {
            try {
              selected = await kb('pages/' + encodeURIComponent(id), {
                project_id: t.project_id,
                public_only: true,
              });
            } catch {
              const status = $('[data-kb-modal-status]');
              status.textContent =
                'Ten artykuł nie jest dostępny publicznie. Wstaw go do notatki wewnętrznej lub wybierz publiczny artykuł.';
              return;
            }
          }
          if (!active()) return;
          field.value += (field.value.trim() ? '\n\n' : '') + selected.title + '\n' + selected.url;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          $('#modal').close();
          field.focus();
          notify('Wstawiono odnośnik do szkicu. Odpowiedź nie została wysłana.');
        });
    });
    const bindArticle = (box) =>
      $$('[data-kb-open]', box).forEach(
        (button) => (button.onclick = () => showArticle(button.dataset.kbOpen)),
      );
    const display = (results) => {
      const box = $('[data-kb-results]', host);
      box.innerHTML =
        results
          .map(
            (r) =>
              `<article class="w21-similar-item"><button type="button" data-kb-open="${e(r.id)}">${e(r.title)}</button><p>${e(r.summary)}</p><small>${e(r.language)} · ${e(r.visibility)}</small></article>`,
          )
          .join('') || '<p>Brak dopasowanych artykułów. Spróbuj innych słów.</p>';
      bindArticle(box);
    };
    const refreshLinks = async () => {
      try {
        const result = await kb('tickets/' + encodeURIComponent(t.key) + '/links', undefined, 'GET');
        if (!active()) return;
        const box = $('[data-kb-links]', host);
        box.innerHTML =
          result.links
            .map(
              (l) =>
                `<p>${l.unavailable ? 'Artykuł niedostępny lub poza aktualnym zakresem.' : `<button type="button" data-kb-open="${e(l.article.id)}">${e(l.article.title)}</button>`}${!t.archived_at && !t.project_archived && t.status !== 'closed' ? ` <button type="button" data-kb-unlink="${l.id}" aria-label="Odłącz artykuł">×</button>` : ''}</p>`,
            )
            .join('') || '<p>Brak powiązanych artykułów.</p>';
        bindArticle(box);
        $$('[data-kb-unlink]', box).forEach(
          (b) =>
            (b.onclick = guarded(async () => {
              await kb(
                'tickets/' + encodeURIComponent(t.key) + '/links',
                { link_id: Number(b.dataset.kbUnlink), version: t.version },
                'DELETE',
              );
              await refreshLinks();
            })),
        );
      } catch {
        if (active()) $('[data-kb-links]', host).textContent = 'Powiązane artykuły są chwilowo niedostępne.';
      }
    };
    const search = async (q) => {
      const token = ++generation,
        state = $('[data-kb-state]', host);
      state.textContent = 'Szukam artykułów…';
      $('[data-kb-results]', host).replaceChildren();
      try {
        const result = await kb(
          'search',
          q === undefined ? { ticket_key: t.key, suggest: true } : { ticket_key: t.key, q },
        );
        if (!active() || token !== generation) return;
        if (!result.enabled) {
          host.remove();
          return;
        }
        state.textContent =
          result.automatic === false
            ? 'Automatyczne podpowiedzi są wyłączone. Możesz wyszukać artykuł ręcznie.'
            : 'Podpowiedzi z zewnętrznej bazy wiedzy. Sprawdź treść przed użyciem.';
        display(result.results);
      } catch (err) {
        if (active() && token === generation)
          state.textContent =
            'Baza wiedzy jest chwilowo niedostępna. Możesz nadal obsługiwać zgłoszenie. ' + err.message;
      }
    };
    bindForm($('[data-kb-search]', host), async (f) => search(f.q));
    void search();
    void refreshLinks();
  }
  async function preference(update) {
    prefs = await call('preferences');
    prefs = await call('preferences', { version: prefs.version, config: { ...prefs.config, ...update } });
  }
  function modalForm(title, html, fn) {
    showModal(`<h2>${e(title)}</h2><form data-w21-modal>${html}${submit()}</form>`);
    bindForm($('[data-w21-modal]'), async (f, form) => {
      await fn(f, form);
      $('#modal').close();
    });
  }
  function command() {
    showModal(
      `<h2>Przejdź do…</h2><label>Szukaj strony lub zgłoszenia<input data-command-search placeholder="Klucz, temat, nazwa strony" autofocus autocomplete="off"></label><div data-command-results class="w21-command-results"></div>`,
    );
    const input = $('[data-command-search]'),
      host = $('[data-command-results]');
    let timer,
      token = 0;
    const pages = [
      ['queue', 'Kolejki zgłoszeń'],
      ['board', 'Tablica'],
      ['reports', 'Radar SLA i raporty'],
      ['cases?kind=incident', 'Incydenty'],
      ['cases?kind=problem', 'Problemy'],
      ['cases?kind=change', 'Zmiany'],
      ['calendar', 'Kalendarz zmian'],
      ['services', 'Usługi i zależności'],
      ['projects', 'Projekty'],
      ['portal', 'Portal zgłoszeń'],
    ];
    const render = async () => {
      const id = ++token,
        q = input.value.trim(),
        items = pages.filter((x) => x[1].toLowerCase().includes(q.toLowerCase()));
      if (q.length > 1) {
        try {
          const data = await api('/tickets?limit=8&q=' + encodeURIComponent(q));
          items.push(...data.tickets.map((t) => ['ticket/' + t.key, t.key + ' · ' + t.title]));
        } catch {}
      }
      if (id !== token || !host.isConnected) return;
      host.innerHTML =
        items.map(([url, title]) => `<a href="#/${e(url)}">${e(title)}<span>↗</span></a>`).join('') ||
        '<p>Brak wyników.</p>';
      host.querySelectorAll('a').forEach((a) => (a.onclick = () => $('#modal').close()));
    };
    input.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(render, 180);
    };
    input.onkeydown = (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        host.querySelector('a')?.click();
      }
    };
    void render();
    input.focus();
  }
  document.addEventListener('keydown', (ev) => {
    if (S.user && S.user.role !== 'customer' && (ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      command();
    }
  });
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-command]')) command();
  });
  function activity(main) {
    const tabs = $('[data-ticket-tabs]', main);
    if (!tabs) return;
    const buttons = $$('[role=tab]', tabs),
      content = $('[data-ticket-activity]', main),
      history = $('[data-ticket-history]', main),
      files = $('[data-ticket-files]', main);
    const choose = (b) => {
      const kind = b.dataset.activityTab;
      buttons.forEach((x) => {
        x.setAttribute('aria-selected', String(x === b));
        x.tabIndex = x === b ? 0 : -1;
      });
      if (content) {
        content.hidden = ['history', 'files'].includes(kind);
        content.setAttribute('aria-labelledby', b.id);
        $$('.comment', content).forEach(
          (c) =>
            (c.hidden =
              kind === 'notes' ? !c.classList.contains('internal') : c.classList.contains('internal')),
        );
      }
      if (history) history.hidden = kind !== 'history';
      if (files) files.hidden = kind !== 'files';
    };
    buttons.forEach((b) => (b.onclick = () => choose(b)));
    tabs.onkeydown = (ev) => {
      const i = buttons.indexOf(document.activeElement);
      let n;
      if (ev.key === 'ArrowRight') n = (i + 1) % buttons.length;
      else if (ev.key === 'ArrowLeft') n = (i - 1 + buttons.length) % buttons.length;
      else if (ev.key === 'Home') n = 0;
      else if (ev.key === 'End') n = buttons.length - 1;
      else return;
      ev.preventDefault();
      buttons[n].focus();
      choose(buttons[n]);
    };
    choose(buttons[0]);
    refreshActivity = () => {
      choose(buttons.find((b) => b.getAttribute('aria-selected') === 'true') || buttons[0]);
      $$('.comment p', main).forEach((p) => (p.innerHTML = markdown(p.textContent)));
    };
  }
  async function queue(main, search) {
    const workspace = document.createElement('div');
    workspace.className = 'w21-queue-workspace';
    const list = document.createElement('div');
    list.className = 'w21-queue-list';
    while (main.firstChild) list.append(main.firstChild);
    workspace.append(list);
    main.append(workspace);
    prefs = await call('preferences');
    if (!workspace.isConnected) return;
    main.dataset.queueDensity = prefs.config.density || 'comfortable';
    const project = search.get('project'),
      base = new URLSearchParams(project ? { project } : {}),
      queues = [
        ['', 'Wszystkie sprawy'],
        ['active', 'Do realizacji'],
        ['mine', 'Przypisane do mnie'],
        ['unassigned', 'Bez opiekuna'],
      ];
    const counts = await Promise.all(
      queues.map(async ([key]) => {
        const q = new URLSearchParams(base);
        if (key) q.set('queue', key);
        q.set('limit', '1');
        return (await call('queue?' + q)).total;
      }),
    );
    if (!workspace.isConnected) return;
    const aside = document.createElement('aside');
    aside.className = 'w21-queue-nav';
    aside.setAttribute('aria-label', 'Widoki kolejki');
    aside.innerHTML = `<span class="w21-eyebrow">TWOJA PRACA</span>${queues
      .map(([key, title], i) => {
        const q = new URLSearchParams(base);
        if (key) q.set('queue', key);
        return `<a href="#/queue?${e(q)}"${(search.get('queue') || '') === key ? ' aria-current="page"' : ''}>${e(title)}<b>${counts[i]}</b></a>`;
      })
      .join(
        '',
      )}<hr><span class="w21-eyebrow">ULUBIONE WIDOKI</span>${(prefs.config.favorites || []).map((f) => `<a href="#/queue?${e(f.query)}">★ ${e(f.name)}</a>`).join('')}<button data-favorite>☆ Zapisz widok</button><a href="#/reports">Radar SLA →</a>`;
    workspace.prepend(aside);
    let counterBusy = false;
    const counterTimer = setInterval(async () => {
      if (counterBusy || document.hidden || !S.user || !aside.isConnected) return;
      counterBusy = true;
      try {
        const fresh = await Promise.all(
          queues.map(async ([queue]) => {
            const q = new URLSearchParams(base);
            if (queue) q.set('queue', queue);
            q.set('limit', '1');
            return (await call('queue?' + q)).total;
          }),
        );
        if (aside.isConnected)
          $$('a>b', aside)
            .slice(0, 4)
            .forEach((b, i) => (b.textContent = fresh[i]));
      } catch {
      } finally {
        counterBusy = false;
      }
    }, 20000);
    dispose = () => clearInterval(counterTimer);
    $('[data-favorite]', aside).onclick = guarded(async () =>
      modalForm('Zapisz ulubiony widok', field('name', 'Nazwa', '', 'required maxlength="80"'), async (f) => {
        await preference({
          favorites: [
            ...(prefs.config.favorites || []).filter((x) => x.query !== search.toString()).slice(-19),
            { name: f.name, query: search.toString() },
          ],
        });
        await route();
      }),
    );
    const toolbar = document.createElement('div');
    toolbar.className = 'w21-queue-toolbar';
    toolbar.innerHTML = `<form data-expression><input name="expression" placeholder="project=IT AND priority=P1" aria-label="Zapytanie kolejki"><button>Uruchom</button></form><label>Gęstość<select data-density>${opts({ comfortable: 'Wygodna', compact: 'Kompaktowa' }, main.dataset.queueDensity)}</select></label><button data-columns>Kolumny</button><button data-bulk disabled>Operacje na zaznaczonych <b data-selection-count>0</b></button>`;
    list.querySelector('.panel')?.before(toolbar);
    $('[data-density]', toolbar).onchange = guarded(async (ev) => {
      main.dataset.queueDensity = ev.target.value;
      await preference({ density: ev.target.value });
    });
    bindForm($('[data-expression]', toolbar), async (f) => {
      await call('queue?expression=' + encodeURIComponent(f.expression) + '&limit=1');
      const q = new URLSearchParams(search);
      for (const clause of f.expression.split(/\s+AND\s+/i)) {
        const [key, value] = clause.split('=').map((s) => s.trim());
        if (key.toLowerCase() === 'project') {
          const p = S.meta.projects.find(
            (p) => p.key.toLowerCase() === value.toLowerCase() || String(p.id) === value,
          );
          q.set('project', p.id);
        } else q.set(key.toLowerCase(), value);
      }
      q.delete('page');
      location.hash = '#/queue?' + q;
    });
    const table = $('table', list),
      selection = new Map();
    if (!table) return;
    table.classList.add('w21-queue-table');
    const rows = $$('tbody tr', table),
      headrow = $('thead tr', table),
      th = document.createElement('th');
    th.innerHTML =
      '<input type="checkbox" data-select-page aria-label="Zaznacz bieżącą stronę (maksymalnie 50)">';
    headrow.prepend(th);
    const columnKeys = ['select', 'issue', 'status', 'priority', 'assignee', 'sla', 'updated'];
    [...headrow.cells].forEach((cell, index) => {
      cell.dataset.w21ColumnKey = columnKeys[index];
      const width = prefs.config.columnWidths?.[columnKeys[index]];
      if (Number.isFinite(width) && width >= 90 && width <= 1000) cell.style.width = width + 'px';
    });
    const tickets = (await call('queue?' + search)).tickets;
    if (!main.isConnected) return;
    rows.forEach((row) => {
      const link = $('a.issue-title', row);
      if (!link) return;
      const key = link.hash.split('/')[2],
        t = tickets.find((t) => t.key === key);
      if (!t) return;
      row.dataset.ticketKey = key;
      const td = document.createElement('td');
      td.innerHTML = `<input type="checkbox" data-select-ticket="${e(key)}" aria-label="Zaznacz ${e(key)}"${!t.can_work || t.project_archived || t.archived_at || t.status === 'closed' ? ' disabled' : ''}>`;
      row.prepend(td);
      [...row.cells].forEach((cell, index) => (cell.dataset.w21ColumnKey = columnKeys[index]));
      const preview = document.createElement('button');
      preview.className = 'w21-preview-button';
      preview.dataset.preview = key;
      preview.textContent = 'Podgląd';
      preview.setAttribute('aria-label', 'Podgląd ' + key);
      link.parentElement.append(preview);
      if (t.can_work && !t.project_archived && !t.archived_at && t.status !== 'closed') {
        const statusCell = row.cells[2],
          ownerCell = row.cells[4];
        statusCell.innerHTML = `<select data-inline-status="${e(key)}" aria-label="Status ${e(key)}">${opts({ [t.workflow_status]: t.status_name, ...Object.fromEntries(t.transitions.map((x) => [x.to, x.name || x.status_name])) }, t.workflow_status)}</select>`;
        ownerCell.innerHTML = `<select data-inline-owner="${e(key)}" aria-label="Opiekun ${e(key)}">${opts(Object.fromEntries(S.meta.assignees.map((u) => [u.id, u.name])), t.assignee_id, 'Nieprzypisane')}</select>`;
        $('[data-inline-status]', row).onchange = guarded(async (ev) => {
          const target = ev.target.value;
          ev.target.value = t.workflow_status;
          if (!target || target === t.workflow_status) return;
          const work = async (resolution) => {
            await call(
              'tickets/' + key,
              {
                version: t.version,
                workflow_version: t.workflow_version,
                workflow_status: target,
                resolution_text: resolution,
              },
              'PATCH',
            );
            notify('Status zapisany.');
            await route();
          };
          const project = S.meta.projects.find((p) => p.id === t.project_id),
            state = project?.workflow_statuses?.find((s) => s.key === target);
          if (state?.category === 'closed' || t.resolution_statuses?.includes(target))
            modalForm(
              'Rozwiązanie sprawy',
              area('resolution_text', 'Opis rozwiązania', t.resolution_text || '', 4),
              (f) => work(f.resolution_text),
            );
          else await work(t.resolution_text || '');
        });
        $('[data-inline-owner]', row).onchange = guarded(async (ev) => {
          ev.target.disabled = true;
          try {
            const updated = await call(
              'tickets/' + key,
              { version: t.version, assignee_id: ev.target.value ? Number(ev.target.value) : null },
              'PATCH',
            );
            Object.assign(t, updated.ticket);
            if (selection.has(key)) selection.set(key, { key, version: t.version });
            notify('Opiekun zapisany.');
          } catch (err) {
            ev.target.value = t.assignee_id || '';
            throw err;
          } finally {
            ev.target.disabled = false;
          }
        });
        const priorityCell = row.cells[3];
        priorityCell.innerHTML = `<select data-inline-priority="${e(key)}" aria-label="Priorytet ${e(key)}">${opts(S.meta.priorities, t.priority)}</select>`;
        $('[data-inline-priority]', row).onchange = guarded(async (ev) => {
          ev.target.disabled = true;
          try {
            const updated = await call(
              'tickets/' + key,
              { version: t.version, priority: ev.target.value },
              'PATCH',
            );
            Object.assign(t, updated.ticket);
            if (selection.has(key)) selection.set(key, { key, version: t.version });
            notify('Priorytet zapisany.');
          } catch (err) {
            ev.target.value = t.priority;
            throw err;
          } finally {
            ev.target.disabled = false;
          }
        });
      }
      const box = $('[data-select-ticket]', row);
      box.onchange = () => {
        if (box.checked && selection.size < 50) selection.set(key, { key, version: t.version });
        else {
          box.checked = false;
          selection.delete(key);
        }
        update();
      };
    });
    function update() {
      $('[data-selection-count]', toolbar).textContent = selection.size;
      $('[data-bulk]', toolbar).disabled = !selection.size;
    }
    $('[data-select-page]', table).onchange = (ev) => {
      $$('[data-select-ticket]:not(:disabled)', table).forEach((b, i) => {
        b.checked = ev.target.checked && i < 50;
        b.onchange();
      });
    };
    $('[data-bulk]', toolbar).onclick = () =>
      modalForm(
        'Operacja zbiorcza',
        select('action', 'Operacja', {
          priority: 'Priorytet',
          assign: 'Opiekun',
          note: 'Notatka wewnętrzna',
        }) +
          field('value', 'Wartość (P1–P4, ID opiekuna lub tekst)', '', 'required') +
          '<p>Każda sprawa zostanie sprawdzona osobno. Konflikty i brak uprawnień pojawią się w wyniku.</p>',
        async (f) => {
          const value = f.action === 'assign' ? (f.value === 'null' ? null : Number(f.value)) : f.value,
            key = crypto.randomUUID(),
            result = await call('bulk', {
              items: [...selection.values()],
              action: f.action,
              value,
              request_key: key,
            });
          notify(
            result.results.filter((x) => x.ok).length + ' / ' + result.results.length + ' spraw zapisano.',
          );
          const failed = result.results.filter((x) => !x.ok);
          await route();
          if (failed.length)
            showModal(
              '<h2>Sprawy wymagające ponowienia</h2>' +
                failed.map((x) => `<p>${e(x.key)} · ${e(x.error)}</p>`).join(''),
            );
        },
      );
    $('[data-columns]', toolbar).onclick = () => {
      showModal(
        '<h2>Kolumny kolejki</h2><p>Przeciągnij nagłówki, aby zmienić kolejność. Krawędź kolumny zmienia szerokość.</p>' +
          $$('th', headrow)
            .slice(1)
            .map(
              (h, i) =>
                `<label class="check"><input type="checkbox" data-column="${i + 1}"${h.hidden ? '' : ' checked'}>${e(h.textContent.trim())}</label>`,
            )
            .join(''),
      );
      $$('[data-column]', $('#modal')).forEach(
        (box) =>
          (box.onchange = guarded(async () => {
            const index = Number(box.dataset.column);
            $$('tr', table).forEach((r) => {
              if (r.cells[index]) r.cells[index].hidden = !box.checked;
            });
            await preference({
              hiddenColumns: $$('th', headrow)
                .map((x, i) => (x.hidden ? i : null))
                .filter((x) => x !== null),
            });
          })),
      );
    };
    (prefs.config.hiddenColumns || []).forEach((i) =>
      $$('tr', table).forEach((r) => {
        if (r.cells[i]) r.cells[i].hidden = true;
      }),
    );
    $$('th', headrow)
      .slice(1)
      .forEach((h, i) => {
        h.draggable = true;
        h.ondragstart = (ev) => ev.dataTransfer.setData('text/plain', String(h.cellIndex));
        h.ondragover = (ev) => ev.preventDefault();
        h.ondrop = guarded(async (ev) => {
          ev.preventDefault();
          const from = Number(ev.dataTransfer.getData('text/plain')),
            to = h.cellIndex;
          if (!Number.isInteger(from) || from < 1 || from >= headrow.cells.length || from === to) return;
          $$('tr', table).forEach((r) => {
            const cell = r.cells[from],
              target = r.cells[to];
            if (cell && target) r.insertBefore(cell, from < to ? target.nextSibling : target);
          });
          await preference({ columnOrder: [...headrow.cells].map((c) => c.dataset.w21ColumnKey) });
        });
        const grip = document.createElement('button');
        grip.className = 'w21-column-grip';
        grip.setAttribute('aria-label', 'Zmień szerokość ' + h.textContent);
        grip.textContent = '↔';
        h.append(grip);
        grip.onpointerdown = (ev) => {
          ev.preventDefault();
          const start = ev.clientX,
            width = h.getBoundingClientRect().width;
          grip.setPointerCapture(ev.pointerId);
          grip.onpointermove = (e) => {
            h.style.width = Math.max(90, width + e.clientX - start) + 'px';
          };
          grip.onpointerup = guarded(async () => {
            grip.onpointermove = null;
            await preference({
              columnWidths: {
                ...(prefs.config.columnWidths || {}),
                [h.dataset.w21ColumnKey]: Math.round(h.getBoundingClientRect().width),
              },
            });
          });
        };
      });
    const pane = document.createElement('aside');
    pane.className = 'w21-preview';
    pane.hidden = true;
    pane.setAttribute('aria-label', 'Podgląd zgłoszenia');
    workspace.append(pane);
    let previewToken = 0;
    $$('[data-preview]', table).forEach(
      (b) =>
        (b.onclick = guarded(async () => {
          const token = ++previewToken;
          pane.hidden = false;
          workspace.classList.add('w21-with-preview');
          pane.innerHTML = '<p>Wczytywanie…</p>';
          const { ticket: t, comments } = await api('/tickets/' + encodeURIComponent(b.dataset.preview));
          if (token !== previewToken || !pane.isConnected) return;
          pane.innerHTML = `<button data-preview-close aria-label="Zamknij podgląd">×</button><span class="w21-eyebrow">${e(t.key)}</span><h2>${e(t.title)}</h2>${badge(t.status)}<p>${e(t.description)}</p><dl><dt>Opiekun</dt><dd>${e(t.assignee_name || 'Nieprzypisane')}</dd><dt>Priorytet</dt><dd>${e(t.priority)}</dd></dl><a class="button primary" href="#/ticket/${e(t.key)}">Otwórz pełne zgłoszenie →</a><h3>Ostatnia aktywność</h3>${comments
            .slice(-3)
            .map(
              (c) =>
                `<article class="w21-preview-comment"><strong>${e(c.author_name)}</strong>${c.internal ? badge('Wewnętrzna') : ''}<p>${e(c.body)}</p><small>${date(c.created_at)}</small></article>`,
            )
            .join('')}`;
          $('[data-preview-close]', pane).onclick = () => {
            previewToken++;
            pane.hidden = true;
            workspace.classList.remove('w21-with-preview');
          };
        })),
    );
  }
  async function ticket(main, key) {
    const t = S.ticket,
      extras = await call('tickets/' + encodeURIComponent(key));
    if (!main.isConnected || S.ticket !== t) return;
    main.classList.add('w21-ticket');
    activity(main);
    const tools = $('.ticket-tools', main);
    if (tools) {
      const details = document.createElement('details');
      details.className = 'w21-ticket-more';
      details.innerHTML = '<summary>Więcej działań</summary>';
      tools.before(details);
      details.append(tools);
    }
    $$('.comment p', main).forEach((p) => (p.innerHTML = markdown(p.textContent)));
    const csat = extras.csat
      ? panel('Ocena obsługi', `<strong>${extras.csat.rating} / 5 ★</strong><p>${e(extras.csat.body)}</p>`)
      : extras.can_rate
        ? panel(
            'Jak oceniasz pomoc?',
            `<form data-csat>${select('rating', 'Ocena', { 1: '1 · bardzo źle', 2: '2 · źle', 3: '3 · przeciętnie', 4: '4 · dobrze', 5: '5 · świetnie' }, 5)}${area('body', 'Co możemy poprawić?', '', 2)}${submit('Wyślij ocenę')}</form>`,
          )
        : '';
    const host = $('.ticket-layout>div', main) || main;
    if (csat) host.insertAdjacentHTML('beforeend', csat);
    bindForm($('[data-csat]', main), async (f) => {
      await call('tickets/' + key + '/csat', { rating: Number(f.rating), body: f.body });
      notify('Dziękujemy za ocenę.');
      await route();
    });
    const editable =
      t.can_work && !S.portalMode && !t.project_archived && !t.archived_at && t.status !== 'closed';
    if (t.can_work && !S.portalMode) {
      const sidebar = $('.ticket-sidebar', main) || host;
      if (S.meta.projects.find((p) => p.id === t.project_id)?.knowledge_enabled)
        knowledgePanel(main, t, sidebar);
      const insight = await call('tickets/' + encodeURIComponent(key) + '/insights');
      if (!main.isConnected || S.ticket !== t) return;
      if (insight.config.attention)
        sidebar.insertAdjacentHTML(
          'beforeend',
          panel(
            'Warto sprawdzić',
            `<ul class="w21-attention">${insight.attention.map((a) => `<li>${e(a.label)}</li>`).join('') || '<li>Brak sygnałów wymagających uwagi.</li>'}</ul><small>Sygnały pomocnicze; nie zmieniają priorytetu ani SLA.</small>`,
          ),
        );
      if (insight.handover !== null) {
        sidebar.insertAdjacentHTML(
          'beforeend',
          panel(
            'Przekazanie sprawy',
            '<p>Podsumowanie stanu i następnych kroków.</p><button type="button" data-handover>Przejrzyj i skopiuj</button>',
          ),
        );
        $('[data-handover]', sidebar).onclick = () => {
          showModal(
            `<h2>Podsumowanie do przekazania</h2><p>${e(insight.definition)}</p><textarea data-handover-text readonly rows="12" aria-label="Podsumowanie zgłoszenia">${e(insight.handover)}</textarea><div class="button-row"><button type="button" data-copy-handover class="primary">Kopiuj podsumowanie</button><button type="button" data-close-handover>Zamknij</button></div>`,
          );
          $('[data-close-handover]').onclick = () => $('#modal').close();
          $('[data-copy-handover]').onclick = guarded(async () => {
            const area = $('[data-handover-text]');
            area.focus();
            area.select();
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(area.value);
              notify('Skopiowano podsumowanie.');
            } else notify('Zaznaczono podsumowanie. Użyj Ctrl+C.');
          });
        };
      }
      sidebar.insertAdjacentHTML(
        'beforeend',
        panel(
          'Ewidencja pracy',
          `<div class="w21-worklog-total"><strong>${extras.worklogs.reduce((n, w) => n + w.minutes, 0)} min</strong><span>zarejestrowanej pracy</span></div><p>Plan: ${extras.estimate.estimated_minutes} min · pozostało: ${extras.estimate.remaining_minutes} min</p>${editable ? '<div class="button-row"><button data-worklog>Dodaj pracę</button><button data-timer>▶ Uruchom licznik</button><button data-estimate>Estymacja</button></div>' : ''}<details><summary>Wpisy (${extras.worklogs.length})</summary>${extras.worklogs.map((w) => `<p><strong>${w.minutes} min · ${e(w.user_name)}</strong><br>${e(w.body)}<br><small>${date(w.started_at)}</small></p>`).join('')}</details>`,
        ),
      );
      const addLog = (minutes, onSaved) =>
        modalForm(
          'Zarejestruj pracę',
          field('minutes', 'Liczba minut', minutes || 15, 'type="number" min="1" max="10080" required') +
            area('body', 'Opis wykonanej pracy', '', '3'),
          async (f) => {
            await call('tickets/' + key + '/worklogs', {
              request_key: crypto.randomUUID(),
              minutes: Number(f.minutes),
              body: f.body,
            });
            onSaved?.();
            await route();
          },
        );
      $('[data-worklog]', main)?.addEventListener('click', () => addLog());
      const timerKey = 'desk:timer:' + S.user.id + ':' + key;
      let start = Number(localStorage.getItem(timerKey));
      const timer = $('[data-timer]', main);
      if (timer) {
        if (start) timer.textContent = '■ Zatrzymaj i zapisz';
        timer.onclick = () => {
          if (start) {
            const minutes = Math.max(1, Math.ceil((Date.now() - start) / 60000));
            addLog(minutes, () => {
              localStorage.removeItem(timerKey);
              start = 0;
            });
          } else {
            start = Date.now();
            localStorage.setItem(timerKey, start);
            timer.textContent = '■ Zatrzymaj i zapisz';
          }
        };
      }
      $('[data-estimate]', main)?.addEventListener('click', () =>
        modalForm(
          'Estymacja pracy',
          field(
            'estimated_minutes',
            'Plan (min)',
            extras.estimate.estimated_minutes,
            'type="number" min="0" required',
          ) +
            field(
              'remaining_minutes',
              'Pozostało (min)',
              extras.estimate.remaining_minutes,
              'type="number" min="0" required',
            ),
          async (f) => {
            await call('tickets/' + key + '/estimate', {
              version: extras.estimate.version,
              estimated_minutes: Number(f.estimated_minutes),
              remaining_minutes: Number(f.remaining_minutes),
            });
            await route();
          },
        ),
      );
      host.insertAdjacentHTML(
        'beforeend',
        panel(
          'Lista zadań',
          `${extras.checklist.map((c) => `<label class="check"><input type="checkbox" data-checklist="${c.id}"${c.done ? ' checked' : ''}${editable ? '' : ' disabled'}>${e(c.label)}${c.owner_name ? ' · ' + e(c.owner_name) : ''}</label>`).join('')}${editable ? '<form data-checklist-add><input name="label" placeholder="Dodaj krok do wykonania" aria-label="Nowe zadanie" required minlength="2" maxlength="300"><button>Dodaj</button></form><div class="button-row"><button data-runbook="vpn">Runbook VPN</button><button data-runbook="ldap">Runbook LDAP</button><button data-runbook="mail">Runbook poczta</button><button data-runbook="soc">Runbook SOC</button></div>' : ''}`,
        ),
      );
      $$('[data-checklist]', main).forEach(
        (box) =>
          (box.onchange = guarded(async () => {
            const c = extras.checklist.find((x) => x.id === Number(box.dataset.checklist));
            await call('tickets/' + key + '/checklist', { id: c.id, version: c.version, done: box.checked });
            await route();
          })),
      );
      bindForm($('[data-checklist-add]', main), async (f) => {
        await call('tickets/' + key + '/checklist', { label: f.label });
        await route();
      });
      const runbooks = {
        vpn: [
          'Ustal zakres awarii i godzinę wystąpienia',
          'Zweryfikuj połączenie internetowe i status bramy VPN',
          'Sprawdź certyfikat i metodę MFA',
          'Wykonaj test połączenia z użytkownikiem',
        ],
        ldap: [
          'Zweryfikuj zakres problemu oraz konto użytkownika',
          'Sprawdź DNS, czas i łączność kontrolera domeny',
          'Sprawdź stan konta i członkostwa grup',
          'Potwierdź logowanie po zmianie',
        ],
        mail: [
          'Ustal nadawcę, odbiorcę i Message-ID',
          'Sprawdź stan kolejek i logi transportu',
          'Sprawdź DNS, SPF, DKIM oraz DMARC',
          'Potwierdź dostarczenie z użytkownikiem',
        ],
        soc: [
          'Zabezpiecz identyfikatory alertu i linię czasu',
          'Ustal wpływ i właściciela zasobu',
          'Przeprowadź analizę dowodów zgodnie z procedurą',
          'Uzyskaj zgodę na działania naprawcze',
          'Potwierdź skuteczność i zapisz wnioski',
        ],
      };
      $$('[data-runbook]', main).forEach(
        (b) =>
          (b.onclick = guarded(async () => {
            for (const label of runbooks[b.dataset.runbook])
              await call('tickets/' + key + '/checklist', { label });
            await route();
          })),
      );
      sidebar.insertAdjacentHTML(
        'beforeend',
        panel(
          'Usługi',
          `${extras.services.map((s) => `<p><a href="#/service/${s.id}">${e(s.name)}</a> ${badge(s.state)}</p>`).join('') || '<p>Brak przypiętych usług.</p>'}${editable ? '<button data-ticket-service>Powiąż usługę</button>' : ''}`,
        ),
      );
      $('[data-ticket-service]', main)?.addEventListener(
        'click',
        guarded(async () => {
          const services = await call('services');
          modalForm(
            'Powiąż usługę',
            select('service_id', 'Usługa', Object.fromEntries(services.map((s) => [s.id, s.name]))),
            async (f) => {
              await call('tickets/' + key + '/services', { service_id: Number(f.service_id) });
              await route();
            },
          );
        }),
      );
      if (extras.cases.length)
        host.insertAdjacentHTML(
          'beforeend',
          panel(
            'Sprawy operacyjne',
            extras.cases
              .map(
                (c) =>
                  `<p><a href="#/case/${c.id}">${e(names[c.kind])} #${c.id} · ${e(c.title)}</a> ${badge(c.state)}</p>`,
              )
              .join(''),
          ),
        );
    }
    const composer = $('[data-form=comment]', main);
    if (composer) {
      composer.removeAttribute('data-form');
      composer.dataset.w21Composer = '1';
      const textarea = $('[name=body]', composer),
        internal = $('[name=internal]', composer),
        draftKey = (mode) => 'desk:draft:' + S.user.id + ':' + key + ':' + mode,
        mode = () => (internal?.checked ? 'internal' : 'public');
      const draftModeKey = 'desk:draft-mode:' + S.user.id + ':' + key;
      if (internal) {
        internal.checked = localStorage.getItem(draftModeKey) === 'internal';
        composer.classList.toggle('w21-internal', internal.checked);
      }
      textarea.value = localStorage.getItem(draftKey(mode())) || '';
      let lastMode = mode(),
        sending = false;
      const bar = document.createElement('div');
      bar.className = 'w21-composer-toolbar';
      bar.innerHTML =
        '<button type="button" data-format="bold" aria-label="Pogrubienie">B</button><button type="button" data-format="code" aria-label="Kod">&lt;/&gt;</button><button type="button" data-format="quote" aria-label="Cytat">❞</button><button type="button" data-message-preview>Podgląd</button><span data-draft-status>Szkic lokalny</span>';
      composer.prepend(bar);
      const preview = document.createElement('div');
      preview.className = 'w21-markdown-preview';
      preview.hidden = true;
      textarea.after(preview);
      $$('[data-format]', bar).forEach(
        (b) =>
          (b.onclick = () => {
            const a = textarea.selectionStart,
              z = textarea.selectionEnd,
              selected = textarea.value.slice(a, z) || 'tekst',
              mark = b.dataset.format === 'bold' ? '**' : b.dataset.format === 'code' ? '`' : '> ';
            textarea.setRangeText(mark + selected + (b.dataset.format === 'quote' ? '' : mark), a, z, 'end');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.focus();
          }),
      );
      $('[data-message-preview]', bar).onclick = () => {
        preview.innerHTML = markdown(textarea.value);
        preview.hidden = !preview.hidden;
      };
      if (editable) {
        const templates = await call('reply-templates?project=' + t.project_id);
        if (!main.isConnected) return;
        const label = document.createElement('label');
        label.textContent = 'Gotowa odpowiedź';
        const pick = document.createElement('select');
        pick.innerHTML = opts(
          Object.fromEntries(templates.map((x) => [x.id, x.name])),
          '',
          'Wybierz szablon',
        );
        label.append(pick);
        bar.after(label);
        if (S.meta.projects.find((p) => p.id === t.project_id)?.can_manage)
          label.insertAdjacentHTML(
            'beforeend',
            `<a href="#/replies/${t.project_id}">Zarządzaj odpowiedziami →</a>`,
          );
        pick.onchange = () => {
          const item = templates.find((x) => x.id === Number(pick.value));
          if (!item) return;
          if (internal && Boolean(item.internal) !== internal.checked) {
            internal.checked = Boolean(item.internal);
            internal.dispatchEvent(new Event('change'));
          }
          textarea.value = item.body
            .replaceAll('{{ticket.key}}', t.key)
            .replaceAll('{{ticket.title}}', t.title)
            .replaceAll('{{reporter.name}}', t.reporter_name || '');
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        };
        composer.insertAdjacentHTML(
          'beforeend',
          select(
            'workflow_status',
            'Po wysłaniu',
            { ...Object.fromEntries(t.transitions.map((x) => [x.to, x.name || x.status_name])) },
            '',
            'Pozostaw bieżący status',
          ) + area('resolution_text', 'Rozwiązanie przy zmianie statusu (jeśli wymagane)', '', 2),
        );
      }
      internal?.addEventListener('change', () => {
        localStorage.setItem(draftKey(lastMode), textarea.value);
        lastMode = mode();
        localStorage.setItem(draftModeKey, lastMode);
        textarea.value = localStorage.getItem(draftKey(lastMode)) || '';
        composer.classList.toggle('w21-internal', internal.checked);
      });
      textarea.addEventListener('input', () => {
        localStorage.setItem(draftKey(mode()), textarea.value);
        $('[data-draft-status]', bar).textContent = 'Szkic zapisany';
      });
      bindForm(composer, async (f) => {
        if (sending) return;
        sending = true;
        const payload = {
          body: f.body,
          internal: mode() === 'internal',
          version: S.ticket.version,
          ...(f.workflow_status
            ? { workflow_status: f.workflow_status, resolution_text: f.resolution_text }
            : {}),
        };
        const sentMode = mode(),
          signature = JSON.stringify(payload),
          id = requestKeys.get(signature) || crypto.randomUUID();
        requestKeys.set(signature, id);
        try {
          await call('tickets/' + key + '/comments', { ...payload, request_key: id });
          localStorage.removeItem(draftKey(sentMode));
          requestKeys.delete(signature);
          notify('Wiadomość wysłana.');
          await route();
        } finally {
          sending = false;
        }
      });
      // Capture upload data before inserting attachments; never send arbitrary URLs or execute markup.
      textarea.addEventListener(
        'paste',
        guarded(async (ev) => {
          const files = [...(ev.clipboardData?.files || [])];
          if (!files.length) return;
          ev.preventDefault();
          await upload(files);
        }),
      );
      composer.addEventListener('dragover', (ev) => ev.preventDefault());
      composer.addEventListener(
        'drop',
        guarded(async (ev) => {
          ev.preventDefault();
          await upload([...ev.dataTransfer.files]);
        }),
      );
      async function upload(files) {
        for (const file of files) {
          if (file.size > 2 * 1024 * 1024) throw Error('Maksymalny rozmiar pliku: 2 MB.');
          const data = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result).split(',')[1]);
            r.onerror = reject;
            r.readAsDataURL(file);
          });
          await api('/desk/r112/attachments', {
            method: 'POST',
            data: {
              ticket_key: key,
              filename: file.name,
              mime: file.type || 'application/octet-stream',
              internal: mode() === 'internal',
              data_base64: data,
            },
          });
        }
        notify('Dodano ' + files.length + ' załączników.');
        window.DeskLegacyMount?.attachmentsRefresh?.();
      }
    }
    if (editable) {
      const presence = document.createElement('p');
      presence.className = 'w21-presence';
      presence.setAttribute('role', 'status');
      $('.page-heading', main)?.after(presence);
      const pulse = async () => {
        try {
          const people = await call('tickets/' + key + '/presence', {
            mode: composer && document.activeElement === $('textarea', composer) ? 'writing' : 'viewing',
          });
          if (presence.isConnected)
            presence.textContent = people.length
              ? people.map((x) => x.name + (x.mode === 'writing' ? ' pisze…' : ' ogląda')).join(' · ')
              : '';
        } catch {}
      };
      void pulse();
      const timer = setInterval(pulse, 20000);
      dispose = () => clearInterval(timer);
    }
  }
  function serviceMap(s, g) {
    const levels = new Map(),
      walk = (id, seen = new Set()) => {
        if (levels.has(id)) return levels.get(id);
        if (seen.has(id)) return 0;
        const chain = new Set([...seen, id]),
          deps = g.edges.filter((e) => e.service_id === id).map((e) => walk(e.depends_on, chain)),
          rank = deps.length ? 1 + Math.max(...deps) : 0;
        levels.set(id, rank);
        return rank;
      };
    g.services.forEach((n) => walk(n.id));
    const rows = new Map(),
      positions = new Map();
    g.services.forEach((n) => {
      const rank = levels.get(n.id),
        index = rows.get(rank) || 0;
      rows.set(rank, index + 1);
      positions.set(n.id, { x: 24 + index * 245, y: 24 + rank * 130 });
    });
    const width = Math.max(650, ...[...positions.values()].map((p) => p.x + 230)),
      height = Math.max(260, ...[...positions.values()].map((p) => p.y + 106));
    return `<div class="w21-service-graph"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mapa usług; strzałki prowadzą do wymaganych komponentów"><defs><marker id="service-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z"/></marker></defs>${g.edges
      .map((edge) => {
        const a = positions.get(edge.service_id),
          b = positions.get(edge.depends_on);
        return `<path class="w21-service-edge" d="M${a.x + 105} ${a.y} C${a.x + 105} ${a.y - 30} ${b.x + 105} ${b.y + 125} ${b.x + 105} ${b.y + 82}" marker-end="url(#service-arrow)"/>`;
      })
      .join('')}${g.services
      .map((node) => {
        const p = positions.get(node.id);
        return `<a href="#/service/${node.id}" aria-label="${e(node.name)} · ${e(states[node.state])}"><g transform="translate(${p.x},${p.y})" class="w21-service-node${node.id === s.id ? ' w21-focus' : ''}"><rect width="210" height="82" rx="12"/><text x="15" y="27">${e(node.name.length > 25 ? node.name.slice(0, 23) + '…' : node.name)}</text><text x="15" y="48" class="w21-node-state">${e(states[node.state])}</text>${g.impacted.includes(node.id) ? '<text x="15" y="67" class="w21-node-state">Potencjalny wpływ awarii</text>' : ''}</g></a>`;
      })
      .join('')}</svg></div>`;
  }
  async function render(view, key, search) {
    const routeToken = S.routeId;
    if (view === 'assist') {
      const d = await call('assistance/' + key);
      if (routeToken === S.routeId) S.ticketAssistance = d;
      const checks = [
        ['similar', 'Wykrywaj podobne zgłoszenia'],
        ['attention', 'Pokazuj sygnały wymagające uwagi'],
        ['handover', 'Udostępniaj podsumowanie do przekazania'],
      ];
      return (
        head('PROJEKT · USPRAWNIENIA', 'Podpowiedzi i usprawnienia') +
        panel(
          'Opcje projektu',
          `<p>Wszystkie opcje są domyślnie wyłączone. Podobieństwo sprawdzane jest lokalnie, bez wysyłania danych do zewnętrznej AI. Wyniki przestrzegają uprawnień do zgłoszeń.</p><form data-assistance-settings>${checks.map(([name, label]) => `<label class="check"><input type="checkbox" name="${name}"${d.config[name] ? ' checked' : ''}>${label}</label>`).join('')}${field('threshold', 'Minimalna ocena podobieństwa · 20–100', d.config.threshold, 'type="number" min="20" max="100" required')}${field('stale_days', 'Sygnał po dniach bez aktualizacji · 1–30', d.config.stale_days, 'type="number" min="1" max="30" required')}<p class="hint">Porównujemy tematy do 2000 ostatnio aktualizowanych, dostępnych zgłoszeń tego projektu. Wynik to dopasowanie słów, nie pewność duplikatu. Podsumowanie nie zawiera notatek wewnętrznych.</p>${submit()}</form>`,
        )
      );
    }
    if (view === 'integrations') {
      const rows = await api('/desk/v8/integration-health');
      return (
        head('ADMINISTRACJA', 'Stan integracji') +
        `<p>Stan odzwierciedla ostatnią kontrolę połączenia. Sama konfiguracja nie potwierdza działania usługi.</p><div class="w21-service-grid">${rows.map((r) => panel(r.integration_key, `${badge(r.state)}<p>${e(r.message)}</p><small>${r.checked_at ? date(r.checked_at) : 'Brak zakończonej kontroli'}${r.latency_ms !== null ? ' · ' + r.latency_ms + ' ms' : ''}</small><p><a href="#/${e({ ldap: 'directory', mail: 'admin/mail', smtp: 'admin/mail', github: 'settings?section=github', sso: 'admin/sso', webhooks: 'admin/webhooks' }[r.integration_key] || 'settings?section=integrations')}">Konfiguracja i test połączenia →</a></p>`)).join('')}</div>`
      );
    }
    if (view === 'replies') {
      const rows = await call('reply-templates?project=' + key);
      if (routeToken === S.routeId) S.replyTemplates = rows;
      return (
        head(
          'PROJEKT · KOMUNIKACJA',
          'Gotowe odpowiedzi',
          '<button data-reply-new class="primary">+ Nowy szablon</button>',
        ) +
        rows
          .map((r) =>
            panel(
              r.name,
              `${badge(r.internal ? 'Wewnętrzna' : 'Publiczna')}<div class="prose">${e(r.body)}</div><button data-reply-edit="${r.id}">Edytuj</button>`,
            ),
          )
          .join('') +
        (rows.length ? '' : '<p>Dodaj odpowiedzi, które zespół będzie wybierał w zgłoszeniu.</p>')
      );
    }
    if (view === 'reports') {
      const d = await call('reports?' + search);
      return (
        head(
          'OPERACJE',
          'Radar i wyniki obsługi',
          `<a class="button" href="#/queue">Przejdź do pracy →</a>`,
        ) +
        `<div class="w21-kpis">${[
          ['Aktywne', d.totals.open || 0],
          ['Bez opiekuna', d.totals.unassigned || 0],
          ['Rozwiązane', d.totals.resolved || 0],
          ['CSAT', d.csat.average ? d.csat.average.toFixed(2) + ' / 5' : 'Brak ocen'],
        ]
          .map(([n, v]) => `<article><span>${e(n)}</span><strong>${e(v)}</strong></article>`)
          .join(
            '',
          )}</div><div class="w21-report-grid">${panel('Radar SLA', `<p>Najpilniejsze sprawy: termin w ciągu 30 min lub po terminie.</p>${d.radar.map((t) => `<a class="w21-radar-row" href="#/ticket/${e(t.key)}"><b>${e(t.priority)}</b><span><strong>${e(t.key)}</strong> ${e(t.title)}</span><span>${t.sla.some((x) => x.breached) ? 'Po terminie' : 'Wkrótce termin'}</span></a>`).join('') || '<p>Brak spraw wymagających interwencji w badanej próbie.</p>'}<small>${e(d.definitions.radar)} Sprawdzono ${d.radar_examined}.</small>`)}${panel('Obciążenie zespołu', d.load.map((x) => `<div class="w21-bar-row"><span>${e(x.name || 'Nieprzypisane')}</span><meter min="0" max="${Math.max(1, ...d.load.map((x) => x.count))}" value="${x.count}"></meter><b>${x.count}</b></div>`).join('') || '<p>Brak aktywnych spraw.</p>')}${panel('Utworzone i rozwiązane · 30 dni', `<div class="table-scroll"><table><thead><tr><th>Dzień (UTC)</th><th>Utworzone</th><th>Rozwiązane</th></tr></thead><tbody>${d.daily.map((x) => `<tr><td>${e(x.day)}</td><td>${x.created}</td><td>${x.resolved}</td></tr>`).join('')}</tbody></table></div>`)}${panel('Czasy i praca', `<p>Pierwsza odpowiedź: <strong>${Math.round(d.totals.response_minutes || 0)} min</strong></p><p>Rozwiązanie: <strong>${Math.round(d.totals.resolution_minutes || 0)} min</strong></p><small>${e(d.definitions.response_minutes)} ${e(d.definitions.resolution_minutes)}</small><h3>Ewidencja pracy</h3>${d.worklogs.map((x) => `<p>${e(x.name)} <strong>${x.minutes} min</strong></p>`).join('')}<p>${d.csat.responses} ocen CSAT</p>`)}</div>`
      );
    }
    if (view === 'cases') {
      const kind = search.get('kind') || 'incident',
        d = await call('cases?' + new URLSearchParams({ ...Object.fromEntries(search), kind }));
      return (
        head(
          'IT SERVICE MANAGEMENT',
          names[kind],
          '<button class="primary" data-case-new>+ Nowa sprawa</button>',
        ) +
        `<nav class="w21-tabs">${Object.entries(names)
          .map(([k, n]) => `<a href="#/cases?kind=${k}"${k === kind ? ' aria-current="page"' : ''}>${n}</a>`)
          .join(
            '',
          )}<a href="#/calendar">Kalendarz zmian</a></nav><section class="w21-panel"><div class="table-scroll"><table><thead><tr><th>Sprawa operacyjna</th><th>Stan</th><th>Wpływ / usługa</th><th>Właściciel</th><th>Aktualizacja</th></tr></thead><tbody>${d.map((c) => `<tr><td><a href="#/case/${c.id}"><strong>${e(c.title)}</strong></a><small>#${c.id} · ${e(c.severity)}</small></td><td>${badge(c.state)}</td><td>${e(c.service_name || 'Nie wskazano usługi')}</td><td>${e(c.owner_name || 'Nieprzypisane')}</td><td>${date(c.updated_at)}</td></tr>`).join('') || '<tr><td colspan="5">Brak spraw. Utwórz pierwszą i powiąż zgłoszenia.</td></tr>'}</tbody></table></div></section>`
      );
    }
    if (view === 'case') {
      const c = await call('cases/' + key);
      if (routeToken === S.routeId) S.operationCase = c;
      return (
        head(names[c.kind] + ' · #' + c.id, c.title, `<button data-case-edit>Edytuj szczegóły</button>`) +
        `<div class="w21-case-meta">${badge(c.state)} ${badge(c.severity)} ${c.kind === 'change' ? badge(c.risk) : ''}<a href="#/cases?kind=${e(c.kind)}">Wszystkie ${e(names[c.kind].toLowerCase())} →</a></div><div class="w21-case-layout"><div>${panel('Opis i wpływ', `<div class="prose">${e(c.summary)}</div>`)}${panel(c.kind === 'problem' ? 'Analiza przyczyny' : 'Plan i podsumowanie', `<dl><dt>Przyczyna źródłowa</dt><dd>${e(c.root_cause || 'Nie ustalono')}</dd><dt>Obejście</dt><dd>${e(c.workaround || 'Brak')}</dd><dt>Rollback</dt><dd>${e(c.rollback_plan || 'Brak')}</dd><dt>Post-mortem</dt><dd>${e(c.postmortem || 'Nie sporządzono')}</dd></dl>${c.known_error ? badge('Znany błąd') : ''}`)}${panel('Zadania operacyjne', `${c.tasks.map((t) => `<label class="check"><input type="checkbox" data-case-task="${t.id}"${t.done ? ' checked' : ''}>${e(t.label)}</label>`).join('')}<form data-case-task-add><input name="label" aria-label="Nowe zadanie operacyjne" placeholder="Kolejny krok" required minlength="2" maxlength="300"><button>Dodaj</button></form>`)}${panel('Oś czasu i komunikacja', `<form data-case-message>${area('body', 'Aktualizacja sytuacji', '', '3')}<label class="check"><input type="checkbox" name="public">Opublikuj odpowiedź w powiązanych zgłoszeniach</label><p class="hint">Publiczna wiadomość trafi do klientów powiązanych spraw. Wynik pokaże pominięte zgłoszenia.</p>${submit('Dodaj aktualizację')}</form><ol class="w21-timeline">${c.events.map((ev) => `<li><strong>${e(ev.actor_name || 'System')}</strong> <small>${date(ev.created_at)}</small>${ev.public ? badge('Publiczny komunikat') : ''}<p>${e(ev.body)}</p></li>`).join('')}</ol>`)}</div><aside>${panel('Koordynacja', `<p>Projekt: ${e(S.meta.projects.find((p) => p.id === c.project_id)?.name)}</p><p>Właściciel: ${e(S.meta.assignees.find((u) => u.id === c.owner_id)?.name || 'Nieprzypisane')}</p>${c.service_id ? `<a href="#/service/${c.service_id}">Wpływ na usługę →</a>` : ''}${c.starts_at ? `<p>${date(c.starts_at)} → ${date(c.ends_at)}</p>` : ''}${c.kind === 'change' && c.can_manage ? '<div class="button-row"><button data-case-state="approved">Zatwierdź</button><button data-case-state="rejected">Odrzuć</button></div>' : ''}`)}${panel('Powiązane zgłoszenia', `${c.tickets.map((t) => `<p><a href="#/ticket/${e(t.key)}">${e(t.key)}</a> · ${e(t.title)}</p>`).join('') || '<p>Brak powiązań.</p>'}<form data-case-link>${field('key', 'Klucz zgłoszenia', '', 'required')}<button>Powiąż</button></form>`)}</aside></div>`
      );
    }
    if (view === 'services') {
      const rows = await call('services?' + search);
      return (
        head(
          'KATALOG TECHNICZNY',
          'Usługi i zależności',
          '<button class="primary" data-service-new>+ Nowa usługa</button>',
        ) +
        `<div class="w21-service-grid">${rows.map((s) => `<a class="w21-service-card" href="#/service/${s.id}"><span class="w21-service-symbol">◈</span>${badge(s.state)}<h2>${e(s.name)}</h2><p>${e(s.description)}</p><small>${e(s.owner_name || 'Właściciel nieprzypisany')} · ${e(S.meta.projects.find((p) => p.id === s.project_id)?.key)}</small><b>Zależności i wpływ →</b></a>`).join('') || '<p>Dodaj usługi, aby śledzić ich stan i wpływ awarii.</p>'}</div>`
      );
    }
    if (view === 'service') {
      const [s, g] = await Promise.all([call('services/' + key), call('services/' + key + '/graph')]);
      if (routeToken === S.routeId) S.managedService = s;
      if (routeToken === S.routeId) S.serviceGraph = g;
      return (
        head('USŁUGA', s.name, s.can_manage ? '<button data-service-edit>Edytuj usługę</button>' : '') +
        `${badge(s.state)}<p>${e(s.description)}</p><div class="w21-service-layout">${panel('Mapa zależności', `${serviceMap(s, g)}<ul>${g.edges.map((edge) => `<li>${e(g.services.find((x) => x.id === edge.service_id)?.name)} → zależy od → ${e(g.services.find((x) => x.id === edge.depends_on)?.name)}</li>`).join('')}</ul><p>${g.impacted.length} zależnych usług. Kierunek: usługa → komponent, od którego zależy.</p>${s.can_manage ? '<button data-service-dependency>Dodaj zależność</button>' : ''}`)}${panel('Urządzenia i monitoring', `${g.assets.map((a) => `<p><a href="#/admin/assets?project=${a.project_id}">${e(a.asset_key)} · ${e(a.name)}</a></p>`).join('') || '<p>Brak przypiętych urządzeń.</p>'}${s.can_manage ? '<button data-service-asset>Podepnij urządzenie</button><hr><button data-monitoring-new>Skonfiguruj adapter monitoringu</button>' : ''}<p class="hint">Standardowy webhook down/up z tokenem Bearer. Przywrócenie usługi wymaga weryfikacji incydentu przez zespół.</p>`)}</div>`
      );
    }
    if (view === 'calendar') {
      const d = await call('calendar?' + search);
      return (
        head(
          'CHANGE MANAGEMENT',
          'Kalendarz zmian',
          '<button data-window-new>+ Okno serwisowe / blokada</button>',
        ) +
        `<p>Wykryto ${d.collisions.length} kolizji terminów zmian dla tej samej usługi.</p><div class="w21-calendar">${
          [
            ...d.changes.filter((c) => c.starts_at).map((c) => ({ kind: 'change', name: c.title, ...c })),
            ...d.windows,
          ]
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
            .map(
              (c) =>
                `<article class="w21-calendar-event w21-${e(c.kind)}"><span>${date(c.starts_at)} → ${date(c.ends_at)}</span><h2>${c.kind === 'change' ? `<a href="#/case/${c.id}">${e(c.name)}</a>` : e(c.name)}</h2>${badge(c.state || c.kind)}${d.collisions.some((x) => x.first === c.id || x.second === c.id) && c.kind === 'change' ? badge('Kolizja') : ''}</article>`,
            )
            .join('') || '<p>Brak zaplanowanych zmian i okien.</p>'
        }</div>`
      );
    }
    if (view === 'workflow') {
      const d = await call('workflow/' + key);
      if (routeToken === S.routeId) S.workflowDraft = d;
      return (
        head(
          'PROJEKT · WORKFLOW',
          'Projektant obiegu',
          `<button data-wf-save>Zapisz szkic</button><button class="primary" data-wf-publish>Opublikuj</button>`,
        ) +
        `<p>Wersja bazowa ${d.base_version} · szkic ${d.version} · ${d.usage.reduce((n, x) => n + x.count, 0)} zgłoszeń w projekcie. Publikacja zachowuje statusy używane przez zgłoszenia.${d.shared_template_id ? ' Zmiana mapy odłączy projekt od wspólnego szablonu.' : ''}</p><div class="w21-workflow-toolbar"><button data-wf-fit>Dopasuj</button><button data-wf-zoom="in">+</button><button data-wf-zoom="out">−</button><button data-wf-status>+ Status</button><button data-wf-edge>+ Przejście</button><button data-automation-preview>Test automatyzacji</button><a href="#/project/${e(key)}?tab=workflow">Edytor reguł i tabela przejść →</a></div><div class="w21-workflow-layout"><div class="w21-workflow-canvas"><svg data-wf-canvas viewBox="0 0 1100 600" role="img" aria-label="Mapa statusów i przejść"></svg></div><aside class="w21-panel"><h2>Inspektor statusu</h2><div data-wf-inspector>Wybierz status. Przeciągnij węzeł lub użyj strzałek klawiatury.</div><h3>Miniatura mapy</h3><svg data-wf-minimap viewBox="0 0 1100 600" role="img" aria-label="Miniatura całego obiegu"></svg></aside></div><details><summary>Mapa w tabeli (dostępna z klawiatury)</summary><div data-wf-table></div></details>`
      );
    }
    return null;
  }
  async function mountOperations(main, view, key, search) {
    if (view === 'assist')
      bindForm($('[data-assistance-settings]', main), async (f, form) => {
        const config = { threshold: Number(f.threshold), stale_days: Number(f.stale_days) };
        for (const name of ['similar', 'attention', 'handover']) config[name] = form.elements[name].checked;
        await call('assistance/' + key, { version: S.ticketAssistance.version, config });
        await ctx.refreshMeta();
        notify('Zapisano usprawnienia projektu.');
        await route();
      });
    const caseEditor = async (c) => {
      const services = await call('services'),
        kind = c?.kind || search.get('kind') || 'incident';
      modalForm(
        c ? 'Szczegóły sprawy' : 'Nowa sprawa operacyjna',
        select('project_id', 'Projekt', projects(), c?.project_id) +
          field('title', 'Temat', c?.title, 'required minlength="3" maxlength="200"') +
          area('summary', 'Opis i wpływ', c?.summary) +
          select(
            'state',
            'Stan',
            kind === 'change'
              ? Object.fromEntries(
                  ['planned', 'approved', 'rejected', 'implementing', 'resolved', 'closed'].map((x) => [
                    x,
                    states[x],
                  ]),
                )
              : Object.fromEntries(
                  ['open', 'investigating', 'monitoring', 'resolved', 'closed'].map((x) => [x, states[x]]),
                ),
            c?.state || (kind === 'change' ? 'planned' : 'open'),
          ) +
          select('severity', 'Priorytet', S.meta.priorities, c?.severity || 'P2') +
          select(
            'owner_id',
            'Właściciel',
            Object.fromEntries(S.meta.assignees.map((u) => [u.id, u.name])),
            c?.owner_id,
            'Nieprzypisane',
          ) +
          select(
            'service_id',
            'Usługa (ten sam projekt)',
            Object.fromEntries(services.map((s) => [s.id, s.name])),
            c?.service_id,
            'Bez usługi',
          ) +
          select(
            'risk',
            'Ryzyko',
            { low: 'Niskie', medium: 'Średnie', high: 'Wysokie' },
            c?.risk || 'medium',
          ) +
          field('starts_at', 'Początek (UTC)', c?.starts_at?.slice(0, 16), 'type="datetime-local"') +
          field('ends_at', 'Koniec (UTC)', c?.ends_at?.slice(0, 16), 'type="datetime-local"') +
          area('rollback_plan', 'Plan rollbacku', c?.rollback_plan) +
          area('root_cause', 'Przyczyna źródłowa', c?.root_cause) +
          area('workaround', 'Obejście', c?.workaround) +
          area('postmortem', 'Post-mortem i wnioski', c?.postmortem) +
          `<label class="check"><input type="checkbox" name="known_error"${c?.known_error ? ' checked' : ''}>Znany błąd</label>`,
        async (f) => {
          const data = {
            ...f,
            project_id: Number(f.project_id),
            owner_id: f.owner_id ? Number(f.owner_id) : null,
            service_id: f.service_id ? Number(f.service_id) : null,
            starts_at: f.starts_at ? f.starts_at + ':00Z' : null,
            ends_at: f.ends_at ? f.ends_at + ':00Z' : null,
            known_error: f.known_error === 'on',
            kind,
            version: c?.version,
          };
          const result = await call('cases' + (c ? '/' + c.id : ''), data, c ? 'PATCH' : 'POST');
          location.hash = '#/case/' + result.id;
          if (c) await route();
        },
      );
    };
    $('[data-case-new]', main)?.addEventListener(
      'click',
      guarded(() => caseEditor()),
    );
    $('[data-case-edit]', main)?.addEventListener(
      'click',
      guarded(() => caseEditor(S.operationCase)),
    );
    if (view === 'case') {
      const c = S.operationCase;
      bindForm($('[data-case-link]', main), async (f) => {
        await call('cases/' + key + '/tickets', { key: f.key });
        await route();
      });
      bindForm($('[data-case-task-add]', main), async (f) => {
        await call('cases/' + key + '/tasks', { label: f.label });
        await route();
      });
      $$('[data-case-task]', main).forEach(
        (box) =>
          (box.onchange = guarded(async () => {
            const t = c.tasks.find((t) => t.id === Number(box.dataset.caseTask));
            await call('cases/' + key + '/tasks', { id: t.id, version: t.version, done: box.checked });
            await route();
          })),
      );
      bindForm($('[data-case-message]', main), async (f) => {
        const result = await call('cases/' + key + '/messages', {
          body: f.body,
          public: f.public === 'on',
          request_key: crypto.randomUUID(),
        });
        const failures = result.results.filter((x) => !x.ok);
        await route();
        if (failures.length)
          showModal(
            '<h2>Nie wysłano do wszystkich spraw</h2>' +
              failures.map((x) => `<p>${e(x.key)} · ${e(x.error)}</p>`).join(''),
          );
      });
      $$('[data-case-state]', main).forEach(
        (b) =>
          (b.onclick = guarded(async () => {
            await call('cases/' + key, { version: c.version, state: b.dataset.caseState }, 'PATCH');
            await route();
          })),
      );
    }
    const serviceEditor = (s) =>
      modalForm(
        s ? 'Edytuj usługę' : 'Nowa usługa',
        select('project_id', 'Projekt', projects(true), s?.project_id) +
          field('name', 'Nazwa', s?.name, 'required minlength="2" maxlength="120"') +
          area('description', 'Opis', s?.description) +
          select(
            'owner_id',
            'Właściciel',
            Object.fromEntries(S.meta.assignees.map((u) => [u.id, u.name])),
            s?.owner_id,
            'Nieprzypisane',
          ) +
          select(
            'state',
            'Stan',
            Object.fromEntries(
              ['operational', 'degraded', 'outage', 'maintenance'].map((x) => [x, states[x]]),
            ),
            s?.state || 'operational',
          ),
        async (f) => {
          const value = await call(
            'services' + (s ? '/' + s.id : ''),
            {
              ...f,
              project_id: Number(f.project_id),
              owner_id: f.owner_id ? Number(f.owner_id) : null,
              version: s?.version,
            },
            s ? 'PATCH' : 'POST',
          );
          location.hash = '#/service/' + value.id;
          if (s) await route();
        },
      );
    $('[data-service-new]', main)?.addEventListener('click', () => serviceEditor());
    $('[data-service-edit]', main)?.addEventListener('click', () => serviceEditor(S.managedService));
    $('[data-service-dependency]', main)?.addEventListener(
      'click',
      guarded(async () => {
        const all = await call('services');
        modalForm(
          'Dodaj zależność',
          select(
            'depends_on',
            'Ta usługa zależy od',
            Object.fromEntries(all.filter((x) => x.id !== Number(key)).map((x) => [x.id, x.name])),
          ),
          async (f) => {
            await call('services/' + key + '/dependencies', { depends_on: Number(f.depends_on) });
            await route();
          },
        );
      }),
    );
    $('[data-service-asset]', main)?.addEventListener('click', () =>
      modalForm(
        'Podepnij urządzenie',
        field('asset_id', 'ID urządzenia', '', 'type="number" min="1" required'),
        async (f) => {
          await call('services/' + key + '/assets', { asset_id: Number(f.asset_id) });
          await route();
        },
      ),
    );
    $('[data-monitoring-new]', main)?.addEventListener('click', () =>
      modalForm(
        'Konektor monitoringu',
        field('name', 'Nazwa konektora', '', 'required minlength="2" maxlength="100"'),
        async (f) => {
          const result = await call('monitoring', {
            name: f.name,
            project_id: S.managedService.project_id,
            service_id: Number(key),
          });
          setTimeout(
            () =>
              showModal(
                `<h2>Token konektora — zapisz teraz</h2><p>Adres: ${e(location.origin + result.url)}</p><label>Token (wyświetlany tylko raz)<textarea readonly rows="3">${e(result.secret)}</textarea></label><pre>${e(JSON.stringify({ event_id: 'unikalny-id-zdarzenia', state: 'down', summary: 'Opis alertu' }, null, 2))}</pre><p>POST z nagłówkiem Authorization: Bearer &lt;token&gt;. Stan up dodaje etap obserwacji; nie zamyka zgłoszeń klientów.</p>`,
              ),
            0,
          );
        },
      ),
    );
    $('[data-window-new]', main)?.addEventListener('click', () =>
      modalForm(
        'Okno zmian',
        select('project_id', 'Projekt', projects(true)) +
          field('name', 'Nazwa', '', 'required minlength="2"') +
          select('kind', 'Rodzaj', { maintenance: 'Okno serwisowe', freeze: 'Blokada zmian' }) +
          field('starts_at', 'Początek (UTC)', '', 'type="datetime-local" required') +
          field('ends_at', 'Koniec (UTC)', '', 'type="datetime-local" required'),
        async (f) => {
          await call('windows', {
            ...f,
            project_id: Number(f.project_id),
            starts_at: f.starts_at + ':00Z',
            ends_at: f.ends_at + ':00Z',
          });
          await route();
        },
      ),
    );
    if (view === 'integrations') {
      const rows = await api('/desk/v8/integration-health');
      return (
        head('ADMINISTRACJA', 'Stan integracji') +
        `<p>Stan odzwierciedla ostatnią kontrolę połączenia. Sama konfiguracja nie potwierdza działania usługi.</p><div class="w21-service-grid">${rows.map((r) => panel(r.integration_key, `${badge(r.state)}<p>${e(r.message)}</p><small>${r.checked_at ? date(r.checked_at) : 'Brak zakończonej kontroli'}${r.latency_ms !== null ? ' · ' + r.latency_ms + ' ms' : ''}</small><p><a href="#/${e({ ldap: 'directory', mail: 'admin/mail', smtp: 'admin/mail', github: 'settings?section=github', sso: 'admin/sso', webhooks: 'admin/webhooks' }[r.integration_key] || 'settings?section=integrations')}">Konfiguracja i test połączenia →</a></p>`)).join('')}</div>`
      );
    }
    if (view === 'replies') {
      const editor = (r) =>
        modalForm(
          r ? 'Edytuj szablon' : 'Nowy szablon',
          field('name', 'Nazwa', r?.name, 'required minlength="2" maxlength="100"') +
            area('body', 'Treść', r?.body) +
            `<label class="check"><input type="checkbox" name="internal"${r?.internal ? ' checked' : ''}>Notatka wewnętrzna</label><p>Znaczniki: {{ticket.key}}, {{ticket.title}}, {{reporter.name}}.</p>`,
          async (f) => {
            await call(
              'reply-templates' + (r ? '/' + r.id : ''),
              { ...f, project_id: Number(key), internal: f.internal === 'on', version: r?.version },
              r ? 'PATCH' : 'POST',
            );
            await route();
          },
        );
      $('[data-reply-new]', main).onclick = () => editor();
      $$('[data-reply-edit]', main).forEach(
        (b) => (b.onclick = () => editor(S.replyTemplates.find((r) => r.id === Number(b.dataset.replyEdit)))),
      );
    }
    if (view === 'project' && search.get('tab') === 'sla') {
      const form = $('[data-extra=project-options]', main);
      if (form) {
        const box = document.createElement('section');
        box.className = 'w21-panel';
        box.innerHTML = `<h2>Symulacja kalendarza SLA</h2>${field('preview_start', 'Początek (UTC)', new Date().toISOString().slice(0, 16), 'type="datetime-local"')}${field('preview_minutes', 'Cel w minutach pracy', 60, 'type="number" min="1" max="525600"')}<button type="button" data-sla-simulate>Wyznacz termin</button><small>Symulacja używa bieżących ustawień formularza, bez zapisywania polityki.</small><p data-sla-preview-result role="status"></p>`;
        form.after(box);
        $('[data-sla-simulate]', box).onclick = guarded(async () => {
          const f = formData(form),
            week = {};
          for (let day = 1; day <= 7; day++)
            week[day] = (f['day_' + day] || '')
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean)
              .map((x) => x.split(/[–-]/).map((x) => x.trim()));
          const rules = $$('.sla-rule', form).map((el) => {
            const val = (n) => $('[name="' + n + '"]', el).value,
              multi = (n) => [...$('[name="' + n + '"]', el).selectedOptions].map((x) => x.value);
            return {
              id: el.dataset.id,
              name: val('sla_name'),
              kind: val('sla_kind'),
              goals: Object.fromEntries(
                Object.keys(S.meta.priorities).map((p) => [p, Number(val('goal_' + p))]),
              ),
              start: multi('sla_start'),
              pause: multi('sla_pause'),
              stop: multi('sla_stop'),
              reset_on_start: $('[name=sla_reset]', el).checked,
              visible_to_customer: $('[name=sla_customer]', el).checked,
              request_type_ids: multi('sla_forms').map(Number),
            };
          });
          const result = await call('sla-preview', {
            project_id: Number(key),
            starts_at: $('[name=preview_start]', box).value + ':00Z',
            minutes: Number($('[name=preview_minutes]', box).value),
            config: {
              timezone: f.sla_timezone,
              week,
              holidays: f.holidays.split(/[\s,;]+/).filter(Boolean),
              rules,
            },
          });
          $('[data-sla-preview-result]', box).textContent =
            'Termin: ' +
            date(result.due_at) +
            ' · ' +
            result.working_minutes +
            ' min pracy · ' +
            result.timezone;
        });
      }
    }
    if (view === 'workflow') workflow(main, key);
  }
  function workflow(main, key) {
    let d = S.workflowDraft,
      selected = null,
      zoom = 1,
      pan = { x: 0, y: 0 },
      linkFrom = null;
    const svg = $('[data-wf-canvas]', main),
      inspector = $('[data-wf-inspector]', main);
    const position = (s) =>
      d.positions[s.key] ||
      (d.positions[s.key] = {
        x: 80 + (d.config.statuses.indexOf(s) % 3) * 260,
        y: 80 + Math.floor(d.config.statuses.indexOf(s) / 3) * 180,
      });
    function draw() {
      const positions = d.config.statuses.map(position),
        maxX = Math.max(800, ...positions.map((p) => p.x + 240)),
        maxY = Math.max(500, ...positions.map((p) => p.y + 160));
      svg.setAttribute('viewBox', `${pan.x} ${pan.y} ${maxX / zoom} ${maxY / zoom}`);
      svg.innerHTML =
        '<defs><marker id="wf-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z"/></marker></defs>' +
        d.config.transitions
          .map((t, i) => {
            const a = position(d.config.statuses.find((s) => s.key === t.from)),
              b = position(d.config.statuses.find((s) => s.key === t.to));
            return `<path data-wf-edge="${i}" tabindex="0" role="button" aria-label="${e(t.name)}: ${e(t.from)} → ${e(t.to)}" class="w21-workflow-edge" d="M${a.x + 105} ${a.y + 34} Q${(a.x + b.x) / 2 + 120} ${(a.y + b.y) / 2 - 40} ${b.x + 105} ${b.y + 34}" marker-end="url(#wf-arrow)"/>`;
          })
          .join('') +
        d.config.statuses
          .map((s) => {
            const p = position(s);
            return `<g data-wf-node="${e(s.key)}" transform="translate(${p.x},${p.y})" tabindex="0" role="button" aria-label="${e(s.name)}; strzałki przesuwają węzeł" class="w21-workflow-node${selected === s.key ? ' selected' : ''}"><rect width="210" height="68" rx="12"/><text x="15" y="27">${e(s.name)}</text><text x="15" y="49" class="w21-node-category">${e(S.meta.statuses[s.category])}${d.config.initial === s.key ? ' · START' : ''}</text><circle data-wf-port="${e(s.key)}" cx="210" cy="34" r="7" tabindex="0" role="button" aria-label="Połącz ze statusem: ${e(s.name)}"/></g>`;
          })
          .join('');
      const mini = $('[data-wf-minimap]', main);
      mini.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
      mini.innerHTML = svg.innerHTML
        .replaceAll('wf-arrow', 'wf-mini-arrow')
        .replaceAll('data-wf-node', 'data-wf-mini')
        .replaceAll('data-wf-port', 'data-wf-miniport')
        .replaceAll('data-wf-edge', 'data-wf-miniedge')
        .replaceAll('tabindex="0"', 'tabindex="-1"');
      $$('[data-wf-node]', svg).forEach((node) => {
        const id = node.dataset.wfNode,
          s = d.config.statuses.find((s) => s.key === id);
        node.onclick = () => {
          selected = id;
          inspect(s);
          draw();
        };
        node.onkeydown = (ev) => {
          const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[
            ev.key
          ];
          if (delta) {
            ev.preventDefault();
            const p = position(s);
            p.x = Math.max(0, p.x + delta[0]);
            p.y = Math.max(0, p.y + delta[1]);
            draw();
            $('[data-wf-node="' + id + '"]', svg).focus();
          } else if (ev.key === 'Enter') {
            ev.preventDefault();
            if (linkFrom && linkFrom !== id) {
              connect(linkFrom, id);
              linkFrom = null;
            } else {
              selected = id;
              inspect(s);
            }
          }
        };
        node.onpointerdown = (ev) => {
          if (ev.button !== 0) return;
          selected = id;
          inspect(s);
          const point = svg.createSVGPoint(),
            start = { ...position(s) };
          point.x = ev.clientX;
          point.y = ev.clientY;
          const initial = point.matrixTransform(svg.getScreenCTM().inverse());
          svg.setPointerCapture(ev.pointerId);
          svg.onpointermove = (move) => {
            point.x = move.clientX;
            point.y = move.clientY;
            const p = point.matrixTransform(svg.getScreenCTM().inverse());
            d.positions[id] = {
              x: Math.max(0, start.x + p.x - initial.x),
              y: Math.max(0, start.y + p.y - initial.y),
            };
            node.setAttribute('transform', `translate(${d.positions[id].x},${d.positions[id].y})`);
          };
          svg.onpointerup = () => {
            svg.onpointermove = null;
            draw();
          };
        };
      });
      $('[data-wf-table]', main).innerHTML =
        '<table><thead><tr><th>Ze statusu</th><th>Do statusu</th><th>Wykonawca</th><th></th></tr></thead><tbody>' +
        d.config.transitions
          .map(
            (t, i) =>
              `<tr><td>${e(t.from)}</td><td>${e(t.to)}</td><td>${e(t.actor)}</td><td><button data-edge-remove="${i}">Usuń</button></td></tr>`,
          )
          .join('') +
        '</tbody></table>';
      $$('[data-edge-remove]', main).forEach(
        (b) =>
          (b.onclick = () => {
            d.config.transitions.splice(Number(b.dataset.edgeRemove), 1);
            draw();
          }),
      );
      $$('[data-wf-edge]', svg).forEach((edge) => {
        const edit = () => {
          const t = d.config.transitions[Number(edge.dataset.wfEdge)];
          inspector.innerHTML = `<form data-transition-edit>${field('name', 'Nazwa przejścia', t.name, 'required maxlength="100"')}${select('actor', 'Wykonawca', { team: 'Zespół', customer: 'Zgłaszający', both: 'Obie role' }, t.actor)}${submit('Zmień przejście')}</form><p>${e(t.from)} → ${e(t.to)}</p>`;
          bindForm($('form', inspector), async (f) => {
            Object.assign(t, f);
            draw();
          });
        };
        edge.onclick = edit;
        edge.onkeydown = (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            edit();
          }
        };
      });
      $$('[data-wf-port]', svg).forEach((port) => {
        const from = port.dataset.wfPort;
        port.onkeydown = (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            ev.stopPropagation();
            linkFrom = from;
            notify('Wybierz status docelowy i naciśnij Enter.');
          }
        };
        port.onpointerdown = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          svg.setPointerCapture(ev.pointerId);
          const p = position(d.config.statuses.find((s) => s.key === from)),
            line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          line.setAttribute('class', 'w21-link-preview');
          svg.append(line);
          svg.onpointermove = (move) => {
            const point = svg.createSVGPoint();
            point.x = move.clientX;
            point.y = move.clientY;
            const target = point.matrixTransform(svg.getScreenCTM().inverse());
            line.setAttribute('d', `M${p.x + 210} ${p.y + 34} L${target.x} ${target.y}`);
          };
          svg.onpointerup = (up) => {
            svg.onpointermove = null;
            svg.onpointerup = null;
            line.remove();
            const target = document.elementFromPoint(up.clientX, up.clientY)?.closest('[data-wf-node]')
              ?.dataset.wfNode;
            if (target && target !== from) connect(from, target);
          };
        };
      });
    }
    function connect(from, to) {
      if (d.config.transitions.some((t) => t.from === from && t.to === to)) {
        notify('To przejście już istnieje.', true);
        return;
      }
      modalForm(
        'Połącz statusy',
        field(
          'name',
          'Nazwa przejścia',
          d.config.statuses.find((s) => s.key === to).name,
          'required maxlength="100"',
        ) +
          select('actor', 'Wykonawca', { team: 'Zespół', customer: 'Zgłaszający', both: 'Obie role' }) +
          `<p>${e(from)} → ${e(to)}</p>`,
        async (f) => {
          d.config.transitions.push({ from, to, ...f });
          draw();
        },
      );
    }
    svg.addEventListener('pointerdown', (ev) => {
      if (ev.target !== svg) return;
      const start = { ...pan },
        point = svg.createSVGPoint();
      point.x = ev.clientX;
      point.y = ev.clientY;
      const first = point.matrixTransform(svg.getScreenCTM().inverse());
      svg.setPointerCapture(ev.pointerId);
      svg.onpointermove = (move) => {
        point.x = move.clientX;
        point.y = move.clientY;
        const at = point.matrixTransform(svg.getScreenCTM().inverse());
        pan = { x: start.x + first.x - at.x, y: start.y + first.y - at.y };
        svg.setAttribute(
          'viewBox',
          `${pan.x} ${pan.y} ${Number(svg.getAttribute('viewBox').split(' ')[2])} ${Number(svg.getAttribute('viewBox').split(' ')[3])}`,
        );
      };
      svg.onpointerup = () => {
        svg.onpointermove = null;
        draw();
      };
    });
    function inspect(s) {
      const used = d.usage.find((x) => x.workflow_status === s.key)?.count || 0;
      inspector.innerHTML = `<form data-status-edit>${field('name', 'Nazwa', s.name, 'required maxlength="80"')}${select('category', 'Kategoria', S.meta.statuses, s.category)}${submit('Zmień')}<button type="button" data-status-delete${used ? ' disabled' : ''}>Usuń status</button></form><p>Identyfikator: ${e(s.key)} · ${used} zgłoszeń. Kategoria używanego statusu jest chroniona przy zapisie.</p>`;
      if (used) $('[name=category]', inspector).disabled = true;
      bindForm($('form', inspector), async (f) => {
        s.name = f.name;
        s.category = f.category ?? s.category;
        draw();
      });
      $('[data-status-delete]', inspector).onclick = () => {
        d.config.statuses = d.config.statuses.filter((x) => x !== s);
        d.config.transitions = d.config.transitions.filter((x) => x.from !== s.key && x.to !== s.key);
        delete d.positions[s.key];
        selected = null;
        inspector.textContent = 'Wybierz status.';
        draw();
      };
    }
    $('[data-wf-status]', main).onclick = () =>
      modalForm(
        'Nowy status',
        field('key', 'Identyfikator (np. triage)', '', 'required pattern="[a-z][a-z0-9_]*" maxlength="50"') +
          field('name', 'Nazwa', '', 'required maxlength="80"') +
          select('category', 'Kategoria', S.meta.statuses, 'in_progress'),
        async (f) => {
          if (d.config.statuses.some((s) => s.key === f.key)) throw Error('Identyfikator już istnieje.');
          d.config.statuses.push(f);
          draw();
        },
      );
    $('[data-wf-edge]', main).onclick = () => {
      const map = Object.fromEntries(d.config.statuses.map((s) => [s.key, s.name]));
      modalForm(
        'Nowe przejście',
        select('from', 'Ze statusu', map) +
          select('to', 'Do statusu', map) +
          select('actor', 'Kto może wykonać', {
            team: 'Zespół',
            customer: 'Zgłaszający',
            both: 'Obie role',
          }) +
          field('name', 'Nazwa przycisku', '', 'required'),
        async (f) => {
          d.config.transitions.push(f);
          draw();
        },
      );
    };
    $('[data-wf-save]', main).onclick = guarded(async () => {
      d = await call('workflow/' + key, {
        config: d.config,
        positions: d.positions,
        version: d.version,
        base_version: d.base_version,
      });
      notify('Szkic zweryfikowany i zapisany.');
      draw();
    });
    $('[data-wf-publish]', main).onclick = guarded(async () => {
      d = await call('workflow/' + key, {
        config: d.config,
        positions: d.positions,
        version: d.version,
        base_version: d.base_version,
      });
      d = await call('workflow/' + key + '/publish', { version: d.version });
      notify('Workflow opublikowany.');
      await ctx.refreshMeta();
      draw();
    });
    $('[data-wf-fit]', main).onclick = () => {
      zoom = 1;
      pan = { x: 0, y: 0 };
      draw();
    };
    $$('[data-wf-zoom]', main).forEach(
      (b) =>
        (b.onclick = () => {
          zoom = Math.max(0.5, Math.min(2, zoom + (b.dataset.wfZoom === 'in' ? 0.2 : -0.2)));
          draw();
        }),
    );
    $('[data-automation-preview]', main).onclick = () =>
      modalForm(
        'Test opublikowanej automatyzacji',
        field('ticket_key', 'Klucz sprawy', '', 'required') +
          select('event', 'Zdarzenie', S.meta.workflow_events, 'agent_reply') +
          area('comment_body', 'Przykładowa treść komentarza', '', '3') +
          '<p>Tryb dry-run nie wykonuje akcji, nie wysyła poczty ani webhooków.</p>',
        async (f) => {
          const value = await call('workflow/' + key + '/preview', {
            ticket_key: f.ticket_key,
            event: f.event,
            context: { comment_body: f.comment_body, author_kind: 'agent', comment_visibility: 'public' },
          });
          setTimeout(
            () =>
              showModal(
                '<h2>Wynik symulacji</h2>' +
                  value.rules
                    .map(
                      (r) =>
                        `<article class="w21-panel"><strong>${e(r.name)}</strong> ${badge(r.matched ? 'Spełniona' : 'Nie pasuje')}<p>Aktywna: ${r.enabled ? 'tak' : 'nie'} · zdarzenie: ${r.event_matches ? 'tak' : 'nie'} · status: ${r.eligible ? 'tak' : 'nie'} · warunki: ${r.conditions_match ? 'tak' : 'nie'} · czas: ${r.time_ready ? 'gotowy' : 'jeszcze nie'}</p>${r.conditions.map((c) => `<p>${e(c.field)} ${e(c.op)} ${e(c.value)} → ${c.matched ? 'spełniony' : 'niespełniony'} (aktualnie: ${e(c.actual ?? 'brak')})</p>`).join('')}<pre>${e(JSON.stringify(r.actions, null, 2))}</pre></article>`,
                    )
                    .join(''),
              ),
            0,
          );
        },
      );
    draw();
  }
  async function mount(main, view, key, search) {
    dispose();
    dispose = () => {};
    if (
      [
        'queue',
        'ticket',
        'reports',
        'cases',
        'case',
        'services',
        'service',
        'calendar',
        'workflow',
        'replies',
        'assist',
        'integrations',
        'portal',
        'portal-home',
      ].includes(view)
    )
      main.dataset.native21 = '1';
    main.classList.add('w21-main');
    main.dataset.workspaceProject =
      search.get('project') ||
      (['workflow', 'replies', 'assist', 'project'].includes(view)
        ? key
        : view === 'ticket'
          ? S.ticket?.project_id
          : view === 'case'
            ? S.operationCase?.project_id
            : view === 'service'
              ? S.managedService?.project_id
              : '') ||
      '';
    main.dataset.workspaceProjectKey =
      S.meta.projects.find((p) => String(p.id) === main.dataset.workspaceProject)?.key || '';
    const picker = $('[data-workspace-project]');
    if (picker && main.dataset.workspaceProject) picker.value = main.dataset.workspaceProject;
    window.DeskProductMount?.shell();
    if (view === 'queue' && S.user.role !== 'customer' && !S.portalMode) await queue(main, search);
    if (view === 'ticket') await ticket(main, key);
    if (
      view === 'ticket' &&
      main.isConnected &&
      S.meta.projects.find((p) => p.id === S.ticket?.project_id && !p.archived)?.settings?.ticket_assistance
        ?.similar
    ) {
      const t = S.ticket,
        similar = await call('similar', { project_id: t.project_id, title: t.title, exclude_key: t.key });
      if (main.isConnected && S.ticket === t && similar.enabled) {
        const host = $('.ticket-sidebar', main) || main;
        host.insertAdjacentHTML('beforeend', panel('Podobne zgłoszenia', similarList(similar)));
        $$('[data-smart-link]', host).forEach(
          (button) =>
            (button.onclick = guarded(async () => {
              await api('/desk/tickets/' + t.id + '/link', {
                method: 'POST',
                data: { key: button.dataset.smartLink },
              });
              notify('Powiązano zgłoszenia.');
              await route();
            })),
        );
      }
    }
    await mountOperations(main, view, key, search);
    await window.DeskLegacyMount?.mount();
    if (view === 'queue' && !S.portalMode && main.isConnected) {
      const table = $('.w21-queue-table', main);
      if (table && !search.get('view') && Array.isArray(prefs.config.columnOrder)) {
        const keys = prefs.config.columnOrder;
        $$('tr', table).forEach((row) => {
          const map = new Map([...row.cells].map((c) => [c.dataset.w21ColumnKey, c]));
          for (const key of ['select', ...keys.filter((k) => k !== 'select')])
            if (map.has(key)) {
              row.append(map.get(key));
              map.delete(key);
            }
          map.forEach((cell) => row.append(cell));
        });
      }
      const legacy = $('[data-r112-queue-tools]', main);
      if (legacy && !legacy.dataset.folded) {
        legacy.dataset.folded = '1';
        const row = $('.r112-queue-row', legacy),
          details = document.createElement('details');
        details.className = 'w21-advanced';
        details.innerHTML = '<summary>Widoki wspólne i ustawienia zaawansowane</summary>';
        const advanced = document.createElement('div');
        advanced.className = 'w21-advanced-content';
        details.append(advanced);
        while (row?.children.length > 2) advanced.append(row.children[2]);
        $$('.r112-columns,.r112-column-toggles', legacy).forEach((el) => advanced.append(el));
        legacy.append(details);
      }
      const filters = $('.filters', main);
      if (filters && !filters.closest('.w21-filter-panel')) {
        const details = document.createElement('details');
        details.className = 'w21-filter-panel';
        details.innerHTML =
          '<summary>Filtry zgłoszeń <span>' +
          ([...search.keys()].filter((k) => !['project', 'page', 'queue', 'limit'].includes(k)).length ||
            '') +
          '</span></summary>';
        filters.before(details);
        details.append(filters);
        if (
          [...search.keys()].some((k) =>
            ['q', 'status', 'state', 'priority', 'assignee', 'scope'].includes(k),
          )
        )
          details.open = true;
      }
    }
  }
  return {
    render,
    mount,
    mountCreate,
    refreshActivity: () => refreshActivity(),
    dispose: () => {
      dispose();
      refreshActivity = () => {};
    },
  };
}
