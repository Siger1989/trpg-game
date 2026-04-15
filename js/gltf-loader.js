/**
 * GLTFLoader 包装器 - 将 Three.js r160 ESM 版 GLTFLoader 暴露到全局
 * 用法：等待 window.GLTFLoaderReady 后使用 THREE.GLTFLoader
 */
(async function() {
  // 动态导入 ESM 模块
  const module = await import('./GLTFLoader.jsm');
  // 挂载到 THREE 命名空间
  THREE.GLTFLoader = module.GLTFLoader;
  // 通知就绪
  window.GLTFLoaderReady = true;
  window.dispatchEvent(new Event('gltf-loader-ready'));
})();
