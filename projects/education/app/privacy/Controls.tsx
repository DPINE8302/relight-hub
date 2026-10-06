"use client";
import { useSyncExternalStore } from "react";
function subscribe(callback:()=>void) {window.addEventListener("relight:privacy",callback);window.addEventListener("storage",callback);return()=>{window.removeEventListener("relight:privacy",callback);window.removeEventListener("storage",callback);};}
function preference(){try{if(navigator.doNotTrack==="1" || (navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl)return "browser";return localStorage.getItem("relight-statistics-disabled")==="1"?"disabled":"enabled";}catch{return "browser";}}
export default function Controls(){
  const mode=useSyncExternalStore(subscribe,preference,()=>"enabled");
  return <div className="privacy-controls"><p role="status">{mode==="browser"?"ปิดสถิติตาม Do Not Track หรือ Global Privacy Control ของเบราว์เซอร์":mode==="disabled"?"ปิดการเก็บสถิติบนเบราว์เซอร์นี้แล้ว":"อนุญาตสถิติการใช้งานบนเบราว์เซอร์นี้"}</p><button className="button button-light" disabled={mode==="browser"} onClick={()=>{try{const disabled=mode==="disabled";localStorage.setItem("relight-statistics-disabled",disabled?"0":"1");if(!disabled){localStorage.removeItem("relight-metrics-queue");localStorage.removeItem("relight-metrics-visitor");sessionStorage.removeItem("relight-metrics-session");}window.dispatchEvent(new Event("relight:privacy"));}catch{}}}>{mode==="disabled"?"เปิดสถิติการใช้งาน":"ปิดสถิติการใช้งาน"}</button></div>;
}
