// 打开新的 Dashboard 页面
document.getElementById("dashboardBtn").onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
};

// 触发后台同步
document.getElementById("syncBtn").onclick = () => {
  const statusEl = document.getElementById("statusInfo");
  statusEl.innerText = "🚀 扫描已启动，可打开看板查看实时进度...";
  statusEl.style.color = "#27ae60";

  chrome.runtime.sendMessage({ action: "smartSync" }, (res) => {
    console.log("后台已收到扫描指令:", res);
  });
};