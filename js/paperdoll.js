/**
 * 纸娃娃系统 - SVG路径组件库 + Canvas渲染
 * 零AI成本，纯代码生成角色肖像
 */

const PaperDoll = (() => {
  // ========== 组件库 ==========
  const PARTS = {
    hair: [
      { name: '短发', paths: [
        'M90,60 Q100,40 110,60 L115,80 Q100,70 85,80 Z',
        'M85,80 Q100,75 115,80 L115,85 Q100,82 85,85 Z'
      ], color: '#2a1a0a' },
      { name: '长发', paths: [
        'M85,55 Q100,35 115,55 L120,90 Q118,120 110,140 Q100,145 90,140 Q82,120 80,90 Z',
        'M80,90 Q100,85 120,90 L118,95 Q100,90 82,95 Z'
      ], color: '#1a0a00' },
      { name: '卷发', paths: [
        'M82,60 Q90,38 100,35 Q110,38 118,60 Q125,70 120,85 Q115,75 108,80 Q100,72 92,80 Q85,75 80,85 Q75,70 82,60 Z',
        'M80,85 Q100,80 120,85 Q122,95 118,100 Q100,92 82,100 Q78,95 80,85 Z'
      ], color: '#3a2010' },
      { name: '马尾', paths: [
        'M88,58 Q100,40 112,58 L115,80 Q100,72 85,80 Z',
        'M110,65 Q120,60 125,70 Q128,90 122,120 Q118,130 115,125 Q120,100 118,80 Q115,70 110,75 Z'
      ], color: '#2a1a0a' },
      { name: '光头', paths: [
        'M88,62 Q100,50 112,62 Q116,68 115,78 Q100,74 85,78 Q84,68 88,62 Z'
      ], color: '#d4a574' },
      { name: '莫西干', paths: [
        'M95,55 L100,25 L105,55 Q108,60 108,75 Q100,70 92,75 Q92,60 95,55 Z',
        'M92,75 Q100,72 108,75 L108,80 Q100,77 92,80 Z'
      ], color: '#1a1a2e' },
      { name: '双马尾', paths: [
        'M88,58 Q100,40 112,58 L115,80 Q100,72 85,80 Z',
        'M82,65 Q72,60 68,75 Q65,100 70,130 Q75,135 78,128 Q74,100 76,80 Q78,70 82,72 Z',
        'M118,65 Q128,60 132,75 Q135,100 130,130 Q125,135 122,128 Q126,100 124,80 Q122,70 118,72 Z'
      ], color: '#2a1a0a' },
      { name: '丸子头', paths: [
        'M88,58 Q100,40 112,58 L115,80 Q100,72 85,80 Z',
        'M92,50 Q100,25 108,50 Q110,60 105,65 Q100,55 95,65 Q90,60 92,50 Z'
      ], color: '#1a0a00' },
      { name: '侧分', paths: [
        'M82,55 Q100,35 118,55 L122,85 Q120,80 115,78 Q100,72 85,78 L80,85 Q78,70 82,55 Z',
        'M118,55 Q130,60 128,90 Q125,85 120,82 L115,78 Q118,68 118,55 Z'
      ], color: '#3a2010' },
      { name: '波波头', paths: [
        'M82,55 Q100,35 118,55 L122,85 Q122,110 115,120 Q100,125 85,120 Q78,110 78,85 Z',
        'M78,85 Q100,80 122,85 L122,90 Q100,85 78,90 Z'
      ], color: '#2a1a0a' },
      { name: '大背头', paths: [
        'M82,58 Q100,38 118,58 L120,70 Q100,65 80,70 Z',
        'M80,70 Q100,66 120,70 L118,78 Q100,74 82,78 Z'
      ], color: '#1a0a00' },
      { name: '脏辫', paths: [
        'M85,58 Q100,40 115,58 L118,80 Q100,72 82,80 Z',
        'M85,80 L80,130 Q78,135 82,138 L84,130 L88,82 Z',
        'M95,78 L92,135 Q90,140 94,142 L96,135 L98,80 Z',
        'M105,78 L108,135 Q110,140 106,142 L104,135 L102,80 Z',
        'M115,80 L120,130 Q122,135 118,138 L116,130 L112,82 Z'
      ], color: '#1a0a00' },
      { name: '刘海', paths: [
        'M85,55 Q100,35 115,55 L118,85 Q100,78 82,85 Z',
        'M82,55 Q90,50 100,55 Q95,65 82,70 Z',
        'M85,85 Q100,80 115,85 L115,90 Q100,86 85,90 Z'
      ], color: '#2a1a0a' },
      { name: '中分', paths: [
        'M82,55 Q100,35 118,55 L120,85 Q100,78 80,85 Z',
        'M98,40 L100,80',
        'M80,85 Q100,80 120,85 L120,90 Q100,86 80,90 Z'
      ], color: '#1a0a00' },
      { name: '刺猬头', paths: [
        'M88,60 L85,35 L92,55 L95,30 L100,52 L105,28 L108,55 L115,35 L112,60 Q100,50 88,60 Z',
        'M88,60 Q100,55 112,60 L114,80 Q100,74 86,80 Z'
      ], color: '#cc3333' },
      { name: '精灵短发', paths: [
        'M85,55 Q100,35 115,55 L118,80 Q100,72 82,80 Z',
        'M115,60 L125,55 L128,70 L120,75 Z',
        'M118,75 L130,72 L132,88 L120,85 Z'
      ], color: '#c9a04e' },
      { name: '公主卷', paths: [
        'M82,55 Q100,35 118,55 L122,85 Q122,110 118,130 Q115,140 110,135 Q112,115 112,90 Q100,80 88,90 Q88,115 90,135 Q85,140 82,130 Q78,110 78,85 Z',
        'M78,85 Q100,80 122,85 L122,90 Q100,86 78,90 Z'
      ], color: '#3a2010' },
      { name: '军装头', paths: [
        'M86,58 Q100,42 114,58 L116,75 Q100,70 84,75 Z',
        'M84,75 Q100,71 116,75 L115,80 Q100,77 85,80 Z'
      ], color: '#1a1a1a' },
      { name: '朋克', paths: [
        'M85,60 Q100,40 115,60 L118,80 Q100,72 82,80 Z',
        'M90,55 L85,15 L95,50 Z',
        'M100,50 L100,10 L105,48 Z',
        'M110,55 L115,15 L108,50 Z'
      ], color: '#8833cc' },
      { name: '古典盘发', paths: [
        'M85,58 Q100,40 115,58 L118,80 Q100,72 82,80 Z',
        'M90,45 Q100,20 110,45 Q112,55 108,60 Q100,48 92,60 Q88,55 90,45 Z'
      ], color: '#1a0a00' }
    ],

    face: [
      { name: '圆脸', shape: 'ellipse', rx: 22, ry: 26 },
      { name: '方脸', shape: 'rect', w: 44, h: 50, r: 6 },
      { name: '瓜子脸', shape: 'ellipse', rx: 20, ry: 28 },
      { name: '长脸', shape: 'ellipse', rx: 18, ry: 30 },
      { name: '宽脸', shape: 'ellipse', rx: 26, ry: 24 },
      { name: '菱形脸', shape: 'diamond', w: 44, h: 52 },
      { name: '心形脸', shape: 'heart', w: 44, h: 52 },
      { name: '鹅蛋脸', shape: 'ellipse', rx: 21, ry: 27 }
    ],

    expression: [
      { name: '平静', eyes: 'normal', mouth: 'neutral' },
      { name: '严肃', eyes: 'narrow', mouth: 'frown' },
      { name: '微笑', eyes: 'normal', mouth: 'smile' },
      { name: '惊恐', eyes: 'wide', mouth: 'o' },
      { name: '愤怒', eyes: 'angry', mouth: 'frown' }
    ],

    outfit: [
      { name: '风衣', body: 'trench', color: '#4a3a2a' },
      { name: '西装', body: 'suit', color: '#2a2a3a' },
      { name: '实验室白大褂', body: 'labcoat', color: '#ddd' },
      { name: '牧师袍', body: 'robe', color: '#1a1a2a' },
      { name: '军装', body: 'military', color: '#3a4a2a' },
      { name: '皮夹克', body: 'jacket', color: '#2a1a0a' },
      { name: '侦探服', body: 'detective', color: '#3a3020' },
      { name: '护士服', body: 'nurse', color: '#eef' },
      { name: '学者袍', body: 'scholar', color: '#2a1a3a' },
      { name: '探险装', body: 'explorer', color: '#5a4a2a' }
    ],

    skinTones: ['#f5d0a9', '#e8b88a', '#d4a574', '#c09060', '#8b6b4a', '#5a3a2a']
  };

  // ========== 当前选择状态 ==========
  let state = {
    hair: 0,
    face: 0,
    expr: 0,
    outfit: 0,
    skinTone: 0
  };

  // ========== 渲染引擎 ==========
  function render(canvas, customState) {
    const s = customState || state;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;

    ctx.clearRect(0, 0, w, h);

    const scale = Math.min(w / 300, h / 400);
    ctx.save();
    ctx.translate(cx, 0);
    ctx.scale(scale, scale);

    // 身体
    drawBody(ctx, s);
    // 脖子
    drawNeck(ctx, s);
    // 头部
    drawHead(ctx, s);
    // 头发
    drawHair(ctx, s);
    // 面部
    drawFace(ctx, s);
    // 服装细节
    drawOutfitDetails(ctx, s);

    ctx.restore();
  }

  function drawBody(ctx, s) {
    const outfit = PARTS.outfit[s.outfit];
    const skin = PARTS.skinTones[s.skinTone] || PARTS.skinTones[0];

    // 身体轮廓
    ctx.fillStyle = outfit.color;
    ctx.beginPath();
    ctx.moveTo(-40, 200);
    ctx.quadraticCurveTo(-50, 250, -45, 380);
    ctx.lineTo(45, 380);
    ctx.quadraticCurveTo(50, 250, 40, 200);
    ctx.closePath();
    ctx.fill();

    // 手臂
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(-40, 210);
    ctx.quadraticCurveTo(-55, 220, -58, 280);
    ctx.quadraticCurveTo(-56, 290, -50, 290);
    ctx.quadraticCurveTo(-48, 280, -42, 220);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(40, 210);
    ctx.quadraticCurveTo(55, 220, 58, 280);
    ctx.quadraticCurveTo(56, 290, 50, 290);
    ctx.quadraticCurveTo(48, 280, 42, 220);
    ctx.closePath();
    ctx.fill();
  }

  function drawNeck(ctx, s) {
    const skin = PARTS.skinTones[s.skinTone] || PARTS.skinTones[0];
    ctx.fillStyle = skin;
    ctx.fillRect(-10, 170, 20, 30);
  }

  function drawHead(ctx, s) {
    const skin = PARTS.skinTones[s.skinTone] || PARTS.skinTones[0];
    const face = PARTS.face[s.face];
    ctx.fillStyle = skin;

    ctx.beginPath();
    if (face.shape === 'ellipse') {
      ctx.ellipse(0, 120, face.rx, face.ry, 0, 0, Math.PI * 2);
    } else if (face.shape === 'rect') {
      roundRect(ctx, -face.w/2, 120 - face.h/2, face.w, face.h, face.r);
    } else if (face.shape === 'diamond') {
      ctx.moveTo(0, 120 - face.h/2);
      ctx.lineTo(face.w/2, 120);
      ctx.lineTo(0, 120 + face.h/2);
      ctx.lineTo(-face.w/2, 120);
      ctx.closePath();
    } else if (face.shape === 'heart') {
      ctx.moveTo(0, 120 + face.h/2);
      ctx.bezierCurveTo(-face.w/2, 120 + face.h/4, -face.w/2, 120 - face.h/4, 0, 120 - face.h/3);
      ctx.bezierCurveTo(face.w/2, 120 - face.h/4, face.w/2, 120 + face.h/4, 0, 120 + face.h/2);
    }
    ctx.fill();

    // 耳朵
    ctx.beginPath();
    ctx.ellipse(-face.rx || -22, 120, 5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse((face.rx || 22), 120, 5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHair(ctx, s) {
    const hair = PARTS.hair[s.hair];
    ctx.fillStyle = hair.color;
    ctx.strokeStyle = hair.color;
    ctx.lineWidth = 1;

    hair.paths.forEach(pathStr => {
      ctx.beginPath();
      // 简易路径解析 - 将路径坐标偏移到头部中心(0, 120)
      const adjustedPath = pathStr.replace(/(\d+)/g, (match, offset) => {
        return match;
      });
      // 直接用SVG路径绘制（简化版，手动偏移）
      drawAdjustedPath(ctx, pathStr, 0, 60);
      ctx.fill();
    });
  }

  function drawAdjustedPath(ctx, pathStr, ox, oy) {
    // 解析SVG路径命令并偏移
    const commands = pathStr.match(/[MLQHCZ][^MLQHCZ]*/gi);
    if (!commands) return;

    commands.forEach(cmd => {
      const type = cmd[0];
      const nums = cmd.slice(1).trim().split(/[\s,]+/).map(Number);
      
      switch(type) {
        case 'M':
          ctx.moveTo(nums[0] + ox, nums[1] + oy);
          break;
        case 'L':
          ctx.lineTo(nums[0] + ox, nums[1] + oy);
          break;
        case 'Q':
          ctx.quadraticCurveTo(nums[0] + ox, nums[1] + oy, nums[2] + ox, nums[3] + oy);
          break;
        case 'C':
          ctx.bezierCurveTo(nums[0] + ox, nums[1] + oy, nums[2] + ox, nums[3] + oy, nums[4] + ox, nums[5] + oy);
          break;
        case 'Z':
          ctx.closePath();
          break;
      }
    });
  }

  function drawFace(ctx, s) {
    const expr = PARTS.expression[s.expr];
    const skin = PARTS.skinTones[s.skinTone] || PARTS.skinTones[0];

    // 眼睛
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;

    if (expr.eyes === 'normal') {
      // 白底
      ctx.beginPath(); ctx.ellipse(-10, 115, 6, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(10, 115, 6, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // 瞳孔
      ctx.fillStyle = '#2a1a0a';
      ctx.beginPath(); ctx.arc(-10, 115, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(10, 115, 3, 0, Math.PI * 2); ctx.fill();
    } else if (expr.eyes === 'narrow') {
      ctx.beginPath(); ctx.moveTo(-16, 115); ctx.lineTo(-4, 115); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, 115); ctx.lineTo(16, 115); ctx.stroke();
      ctx.fillStyle = '#2a1a0a';
      ctx.beginPath(); ctx.arc(-10, 115, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(10, 115, 2, 0, Math.PI * 2); ctx.fill();
    } else if (expr.eyes === 'wide') {
      ctx.beginPath(); ctx.ellipse(-10, 115, 7, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(10, 115, 7, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a1a0a';
      ctx.beginPath(); ctx.arc(-10, 116, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(10, 116, 4, 0, Math.PI * 2); ctx.fill();
    } else if (expr.eyes === 'angry') {
      // 怒眉
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-16, 108); ctx.lineTo(-5, 111); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, 108); ctx.lineTo(5, 111); ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(-10, 115, 6, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(10, 115, 6, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a1a0a';
      ctx.beginPath(); ctx.arc(-10, 115, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(10, 115, 3, 0, Math.PI * 2); ctx.fill();
    }

    // 鼻子
    ctx.strokeStyle = adjustColor(skin, -30);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 118);
    ctx.lineTo(-2, 126);
    ctx.lineTo(2, 126);
    ctx.stroke();

    // 嘴巴
    ctx.strokeStyle = '#8a4a3a';
    ctx.lineWidth = 1.5;
    if (expr.mouth === 'neutral') {
      ctx.beginPath(); ctx.moveTo(-6, 134); ctx.lineTo(6, 134); ctx.stroke();
    } else if (expr.mouth === 'smile') {
      ctx.beginPath(); ctx.moveTo(-7, 132); ctx.quadraticCurveTo(0, 140, 7, 132); ctx.stroke();
    } else if (expr.mouth === 'frown') {
      ctx.beginPath(); ctx.moveTo(-7, 136); ctx.quadraticCurveTo(0, 130, 7, 136); ctx.stroke();
    } else if (expr.mouth === 'o') {
      ctx.fillStyle = '#5a2a1a';
      ctx.beginPath(); ctx.ellipse(0, 134, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawOutfitDetails(ctx, s) {
    const outfit = PARTS.outfit[s.outfit];
    ctx.strokeStyle = adjustColor(outfit.color, -20);
    ctx.lineWidth = 1;

    switch(outfit.body) {
      case 'trench':
        // 风衣领子
        ctx.fillStyle = adjustColor(outfit.color, -15);
        ctx.beginPath();
        ctx.moveTo(-15, 185); ctx.lineTo(-25, 195); ctx.lineTo(-10, 200);
        ctx.lineTo(0, 190); ctx.lineTo(10, 200); ctx.lineTo(25, 195);
        ctx.lineTo(15, 185); ctx.closePath(); ctx.fill();
        // 纽扣
        ctx.fillStyle = '#8a7a5a';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath(); ctx.arc(0, 210 + i * 25, 2, 0, Math.PI * 2); ctx.fill();
        }
        break;
      case 'suit':
        // 领带
        ctx.fillStyle = '#8a1a1a';
        ctx.beginPath();
        ctx.moveTo(-3, 190); ctx.lineTo(3, 190); ctx.lineTo(4, 220);
        ctx.lineTo(0, 225); ctx.lineTo(-4, 220); ctx.closePath(); ctx.fill();
        // 西装翻领
        ctx.fillStyle = adjustColor(outfit.color, -10);
        ctx.beginPath(); ctx.moveTo(-15, 185); ctx.lineTo(-20, 200); ctx.lineTo(-5, 200); ctx.lineTo(0, 188); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(15, 185); ctx.lineTo(20, 200); ctx.lineTo(5, 200); ctx.lineTo(0, 188); ctx.closePath(); ctx.fill();
        break;
      case 'labcoat':
        // 白大褂口袋
        ctx.strokeStyle = '#bbb';
        ctx.strokeRect(-30, 250, 15, 12);
        ctx.strokeRect(15, 250, 15, 12);
        break;
      case 'robe':
        // 牧师十字
        ctx.strokeStyle = '#c9a04e';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 200); ctx.lineTo(0, 230); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-8, 215); ctx.lineTo(8, 215); ctx.stroke();
        break;
      case 'military':
        // 肩章
        ctx.fillStyle = '#c9a04e';
        ctx.fillRect(-42, 205, 12, 4);
        ctx.fillRect(30, 205, 12, 4);
        // 勋章
        ctx.beginPath(); ctx.arc(-20, 220, 3, 0, Math.PI * 2); ctx.fill();
        break;
      case 'detective':
        // 侦探领
        ctx.fillStyle = adjustColor(outfit.color, -10);
        ctx.beginPath(); ctx.moveTo(-12, 185); ctx.lineTo(-18, 198); ctx.lineTo(0, 195); ctx.lineTo(18, 198); ctx.lineTo(12, 185); ctx.closePath(); ctx.fill();
        break;
      case 'nurse':
        // 护士十字
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(-2, 210, 4, 12);
        ctx.fillRect(-6, 214, 12, 4);
        break;
      case 'scholar':
        // 学者围巾
        ctx.fillStyle = '#6a2a4a';
        ctx.beginPath(); ctx.moveTo(-20, 190); ctx.quadraticCurveTo(0, 200, 20, 190);
        ctx.quadraticCurveTo(0, 205, -20, 195); ctx.closePath(); ctx.fill();
        break;
      case 'explorer':
        // 探险多口袋
        ctx.strokeStyle = adjustColor(outfit.color, -20);
        ctx.strokeRect(-25, 240, 12, 10);
        ctx.strokeRect(13, 240, 12, 10);
        ctx.strokeRect(-8, 270, 16, 10);
        // 腰带
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(-42, 235, 84, 5);
        // 扣
        ctx.fillStyle = '#c9a04e';
        ctx.beginPath(); ctx.arc(0, 237, 3, 0, Math.PI * 2); ctx.fill();
        break;
    }
  }

  // ========== 工具函数 ==========
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function adjustColor(hex, amount) {
    if (!hex || typeof hex !== 'string') return '#888888';
    const num = parseInt(hex.replace('#', ''), 16);
    let r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
    let g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
    let b = Math.min(255, Math.max(0, (num & 0xff) + amount));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // ========== API ==========
  return {
    PARTS,
    state,
    render,

    cycle(part, dir) {
      const max = part === 'hair' ? PARTS.hair.length :
                  part === 'face' ? PARTS.face.length :
                  part === 'expr' ? PARTS.expression.length :
                  PARTS.outfit.length;
      state[part] = (state[part] + dir + max) % max;
      return state[part];
    },

    getLabel(part) {
      const idx = state[part];
      switch(part) {
        case 'hair': return PARTS.hair[idx].name;
        case 'face': return PARTS.face[idx].name;
        case 'expr': return PARTS.expression[idx].name;
        case 'outfit': return PARTS.outfit[idx].name;
      }
    },

    getState() { return { ...state }; },

    setState(s) { Object.assign(state, s); },

    // 生成小头像用于HUD
    renderMini(canvas) {
      render(canvas, state);
    }
  };
})();
