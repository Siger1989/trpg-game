/**
 * 轻量级相机控制器 - 支持缩放/旋转/平移
 * 无外部依赖，兼容Three.js r160
 */
const CameraControls = (() => {
  let camera, domElement;
  let enabled = true;

  // 目标点（围绕旋转的中心）
  let target = new THREE.Vector3(0, 0, 0);

  // 球坐标参数
  let spherical = { radius: 14, theta: Math.PI / 4, phi: Math.PI / 4 };
  // theta: 水平角（绕Y轴）, phi: 垂直角（从Y轴向下）— 45°等距视角

  // 限制
  let minDistance = 5, maxDistance = 30;
  let minPhi = 0.2, maxPhi = Math.PI / 2 - 0.05; // 不低于地面

  // 拖拽状态
  let isDragging = false;
  let isPanning = false;
  let lastMouse = { x: 0, y: 0 };

  // 惯性
  let velocity = { theta: 0, phi: 0, zoom: 0 };
  let damping = 0.85;

  // 触摸
  let lastTouchDist = 0;
  let lastTouchCenter = { x: 0, y: 0 };

  function init(cam, dom) {
    camera = cam;
    domElement = dom;
    updateFromSpherical();

    // 鼠标事件
    dom.addEventListener('mousedown', onMouseDown, { passive: false });
    dom.addEventListener('mousemove', onMouseMove, { passive: false });
    dom.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', e => e.preventDefault());

    // 触摸事件
    dom.addEventListener('touchstart', onTouchStart, { passive: false });
    dom.addEventListener('touchmove', onTouchMove, { passive: false });
    dom.addEventListener('touchend', onTouchEnd);

    return { update, setTarget, setSpherical, getTarget, enabled: () => enabled };
  }

  function onMouseDown(e) {
    if (!enabled) return;
    if (e.button === 0) { isDragging = true; }       // 左键旋转
    else if (e.button === 2) { isPanning = true; }    // 右键平移
    lastMouse = { x: e.clientX, y: e.clientY };
    velocity = { theta: 0, phi: 0, zoom: 0 };
  }

  function onMouseMove(e) {
    if (!enabled) return;
    const dx = e.clientX - lastMouse.x;
    const dy = e.clientY - lastMouse.y;
    lastMouse = { x: e.clientX, y: e.clientY };

    if (isDragging) {
      velocity.theta = -dx * 0.005;
      velocity.phi = dy * 0.005;
      spherical.theta += velocity.theta;
      spherical.phi = Math.max(minPhi, Math.min(maxPhi, spherical.phi + velocity.phi));
    }

    if (isPanning) {
      // 平移目标点
      const panSpeed = spherical.radius * 0.002;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), up).normalize();
      target.add(right.multiplyScalar(-dx * panSpeed));
      target.add(up.multiplyScalar(dy * panSpeed));
    }
  }

  function onMouseUp() {
    isDragging = false;
    isPanning = false;
  }

  function onWheel(e) {
    if (!enabled) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    spherical.radius = Math.max(minDistance, Math.min(maxDistance, spherical.radius * delta));
  }

  function onTouchStart(e) {
    if (!enabled) return;
    if (e.touches.length === 1) {
      isDragging = true;
      lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      isDragging = false;
      lastTouchDist = getTouchDist(e.touches);
      lastTouchCenter = getTouchCenter(e.touches);
    }
  }

  function onTouchMove(e) {
    if (!enabled) return;
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - lastMouse.x;
      const dy = e.touches[0].clientY - lastMouse.y;
      lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      spherical.theta -= dx * 0.005;
      // 反转dy方向：向上滑动时场景向上转（相机向下看，phi增大）
      spherical.phi = Math.max(minPhi, Math.min(maxPhi, spherical.phi - dy * 0.005));
    } else if (e.touches.length === 2) {
      const dist = getTouchDist(e.touches);
      const center = getTouchCenter(e.touches);
      // 缩放
      const scale = lastTouchDist / dist;
      spherical.radius = Math.max(minDistance, Math.min(maxDistance, spherical.radius * scale));
      // 平移
      const dx = center.x - lastTouchCenter.x;
      const dy = center.y - lastTouchCenter.y;
      const panSpeed = spherical.radius * 0.002;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), up).normalize();
      target.add(right.multiplyScalar(-dx * panSpeed));
      target.add(up.multiplyScalar(dy * panSpeed));
      lastTouchDist = dist;
      lastTouchCenter = center;
    }
  }

  function onTouchEnd(e) {
    if (e.touches.length === 0) { isDragging = false; }
  }

  function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getTouchCenter(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }

  function updateFromSpherical() {
    if (!camera) return;
    const r = spherical.radius;
    const sinPhi = Math.sin(spherical.phi);
    camera.position.set(
      target.x + r * sinPhi * Math.sin(spherical.theta),
      target.y + r * Math.cos(spherical.phi),
      target.z + r * sinPhi * Math.cos(spherical.theta)
    );
    camera.lookAt(target);
  }

  function update() {
    if (!enabled || !camera) return;
    // 惯性衰减
    if (Math.abs(velocity.theta) > 0.0001 || Math.abs(velocity.phi) > 0.0001) {
      spherical.theta += velocity.theta;
      spherical.phi = Math.max(minPhi, Math.min(maxPhi, spherical.phi + velocity.phi));
      velocity.theta *= damping;
      velocity.phi *= damping;
    }
    updateFromSpherical();
  }

  function setTarget(x, y, z) {
    target.set(x, y, z);
    updateFromSpherical();
  }

  function setSpherical(r, theta, phi) {
    spherical.radius = r;
    spherical.theta = theta;
    spherical.phi = phi;
    updateFromSpherical();
  }

  function getTarget() { return target.clone(); }

  function setEnabled(v) { enabled = v; }

  return { init, update, setTarget, setSpherical, getTarget, setEnabled, enabled };
})();
