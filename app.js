/* 모아 가계부 화면과 로컬 데이터의 단일 진입점 */
const STORAGE_KEY = 'moa-one-file-v2';
const BUDGET_PREFIX = 'moa-budget-v1:';
const EXPENSE_CATEGORIES = {
  개인지출: ['생활비', '식비', '회사커피'],
  고정지출: ['개인', '차', '주거', '고양이', '기타'],
  회사지출: [],
  저축: ['청년적금', 'ISA', '토스증권', '주택청약', '추가 저축']
};
const INCOME_CATEGORIES = { 급여: [], 부수입: [] };
const PAYMENT_METHODS = ['현대경차', '현대네이버', '국민쿠팡', '현금', '체크카드', '울산페이', '기타', '포인트'];
const SAVINGS_AMOUNTS = { 청년적금: 500000, ISA: 500000, 토스증권: 200000, 주택청약: 100000 };
const CARD_TARGETS = [{ name: '현대경차', target: 700000, color: '#5369df' }, { name: '현대네이버', target: 400000, color: '#55ad88' }];
const DUE_METHODS = ['현대경차', '현대네이버', '국민쿠팡', '현금'];

let data = readJson(STORAGE_KEY, []);
let filter = 'all';
let editingId = null;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const form = $('#form');
const modal = $('#modal');

function readJson(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; }
}

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function selectedMonth() { return new URLSearchParams(location.search).get('month') || localDate().slice(0, 7); }
function money(value) { return `₩ ${Number(value || 0).toLocaleString('ko-KR')}`; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function monthData() { return data.filter(item => item.date?.startsWith(selectedMonth())); }
function sortTransactions(list) { return [...list].sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id))); }
function budgetKey() { return `${BUDGET_PREFIX}${selectedMonth()}`; }
function budgets() { return readJson(budgetKey(), { 개인지출: 350000, 고정지출: 970000 }); }
function saveBudgets(value) { localStorage.setItem(budgetKey(), JSON.stringify(value)); }
function sum(list) { return list.reduce((total, item) => total + Number(item.amount || 0), 0); }
function expensesFor(category) { return sum(monthData().filter(item => item.type === 'expense' && item.category === category)); }
function currentPage() { return $('.page.active')?.id || 'home'; }

function transactionRow(item, detailed = false) {
  const category = escapeHtml(item.category);
  const subcategory = item.subcategory ? ` · ${escapeHtml(item.subcategory)}` : '';
  const method = item.type === 'expense' && item.method ? ` · ${escapeHtml(item.method)}` : '';
  const performance = item.performance === 'excluded' ? ' · 실적 미포함' : '';
  const icons = { 개인지출: '◉', 고정지출: '◆', 회사지출: '▣', 저축: '◎', 급여: '↓', 부수입: '↓' };
  if (detailed) return `<div class="detail-row"><span class="transaction-icon">${item.type === 'income' ? '↓' : '↑'}</span><div class="meta"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.date)} · ${category}${subcategory}${method}</small></div><strong class="amount ${item.type}">${item.type === 'income' ? '+' : '−'}${money(item.amount)}</strong></div>`;
  return `<div class="transaction"><span class="transaction-icon">${icons[item.category] || '₩'}</span><div class="transaction-info"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.date).slice(5).replace('-', '월 ')}일 · ${category}${subcategory}${method}${performance}</small></div><strong class="amount ${item.type}">${item.type === 'income' ? '+' : '−'}${money(item.amount)}</strong><button class="icon-button" type="button" data-edit="${escapeHtml(item.id)}" aria-label="거래 수정">✎</button><button class="icon-button delete-button" type="button" data-delete="${escapeHtml(item.id)}" aria-label="거래 삭제">×</button></div>`;
}

function empty() { return '<p class="empty">아직 등록된 내역이 없어요.</p>'; }

function renderTransactionLists() {
  const list = sortTransactions(monthData()).filter(item => filter === 'all' || item.type === filter);
  $('#recent').innerHTML = list.slice(0, 4).map(item => transactionRow(item)).join('') || empty();
  $('#all').innerHTML = list.map(item => transactionRow(item)).join('') || empty();
}

