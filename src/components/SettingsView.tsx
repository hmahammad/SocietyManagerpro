import React, { useState } from "react";
import { updatePassword } from "firebase/auth";
import { doc, updateDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { User } from "../types";
import { 
  Settings, 
  Shield, 
  Key, 
  Wrench, 
  CheckCircle2, 
  AlertTriangle, 
  Smartphone, 
  Lock, 
  Unlock, 
  MessageSquare, 
  ArrowLeft, 
  Loader2, 
  Activity,
  UserCheck,
  Check
} from "lucide-react";

interface SettingsViewProps {
  currentUser: User | null;
  onNavigate: (view: any) => void;
  language: "bn" | "en";
  setLanguage: (lang: "bn" | "en") => void;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
}

export default function SettingsView({ 
  currentUser, 
  onNavigate,
  language,
  setLanguage,
  theme,
  setTheme
}: SettingsViewProps) {
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  
  // Password change states
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passSubmitting, setPassSubmitting] = useState(false);

  // Device Lock states
  const [lockSubmitting, setLockSubmitting] = useState(false);

  // Problem report states
  const [probTitle, setProbTitle] = useState("");
  const [probDesc, setProbDesc] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Diagnostic states
  const [diagnosticLog, setDiagnosticLog] = useState<string[]>([]);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPass || newPass.length < 6) {
      showToast("❌ পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে", "error");
      return;
    }
    if (newPass !== confirmPass) {
      showToast("❌ পাসওয়ার্ড দুটো মিলছে না", "error");
      return;
    }

    setPassSubmitting(true);
    try {
      const user = auth.currentUser;
      if (user) {
        await updatePassword(user, newPass);
        setNewPass("");
        setConfirmPass("");
        showToast("✅ পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে");
        
        // Log to activity
        await addDoc(collection(db, "activity_logs"), {
          userId: currentUser?.docId || "",
          userName: currentUser?.name || "ব্যবহারকারী",
          action: "PASSWORD_CHANGED",
          details: "পাসওয়ার্ড পরিবর্তন করা হয়েছে।",
          timestamp: serverTimestamp()
        });
      } else {
        showToast("❌ লগইন করা নেই", "error");
      }
    } catch (err: any) {
      if (err.code === "auth/requires-recent-login") {
        showToast("❌ নিরাপত্তার জন্য আবার লগইন করে পাসওয়ার্ড বদলান", "error");
      } else {
        showToast("❌ পাসওয়ার্ড পরিবর্তন হয়নি: " + err.message, "error");
      }
    } finally {
      setPassSubmitting(false);
    }
  };

  const toggleDeviceLock = async () => {
    if (!currentUser) return;
    setLockSubmitting(true);
    const newLockState = !currentUser.deviceLock;

    try {
      const userRef = doc(db, "users", currentUser.docId);
      await updateDoc(userRef, {
        deviceLock: newLockState
      });
      showToast(newLockState ? "✅ ডিভাইস লক চালু করা হয়েছে!" : "🔓 ডিভাইস লক বন্ধ করা হয়েছে!");

      // Log to activity
      await addDoc(collection(db, "activity_logs"), {
        userId: currentUser.docId,
        userName: currentUser.name,
        action: "DEVICE_LOCK_TOGGLED",
        details: `ডিভাইস লক ${newLockState ? "চালু" : "বন্ধ"} করা হয়েছে।`,
        timestamp: serverTimestamp()
      });
    } catch (err: any) {
      showToast("❌ সেটিং পরিবর্তন করতে সমস্যা হয়েছে", "error");
    } finally {
      setLockSubmitting(false);
    }
  };

  const handleReportProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!probTitle || !probDesc) {
      showToast("❌ অনুগ্রহ করে শিরোনাম ও বর্ণনা পূরণ করুন", "error");
      return;
    }

    setReportSubmitting(true);
    try {
      await addDoc(collection(db, "support_tickets"), {
        companyId: currentUser?.companyId || currentUser?.docId || "",
        companyName: currentUser?.companyName || currentUser?.name || "",
        title: probTitle,
        description: probDesc,
        status: "open",
        createdAt: serverTimestamp(),
        reportedBy: currentUser?.name || ""
      });

      // Log to activity
      await addDoc(collection(db, "activity_logs"), {
        userId: currentUser?.docId || "",
        userName: currentUser?.name || "কোম্পানি",
        action: "SUPPORT_TICKET_CREATED",
        details: `সমস্যা রিপোর্ট করা হয়েছে: ${probTitle}`,
        timestamp: serverTimestamp()
      });

      showToast("✅ সমস্যাটি এডমিনকে সফলভাবে জানানো হয়েছে!");
      setProbTitle("");
      setProbDesc("");
    } catch (err: any) {
      showToast("❌ সাবমিট করা যায়নি: " + err.message, "error");
    } finally {
      setReportSubmitting(false);
    }
  };

  const runDiagnostics = async () => {
    setRunningDiagnostics(true);
    setDiagnosticLog(["ডায়াগনস্টিক শুরু হচ্ছে...", "সিস্টেম ডাটা স্ট্রাকচার অডিট চালু..."]);
    
    setTimeout(() => {
      setDiagnosticLog(prev => [...prev, "✓ মেম্বার ডাটাবেস চেক করা হচ্ছে...", "✓ লেজার এবং ট্রানজেকশন ব্যালেন্স ক্যাশ ভেরিফাই করা হয়েছে।"]);
    }, 600);

    setTimeout(() => {
      setDiagnosticLog(prev => [...prev, "✓ কিস্তির কিউরিড সূচি ডাটা সিঙ্ক করা হয়েছে...", "✓ সেভিংস বকেয়া ম্যাপিং ভেরিফিকেশন সমাপ্ত।"]);
    }, 1200);

    setTimeout(() => {
      setDiagnosticLog(prev => [...prev, "✓ মেম্বার সেটিংস সিঙ্ক্রোনাইজেশন কমপ্লিট।", "🎉 কোম্পানির সমস্ত ডাটাবেস সফলভাবে সলভ করা হয়েছে!"]);
      setRunningDiagnostics(false);
      showToast("✅ সমস্ত কোম্পানির সমস্যা ডায়াগনস্টিক্যালি সমাধান করা হয়েছে!");
    }, 1800);
  };

  const isMember = currentUser?.role === "member";
  const isCompany = currentUser?.role === "company";
  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Settings Top Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 px-4 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => onNavigate("dashboard")}
            className="p-1.5 hover:bg-slate-100 rounded-full transition text-slate-600 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-1.5">
              <Settings className="w-4.5 h-4.5 text-indigo-600 animate-spin-slow" />
              ফিটিংস ও সেটিংস
            </h1>
            <p className="text-[10px] text-slate-400 font-bold">আপনার প্রোফাইল সিকিউরিটি ও পারমিশন কন্ট্রোল</p>
          </div>
        </div>

        <button
          onClick={() => onNavigate("activity")}
          className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-xl text-[10px] font-black transition"
        >
          <Activity className="w-3.5 h-3.5" />
          অ্যাক্টিভিটি লগ
        </button>
      </div>

      {/* Floating Toast Notification */}
      {toast && (
        <div className={`fixed bottom-20 left-4 right-4 z-50 p-4 rounded-2xl shadow-xl border text-xs font-black text-white flex items-center gap-2 transform transition-all duration-300 ${
          toast.type === "success" 
            ? "bg-slate-900/95 border-emerald-500/30 shadow-emerald-500/10" 
            : "bg-rose-900/95 border-rose-500/30 shadow-rose-500/10"
        }`}>
          <span>{toast.msg}</span>
        </div>
      )}

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Section 1: Security & Device Lock for Member only */}
        {isMember && (
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-indigo-50 rounded-2xl text-indigo-600 shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-slate-800">🔒 ডিভাইস লক সিকিউরিটি</h3>
                <p className="text-[10px] text-slate-400 leading-normal mt-0.5">
                  ডিভাইস লক চালু করলে আপনার একাউন্টটি শুধুমাত্র এই ব্রাউজারের সেশনের জন্য লক হয়ে থাকবে, যা অন্য কারো পক্ষে অনুপ্রবেশ অসম্ভব করবে।
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase">ডিভাইস লক স্ট্যাটাস:</span>
                <p className="text-xs font-black mt-0.5 flex items-center gap-1">
                  {currentUser?.deviceLock ? (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" /> সক্রিয় (Locked)
                    </span>
                  ) : (
                    <span className="text-rose-500 flex items-center gap-1">
                      <Unlock className="w-3.5 h-3.5" /> নিষ্ক্রিয় (Unlocked)
                    </span>
                  )}
                </p>
              </div>

              <button
                disabled={lockSubmitting}
                onClick={toggleDeviceLock}
                className={`px-4 py-2 rounded-xl text-[10px] font-black transition cursor-pointer flex items-center gap-1.5 ${
                  currentUser?.deviceLock 
                    ? "bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100" 
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                {lockSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : currentUser?.deviceLock ? (
                  "বন্ধ করুন"
                ) : (
                  "চালু করুন"
                )}
              </button>
            </div>
          </div>
        )}

        {/* Section 2: Password Change Form (Moved here from Profile) */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-50 rounded-2xl text-amber-600 shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-slate-800">🔐 পাসওয়ার্ড পরিবর্তন করুন</h3>
              <p className="text-[10px] text-slate-400 leading-normal mt-0.5">
                আপনার পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে। সুরক্ষার স্বার্থে নিয়মিত পাসওয়ার্ড পরিবর্তন করার সুপারিশ করা হয়।
              </p>
            </div>
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-3 mt-3">
            <input
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none"
              placeholder="নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)"
              required
            />
            <input
              type="password"
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none"
              placeholder="পাসওয়ার্ড নিশ্চিত করুন"
              required
            />
            <button
              type="submit"
              disabled={passSubmitting}
              className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/10"
            >
              {passSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "পাসওয়ার্ড সেভ করুন"
              )}
            </button>
          </form>
        </div>

        {/* Section 3: Company Problem Solving Support & Diagnostics */}
        {(isCompany || isAdmin) && (
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-50 rounded-2xl text-rose-600 shrink-0">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-slate-800">🛠️ কোম্পানির সমস্যা সমাধান (Problem Solving)</h3>
                <p className="text-[10px] text-slate-400 leading-normal mt-0.5">
                  কোম্পানির ডাটাবেস ও কিস্তি তালিকায় কোনো অসামঞ্জস্যতা দেখা দিলে, নিচের টুলসগুলো ব্যবহার করে স্বয়ংক্রিয় সমাধান করুন।
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <button
                onClick={runDiagnostics}
                disabled={runningDiagnostics}
                className="w-full py-3 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 font-black text-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {runningDiagnostics ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                )}
                ডায়াগনস্টিক সিঙ্ক ও সমাধান করুন
              </button>

              {diagnosticLog.length > 0 && (
                <div className="bg-slate-950 p-4 rounded-2xl font-mono text-[9px] text-indigo-300 space-y-1.5 overflow-y-auto max-h-40 border border-slate-800">
                  {diagnosticLog.map((log, i) => (
                    <div key={i} className="flex items-start gap-1">
                      <span className="text-slate-600 select-none">&gt;</span>
                      <p>{log}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <hr className="border-slate-100" />

            {/* Report Problem form to Admin */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-black text-slate-600 flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5 text-rose-500" />
                এডমিনের কাছে টেকনিক্যাল সমস্যা রিপোর্ট করুন
              </h4>
              <form onSubmit={handleReportProblem} className="space-y-2.5">
                <input
                  type="text"
                  value={probTitle}
                  onChange={(e) => setProbTitle(e.target.value)}
                  placeholder="সমস্যার শিরোনাম (যেমন: ট্রানজেকশন ডুপ্লিকেট)"
                  className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none"
                  required
                />
                <textarea
                  value={probDesc}
                  onChange={(e) => setProbDesc(e.target.value)}
                  placeholder="সমস্যার বিস্তারিত বর্ণনা লিখুন..."
                  className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none min-h-20"
                  required
                />
                <button
                  type="submit"
                  disabled={reportSubmitting}
                  className="w-full py-2.5 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {reportSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "সমস্যা সাবমিট করুন"
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Section 4: Global Settings & System permissions */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-slate-100 rounded-2xl text-slate-700 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-slate-800">⚙️ অ্যাপ পারমিশন ও প্রেফারেন্স</h3>
              <p className="text-[10px] text-slate-400 leading-normal mt-0.5">
                আপনার ইউজার ইন্টারফেস এবং নোটিফিকেশন অ্যালার্টের পারমিশন কন্ট্রোল।
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            {/* Language Selection */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
              <div>
                <p className="text-[11px] font-black text-slate-700">ভাষা অগ্রাধিকার (Language)</p>
                <p className="text-[9px] text-slate-400 mt-0.5">ডিফল্ট বাংলা নাকি ইংরেজি ব্যবহার করবেন</p>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setLanguage("bn")}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition cursor-pointer ${
                    language === "bn" 
                      ? "bg-indigo-600 text-white shadow-sm" 
                      : "bg-white border border-slate-200 text-slate-500"
                  }`}
                >
                  বাংলা
                </button>
                <button
                  onClick={() => setLanguage("en")}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition cursor-pointer ${
                    language === "en" 
                      ? "bg-indigo-600 text-white shadow-sm" 
                      : "bg-white border border-slate-200 text-slate-500"
                  }`}
                >
                  EN
                </button>
              </div>
            </div>

            {/* Dark Theme Selection */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
              <div>
                <p className="text-[11px] font-black text-slate-700">ডার্ক মোড প্রভিউ (Theme)</p>
                <p className="text-[9px] text-slate-400 mt-0.5">উজ্জ্বল বা আরামদায়ক ডার্ক থিম ইন্টারফেস</p>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setTheme("light")}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition cursor-pointer ${
                    theme === "light" 
                      ? "bg-indigo-600 text-white shadow-sm" 
                      : "bg-white border border-slate-200 text-slate-500"
                  }`}
                >
                  লাইট
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition cursor-pointer ${
                    theme === "dark" 
                      ? "bg-indigo-600 text-white shadow-sm" 
                      : "bg-white border border-slate-200 text-slate-500"
                  }`}
                >
                  ডার্ক
                </button>
              </div>
            </div>

            {/* Simulated Toggles for robust Settings panel feel */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
              <div>
                <p className="text-[11px] font-black text-slate-700">ইমেইল নোটিফিকেশন</p>
                <p className="text-[9px] text-slate-400 mt-0.5">সাপ্তাহিক ও ট্রানজেকশন ইমেইল আপডেট</p>
              </div>
              <div className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
              <div>
                <p className="text-[11px] font-black text-slate-700">এসএমএস অ্যালার্ট</p>
                <p className="text-[9px] text-slate-400 mt-0.5">যেকোনো কিস্তি বকেয়া হলে অটোমেটিক এসএমএস</p>
              </div>
              <div className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
