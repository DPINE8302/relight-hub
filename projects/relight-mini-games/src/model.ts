export const objects = [
  { id: 'camera', label: 'กล้อง', action: 'เก็บมุมมองของคุณ', symbol: '📷' },
  { id: 'drums', label: 'กลอง', action: 'ให้ห้องมีจังหวะ', symbol: '🥁' },
  { id: 'ball', label: 'บาสเกตบอล', action: 'เล่นในจังหวะของคุณ', symbol: '🏀' },
  { id: 'sketch', label: 'สมุดวาด', action: 'เติมไอเดียลงบนกระดาษ', symbol: '🎨' },
  { id: 'plant', label: 'ต้นไม้', action: 'เว้นที่ให้สิ่งเล็ก ๆ เติบโต', symbol: '🪴' },
  { id: 'headphones', label: 'หูฟัง', action: 'เปิดโลกของเสียง', symbol: '🎧' },
] as const;
export type ObjectId = typeof objects[number]['id'];
export type Slots = [ObjectId | null, ObjectId | null, ObjectId | null];
export type StudioState = { slots: Slots; history: Slots[] };
export const initialStudio: StudioState = { slots: [null, null, null], history: [] };
export type StudioAction = { type: 'place'; id: ObjectId; slot: number } | { type: 'remove'; slot: number } | { type: 'undo' } | { type: 'reset' };
export function validSlots(value: unknown): value is Slots {
  return Array.isArray(value) && value.length === 3 && value.every(x => x === null || objects.some(o => o.id === x)) && new Set(value.filter(Boolean)).size === value.filter(Boolean).length;
}
export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  if (action.type === 'reset') return initialStudio;
  if (action.type === 'undo') return state.history.length ? { slots: state.history.at(-1)!, history: state.history.slice(0, -1) } : state;
  if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot > 2) return state;
  const slots = [...state.slots] as Slots;
  if (action.type === 'remove') slots[action.slot] = null;
  else {
    if (!objects.some(o => o.id === action.id)) return state;
    const old = slots.indexOf(action.id);
    if (old >= 0) slots[old] = null;
    slots[action.slot] = action.id;
  }
  return slots.every((x, i) => x === state.slots[i]) ? state : { slots, history: [...state.history.slice(-19), state.slots] };
}
export const pairs = [
  { ids: ['camera', 'drums'], title: 'มิวสิกวิดีโอของคุณ', detail: 'จังหวะเจอมุมมอง เปิดเวทีเล็ก ๆ ในห้องนี้', className: 'music' },
  { ids: ['ball', 'headphones'], title: 'สนามมีจังหวะ', detail: 'ให้ลูกบาสเคลื่อนไหวไปกับเสียงที่ชอบ', className: 'sport' },
  { ids: ['sketch', 'plant'], title: 'ไอเดียกำลังเติบโต', detail: 'ใบไม้กลายเป็นแรงบันดาลใจบนกระดาษ', className: 'garden' },
  { ids: ['camera', 'sketch'], title: 'แกลเลอรีมุมมอง', detail: 'ภาพถ่ายกับภาพวาด เล่าเรื่องเดียวกันได้หลายแบบ', className: 'gallery' },
];
export const claims = [
 { id: 'scent', word: 'หอม', prompt: 'กลิ่นน่าลอง บอกอะไรได้บ้าง?', tool: 'scope', reveal: 'กลิ่นเป็นความรู้สึก ไม่ใช่ผลตรวจความปลอดภัย', detail: 'กลิ่นหอมบอกลักษณะของกลิ่น ไม่ได้ยืนยันว่าละอองไม่มีสารที่เป็นอันตราย สารแต่งกลิ่นเป็นส่วนหนึ่งของน้ำยาหลายชนิด', scope: 'ลักษณะกลิ่น', missing: 'ส่วนประกอบและผลต่อสุขภาพ' },
 { id: 'cooling', word: 'เย็น', prompt: 'ความรู้สึกเย็น กับความปลอดภัย เป็นเรื่องเดียวกันไหม?', tool: 'separate', reveal: 'รู้สึกอย่างไร กับปลอดภัยไหม เป็นคนละคำถาม', detail: 'คำว่าเย็นอธิบายความรู้สึกของผลิตภัณฑ์ ไม่ใช่หลักฐานว่าปลอดภัย การประเมินความเสี่ยงต้องดูข้อมูลมากกว่าคำขาย', scope: 'ความรู้สึก', missing: 'หลักฐานความปลอดภัย' },
 { id: 'nicotine', word: 'ไม่มีนิโคติน', prompt: 'ถ้าข้อความนี้จริง มันตอบทุกเรื่องหรือยัง?', tool: 'evidence', reveal: 'ไม่มีนิโคติน ไม่ได้แปลว่าไม่มีความเสี่ยงอื่น', detail: 'คำนี้กล่าวถึงนิโคติน ไม่ได้รับรองสารอื่นในละออง WHO รายงานว่าบางผลิตภัณฑ์ที่อ้างว่าไม่มีนิโคตินตรวจพบว่ามี ไม่ใช่ว่าทุกผลิตภัณฑ์มีปัญหาเดียวกัน', scope: 'การกล่าวอ้างเรื่องนิโคติน', missing: 'ผลตรวจและข้อมูลสารอื่น' },
] as const;
export const tools = [{ id: 'scope', label: 'แว่นดูขอบเขต', mark: '⌕' }, { id: 'separate', label: 'แยกสองคำถาม', mark: '⇄' }, { id: 'evidence', label: 'ตรวจหลักฐาน', mark: '✓' }] as const;
export function testClaim(claimId: string, toolId: string) {
  const claim = claims.find(c => c.id === claimId);
  if (!claim || !tools.some(t => t.id === toolId)) return null;
  return { matches: claim.tool === toolId, claim, hint: `ลองใช้${tools.find(t => t.id === claim.tool)!.label} เพื่อดูว่า “${claim.word}” ตอบเรื่องไหน` };
}
