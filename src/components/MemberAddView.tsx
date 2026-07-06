import { useState, useEffect } from "react";
import { doc, setDoc, runTransaction, collection, query, where, getDocs, addDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { db, secondaryAuth } from "../firebase";
import { User } from "../types";
import { ArrowLeft, UserPlus, Eye, EyeOff, Camera, Landmark } from "lucide-react";
import { normalizePhoneNumber } from "../utils/firestore";

interface MemberAddViewProps {
  currentUser: User;
  onNavigate: (view: string) => void;
  totalEntries?: number;
}

export default function MemberAddView({ currentUser, onNavigate, totalEntries = 0 }: MemberAddViewProps) {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Form Fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [accountType, setAccountType] = useState<"business" | "saving" | "">("");
  const [investType, setInvestType] = useState<"monthly" | "yearly" | "one_time" | "">("");
  const [investAmount, setInvestAmount] = useState<number>(0);
  const [investDate, setInvestDate] = useState("");
  const [status, setStatus] = useState<"active" | "pending" | "request" | "deactive">("active");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nidType, setNidType] = useState("NID");
  const [nidNumber, setNidNumber] = useState("");

  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // Error validations
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toBanglaDigits = (num: number | string) => {
    const banglaDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
    return num.toString().replace(/\d/g, (d) => banglaDigits[parseInt(d)]);
  };

  const getInvestTypeLabel = (type: string) => {
    switch (type) {
      case "monthly":
        return "মাসিক";
      case "yearly":
        return "বাৎসরিক";
      case "one_time":
        return "এককালীন";
      default:
        return "";
    }
  };

  const getSavingsSchedulePreview = () => {
    if (!investType || !investDate) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let target: Date;
    let diffDays = 0;

    if (investType === "monthly") {
      const selectedDay = parseInt(investDate, 10);
      if (isNaN(selectedDay) || selectedDay < 1 || selectedDay > 31) return null;

      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth(); // 0-indexed
      
      // Candidate in the current month
      let candidate = new Date(currentYear, currentMonth, selectedDay);
      
      // If the candidate date has already passed today, target the next month
      if (candidate.getTime() < today.getTime()) {
        candidate = new Date(currentYear, currentMonth + 1, selectedDay);
      }
      
      target = candidate;
      target.setHours(0, 0, 0, 0);
      const diffTime = target.getTime() - today.getTime();
      diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } else {
      target = new Date(investDate);
      target.setHours(0, 0, 0, 0);
      if (isNaN(target.getTime())) return null;

      const diffTime = target.getTime() - today.getTime();
      diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    const amtStr = toBanglaDigits(investAmount || 0);
    const typeLabel = getInvestTypeLabel(investType);

    if (diffDays < 0) {
      return (
        <div className="p-3 bg-amber-50 border border-amber-150 rounded-xl text-[11px] text-amber-700 font-medium">
          ⚠️ নির্বাচিত তারিখটি ইতিমধ্যে পার হয়ে গেছে (অতীতের তারিখ)। সঠিক তারিখ নির্বাচন করুন।
        </div>
      );
    }

    const daysStr = toBanglaDigits(diffDays);

    return (
      <div className="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl text-[11px] text-emerald-800 space-y-1 animate-fadeIn font-sans">
        <p className="font-extrabold text-emerald-900 flex items-center gap-1">
          📊 সেভিংস সিডিউল হিসাব:
        </p>
        <p className="font-semibold leading-relaxed">
          {diffDays === 0 ? (
            <span>আজকেই আপনার <span className="font-extrabold text-emerald-950">{typeLabel} সেভিংস</span> কিস্তির প্রথম দিন, তাই আজই <span className="font-extrabold text-emerald-950">৳{amtStr}</span> সেভিংস জমা করুন।</span>
          ) : (
            <span>আপনার নির্বাচিত <span className="font-extrabold text-emerald-950">{typeLabel} সেভিংস</span> কিস্তি অনুযায়ী, আজ থেকে ঠিক <span className="font-extrabold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-100">{daysStr} দিন পর</span> <span className="font-extrabold text-emerald-950">৳{amtStr}</span> সেভিংস জমা করুন।</span>
          )}
        </p>
      </div>
    );
  };

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name) errs.name = "মেম্বারের নাম লিখুন";

    const normalizedPhone = normalizePhoneNumber(phone);
    const validPhone = /^01[3-9]\d{8}$/.test(normalizedPhone);
    if (!validPhone) errs.phone = "সঠিক বাংলাদেশি মোবাইল নম্বর দিন (১১ সংখ্যা)";

    const validEmail = email && email.includes("@") && email.includes(".");
    if (!validEmail) errs.email = "সঠিক ইমেইল দিন";

    if (!accountType) errs.accountType = "অ্যাকাউন্টের ধরন নির্বাচন করুন";
    if (!investType) errs.investType = "কিস্তির ধরন নির্বাচন করুন";
    if (!investDate) errs.investDate = "কিস্তি জমার তারিখ নির্বাচন করুন";

    if (nidNumber) {
      const cleanNid = nidNumber.replace(/\D/g, "");
      if (cleanNid.length < 10 || cleanNid.length > 17) {
        errs.nidNumber = "পরিচয়পত্র নম্বরটি ১০ থেকে ১৭ ডিজিটের হতে হবে";
      }
    }

    if (password.length < 6) errs.password = "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে";
    if (password !== confirmPassword) errs.confirmPassword = "পাসওয়ার্ড দুটি মেলেনি";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAddMember = async () => {
    if (!validate()) {
      showToast("❌ সঠিকভাবে সব তথ্য পূরণ করুন", "error");
      return;
    }

    setLoading(true);
    try {
      const normalizedPhone = normalizePhoneNumber(phone);

      // 1. Check if email already used in firebase
      // Create user with secondary Auth to prevent logging current company/admin out
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const uid = userCredential.user.uid;

      // Sign out of secondary auth session immediately
      await signOut(secondaryAuth);

      // 2. Transact unique memberId
      const memberId = await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, "counters", "memberCounter");
        const snap = await transaction.get(counterRef);
        const nextId = snap.exists() ? (snap.data().currentId || 0) + 1 : 1;
        transaction.set(counterRef, { currentId: nextId }, { merge: true });
        return "M" + nextId.toString().padStart(3, "0");
      });

      // 3. Save to Firestore
      await setDoc(doc(db, "users", memberId), {
        uid: uid,
        userId: memberId,
        name: name,
        email: email,
        mobile: normalizedPhone,
        dob: dob,
        nidNumber: nidNumber,
        nidType: nidType,
        accountType: accountType,
        InvestType: investType,
        investAmount: investAmount,
        investDate: investDate,
        role: "member",
        companyId: currentUser.docId,
        status: status,
        amount: investAmount, // starting savings amount matches the first investment amount
        savingsBalance: investAmount,
        incomeBalance: 0,
        createdAt: Date.now(),
      });

      // Write starting history if investAmount > 0
      if (investAmount > 0) {
        const historyCol = collection(db, "users", memberId, "history");
        await addDoc(historyCol, {
          amount: investAmount,
          date: new Date().toISOString().split('T')[0],
          memo: "প্রারম্ভিক সঞ্চয় ডিপোজিট (মেম্বার যোগদান)",
          InvestType: investType,
          accountType: accountType,
          type: "saving",
          flow: "IN",
          paymentMethod: "cash",
          createdAt: new Date().toISOString(),
          projectName: "কোম্পানি (সাধারণ)",
        });
      }

      showToast("🎉 মেম্বার সফলভাবে যোগ হয়েছে!");
      setTimeout(() => onNavigate("member-list"), 1500);
    } catch (err: any) {
      console.error(err);
      let errMsg = "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন";
      if (err.code === "auth/email-already-in-use") {
        errMsg = "এই ইমেইলে আগেই একটি অ্যাকাউন্ট আছে";
      }
      showToast("❌ " + errMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 px-4 py-3 rounded-2xl text-white text-sm font-semibold shadow-xl z-[99999] ${
            toast.type === "success" ? "bg-emerald-500" : "bg-red-500"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[99999]">
          <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-slate-600 text-sm font-semibold">মেম্বার তৈরি হচ্ছে...</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 rounded-b-3xl shadow-lg mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">🏢 {currentUser.companyName || currentUser.name || "Company Panel"}</h1>
          <p className="text-sm text-blue-100 mt-0.5">নতুন মেম্বার যুক্ত করুন</p>
        </div>
        <button
          onClick={() => onNavigate("member-list")}
          className="text-xs bg-white/20 hover:bg-white/30 transition px-3 py-1.5 rounded-full font-semibold flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> মেম্বার তালিকা
        </button>
      </div>

      <div className="max-w-xl mx-auto px-4 space-y-4">
        {/* Basic Personal Info */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 border-b pb-2 flex items-center gap-1.5">
            👤 ব্যক্তিগত তথ্য
          </p>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs text-slate-600 font-semibold mb-1">মেম্বারের নাম *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border outline-none text-sm font-medium transition ${
                  errors.name ? "border-rose-400 ring-1 ring-rose-400" : "border-slate-200 focus:border-blue-400"
                }`}
                placeholder="পূর্ণ নাম"
              />
              {errors.name && <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-xs text-slate-600 font-semibold mb-1">মোবাইল নম্বর *</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border outline-none text-sm font-medium transition ${
                  errors.phone ? "border-rose-400 ring-1 ring-rose-400" : "border-slate-200 focus:border-blue-400"
                }`}
                placeholder="01XXXXXXXXX"
              />
              {errors.phone && <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.phone}</p>}
            </div>

            <div>
              <label className="block text-xs text-slate-600 font-semibold mb-1">ইমেইল *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border outline-none text-sm font-medium transition ${
                  errors.email ? "border-rose-400 ring-1 ring-rose-400" : "border-slate-200 focus:border-blue-400"
                }`}
                placeholder="example@gmail.com"
              />
              {errors.email && <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-xs text-slate-600 font-semibold mb-1">জন্ম তারিখ</label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm font-medium transition focus:border-blue-400"
              />
            </div>
          </div>
        </div>

        {/* Account settings */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 border-b pb-2 flex items-center gap-1.5">
            💳 অ্যাকাউন্টের ধরন ও কিস্তি
          </p>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs text-slate-600 font-semibold mb-1">অ্যাকাউন্টের ধরন *</label>
              <select
                value={accountType}
                onChange={(e: any) => setAccountType(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border outline-none text-sm font-medium transition bg-white ${
                  errors.accountType ? "border-rose-400 ring-1 ring-rose-400" : "border-slate-200 focus:border-blue-400"
                }`}
              >
                <option value="">নির্বাচন করুন</option>
                <option value="business">বিজনেস অ্যাকাউন্ট</option>
                <option value="saving">সেভিংস অ্যাকাউন্ট</option>
              </select>
              {errors.accountType && <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.accountType}</p>}
            </div>

            <div>
              <label className="block text-xs text-slate-600 font-semibold mb-1">সেভিংসের ধরন *</label>
              <select
                value={investType}
                onChange={(e: any) => {
                  setInvestType(e.target.value);
                  setInvestDate("");
                }}
                className={`w-full px-4 py-2.5 rounded-xl border outline-none text-sm font-medium transition bg-white ${
                  errors.investType ? "border-rose-400 ring-1 ring-rose-400" : "border-slate-200 focus:border-blue-400"
                }`}
              >
                <option value="">নির্বাচন করুন</option>
                <option value="monthly">মাসিক কিস্তি</option>
                <option value="yearly">বাৎসরিক কিস্তি</option>
                <option value="one_time">এককালীন জমা</option>
              </select>
              {errors.investType && <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.investType}</p>}
            </div>

            <div>
              <label className="block text-xs text-slate-600 font-semibold mb-1">টাকার পরিমাণ</label>
              <input
                type="number"
                value={investAmount || ""}
                onChange={(e) => setInvestAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm font-medium transition focus:border-blue-400"
                placeholder="৳ পরিমাণ"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-600 font-semibold mb-1">
                {investType === "monthly" 
                  ? "কিস্তি জমার তারিখ (প্রতি মাসের নির্দিষ্ট তারিখ) *" 
                  : "কিস্তি জমার তারিখ (মাস ও দিন) *"}
              </label>
              {investType === "monthly" ? (
                <select
                  value={investDate}
                  onChange={(e) => setInvestDate(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border outline-none text-sm font-medium transition bg-white ${
                    errors.investDate ? "border-rose-400 ring-1 ring-rose-400" : "border-slate-200 focus:border-blue-400"
                  }`}
                >
                  <option value="">তারিখ নির্বাচন করুন</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={String(day)}>
                      {toBanglaDigits(day)} তারিখ
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="date"
                  value={investDate}
                  onChange={(e) => setInvestDate(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border outline-none text-sm font-medium transition ${
                    errors.investDate ? "border-rose-400 ring-1 ring-rose-400" : "border-slate-200 focus:border-blue-400"
                  }`}
                />
              )}
              {errors.investDate && <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.investDate}</p>}
            </div>

            {getSavingsSchedulePreview()}

            <div>
              <label className="block text-xs text-slate-600 font-semibold mb-1">প্রারম্ভিক স্ট্যাটাস</label>
              <select
                value={status}
                onChange={(e: any) => setStatus(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm font-medium transition bg-white focus:border-blue-400"
              >
                <option value="active">সক্রিয় (Active)</option>
                <option value="pending">পেন্ডিং (Pending)</option>
                <option value="request">রিকোয়েস্ট (Request)</option>
                <option value="deactive">নিষ্ক্রিয় (Deactive)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Security / Password settings */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 border-b pb-2 flex items-center gap-1.5">
            🔐 পাসওয়ার্ড সেট করুন
          </p>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs text-slate-600 font-semibold mb-1">পাসওয়ার্ড *</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-4 pr-10 py-2.5 rounded-xl border outline-none text-sm font-medium transition ${
                    errors.password ? "border-rose-400 ring-1 ring-rose-400" : "border-slate-200 focus:border-blue-400"
                  }`}
                  placeholder="কমপক্ষে ৬ অক্ষর"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPass ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
              {errors.password && <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.password}</p>}
            </div>

            <div>
              <label className="block text-xs text-slate-600 font-semibold mb-1">পাসওয়ার্ড নিশ্চিত করুন *</label>
              <div className="relative">
                <input
                  type={showConfirmPass ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full pl-4 pr-10 py-2.5 rounded-xl border outline-none text-sm font-medium transition ${
                    errors.confirmPassword
                      ? "border-rose-400 ring-1 ring-rose-400"
                      : "border-slate-200 focus:border-blue-400"
                  }`}
                  placeholder="আবার পাসওয়ার্ড লিখুন"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showConfirmPass ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.confirmPassword}</p>
              )}
            </div>
          </div>
        </div>

        {/* Identity Docs */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 border-b pb-2 flex items-center gap-1.5">
            🪪 পরিচয়পত্র তথ্য
          </p>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs text-slate-600 font-semibold mb-1">ডকুমেন্ট টাইপ</label>
              <select
                value={nidType}
                onChange={(e) => setNidType(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm font-medium transition bg-white focus:border-blue-400"
              >
                <option value="NID">জাতীয় পরিচয়পত্র (NID)</option>
                <option value="Birth">জন্ম নিবন্ধন সনদ</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-600 font-semibold mb-1">পরিচয়পত্র নম্বর</label>
              <input
                type="text"
                value={nidNumber}
                onChange={(e) => setNidNumber(e.target.value.replace(/\D/g, "").slice(0, 17))}
                className={`w-full px-4 py-2.5 rounded-xl border outline-none text-sm font-medium transition ${
                  errors.nidNumber ? "border-rose-400 ring-1 ring-rose-400" : "border-slate-200 focus:border-blue-400"
                }`}
                placeholder="NID / জন্ম নিবন্ধন নম্বর (১০-১৭ ডিজিট)"
              />
              {errors.nidNumber && <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.nidNumber}</p>}
            </div>
          </div>
        </div>

        {/* Submit button */}
        <button
          onClick={handleAddMember}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 active:scale-95 transition text-white py-4 rounded-2xl font-bold shadow-lg text-sm flex items-center justify-center gap-2"
        >
          <UserPlus className="w-4.5 h-4.5" />
          মেম্বার যোগ করুন
        </button>
      </div>
    </div>
  );
}
