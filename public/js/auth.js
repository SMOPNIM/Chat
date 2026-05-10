(function () {
  const tabs = document.querySelectorAll('.auth-tab');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      loginForm.classList.toggle('hidden', target !== 'login');
      registerForm.classList.toggle('hidden', target !== 'register');
      loginError.textContent = '';
      registerError.textContent = '';
    });
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    loginError.textContent = '';
    const btn = loginForm.querySelector('button');
    btn.disabled = true;

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        loginError.textContent = data.error;
        return;
      }
      window.location.href = '/chat.html';
    } catch {
      loginError.textContent = '网络错误，请重试';
    } finally {
      btn.disabled = false;
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    registerError.textContent = '';

    if (password !== confirm) {
      registerError.textContent = '两次密码输入不一致';
      return;
    }

    const btn = registerForm.querySelector('button');
    btn.disabled = true;

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        registerError.textContent = data.error;
        return;
      }
      window.location.href = '/chat.html';
    } catch {
      registerError.textContent = '网络错误，请重试';
    } finally {
      btn.disabled = false;
    }
  });

  // Check if already logged in
  fetch('/api/me')
    .then(res => {
      if (res.ok) window.location.href = '/chat.html';
    })
    .catch(() => {});
})();
