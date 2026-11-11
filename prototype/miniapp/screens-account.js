// Subscription, payment, profile and the list of close people.
import { api, formatDate, MONTHS_GEN } from './api.js';
import { $, app, birth, planLine, refreshPlan, screenEl, setNote, visitorName } from './state.js?v=3';
import { drawWheel } from './wheel.js';
import { closeSheet, node, openSheet } from './sheet.js';

const PERIOD_LABEL = { 30: 'На месяц', 90: 'На 3 месяца' };
const FEATURES = ['Прогноз на день и на неделю', '30 вопросов Фортуне в месяц', 'Разбор натальной карты', 'Ответ по методике Фортуны'];
const PAY_HOST = 'payform.ru';
const POLL_MS = 4000;
const price = (value) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

let links = [];
let chosen = null;
let polling = 0;

function option(group, { title, note, priceText, priceNote, checked, onSelect }) {
  const button = node('button', 'option'); button.type = 'button';
  button.setAttribute('role', 'radio'); button.setAttribute('aria-checked', String(checked));
  const text = node('span', 'option-text'); text.append(node('strong', '', title));
  if (note) text.append(node('small', '', note));
  button.append(node('span', 'radio'), text);
  if (priceText) { const cost = node('span', 'option-price'); cost.append(node('strong', '', priceText)); if (priceNote) cost.append(node('small', '', priceNote)); button.append(cost); }
  button.addEventListener('click', () => { for (const item of group.children) item.setAttribute('aria-checked', String(item === button)); onSelect(); });
  return button;
}

export async function enterPlan() {
  setNote('plan');
  const list = $('#plan-list');
  $('#plan-features').replaceChildren(...FEATURES.map((text) => node('li', '', text)));
  const { ok, data } = await api('/api/billing/subscription-links');
  links = ok ? (data.links ?? []).filter((item) => item.priceRub > 0 && [30, 90].includes(item.periodDays)).sort((a, b) => a.periodDays - b.periodDays) : [];
  $('#plan-buy').disabled = !links.length;
  if (!links.length) { list.replaceChildren(); setNote('plan', ok ? 'Оплата пока недоступна.' : (data.message || 'Не удалось загрузить тарифы.')); return; }
  chosen = links.at(-1);
  list.replaceChildren();
  for (const link of links) {
    list.append(option(list, { title: PERIOD_LABEL[link.periodDays], priceText: price(link.priceRub),
      priceNote: link.periodDays === 30 ? 'в месяц' : `${price(Math.round(link.priceRub / (link.periodDays / 30)))} в месяц`,
      checked: link === chosen, onSelect: () => { chosen = link; } }));
  }
}

function paymentUrl(link) {
  const url = new URL(link.payUrl);
  if (url.protocol !== 'https:' || url.hostname !== PAY_HOST || url.username || url.password
    || url.searchParams.get('customer_email') !== app.me.user.email) throw new Error('invalid_payment_link');
  return url.href;
}

export function enterPay() {
  if (!chosen) { app.redirect('plan'); return; }
  setNote('pay');
  $('#pay-title').textContent = `Подписка ${chosen.periodDays === 30 ? 'на месяц' : 'на 3 месяца'}`;
  $('#pay-sub').textContent = `Доступ к вопросам Фортуне на ${chosen.periodDays} дней`;
  $('#pay-total').textContent = price(chosen.priceRub);
  $('#pay-submit').textContent = `Оплатить ${price(chosen.priceRub)}`;
  $('#pay-consent').checked = false;
}

async function planActive() {
  const { ok, data } = await api('/api/billing/subscription');
  return ok && data.plan?.id !== 'free' ? data.plan : null;
}

function watchPayment() {
  clearInterval(polling);
  const stop = () => clearInterval(polling);
  polling = setInterval(async () => {
    if (screenEl('pay').hidden) { stop(); return; }
    const plan = await planActive();
    if (!plan) return;
    stop();
    await refreshPlan();
    $('#paid-text').textContent = plan.expiresAt ? `Подписка активна до ${new Date(plan.expiresAt).getDate()} ${MONTHS_GEN[new Date(plan.expiresAt).getMonth()]}` : 'Подписка активна';
    $('#paid-count').textContent = plan.unlimitedChat ? '∞' : String(plan.monthlyChatMessages || plan.dailyChatMessages);
    app.go('paid');
  }, POLL_MS);
}

export function bindPay() {
  $('#plan-buy').addEventListener('click', () => { if (chosen) app.go('pay'); });
  $('#pay-submit').addEventListener('click', () => {
    if (!$('#pay-consent').checked) { setNote('pay', 'Подтвердите согласие с офертой и политикой данных.'); return; }
    try {
      const opened = window.open(paymentUrl(chosen), '_blank', 'noopener,noreferrer');
      if (!opened) { location.href = paymentUrl(chosen); return; }
      setNote('pay', 'Окно оплаты открыто. После оплаты вернитесь сюда — подписка включится сама.', true);
      watchPayment();
    } catch { setNote('pay', 'Оплата сейчас недоступна. Попробуйте позже.'); }
  });
}

