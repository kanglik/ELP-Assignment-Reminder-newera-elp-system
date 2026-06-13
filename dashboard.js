/**
 * ELP 智能助手 v3.1 - 完整版
 * 功能：中文显示、九宫格、红绿配色、批量归档、提醒设置、深色模式
 */

let allAssignments = [];
let courseMap = {};

async function init() {
  try {
    const data = await chrome.storage.local.get(['elp_assignments', 'elp_courses', 'darkMode', 'remind_days']);
    
    // 1. 深色模式
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (data.darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (darkModeToggle) darkModeToggle.checked = true;
    }
    if (darkModeToggle) {
      darkModeToggle.onchange = (e) => {
        const isDark = e.target.checked;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        chrome.storage.local.set({ darkMode: isDark });
      };
    }

    // 2. 🚀 提醒天数设置逻辑回归
    const remindDaysSelect = document.getElementById('remindDays');
    if (remindDaysSelect) {
      remindDaysSelect.value = data.remind_days || 1;
      remindDaysSelect.onchange = async (e) => {
        const val = Number(e.target.value);
        await chrome.storage.local.set({ remind_days: val });
        // 极简反馈：边框闪烁一下
        e.target.style.borderColor = 'var(--color-success)';
        setTimeout(() => { e.target.style.borderColor = ''; }, 500);
      };
    }

    // 3. 批量归档
    document.getElementById('bulkArchiveDone').onclick = () => bulkArchive('completed');
    document.getElementById('bulkArchiveOverdue').onclick = () => bulkArchive('overdue');

    // 4. 数据加载
    const courses = data.elp_courses || [];
    courses.forEach(c => { courseMap[c.courseId] = c.title; });
    allAssignments = data.elp_assignments || [];

    updateStats();
    renderBoard();
    
    // 5. 事件绑定
    document.getElementById('searchInput').oninput = renderBoard;
    document.getElementById('filterStatus').onchange = renderBoard;

  } catch (err) {
    console.error("Init Error:", err);
  }
}

async function bulkArchive(targetType) {
    const now = Date.now();
    const data = await chrome.storage.local.get('elp_assignments');
    let list = data.elp_assignments || [];
    list.forEach(a => {
        if (a.archived) return;
        const isDone = a.completed || a.manualCompleted;
        const isOverdue = !isDone && (a.dueDate && a.dueDate < now);
        if ((targetType === 'completed' && isDone) || (targetType === 'overdue' && isOverdue)) {
            a.archived = true;
        }
    });
    await chrome.storage.local.set({ elp_assignments: list });
    allAssignments = list;
    updateStats();
    renderBoard();
}

function updateStats() {
  const now = Date.now();
  let pending = 0, completed = 0, overdue = 0;
  allAssignments.forEach(a => {
    if (a.archived) return;
    const isDone = a.completed || a.manualCompleted;
    if (isDone) completed++;
    else if (a.dueDate && a.dueDate < now) overdue++;
    else pending++;
  });
  document.getElementById('stat-pending').innerText = pending;
  document.getElementById('stat-completed').innerText = completed;
  document.getElementById('stat-overdue').innerText = overdue;
}

function renderBoard() {
  const board = document.getElementById('board-content');
  if (!board) return;
  const searchText = document.getElementById('searchInput').value.toLowerCase();
  const filterValue = document.getElementById('filterStatus').value;
  const now = Date.now();

  let filtered = allAssignments.filter(a => {
    const title = (a.title || "").toLowerCase();
    const course = (courseMap[a.courseId] || "").toLowerCase();
    const matchSearch = title.includes(searchText) || course.includes(searchText);
    if (filterValue === 'archived') return matchSearch && a.archived;
    if (a.archived) return false;
    const isDone = a.completed || a.manualCompleted;
    const isOverdue = !isDone && (a.dueDate && a.dueDate < now);
    let matchStatus = true;
    if (filterValue === 'pending') matchStatus = !isDone && !isOverdue;
    if (filterValue === 'completed') matchStatus = isDone;
    if (filterValue === 'overdue') matchStatus = isOverdue;
    return matchSearch && matchStatus;
  });

  filtered.sort((a, b) => (a.dueDate || 9999999999999) - (b.dueDate || 9999999999999));

  board.innerHTML = '';
  const gridContainer = document.createElement('div');
  gridContainer.className = 'assignment-list';

  if (filtered.length === 0) {
    board.innerHTML = `<div class="empty-state">目前没有需要处理的任务</div>`;
    return;
  }

  filtered.forEach(task => {
    const isDone = task.completed || task.manualCompleted;
    const isOverdue = !isDone && task.dueDate && task.dueDate < now;
    let label = '待完成', labelClass = 'tag-pending', daysText = '无期限';
    if (isDone) {
      label = '已完成'; labelClass = 'tag-done'; daysText = '任务达成';
    } else if (task.dueDate) {
      const days = Math.ceil((task.dueDate - now) / 86400000);
      if (days < 0) {
        label = '已逾期'; labelClass = 'tag-overdue'; daysText = `已逾期 ${Math.abs(days)} 天`;
      } else {
        label = '待完成'; labelClass = 'tag-pending'; daysText = `剩 ${days} 天`;
      }
    }
    const dateStr = task.dueDate ? new Date(task.dueDate).toLocaleDateString('zh-CN', {month:'short', day:'numeric'}) : '未知';

    const card = document.createElement('div');
    card.className = `assignment-card ${task.archived ? 'is-archived' : ''}`;
    card.innerHTML = `
      <div>
        <span class="tag ${labelClass}">${label}</span>
        <h3 class="card-title"><a href="${task.url}" target="_blank">${task.title}</a></h3>
        <div style="font-size:11px; color:var(--text-secondary); margin-top:5px;">${courseMap[task.courseId] || ''}</div>
      </div>
      <div>
        <div class="card-footer">
          <span>截止: ${dateStr}</span>
          <span style="color:${isDone ? 'var(--color-success)' : 'var(--color-danger)'}">${daysText}</span>
        </div>
        <div class="action-btns">
          <button class="btn-action btn-done ${task.manualCompleted ? 'btn-done-active' : ''}" data-id="${task.assignmentId}">${task.manualCompleted ? '取消标记' : '标记完成'}</button>
          <button class="btn-action btn-archive" data-id="${task.assignmentId}">${task.archived ? '取消归档' : '归档'}</button>
        </div>
      </div>
    `;
    gridContainer.appendChild(card);
  });
  board.appendChild(gridContainer);

  gridContainer.onclick = async (e) => {
    const btn = e.target;
    const id = btn.dataset.id;
    if (!id) return;
    const data = await chrome.storage.local.get('elp_assignments');
    let list = data.elp_assignments || [];
    const i = list.findIndex(a => a.assignmentId === id);
    if (btn.classList.contains('btn-done')) list[i].manualCompleted = !list[i].manualCompleted;
    if (btn.classList.contains('btn-archive')) list[i].archived = !list[i].archived;
    await chrome.storage.local.set({ elp_assignments: list });
  };
}

init();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.elp_assignments || changes.elp_courses)) {
    chrome.storage.local.get(['elp_assignments']).then(res => {
      allAssignments = res.elp_assignments || [];
      updateStats();
      renderBoard();
    });
  }
});