function renderSummary() {
  const current = monthData();
  const income = sum(current.filter(item => item.type === 'income'));
  const expense = sum(current.filter(item => item.type === 'expense' && ['개인지출', '고정지출'].includes(item.category)));
  const savings = expensesFor('저축');
  const due = sum(current.filter(item => item.type === 'expense' && DUE_METHODS.includes(item.method)));
  $('#income').textContent = money(income);
  $('#expense').textContent = money(expense);
  $('#balance').textContent = money(income - expense - savings);
  $('#savingsTotal').textContent = money(savings);
  $('#tomorrowDue').textContent = money(due);
  const next = new Date(`${selectedMonth()}-01T12:00:00`); next.setMonth(next.getMonth() + 1);
  $('#tomorrowDueNote').textContent = due ? `${next.getMonth() + 1}월 결제 예정` : '등록된 내역이 없어요';
}

function renderBudgets() {
  const values = budgets();
  const names = ['개인지출', '고정지출'];
  const line = name => {
    const limit = Number(values[name] || 0); const spent = expensesFor(name); const rate = limit ? Math.min(100, Math.round(spent / limit * 100)) : 0;
    return `<div class="budget"><div class="budget-head"><b>${name}</b><span>${money(spent)} / ${money(limit)}</span></div><div class="bar"><i class="${spent > limit ? 'over' : ''}" style="width:${rate}%"></i></div></div>`;
  };
  $('#budgetPreview').innerHTML = names.map(line).join('');
  $('#budgetCards').innerHTML = names.map(name => {
    const limit = Number(values[name] || 0); const spent = expensesFor(name); const rate = limit ? Math.min(100, spent / limit * 100) : 0;
    return `<article class="panel"><h2>${name}</h2><p class="eyebrow">이번 달 예산 금액</p><label class="budget-input">예산 설정<input type="number" min="0" inputmode="numeric" data-budget="${name}" value="${limit}">원</label><div class="budget-number"><strong>${money(spent)}</strong><span>사용 금액</span></div><div class="bar"><i class="${spent > limit ? 'over' : ''}" style="width:${rate}%"></i></div></article>`;
  }).join('') + '<button class="primary-button save-budget" id="saveBudget" type="button">예산 저장</button>';
}

function renderCardPerformance() {
  $('#cardPerformance').innerHTML = CARD_TARGETS.map(card => {
    const used = sum(monthData().filter(item => item.type === 'expense' && item.method === card.name && item.performance !== 'excluded'));
    const rate = Math.min(100, Math.round(used / card.target * 100));
    return `<div class="card-row"><div class="card-row-head"><b>${card.name}</b><span>${money(used)} / ${money(card.target)}</span></div><div class="bar"><i style="width:${rate}%;background:${card.color}"></i></div><small>${rate}% 달성 · ${money(Math.max(card.target - used, 0))} 남음</small></div>`;
  }).join('');
}

function renderCategoryTotals() {
  const render = (target, category, names) => { $(target).innerHTML = names.map(name => `<div class="category-total"><span>${name}</span><b>${money(sum(monthData().filter(item => item.type === 'expense' && item.category === category && item.subcategory === name)))}</b></div>`).join(''); };
  render('#personalTotals', '개인지출', EXPENSE_CATEGORIES.개인지출);
  render('#fixedTotals', '고정지출', EXPENSE_CATEGORIES.고정지출);
  $('#companyTotals').innerHTML = `<div class="category-total"><span>회사지출 합계</span><b>${money(expensesFor('회사지출'))}</b></div>`;
}

function render() { renderTransactionLists(); renderSummary(); renderBudgets(); renderCardPerformance(); renderCategoryTotals(); }

function setPage(page) {
  $$('.page').forEach(item => item.classList.toggle('active', item.id === page));
  $$('.page').forEach(item => item.classList.toggle('on', item.id === page));
  $$('[data-page]').forEach(item => item.classList.toggle('active', item.dataset.page === page));
  window.scrollTo(0, 0);
}

