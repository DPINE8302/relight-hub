import PageHeader from "../PageHeader";
import CommunityWall from "./CommunityWall";

export default function WallPage() {
  return <div className="game-page"><PageHeader /><main className="game-main"><h1>ถ้าเพื่อนชวนสูบบุหรี่ไฟฟ้า<br /><span>คุณจะตอบอย่างไร?</span></h1><p className="game-lede">อยู่ที่ไหนก็ร่วมตอบได้ ลองเขียนประโยคที่คุณจะใช้จริง แล้วอ่านคำตอบจากคนอื่น</p><div className="game-wall"><CommunityWall showQuestion={false} /></div></main></div>;
}
