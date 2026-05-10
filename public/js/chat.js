(function () {
  let ws = null;
  let username = '';
  let currentChat = 'public';
  let onlineUsers = [];
  const chats = { public: [] };
  const unread = {};

  const messagesEl = document.getElementById('messages');
  const userListEl = document.getElementById('user-list');
  const messageInput = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const chatTitle = document.getElementById('chat-title');
  const closePrivateBtn = document.getElementById('close-private-btn');
  const currentUsernameEl = document.getElementById('current-username');
  const currentUserAvatar = document.getElementById('current-user-avatar');
  const logoutBtn = document.getElementById('logout-btn');

  async function init() {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) throw new Error('Not authenticated');
      const data = await res.json();
      username = data.username;
      currentUsernameEl.textContent = username;
      currentUserAvatar.textContent = username[0].toUpperCase();
      connectWebSocket();
    } catch {
      window.location.href = '/';
    }
  }

  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}`);

    ws.onopen = () => {
      messageInput.disabled = false;
      sendBtn.disabled = false;
      messageInput.focus();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch {}
    };

    ws.onclose = () => {
      messageInput.disabled = true;
      sendBtn.disabled = true;
      addSystemMessage('连接已断开，正在重连...');
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'message':
        handleChatMessage(msg);
        break;
      case 'system':
        addSystemMessage(msg.content);
        break;
      case 'users':
        onlineUsers = msg.list;
        renderUserList();
        break;
    }
  }

  function handleChatMessage(msg) {
    const isPrivate = msg.to !== 'public';
    const chatId = isPrivate ? (msg.from === username ? msg.to : msg.from) : 'public';
    const isSelf = msg.from === username;

    if (!chats[chatId]) chats[chatId] = [];
    chats[chatId].push(msg);
    if (chats[chatId].length > 100) chats[chatId].shift();

    if (currentChat === chatId) {
      renderMessages();
    } else if (isPrivate) {
      if (!unread[chatId]) unread[chatId] = 0;
      unread[chatId]++;
      renderUserList();
      showNotification(msg.from);
    }
  }

  function addSystemMessage(content) {
    const div = document.createElement('div');
    div.className = 'message system';
    div.textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderMessages() {
    const chatMessages = chats[currentChat] || [];
    messagesEl.innerHTML = '';

    chatMessages.forEach(msg => {
      const isSelf = msg.from === username;
      const div = document.createElement('div');

      if (currentChat === 'public') {
        div.className = isSelf ? 'message self' : 'message other';
        const header = document.createElement('div');
        header.className = 'message-header';
        header.innerHTML = `<span>${isSelf ? '你' : msg.from}</span><span class="message-time">${formatTime(msg.time)}</span>`;
        div.appendChild(header);
      } else {
        div.className = isSelf ? 'message self' : 'message other';
        const header = document.createElement('div');
        header.className = 'message-header';
        header.innerHTML = `<span>${isSelf ? '你' : msg.from} <span class="private-badge">(私聊)</span></span><span class="message-time">${formatTime(msg.time)}</span>`;
        div.appendChild(header);
      }

      const content = document.createElement('div');
      content.textContent = msg.content;
      div.appendChild(content);
      messagesEl.appendChild(div);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderUserList() {
    userListEl.innerHTML = '';
    onlineUsers.forEach(name => {
      if (name === username) return;
      const li = document.createElement('li');
      li.className = 'user-item' + (currentChat === name ? ' active' : '');
      li.innerHTML = `<span class="user-status"></span><span>${name}</span>`;

      if (unread[name]) {
        const badge = document.createElement('span');
        badge.className = 'unread-badge';
        badge.textContent = unread[name];
        li.appendChild(badge);
      }

      li.addEventListener('click', () => switchToPrivate(name));
      userListEl.appendChild(li);
    });
  }

  function switchToPrivate(targetUser) {
    if (targetUser === username) return;
    currentChat = targetUser;
    chatTitle.textContent = `与 ${targetUser} 私聊中`;
    closePrivateBtn.classList.remove('hidden');
    document.querySelectorAll('.user-item').forEach(el => {
      el.classList.toggle('active', el.textContent.trim() === targetUser);
    });
    delete unread[targetUser];
    renderUserList();
    renderMessages();
    messageInput.focus();
  }

  function switchToPublic() {
    currentChat = 'public';
    chatTitle.textContent = '公共聊天室';
    closePrivateBtn.classList.add('hidden');
    renderUserList();
    renderMessages();
    messageInput.focus();
  }

  function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      type: 'message',
      to: currentChat === 'public' ? 'public' : currentChat,
      content
    }));
    messageInput.value = '';
  }

  function showNotification(from) {
    const existing = document.querySelector('.private-notification');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.className = 'private-notification';
    div.textContent = `来自 ${from} 的私聊消息`;
    div.addEventListener('click', () => {
      switchToPrivate(from);
      div.remove();
    });
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 5000);
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  // Event listeners
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  closePrivateBtn.addEventListener('click', switchToPublic);

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    if (ws) ws.close();
    window.location.href = '/';
  });

  // Add unread badge style
  const style = document.createElement('style');
  style.textContent = `
    .unread-badge {
      margin-left: auto;
      background: #ff6b6b;
      color: #fff;
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 10px;
      min-width: 18px;
      text-align: center;
    }
    .user-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      cursor: pointer;
      transition: background 0.2s;
      font-size: 14px;
    }
  `;
  document.head.appendChild(style);

  init();
})();
