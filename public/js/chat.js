(function () {
  let ws = null;
  let username = '';
  let userId = null;
  let currentChat = 'public';
  let friends = [];
  let groups = [];
  let onlineUsers = [];
  let pendingRequests = [];
  const chats = { public: [] };
  const unread = {};
  let mentionUsers = [];
  let mentionIndex = -1;

  const messagesEl = document.getElementById('messages');
  const messageInput = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const chatTitle = document.getElementById('chat-title');
  const chatSubtitle = document.getElementById('chat-subtitle');
  const closeChatBtn = document.getElementById('close-chat-btn');
  const currentUsernameEl = document.getElementById('current-username');
  const currentUserAvatar = document.getElementById('current-user-avatar');
  const logoutBtn = document.getElementById('logout-btn');
  const friendsList = document.getElementById('friends-list');
  const groupsList = document.getElementById('groups-list');
  const onlineList = document.getElementById('online-list');
  const sidebarContent = document.getElementById('sidebar-content');
  const imageBtn = document.getElementById('image-btn');
  const mentionDropdown = document.getElementById('mention-dropdown');
  const inviteBtn = document.getElementById('invite-btn');
  const leaveGroupBtn = document.getElementById('leave-group-btn');
  let currentGroupId = null;

  async function init() {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) throw new Error('Not authenticated');
      const data = await res.json();
      username = data.username;
      userId = data.userId;
      currentUsernameEl.textContent = username;
      currentUserAvatar.textContent = username[0].toUpperCase();
      await loadFriends();
      await loadGroups();
      connectWebSocket();
    } catch {
      window.location.href = '/';
    }
  }

  // --- WebSocket ---
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
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => ws.close();
  }

  // --- Message Handling ---
  function handleMessage(msg) {
    switch (msg.type) {
      case 'message':
        handleChatMessage('public', msg);
        break;
      case 'private_message': {
        const chatId = 'friend:' + (msg.from === username ? msg.to : msg.from);
        handleChatMessage(chatId, msg);
        break;
      }
      case 'group_message': {
        const chatId = 'group:' + msg.group;
        handleChatMessage(chatId, msg);
        break;
      }
      case 'system':
        addSystemMessage(msg.content);
        break;
      case 'users':
        onlineUsers = msg.list;
        renderOnlineList();
        renderFriendsList();
        break;
      case 'friend_request':
        showNotification(`${msg.from} 发送了好友请求`);
        loadPendingRequests();
        break;
      case 'friend_accept':
        showNotification(`你与 ${msg.from} 已成为好友`);
        loadFriends();
        loadPendingRequests();
        break;
      case 'mention':
        showNotification(`${msg.from} 在消息中提到了你`);
        break;
      case 'error':
        showNotification(msg.message);
        break;
    }
  }

  function handleChatMessage(chatId, msg) {
    if (!chats[chatId]) chats[chatId] = [];
    chats[chatId].push(msg);
    if (chats[chatId].length > 200) chats[chatId].shift();

    if (currentChat === chatId) {
      renderMessages();
    } else {
      if (!unread[chatId]) unread[chatId] = 0;
      unread[chatId]++;
      updateSidebarBadges();
    }
  }

  // --- Chat Switching ---
  function switchChat(chatId, title, subtitle) {
    currentChat = chatId;
    currentGroupId = chatId.startsWith('group:') ? chatId.replace('group:', '') : null;
    chatTitle.textContent = title;
    chatSubtitle.textContent = subtitle || '';
    closeChatBtn.classList.toggle('hidden', chatId === 'public');
    inviteBtn.classList.toggle('hidden', !currentGroupId);
    leaveGroupBtn.classList.toggle('hidden', !currentGroupId);
    delete unread[chatId];
    updateSidebarBadges();
    highlightSidebarItem(chatId);
    renderMessages();
    messageInput.focus();
    adjustTextarea();
  }

  function switchToPublic() {
    switchChat('public', '公共聊天室');
  }

  function switchToFriend(friendUsername) {
    switchChat('friend:' + friendUsername, '与 ' + friendUsername + ' 私聊', '好友');
  }

  function switchToGroup(groupId, groupName) {
    switchChat('group:' + groupId, groupName, '群聊');
  }

  function highlightSidebarItem(chatId) {
    document.querySelectorAll('.sidebar-item, .group-item').forEach(el => {
      el.classList.toggle('active', el.dataset.chatId === chatId);
    });
  }

  // --- Rendering Messages ---
  function renderMessages() {
    const msgs = chats[currentChat] || [];
    messagesEl.innerHTML = '';

    msgs.forEach(msg => {
      if (msg.type === 'system') {
        const div = document.createElement('div');
        div.className = 'message system';
        div.textContent = msg.content;
        messagesEl.appendChild(div);
        return;
      }

      const isSelf = msg.from === username;
      const div = document.createElement('div');
      div.className = isSelf ? 'message self' : 'message other';

      const header = document.createElement('div');
      header.className = 'message-header';
      header.innerHTML = `<span>${isSelf ? '你' : msg.from}${msg.groupName ? ' → ' + msg.groupName : ''}${msg.to && msg.to !== 'public' && msg.to !== username ? ' <span class="private-badge">(私聊)</span>' : ''}</span><span class="message-time">${formatTime(msg.time)}</span>`;
      div.appendChild(header);

      const content = document.createElement('div');
      content.className = 'message-content';
      content.innerHTML = renderContent(msg.content);
      div.appendChild(content);

      messagesEl.appendChild(div);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderContent(text) {
    let html = escapeHtml(text);

    // @mentions
    html = html.replace(/@(\w{2,20})/g, '<span class="mention">@$1</span>');

    // LaTeX block: $$...$$
    html = html.replace(/\$\$(.+?)\$\$/gs, (_, expr) => {
      try {
        return katex.renderToString(expr, { displayMode: true, throwOnError: false });
      } catch {
        return `<span class="katex-error">$$${expr}$$</span>`;
      }
    });

    // LaTeX inline: $...$
    html = html.replace(/\$(.+?)\$/g, (_, expr) => {
      try {
        return katex.renderToString(expr, { displayMode: false, throwOnError: false });
      } catch {
        return `<span class="katex-error">$${expr}$</span>`;
      }
    });

    // Markdown
    html = marked.parse(html, { breaks: true, gfm: true });

    return html;
  }

  function addSystemMessage(content) {
    const div = document.createElement('div');
    div.className = 'message system';
    div.textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // --- API Calls ---
  async function loadFriends() {
    try {
      const res = await fetch('/api/friends');
      friends = await res.json();
      renderFriendsList();
    } catch {}
  }

  async function loadGroups() {
    try {
      const res = await fetch('/api/groups');
      groups = await res.json();
      renderGroupsList();
    } catch {}
  }

  async function loadPendingRequests() {
    try {
      const res = await fetch('/api/friends/requests');
      pendingRequests = await res.json();
      renderPendingRequests();
    } catch {}
  }

  // --- Sidebar Rendering ---
  function renderFriendsList() {
    const onlineSet = new Set(onlineUsers);
    friendsList.innerHTML = '';
    if (friends.length === 0) {
      friendsList.innerHTML = '<li class="list-empty">暂无好友</li>';
      return;
    }
    friends.forEach(f => {
      const li = document.createElement('li');
      li.className = 'sidebar-item';
      li.dataset.chatId = 'friend:' + f.username;
      li.innerHTML = `<span class="status-dot ${onlineSet.has(f.username) ? '' : 'offline'}"></span><span class="name">${f.username}</span>`;
      if (unread['friend:' + f.username]) {
        li.innerHTML += `<span class="badge">${unread['friend:' + f.username]}</span>`;
      }
      li.addEventListener('click', () => switchToFriend(f.username));
      friendsList.appendChild(li);
    });
  }

  function renderGroupsList() {
    groupsList.innerHTML = '';
    if (groups.length === 0) {
      groupsList.innerHTML = '<li class="list-empty">暂无群组</li>';
      return;
    }
    groups.forEach(g => {
      const li = document.createElement('li');
      li.className = 'group-item';
      li.dataset.chatId = 'group:' + g.id;
      li.innerHTML = `<span class="group-icon">#</span><span class="name">${g.name}</span><span class="item-sub">${g.member_count} 人</span>`;
      if (unread['group:' + g.id]) {
        li.innerHTML += `<span class="badge">${unread['group:' + g.id]}</span>`;
      }
      li.addEventListener('click', () => switchToGroup(g.id, g.name));
      groupsList.appendChild(li);
    });
  }

  function renderOnlineList() {
    onlineList.innerHTML = '';
    if (onlineUsers.length === 0) {
      onlineList.innerHTML = '<li class="list-empty">暂无在线用户</li>';
      return;
    }
    const friendUsernames = new Set(friends.map(f => f.username));
    onlineUsers.forEach(name => {
      if (name === username) return;
      const li = document.createElement('li');
      li.className = 'sidebar-item';
      li.innerHTML = `<span class="status-dot"></span><span class="name">${name}</span>`;

      if (!friendUsernames.has(name)) {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.textContent = '+添加';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          sendFriendRequestAPI(name);
        });
        li.appendChild(btn);
      } else {
        li.addEventListener('click', () => switchToFriend(name));
      }
      onlineList.appendChild(li);
    });
  }

  function renderPendingRequests() {
    const area = document.getElementById('pending-requests-area');
    const list = document.getElementById('pending-requests-list');
    const count = document.getElementById('request-count');

    if (pendingRequests.length === 0) {
      area.classList.add('hidden');
      count.classList.add('hidden');
      return;
    }

    area.classList.remove('hidden');
    count.classList.remove('hidden');
    count.textContent = '(' + pendingRequests.length + ')';

    list.innerHTML = '';
    pendingRequests.forEach(r => {
      const li = document.createElement('li');
      li.className = 'sidebar-item';
      li.style.cursor = 'default';
      li.innerHTML = `<span class="name">${r.username}</span>`;
      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'action-btn';
      acceptBtn.textContent = '接受';
      acceptBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        acceptFriendRequestAPI(r.username);
      });
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'action-btn';
      rejectBtn.textContent = '拒绝';
      rejectBtn.style.color = '#ff6b6b';
      rejectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        rejectFriendRequestAPI(r.username);
      });
      li.appendChild(acceptBtn);
      li.appendChild(rejectBtn);
      list.appendChild(li);
    });
  }

  function updateSidebarBadges() {
    renderFriendsList();
    renderGroupsList();
  }

  // --- Friend Request APIs ---
  async function sendFriendRequestAPI(targetUsername) {
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: targetUsername })
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(data.error);
        return;
      }
      showNotification('好友请求已发送');
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'friend_request', to: targetUsername }));
      }
    } catch {
      showNotification('网络错误');
    }
  }

  async function acceptFriendRequestAPI(targetUsername) {
    try {
      const res = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: targetUsername })
      });
      if (!res.ok) return;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'friend_accept', to: targetUsername }));
      }
      await loadFriends();
      await loadPendingRequests();
    } catch {}
  }

  async function rejectFriendRequestAPI(targetUsername) {
    try {
      await fetch('/api/friends/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: targetUsername })
      });
      await loadPendingRequests();
    } catch {}
  }

  // --- Group APIs ---
  async function createGroupAPI(name) {
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(data.error);
        return;
      }
      await loadGroups();
      switchToGroup(data.id, data.name);
    } catch {
      showNotification('创建失败');
    }
  }

  async function inviteToGroupAPI(groupId, targetUsername) {
    try {
      const res = await fetch('/api/groups/' + groupId + '/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: targetUsername })
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(data.error);
        return;
      }
      showNotification('已邀请 ' + targetUsername);
      closeAllModals();
    } catch {}
  }

  // --- Send Message ---
  function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !ws || ws.readyState !== WebSocket.OPEN) return;

    let to;
    if (currentChat === 'public') {
      to = 'public';
    } else if (currentChat.startsWith('friend:')) {
      to = currentChat.replace('friend:', '');
    } else if (currentChat.startsWith('group:')) {
      to = 'group:' + currentChat.replace('group:', '');
    }

    ws.send(JSON.stringify({ type: 'message', to, content }));
    messageInput.value = '';
    adjustTextarea();
    mentionDropdown.classList.add('hidden');
  }

  // --- @Mention ---
  function checkMention(input) {
    const cursorPos = messageInput.selectionStart;
    const text = messageInput.value.substring(0, cursorPos);
    const match = text.match(/@(\w*)$/);

    if (match) {
      const query = match[1].toLowerCase();
      mentionUsers = onlineUsers
        .filter(u => u !== username && u.toLowerCase().startsWith(query))
        .slice(0, 8);
      mentionIndex = -1;

      if (mentionUsers.length > 0) {
        mentionDropdown.innerHTML = mentionUsers.map((u, i) =>
          `<div class="mention-item" data-index="${i}">@${u}</div>`
        ).join('');
        mentionDropdown.classList.remove('hidden');

        mentionDropdown.querySelectorAll('.mention-item').forEach(el => {
          el.addEventListener('click', () => {
            insertMention(el.textContent.replace('@', ''));
          });
        });
        return;
      }
    }
    mentionDropdown.classList.add('hidden');
  }

  function insertMention(user) {
    const cursorPos = messageInput.selectionStart;
    const text = messageInput.value;
    const before = text.substring(0, cursorPos);
    const after = text.substring(cursorPos);
    const lastAt = before.lastIndexOf('@');
    const mentionText = '@' + user + ' ';
    messageInput.value = before.substring(0, lastAt) + mentionText + after;
    messageInput.focus();
    messageInput.selectionStart = messageInput.selectionEnd = lastAt + mentionText.length;
    mentionDropdown.classList.add('hidden');
    adjustTextarea();
  }

  // --- Image Handling ---
  function handleImage(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      showNotification('图片不能超过 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      const markdownImg = `![image](${base64})`;
      const cursorPos = messageInput.selectionStart;
      const text = messageInput.value;
      messageInput.value = text.substring(0, cursorPos) + markdownImg + text.substring(cursorPos);
      messageInput.focus();
      adjustTextarea();
    };
    reader.readAsDataURL(file);
  }

  // --- UI Helpers ---
  function showNotification(message) {
    const existing = document.querySelector('.chat-notification');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.className = 'chat-notification';
    div.textContent = message;
    div.addEventListener('click', () => div.remove());
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, c => map[c]);
  }

  function adjustTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  }

  // --- Modal Management ---
  function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
  }

  // --- Sidebar Tabs ---
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  // --- Event Listeners ---
  sendBtn.addEventListener('click', sendMessage);

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!mentionDropdown.classList.contains('hidden')) {
        const selected = mentionDropdown.querySelector('.mention-item.selected');
        if (selected) {
          insertMention(selected.textContent.replace('@', ''));
          return;
        }
      }
      sendMessage();
    }
    if (e.key === 'Tab' && !mentionDropdown.classList.contains('hidden')) {
      e.preventDefault();
      const items = mentionDropdown.querySelectorAll('.mention-item');
      if (items.length === 0) return;
      e.shiftKey ? (mentionIndex = (mentionIndex - 1 + items.length) % items.length)
                 : (mentionIndex = (mentionIndex + 1) % items.length);
      items.forEach((el, i) => el.classList.toggle('selected', i === mentionIndex));
    }
  });

  messageInput.addEventListener('input', () => {
    checkMention(messageInput.value);
    adjustTextarea();
  });

  closeChatBtn.addEventListener('click', switchToPublic);

  inviteBtn.addEventListener('click', () => {
    if (!currentGroupId) return;
    const modal = document.getElementById('invite-modal');
    modal.classList.remove('hidden');
    const list = document.getElementById('invite-list');
    list.innerHTML = '';
    const onlineFriends = friends.filter(f => onlineUsers.includes(f.username));
    if (onlineFriends.length === 0) {
      list.innerHTML = '<li class="list-empty">没有可邀请的在线好友</li>';
      return;
    }
    onlineFriends.forEach(f => {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.innerHTML = `<span>${f.username}</span>`;
      const btn = document.createElement('button');
      btn.className = 'btn-small';
      btn.textContent = '邀请';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '已邀请';
        await inviteToGroupAPI(currentGroupId, f.username);
      });
      div.appendChild(btn);
      list.appendChild(div);
    });
  });

  leaveGroupBtn.addEventListener('click', async () => {
    if (!currentGroupId) return;
    if (!confirm('确定退出该群聊？')) return;
    const res = await fetch('/api/groups/' + currentGroupId + '/leave', { method: 'POST' });
    if (res.ok) {
      await loadGroups();
      switchToPublic();
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    if (ws) ws.close();
    window.location.href = '/';
  });

  // Add Friend Modal
  document.getElementById('add-friend-btn').addEventListener('click', () => {
    document.getElementById('add-friend-modal').classList.remove('hidden');
    document.getElementById('search-user-input').value = '';
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-user-input').focus();
  });

  let searchTimer = null;
  document.getElementById('search-user-input').addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = document.getElementById('search-user-input').value.trim();
    if (!q) {
      document.getElementById('search-results').innerHTML = '';
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/users/search?q=' + encodeURIComponent(q));
        const users = await res.json();
        const resultsEl = document.getElementById('search-results');
        resultsEl.innerHTML = '';
        if (users.length === 0) {
          resultsEl.innerHTML = '<li class="list-empty">未找到用户</li>';
          return;
        }
        users.forEach(u => {
          const div = document.createElement('div');
          div.className = 'search-result-item';
          div.innerHTML = `<span>${u.username}${u.isFriend ? ' <span class="private-badge">好友</span>' : ''}</span>`;
          if (!u.isFriend && u.username !== username) {
            const btn = document.createElement('button');
            btn.className = 'btn-small';
            btn.textContent = '添加好友';
            btn.addEventListener('click', async () => {
              await sendFriendRequestAPI(u.username);
              btn.disabled = true;
              btn.textContent = '已发送';
            });
            div.appendChild(btn);
          }
          resultsEl.appendChild(div);
        });
      } catch {}
    }, 300);
  });

  // Friend Requests Modal
  document.getElementById('friend-requests-btn').addEventListener('click', async () => {
    const modal = document.getElementById('requests-modal');
    modal.classList.remove('hidden');
    await loadPendingRequests();
    const list = document.getElementById('requests-list');
    list.innerHTML = '';
    if (pendingRequests.length === 0) {
      list.innerHTML = '<li class="list-empty">暂无待处理请求</li>';
      return;
    }
    pendingRequests.forEach(r => {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.innerHTML = `<span>${r.username}</span>`;
      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'btn-small';
      acceptBtn.textContent = '接受';
      acceptBtn.style.marginRight = '6px';
      acceptBtn.addEventListener('click', async () => {
        await acceptFriendRequestAPI(r.username);
        div.remove();
      });
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'btn-small';
      rejectBtn.textContent = '拒绝';
      rejectBtn.style.background = '#ff6b6b';
      rejectBtn.addEventListener('click', async () => {
        await rejectFriendRequestAPI(r.username);
        div.remove();
      });
      div.appendChild(acceptBtn);
      div.appendChild(rejectBtn);
      list.appendChild(div);
    });
  });

  // Create Group Modal
  document.getElementById('create-group-btn').addEventListener('click', () => {
    document.getElementById('create-group-modal').classList.remove('hidden');
    document.getElementById('group-name-input').value = '';
    document.getElementById('group-name-input').focus();
  });

  document.getElementById('create-group-submit').addEventListener('click', () => {
    const name = document.getElementById('group-name-input').value.trim();
    if (name) createGroupAPI(name);
  });

  document.getElementById('group-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('create-group-submit').click();
    }
  });

  // Image button
  imageBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      if (input.files[0]) handleImage(input.files[0]);
    };
    input.click();
  });

  // Paste image
  messageInput.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImage(file);
        return;
      }
    }
  });

  // Drag and drop
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        handleImage(file);
        return;
      }
    }
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAllModals();
    });
  });

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeAllModals());
  });

  // Load pending requests on init
  loadPendingRequests();

  // Init auto-resize
  messageInput.style.height = 'auto';

  init();
})();