export async function enterProfile() {
  const user = app.me.user;
  $('#t-profile').textContent = visitorName();
  $('#profile-mail').textContent = user.email;
  const plan = app.plan?.plan;
  const sub = await api('/api/billing/subscription');
  const until = sub.ok && sub.data.plan?.expiresAt && sub.data.plan.id !== 'free' ? `до ${formatDate(new Date(sub.data.plan.expiresAt).toISOString())}` : '';
  $('#profile-plan').textContent = [plan?.label, until].filter(Boolean).join(' · ');
  $('#profile-quota').textContent = plan?.welcomeBonus?.active ? planLine()
    : plan ? (plan.unlimitedChat ? 'Безлимитные вопросы' : `${plan.monthlyChatMessages || plan.dailyChatMessages} вопросов в ${plan.monthlyChatMessages ? "месяц" : "день"}`) : '';
  const current = sub.ok ? sub.data.plan : plan;
  if (current?.chatUsage && !current.unlimitedChat) {
    const q = current.chatUsage;
    const reset = new Intl.DateTimeFormat('ru-RU', {timeZone:'Europe/Moscow', day:'numeric', month:'long'}).format(new Date(q.resetsAt));
    $('#profile-quota').textContent = `Осталось ${q.remaining} из ${q.limit} вопросов · обновление ${reset}`;
  }
  const orders = $('#profile-orders');
  const history = sub.ok ? (sub.data.orders ?? []) : [];
  orders.replaceChildren();
  if (!sub.ok) orders.append(node('p','block-note','Не удалось загрузить историю оплат. Открой профиль повторно.'));
  else if (!history.length) orders.append(node('p','block-note','Здесь появятся ваши оплаты подписки. Пока оплат нет.'));
  else for (const order of history) {
    const row = node('div','payment-history-row');
    const status = {paid:'Оплачено',pending:'Ожидает оплаты',canceled:'Отменено',failed:'Не оплачено',refunded:'Возврат'}[order.status] ?? 'Обрабатывается';
    const date = new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',year:'numeric'}).format(new Date(order.paidAt ?? order.createdAt));
    row.append(node('strong','',`${order.periodDays} дней · ${new Intl.NumberFormat('ru-RU',{style:'currency',currency:order.currency || 'RUB'}).format(order.amount)}`),node('p','block-note',`${date} · ${status}`));
    orders.append(row);
  }
  const profile = birth();
  $('#profile-chart').textContent = profile ? `${visitorName()} · ${formatDate(profile.birthDate)}, ${profile.birthPlace}` : 'Данные рождения пока не заполнены.';
}

function personRow({ title, note, onOpen }) {
  const row = node('button', 'card person'); row.type = 'button';
  const photo = node('span', 'person-photo'); const icon = node('img'); icon.src = '/miniapp/assets/icons-3d/user.webp'; icon.alt = ''; icon.width = 24; icon.height = 24; photo.append(icon);
  const text = node('span'); text.append(node('strong', '', title), node('small', '', note));
  row.append(photo, text, node('i', 'chev'));
  row.addEventListener('click', onOpen);
  return row;
}

export async function enterPeople() {
  setNote('people');
  const { ok, data } = await api('/api/profiles');
  if (!ok) { setNote('people', data.message || 'Не удалось загрузить список.'); return; }
  const list = $('#people-list');
  const rows = [];
  if (data.self) rows.push(personRow({ title: visitorName(), note: `Это вы · ${formatDate(data.self.birthDate)}, ${data.self.birthPlace}`, onOpen: () => app.go('natal') }));
  for (const item of data.profiles ?? []) {
    rows.push(personRow({ title: item.label, note: `${data.relationLabels?.[item.relation] ?? item.relation} · ${formatDate(item.birthDate)}, ${item.birthPlace}`,
      onOpen: () => personSheet(item, data.relationLabels) }));
  }
  list.replaceChildren(...rows);
  const free = data.plan.relations.length === 0;
  $('#people-add').dataset.locked = String(free);
  $('#people-note').textContent = free ? 'Добавлять близких можно по подписке.' : `Можно добавить ${data.plan.maxPeople - 1} близкого человека. Вопросы используют общий лимит подписки.`;
  app.relations = { allowed: data.plan.relations, labels: data.relationLabels };
}

function personSheet(item, labels) {
  const body = node('div');
  body.append(node('p', 'sheet-text', `${labels?.[item.relation] ?? item.relation} · ${formatDate(item.birthDate)}, ${item.birthTime}, ${item.birthPlace}`));
  const chart = node('button','btn btn-gold','Натальная карта'); chart.type='button';
  chart.disabled = !!item.locked;
  chart.addEventListener('click', async () => {
    chart.disabled=true;
    const result=await api(`/api/natal/profiles/${item.id}`).catch(()=>({ok:false,data:{}}));
    chart.disabled=false;
    if (!result.ok) { body.append(node('p','form-note',result.data.message || 'Не удалось загрузить карту.')); return; }
    const view=node('div','person-natal-view');
    const wheel=node('div','person-natal-wheel');view.append(wheel);drawWheel(wheel,result.data.natal);
    for(const section of result.data.natal.sections) {
      const entry=node('article','person-natal-section');entry.append(node('h3','',section.title),node('p','gold',section.sign),node('p','',section.lead),node('p','block-note',section.text));view.append(entry);
    }
    openSheet(`Натальная карта · ${item.label}`,view);
  });
  body.append(chart);
  if(item.locked) body.append(node('p','hint','Для просмотра карты нужна действующая подписка.'));
  const remove = node('button', 'btn btn-line', 'Удалить карту'); remove.type = 'button';
  remove.addEventListener('click', async () => {
    const { ok } = await api(`/api/profiles/${item.id}`, { method: 'DELETE' });
    closeSheet();
    if (ok) enterPeople(); else setNote('people', 'Не удалось удалить карту. Попробуйте позже.');
  });
  body.append(remove);
  openSheet(item.label, body);
}

export function bindPeople() {
  $('#people-add').addEventListener('click', (event) => {
    if (event.currentTarget.dataset.locked === 'true') { app.go('plan'); return; }
    app.birthMode = 'person';
    app.go('birth');
  });
}
