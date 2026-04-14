/**
 * 游戏主控制器 - 串联所有模块
 * 移动模式(WASD/方向键) 与 指令模式(文本输入) 分离
 * 行动点数(AP)系统 + AI叙事 + 问卷流程
 */

const GameState = (() => {
  let player = null;
  function getPlayer() { return player; }
  function createPlayer(data) {
    player = { name: data.name || '调查员', stats: data.stats, derived: data.derived, skills: data.skills, occupation: data.occupation, background: data.background || '', appearance: data.appearance || {}, weapon: '拳头', inventory: [] };
    saveGame(); return player;
  }
  function saveGame() { try { localStorage.setItem('trpg_save', JSON.stringify({ player, dmState: DMEngine.saveState() })); } catch(e) {} }
  function loadGame() { try { const r = localStorage.getItem('trpg_save'); if(!r) return null; const d = JSON.parse(r); player = d.player; if(d.dmState) DMEngine.loadState(d.dmState); return d; } catch(e) { return null; } }
  function hasSave() { return !!localStorage.getItem('trpg_save'); }
  function deleteSave() { localStorage.removeItem('trpg_save'); }
  return { getPlayer, createPlayer, saveGame, loadGame, hasSave, deleteSave };
})();

const UI = (() => {
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const t = document.getElementById(`screen-${id}`);
    if (t) t.classList.add('active');
  }
  function addNarration(text, type = 'dm') {
    const c = document.getElementById('narrative-text');
    if (!c) return;
    const p = document.createElement('p');
    p.className = type === 'dm' ? 'dm-narration' : type === 'player' ? 'player-action' : 'system-msg';
    p.textContent = text;
    c.appendChild(p);
    c.scrollTop = c.scrollHeight;
  }
  function updateHUD() {
    const player = GameState.getPlayer();
    if (!player) return;
    const d = player.derived;
    setBar('hp', d.hp, d.maxHp); setBar('san', d.san, d.maxSan); setBar('mp', d.mp, d.maxMp);
    const ap = DMEngine.getAP();
    const apEl = document.getElementById('ap-display');
    if (apEl) { apEl.textContent = `⚡AP:${ap.current}/${ap.max}`; apEl.className = 'ap-display' + (ap.current <= 1 ? ' ap-low' : ''); }
    const scene = DMEngine.getCurrentScene();
    if (scene) { const loc = document.getElementById('hud-location'); if (loc) loc.textContent = scene.name; }
    if (player.appearance && typeof PaperDoll !== 'undefined') {
      const mc = document.getElementById('hud-portrait');
      if (mc) PaperDoll.render(mc, player.appearance);
    }
  }
  function setBar(type, cur, max) {
    const f = document.getElementById(`${type}-fill`), t = document.getElementById(`${type}-text`);
    if (f) f.style.width = `${Math.max(0, (cur/max)*100)}%`;
    if (t) t.textContent = `${Math.max(0,cur)}/${max}`;
  }
  function updateCombat() { const o = document.getElementById('combat-overlay'); if(o) o.style.display='flex'; }
  function hideCombat() { const o = document.getElementById('combat-overlay'); if(o) o.style.display='none'; }
  function showCombatActions(actions) { const d = document.getElementById('combat-actions'); if(!d)return; d.innerHTML = actions.map(a=>`<button class="combat-action-btn" data-action-id="${a.id}">${a.label}</button>`).join(''); d.querySelectorAll('.combat-action-btn').forEach(b=>{b.addEventListener('click',()=>{const a=actions.find(x=>x.id===b.dataset.actionId);if(a)a.action();});}); }
  function showTargetSelection(targets, onSelected) { const d = document.getElementById('combat-actions'); if(!d)return; d.innerHTML='<h4>选择目标:</h4>'+targets.map(t=>`<button class="target-btn ${t.canAttack?'':'disabled'}" data-target-id="${t.id}">${t.name} | 距离:${t.distance}</button>`).join(''); d.querySelectorAll('.target-btn:not(.disabled)').forEach(b=>{b.addEventListener('click',()=>onSelected(b.dataset.targetId));}); }
  function addCombatLog(msg) { const l = document.getElementById('combat-log'); if(!l)return; const d=document.createElement('div'); d.className='combat-log-entry'; d.textContent=msg; l.appendChild(d); l.scrollTop=l.scrollHeight; }
  return { showScreen, addNarration, updateHUD, updateCombat, hideCombat, showCombatActions, showTargetSelection, addCombatLog };
})();