function setMonth(offset) {
  const date = new Date(`${selectedMonth()}-01T12:00:00`); date.setMonth(date.getMonth() + offset);
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const url = new URL(location.href); url.searchParams.set('month', month);
  if (currentPage() !== 'home') url.searchParams.set('view', currentPage());
  location.assign(url);
}

function configureForm(transaction = null) {
  editingId = transaction?.id ?? null;
  form.dataset.editingId = editingId ?? '';
  $('#formTitle').textContent = transaction ? '거래 내역 수정' : '내역 추가';
  $('#saveTransaction').textContent = transaction ? '수정 저장' : '내역 저장';
  form.reset();
  form.querySelector(`[name="type"][value="${transaction?.type || 'expense'}"]`).checked = true;
  updateFormFields(transaction?.category, transaction?.subcategory);
  form.elements.date.value = transaction?.date || `${selectedMonth()}-01`;
  form.elements.amount.value = transaction?.amount || '';
  form.elements.title.value = transaction?.title || '';
  form.elements.method.value = transaction?.method || '현대경차';
  form.elements.performance.value = transaction?.performance || 'included';
  if (transaction?.category === '저축') applySavingsDefaults();
}

function updateFormFields(category, subcategory) {
  const isIncome = form.elements.type.value === 'income';
  const categories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  form.elements.category.innerHTML = Object.keys(categories).map(name => `<option>${name}</option>`).join('');
  form.elements.category.value = Object.hasOwn(categories, category) ? category : Object.keys(categories)[0];
  const details = categories[form.elements.category.value];
  form.elements.subcategory.innerHTML = details.map(name => `<option>${name}</option>`).join('');
  if (details.includes(subcategory)) form.elements.subcategory.value = subcategory;
  form.elements.method.innerHTML = PAYMENT_METHODS.map(name => `<option>${name}</option>`).join('');
  const savings = !isIncome && form.elements.category.value === '저축';
  $('[data-field="subcategory"]').hidden = isIncome || details.length === 0;
  $('[data-field="method"]').hidden = isIncome || savings;
  $('[data-field="performance"]').hidden = isIncome || savings;
  $('[data-field="title"]').hidden = savings;
  form.elements.subcategory.disabled = isIncome || details.length === 0;
  form.elements.method.disabled = isIncome || savings;
  form.elements.performance.disabled = isIncome || savings;
  form.elements.title.readOnly = savings;
  if (savings) applySavingsDefaults();
}

function applySavingsDefaults() {
  if (form.elements.category.value !== '저축') return;
  const subcategory = form.elements.subcategory.value;
  form.elements.method.value = '기타'; form.elements.performance.value = 'excluded';
  form.elements.title.value = `저축 · ${subcategory}`;
  if (SAVINGS_AMOUNTS[subcategory]) form.elements.amount.value = SAVINGS_AMOUNTS[subcategory];
}

