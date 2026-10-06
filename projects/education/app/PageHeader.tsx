/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation supports the site's offline pages. */
import type { ReactNode } from "react";

export default function PageHeader({ admin = false, children }: { admin?: boolean; children?: ReactNode }) {
  return <header className="game-header page-header"><a className="brand" href="/" aria-label="RE;light กลับสู่เว็บไซต์">RE<span>;</span>light</a>
    {children || <nav className="subpage-nav" aria-label={admin ? "เมนูผู้ดูแล" : "เมนูหลัก"}>
      {admin ? <><a href="/analytics">สถิติ</a><a href="/wall/manage">จัดการผนัง</a><a href="/wall">ดูผนัง ↗</a></> : <><a href="/#activities">กิจกรรม</a><a href="/wall">ผนังคำตอบ</a><a href="/#help">ความช่วยเหลือ</a></>}
    </nav>}
  </header>;
}