// ========== 块1：初始化与角色创建 ==========
document.addEventListener('DOMContentLoaded', () => {
  let sceneInitialized = false;
  let charCreateBound = false;
  let moveMode = false;
  let moveStepCount = 0;

  // 存档检查
  if (GameState.hasSave()) {
    document.getElementById('btn-continue').style.display = 'block';
  }

  // 菜单按钮
  document.getElementById('btn-new-game').addEventListener('click', () => { UI.showScreen('char-create'); initCharCreate(); });
  document.getElementById('btn-continue').addEventListener('click', () => { const d = GameState.loadGame(); startGame(!!d); });
  document.getElementById('btn-about').addEventListener('click', () => UI.showScreen('about'));
  document.getElementById('btn-about-back').addEventListener('click', () => UI.showScreen('menu'));

  // 角色创建
  const partLabels = {
    hair: ['短发','中发','长发','马尾','卷发','寸头','偏分','双马尾','波浪','丸子头','莫西干','大背头','波波头','编辫','刘海','飞机头','光头(留茬)','侧剃','复古卷','披肩'],
    face: ['圆脸','方脸','瓜子脸','长脸','心形脸','菱形脸','鹅蛋脸','国字脸'],
    expr: ['平静','严肃','微笑','惊讶','恐惧'],
    outfit: ['风衣','西装','工装','长裙','实验服','警服','教袍','皮夹克','运动装','休闲装']
  };
  let charStats = null, charDerived = null, selectedOcc = null;
  let charAppearance = { hair: 0, face: 0, expr: 0, outfit: 0, skinTone: 0 };

  function initCharCreate() {
    charStats = CoCRules.rollStats();
    charDerived = CoCRules.calcDerived(charStats);
    selectedOcc = null;
    charAppearance = { hair: 0, face: 0, expr: 0, outfit: 0, skinTone: 0 };
    renderAttrGrid(); renderOccupations(); renderPaperdoll();
    if (charCreateBound) return;
    charCreateBound = true;

    document.getElementById('btn-reroll').addEventListener('click', () => { charStats = CoCRules.rollStats(); charDerived = CoCRules.calcDerived(charStats); renderAttrGrid(); });
    document.querySelectorAll('.sel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const part = btn.dataset.part, dir = parseInt(btn.dataset.dir), maxLen = partLabels[part].length;
        charAppearance[part] = (charAppearance[part] + dir + maxLen) % maxLen;
        document.getElementById(`${part}-label`).textContent = partLabels[part][charAppearance[part]];
        renderPaperdoll();
      });
    });
    document.getElementById('btn-confirm-char').addEventListener('click', () => {
      const name = document.getElementById('char-name').value.trim() || '无名调查员';
      const background = document.getElementById('char-background').value.trim();
      const skills = {};
      Object.keys(CoCRules.SKILLS).forEach(sn => { skills[sn] = CoCRules.calcSkillBase(sn, charStats); });
      if (selectedOcc && CoCRules.OCCUPATIONS[selectedOcc]) {
        const occSkills = CoCRules.OCCUPATIONS[selectedOcc].skills;
        const perSkill = Math.floor(charStats.EDU * 4 / occSkills.length);
        occSkills.forEach(sn => { if (skills[sn] !== undefined) skills[sn] += perSkill; });
      }
      GameState.createPlayer({ name, stats: charStats, derived: charDerived, skills, occupation: selectedOcc, background, appearance: { ...charAppearance } });
      UI.showScreen('scenario-survey');
      initSurvey();
    });
    document.getElementById('btn-back-menu').addEventListener('click', () => UI.showScreen('menu'));
  }

  function renderAttrGrid() {
    const grid = document.getElementById('attr-grid'); if (!grid) return; grid.innerHTML = '';
    CoCRules.ATTRIBUTES.forEach(attr => {
      const div = document.createElement('div'); div.className = 'attr-item';
      div.innerHTML = `<span class="attr-name">${CoCRules.ATTR_NAMES[attr]}</span><span class="attr-value">${charStats[attr]}</span>`;
      grid.appendChild(div);
    });
    const luckDiv = document.createElement('div'); luckDiv.className = 'attr-item';
    luckDiv.innerHTML = `<span class="attr-name">幸运</span><span class="attr-value">${charStats.LUCK}</span>`;
    grid.appendChild(luckDiv);
    const dDiv = document.createElement('div'); dDiv.className = 'attr-derived';
    dDiv.innerHTML = `HP:${charDerived.hp} MP:${charDerived.mp} SAN:${charDerived.san} MOV:${charDerived.mov} DB:${charDerived.db} 体格:${charDerived.build}`;
    grid.appendChild(dDiv);
  }

  function renderOccupations() {
    const ol = document.getElementById('occupation-list'); if (!ol) return; ol.innerHTML = '';
    Object.entries(CoCRules.OCCUPATIONS).forEach(([name, occ]) => {
      const btn = document.createElement('button'); btn.className = 'occ-btn'; if (selectedOcc === name) btn.classList.add('selected');
      btn.textContent = name; btn.addEventListener('click', () => { ol.querySelectorAll('.occ-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); selectedOcc = name; });
      ol.appendChild(btn);
    });
  }

  function renderPaperdoll() { const c = document.getElementById('paperdoll-canvas'); if (c && typeof PaperDoll !== 'undefined') PaperDoll.render(c, charAppearance); }

  // ========== 块2：问卷流程 ==========
  let surveyStep = 0, surveyAnswers = { mood: '', role: '', expect: '' }, surveyBound = false;

  function initSurvey() {
    surveyStep = 0; surveyAnswers = { mood: '', role: '', expect: '' };
    showSurveyStep(0);
    // 选项点击委托
    if (!surveyBound) {
      surveyBound = true;
      document.addEventListener('click', (e) => {
        if (!e.target.classList.contains('survey-opt-btn')) return;
        const step = e.target.closest('.survey-step'); if (!step) return;
        const stepIdx = parseInt(step.dataset.step);
        const keys = ['mood','role','expect'];
        step.querySelectorAll('.survey-opt-btn').forEach(b => b.classList.remove('selected'));
        e.target.classList.add('selected');
        surveyAnswers[keys[stepIdx]] = e.target.dataset.value;
      });
      document.getElementById('survey-next')?.addEventListener('click', () => {
        const keys = ['mood','role','expect'];
        if (surveyStep < 3 && !surveyAnswers[keys[surveyStep]]) { return; }
        if (surveyStep < 2) { surveyStep++; showSurveyStep(surveyStep); }
        else { generateAndStartScenario(); }
      });
      document.getElementById('survey-prev')?.addEventListener('click', () => { if (surveyStep > 0) { surveyStep--; showSurveyStep(surveyStep); } });
      document.getElementById('survey-skip')?.addEventListener('click', () => { startGameWithScenario('old_house'); });
    }
  }

  function showSurveyStep(step) {
    document.querySelectorAll('.survey-step').forEach((el, i) => { el.classList.toggle('active', i === step); });
    document.querySelectorAll('.progress-step').forEach((el, i) => {
      el.classList.toggle('active', i === step); el.classList.toggle('done', i < step);
    });
    const nextBtn = document.getElementById('survey-next');
    if (nextBtn) nextBtn.textContent = step === 2 ? '🎭 生成剧本' : '下一步 →';
    const backBtn = document.getElementById('survey-prev');
    if (backBtn) backBtn.style.display = step > 0 ? 'inline-block' : 'none';
  }

  async function generateAndStartScenario() {
    const preview = document.getElementById('scenario-preview');
    if (preview) { preview.style.display = 'block'; preview.innerHTML = '<p>🔮 AI正在生成你的专属剧本...</p>'; }
    // 隐藏问卷步骤，显示结果
    document.querySelectorAll('.survey-step').forEach(el => el.classList.remove('active'));
    document.getElementById('survey-step-result')?.classList.add('active');

    try {
      const scenario = await DMEngine.generateScenarioFromSurvey(surveyAnswers);
      if (preview) {
        preview.innerHTML = `<h4>${scenario.title}</h4><p>${scenario.description || ''}</p><p style="color:var(--text-dim);font-size:0.85em">场景数: ${scenario.scenes.length} | 氛围: ${surveyAnswers.mood}</p>`;
      }
      // 绑定开始按钮
      const startBtn = document.getElementById('btn-survey-start');
      if (startBtn) {
        startBtn.onclick = () => { startGameWithCustomScenario(scenario); };
      }
    } catch(err) {
      console.warn('Scenario generation failed:', err);
      if (preview) preview.innerHTML = '<h4>旧宅疑云</h4><p>一封来自已故友人的信件，将你引向了城郊一座荒废的老宅...</p>';
      const startBtn = document.getElementById('btn-survey-start');
      if (startBtn) startBtn.onclick = () => { startGameWithScenario('old_house'); };
    }
    // 重新选择按钮
    document.getElementById('btn-survey-redo')?.addEventListener('click', () => {
      surveyStep = 0; surveyAnswers = { mood:'', role:'', expect:'' };
      document.getElementById('survey-step-result')?.classList.remove('active');
      showSurveyStep(0);
      document.querySelectorAll('.survey-opt-btn').forEach(b => b.classList.remove('selected'));
    });
  }

  // ========== 块3：游戏核心逻辑 ==========
  function startGameWithScenario(scenarioId) {
    UI.showScreen('game'); DMEngine.initWorld(scenarioId);
    requestAnimationFrame(() => { try { if (!sceneInitialized) { SceneManager.init(document.getElementById('scene-container')); sceneInitialized = true; } finishStartGame(); } catch(e) { console.error(e); finishStartGame(); } });
  }
  function startGameWithCustomScenario(scenario) {
    UI.showScreen('game'); DMEngine.initWorldWithScenario(scenario);
    requestAnimationFrame(() => { try { if (!sceneInitialized) { SceneManager.init(document.getElementById('scene-container')); sceneInitialized = true; } finishStartGame(); } catch(e) { console.error(e); finishStartGame(); } });
  }
  function startGame(isContinue) {
    UI.showScreen('game');
    if (!isContinue) DMEngine.initWorld('old_house');
    requestAnimationFrame(() => { try { if (!sceneInitialized) { const c=document.getElementById('scene-container'); if(!c.clientWidth){setTimeout(()=>startGame(isContinue),100);return;} SceneManager.init(c); sceneInitialized=true; } finishStartGame(); } catch(e) { console.error(e); finishStartGame(); } });
  }
  function finishStartGame() {
    try { loadCurrentScene(); } catch(e) {}
    UI.updateHUD(); UI.addNarration(DMEngine.getNarration(), 'dm'); showChoices(DMEngine.getChoices());
    DMEngine.resetAP(); UI.updateHUD();
    // 设置3D物件交互回调
    if (typeof SceneManager !== 'undefined' && SceneManager.setObjectInteractionHandler) {
      SceneManager.setObjectInteractionHandler((type, name, gx, gz) => {
        if (moveMode) return;

        // 距离检查：必须相邻才能交互
        if (!SceneManager.canInteract(gx, gz)) {
          const dist = SceneManager.getInteractDistance(gx, gz).toFixed(1);
          UI.addNarration(`你离${name}太远了（距离${dist}格），需要走近才能交互。`, 'system');
          return;
        }

        if (!DMEngine.consumeAP(1)) { UI.addNarration('行动点数不足！', 'system'); return; }

        // 高亮反馈
        SceneManager.highlightObject(gx, gz);

        // 灯光类物件：开关灯
        const isLight = SceneManager.getObjectAt(gx, gz)?.isLight;
        if (isLight) {
          const isOn = SceneManager.toggleObjectLight(gx, gz);
          if (isOn) {
            UI.addNarration(`你打开了${name}，光芒驱散了周围的黑暗。`, 'dm');
            // 开灯后更新迷雾
            updateFog();
          } else {
            UI.addNarration(`你关掉了${name}，黑暗重新笼罩。`, 'dm');
            updateFog();
          }
          UI.updateHUD(); GameState.saveGame();
          return;
        }

        // 门类物件：开关门
        if (type === 'door') {
          const isOpen = SceneManager.toggleDoor(gx, gz);
          if (isOpen) {
            UI.addNarration(`你推开了${name}，门轴发出刺耳的声响。`, 'dm');
          } else {
            UI.addNarration(`你关上了${name}。`, 'dm');
          }
          UI.updateHUD(); GameState.saveGame();
          return;
        }

        // 其他物件：调查检定
        UI.addNarration(`🔍 你调查了${name}...`, 'player');
        const skillMap = {
          bookshelf: '图书馆使用', desk: '图书馆使用', table: '侦查',
          chest: '锁匠', crate: '侦查', barrel: '侦查',
          altar: '神秘学', statue: '神秘学', mirror: '侦查',
          painting: '艺术', wardrobe: '侦查', bed: '侦查',
          skeleton: '医学', rug: '侦查', fireplace: '侦查'
        };
        const skill = skillMap[type] || '侦查';
        const player = GameState.getPlayer();
        const skillValue = player.skills[skill] || CoCRules.calcSkillBase(skill, player.stats);
        const check = CoCRules.rollCheck(skillValue);
        let narration = `[${skill}检定: ${check.roll}/${skillValue} → ${check.result}] `;
        if (check.isSuccess) {
          const discoveries = [
            `你在${name}上发现了值得注意的痕迹...`,
            `仔细检查${name}后，你找到了一些线索。`,
            `${name}中隐藏着不为人知的秘密...`,
            `你对${name}的检查有了收获！`
          ];
          narration += discoveries[Math.floor(Math.random() * discoveries.length)];
        } else {
          narration += `你仔细检查了${name}，但没有发现什么特别的东西。`;
        }
        UI.addNarration(narration, 'dm');
        UI.updateHUD(); GameState.saveGame();
      });
    }
  }
  function loadCurrentScene() {
    const scene = DMEngine.getCurrentScene(); if (!scene) return;
    SceneManager.buildRoom(scene.room, scene.width, scene.height, scene.objects, scene.atmosphere);
    if (typeof FogOfWar !== 'undefined' && FogOfWar.init) {
      try { FogOfWar.init(scene.width||6, scene.height||6); const pp=SceneManager.getPlayerPos(); const p=GameState.getPlayer(); FogOfWar.updateVision(pp.x,pp.z,p?.skills?.['侦查']||25,scene.atmosphere?.lightIntensity||1.0); } catch(e) {}
    }
    UI.updateHUD();
  }

  function showChoices(choices) {
    const actions = document.getElementById('quick-actions'); if (!actions) return; actions.innerHTML = '';
    const apDiv = document.createElement('div'); apDiv.className='ap-display'; apDiv.id='ap-display';
    const ap = DMEngine.getAP(); apDiv.textContent = `⚡AP:${ap.current}/${ap.max}`; actions.appendChild(apDiv);
    const moveBtn = document.createElement('button'); moveBtn.className='action-btn move-mode-btn'; moveBtn.textContent='🚶 移动';
    moveBtn.addEventListener('click', () => toggleMoveMode()); actions.appendChild(moveBtn);
    const endBtn = document.createElement('button'); endBtn.className='action-btn'; endBtn.textContent='⏭ 结束回合';
    endBtn.addEventListener('click', () => { DMEngine.resetAP(); UI.updateHUD(); UI.addNarration('回合结束，行动点数已恢复。','system'); showChoices(DMEngine.getChoices()); });
    actions.appendChild(endBtn);
    choices.forEach(c => { const btn = document.createElement('button'); btn.className='action-btn'; btn.textContent=c.text; btn.addEventListener('click',()=>handleChoice(c.action)); actions.appendChild(btn); });
  }

  function handleChoice(actionId) {
    if (moveMode) exitMoveMode();
    if (!DMEngine.consumeAP(1)) { UI.addNarration('行动点数不足！请结束回合。','system'); return; }
    const result = DMEngine.processChoice(actionId); if (!result) return;
    UI.addNarration(result.narration, 'dm');
    if (result.items?.length > 0) result.items.forEach(i => UI.addNarration(`📦 获得: ${i}`, 'system'));
    if (result.sanityLoss) UI.updateHUD();
    if (result.newScene) { setTimeout(() => { loadCurrentScene(); UI.addNarration(result.newScene.narration,'dm'); showChoices(DMEngine.getChoices()); DMEngine.resetAP(); UI.updateHUD(); }, 1000); }
    if (result.combat && result.enemies) setTimeout(() => CombatSystem.startCombat(result.enemies), 500);
    if (result.choices) showChoices(result.choices);
    updateFog(); GameState.saveGame(); UI.updateHUD();
  }

  function toggleMoveMode() { moveMode ? exitMoveMode() : enterMoveMode(); }
  function enterMoveMode() {
    moveMode = true; moveStepCount = 0;
    // 禁用相机控制器避免移动冲突
    if (typeof CameraControls !== 'undefined' && CameraControls.setEnabled) CameraControls.setEnabled(false);
    const moveBtn = document.querySelector('.move-mode-btn'); if(moveBtn){moveBtn.textContent='🚶 移动中...';moveBtn.style.borderColor='var(--accent)';moveBtn.style.background='rgba(201,160,78,0.2)';}
    const inputArea = document.querySelector('.narrative-input'); if(inputArea) inputArea.style.display='none';
    let moveHint = document.getElementById('move-hint');
    if(!moveHint){moveHint=document.createElement('div');moveHint.id='move-hint';moveHint.className='move-hint-bar';document.getElementById('narrative-panel')?.insertBefore(moveHint,document.getElementById('narrative-panel').firstChild);}
    moveHint.style.display='flex';
    moveHint.innerHTML='<span>🚶 移动模式 — WASD移动 | 步数: <b id="move-step-count">0</b></span><button class="btn-stop-move" id="btn-stop-move">✓ 停止移动</button>';
    document.getElementById('btn-stop-move').addEventListener('click',()=>exitMoveMode());
    UI.addNarration('进入移动模式。WASD移动，Esc或停止按钮退出。','system');
  }
  function exitMoveMode() {
    moveMode = false;
    // 恢复相机控制器
    if (typeof CameraControls !== 'undefined' && CameraControls.setEnabled) CameraControls.setEnabled(true);
    const moveBtn = document.querySelector('.move-mode-btn'); if(moveBtn){moveBtn.textContent='🚶 移动';moveBtn.style.borderColor='';moveBtn.style.background='';}
    const inputArea = document.querySelector('.narrative-input'); if(inputArea) inputArea.style.display='flex';
    const moveHint = document.getElementById('move-hint'); if(moveHint) moveHint.style.display='none';
    if(moveStepCount>0) UI.addNarration(`你移动了${moveStepCount}步，停下来观察周围。`,'system');
    moveStepCount=0; updateFog(); GameState.saveGame();
  }
  function updateFog() {
    if(typeof FogOfWar==='undefined'||!FogOfWar.isInitialized?.()) return;
    try{
      const pp=SceneManager.getPlayerPos();
      const p=GameState.getPlayer();
      const s=DMEngine.getCurrentScene();
      // 计算有效光照：场景基础光 + 附近已开灯的物件灯光
      let effectiveLight = s?.atmosphere?.lightIntensity || 0.3;
      const sceneObjects = SceneManager.sceneObjects || [];
      const nearbyLights = sceneObjects.filter(o => o.isLight && o.isOn);
      for (const light of nearbyLights) {
        const dx = (light.gridX || 0) - pp.x;
        const dz = (light.gridZ || 0) - pp.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist < 8) {
          // 灯光强度随距离衰减，最近处贡献最大
          const lightPower = light.type === 'fireplace' ? 3.5 : light.type === 'lamp' ? 2.5 : light.type === 'candle' ? 1.5 : 2.0;
          effectiveLight += lightPower * Math.max(0, 1 - dist / 8);
        }
      }
      FogOfWar.updateVision(pp.x, pp.z, p?.skills?.['侦查']||25, effectiveLight);
    }catch(e){}
  }

  // 本地可执行指令处理 — 通过RoomInteraction统一执行器
  // 返回ActionResult对象（含success/verb/message/uiHint）或null
  function tryLocalAction(text) {
    if (typeof RoomInteraction === 'undefined') return null;

    const pp = SceneManager.getPlayerPos();
    const sceneObjects = SceneManager.sceneObjects || [];
    const scene = DMEngine.getCurrentScene();

    // 构建RoomState（每次调用都刷新，保证状态同步）
    const room = RoomInteraction.buildRoomState(sceneObjects, pp, scene);

    // 走统一执行器
    const result = RoomInteraction.executePlayerInput(text, room);

    if (!result) return null;

    // 处理UI提示
    if (result.uiHint?.highlightTargetId) {
      // 找到目标对象并高亮
      const targetObj = sceneObjects.find(o => (o.id || `${o.type}_${o.gridX}_${o.gridZ}`) === result.uiHint.highlightTargetId);
      if (targetObj && SceneManager.highlightObject) {
        SceneManager.highlightObject(targetObj.gridX, targetObj.gridZ, 1200);
      }
    }

    // 成功的灯光操作→更新迷雾
    if (result.success && (result.verb === 'turn_on' || result.verb === 'ignite' || result.verb === 'turn_off' || result.verb === 'extinguish')) {
      updateFog();
    }

    return result;
  }

  // 文本指令输入（AI优先）
  document.getElementById('btn-send').addEventListener('click', sendPlayerInput);
  document.getElementById('player-input').addEventListener('keydown', (e) => { if(e.key==='Enter') sendPlayerInput(); });

  async function sendPlayerInput() {
    if(moveMode){UI.addNarration('移动模式中，请先停止移动再输入指令。','system');return;}
    const input = document.getElementById('player-input'); const text = input.value.trim(); if(!text) return;
    UI.addNarration(`> ${text}`, 'player'); input.value = '';

    // 优先处理本地可执行指令（灯光/门/距离敏感操作）
    const localResult = tryLocalAction(text);
    if (localResult) {
      // 根据结果类型决定是否扣AP：describe/flavor/move不扣AP，交互操作扣1AP
      const isFreeAction = !localResult.verb || localResult.verb === 'approach'
        || localResult.code === 'TARGET_NOT_FOUND' || localResult.code === 'TARGET_NOT_VISIBLE'
        || localResult.code === 'OUT_OF_RANGE' || localResult.code === 'AMBIGUOUS_TARGET';
      if (!isFreeAction && localResult.success) {
        if (!DMEngine.consumeAP(1)) { UI.addNarration('行动点数不足！请结束回合。', 'system'); return; }
      }
      UI.addNarration(localResult.message || '', 'dm');
      UI.updateHUD(); GameState.saveGame(); return;
    }

    // 非本地指令→扣AP后走AI/DM引擎
    if(!DMEngine.consumeAP(1)){UI.addNarration('行动点数不足！请结束回合。','system');return;}

    if(typeof AIDM!=='undefined' && AIDM.isConfigured()){
      UI.addNarration('🔮...','system');
      try{
        const ctx = { history: DMEngine.getHistory().slice(-10), scene: DMEngine.getCurrentScene(), player: GameState.getPlayer() };
        const aiResult = await AIDM.generateNarration(text, ctx);
        const nt = document.getElementById('narrative-text'); const last = nt?.lastElementChild; if(last?.textContent.includes('🔮')) last.remove();
        if(aiResult){ UI.addNarration(aiResult.narration,'dm'); if(aiResult.choices?.length>0) showChoices(aiResult.choices); UI.updateHUD(); GameState.saveGame(); return; }
      }catch(err){console.warn('AI failed:',err);const nt=document.getElementById('narrative-text');const last=nt?.lastElementChild;if(last?.textContent.includes('🔮'))last.remove();}
    }

    const result = await DMEngine.processFreeInput(text);
    UI.addNarration(result.narration,'dm');
    if(result.choices) showChoices(result.choices);
    if(result.combat&&result.enemies) setTimeout(()=>CombatSystem.startCombat(result.enemies),500);
    GameState.saveGame(); UI.updateHUD();
  }

  // ========== 块4：键盘/摇杆/骰子/AI设置 ==========
  // 骰子面板
  document.getElementById('btn-dice').addEventListener('click', () => { document.getElementById('dice-panel').style.display='flex'; });
  document.getElementById('dice-close').addEventListener('click', () => { document.getElementById('dice-panel').style.display='none'; });
  document.querySelectorAll('.dice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sides = parseInt(btn.dataset.sides); const result = CoCRules.rollDie(sides);
      const numEl = document.getElementById('dice-number'); numEl.textContent = result;
      document.getElementById('dice-detail').textContent = `1D${sides}`;
      numEl.classList.remove('dice-roll-anim'); void numEl.offsetWidth; numEl.classList.add('dice-roll-anim');
    });
  });

  // 键盘处理
  document.addEventListener('keydown', (e) => {
    const gameScreen = document.getElementById('screen-game');
    if (!gameScreen?.classList.contains('active')) return;
    if (CombatSystem.isInCombat()) return;
    if (e.key === 'Escape' && moveMode) { exitMoveMode(); return; }
    if ((e.key === 'm' || e.key === 'M') && document.activeElement?.id !== 'player-input') { toggleMoveMode(); return; }
    if (moveMode) {
      let moved = false;
      switch(e.key) {
        case 'w': case 'ArrowUp':    moved = SceneManager.movePlayer(0,-1); break;
        case 's': case 'ArrowDown':  moved = SceneManager.movePlayer(0,1); break;
        case 'a': case 'ArrowLeft':  moved = SceneManager.movePlayer(-1,0); break;
        case 'd': case 'ArrowRight': moved = SceneManager.movePlayer(1,0); break;
        case 'Enter': exitMoveMode(); return;
      }
      if (moved) {
        e.preventDefault(); moveStepCount++;
        // 移动消耗AP
        if (!DMEngine.consumeAP(1)) { UI.addNarration('行动点数不足！','system'); exitMoveMode(); return; }
        const countEl = document.getElementById('move-step-count'); if(countEl) countEl.textContent = moveStepCount;
        updateFog(); UI.updateHUD();
      }
    }
  });

  // 移动端摇杆
  const joystickZone = document.getElementById('joystick-move');
  if (joystickZone) {
    let joystickActive = false, startX, startY;
    joystickZone.addEventListener('touchstart', (e) => { e.preventDefault(); joystickActive=true; startX=e.touches[0].clientX; startY=e.touches[0].clientY; });
    joystickZone.addEventListener('touchend', (e) => {
      e.preventDefault(); if(!joystickActive) return; joystickActive=false;
      const touch=e.changedTouches[0]; const dx=touch.clientX-startX; const dy=touch.clientY-startY; const threshold=20;
      if(Math.abs(dx)>Math.abs(dy)){if(dx>threshold)SceneManager.movePlayer(1,0);else if(dx<-threshold)SceneManager.movePlayer(-1,0);}
      else{if(dy>threshold)SceneManager.movePlayer(0,1);else if(dy<-threshold)SceneManager.movePlayer(0,-1);}
      updateFog(); UI.updateHUD();
    });
  }

  // AI设置面板（动态创建）
  const aiBtn = document.createElement('button'); aiBtn.className='action-btn'; aiBtn.textContent='🤖 AI设置'; aiBtn.style.position='fixed'; aiBtn.style.top='10px'; aiBtn.style.right='10px'; aiBtn.style.zIndex='999';
  aiBtn.addEventListener('click', showAISettings);
  document.body.appendChild(aiBtn);

  function showAISettings() {
    let modal = document.getElementById('ai-settings-modal');
    if (!modal) {
      modal = document.createElement('div'); modal.id='ai-settings-modal';
      modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;';
      modal.innerHTML=`<div style="background:#14141f;border:1px solid var(--accent);border-radius:8px;padding:24px;max-width:450px;width:90%;">
        <h3 style="color:var(--accent);margin-bottom:16px;">🤖 AI DM 设置</h3>
        <div style="margin-bottom:12px;"><label style="color:var(--text-secondary);display:block;margin-bottom:4px;">API地址</label><input id="ai-url" style="width:100%;padding:8px;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:4px;color:#e0e0e0;" placeholder="https://api.openai.com/v1/chat/completions"></div>
        <div style="margin-bottom:12px;"><label style="color:var(--text-secondary);display:block;margin-bottom:4px;">API Key</label><input id="ai-key" type="password" style="width:100%;padding:8px;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:4px;color:#e0e0e0;" placeholder="sk-..."></div>
        <div style="margin-bottom:12px;"><label style="color:var(--text-secondary);display:block;margin-bottom:4px;">模型名称</label><input id="ai-model-name" style="width:100%;padding:8px;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:4px;color:#e0e0e0;" placeholder="gpt-3.5-turbo"></div>
        <div style="margin-bottom:16px;"><label style="color:var(--text-secondary);display:block;margin-bottom:4px;">温度</label><input id="ai-temp" type="range" min="0.1" max="1.5" step="0.1" value="0.8" style="width:100%;"><span id="ai-temp-val" style="color:var(--text-secondary);">0.8</span></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="ai-save-btn" style="padding:8px 16px;background:var(--accent);color:#1a1a1a;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">💾 保存</button>
          <button id="ai-close-btn" style="padding:8px 16px;background:#1a1a2e;color:#8888aa;border:1px solid #2a2a3e;border-radius:4px;cursor:pointer;">关闭</button>
        </div>
        <div id="ai-status" style="margin-top:12px;color:var(--text-dim);font-size:0.85em;"></div>
      </div>`;
      document.body.appendChild(modal);
      document.getElementById('ai-temp').addEventListener('input',(e)=>{document.getElementById('ai-temp-val').textContent=e.target.value;});
      document.getElementById('ai-save-btn').addEventListener('click',()=>{
        AIDM.saveConfig({provider:'openai',apiUrl:document.getElementById('ai-url').value,apiKey:document.getElementById('ai-key').value,model:document.getElementById('ai-model-name').value,temperature:parseFloat(document.getElementById('ai-temp').value)});
        document.getElementById('ai-status').textContent='✅ 已保存'; setTimeout(()=>{modal.style.display='none';},1000);
      });
      document.getElementById('ai-close-btn').addEventListener('click',()=>{modal.style.display='none';});
    }
    // 填充当前配置
    const cfg = AIDM.getConfig();
    document.getElementById('ai-url').value=cfg.apiUrl||'';
    document.getElementById('ai-key').value=cfg.apiKey||'';
    document.getElementById('ai-model-name').value=cfg.model||'';
    document.getElementById('ai-temp').value=cfg.temperature||0.8;
    document.getElementById('ai-temp-val').textContent=cfg.temperature||0.8;
    document.getElementById('ai-status').textContent=AIDM.isConfigured()?'✅ AI已配置':'⚠️ AI未配置';
    modal.style.display='flex';
  }

  // ========== 叙事面板拖拽调整高度 ==========
  const resizeHandle = document.getElementById('narrative-resize-handle');
  const narrativePanel = document.getElementById('narrative-panel');
  if (resizeHandle && narrativePanel) {
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startY = e.clientY;
      startHeight = narrativePanel.offsetHeight;
      e.preventDefault();
    });
    resizeHandle.addEventListener('touchstart', (e) => {
      isResizing = true;
      startY = e.touches[0].clientY;
      startHeight = narrativePanel.offsetHeight;
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const delta = startY - e.clientY;
      const newHeight = Math.max(120, Math.min(window.innerHeight * 0.7, startHeight + delta));
      narrativePanel.style.maxHeight = newHeight + 'px';
      narrativePanel.style.height = newHeight + 'px';
    });
    document.addEventListener('touchmove', (e) => {
      if (!isResizing) return;
      const delta = startY - e.touches[0].clientY;
      const newHeight = Math.max(120, Math.min(window.innerHeight * 0.7, startHeight + delta));
      narrativePanel.style.maxHeight = newHeight + 'px';
      narrativePanel.style.height = newHeight + 'px';
    }, { passive: false });

    document.addEventListener('mouseup', () => { isResizing = false; });
    document.addEventListener('touchend', () => { isResizing = false; });
  }
}); // end DOMContentLoaded