function openDetail(kind) {
  const current = monthData();
  const detail = $('#detailModal');
  const open = (eyebrow, title, summary, body) => { $('#detailEyebrow').textContent = eyebrow; $('#detailTitle').textContent = title; $('#detailBody').innerHTML = `<div class="detail-summary"><small>${summary.label}</small><b>${summary.amount}</b></div>${body}`; detail.showModal(); };
  const entries = items => `<div class="detail-list">${items.map(item => transactionRow(item, true)).join('') || empty()}</div>`;
  if (kind === 'income' || kind === 'expense' || kind === 'savings') {
    const categories = kind === 'income' ? Object.keys(INCOME_CATEGORIES) : kind === 'savings' ? ['저축'] : ['개인지출', '고정지출'];
    const items = sortTransactions(current.filter(item => item.type === (kind === 'income' ? 'income' : 'expense') && categories.includes(item.category)));
    return open('MONTHLY SUMMARY', kind === 'income' ? '이번 달 수입 상세' : kind === 'savings' ? '이번 달 저축 상세' : '이번 달 지출 상세', { label: '합계', amount: money(sum(items)) }, entries(items));
  }
  if (kind === 'due') {
    const items = current.filter(item => item.type === 'expense' && DUE_METHODS.includes(item.method));
    return open('NEXT MONTH PAYMENT', '다음 달 나갈 돈 상세', { label: '합계', amount: money(sum(items)) }, `<div class="detail-budget">${DUE_METHODS.map(method => `<article><div><b>${method}</b><span>${money(sum(items.filter(item => item.method === method)))}</span></div></article>`).join('')}</div>`);
  }
  if (kind === 'budget') {
    const value = budgets(); const names = ['개인지출', '고정지출'];
    return open('BUDGET STATUS', '예산 상세', { label: '설정 예산 합계', amount: money(names.reduce((total, name) => total + Number(value[name] || 0), 0)) }, `<div class="detail-budget">${names.map(name => `<article><div><b>${name}</b><span>${money(expensesFor(name))} / ${money(value[name])}</span></div><small>${money(Number(value[name] || 0) - expensesFor(name))} 남음</small></article>`).join('')}</div>`);
  }
  if (kind === 'card') return open('CARD PERFORMANCE', '카드별 실적 상세', { label: '실적 포함 지출', amount: money(sum(current.filter(item => item.type === 'expense' && item.performance !== 'excluded'))) }, `<div class="detail-budget">${CARD_TARGETS.map(card => { const used = sum(current.filter(item => item.type === 'expense' && item.method === card.name && item.performance !== 'excluded')); return `<article><div><b>${card.name}</b><span>${money(used)} / ${money(card.target)}</span></div></article>`; }).join('')}</div>`);
  if (kind === 'category') return open('PERSONAL SPENDING', '개인지출 상세', { label: '개인지출 합계', amount: money(expensesFor('개인지출')) }, entries(sortTransactions(current.filter(item => item.category === '개인지출' && item.type === 'expense'))));
}

function bindEvents() {
  $$('[data-page]').forEach(button => button.addEventListener('click', () => setPage(button.dataset.page)));
  $$('[data-month-offset]').forEach(button => button.addEventListener('click', () => setMonth(Number(button.dataset.monthOffset))));
  $$('.filter').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter; $$('.filter').forEach(item => item.classList.toggle('active', item === button)); renderTransactionLists(); }));
  $('#add').addEventListener('click', () => { configureForm(); modal.showModal(); });
  $$('[data-close]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
  form.addEventListener('change', event => { if (event.target.name === 'type' || event.target.name === 'category') updateFormFields(form.elements.category.value, form.elements.subcategory.value); if (event.target.name === 'subcategory') applySavingsDefaults(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = new FormData(form); const record = { id: editingId || crypto.randomUUID(), title: values.get('title'), category: values.get('category'), subcategory: values.get('subcategory') || null, method: values.get('method') || null, performance: values.get('performance') || 'included', date: values.get('date'), amount: Number(values.get('amount')), type: values.get('type') };
    data = editingId ? data.map(item => String(item.id) === String(editingId) ? record : item) : [record, ...data]; persist(); modal.close(); render(); setPage('transactions');
  });
  document.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit]'); const remove = event.target.closest('[data-delete]'); const detail = event.target.closest('[data-detail]');
    if (edit) { const transaction = data.find(item => String(item.id) === edit.dataset.edit); if (transaction) { configureForm(transaction); modal.showModal(); } }
    if (remove) { const transaction = data.find(item => String(item.id) === remove.dataset.delete); if (transaction && confirm(`“${transaction.title}” 내역을 삭제할까요?`)) { data = data.filter(item => String(item.id) !== remove.dataset.delete); persist(); render(); } }
    if (detail && !event.target.closest('button')) openDetail(detail.dataset.detail);
    if (event.target.id === 'saveBudget') { const value = Object.fromEntries($$('[data-budget]').map(input => [input.dataset.budget, Number(input.value) || 0])); saveBudgets(value); renderBudgets(); }
  });
}

function initialize() {
  const [year, month] = selectedMonth().split('-').map(Number);
  $('#monthLabel').textContent = `${year}년 ${month}월`;
  $('#monthEyebrow').textContent = `${new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long' }).toUpperCase()} OVERVIEW`;
  const view = new URLSearchParams(location.search).get('view'); if (view && $(`#${view}`)) setPage(view);
  bindEvents(); configureForm(); render();
}

initialize();
