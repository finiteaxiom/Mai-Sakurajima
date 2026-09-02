const api = window.maiPet;
const q = (selector) => document.querySelector(selector);
const qa = (selector) => [...document.querySelectorAll(selector)];
let assistant = null;
let knowledge = null;
let knowledgeMoveResolve = null;

function errorText(error) {
  return (error?.message || String(error) || '发生了未知错误。').replace(/^Error invoking remote method '[^']+': Error:\s*/, '');
}

function notice(message, isError = false) {
  q('#notice').textContent = message || '';
  q('#notice').classList.toggle('is-error', isError);
}

function closeKnowledgeMoveDialog(result = null) {
  const resolve = knowledgeMoveResolve;
  knowledgeMoveResolve = null;
  q('#knowledge-move-dialog').classList.add('input-dialog-overlay--hidden');
  q('#knowledge-move-error').textContent = '';
  if (resolve) resolve(result);
}

function chooseKnowledgeLibrary(currentLibraryId) {
  if (knowledgeMoveResolve) closeKnowledgeMoveDialog(null);
  const selector = q('#knowledge-move-select');
  selector.innerHTML = '';
  for (const library of knowledge?.libraries || []) {
    const option = document.createElement('option');
    option.value = library.id;
    option.textContent = `${library.name} · ${privacyLabel(library.privacy)}`;
    selector.appendChild(option);
  }
  selector.value = String(currentLibraryId || '');
  q('#knowledge-move-error').textContent = '';
  q('#knowledge-move-dialog').classList.remove('input-dialog-overlay--hidden');
  requestAnimationFrame(() => selector.focus());
  return new Promise((resolve) => {
    knowledgeMoveResolve = resolve;
  });
}

