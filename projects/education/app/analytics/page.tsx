import type { Metadata } from "next";
import Dashboard from "./Dashboard";
export const metadata:Metadata={title:"RE;light · สถิติสำหรับผู้ดูแล",robots:{index:false,follow:false}};
export default function Page(){return <Dashboard/>;}
