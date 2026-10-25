// Log in / sign up page (account.html). #login or #signup picks the form; success returns to the workspace.
import { authRequest, currentUser, displayName } from './auth-client.js';

const $ = id => document.getElementById(id);
const COPY = {
  login: { title: 'Log in to RVAI', lead: 'Welcome back. Your workspace shows your name once you’re in.', submit: 'Log in', busy: 'Logging in…', switchText: 'New here?', switchTo: 'signup', switchLabel: 'Create an account' },
  signup: { title: 'Create your RVAI account', lead: 'Free, no card. Just a name, an email and a password.', submit: 'Create account', busy: 'Creating account…', switchText: 'Already have an account?', switchTo: 'login', switchLabel: 'Log in' },
};
let mode = location.hash === '#signup' ? 'signup' : 'login';

function setMode(next) {
  mode = next;
  const c = COPY[mode];
  $('account-title').textContent = c.title;
  $('account-lead').textContent = c.lead;
  $('auth-submit').textContent = c.submit;
  $('auth-password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  document.querySelectorAll('[data-signup-only]').forEach(n => { n.hidden = mode !== 'signup'; });
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  $('account-switch').innerHTML = `${c.switchText} <a href="#${c.switchTo}">${c.switchLabel}</a>`;
  $('auth-error').hidden = true;
  if (location.hash !== `#${mode}`) history.replaceState(null, '', `#${mode}`);
}

function showSignedIn(user) {
  $('account-forms').hidden = true;
  $('account-signed-in').hidden = false;
  $('signed-in-name').textContent = `Hi, ${displayName(user)}`;
  $('signed-in-email').textContent = `Signed in as ${user.email}`;
}

$('auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target, err = $('auth-error'), btn = $('auth-submit');
  const email = $('auth-email').value.trim(), password = $('auth-password').value;
  const problem = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Enter a valid email address.'
    : mode === 'signup' && password.length < 8 ? 'Use a password with at least 8 characters.'
    : !password ? 'Enter your password.' : '';
  if (problem) { err.textContent = problem; err.hidden = false; return; }
  btn.disabled = true;
  btn.textContent = COPY[mode].busy;
  err.hidden = true;
  try {
    const body = { email, password, ...(mode === 'signup' ? { name: $('auth-name').value.trim() } : {}) };
    await authRequest(mode, body);
    form.reset();
    location.assign('./#innovate');
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = COPY[mode].submit;
  }
});
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
addEventListener('hashchange', () => setMode(location.hash === '#signup' ? 'signup' : 'login'));
$('account-logout').addEventListener('click', async () => {
  await authRequest('logout').catch(() => {});
  $('account-signed-in').hidden = true;
  $('account-forms').hidden = false;
  setMode('login');
});

setMode(mode);
currentUser().then(u => { if (u) showSignedIn(u); });