function formatDate(value) {
  if (!value) return '未设置时间';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function minutesText(seconds) {
  const minutes = Math.max(0, Math.round(Number(seconds || 0) / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`;
}

function empty(text) {
  const node = document.createElement('div');
  node.className = 'empty';
  node.textContent = text;
  return node;
}

function button(label, handler, danger = false) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `button button--secondary${danger ? ' button--danger' : ''}`;
  node.textContent = label;
  node.addEventListener('click', async () => {
    node.disabled = true;
    try { await handler(); } catch (error) { notice(errorText(error), true); } finally { node.disabled = false; }
  });
  return node;
}

function card(title, body, meta = '') {
  const article = document.createElement('article');
  article.className = 'item-card';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const paragraph = document.createElement('p');
  paragraph.textContent = body;
  article.append(heading, paragraph);
  if (meta) {
    const info = document.createElement('p');
    info.className = 'item-meta';
    info.textContent = meta;
    article.appendChild(info);
  }
  return article;
}

function selectTab(tab) {
  const selected = ['today', 'calendar', 'focus', 'promises', 'usage', 'knowledge', 'settings'].includes(tab) ? tab : 'today';
  qa('.tab').forEach((item) => item.classList.toggle('is-active', item.dataset.tab === selected));
  qa('.panel').forEach((item) => item.classList.toggle('is-hidden', item.id !== `${selected}-panel`));
  if (selected === 'knowledge') api.refreshKnowledge().catch(() => {});
}

function renderBriefs() {
  const list = q('#brief-list');
  list.innerHTML = '';
  const entries = [
    ...(assistant.briefings || []).map((item) => ({ ...item, kind: '晨间简报' })),
    ...(assistant.eveningReviews || []).map((item) => ({ ...item, kind: '晚间复盘' }))
  ].sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))).slice(0, 8);
  if (!entries.length) return list.appendChild(empty('今天还没有生成简报或复盘。'));
  entries.forEach((item) => list.appendChild(card(item.title, item.content, `${item.kind} · 完全在本机整理`)));
}

function renderCalendar() {
  const list = q('#calendar-list');
  list.innerHTML = '';
  const items = assistant.lifeItems || [];
  if (!items.length) return list.appendChild(empty('还没有日历或待办事项。'));
  const recurringLabels = { none: '单次', daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' };
  items.forEach((item) => {
    const node = card(item.title, item.notes || (item.completed ? '已经完成' : '等待处理'), `${formatDate(item.effectiveDueAt || item.dueAt)} · ${recurringLabels[item.recurring] || item.recurring}`);
    const actions = document.createElement('div'); actions.className = 'item-actions';
    actions.append(
      button(item.completed ? '恢复' : '完成', async () => { await api.toggleLifeItem(item.id, !item.completed); assistant = await api.getAssistantState(); renderAll(); }),
      button('删除', async () => { if (confirm(`删除“${item.title}”？`)) { await api.deleteLifeItem(item.id); assistant = await api.getAssistantState(); renderAll(); } }, true)
    );
    node.appendChild(actions); list.appendChild(node);
  });
}

function renderFocus() {
  const today = assistant.today?.focus || { minutes: 0, studyMinutes: 0, sessions: [] };
  q('#focus-summary').textContent = `今天完成 ${today.sessions.length} 次专注，共 ${today.minutes} 分钟；学习与阅读 ${today.studyMinutes} 分钟。`;
  q('#today-focus').textContent = `专注 ${today.minutes} 分钟`;
  const list = q('#focus-list'); list.innerHTML = '';
  const sessions = assistant.focusSessions || [];
  if (!sessions.length) return list.appendChild(empty('还没有完成的专注记录。'));
  sessions.slice(0, 20).forEach((item) => list.appendChild(card(item.label, `${item.actualMinutes} 分钟`, `${formatDate(item.startedAt)} · ${item.mode} · ${item.status === 'completed' ? '完成' : '取消'}`)));
}

function renderPromises() {
  const list = q('#promise-list'); list.innerHTML = '';
  const promises = (assistant.promises || []).filter((item) => item.status !== 'completed');
  if (!promises.length) return list.appendChild(empty('目前没有尚未确认的承诺。'));
  promises.forEach((item) => {
    const node = card(item.title, item.evidence ? `原话：“${item.evidence}”` : '手动记录', `${formatDate(item.dueAt)} · 已主动跟进 ${item.followUpCount}/3 次`);
    const actions = document.createElement('div'); actions.className = 'item-actions';
    actions.append(
      button('已完成', async () => { assistant = await api.answerPromise(item.id, 'done'); renderAll(); }),
      button('以后再说', async () => { assistant = await api.answerPromise(item.id, 'later'); renderAll(); }),
      button('取消承诺', async () => { assistant = await api.answerPromise(item.id, 'cancel'); renderAll(); }, true)
    );
    node.appendChild(actions); list.appendChild(node);
  });
}

function renderUsage() {
  const enabled = assistant.settings?.activityTrackingEnabled === true;
  q('#current-app').textContent = enabled ? (assistant.appUsage?.current?.label || '等待获得前台应用') : '感知已关闭';
  const usage = assistant.today?.usage || { totalSeconds: 0, productiveSeconds: 0, apps: [] };
  q('#usage-total').textContent = enabled ? `今天记录 ${minutesText(usage.totalSeconds)}，其中工作/学习 ${minutesText(usage.productiveSeconds)}。` : '请在“设置”中明确开启；关闭时不会采样。';
  q('#today-usage').textContent = enabled ? `获准应用使用 ${minutesText(usage.totalSeconds)}` : '应用感知尚未开启';
  const list = q('#usage-list'); list.innerHTML = '';
  if (!usage.apps.length) return list.appendChild(empty(enabled ? '还没有足够的使用样本。' : '开启后才会在本机累计应用时长。'));
  const maximum = Math.max(...usage.apps.map((item) => item.seconds), 1);
  usage.apps.forEach((item) => {
    const row = document.createElement('div'); row.className = 'usage-row';
    const name = document.createElement('span'); name.textContent = item.label;
    const track = document.createElement('div'); track.className = 'usage-track';
    const fill = document.createElement('span'); fill.style.width = `${Math.max(3, item.seconds / maximum * 100)}%`; track.appendChild(fill);
    const time = document.createElement('span'); time.textContent = minutesText(item.seconds);
    row.append(name, track, time); list.appendChild(row);
  });
}

function privacyLabel(mode) { return mode === 'chat' ? '允许参与聊天' : mode === 'locked' ? '锁定' : '仅本地检索'; }

function renderKnowledge() {
  const selector = q('#knowledge-library-select');
  const current = selector.value;
  selector.innerHTML = '';
  (knowledge.libraries || []).forEach((library) => {
    const option = document.createElement('option'); option.value = library.id; option.textContent = `${library.name} · ${privacyLabel(library.privacy)}`; selector.appendChild(option);
  });
  if ([...selector.options].some((item) => item.value === current)) selector.value = current;
  const libraries = q('#library-list'); libraries.innerHTML = '';
  (knowledge.libraries || []).forEach((library) => {
    const pill = document.createElement('div'); pill.className = 'library-pill';
    const strong = document.createElement('strong'); strong.textContent = library.name;
    const small = document.createElement('small'); small.textContent = privacyLabel(library.privacy);
    pill.append(strong, small); libraries.appendChild(pill);
  });
  const docs = q('#document-list'); docs.innerHTML = '';
  if (!knowledge.documents?.length) docs.appendChild(empty('还没有资料。导入 PDF、文本、笔记、课程文件或聊天记录后即可本地检索。'));
  (knowledge.documents || []).forEach((document) => {
    const library = knowledge.libraries.find((item) => item.id === document.libraryId);
    const node = card(document.title, document.sourcePath || '应用内笔记', `${library?.name || '知识库'} · ${privacyLabel(library?.privacy)} · ${document.characterCount || 0} 字 · ${document.status}`);
    const actions = document.createElement('div'); actions.className = 'item-actions';
    actions.append(button('移动资料', async () => {
      const destinationId = await chooseKnowledgeLibrary(document.libraryId);
      if (!destinationId || destinationId === document.libraryId) return;
      knowledge = await api.updateKnowledgeDocument(document.id, { libraryId: destinationId });
      renderKnowledge();
      notice(`“${document.title}”已经移动到新的知识库。`);
    }), button('删除索引', async () => { if (confirm(`删除“${document.title}”的本地索引？原文件不会删除。`)) { knowledge = await api.deleteKnowledgeDocument(document.id); renderKnowledge(); } }, true));
    node.appendChild(actions); docs.appendChild(node);
  });
  q('#hero-summary').textContent = `${knowledge.summary?.documents || 0} 份资料 · ${knowledge.summary?.libraries || 0} 个隐私分库 · 本地索引`;
}

function renderSettings() {
  const value = assistant.settings || {};
  q('#morning-enabled').checked = value.morningEnabled !== false;
  q('#morning-time').value = value.morningTime || '08:00';
  q('#evening-enabled').checked = value.eveningEnabled !== false;
  q('#evening-time').value = value.eveningTime || '21:30';
  q('#activity-enabled').checked = value.activityTrackingEnabled === true;
  q('#excluded-apps').value = (value.excludedApps || []).join('\n');
  q('#knowledge-auto-refresh').checked = value.knowledgeAutoRefresh !== false;
}

function renderAll() {
  if (!assistant || !knowledge) return;
  q('#mai-activity').textContent = assistant.mai?.currentActivity || '安排自己的生活';
  q('#mai-detail').textContent = `${assistant.mai?.location || '家里'} · 下一项：${assistant.mai?.nextActivity || '留一点自由时间'}`;
  q('#mai-mood').textContent = `心情 ${assistant.mai?.mood || 'calm'} · 精力 ${assistant.mai?.energy || 0}`;
  q('#mai-plan').textContent = `个人计划：${assistant.mai?.personalPlan || '好好生活'}`;
  renderBriefs(); renderCalendar(); renderFocus(); renderPromises(); renderUsage(); renderKnowledge(); renderSettings();
}

qa('.tab').forEach((item) => item.addEventListener('click', () => selectTab(item.dataset.tab)));
q('#open-timer').addEventListener('click', () => api.openTimer());
q('#create-morning').addEventListener('click', async () => { await api.createAssistantBriefing('morning'); assistant = await api.getAssistantState(); renderAll(); notice('今日晨报已经在本机生成。'); });
q('#create-review').addEventListener('click', async () => { await api.createAssistantBriefing('review'); assistant = await api.getAssistantState(); renderAll(); notice('晚间复盘已经根据真实记录生成。'); });
q('#calendar-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api.addLifeItem({ title: q('#calendar-title').value, dueAt: new Date(q('#calendar-due').value).toISOString(), kind: q('#calendar-kind').value, recurring: q('#calendar-recurring').value });
    q('#calendar-title').value = ''; assistant = await api.getAssistantState(); renderAll(); notice('已经加入日历。');
  } catch (error) { notice(errorText(error), true); }
});
q('#focus-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try { assistant = await api.startFocusSession({ label: q('#focus-label').value, mode: q('#focus-mode').value, minutes: Number(q('#focus-minutes').value) }); renderAll(); }
  catch (error) { notice(errorText(error), true); }
});
q('#import-files').addEventListener('click', async () => {
  try { const result = await api.importKnowledgeFiles({ libraryId: q('#knowledge-library-select').value }); knowledge = result; renderKnowledge(); notice(`导入完成：${result.imported || 0} 份成功${result.errors?.length ? `，${result.errors.length} 份失败` : ''}。`, Boolean(result.errors?.length)); }
  catch (error) { notice(errorText(error), true); }
});
q('#refresh-knowledge').addEventListener('click', async () => { try { const result = await api.refreshKnowledge(); knowledge = result.state; renderKnowledge(); notice(`增量检查完成，更新 ${result.updated || 0} 份资料。`); } catch (error) { notice(errorText(error), true); } });
q('#knowledge-search-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const query = q('#knowledge-search').value.trim(); if (!query) return;
  try {
    const results = await api.searchKnowledge({ query, limit: 50 }); const list = q('#knowledge-results'); list.innerHTML = '';
    if (!results.length) list.appendChild(empty('没有找到相关资料。'));
    results.forEach((item) => list.appendChild(card(`${item.title}${item.page ? ` · 第 ${item.page} 页` : ''}`, item.excerpt, `${item.citation} · ${privacyLabel(item.privacy)}`)));
    notice(`本机找到 ${results.length} 条结果，没有调用 DeepSeek API。`);
  } catch (error) { notice(errorText(error), true); }
});
q('#note-form').addEventListener('submit', async (event) => { event.preventDefault(); try { knowledge = await api.addKnowledgeNote({ libraryId: q('#knowledge-library-select').value, title: q('#note-title').value, text: q('#note-content').value }); q('#note-title').value = ''; q('#note-content').value = ''; renderKnowledge(); notice('笔记已保存并建立本地索引。'); } catch (error) { notice(errorText(error), true); } });
q('#library-form').addEventListener('submit', async (event) => { event.preventDefault(); try { knowledge = await api.addKnowledgeLibrary({ name: q('#library-name').value, privacy: q('#library-privacy').value }); q('#library-name').value = ''; renderKnowledge(); notice('知识库已建立。'); } catch (error) { notice(errorText(error), true); } });
q('#assistant-settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    assistant = await api.saveAssistantSettings({
      morningEnabled: q('#morning-enabled').checked, morningTime: q('#morning-time').value,
      eveningEnabled: q('#evening-enabled').checked, eveningTime: q('#evening-time').value,
      activityTrackingEnabled: q('#activity-enabled').checked,
      excludedApps: q('#excluded-apps').value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      knowledgeAutoRefresh: q('#knowledge-auto-refresh').checked
    });
    renderAll(); notice('现实助理设置已保存。');
  } catch (error) { notice(errorText(error), true); }
});
q('#knowledge-move-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const destinationId = q('#knowledge-move-select').value;
  if (!destinationId) {
    q('#knowledge-move-error').textContent = '请选择目标知识库。';
    return;
  }
  closeKnowledgeMoveDialog(destinationId);
});
q('#knowledge-move-close').addEventListener('click', () => closeKnowledgeMoveDialog(null));
q('#knowledge-move-cancel').addEventListener('click', () => closeKnowledgeMoveDialog(null));
q('#knowledge-move-dialog').addEventListener('pointerdown', (event) => {
  if (event.target === q('#knowledge-move-dialog')) closeKnowledgeMoveDialog(null);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !q('#knowledge-move-dialog').classList.contains('input-dialog-overlay--hidden')) {
    closeKnowledgeMoveDialog(null);
  }
});

Promise.all([api.getAssistantState(), api.getKnowledgeState()]).then(([assistantState, knowledgeState]) => {
  assistant = assistantState; knowledge = knowledgeState; renderAll();
}).catch((error) => notice(errorText(error), true));
api.onAssistantStateUpdated((state) => { assistant = state; renderAll(); });
api.onKnowledgeStateUpdated((state) => { knowledge = state; renderAll(); });
api.onAssistantSelectTab(selectTab);
