(function initSiteAiAssistant() {
  const config = window.AI_SITE_CONFIG || {};

  const state = {
    attachments: [],
    pickMode: false,
    history: [],
    historyIndex: -1,
    minimized: false
  };

  const TARGET_ALIASES = {
    'hero-video': ['hero', 'header', 'header video', 'hero video', 'top video', 'banner video', 'main video'],
    'hero-title': ['hero title', 'header title', 'main title', 'headline'],
    'hero-sub': ['hero subtitle', 'header subtitle', 'subheadline'],
    'hero-eyebrow': ['hero eyebrow', 'header eyebrow'],
    'estate-image': ['estate', 'estate image', 'the estate image', 'estate photo', 'section image'],
    'estate-title': ['estate title', 'sovereignty'],
    'estate-body': ['estate text', 'estate body', 'estate description'],
    'chapter-01-video': ['chapter 1', 'chapter one', 'approach', 'first chapter', 'first video', '01'],
    'chapter-02-video': ['chapter 2', 'chapter two', 'forest', 'continuity', 'second chapter', '02'],
    'chapter-03-video': ['chapter 3', 'chapter three', 'shoreline', 'granite', 'third chapter', '03'],
    'archive-title': ['archive title', 'magazine title', 'strandöen in motion'],
    'statement-quote': ['quote', 'statement', 'blockquote'],
    'nav-logo': ['logo', 'brand', 'strandōen logo']
  };

  function $(sel, root = document) { return root.querySelector(sel); }

  function discoverTargets() {
    const map = new Map();

    function add(id, el, type, label) {
      if (!el || map.has(id)) return;
      map.set(id, { id, el, type, label: label || id });
    }

    document.querySelectorAll('[data-ai-target]').forEach((el) => {
      const id = el.dataset.aiTarget;
      const type = el.tagName === 'VIDEO' ? 'video' : el.tagName === 'IMG' ? 'image' : 'text';
      add(id, el, type, el.dataset.aiLabel || id);
    });

    document.querySelectorAll('video').forEach((el, i) => {
      const id = el.id || `video-${i + 1}`;
      if (!el.id) el.id = id;
      if (!el.dataset.aiTarget) el.dataset.aiTarget = id;
      add(el.dataset.aiTarget, el, 'video', el.dataset.aiLabel || id.replace(/-/g, ' '));
    });

    document.querySelectorAll('img[src]').forEach((el, i) => {
      const id = el.dataset.aiTarget || `image-${i + 1}`;
      el.dataset.aiTarget = id;
      add(id, el, 'image', el.dataset.aiLabel || el.alt || id);
    });

    document.querySelectorAll('h1, h2, h3, .hero-eyebrow, .hero-sub, .estate-body, .statement-quote, .nav-logo, .feature-desc, .feature-title, .section-title, .section-sub').forEach((el, i) => {
      const id = el.dataset.aiTarget || `text-${el.tagName.toLowerCase()}-${i + 1}`;
      if (!el.dataset.aiTarget) el.dataset.aiTarget = id;
      add(id, el, 'text', el.dataset.aiLabel || (el.textContent || '').trim().slice(0, 40));
    });

    return map;
  }

  function resolveTarget(query) {
    if (!query) return null;
    const q = query.toLowerCase().trim();
    const targets = discoverTargets();

    if (targets.has(q)) return targets.get(q);

    for (const [id, target] of targets) {
      if (id.toLowerCase() === q || target.label.toLowerCase() === q) return target;
    }

    for (const [id, aliases] of Object.entries(TARGET_ALIASES)) {
      if (aliases.some((a) => q.includes(a)) || q.includes(id.replace(/-/g, ' '))) {
        return targets.get(id) || null;
      }
    }

    for (const [id, target] of targets) {
      if (q.includes(id.replace(/-/g, ' ')) || target.label.toLowerCase().includes(q)) return target;
    }

    return null;
  }

  function pushHistory(description, undoFn, redoFn) {
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push({ description, undo: undoFn, redo: redoFn });
    state.historyIndex = state.history.length - 1;
    updateHistoryButtons();
  }

  function undo() {
    if (state.historyIndex < 0) return false;
    state.history[state.historyIndex].undo();
    state.historyIndex--;
    updateHistoryButtons();
    return true;
  }

  function redo() {
    if (state.historyIndex >= state.history.length - 1) return false;
    state.historyIndex++;
    state.history[state.historyIndex].redo();
    updateHistoryButtons();
    return true;
  }

  function updateHistoryButtons() {
    const undoBtn = $('#aiUndoBtn');
    const redoBtn = $('#aiRedoBtn');
    if (undoBtn) undoBtn.disabled = state.historyIndex < 0;
    if (redoBtn) redoBtn.disabled = state.historyIndex >= state.history.length - 1;
  }

  function setImageSrc(img, src) {
    const prev = img.src;
    img.src = src;
    return {
      undo: () => { img.src = prev; },
      redo: () => { img.src = src; }
    };
  }

  function setVideoSrc(video, src, isBlob) {
    const prevSrc = video.querySelector('source')?.getAttribute('src') || video.src;
    const wasPlaying = !video.paused;
    const time = video.currentTime;

    function apply(s) {
      if (video.querySelector('source')) {
        video.querySelector('source').setAttribute('src', s);
        video.load();
      } else {
        video.src = s;
      }
      video.play().catch(() => {});
    }

    apply(src);
    return {
      undo: () => {
        apply(prevSrc);
        video.currentTime = time;
        if (!wasPlaying) video.pause();
      },
      redo: () => {
        apply(src);
        video.play().catch(() => {});
      }
    };
  }

  function setTextContent(el, text) {
    const prev = el.innerHTML;
    el.innerHTML = text.replace(/\n/g, '<br>');
    return {
      undo: () => { el.innerHTML = prev; },
      redo: () => { el.innerHTML = text.replace(/\n/g, '<br>'); }
    };
  }

  function applyMediaToTarget(target, file) {
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/');

    if (target.type === 'image') {
      if (!file.type.startsWith('image/')) {
        return { error: 'That target needs an image file. Attach a JPG, PNG, or WebP.' };
      }
      const ops = setImageSrc(target.el, url);
      return { ok: true, description: `Updated ${target.label}`, ...ops };
    }

    if (target.type === 'video') {
      if (!isVideo) {
        target.el.setAttribute('poster', url);
        const prevPoster = target.el.getAttribute('data-ai-prev-poster') || '';
        target.el.setAttribute('data-ai-prev-poster', target.el.getAttribute('poster') || '');
        return {
          ok: true,
          description: `Set poster on ${target.label}`,
          undo: () => {
            if (prevPoster) target.el.setAttribute('poster', prevPoster);
            else target.el.removeAttribute('poster');
          },
          redo: () => { target.el.setAttribute('poster', url); }
        };
      }
      const ops = setVideoSrc(target.el, url, true);
      return { ok: true, description: `Updated ${target.label}`, ...ops };
    }

    return { error: `Cannot set media on ${target.label}.` };
  }

  function applyTextToTarget(target, text) {
    if (target.type !== 'text') return { error: `${target.label} is not a text element.` };
    const ops = setTextContent(target.el, text);
    return { ok: true, description: `Updated ${target.label}`, ...ops };
  }

  function appendSection(html) {
    const footer = document.querySelector('footer');
    const wrapper = document.createElement('div');
    wrapper.dataset.aiInserted = 'true';
    wrapper.innerHTML = html;
    const node = wrapper.firstElementChild;
    if (!node) return { error: 'Could not parse section HTML.' };
    footer.parentNode.insertBefore(node, footer);
    return {
      ok: true,
      description: 'Added new section',
      undo: () => { node.remove(); },
      redo: () => { footer.parentNode.insertBefore(node, footer); }
    };
  }

  function batchApply(results, description) {
    const valid = results.filter((r) => r.ok);
    if (!valid.length) return results[0] || { error: 'Nothing changed.' };

    const undos = valid.map((r) => r.undo);
    const redos = valid.map((r) => r.redo);

    pushHistory(
      description || valid.map((r) => r.description).join('; '),
      () => undos.slice().reverse().forEach((fn) => fn()),
      () => redos.forEach((fn) => fn())
    );

    return { ok: true, message: valid.map((r) => r.description).join('\n') };
  }

  function parseLocalCommand(text, files) {
    const msg = text.trim();
    const lower = msg.toLowerCase();

    if (/^undo$/.test(lower)) {
      return undo()
        ? { ok: true, message: 'Undid last change.' }
        : { error: 'Nothing to undo.' };
    }

    if (/^redo$/.test(lower)) {
      return redo()
        ? { ok: true, message: 'Redid last change.' }
        : { error: 'Nothing to redo.' };
    }

    if (/^(list|show)\s+(targets|elements|images)/.test(lower)) {
      const targets = [...discoverTargets().values()];
      return {
        ok: true,
        message: 'Editable targets:\n' + targets.map((t) => `• ${t.id} (${t.type}) — ${t.label}`).join('\n')
      };
    }

  const mediaMatch = msg.match(/(?:change|set|update|replace|swap|use)\s+(?:the\s+)?(.+?)\s+(?:image|video|photo|picture|media)\s+(?:to|with|as)\s*(.*)$/i)
      || msg.match(/(?:change|set|update|replace)\s+(?:the\s+)?(.+?)\s+(?:to|with)\s+(?:this\s+)?(?:image|video|photo)/i)
      || msg.match(/(?:put|place)\s+(?:this\s+)?(?:image|photo|video)\s+(?:on|in|as)\s+(?:the\s+)?(.+)/i);

    if (mediaMatch && files.length) {
      const target = resolveTarget(mediaMatch[1]);
      const file = files[files.length - 1];
      if (!target) {
        return {
          error: `Could not find "${mediaMatch[1]}". Try: hero video, estate image, chapter 1, chapter 2, chapter 3.\nSay "list targets" to see all.`
        };
      }
      const result = applyMediaToTarget(target, file);
      if (result.error) return result;
      batchApply([result], result.description);
      return { ok: true, message: result.description };
    }

    if (files.length >= 1 && /change\s+this|this\s+image|have\s+this\s+image|replace\s+this/i.test(lower)) {
      enablePickMode(files[files.length - 1]);
      return { ok: true, message: 'Click the image or video on the page you want to update.' };
    }

    const textMatch = msg.match(/(?:change|set|update)\s+(?:the\s+)?(.+?)\s+(?:text|title|heading|subtitle|copy)\s+to\s+(.+)$/i)
      || msg.match(/(?:change|set|update)\s+(?:the\s+)?(.+?)\s+to\s+["'](.+)["']$/i);

    if (textMatch) {
      const target = resolveTarget(textMatch[1]);
      if (!target) return { error: `Could not find "${textMatch[1]}".` };
      const result = applyTextToTarget(target, textMatch[2].trim());
      if (result.error) return result;
      batchApply([result], result.description);
      return { ok: true, message: result.description };
    }

    const addMatch = msg.match(/add\s+(?:a\s+)?section\s+(?:with\s+)?(?:title\s+)?["']?(.+?)["']?(?:\s+and\s+text\s+["']?(.+?)["']?)?$/i);
    if (addMatch) {
      const title = addMatch[1];
      const body = addMatch[2] || '';
      const html = `<section class="estate reveal" data-ai-inserted="true" style="padding:100px 40px;background:var(--cream)"><div style="max-width:800px;margin:0 auto;text-align:center"><h2 class="section-title">${title}</h2>${body ? `<p class="section-sub">${body}</p>` : ''}</div></section>`;
      const result = appendSection(html);
      if (result.error) return result;
      batchApply([result], result.description);
      return { ok: true, message: result.description };
    }

    if (files.length === 1) {
      const target = resolveTarget(msg) || resolveTarget('estate image');
      if (target && files[0].type.startsWith('image/') && target.type === 'image') {
        const result = applyMediaToTarget(target, files[0]);
        batchApply([result], result.description);
        return { ok: true, message: result.description };
      }
    }

    return null;
  }

  async function parseWithGemini(text, files) {
    const key = config.geminiApiKey;
    if (!key) return null;

    const catalog = [...discoverTargets().values()].map((t) => ({
      id: t.id, type: t.type, label: t.label
    }));

    const parts = [{
      text: `You edit a luxury property website. Available targets: ${JSON.stringify(catalog)}.
User request: "${text}"
${files.length ? `User attached ${files.length} file(s). Use the last attachment as the new media when swapping images/videos.` : ''}
Return ONLY valid JSON: {"actions":[{"type":"setMedia"|"setText"|"addSection","target":"id","value":"..."}],"message":"short confirmation"}
For setMedia with no upload, keep value as empty string. For addSection, value is HTML string.`
    }];

    for (const file of files) {
      const b64 = await fileToBase64(file);
      parts.push({ inline_data: { mime_type: file.type, data: b64 } });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] })
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const json = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return json;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function executeGeminiPlan(plan, files) {
    const results = [];
    for (const action of plan.actions || []) {
      if (action.type === 'setMedia') {
        const target = resolveTarget(action.target);
        const file = files[files.length - 1];
        if (!target) continue;
        if (file) results.push(applyMediaToTarget(target, file));
        else if (action.value) {
          const ops = target.type === 'image'
            ? setImageSrc(target.el, action.value)
            : setVideoSrc(target.el, action.value);
          results.push({ ok: true, description: `Updated ${target.label}`, ...ops });
        }
      } else if (action.type === 'setText') {
        const target = resolveTarget(action.target);
        if (target) results.push(applyTextToTarget(target, action.value));
      } else if (action.type === 'addSection') {
        results.push(appendSection(action.value));
      }
    }
    const valid = results.filter((r) => r.ok);
    if (!valid.length) return { error: plan.message || 'No changes applied.' };
    batchApply(valid, plan.message);
    return { ok: true, message: plan.message || valid.map((r) => r.description).join('\n') };
  }

  function enablePickMode(file) {
    state.pickMode = true;
    const targets = discoverTargets();
    const mediaTargets = [...targets.values()].filter((t) => t.type === 'image' || t.type === 'video');

    addMessage('assistant', 'Click the image or video on the page you want to change.');

    function cleanup() {
      state.pickMode = false;
      mediaTargets.forEach((t) => {
        t.el.style.outline = '';
        t.el.style.cursor = '';
        t.el.removeEventListener('click', onPick);
      });
    }

    function onPick(e) {
      e.preventDefault();
      e.stopPropagation();
      const target = mediaTargets.find((t) => t.el === e.currentTarget);
      if (!target) return;
      cleanup();
      const result = applyMediaToTarget(target, file);
      if (result.ok) {
        batchApply([result], result.description);
        addMessage('assistant', result.description);
      } else {
        addMessage('assistant', result.error);
      }
    }

    mediaTargets.forEach((t) => {
      t.el.style.outline = '3px solid var(--gold)';
      t.el.style.cursor = 'pointer';
      t.el.addEventListener('click', onPick, { once: true });
    });
  }

  async function handleUserMessage(text) {
    const files = [...state.attachments];
    addMessage('user', text, files);
    state.attachments = [];
    renderAttachments();

    if (/^select\b|pick\s+on\s+page/i.test(text.trim())) {
      if (!files.length) {
        addMessage('assistant', 'Attach an image or video with + first, then say "select on page".');
        return;
      }
      enablePickMode(files[files.length - 1]);
      return;
    }

    let result = parseLocalCommand(text, files);

    if (!result && config.geminiApiKey) {
      try {
        const plan = await parseWithGemini(text, files);
        if (plan) result = await executeGeminiPlan(plan, files);
      } catch {
        result = null;
      }
    }

    if (!result) {
      result = {
        error: files.length
          ? 'Try: "change estate image to this", "change hero video", "change hero title to …", "select on page", or "list targets".'
          : 'Attach media with + or try: "change hero title to …", "list targets", "undo", "redo".'
      };
    }

    if (!config.geminiApiKey) {
      result.tip = 'Add a Gemini key in ai-config.js for smarter commands.';
    }

    addMessage('assistant', result.message || result.error, [], result.tip);
  }

  function addMessage(role, text, files = [], tip) {
    const log = $('#aiChatLog');
    const bubble = document.createElement('div');
    bubble.className = `ai-msg ai-msg-${role}`;

    if (text) {
      const p = document.createElement('p');
      p.textContent = text;
      bubble.appendChild(p);
    }

    if (files.length) {
      const thumbs = document.createElement('div');
      thumbs.className = 'ai-thumbs';
      files.forEach((file) => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.alt = file.name;
        thumbs.appendChild(img);
      });
      bubble.appendChild(thumbs);
    }

    if (tip) {
      const small = document.createElement('small');
      small.textContent = tip;
      bubble.appendChild(small);
    }

    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
  }

  function renderAttachments() {
    const row = $('#aiAttachPreview');
    row.innerHTML = '';
    state.attachments.forEach((file, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'ai-attach-item';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '×';
      btn.onclick = () => {
        state.attachments.splice(i, 1);
        renderAttachments();
      };
      wrap.appendChild(img);
      wrap.appendChild(btn);
      row.appendChild(wrap);
    });
  }

  function buildUi() {
    const panel = document.createElement('div');
    panel.id = 'aiAssistant';
    panel.innerHTML = `
      <div class="ai-panel">
        <header class="ai-header">
          <span>AI ASSISTANT</span>
          <div class="ai-header-actions">
            <button type="button" id="aiUndoBtn" title="Undo" disabled>↶</button>
            <button type="button" id="aiRedoBtn" title="Redo" disabled>↷</button>
            <button type="button" id="aiMinBtn" title="Minimize">−</button>
          </div>
        </header>
        <div class="ai-body" id="aiBody">
          <div class="ai-chat" id="aiChatLog"></div>
          <div class="ai-attach-preview" id="aiAttachPreview"></div>
          <form class="ai-input-row" id="aiForm">
            <input type="file" id="aiFileInput" accept="image/*,video/*" multiple hidden>
            <button type="button" class="ai-plus" id="aiAttachBtn" aria-label="Attach">+</button>
            <input type="text" id="aiTextInput" placeholder="Attach an image with + and describe what to change…" autocomplete="off">
            <button type="submit" class="ai-send" aria-label="Send">↑</button>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    addMessage('assistant', 'Hi! Attach images with + then try: "change hero video", "change estate image to this", "change hero title to …", "select on page", or "list targets". Every change can be undone with ↶ or "undo".');

    $('#aiForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#aiTextInput');
      const text = input.value.trim();
      if (!text && !state.attachments.length) return;
      input.value = '';
      handleUserMessage(text || 'change this to this image');
    });

    $('#aiAttachBtn').addEventListener('click', () => $('#aiFileInput').click());
    $('#aiFileInput').addEventListener('change', (e) => {
      [...e.target.files].forEach((f) => state.attachments.push(f));
      e.target.value = '';
      renderAttachments();
    });

    $('#aiUndoBtn').addEventListener('click', () => {
      if (undo()) addMessage('assistant', 'Undid last change.');
    });
    $('#aiRedoBtn').addEventListener('click', () => {
      if (redo()) addMessage('assistant', 'Redid last change.');
    });
    $('#aiMinBtn').addEventListener('click', () => {
      state.minimized = !state.minimized;
      $('#aiBody').hidden = state.minimized;
    });

    updateHistoryButtons();
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #aiAssistant { position: fixed; bottom: 24px; right: 24px; z-index: 10000; font-family: var(--font-body, sans-serif); }
      #aiAssistant .ai-panel { width: min(380px, calc(100vw - 32px)); background: var(--cream, #F4F1EB); border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,.22); overflow: hidden; border: 1px solid rgba(0,0,0,.06); }
      #aiAssistant .ai-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; font-size: 11px; letter-spacing: .14em; color: var(--text-mid, #555); border-bottom: 1px solid rgba(0,0,0,.06); }
      #aiAssistant .ai-header-actions { display: flex; gap: 6px; align-items: center; }
      #aiAssistant .ai-header-actions button { width: 28px; height: 28px; border: 1px solid rgba(0,0,0,.12); border-radius: 50%; background: #fff; cursor: pointer; font-size: 14px; line-height: 1; }
      #aiAssistant .ai-header-actions button:disabled { opacity: .35; cursor: default; }
      #aiAssistant .ai-chat { max-height: 320px; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
      #aiAssistant .ai-msg { max-width: 88%; font-size: 13px; line-height: 1.55; }
      #aiAssistant .ai-msg p { margin: 0; white-space: pre-wrap; }
      #aiAssistant .ai-msg small { display: block; margin-top: 8px; opacity: .55; font-size: 11px; }
      #aiAssistant .ai-msg-assistant { align-self: flex-start; color: var(--text-dark, #1a1a1a); }
      #aiAssistant .ai-msg-user { align-self: flex-end; background: var(--navy, #0E1523); color: #fff; padding: 10px 12px; border-radius: 12px 12px 4px 12px; }
      #aiAssistant .ai-thumbs { display: flex; gap: 6px; margin-top: 8px; }
      #aiAssistant .ai-thumbs img { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; }
      #aiAssistant .ai-attach-preview { display: flex; gap: 8px; padding: 0 16px 8px; flex-wrap: wrap; }
      #aiAssistant .ai-attach-item { position: relative; }
      #aiAssistant .ai-attach-item img { width: 48px; height: 48px; object-fit: cover; border-radius: 8px; }
      #aiAssistant .ai-attach-item button { position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; border-radius: 50%; border: none; background: #333; color: #fff; cursor: pointer; font-size: 12px; }
      #aiAssistant .ai-input-row { display: flex; align-items: center; gap: 8px; padding: 12px 16px 16px; border-top: 1px solid rgba(0,0,0,.06); }
      #aiAssistant .ai-plus, #aiAssistant .ai-send { width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(0,0,0,.12); background: #fff; cursor: pointer; flex-shrink: 0; font-size: 18px; }
      #aiAssistant .ai-send { background: var(--navy, #0E1523); color: #fff; border-color: var(--navy, #0E1523); }
      #aiAssistant #aiTextInput { flex: 1; border: 1px solid rgba(0,0,0,.12); border-radius: 999px; padding: 10px 14px; font-size: 13px; outline: none; background: #fff; }
      #aiAssistant #aiTextInput:focus { border-color: var(--gold, #B8956A); }
    `;
    document.head.appendChild(style);
  }

  function tagEditableElements() {
    const tags = {
      '#heroVideo': { id: 'hero-video', label: 'Hero video' },
      '#chapter01Video': { id: 'chapter-01-video', label: 'Chapter 1 video' },
      '#chapter02Video': { id: 'chapter-02-video', label: 'Chapter 2 video' },
      '#chapter03Video': { id: 'chapter-03-video', label: 'Chapter 3 video' },
      '.estate-image img': { id: 'estate-image', label: 'Estate image' },
      '.hero-title': { id: 'hero-title', label: 'Hero title' },
      '.hero-sub': { id: 'hero-sub', label: 'Hero subtitle' },
      '.hero-eyebrow': { id: 'hero-eyebrow', label: 'Hero eyebrow' },
      '#archive .section-title': { id: 'archive-title', label: 'Archive title' },
      '.statement-quote': { id: 'statement-quote', label: 'Statement quote' },
      '.nav-logo': { id: 'nav-logo', label: 'Logo text' },
      '.estate-body': { id: 'estate-body', label: 'Estate body' },
      '#estate .section-title': { id: 'estate-title', label: 'Estate title' }
    };

    Object.entries(tags).forEach(([sel, meta]) => {
      const el = $(sel);
      if (el) {
        el.dataset.aiTarget = meta.id;
        el.dataset.aiLabel = meta.label;
      }
    });
  }

  injectStyles();
  tagEditableElements();
  buildUi();
})();
