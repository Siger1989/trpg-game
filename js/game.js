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
    // 注册到统一GameState
    if (typeof DMEngine !== 'undefined' && DMEngine.registerPlayer) {
      DMEngine.registerPlayer(player);
    }
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
    // 游戏/战斗screen禁止body滚动，其他screen（问卷/角色创建/关于）允许滚动
    document.body.style.overflow = (id === 'game') ? 'hidden' : 'auto';
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
    if (player.portrait) {
      const img = document.getElementById('hud-portrait');
      if (img) img.src = 'assets/portraits/' + player.portrait;
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
  let selectedGrid = null; // 当前选中的格子（用于点击移动）

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
  // 头像列表（独立于职业）
  const PORTRAIT_LIST = [
    { file: '01_Detective.png', name: '私家侦探' },
    { file: '02_Doctor.png', name: '医生' },
    { file: '03_Professor.png', name: '教授' },
    { file: '04_Priest.png', name: '牧师' },
    { file: '05_Journalist.png', name: '记者' },
    { file: '06_Lawyer.png', name: '律师' },
    { file: '07_Engineer.png', name: '工程师' },
    { file: '08_Pilot.png', name: '飞行员' },
    { file: '09_Nurse.png', name: '护士' },
    { file: '10_Photographer.png', name: '摄影师' },
    { file: '11_Musician.png', name: '音乐家' },
    { file: '12_Actor.png', name: '演员' },
    { file: '13_Scientist.png', name: '科学家' },
    { file: '14_Soldier.png', name: '军人' },
    { file: '15_Sailor.png', name: '海员' },
    { file: '16_Explorer.png', name: '探险家' },
    { file: '17_Librarian.png', name: '图书馆员' },
    { file: '18_Writer.png', name: '作家' },
    { file: '19_Archaeologist.png', name: '考古学家' },
    { file: '20_Artist.png', name: '艺术家' }
  ];
  let charStats = null, charDerived = null, selectedOcc = null;
  let selectedPortraitIndex = 0;

  function initCharCreate() {
    charStats = CoCRules.rollStats();
    charDerived = CoCRules.calcDerived(charStats);
    selectedOcc = null;
    selectedPortraitIndex = 0;
    renderAttrGrid(); renderOccupations(); renderPortrait();
    if (charCreateBound) return;
    charCreateBound = true;

    document.getElementById('btn-reroll').addEventListener('click', () => { charStats = CoCRules.rollStats(); charDerived = CoCRules.calcDerived(charStats); renderAttrGrid(); });
    
    // 头像切换按钮
    document.getElementById('btn-portrait-prev').addEventListener('click', () => {
      selectedPortraitIndex = (selectedPortraitIndex - 1 + PORTRAIT_LIST.length) % PORTRAIT_LIST.length;
      renderPortrait();
    });
    document.getElementById('btn-portrait-next').addEventListener('click', () => {
      selectedPortraitIndex = (selectedPortraitIndex + 1) % PORTRAIT_LIST.length;
      renderPortrait();
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
      const portraitFile = PORTRAIT_LIST[selectedPortraitIndex].file;
      GameState.createPlayer({ name, stats: charStats, derived: charDerived, skills, occupation: selectedOcc, background, portrait: portraitFile });
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
      btn.textContent = name; 
      btn.addEventListener('click', () => { 
        ol.querySelectorAll('.occ-btn').forEach(b => b.classList.remove('selected')); 
        btn.classList.add('selected'); 
        selectedOcc = name; 
      });
      ol.appendChild(btn);
    });
  }

  function renderPortrait() { 
    const img = document.getElementById('char-portrait'); 
    const nameEl = document.getElementById('portrait-name');
    if (img) img.src = 'assets/portraits/' + PORTRAIT_LIST[selectedPortraitIndex].file;
    if (nameEl) nameEl.textContent = (selectedPortraitIndex + 1) + ' / ' + PORTRAIT_LIST.length;
  }

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
    if (!isContinue) {
      // 调用 generateScenarioFromSurvey 生成剧本
      DMEngine.generateScenarioFromSurvey(null).then(scenario => {
        DMEngine.initWorldWithScenario(scenario);
        startGameInternal();
      }).catch(err => {
        console.error('生成剧本失败，使用默认剧本:', err);
        DMEngine.initWorld('old_house');
        startGameInternal();
      });
    } else {
      startGameInternal();
    }
    
    function startGameInternal() {
      requestAnimationFrame(() => {
        try {
          if (!sceneInitialized) {
            const c = document.getElementById('scene-container');
            if (!c || !c.clientWidth || !c.clientHeight) {
              setTimeout(() => startGame(isContinue), 100);
              return;
            }
            SceneManager.init(c);
            sceneInitialized = true;
          }
          finishStartGame();
        } catch(e) { console.error(e); finishStartGame(); }
      });
    }
  }
