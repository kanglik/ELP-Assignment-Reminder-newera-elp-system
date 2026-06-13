console.log('✅ ELP v3 Background 已启动 - 智能扫描 Worker 系统');

const STORAGE_KEYS = {
  COURSES: 'elp_courses',
  ASSIGNMENTS: 'elp_assignments'
};

let scanQueue = [];
let isScanning = false;
let currentTask = null;

// 添加任务到队列并去重
function addToQueue(tasks) {
  tasks.forEach(task => {
    // 避免队列中有重复的 URL 任务
    if (!scanQueue.some(t => t.url === task.url)) {
      scanQueue.push(task);
    }
  });
  console.log(`队列新增 ${tasks.length} 个任务，当前队列长度: ${scanQueue.length}`);
  if (!isScanning) startNextTask();
}

async function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(tId, info) {
      if (tId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 2000); // 额外缓冲 2 秒，等待 Moodle JS/DOM 渲染
      }
    });
  });
}

async function startNextTask() {
  if (isScanning || scanQueue.length === 0) return;

  isScanning = true;
  currentTask = scanQueue.shift();
  console.log(`🚀 开始执行任务: [${currentTask.type}] - ${currentTask.url}`);

  let tabId = null;
  try {
    const tab = await chrome.tabs.create({ url: currentTask.url, active: false, pinned: true });
    tabId = tab.id;

    // 等待页面加载完毕
    await waitForTabComplete(tabId);

    // 发送扫描指令并等待结果
    const response = await chrome.tabs.sendMessage(tabId, { 
      action: "scanPage",
      taskType: currentTask.type 
    });

    if (response && response.ok) {
      await processScanResult(response.type, response.data);
    }

  } catch (err) {
    console.error(`❌ 任务执行失败 [${currentTask.url}]:`, err);
    
    // === 【新增】自动重试机制 ===
    // 给任务增加一个重试计数器
    if (!currentTask.retryCount) currentTask.retryCount = 0;
    
    // 如果重试次数少于 3 次，就放回队列末尾重试
    if (currentTask.retryCount < 3) {
      currentTask.retryCount++;
      console.log(`⚠️ 遇到干扰 (如用户拖动标签页)，将任务放回队列重试 (${currentTask.retryCount}/3)...`);
      scanQueue.push(currentTask);
    } else {
      console.log(`💀 任务失败超过3次，跳过此任务。`);
    }

  } finally {
    // 确保标签页被关闭
    if (tabId) {
      try { await chrome.tabs.remove(tabId); } catch(e) {}
    }
    isScanning = false;
    currentTask = null;
    
    // 节流处理下一个任务：Moodle 限流保护 (间隔 3 秒)
    setTimeout(startNextTask, 3000);
  }
}

// ====================== 数据处理流转核心 ======================
async function processScanResult(type, data) {
  if (!data) return;

  if (type === "dashboard") {
    // 存入课程并派发课程扫描任务
    await chrome.storage.local.set({ [STORAGE_KEYS.COURSES]: data });
    const courseTasks = data.map(c => ({ type: "course", url: c.url }));
    addToQueue(courseTasks);
  } 
  
  else if (type === "course") {
    // 处理找到的 Assignments
    const { elp_assignments = [] } = await chrome.storage.local.get(STORAGE_KEYS.ASSIGNMENTS);
    const existingMap = new Map(elp_assignments.map(a => [a.assignmentId, a]));
    const newTasks = [];

    data.forEach(assign => {
      const existing = existingMap.get(assign.assignmentId);
      if (!existing) {
        // 如果是全新的作业，存入并派发详情页抓取任务以获取精确状态
        existingMap.set(assign.assignmentId, assign);
        newTasks.push({ type: "assignment", url: assign.url });
      } else {
        // 增量扫描逻辑：未完成且距离上次检查超过3天，或者快截止了
        const daysSinceCheck = (Date.now() - existing.lastChecked) / 86400000;
        const daysToDue = existing.dueDate ? (existing.dueDate - Date.now()) / 86400000 : 99;
        
        if (!existing.completed && (daysSinceCheck > 3 || daysToDue < 14)) {
          newTasks.push({ type: "assignment", url: assign.url });
        }
      }
    });

    await chrome.storage.local.set({ [STORAGE_KEYS.ASSIGNMENTS]: Array.from(existingMap.values()) });
    if (newTasks.length > 0) addToQueue(newTasks);
  }

  else if (type === "assignment") {
    // 更新具体的作业状态
    const { elp_assignments = [] } = await chrome.storage.local.get(STORAGE_KEYS.ASSIGNMENTS);
    const index = elp_assignments.findIndex(a => a.assignmentId === data.assignmentId);
    
    if (index > -1) {
      elp_assignments[index] = { ...elp_assignments[index], ...data };
      await chrome.storage.local.set({ [STORAGE_KEYS.ASSIGNMENTS]: elp_assignments });
      console.log(`✅ 更新作业状态: ${data.title} -> ${data.completed ? "已完成" : "未完成"}`);
    }
  }
}

