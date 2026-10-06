export const wallPrompts = [
  { id: "response", label: "คำตอบของฉัน", question: "ถ้าเพื่อนชวนสูบบุหรี่ไฟฟ้า คุณจะตอบว่าอะไร?" },
] as const;

export type PromptId = (typeof wallPrompts)[number]["id"];
export type WallGroup = { text: string; count: number };
export type WallData = { groups: WallGroup[]; total: number; updatedAt: string };

export function normalizeAnswer(text: string) {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export function answerKey(text: string) {
  return normalizeAnswer(text).toLocaleLowerCase("th");
}