// Phase 2: 构建交互ActionOutcome
  function buildInteractionOutcome(type, name, gx, gz) {
    const isLight = SceneManager.getObjectAt(gx, gz)?.isLight;

    // 灯光类物件
    if (isLight) {
      const isOn = SceneManager.getObjectAt(gx, gz)?.isOn;
      if (isOn) {
        // 当前亮→关灯
        return ActionResolver.makeOutcome({
          success: true, consumesAp: 1,
          logs: [`你关掉了${name}，黑暗重新笼罩。`],
          stateChanges: [
            { type: 'object', gx, gz, field: 'isOn', value: false }
          ],
          narrationHint: `你关掉了${name}，黑暗重新笼罩。`,
          requiresRender: true,
          resultType: ActionResolver.RESULT_TYPES.SUCCESS
        });
      } else {
        // 当前灭→开灯
        return ActionResolver.makeOutcome({
          success: true, consumesAp: 1,
          logs: [`你打开了${name}，光芒驱散了周围的黑暗。`],
          stateChanges: [
            { type: 'object', gx, gz, field: 'isOn', value: true }
          ],
          narrationHint: `你打开了${name}，光芒驱散了周围的黑暗。`,
          requiresRender: true,
          resultType: ActionResolver.RESULT_TYPES.SUCCESS
        });
      }
    }

    // 门类物件
    if (type === 'door') {
      const isOpen = SceneManager.getObjectAt(gx, gz)?.isOn; // door的isOn=isOpen
      if (isOpen) {
        return ActionResolver.makeOutcome({
          success: true, consumesAp: 1,
          logs: [`你关上了${name}。`],
          stateChanges: [
            { type: 'object', gx, gz, field: 'isOn', value: false },
            { type: 'object', gx, gz, field: 'isOpen', value: false }
          ],
          narrationHint: `你关上了${name}。`,
          requiresRender: true,
          resultType: ActionResolver.RESULT_TYPES.SUCCESS
        });
      } else {
        return ActionResolver.makeOutcome({
          success: true, consumesAp: 1,
          logs: [`你推开了${name}，门轴发出刺耳的声响。`],
          stateChanges: [
            { type: 'object', gx, gz, field: 'isOn', value: true },
            { type: 'object', gx, gz, field: 'isOpen', value: true }
          ],
          narrationHint: `你推开了${name}，门轴发出刺耳的声响。`,
          requiresRender: true,
          resultType: ActionResolver.RESULT_TYPES.SUCCESS
        });
      }
    }

    // 其他物件：调查检定
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

    return ActionResolver.makeOutcome({
      success: true, consumesAp: 1,
      logs: [narration],
      stateChanges: [
        { type: 'object', gx, gz, field: 'searchCount', delta: 1 },
        { type: 'object_state_advance', gx, gz }
      ],
      narrationHint: narration,
      requiresRender: false,
      resultType: ActionResolver.RESULT_TYPES.SUCCESS
    });
  }

  function finishStartGame() {
    try { loadCurrentScene(); } catch(e) {}
    UI.updateHUD(); UI.addNarration(DMEngine.getNarration(), 'dm'); showChoices(DMEngine.getChoices());
    DMEngine.resetAP(); UI.updateHUD();
    // 加载GLB模型替换主角
    if (typeof SceneManager !== 'undefined' && SceneManager.loadPlayerModel) {
      SceneManager.loadPlayerModel('assets/monster.glb');
    }
    // 设置3D物件交互回调
    if (typeof SceneManager !== 'undefined' && SceneManager.setObjectInteractionHandler) {
      SceneManager.setObjectInteractionHandler((type, name, gx, gz) => {
        // Phase 5: 三校验（同房间、可见、在交互距离内）
        const validation = DMEngine.validateInteraction(gx, gz);
        if (!validation.valid) {
          UI.addNarration(validation.feedback, 'system');
          return;
        }

        if (!DMEngine.consumeAP(1)) { UI.addNarration('行动点数不足！', 'system'); return; }

        // 高亮反馈
        SceneManager.highlightObject(gx, gz);
        
        // 朝向物品
        if (SceneManager.setPlayerFacing) {
          SceneManager.setPlayerFacing(gx, gz);
        }

        // Phase 2: 通过ActionOutcome统一处理
        const outcome = buildInteractionOutcome(type, name, gx, gz);
        if (outcome) {
          // 应用状态变更
          const result = DMEngine.applyOutcome(outcome);
          // 显示叙事
          UI.addNarration(outcome.narrationHint || outcome.logs.join('\n'), 'dm');
          // 需要渲染更新
          if (result.renderNeeded || outcome.requiresRender) {
            updateFog();
          }
          UI.updateHUD(); GameState.saveGame();
        }
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
    // 背包按钮（Phase 4）
    const invBtn = document.createElement('button'); invBtn.className='action-btn'; invBtn.textContent='🎒 背包';
    invBtn.addEventListener('click', showInventory);
    actions.appendChild(invBtn);
    const endBtn = document.createElement('button'); endBtn.className='action-btn'; endBtn.textContent='⏭ 结束回合';
    endBtn.addEventListener('click', () => {
      // Phase 5: 通过endTurn唯一入口
      const result = DMEngine.endTurn('manual');
      UI.updateHUD();
      UI.addNarration(`回合${result.turnCount}结束，行动点数已恢复。`, 'system');
      showChoices(DMEngine.getChoices());
    });
    actions.appendChild(endBtn);
    choices.forEach(c => { const btn = document.createElement('button'); btn.className='action-btn'; btn.textContent=c.text; btn.addEventListener('click',()=>handleChoice(c.action)); actions.appendChild(btn); });
  }

  // Phase 4: 背包面板
  function showInventory() {
    const panel = document.getElementById('inventory-panel');
    const list = document.getElementById('inventory-list');
    if (!panel || !list) return;

    const inventory = DMEngine.getInventory();
    if (inventory.length === 0) {
      list.innerHTML = '<p style="color:var(--text-dim);">背包是空的。</p>';
    } else {
      list.innerHTML = inventory.map((item, i) =>
        `<div style="padding:8px; border-bottom:1px solid #2a2a3e; display:flex; justify-content:space-between; align-items:center;">
          <span style="color:var(--text-primary);">📦 ${item}</span>
          <button class="inv-use-btn" data-idx="${i}" style="background:var(--accent); color:#1a1a1a; border:none; border-radius:4px; padding:2px 8px; cursor:pointer; font-size:0.8em;">使用</button>
        </div>`
      ).join('');
      // 绑定使用按钮
      list.querySelectorAll('.inv-use-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx);
          const item = inventory[idx];
          UI.addNarration(`你使用了${item}...`, 'player');
          // TODO: 物品使用逻辑（Phase 4后续）
          showInventory(); // 刷新
        });
      });
    }

    panel.style.display = 'block';
    // 关闭按钮
    document.getElementById('inventory-close')?.addEventListener('click', () => { panel.style.display = 'none'; });
  }

  function handleChoice(actionId) {
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

  // 移动模式已移除，改为点击格子移动
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
  // Phase 2: 返回ActionOutcome（通过fromActionResult桥接）
  function tryLocalAction(text) {
    if (typeof RoomInteraction === 'undefined') return null;

    const pp = SceneManager.getPlayerPos();
    const sceneObjects = SceneManager.sceneObjects || [];
    const scene = DMEngine.getCurrentScene();

    // 构建RoomState（每次调用都刷新，保证状态同步）
    const room = RoomInteraction.buildRoomState(sceneObjects, pp, scene);

    // 走统一执行器
    const actionResult = RoomInteraction.executePlayerInput(text, room);

    if (!actionResult) return null;

    // Phase 2: 桥接为ActionOutcome
    const outcome = ActionResolver.fromActionResult(actionResult);

    // 处理UI提示
    if (outcome?.uiHint?.highlightTargetId) {
      const targetObj = sceneObjects.find(o => (o.id || `${o.type}_${o.gridX}_${o.gridZ}`) === outcome.uiHint.highlightTargetId);
      if (targetObj && SceneManager.highlightObject) {
        SceneManager.highlightObject(targetObj.gridX, targetObj.gridZ, 1200);
      }
    }

    // 成功的灯光操作→应用Outcome+更新迷雾
    if (outcome && outcome.success) {
      DMEngine.applyOutcome(outcome);
      if (outcome.requiresRender) {
        updateFog();
      }
    }

    return outcome;
  }

  // 文本指令输入（AI优先）
  document.getElementById('btn-send').addEventListener('click', sendPlayerInput);
  document.getElementById('player-input').addEventListener('keydown', (e) => { if(e.key==='Enter') sendPlayerInput(); });

  async function sendPlayerInput() {
    const input = document.getElementById('player-input'); const text = input.value.trim(); if(!text) return;
    UI.addNarration(`> ${text}`, 'player'); input.value = '';

    // 优先处理本地可执行指令（灯光/门/距离敏感操作）
    const localOutcome = tryLocalAction(text);
    if (localOutcome) {
      // 根据Outcome决定是否扣AP
      const isFreeAction = !localOutcome.success || localOutcome.consumesAp === 0
        || localOutcome.resultType === 'need_approach' || localOutcome.resultType === 'ambiguous' || localOutcome.resultType === 'no_target';
      if (!isFreeAction && localOutcome.success) {
        if (!DMEngine.consumeAP(1)) { UI.addNarration('行动点数不足！请结束回合。', 'system'); return; }
      }
      UI.addNarration(localOutcome.narrationHint || localOutcome.logs.join('\n') || '', 'dm');
      UI.updateHUD(); GameState.saveGame(); return;
    }

    // 非本地指令→扣AP后走AI/DM引擎
    if(!DMEngine.consumeAP(1)){UI.addNarration('行动点数不足！请结束回合。','system');return;}

    if(typeof AIDM!=='undefined' && AIDM.isConfigured()){
      UI.addNarration('🔮 AI思考中...','system');
      try{
        const ctx = { history: DMEngine.getHistory().slice(-10), scene: DMEngine.getCurrentScene(), player: GameState.getPlayer() };
        const aiResult = await AIDM.generateNarration(text, ctx);
        const nt = document.getElementById('narrative-text'); const last = nt?.lastElementChild; if(last?.textContent.includes('🔮')) last.remove();
        if(aiResult && aiResult.narration){ 
          UI.addNarration(aiResult.narration,'dm'); 
          if(aiResult.choices?.length>0) showChoices(aiResult.choices); 
          UI.updateHUD(); GameState.saveGame(); 
          return; 
        }
        console.warn('[Game] AI返回为空，使用降级叙事');
      }catch(err){
        console.warn('[Game] AI调用失败:', err);
        const nt=document.getElementById('narrative-text');
        const last=nt?.lastElementChild;
        if(last?.textContent.includes('🔮'))last.remove();
      }
    } else {
      console.log('[Game] AI未配置，使用降级叙事');
    }

    const result = await DMEngine.processFreeInput(text);
    if(!result || !result.narration){
      UI.addNarration('你做了一些事情，但似乎没有什么特别的事情发生...','system');
    } else {
      UI.addNarration(result.narration,'dm');
    }
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
    // WASD直接移动（无需进入移动模式）
    let moved = false;
    switch(e.key) {
      case 'w': case 'ArrowUp':    moved = SceneManager.movePlayer(0,-1); break;
      case 's': case 'ArrowDown':  moved = SceneManager.movePlayer(0,1); break;
      case 'a': case 'ArrowLeft':  moved = SceneManager.movePlayer(-1,0); break;
      case 'd': case 'ArrowRight': moved = SceneManager.movePlayer(1,0); break;
    }
    if (moved) {
      e.preventDefault();
      if (!DMEngine.consumeAP(1)) { UI.addNarration('行动点数不足！','system'); return; }
      updateFog(); UI.updateHUD();
    }
  });

  // 点击格子移动（通过SceneManager的clickGrid）
  // 已在SceneManager.init中通过raycast实现

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
