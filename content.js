console.log("✅ ELP v3 content loaded");

// 辅助函数：从 URL 提取 ID
function extractId(url, paramName = "id") {
  try {
    const params = new URLSearchParams(new URL(url).search);
    return params.get(paramName);
  } catch (e) {
    return null;
  }
}

// 辅助函数：解析截止日期（增强防御性编程）
function parseDue(text) {
  // 1. 防止传入空值或非字符串引发错误
  if (!text || typeof text !== 'string') return null;

  // 2. 兼容 "Due:" 或者 "Due date:"
  const match = text.match(/Due(?: date)?:\s*([^\n]+)/i);
  
  // 3. 确保 match 和 match[1] 都真实存在
  if (!match || !match[1]) return null;

  try {
    // 4. 安全地进行字符串替换和清理
    const cleaned = match[1]
      .replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*/i, "")
      .trim();

    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? null : d.getTime(); 
  } catch (error) {
    console.warn("日期解析跳过，异常文本:", match[1]);
    return null;
  }
}

// 任务1：扫描主页 (Dashboard /my/) 获取所有课程
function scanDashboard() {
  const courses = [];
  document.querySelectorAll('a[href*="course/view.php?id="]').forEach(a => {
    const url = a.href.split('&')[0]; 
    const courseId = extractId(url);
    const title = a.innerText.trim();
    
    if (courseId && title && title.length > 2) {
      courses.push({ courseId, title, url, lastScanned: Date.now() });
    }
  });
  
  const uniqueCourses = Array.from(new Map(courses.map(c => [c.courseId, c])).values());
  console.log("找到课程:", uniqueCourses);
  return uniqueCourses;
}

// 任务2：扫描课程页获取 Assignments
function scanCoursePage() {
  const assignments = [];
  const currentUrl = window.location.href;
  const courseId = extractId(currentUrl) || "unknown";

  document.querySelectorAll("li.activity.assign").forEach(a => {
    const linkEl = a.querySelector("a");
    if (!linkEl) return;
    
    const url = linkEl.href;
    const assignmentId = extractId(url);
    const title = a.querySelector(".instancename")?.innerText.trim();
    if (!title || !assignmentId) return;

    const due = parseDue(a.innerText);
    
    assignments.push({
      courseId,
      assignmentId,
      url,
      title,
      dueDate: due,
      completed: false, // 默认未完成，靠任务3修正
      overdue: due ? due < Date.now() : false,
      lastChecked: 0,   // 初始设置为0，强制触发第一次任务3扫描
      notified: false
    });
  });

  console.log("找到作业:", assignments);
  return assignments;
}

// 任务3：扫描作业详情页获取完成状态（修复误判 Bug）
function scanAssignPage() {
  const currentUrl = window.location.href;
  const assignmentId = extractId(currentUrl);
  if (!assignmentId) return null;

  const title = document.querySelector("h2")?.innerText.trim();
  let completed = false;
  
  // 【修复核心】更精准的 DOM 检查，避免 "Not graded" 匹配到 "graded"
  const statusElements = document.querySelectorAll(".submissionstatustable td");
  if (statusElements.length > 0) {
    statusElements.forEach(td => {
      const text = td.innerText.toLowerCase().trim();
      // 精确匹配 Moodle 的已提交状态
      if (text === "submitted for grading" || text === "graded") {
        completed = true;
      }
    });
  } else {
    // 兼容性 Fallback：如果没找到表格，用更严格的全文匹配
    const pageText = document.body.innerText.toLowerCase();
    if (pageText.includes("submitted for grading") && !pageText.includes("not submitted")) {
      completed = true;
    }
  }

  const due = parseDue(document.body.innerText);

  return {
    assignmentId,
    title,
    url: currentUrl,
    dueDate: due,
    completed,
    overdue: due ? due < Date.now() : false,
    lastChecked: Date.now()
  };
}

// 监听 Background 派发的扫描指令
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "scanPage") {
    let data = null;
    try {
      if (msg.taskType === "dashboard") data = scanDashboard();
      if (msg.taskType === "course") data = scanCoursePage();
      if (msg.taskType === "assignment") data = scanAssignPage();
      
      sendResponse({ ok: true, data, type: msg.taskType });
    } catch (error) {
      console.error("扫描异常:", error);
      sendResponse({ ok: false, error: error.toString() });
    }
    return true; 
  }
});