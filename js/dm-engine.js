/**
 * AI DM引擎 - 叙事系统 + 世界状态 + 行动点数
 * AI优先叙事，未配置时降级为预设模板
 * 剧本生成器仅提供框架，内容由接入的AI模型生成
 */

const DMEngine = (() => {
  let worldState = {};
  let narrativeHistory = [];
  let plotState = 'intro';
  let facts = [];
  let npcStates = {};

  // ========== 行动点数系统 ==========
  let actionPoints = { current: 3, max: 3 };

  function getAP() { return { ...actionPoints }; }
  function consumeAP(cost) {
    if (actionPoints.current < cost) return false;
    actionPoints.current -= cost;
    return true;
  }
  function resetAP() { actionPoints.current = actionPoints.max; }
  function setAPMax(max) { actionPoints.max = max; actionPoints.current = max; }

  // ========== 预设剧本（降级用） ==========
  const SCENARIOS = {
    'old_house': {
      title: '旧宅疑云',
      description: '一封来自已故友人的信件，将你引向了城郊一座荒废的维多利亚式老宅...',
      scenes: [
        { id: 'arrival', name: '抵达旧宅', room: 'room_large', width: 6, height: 6,
          atmosphere: { fogDensity: 0.025, ambientIntensity: 0.2, lightColor: 0xffeedd, lightIntensity: 0.5 },
          objects: [{ type: 'door', x: 0, z: 2 },{ type: 'lamp', x: 1, z: 1 },{ type: 'table', x: 3, z: 2 },{ type: 'chair', x: 4, z: 2 },{ type: 'bookshelf', x: 5, z: 0 }],
          narration: '你站在旧宅的门厅中。空气中弥漫着陈腐的气味，灰尘在微弱的光线中缓缓飘落。一张布满灰尘的桌子摆在中央，上面似乎有什么东西...',
          choices: [{ text: '调查桌子', action: 'investigate_table' },{ text: '查看书架', action: 'check_bookshelf' },{ text: '走向走廊深处', action: 'go_corridor' }]
        },
        { id: 'corridor', name: '阴暗走廊', room: 'corridor', width: 2, height: 8,
          atmosphere: { fogDensity: 0.030, ambientIntensity: 0.15, lightColor: 0xffddbb, lightIntensity: 0.3 },
          objects: [{ type: 'lamp', x: 0, z: 1 },{ type: 'lamp', x: 1, z: 5 },{ type: 'crate', x: 0, z: 3 }],
          narration: '走廊幽暗狭长，墙壁上的壁纸已经剥落，露出斑驳的灰泥。远处隐约传来某种声响...',
          choices: [{ text: '继续前进', action: 'go_deeper' },{ text: '检查箱子', action: 'check_crate' },{ text: '返回门厅', action: 'go_back_lobby' }]
        },
        { id: 'library', name: '尘封图书馆', room: 'library', width: 5, height: 5,
          atmosphere: { fogDensity: 0.020, ambientIntensity: 0.25, lightColor: 0xffeecc, lightIntensity: 0.5 },
          objects: [{ type: 'bookshelf', x: 0, z: 0 },{ type: 'bookshelf', x: 0, z: 2 },{ type: 'bookshelf', x: 0, z: 4 },{ type: 'table', x: 2, z: 2 },{ type: 'lamp', x: 2, z: 0 },{ type: 'chair', x: 3, z: 2 }],
          narration: '推开沉重的木门，你进入了一间布满书架的房间。古老的书籍散发着霉味，桌上摊开着一本日记...',
          choices: [{ text: '阅读日记', action: 'read_diary' },{ text: '搜索书架', action: 'search_books' },{ text: '查看角落', action: 'check_corner' }]
        },
        { id: 'basement', name: '地下室', room: 'basement', width: 4, height: 4,
          atmosphere: { fogDensity: 0.035, ambientIntensity: 0.1, lightColor: 0xffccaa, lightIntensity: 0.2 },
          objects: [{ type: 'barrel', x: 0, z: 0 },{ type: 'crate', x: 2, z: 1 },{ type: 'lamp', x: 1, z: 0 },{ type: 'altar', x: 2, z: 2 }],
          narration: '潮湿的地下室里，水滴声回荡在黑暗中。借着微弱的灯光，你看到了一座石制祭坛...',
          enemies: [{ name: '深潜者教徒', dex: 55, hp: 12, maxHp: 12, x: 0, z: 3, weapon: '小刀', damage: '1D4+1' }],
          choices: [{ text: '调查祭坛', action: 'investigate_altar' },{ text: '准备战斗', action: 'prepare_fight' },{ text: '撤退', action: 'retreat' }]
        },
        { id: 'ritual_room', name: '仪式室', room: 'ritual', width: 5, height: 5,
          atmosphere: { fogDensity: 0.030, ambientIntensity: 0.15, lightColor: 0xff8866, lightIntensity: 0.3 },
          objects: [{ type: 'altar', x: 2, z: 2 },{ type: 'statue', x: 0, z: 0 },{ type: 'statue', x: 4, z: 0 },{ type: 'lamp', x: 1, z: 1 },{ type: 'lamp', x: 3, z: 1 }],
          narration: '你来到了最终的房间。空气中弥漫着令人不安的气息，祭坛上刻满了不可名状的符文...',
          enemies: [{ name: '邪教首领', dex: 60, hp: 18, maxHp: 18, x: 2, z: 0, weapon: '手枪(.38)', damage: '1D8' },{ name: '深潜者教徒', dex: 50, hp: 10, maxHp: 10, x: 0, z: 3, weapon: '小刀', damage: '1D4+1' }],
          choices: [{ text: '阻止仪式', action: 'stop_ritual' },{ text: '战斗', action: 'final_fight' },{ text: '尝试交涉', action: 'negotiate' }]
        }
      ],
      transitions: {
        'investigate_table': { narration: '桌上有一封未拆的信件和一把生锈的钥匙。信中提到了"地下室的秘密"...', items: ['生锈的钥匙'] },
        'check_bookshelf': { narration: '书架上大部分书籍已经腐烂，但有一本关于神秘学的手稿引起了你的注意。', skillCheck: { skill: '图书馆使用', difficulty: '常规', success: '你找到了关于旧宅历史的线索。', failure: '你没有发现有用的信息。' } },
        'go_corridor': { nextScene: 'corridor' },
        'go_deeper': { nextScene: 'library' },
        'check_crate': { narration: '箱子里有一些旧的蜡烛和一盏油灯。也许能用来照明。', items: ['油灯'] },
        'go_back_lobby': { nextScene: 'arrival' },
        'read_diary': { narration: '日记记录了前主人的疯狂——他声称在地下室接触了"不可名状之物"。最后几页字迹潦草...', sanityLoss: 2 },
        'search_books': { skillCheck: { skill: '图书馆使用', difficulty: '困难', success: '你发现了一本暗语写成的魔法书！', failure: '这些书对你来说毫无意义。', items: ['古老魔法书'] } },
        'check_corner': { narration: '角落里有一扇隐藏的门，通向地下...', nextScene: 'basement' },
        'investigate_altar': { narration: '祭坛上刻着诡异的符文，你的理智受到了冲击！', sanityLoss: 5, nextScene: 'ritual_room' },
        'prepare_fight': { combat: true },
        'retreat': { nextScene: 'corridor' },
        'stop_ritual': { skillCheck: { skill: '神秘学', difficulty: '极难', success: '你成功破坏了仪式！邪教徒们陷入恐慌！', failure: '仪式的力量将你击退！' } },
        'final_fight': { combat: true },
        'negotiate': { skillCheck: { skill: '说服', difficulty: '困难', success: '邪教首领犹豫了，你争取到了宝贵的时间。', failure: '邪教首领对你的话嗤之以鼻！' } }
      }
    }
  };

  // ========== 动态剧本存储 ==========
  let dynamicScenario = null;

  // ========== 剧本生成器框架 ==========
  function generateScenarioFromSurvey(answers) {
    if (typeof AIDM !== 'undefined' && AIDM.isConfigured()) {
      return AIDM.generateScenario(answers).then(aiResult => {
        if (aiResult) {
          const parsed = parseAIScenario(aiResult, answers);
          if (parsed) { dynamicScenario = parsed; return parsed; }
        }
        return SCENARIOS['old_house'];
      }).catch(() => SCENARIOS['old_house']);
    }
    return Promise.resolve(SCENARIOS['old_house']);
  }

  function parseAIScenario(aiText, answers) {
    try {
      // 尝试JSON解析
      const jsonMatch = aiText.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) return validateAndFixScenario(JSON.parse(jsonMatch[1]), answers);
      try { return validateAndFixScenario(JSON.parse(aiText), answers); } catch(e) {}

      // 解析【标签】格式
      return parseStructuredScenario(aiText, answers);
    } catch (err) {
      console.error('Failed to parse AI scenario:', err);
      return null;
    }
  }

  function parseStructuredScenario(text, answers) {
    const scenario = { title: '', description: '', scenes: [], transitions: {} };
    const titleMatch = text.match(/【标题】(.+)/);
    if (titleMatch) scenario.title = titleMatch[1].trim();
    const descMatch = text.match(/【简介】(.+)/);
    if (descMatch) scenario.description = descMatch[1].trim();

    // 增强正则：支持6个字段（含雾密度、光强度、物件列表）
    const sceneRegex = /【场景\d+】(.+?)\|(.+?)\|(\d+)x(\d+)\|([0-9.]+)\|([0-9.]+)\|(.+)/g;
    let match, idx = 0;
    while ((match = sceneRegex.exec(text)) !== null) {
      const sceneId = `scene_${idx}`;
      const roomType = mapRoomType(match[2].trim());
      const w = Math.max(4, parseInt(match[3]) || 5);
      const h = Math.max(4, parseInt(match[4]) || 5);
      const fogDensity = parseFloat(match[5]) || 0.025;
      const lightIntensity = parseFloat(match[6]) || 0.5;
      const objectsStr = match[7];

      // 解析物件列表
      let objects = parseObjectList(objectsStr, w, h);
      if (objects.length === 0) objects = generateObjectsForRoom(roomType, w, h, answers?.mood);

      // 叙述文本在物件之后（如果有|分隔）
      const narrationMatch = objectsStr.match(/\|([^|]+)$/);
      const narration = narrationMatch ? narrationMatch[1].trim() : '你来到了一个新的地方...';

      const baseAtm = getAtmosphereForMood(answers?.mood || 'gothic', idx);
      const rawScene = {
        id: sceneId, name: match[1].trim(), room: roomType, width: w, height: h,
        atmosphere: { ...baseAtm, fogDensity, lightIntensity },
        objects, narration,
        choices: [], enemies: []
      };

      // 尝试通过SceneCompiler编译
      const compiledScene = tryCompileScene(rawScene, answers?.mood);
      scenario.scenes.push(compiledScene);
      idx++;
    }

    // 降级：尝试旧格式（5字段，无物件）
    if (scenario.scenes.length === 0) {
      const oldRegex = /【场景\d+】(.+?)\|(.+?)\|(\d+)x(\d+)\|(.+)/g;
      while ((match = oldRegex.exec(text)) !== null) {
        const sceneId = `scene_${idx}`;
        const roomType = mapRoomType(match[2].trim());
        const w = Math.max(4, parseInt(match[3]) || 5);
        const h = Math.max(4, parseInt(match[4]) || 5);
        const rawScene = {
          id: sceneId, name: match[1].trim(), room: roomType, width: w, height: h,
          atmosphere: getAtmosphereForMood(answers?.mood || 'gothic', idx),
          objects: generateObjectsForRoom(roomType, w, h, answers?.mood),
          narration: match[5].trim(),
          choices: [], enemies: []
        };
        const compiledScene = tryCompileScene(rawScene, answers?.mood);
        scenario.scenes.push(compiledScene);
        idx++;
      }
    }

    if (scenario.scenes.length === 0) {
      const rawScene = {
        id: 'scene_0', name: scenario.title || '神秘之地', room: 'room_medium', width: 5, height: 5,
        atmosphere: { fogDensity: 0.025, ambientIntensity: 0.2, lightColor: 0xffeedd, lightIntensity: 0.5 },
        objects: generateObjectsForRoom('room_medium', 5, 5, answers?.mood),
        narration: scenario.description || '你来到了一个陌生的地方...',
        choices: [{ text: '调查周围', action: 'investigate' },{ text: '仔细聆听', action: 'listen' },{ text: '寻找出口', action: 'find_exit' }],
        enemies: []
      };
      scenario.scenes.push(tryCompileScene(rawScene, answers?.mood));
    }

    for (let i = 0; i < scenario.scenes.length; i++) {
      const s = scenario.scenes[i];
      if (s.choices.length === 0) {
        s.choices.push({ text: '调查周围', action: `investigate_s${i}` });
        if (i < scenario.scenes.length - 1) {
          s.choices.push({ text: '继续前进', action: `next_s${i}` });
          scenario.transitions[`next_s${i}`] = { nextScene: scenario.scenes[i + 1].id };
        }
        if (i > 0) {
          s.choices.push({ text: '返回', action: `back_s${i}` });
          scenario.transitions[`back_s${i}`] = { nextScene: scenario.scenes[i - 1].id };
        }
      }
    }
    return scenario;
  }

  /**
   * 尝试通过SceneCompiler编译场景
   * 编译器会：规范尺寸、分配槽位、校验连通性、生成反向叙事
   * 编译失败则降级返回原始场景
   */
  function tryCompileScene(rawScene, mood) {
    if (typeof SceneCompiler === 'undefined' || !SceneCompiler.compileScene) {
      return rawScene; // 编译器不可用，直接返回
    }

    try {
      // 构建编译器输入格式
      const spec = {
        scene_id: rawScene.id,
        room_type: rawScene.room,
        shape: SceneCompiler.ROOM_TYPE_DEFAULTS?.[rawScene.room]?.defaultShape || 'rect',
        size: { w: rawScene.width, h: rawScene.height },
        objects: (rawScene.objects || []).map(o => ({
          type: o.type,
          role: SceneCompiler.TYPE_DEFAULTS?.[o.type]?.role || 'atmosphere',
          zone: o.zone || null,
          near: o.near || null
        })),
        mood: mood || 'neutral',
        fog_density: rawScene.atmosphere?.fogDensity || 0.025,
        ambient_light: rawScene.atmosphere?.ambientIntensity || 0.5,
        connections: []
      };

      // 规范化+编译
      const normalized = SceneCompiler.normalizeSceneSpec(spec);
      if (!normalized) return rawScene;

      const compiled = SceneCompiler.compileScene(normalized);
      if (!compiled) return rawScene;

      // 编译成功：转换回DMEngine场景格式
      const compiledScene = {
        id: compiled.scene_id,
        name: rawScene.name,
        room: compiled.room_type,
        width: compiled.size.w,
        height: compiled.size.h,
        atmosphere: {
          fogDensity: compiled.atmosphere.fogDensity,
          ambientIntensity: compiled.atmosphere.ambientIntensity,
          lightColor: rawScene.atmosphere?.lightColor || 0xffeedd,
          lightIntensity: rawScene.atmosphere?.lightIntensity || 0.5,
          mood: compiled.atmosphere.mood
        },
        objects: compiled.objects.map(o => ({
          type: o.type,
          x: o.x,
          z: o.z,
          // 保留编译器生成的交互元数据
          role: o.role,
          actions: o.actions,
          requiredRange: o.requiredRange,
          needsLOS: o.needsLOS
        })),
        narration: rawScene.narration || SceneCompiler.generateNarration(compiled),
        choices: rawScene.choices || [],
        enemies: rawScene.enemies || []
      };

      console.log(`[SceneCompiler] 场景"${compiledScene.name}"编译成功: ${compiled.objects.length}个物件, ${compiled.size.w}x${compiled.size.h}`);
      return compiledScene;

    } catch (err) {
      console.warn('[SceneCompiler] 编译失败，降级到原始场景:', err);
      return rawScene;
    }
  }

  // 解析AI返回的物件列表字符串（增强版）
  // 支持多种格式：
  //   type:x,z  (原有格式)
  //   type(x,z) (括号格式)
  //   type@x,z  (@分隔格式)
  //   type x z  (空格分隔格式)
  //   type(x,y) (中文逗号)
  // 同时做语义映射、类型验证、重叠检测
  function parseObjectList(str, maxW, maxH) {
    const objects = [];
    if (!str) return objects;

    // 合法物件类型集合（来自SceneCompiler.TYPE_DEFAULTS或内置列表）
    const VALID_TYPES = new Set([
      'lamp', 'candle', 'fireplace', 'door', 'chest', 'wardrobe',
      'altar', 'statue', 'bookshelf', 'desk', 'skeleton', 'mirror',
      'table', 'pillar', 'crate', 'barrel', 'bed', 'chair', 'rug',
      'painting'
    ]);

    // 语义映射（复用SceneCompiler的映射表）
    const semanticMap = (typeof SceneCompiler !== 'undefined' && SceneCompiler.SEMANTIC_MAP)
      ? SceneCompiler.SEMANTIC_MAP
      : {
          ritual_table: 'altar', ritual_circle: 'altar', shrine: 'altar',
          couch: 'bed', sofa: 'bed', cot: 'bed',
          cabinet: 'wardrobe', closet: 'wardrobe', drawer: 'desk',
          torch: 'lamp', lantern: 'lamp', chandelier: 'lamp',
          shelf: 'bookshelf', shelves: 'bookshelf',
          box: 'crate', trunk: 'chest', safe: 'chest',
          column: 'pillar', post: 'pillar',
          painting_frame: 'painting', portrait: 'painting', photo: 'painting',
          brazier: 'fireplace', hearth: 'fireplace',
          remains: 'skeleton', corpse: 'skeleton', bones: 'skeleton',
          book: 'bookshelf', diary: 'desk', letter: 'desk',
          rug_carpet: 'rug', carpet: 'rug'
        };

    const occupiedPositions = new Set();

    // 尝试多种格式解析
    // 格式1: type:x,z 或 type:x，z（中文逗号）
    const format1 = /([a-z_]+)\s*[:：]\s*(\d+)\s*[,，]\s*(\d+)/gi;
    // 格式2: type(x,z) 或 type（x，z）
    const format2 = /([a-z_]+)\s*[（(]\s*(\d+)\s*[,，]\s*(\d+)\s*[）)]/gi;
    // 格式3: type@x,z
    const format3 = /([a-z_]+)\s*@\s*(\d+)\s*[,，]\s*(\d+)/gi;
    // 格式4: type x z (空格分隔，需type在前)
    const format4 = /([a-z_]+)\s+(\d+)\s+(\d+)/gi;

    const patterns = [format1, format2, format3, format4];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(str)) !== null) {
        let type = match[1].toLowerCase().replace(/[^a-z_]/g, '');
        const x = parseInt(match[2]);
        const z = parseInt(match[3]);

        if (!type || isNaN(x) || isNaN(z)) continue;

        // 语义映射：未知类型→最近已知类型
        type = semanticMap[type] || type;

        // 类型验证：不在合法集合中则跳过
        if (!VALID_TYPES.has(type)) {
          console.warn(`[parseObjectList] 忽略未知物件类型: "${match[1]}" → 映射为 "${type}"`);
          continue;
        }

        // 坐标范围检查
        if (x < 0 || x >= maxW || z < 0 || z >= maxH) {
          console.warn(`[parseObjectList] 物件${type}坐标(${x},${z})超出房间范围(${maxW}x${maxH})，已跳过`);
          continue;
        }

        // 重叠检测
        const posKey = `${x},${z}`;
        if (occupiedPositions.has(posKey)) {
          console.warn(`[parseObjectList] 位置(${x},${z})已有物件，跳过重复的${type}`);
          continue;
        }

        occupiedPositions.add(posKey);
        objects.push({ type, x, z });
      }
    }

    // 如果所有格式都没解析出物件，尝试原有格式作为兜底
    if (objects.length === 0) {
      const parts = str.split(',');
      for (let i = 0; i < parts.length - 2; i += 3) {
        let type = parts[i].trim().replace(/[^a-z_]/gi, '');
        const x = parseInt(parts[i + 1]);
        const z = parseInt(parts[i + 2]);
        if (!type || isNaN(x) || isNaN(z)) continue;
        type = semanticMap[type] || type;
        if (!VALID_TYPES.has(type)) continue;
        if (x < 0 || x >= maxW || z < 0 || z >= maxH) continue;
        const posKey = `${x},${z}`;
        if (occupiedPositions.has(posKey)) continue;
        occupiedPositions.add(posKey);
        objects.push({ type, x, z });
      }
    }

    if (objects.length > 0) {
      console.log(`[parseObjectList] 解析出${objects.length}个物件: ${objects.map(o => `${o.type}(${o.x},${o.z})`).join(', ')}`);
    }

    return objects;
  }

  function getAtmosphereForMood(mood, idx) {
    const moods = {
      gothic: { fogDensity: 0.025, ambientIntensity: 0.2, lightColor: 0xffeedd, lightIntensity: 0.5 },
      cosmic: { fogDensity: 0.030, ambientIntensity: 0.15, lightColor: 0xddbbff, lightIntensity: 0.3 },
      noir: { fogDensity: 0.020, ambientIntensity: 0.25, lightColor: 0xffeedd, lightIntensity: 0.6 },
      folklore: { fogDensity: 0.025, ambientIntensity: 0.2, lightColor: 0xffddbb, lightIntensity: 0.5 },
      modern: { fogDensity: 0.015, ambientIntensity: 0.35, lightColor: 0xffffff, lightIntensity: 0.8 },
      dream: { fogDensity: 0.030, ambientIntensity: 0.15, lightColor: 0xddccff, lightIntensity: 0.3 }
    };
    return moods[mood] || moods.gothic;
  }

  function mapRoomType(name) {
    const map = { '走廊':'corridor','corridor':'corridor','小房间':'room_small','room_small':'room_small',
      '中房间':'room_medium','room_medium':'room_medium','大厅':'room_large','room_large':'room_large',
      '图书馆':'library','library':'library','地下室':'basement','basement':'basement','仪式室':'ritual','ritual':'ritual' };
    return map[name] || 'room_medium';
  }

  function generateObjectsForRoom(roomType, w, h, mood) {
    // 基础照明
    const objects = [{ type: 'lamp', x: 0, z: 0 }];
    if (w >= 4 && h >= 4) objects.push({ type: 'lamp', x: w - 1, z: h - 1 });

    // 氛围物件（根据mood添加）
    const moodDecor = {
      gothic: ['candle', 'painting', 'rug', 'candle'],
      cosmic: ['candle', 'statue', 'mirror', 'candle'],
      noir: ['lamp', 'desk', 'candle', 'painting'],
      folklore: ['candle', 'fireplace', 'rug', 'chest'],
      modern: ['lamp', 'desk', 'chair', 'candle'],
      dream: ['candle', 'mirror', 'statue', 'rug']
    };
    const moodItems = moodDecor[mood] || moodDecor.gothic;

    switch (roomType) {
      case 'corridor':
        objects.push({ type: 'crate', x: 0, z: Math.floor(h / 2) });
        if (h >= 6) objects.push({ type: moodItems[0], x: w > 1 ? 1 : 0, z: Math.floor(h / 3) });
        if (h >= 5) objects.push({ type: 'painting', x: w > 1 ? 1 : 0, z: 1 });
        if (h >= 7) objects.push({ type: 'barrel', x: 0, z: h - 2 });
        break;
      case 'library':
        objects.push(
          { type: 'bookshelf', x: 0, z: 0 },
          { type: 'bookshelf', x: 0, z: Math.min(2, h - 1) },
          { type: 'desk', x: Math.floor(w / 2), z: Math.floor(h / 2) },
          { type: 'chair', x: Math.floor(w / 2) + 1, z: Math.floor(h / 2) },
          { type: moodItems[0], x: Math.floor(w / 2), z: 0 }
        );
        if (w >= 5) objects.push({ type: 'bookshelf', x: w - 1, z: 0 });
        if (h >= 5) objects.push({ type: 'chest', x: w - 1, z: h - 1 });
        break;
      case 'basement':
        objects.push(
          { type: 'barrel', x: 0, z: 0 },
          { type: 'crate', x: Math.min(2, w - 1), z: 1 },
          { type: 'crate', x: 1, z: Math.min(3, h - 1) }
        );
        if (w >= 4 && h >= 4) objects.push({ type: 'skeleton', x: w - 1, z: h - 1 });
        if (w >= 5) objects.push({ type: moodItems[0], x: Math.floor(w / 2), z: 0 });
        break;
      case 'ritual':
        objects.push(
          { type: 'altar', x: Math.floor(w / 2), z: Math.floor(h / 2) },
          { type: 'statue', x: 0, z: 0 },
          { type: 'statue', x: w - 1, z: 0 }
        );
        if (w >= 5) {
          objects.push({ type: 'candle', x: Math.floor(w / 2) - 1, z: Math.floor(h / 2) });
          objects.push({ type: 'candle', x: Math.floor(w / 2) + 1, z: Math.floor(h / 2) });
        }
        if (h >= 5) objects.push({ type: 'rug', x: Math.floor(w / 2), z: Math.floor(h / 2) + 1 });
        if (mood === 'cosmic' || mood === 'dream') objects.push({ type: 'mirror', x: w - 1, z: h - 1 });
        break;
      case 'room_small':
        objects.push(
          { type: 'table', x: Math.floor(w / 2), z: Math.floor(h / 2) },
          { type: 'chair', x: Math.floor(w / 2) + 1, z: Math.floor(h / 2) }
        );
        if (w >= 4) objects.push({ type: moodItems[0], x: 1, z: 0 });
        if (h >= 4) objects.push({ type: 'painting', x: w - 1, z: 0 });
        break;
      case 'room_large':
        objects.push(
          { type: 'pillar', x: 1, z: 1 },
          { type: 'pillar', x: w - 2, z: 1 },
          { type: 'pillar', x: 1, z: h - 2 },
          { type: 'pillar', x: w - 2, z: h - 2 },
          { type: 'table', x: Math.floor(w / 2), z: Math.floor(h / 2) },
          { type: 'chair', x: Math.floor(w / 2) + 1, z: Math.floor(h / 2) },
          { type: moodItems[0], x: Math.floor(w / 2), z: 0 }
        );
        if (h >= 6) objects.push({ type: 'fireplace', x: 0, z: Math.floor(h / 2) });
        if (w >= 7) objects.push({ type: 'statue', x: Math.floor(w / 2), z: h - 1 });
        break;
      default: // room_medium
        objects.push(
          { type: 'table', x: Math.floor(w / 2), z: Math.floor(h / 2) },
          { type: 'chair', x: Math.floor(w / 2) + 1, z: Math.floor(h / 2) }
        );
        if (w >= 5) objects.push({ type: 'bookshelf', x: 0, z: 0 });
        if (h >= 5) objects.push({ type: moodItems[0], x: w - 1, z: 0 });
        if (w >= 5 && h >= 5) objects.push({ type: 'rug', x: Math.floor(w / 2), z: Math.floor(h / 2) + 1 });
        break;
    }

    // 确保所有物件在房间范围内
    return objects.filter(o => o.x >= 0 && o.x < w && o.z >= 0 && o.z < h);
  }

  function validateAndFixScenario(data, answers) {
    if (!data.scenes || !Array.isArray(data.scenes) || data.scenes.length === 0) return null;
    data.title = data.title || '未命名剧本';
    data.description = data.description || '';
    data.transitions = data.transitions || {};
    data.scenes.forEach((scene, i) => {
      scene.id = scene.id || `scene_${i}`;
      scene.name = scene.name || `场景${i + 1}`;
      scene.room = mapRoomType(scene.room);
      scene.width = Math.max(4, scene.width || 5);
      scene.height = Math.max(4, scene.height || 5);
      scene.atmosphere = scene.atmosphere || getAtmosphereForMood(answers?.mood || 'gothic', i);
      scene.objects = scene.objects || generateObjectsForRoom(scene.room, scene.width, scene.height);
      scene.narration = scene.narration || '你来到了一个新的地方...';
      scene.choices = scene.choices || [];
      scene.enemies = scene.enemies || [];
      // 尝试通过SceneCompiler编译
      const compiled = tryCompileScene(scene, answers?.mood);
      if (compiled !== scene) {
        // 编译成功，用编译后的结果替换
        Object.assign(scene, compiled);
      }
    });
    return data;
  }

  // ========== 世界状态引擎 ==========
  function initWorld(scenarioId) {
    const scenario = dynamicScenario || SCENARIOS[scenarioId];
    if (!scenario) return null;
    worldState = { scenarioId: dynamicScenario ? 'dynamic' : scenarioId, currentSceneIndex: 0, visitedScenes: [], inventory: [], flags: {}, turnCount: 0 };
    narrativeHistory = [];
    facts = [];
    npcStates = {};
    plotState = 'intro';
    resetAP();
    addFact('scenario', scenario.title);
    addFact('location', scenario.scenes[0].name);
    return scenario;
  }

  function initWorldWithScenario(scenario) {
    dynamicScenario = scenario;
    return initWorld('dynamic');
  }

  function addFact(category, content) { facts.push({ category, content, time: Date.now() }); }
  function getFacts(category) { return category ? facts.filter(f => f.category === category) : facts; }
  function validateNarration(narration) { return true; }

  function getActiveScenario() { return dynamicScenario || SCENARIOS[worldState.scenarioId]; }

  function getCurrentScene() {
    const scenario = getActiveScenario();
    if (!scenario) return null;
    return scenario.scenes[worldState.currentSceneIndex];
  }

  function getNarration() { const s = getCurrentScene(); return s ? s.narration : '故事尚未开始...'; }
  function getChoices() { const s = getCurrentScene(); return s ? (s.choices || []) : []; }

  // ========== 处理玩家选择 ==========
  function processChoice(actionId) {
    const scenario = getActiveScenario();
    if (!scenario) return null;
    const transition = scenario.transitions[actionId];
    if (!transition) return { narration: '什么也没有发生...', choices: getChoices() };

    let result = { narration: '', choices: [], combat: false, enemies: null, items: [], sanityLoss: 0 };

    if (transition.skillCheck) {
      const player = GameState.getPlayer();
      const sc = transition.skillCheck;
      const skillValue = player.skills[sc.skill] || CoCRules.calcSkillBase(sc.skill, player.stats);
      const check = CoCRules.rollCheck(skillValue);
      result.narration = check.isSuccess ? sc.success : sc.failure;
      addFact(check.isSuccess ? 'skill_success' : 'skill_failure', `${sc.skill}检定: ${check.roll}/${skillValue}`);
      result.narration = `[${sc.skill}检定: ${check.roll}/${skillValue} → ${check.result}] ${result.narration}`;
    } else if (transition.narration) {
      result.narration = transition.narration;
    }

    if (transition.items) {
      result.items = transition.items;
      transition.items.forEach(item => { worldState.inventory.push(item); addFact('item', `获得: ${item}`); });
    }

    if (transition.sanityLoss) {
      result.sanityLoss = transition.sanityLoss;
      const player = GameState.getPlayer();
      const sanResult = CoCRules.sanCheck(player.derived.san, 0, transition.sanityLoss);
      player.derived.san = sanResult.newSan;
      result.narration += ` [SAN检定: ${sanResult.check.roll} → ${sanResult.check.result}, 损失${sanResult.loss}点理智]`;
      if (typeof FogOfWar !== 'undefined' && FogOfWar.setSanityDistortion) FogOfWar.setSanityDistortion(player.derived.san);
      addFact('sanity', `理智降至 ${player.derived.san}`);
    }

    if (transition.nextScene) {
      const sceneIndex = scenario.scenes.findIndex(s => s.id === transition.nextScene);
      if (sceneIndex >= 0) {
        worldState.currentSceneIndex = sceneIndex;
        addFact('location', scenario.scenes[sceneIndex].name);
        result.choices = scenario.scenes[sceneIndex].choices || [];
        result.newScene = scenario.scenes[sceneIndex];
      }
    } else if (transition.combat) {
      result.combat = true;
      result.enemies = getCurrentScene().enemies || [];
    } else {
      result.choices = getChoices();
    }

    narrativeHistory.push({ turn: worldState.turnCount++, action: actionId, narration: result.narration, time: Date.now() });
    return result;
  }

  // ========== 处理自由文本输入（判定层与叙事层拆开） ==========
  async function processFreeInput(text) {
    const player = GameState.getPlayer();
    const scene = getCurrentScene();

    // ---- 判定层：意图识别+动作校验（如果可用） ----
    if (typeof InputInterpreter !== 'undefined' && typeof ActionResolver !== 'undefined') {
      const pp = (typeof SceneManager !== 'undefined' && SceneManager.getPlayerPos) ? SceneManager.getPlayerPos() : { x: 0, z: 0 };
      const sceneObjects = (typeof SceneManager !== 'undefined' && SceneManager.sceneObjects) ? SceneManager.sceneObjects : [];
      const hasLight = sceneObjects.some(o => o.isLight && o.isOn);
      const isDark = !hasLight;

      const context = {
        objects: sceneObjects,
        playerPos: pp,
        isDark, hasLight,
        inCombat: typeof CombatSystem !== 'undefined' && CombatSystem.isInCombat(),
        hasLineOfSight: (typeof SceneManager !== 'undefined' && SceneManager.hasLineOfSight) ? (ax, az, bx, bz) => SceneManager.hasLineOfSight(ax, az, bx, bz) : null
      };

      const parsed = InputInterpreter.interpret(text, context);

      if (parsed) {
        // 说话意图：AP分级
        if (parsed.intent === 'speak') {
          const apCost = ActionResolver.classifyDialogueAP(parsed.action);
          if (apCost > 0 && !consumeAP(apCost)) {
            return { narration: '你没有足够的行动点数来说更多了。', choices: getChoices(), combat: false };
          }
          // 0级对话不消耗AP，直接走叙事
        }

        // 观察意图：黑暗中受限
        if (parsed.intent === 'observe' && isDark && !hasLight) {
          return { narration: '黑暗中什么都看不清，你需要先找到光源。', choices: getChoices(), combat: false };
        }

        // 战斗意图：检查战斗状态
        if (parsed.intent === 'combat' && !context.inCombat) {
          return { narration: '现在没有战斗，你不需要战斗指令。', choices: getChoices(), combat: false };
        }
      }
    }

    // ---- 叙事层：AI优先，关键词降级 ----
    // 叙事约束：AI只能描述玩家能感知的东西（方案D）
    let perceptionContext = {};
    if (typeof ScenePerception !== 'undefined') {
      const snapshot = ScenePerception.getSnapshot();
      perceptionContext = {
        visibleObjects: snapshot.forNarration.canDescribe.map(o => o.type),
        hintableObjects: snapshot.forNarration.canHint.map(o => o.type),
        offscreenObjects: snapshot.forNarration.needDirectionHint.map(o => ({ type: o.type, direction: o.direction })),
        interactables: snapshot.forNarration.canInteract.map(o => ({ type: o.type, actions: o.actions }))
      };
    }

    // AI已配置时，优先使用AI生成叙事
    if (typeof AIDM !== 'undefined' && AIDM.isConfigured()) {
      try {
        const context = {
          history: narrativeHistory.slice(-10),
          scene: scene ? scene.name : '未知',
          playerHP: player?.derived?.hp,
          playerSAN: player?.derived?.san,
          inventory: worldState.inventory,
          // 感知约束：AI只能描述可见/可提示的对象
          perception: perceptionContext
        };
        const aiResult = await AIDM.generateNarration(text, context);
        if (aiResult) {
          narrativeHistory.push({ turn: worldState.turnCount++, action: text, narration: aiResult.narration, time: Date.now() });
          return { narration: aiResult.narration, choices: aiResult.choices || [], combat: false, fromAI: true };
        }
      } catch (err) {
        console.warn('AI narration failed, falling back to keywords:', err);
      }
    }

    // 降级：关键词匹配
    return processFreeInputFallback(text, player, scene);
  }

  // 关键词匹配降级
  function processFreeInputFallback(text, player, scene) {
    const keywords = {
      '调查': { skill: '侦查', narration: '你仔细观察周围的环境...' },
      '搜索': { skill: '侦查', narration: '你开始搜索这个区域...' },
      '查看': { skill: '侦查', narration: '你仔细查看...' },
      '观察': { skill: '侦查', narration: '你仔细观察周围...' },
      '检查': { skill: '侦查', narration: '你检查了一下...' },
      '寻找': { skill: '侦查', narration: '你开始寻找...' },
      '翻找': { skill: '侦查', narration: '你翻找着...' },
      '聆听': { skill: '聆听', narration: '你屏住呼吸，仔细聆听...' },
      '听': { skill: '聆听', narration: '你竖起耳朵倾听...' },
      '倾听': { skill: '聆听', narration: '你侧耳倾听...' },
      '阅读': { skill: '其他语言', narration: '你尝试阅读上面的文字...' },
      '读': { skill: '其他语言', narration: '你阅读上面的内容...' },
      '研究': { skill: '图书馆使用', narration: '你仔细研究...' },
      '翻阅': { skill: '图书馆使用', narration: '你翻阅着...' },
      '打开': { skill: '锁匠', narration: '你尝试打开它...' },
      '开锁': { skill: '锁匠', narration: '你尝试开锁...' },
      '解锁': { skill: '锁匠', narration: '你尝试解锁...' },
      '说服': { skill: '说服', narration: '你试图说服对方...' },
      '劝说': { skill: '说服', narration: '你试图劝说...' },
      '交涉': { skill: '说服', narration: '你尝试交涉...' },
      '恐吓': { skill: '恐吓', narration: '你摆出威胁的姿态...' },
      '威胁': { skill: '恐吓', narration: '你威胁道...' },
      '魅惑': { skill: '魅惑', narration: '你施展魅力...' },
      '骗': { skill: '话术', narration: '你试图欺骗...' },
      '撒谎': { skill: '话术', narration: '你编造了一个谎言...' },
      '潜行': { skill: '潜行', narration: '你悄悄地移动...' },
      '偷偷': { skill: '潜行', narration: '你偷偷地行动...' },
      '躲': { skill: '潜行', narration: '你试图躲藏...' },
      '隐藏': { skill: '潜行', narration: '你找地方隐藏自己...' },
      '跟踪': { skill: '追踪', narration: '你悄悄跟踪...' },
      '准备': { skill: null, narration: '你做好准备，随时应对危险...' },
      '警戒': { skill: '聆听', narration: '你提高警惕，注意周围的动静...' },
      '逃跑': { skill: null, narration: '你转身就跑！' },
      '撤退': { skill: null, narration: '你决定撤退...' },
      '急救': { skill: '急救', narration: '你进行急救处理...' },
      '治疗': { skill: '急救', narration: '你尝试治疗伤势...' },
      '包扎': { skill: '急救', narration: '你包扎伤口...' },
      '施法': { skill: '神秘学', narration: '你尝试施展咒语...' },
      '念咒': { skill: '神秘学', narration: '你低声念诵咒文...' },
      '祈祷': { skill: '神秘学', narration: '你默默祈祷...' }
    };

    const sortedKeys = Object.keys(keywords).sort((a, b) => b.length - a.length);
    for (const kw of sortedKeys) {
      if (text.includes(kw)) {
        const data = keywords[kw];
        if (!data.skill) {
          narrativeHistory.push({ turn: worldState.turnCount++, action: text, narration: data.narration, time: Date.now() });
          const sceneChoices = scene?.choices || [];
          for (const choice of sceneChoices) {
            if (text.includes(choice.text.replace(/[()（）]/g, '').substring(0, 2))) return processChoice(choice.action);
          }
          return { narration: data.narration, choices: getChoices(), combat: false };
        }
        const skillValue = player.skills[data.skill] || CoCRules.calcSkillBase(data.skill, player.stats);
        const check = CoCRules.rollCheck(skillValue);
        let narration = data.narration + `\n[${data.skill}检定: ${check.roll}/${skillValue} → ${check.result}]`;
        if (check.isSuccess) {
          narration += '\n' + (getSceneDiscovery(scene, data.skill) || '你有所发现！');
        } else {
          narration += '\n' + getFailureText(data.skill);
        }
        narrativeHistory.push({ turn: worldState.turnCount++, action: text, narration, time: Date.now() });
        return { narration, choices: getChoices(), combat: false };
      }
    }

    // 尝试匹配场景选项
    if (scene && scene.choices) {
      for (const choice of scene.choices) {
        const choiceText = choice.text.replace(/[()（）]/g, '');
        if (text.includes(choiceText) || choiceText.includes(text)) return processChoice(choice.action);
      }
    }

    // 默认回应
    const defaults = scene ? [
      `你在这个${scene.name}中犹豫了一下，不确定该怎么做。也许可以试试调查周围的环境？`,
      `你思考了片刻。在这个${scene.name}中，也许应该更仔细地观察。`,
      `你尝试了，但似乎没有什么效果。试试查看周围的物品？`,
      `你环顾${scene.name}，寻找可以互动的事物。`
    ] : ['你思考了一下，但不确定该怎么做。', '这个想法似乎不太可行。', '你尝试了，但没有什么特别的事情发生。', '也许换个方式会更好。'];
    const narration = defaults[Math.floor(Math.random() * defaults.length)];
    narrativeHistory.push({ turn: worldState.turnCount++, action: text, narration, time: Date.now() });
    return { narration, choices: getChoices(), combat: false };
  }

  function getSceneDiscovery(scene, skill) {
    if (!scene) return null;
    const discoveries = {
      'arrival': { '侦查': '你注意到桌上的信件似乎被人动过，上面有隐约的指纹痕迹。', '聆听': '你听到了楼上传来微弱的脚步声...', '图书馆使用': '书架上的书排列整齐，但有一本被抽出来过。', 'default': '你注意到了一些之前忽略的细节。' },
      'corridor': { '侦查': '墙壁上的划痕引起了你的注意——似乎有人在这里挣扎过。', '聆听': '远处传来了低沉的吟唱声，令人不寒而栗。', 'default': '走廊里似乎隐藏着什么。' },
      'library': { '侦查': '日记旁边有一张折叠的纸条，上面写着奇怪的符号。', '图书馆使用': '你发现书架间有一本与众不同的书——它的封面上刻着奇怪的符文。', 'default': '图书馆中似乎还有未被发现的秘密。' },
      'basement': { '侦查': '祭坛周围的地面有暗红色的痕迹，空气中弥漫着铁锈的气味。', '聆听': '你听到了水滴声...不，那是某种低沉的呼吸声。', '神秘学': '祭坛上的符文你认出了几个——这是召唤仪式的一部分！', 'default': '地下室中隐藏着危险。' },
      'ritual_room': { '侦查': '你注意到祭坛上的符文在微微发光！仪式似乎正在进行中。', '神秘学': '这些符文...这是召唤旧日支配者的仪式！必须立刻阻止！', 'default': '仪式室中充满了不祥的气息。' }
    };
    const sceneDisc = discoveries[scene.id];
    return sceneDisc ? (sceneDisc[skill] || sceneDisc['default']) : null;
  }

  function getFailureText(skill) {
    const failures = {
      '侦查': '你仔细观察了一番，但没有发现什么特别的东西。',
      '聆听': '你竖起耳朵，但只听到了自己的心跳声。',
      '图书馆使用': '你翻阅了半天，但没有找到有用的信息。',
      '锁匠': '锁太复杂了，你无法打开它。',
      '说服': '对方不为所动。',
      '恐吓': '你的威胁似乎没有起到效果。',
      '话术': '你的谎言没有骗过对方。',
      '潜行': '你发出了声响，可能引起了注意...',
      '急救': '你的处理不够专业，效果有限。',
      '神秘学': '你对这些神秘符号一知半解，无法理解其含义。',
      '魅惑': '你的魅力没有打动对方。'
    };
    return failures[skill] || '你一无所获。';
  }

  // ========== 场景事件联动 ==========
  // 叙事事件触发3D场景变化
  function applyNarrativeEffect(effect) {
    if (!effect) return;
    if (typeof SceneManager === 'undefined') return;

    // 灯光闪烁
    if (effect.flicker) {
      SceneManager.flickerLights && SceneManager.flickerLights(effect.flicker.duration || 2000);
    }
    // 改变雾密度
    if (effect.fogDensity !== undefined) {
      SceneManager.setFogDensity && SceneManager.setFogDensity(effect.fogDensity);
    }
    // 改变灯光颜色
    if (effect.lightColor !== undefined) {
      SceneManager.setLightColor && SceneManager.setLightColor(effect.lightColor);
    }
    // 改变灯光强度
    if (effect.lightIntensity !== undefined) {
      SceneManager.setLightIntensity && SceneManager.setLightIntensity(effect.lightIntensity);
    }
    // 添加/移除场景对象
    if (effect.addObject) {
      SceneManager.placeObject && SceneManager.placeObject(effect.addObject);
    }
    if (effect.removeObjectAt) {
      SceneManager.removeObjectAt && SceneManager.removeObjectAt(effect.removeObjectAt.x, effect.removeObjectAt.z);
    }
  }

  // ========== 查询与持久化 ==========
  function getWorldState() { return worldState; }
  function getHistory() { return narrativeHistory; }
  function getPlotState() { return plotState; }
  function getInventory() { return worldState.inventory || []; }
  function getScenarioList() { return Object.keys(SCENARIOS).map(k => ({ id: k, ...SCENARIOS[k] })); }

  function saveState() {
    return { worldState, narrativeHistory, facts, npcStates, plotState, actionPoints, dynamicScenario };
  }

  function loadState(data) {
    if (!data) return;
    worldState = data.worldState || {};
    narrativeHistory = data.narrativeHistory || [];
    facts = data.facts || [];
    npcStates = data.npcStates || {};
    plotState = data.plotState || 'intro';
    if (data.actionPoints) actionPoints = { ...actionPoints, ...data.actionPoints };
    if (data.dynamicScenario) dynamicScenario = data.dynamicScenario;
  }

  return {
    SCENARIOS,
    initWorld, initWorldWithScenario,
    processChoice, processFreeInput,
    getCurrentScene, getNarration, getChoices,
    getWorldState, getHistory, getPlotState,
    getInventory, getScenarioList,
    getAP, consumeAP, resetAP, setAPMax,
    generateScenarioFromSurvey,
    applyNarrativeEffect,
    addFact, getFacts, validateNarration,
    saveState, loadState
  };
})();
