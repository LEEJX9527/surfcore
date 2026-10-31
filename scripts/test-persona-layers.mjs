// 人格卡分层：核心/场景/日常的组合、平台选择、预算与 v1/v2 小节过滤。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { composePersonaLayers, personaSceneFromKey } from '../src/persona-layers.js';

assert.equal(personaSceneFromKey('group:123'), 'qq-group');
assert.equal(personaSceneFromKey('private:123'), 'qq-private');
assert.equal(personaSceneFromKey('', 'bili'), 'bili');
assert.equal(personaSceneFromKey('', 'pet'), 'pet');
assert.equal(personaSceneFromKey(''), '');

// 只有核心：保持旧行为，不加标题。
{
  const r = composePersonaLayers({ core: '# 角色\n核心内容', maxChars: 6000 });
  assert.equal(r.text, '# 角色\n核心内容');
  assert.equal(r.chars, r.text.length);
}

// 三层顺序：核心 → 场景 → 日常。
{
  const r = composePersonaLayers({
    core: 'CORE',
    scene: 'SCENE',
    daily: 'DAILY',
    sceneId: 'qq-group',
    maxChars: 6000,
  });
  assert.ok(r.text.indexOf('CORE') < r.text.indexOf('SCENE'));
  assert.ok(r.text.indexOf('SCENE') < r.text.indexOf('DAILY'));
  assert.ok(r.text.includes('【人格核心】'));
  assert.ok(r.text.includes('【场景人格｜QQ 群聊】'));
  assert.ok(r.text.includes('【人格日常】'));
}

// 预算：核心优先，场景次之，日常最后；应能看出 daily 被裁掉。
{
  const r = composePersonaLayers({
    core: 'C'.repeat(20),
    scene: 'S'.repeat(20),
    daily: 'D'.repeat(20),
    sceneId: 'bili',
    maxChars: 70,
  });
  assert.ok(r.text.includes('C'.repeat(20)), '核心必须保留');
  assert.ok(r.text.includes('S'.repeat(20)), '场景优先于日常');
  assert.ok(!r.text.includes('D'.repeat(20)), '日常应被裁');
  assert.ok(r.truncated);
}

// v1/v2 小节过滤仍然生效。
{
  const core = '共同\n\n## 一代专用 〔一代〕\n一代内容\n\n## 二代专用 〔二代〕\n二代内容';
  const v1 = composePersonaLayers({ core, mode: 'v1', maxChars: 6000 }).text;
  const v2 = composePersonaLayers({ core, mode: 'v2', maxChars: 6000 }).text;
  assert.ok(v1.includes('一代内容') && !v1.includes('二代内容'));
  assert.ok(v2.includes('二代内容') && !v2.includes('一代内容'));
}

// 身份底座：tone 模式也必须带“我是谁、主人是谁”。
const identityCompose = composePersonaLayers({ core: '核心XYZ', tone: '语气ABC', identity: '你是小咪；你的主人是主人。', personaMode: 'tone', mode: 'v2', maxChars: 6000 });
assert.ok(identityCompose.text.includes('你是小咪') && identityCompose.text.includes('主人'));
assert.ok(!identityCompose.text.includes('核心XYZ'), 'tone 模式仍不能加载核心正文');

// tone 模式：只语气+场景+日常，不带核心；full 才带核心。
const toneCompose = composePersonaLayers({ core: '核心XYZ', tone: '语气ABC', daily: '日常DEF', personaMode: 'tone', mode: 'v2', maxChars: 6000 });
assert.ok(toneCompose.text.includes('语气ABC'));
assert.ok(!toneCompose.text.includes('核心XYZ'), 'tone 模式不能加载核心');
const fullCompose = composePersonaLayers({ core: '核心XYZ', tone: '语气ABC', daily: '日常DEF', personaMode: 'full', mode: 'v2', maxChars: 6000 });
assert.ok(fullCompose.text.includes('核心XYZ') && fullCompose.text.includes('语气ABC'));
const fallbackCompose = composePersonaLayers({ core: '旧角色核心', personaMode: 'tone', mode: 'v2', maxChars: 6000 });
assert.ok(fallbackCompose.text.includes('旧角色核心'), '旧角色没有语气时回退核心，避免没卡');

// 三个注入点都必须走同一套分层逻辑，不能在 UI 分层后桥接仍读单卡。
const bridge = fs.readFileSync(path.resolve('src/bridge.js'), 'utf8');
const scheduler = fs.readFileSync(path.resolve('plugins/surfcore/lib/scheduler.js'), 'utf8');
const pet = fs.readFileSync(path.resolve('plugins/surfcore/lib/pet-chat.js'), 'utf8');
for (const [name, src] of [['bridge', bridge], ['scheduler', scheduler], ['pet', pet]]) {
  assert.ok(src.includes('composePersonaLayers'), `${name} 没有接人格分层组合`);
  assert.ok(src.includes('readPersonaLayerText'), `${name} 没有读人格分层文件`);
}
assert.ok(bridge.includes('currentRoleHintV2(key, personaMode)'), 'QQ qq_get_prompt 必须按会话 key + 人格模式选场景');
assert.ok(bridge.includes('currentRoleHint(key, personaMode)'), 'QQ 角色提示必须按会话 key + 人格模式选场景');
assert.ok(bridge.includes('personaSceneFromKey'), 'QQ 没有按群聊/私聊选择场景');

console.log('✅ 人格卡分层通过');
