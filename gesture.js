(() => {
  "use strict";
  const video = document.querySelector("#cameraFeed");
  const overlay = document.querySelector("#handCanvas");
  const ctx = overlay.getContext("2d");
  const button = document.querySelector("#cameraButton");
  const cameraLabel = document.querySelector("#cameraLabel");
  const panel = document.querySelector("#cameraPanel");
  const gestureLabel = document.querySelector("#gestureLabel");
  const stats = document.querySelector("#trackingStats");
  const status = document.querySelector("#systemStatus");
  const fpsLabel = document.querySelector("#fpsLabel");
  const control = window.UniverseControl;
  const photoStage = document.querySelector("#photoStage");
  const photoIndex = document.querySelector("#photoIndex");
  const photoTitle = document.querySelector("#photoTitle");
  const photoCaption = document.querySelector("#photoCaption");
  const photoImage = document.querySelector("#photoImage");
  const photoMenu = document.querySelector("#photoMenu");
  const photoUpload = document.querySelector("#photoUpload");
  const photoThumbs = document.querySelector("#photoThumbs");
  const runModeButton = document.querySelector("#runModeButton");
  const clearPhotosButton = document.querySelector("#clearPhotosButton");
  const hidePhotoMenu = document.querySelector("#hidePhotoMenu");
  const showPhotoMenuButton = document.querySelector("#showPhotoMenu");
  const LINKS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  let hands, camera, running = false, loadingPromise, frames = 0, lastFpsAt = 0, fpsFrames = 0, lastPalm = null, leftPinchLatched = false, candidate = "move", candidateFrames = 0, stable = "move", leftCandidate = "move", leftCandidateFrames = 0, leftStable = "move", lastLeftGesture = "move";
  let photoCursor = 0, photoHideTimer = null, formalRunning = false;
  const defaultPhotos = [
    { title: "NEBULA MEMORY", caption: "左手捏合切换宇宙大图" },
    { title: "ORBITAL DREAM", caption: "行星轨道正在展开" },
    { title: "GREEN AURORA", caption: "星云被手势唤醒" },
    { title: "SILVER PLANET", caption: "宇宙影像已切换" }
  ];
  let photos = defaultPhotos.slice();
  const debug = window.GestureDebug = { engine: "MediaPipe Hands", running: false, frames: 0, hands: 0, gesture: "等待", camera: false, skeleton: false, lastError: "" };

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = src; script.crossOrigin = "anonymous";
      script.onload = resolve; script.onerror = () => reject(new Error("手势模型依赖加载失败，请检查网络")); document.head.appendChild(script);
    });
  }
  async function loadEngine() {
    if (window.Hands && window.Camera) return;
    loadingPromise ||= loadScript("vendor/camera_utils.js")
      .then(() => loadScript("vendor/hands/hands.js"));
    await loadingPromise;
    if (!window.Hands || !window.Camera) throw new Error("MediaPipe Hands 未能初始化");
  }
  function drawSkeleton(marks) {
    const w = video.videoWidth || 640, h = video.videoHeight || 480; if (overlay.width !== w || overlay.height !== h) { overlay.width = w; overlay.height = h; }
    ctx.clearRect(0, 0, w, h);
  }
  function metrics(m) {
    const palm = Math.max(.025, dist(m[0], m[9]));
    const fingers = [[8,6,5],[12,10,9],[16,14,13],[20,18,17]];
    let extended = 0, curled = 0;
    for (const [tip,pip,mcp] of fingers) { const a = dist(m[tip],m[0]), b = dist(m[pip],m[0]), c = Math.max(.01,dist(m[mcp],m[0])); if (a > b * 1.06 && a / c > 1.34) extended++; if (a < b * 1.02 || a / c < 1.2) curled++; }
    const pinchRatio = dist(m[4],m[8]) / palm;
    return { extended, curled, pinchRatio, palm };
  }
  function classify(x) { if (x.pinchRatio < .43 && x.curled < 3) return "pinch"; if (x.curled >= 3) return "fist"; if (x.extended >= 3) return "open"; return "move"; }
  function stabilize(next) { if (next === candidate) candidateFrames++; else { candidate = next; candidateFrames = 1; } if (candidateFrames >= (next === "pinch" ? 2 : 4)) stable = next; return stable; }
  function stabilizeLeft(next) { if (next === leftCandidate) leftCandidateFrames++; else { leftCandidate = next; leftCandidateFrames = 1; } if (leftCandidateFrames >= (next === "pinch" ? 2 : 4)) leftStable = next; return leftStable; }
  function splitHands(res) {
    const list = (res.multiHandLandmarks || []).map((marks, index) => ({
      marks,
      label: res.multiHandedness?.[index]?.label || "Unknown",
      x: marks[9].x
    }));
    if (list.length === 0) return { right: null, left: null };
    if (list.length === 1) return list[0].x < .5 ? { right: list[0], left: null } : { right: null, left: list[0] };
    list.sort((a, b) => a.x - b.x);
    return { right: list[0], left: list[1] };
  }
  function setFormalRunning(value) {
    formalRunning = Boolean(value);
    document.body.classList.toggle("formal-running", formalRunning);
    runModeButton.textContent = formalRunning ? "退出正式运行" : "进入正式运行";
    showPhotoMenuButton.classList.toggle("visible", formalRunning);
  }
  function currentPhoto() { return photos[photoCursor] || defaultPhotos[0]; }
  function renderPhoto() {
    const photo = currentPhoto();
    photoStage.dataset.photo = String(photoCursor % 4);
    photoStage.dataset.custom = photo.url ? "true" : "false";
    photoIndex.textContent = `${String(photoCursor + 1).padStart(2, "0")} / ${String(photos.length).padStart(2, "0")}`;
    photoTitle.textContent = photo.title;
    photoCaption.textContent = photo.caption;
    if (photo.url) { photoImage.src = photo.url; photoImage.alt = photo.title; } else { photoImage.removeAttribute("src"); photoImage.alt = ""; }
  }
  function openPhoto() { renderPhoto(); photoStage.classList.add("visible"); clearTimeout(photoHideTimer); }
  function closePhoto() { clearTimeout(photoHideTimer); photoStage.classList.remove("visible"); }
  function showNextPhoto() { photoCursor = (photoCursor + 1) % Math.max(1, photos.length); openPhoto(); }
  function renderThumbs() {
    photoThumbs.replaceChildren();
    if (!photos.some(photo => photo.url)) { const empty = document.createElement("span"); empty.className = "photo-empty"; empty.textContent = "尚未上传自定义图片，将使用默认星云图"; photoThumbs.appendChild(empty); return; }
    photos.forEach((photo, index) => { if (!photo.url) return; const thumb = document.createElement("div"); thumb.className = "photo-thumb"; const img = document.createElement("img"); img.src = photo.url; img.alt = photo.title; const number = document.createElement("span"); number.textContent = String(index + 1).padStart(2, "0"); thumb.append(img, number); photoThumbs.appendChild(thumb); });
  }
  function acceptUploads(fileList) {
    const files = Array.from(fileList || []).filter(file => file.type.startsWith("image/"));
    if (!files.length) return;
    photos = files.map((file, index) => ({ title: file.name.replace(/\.[^.]+$/, "").slice(0, 24).toUpperCase() || `UPLOADED ${index + 1}`, caption: "上传的宇宙影像 · 左手控制打开与关闭", url: URL.createObjectURL(file) }));
    photoCursor = 0; renderThumbs(); renderPhoto(); photoStage.classList.add("visible");
  }
  const labels = { move: "右手移动 · 带动星云", open: "右手张开 · 星系展开", fist: "右手握拳 · 星系聚合", pinch: "左手捏合 · 切换大图" };
  function applyRightHand(marks) {
    const m = metrics(marks), raw = classify(m), gesture = stabilize(raw), palm = marks[9];
    const nx = 1 - palm.x, ny = palm.y, point = { x: innerWidth * (.34 + nx * .58), y: innerHeight * (.08 + ny * .84) };
    control.setHand(point.x, point.y, 5);
    if (gesture === "open") { control.setExpanded(true); control.resetScale(); }
    else if (gesture === "fist") {
      control.setExpanded(false);
      const planetScale = Math.max(.68, Math.min(1.85, .58 + m.palm * 8.4));
      control.setScale(planetScale);
    } else control.resetScale();
    if (lastPalm) { const speed = Math.hypot(palm.x-lastPalm.x,palm.y-lastPalm.y); if (speed > .012) control.setCheck("particles","active","手掌推动"); } lastPalm = {x:palm.x,y:palm.y};
    const scaleText = gesture === "fist" ? `  ·  行星 ${(.58 + m.palm * 8.4).toFixed(2)}x` : "";
    gestureLabel.textContent = labels[gesture]; stats.textContent = `raw ${raw}  ·  伸展 ${m.extended}/4  ·  弯曲 ${m.curled}/4  ·  捏合 ${m.pinchRatio.toFixed(2)}${scaleText}`; status.textContent = `识别状态：${labels[gesture]}`;
    debug.gesture = gesture; control.setCheck("gesture","ok",gesture === "open" ? "右手张开" : gesture === "fist" ? "右手握拳" : "右手移动");
  }
  function applyLeftHand(marks) {
    const m = metrics(marks), raw = classify(m), gesture = stabilizeLeft(raw);
    if (gesture === "open" && lastLeftGesture !== "open") {
      openPhoto();
      gestureLabel.textContent = "左手张开 · 打开大图";
      stats.textContent = `左手张开  ·  ${photoIndex.textContent}`;
      status.textContent = "识别状态：左手张开打开照片";
      control.setCheck("gesture", "ok", "左手张开打开照片");
    } else if (gesture === "fist" && lastLeftGesture !== "fist") {
      closePhoto();
      gestureLabel.textContent = "左手握拳 · 关闭大图";
      stats.textContent = "左手握拳  ·  大图已关闭";
      status.textContent = "识别状态：左手握拳关闭照片";
      control.setCheck("gesture", "ok", "左手握拳关闭照片");
    }
    if (gesture === "pinch" && m.pinchRatio < .43 && m.curled < 3 && !leftPinchLatched) {
      showNextPhoto();
      leftPinchLatched = true;
      gestureLabel.textContent = labels.pinch;
      stats.textContent = `左手捏合  ·  切换到第 ${photoCursor + 1} 张`;
      status.textContent = "识别状态：左手捏合切换大图";
      control.setCheck("gesture", "ok", "左手捏合");
    } else if (m.pinchRatio > .55) {
      leftPinchLatched = false;
    }
    if (gesture !== "pinch") leftPinchLatched = false;
    lastLeftGesture = gesture;
  }
  function results(res) {
    frames++; fpsFrames++; debug.frames = frames;
    const now = Date.now(); if (!lastFpsAt) lastFpsAt = now; if (now-lastFpsAt > 700) { fpsLabel.textContent = `${Math.round(fpsFrames*1000/(now-lastFpsAt))} FPS`; lastFpsAt = now; fpsFrames = 0; }
    const { right, left } = splitHands(res);
    if (!right && !left) { ctx.clearRect(0,0,overlay.width,overlay.height); control.clearHand(); control.setCheck("skeleton","active","未检测到手"); control.setCheck("gesture","active","等待手势"); gestureLabel.textContent = "未检测到手"; stats.textContent = `已分析 ${frames} 帧 · 右手控制星系，左手开合照片`; status.textContent = "摄像头运行中，等待手部进入画面"; debug.skeleton = false; lastPalm = null; lastLeftGesture = "move"; leftCandidate = "move"; leftCandidateFrames = 0; return; }
    debug.hands++; debug.skeleton = true; control.setCheck("skeleton","ok",`${right ? "右手" : ""}${left ? " 左手" : ""}`);
    if (right) { drawSkeleton(right.marks); applyRightHand(right.marks); } else { control.clearHand(); lastPalm = null; }
    if (left) applyLeftHand(left.marks); else { lastLeftGesture = "move"; leftCandidate = "move"; leftCandidateFrames = 0; leftPinchLatched = false; }
  }
  async function start() {
    button.disabled = true; cameraLabel.textContent = "正在连接摄像头…"; gestureLabel.textContent = "加载识别模型"; stats.textContent = "首次加载需要联网"; status.textContent = "正在启动真实摄像头与手势模型";
    try {
      await loadEngine();
      hands = new window.Hands({ locateFile: file => `vendor/hands/${file}` });
      hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: .55, minTrackingConfidence: .55 }); hands.onResults(results);
      camera = new window.Camera(video,{ width:640,height:480,onFrame:async()=>{
        if (!running || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
        try { await hands.send({image:video}); }
        catch (frameError) { debug.lastError = frameError.message || String(frameError); }
      } });
      running = true; await camera.start(); panel.classList.add("live"); button.classList.add("active"); setFormalRunning(true); cameraLabel.textContent = "关闭摄像头手势识别"; gestureLabel.textContent = "等待手部进入"; stats.textContent = "MediaPipe Hands 已连接"; status.textContent = "真实摄像头已连接，正在逐帧识别"; debug.running = true; debug.camera = true; control.setCheck("camera","ok","实时画面");
    } catch (e) {
      running = false; camera?.stop?.(); video.srcObject?.getTracks?.().forEach(t=>t.stop()); video.srcObject = null;
      const raw = e.message || String(e);
      const reason = /in use|NotReadable/i.test(raw) ? "摄像头正被其他程序占用，请关闭占用后重试" : /denied|permission|NotAllowed/i.test(raw) ? "摄像头权限被拒绝，请在浏览器地址栏中允许" : /load|network|fetch/i.test(raw) ? "手势模型加载失败，请检查网络" : raw;
      debug.lastError = reason; gestureLabel.textContent = "启动失败"; stats.textContent = reason; status.textContent = `启动失败：${reason}`; cameraLabel.textContent = "重试摄像头手势识别"; panel.classList.add("live"); control.setCheck("camera","active","启动失败");
    }
    finally { button.disabled = false; }
  }
  async function stop() { running = false; camera?.stop?.(); await hands?.close?.(); video.srcObject?.getTracks?.().forEach(t=>t.stop()); video.srcObject=null; camera=null; hands=null; panel.classList.remove("live"); button.classList.remove("active"); setFormalRunning(false); cameraLabel.textContent="启动摄像头手势识别"; gestureLabel.textContent="等待启动"; stats.textContent="MediaPipe 未连接"; status.textContent="粒子宇宙已就绪，等待启动摄像头"; ctx.clearRect(0,0,overlay.width,overlay.height); debug.running=false;debug.camera=false;control.clearHand();control.resetScale();control.setCheck("camera","active","已关闭");control.setCheck("skeleton","active","等待");control.setCheck("gesture","active","等待"); }
  photoUpload.addEventListener("change", event => { acceptUploads(event.target.files); event.target.value = ""; });
  clearPhotosButton.addEventListener("click", () => { photos.forEach(photo => { if (photo.url) URL.revokeObjectURL(photo.url); }); photos = defaultPhotos.slice(); photoCursor = 0; renderThumbs(); renderPhoto(); closePhoto(); });
  runModeButton.addEventListener("click", () => setFormalRunning(!formalRunning));
  hidePhotoMenu.addEventListener("click", () => setFormalRunning(true));
  showPhotoMenuButton.addEventListener("click", () => setFormalRunning(false));
  renderThumbs(); renderPhoto();
  button.addEventListener("click",()=>running?stop():start());
})();
