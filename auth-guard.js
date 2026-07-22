/**
 * auth-guard.js
 * Include this script on every staff dashboard page (kitchen, waiter, manager).
 * Call: guardPage(['kitchen']) or guardPage(['waiter']) or guardPage(['manager'])
 */

const API = 'http://localhost:3000/api';

function getToken()   { return localStorage.getItem('rr_token'); }
function getUser()    { return JSON.parse(localStorage.getItem('rr_user') || 'null'); }

function logout() {
  localStorage.removeItem('rr_token');
  localStorage.removeItem('rr_user');
  window.location.href = 'login.html';
}

// Inject the user info bar into staff-nav
function injectUserBar() {
  const user = getUser();
  if (!user) return;

  const nav = document.querySelector('.staff-nav');
  if (!nav) return;

  // Add logout button and user name to nav
  const userBar = document.createElement('div');
  userBar.className = 'nav-user-bar';
  userBar.innerHTML = `
    <span class="nav-user-name">👤 ${user.name}</span>
    <button class="nav-logout-btn" onclick="logout()">Sign Out</button>
  `;
  nav.appendChild(userBar);
}

// Inject styles for user bar
(function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .nav-user-bar {
      display: flex; align-items: center; gap: .7rem; margin-left: .5rem;
    }
    .nav-user-name {
      font-size: .78rem; color: rgba(250,246,238,.65);
      white-space: nowrap;
    }
    .nav-logout-btn {
      padding: .3rem .8rem;
      border: 1px solid rgba(201,168,76,.4); border-radius: 4px;
      background: transparent; color: var(--gold);
      font-size: .72rem; font-weight: 700; letter-spacing: .08em;
      text-transform: uppercase; cursor: pointer; transition: all .2s;
      white-space: nowrap;
    }
    .nav-logout-btn:hover { background: var(--gold); color: var(--green-dark); }
  `;
  document.head.appendChild(style);
})();

/**
 * guardPage(allowedRoles)
 * allowedRoles: array e.g. ['kitchen'] or ['waiter'] or ['manager']
 * If not authenticated or wrong role → redirect to login
 */
async function guardPage(allowedRoles) {
  const token = getToken();
  const user  = getUser();

  if (!token || !user) {
    window.location.href = 'login.html';
    return false;
  }

  if (!allowedRoles.includes(user.role)) {
    // Wrong role — redirect to their own dashboard
    const routes = { kitchen: 'kitchen.html', waiter: 'waiter.html', manager: 'manager.html' };
    window.location.href = routes[user.role] || 'login.html';
    return false;
  }

  // Verify token is still valid with the server
  try {
    const res = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('invalid');
  } catch {
    logout();
    return false;
  }

  injectUserBar();
  return true;
}

// Patch API calls in staff.js to include Authorization header
const _originalFetch = window.fetch;
window.fetch = function(url, opts = {}) {
  const token = getToken();
  if (token && typeof url === 'string' && url.includes('/api/')) {
    opts.headers = { ...(opts.headers || {}), Authorization: `Bearer ${token}` };
  }
  return _originalFetch(url, opts);
};
