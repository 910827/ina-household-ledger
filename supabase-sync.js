(() => {
  const SUPABASE_URL = 'https://itaounybjdhangxnfxky.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_JOGPpqcB-B43bKebxC-k6Q_XEH5v4hD';
  const txKey = 'moa-one-file-v2';
  const budgetKey = 'moa-budget-v1';
  let client;
  let session;

  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const newId = () => crypto.randomUUID();
  const localTransactions = () => JSON.parse(localStorage.getItem(txKey) || '[]');
  const localBudgets = () => JSON.parse(localStorage.getItem(budgetKey) || '{}');
  const normalize = transaction => ({ ...transaction, id: uuid(transaction.id) ? transaction.id : newId() });
  const remoteToLocal = row => ({
    id: row.id, title: row.title, category: row.category, subcategory: row.subcategory,
    method: row.payment_method, performance: row.performance, date: row.occurred_on,
    amount: Number(row.amount), type: row.type
  });
  const localToRemote = transaction => ({
    id: transaction.id, user_id: session.user.id, title: transaction.title,
    category: transaction.category, subcategory: transaction.subcategory || null,
    payment_method: transaction.method || null, performance: transaction.performance || 'included',
    occurred_on: transaction.date, amount: Number(transaction.amount), type: transaction.type
  });
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

  function setAuthButton() {
    const button = document.querySelector('#authButton');
    if (!button) return;
    button.innerHTML = session ? '동기화됨<small>로그아웃</small>' : '로그인<small>기기 동기화</small>';
    button.title = session ? session.user.email : '로그인하여 PC와 휴대폰 데이터를 동기화하세요';
  }

  function authDialog() {
    let dialog = document.querySelector('#authModal');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'authModal';
    dialog.innerHTML = `<form id="authForm"><div class="dialog-head"><div><p class="eyebrow">CLOUD SYNC</p><h2>가계부 로그인</h2></div><button class="close" type="button" aria-label="닫기">×</button></div><p style="margin:0;color:#687086;font-size:12px;line-height:1.6">같은 계정으로 로그인하면 PC와 휴대폰에서 같은 내역과 예산을 사용할 수 있어요.</p><label>이메일<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" minlength="8" required placeholder="8자 이상"></label><button class="save" type="submit">로그인</button><button class="link" type="button" id="signUp">처음이라면 회원가입</button></form>`;
    document.body.append(dialog);
    dialog.querySelector('.close').onclick = () => dialog.close();
    dialog.querySelector('#authForm').onsubmit = async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const { error } = await client.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
      if (error) return alert(error.message);
      dialog.close();
    };
    dialog.querySelector('#signUp').onclick = async () => {
      const form = new FormData(dialog.querySelector('#authForm'));
      const { error } = await client.auth.signUp({
        email: form.get('email'), password: form.get('password'),
        options: { emailRedirectTo: `${location.origin}${location.pathname}` }
      });
      if (error) return alert(error.message);
      alert('인증 이메일을 보냈어요. 이메일의 링크를 누른 뒤 다시 로그인해 주세요.');
    };
    return dialog;
  }

  async function upsertTransaction(transaction) {
    const { error } = await client.from('transactions').upsert(localToRemote(transaction));
    if (error) throw error;
  }

  async function hydrate() {
    if (!session) return;
    let local = localTransactions().map(normalize);
    localStorage.setItem(txKey, JSON.stringify(local));
    const [{ data: remoteRows, error: txError }, { data: budgetRows, error: budgetError }] = await Promise.all([
      client.from('transactions').select('*').order('occurred_on', { ascending: false }),
      client.from('budgets').select('*')
    ]);
    if (txError || budgetError) return console.error(txError || budgetError);
    const remote = remoteRows.map(remoteToLocal);
    if (!remote.length && local.length) {
      const { error } = await client.from('transactions').upsert(local.map(localToRemote));
      if (error) return console.error(error);
      remote.push(...local);
    }
    const remoteBudgets = Object.fromEntries(budgetRows.map(row => [row.category, Number(row.amount)]));
    const currentBudgets = localBudgets();
    if (!budgetRows.length && Object.keys(currentBudgets).length) {
      const rows = Object.entries(currentBudgets).map(([category, amount]) => ({ user_id: session.user.id, category, amount: Number(amount) || 0 }));
      const { error } = await client.from('budgets').upsert(rows);
      if (error) return console.error(error);
      Object.assign(remoteBudgets, currentBudgets);
    }
    if (!same(local, remote) || !same(currentBudgets, remoteBudgets)) {
      localStorage.setItem(txKey, JSON.stringify(remote));
      localStorage.setItem(budgetKey, JSON.stringify(remoteBudgets));
      location.reload();
    }
  }

  function bindSyncedActions() {
    document.addEventListener('click', async event => {
      const edit = event.target.closest('[data-edit]');
      if (edit) document.querySelector('#form').dataset.editingId = edit.dataset.edit;
    });
    document.addEventListener('submit', async event => {
      const form = event.target;
      if (!session || form.id !== 'form') return;
      event.preventDefault(); event.stopImmediatePropagation();
      const values = new FormData(form);
      const editingId = form.dataset.editingId;
      const record = {
        id: editingId || newId(), title: values.get('title'), category: values.get('category'),
        subcategory: values.get('subcategory'), method: values.get('method'), performance: values.get('performance'),
        date: values.get('date'), amount: Number(values.get('amount')), type: values.get('type')
      };
      data = editingId ? data.map(item => String(item.id) === String(editingId) ? record : item) : [record, ...data];
      localStorage.setItem(txKey, JSON.stringify(data));
      try { await upsertTransaction(record); } catch (error) { return alert(`저장하지 못했어요: ${error.message}`); }
      delete form.dataset.editingId;
      document.querySelector('#modal').close();
      location.reload();
    }, true);
    document.addEventListener('click', async event => {
      const remove = event.target.closest('[data-delete]');
      if (!session || !remove) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const id = remove.dataset.delete;
      data = data.filter(item => String(item.id) !== id);
      localStorage.setItem(txKey, JSON.stringify(data));
      const { error } = await client.from('transactions').delete().eq('id', id);
      if (error) return alert(`삭제하지 못했어요: ${error.message}`);
      location.reload();
    }, true);
    document.addEventListener('click', async event => {
      const save = event.target.closest('.save-budget');
      if (!session || !save) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const budgets = Object.fromEntries([...document.querySelectorAll('[data-budget]')].map(input => [input.dataset.budget, Number(input.value) || 0]));
      localStorage.setItem(budgetKey, JSON.stringify(budgets));
      const rows = Object.entries(budgets).map(([category, amount]) => ({ user_id: session.user.id, category, amount }));
      const { error } = await client.from('budgets').upsert(rows);
      if (error) return alert(`예산을 저장하지 못했어요: ${error.message}`);
      location.reload();
    }, true);
  }

  window.addEventListener('DOMContentLoaded', async () => {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data } = await client.auth.getSession();
    session = data.session;
    setAuthButton();
    bindSyncedActions();
    document.querySelector('#authButton').onclick = async () => {
      if (!session) return authDialog().showModal();
      await client.auth.signOut();
    };
    client.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      setAuthButton();
      if (session) setTimeout(hydrate, 0);
    });
    await hydrate();
  });
})();