// ====================== 触发器 ======================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "smartSync") {
    triggerFullScan();
    sendResponse({ ok: true });
  }
});

function triggerFullScan() {
  console.log("⚡ 触发全量智能扫描");
  scanQueue = []; // 清空之前的死队列
  addToQueue([{
    type: "dashboard",
    url: "https://elp.newera.edu.my/my/" // 入口点：主页
  }]);
}

// ====================== 闹钟与系统通知 (P5) ======================

// 1. 当插件安装或浏览器启动时，设置定时任务
chrome.runtime.onInstalled.addListener(() => {
  // 每 60 分钟默默检查一次是否有快截止的作业
  chrome.alarms.create("deadlineCheck", { periodInMinutes: 60 });
  
  // 每天自动触发一次后台全量增量扫描 (静默更新数据)
  chrome.alarms.create("dailyAutoSync", { periodInMinutes: 1440 });
});

// 2. 监听定时器触发
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "deadlineCheck") {
    await checkAndNotify();
  } else if (alarm.name === "dailyAutoSync") {
    triggerFullScan();
  }
});

// 3. 核心：检查并触发通知 (动态读取用户设置的天数)
async function checkAndNotify() {
  // 把 "remind_days" 一并读取出来
  const data = await chrome.storage.local.get([STORAGE_KEYS.ASSIGNMENTS, "remind_days"]);
  const assignments = data[STORAGE_KEYS.ASSIGNMENTS] || [];
  const now = Date.now();
  let updated = false;

  // 💡 获取用户设置的天数（如果没有设置，默认 1 天）
  const REMIND_DAYS_BEFORE = data.remind_days || 1; 
  
  // 计算对应的毫秒数 (天数 * 24小时 * 60分 * 60秒 * 1000毫秒)
  const thresholdTime = REMIND_DAYS_BEFORE * 24 * 60 * 60 * 1000; 

  assignments.forEach(task => {
    // 条件：没完成、且没被通知过、且存在截止日期
    if (!task.completed && !task.notified && task.dueDate) {
      const timeLeft = task.dueDate - now;
      
      // 如果剩余时间 > 0 且 小于等于你设定的提醒阈值
      if (timeLeft > 0 && timeLeft <= thresholdTime) {
        
        // 发送系统级推送通知
        chrome.notifications.create(`elp_notify_${task.assignmentId}`, {
          type: 'basic',
          iconUrl: 'icon.png', 
          title: '🚨 ELP 作业即将截止！',
          message: `《${task.title}》将在 ${REMIND_DAYS_BEFORE} 天内截止，请尽快完成！`,
          priority: 2,
          requireInteraction: true 
        });
        
        // 打上标记，防止重复提醒
        task.notified = true;
        updated = true;
      }
    }
  });

  // 如果有更新状态（变成已通知），保存回 storage
  if (updated) {
    await chrome.storage.local.set({ [STORAGE_KEYS.ASSIGNMENTS]: assignments });
  }
}
// 4. 监听通知的点击事件：点击弹窗直接跳转到作业页面
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId.startsWith('elp_notify_')) {
    const assignmentId = notificationId.replace('elp_notify_', '');
    const data = await chrome.storage.local.get(STORAGE_KEYS.ASSIGNMENTS);
    const assignments = data[STORAGE_KEYS.ASSIGNMENTS] || [];
    const task = assignments.find(a => a.assignmentId === assignmentId);
    
    if (task && task.url) {
      chrome.tabs.create({ url: task.url });
    }
    
    // 点击后清除该通知
    chrome.notifications.clear(notificationId);
  }
});