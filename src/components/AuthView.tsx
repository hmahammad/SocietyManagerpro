import React, { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  doc,
  setDoc,
  runTransaction,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { motion, AnimatePresence } from "motion/react";
import { Lock, Building2, Eye, EyeOff, Mail, Phone, User, Landmark } from "lucide-react";
import { normalizePhoneNumber } from "../utils/firestore";
import { translations, Language } from "../utils/translations";

interface AuthViewProps {
  onSuccess: () => void;
  language?: Language;
  setLanguage?: (lang: Language) => void;
}

export default function AuthView({ onSuccess, language = "bn", setLanguage }: AuthViewProps) {
  const t = translations[language];
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Login inputs
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Register inputs
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [showRegPass, setShowRegPass] = useState(false);

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const getEmailFromIdentifier = async (identifier: string) => {
    const trimmed = identifier.trim();
    if (trimmed.includes("@")) return trimmed;
    const normalized = normalizePhoneNumber(trimmed);
    const q = query(collection(db, "users"), where("mobile", "==", normalized));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data().email as string;
    }
    return null;
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier || !loginPassword) {
      setError(language === "bn" ? "সবগুলো ফিল্ড পূরণ করুন" : "Please fill in all fields");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const targetEmail = await getEmailFromIdentifier(loginIdentifier.trim());
      if (!targetEmail) {
        throw new Error("User not found");
      }

      await signInWithEmailAndPassword(auth, targetEmail, loginPassword);
      showToast(t.loginSuccess);
      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError(t.loginError);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName || !ownerName || !phone || !email || !password || !confirmPassword) {
      showToast(t.allFieldsRequired, "error");
      return;
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    const validPhone = /^01[3-9]\d{8}$/.test(normalizedPhone);
    if (!validPhone) {
      showToast(t.phoneError, "error");
      return;
    }

    if (password.length < 6) {
      showToast(t.passwordLengthError, "error");
      return;
    }

    if (password !== confirmPassword) {
      showToast(t.passwordMismatch, "error");
      return;
    }

    if (!agree) {
      showToast(t.agreeTermsError, "error");
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      const newUserId = await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, "counters", "userCounter");
        const snap = await transaction.get(counterRef);
        const nextId = snap.exists() ? (snap.data().currentId || 0) + 1 : 1;
        transaction.set(counterRef, { currentId: nextId }, { merge: true });
        return "C" + nextId.toString().padStart(3, "0");
      });

      await setDoc(doc(db, "users", newUserId), {
        uid: cred.user.uid,
        userId: newUserId,
        companyName: companyName,
        name: ownerName,
        mobile: normalizedPhone,
        email: email,
        role: "company",
        status: "pending",
        joinedDate: Date.now(),
        createdAt: Date.now(),
      });

      showToast("🎉 রেজিস্ট্রেশন সফল! অ্যাডমিন অ্যাপ্রুভ করলে ড্যাশবোর্ড ব্যবহার করতে পারবেন।");
      onSuccess();
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        showToast("❌ এই ইমেইলে আগেই অ্যাকাউন্ট আছে", "error");
      } else {
        showToast("❌ রেজিস্ট্রেশন ব্যর্থ হয়েছে", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetEmail) {
      showToast("ইমেইল দিন", "error");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      showToast("✅ ইমেইলে পাসওয়ার্ড রিসেট লিংক পাঠানো হয়েছে");
      setShowForgotModal(false);
      setResetEmail("");
    } catch (err) {
      console.error(err);
      showToast("রিসেট ব্যর্থ হয়েছে", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className={`fixed top-5 right-5 px-5 py-3 rounded-2xl shadow-xl text-white z-[9999] text-sm font-bold ${
              toast.type === "success" ? "bg-emerald-500" : "bg-rose-500"
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="flex justify-between items-center p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md">
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-white animate-pulse" />
          <h1 className="text-lg font-bold tracking-tight">A S Embroidery - সমিতি ম্যানেজার</h1>
        </div>
        <button
          onClick={() => {
            setIsLogin(!isLogin);
            setError("");
          }}
          className="px-4 py-2 rounded-full bg-white/20 hover:bg-white/30 transition text-xs font-bold"
        >
          {isLogin ? "রেজিস্ট্রেশন" : "লগইন"}
        </button>
      </header>

      {/* Loader Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="text-slate-600 text-sm font-semibold">লোড হচ্ছে...</p>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {isLogin ? (
              <motion.div
                key="login"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white border border-slate-200 shadow-xl rounded-3xl p-7"
              >
                <div className="flex justify-center mb-4">
                  <div className="w-14 h-14 flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 shadow-lg">
                    <Lock className="text-white w-6 h-6" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-center text-slate-800 mb-6">স্বাগতম</h2>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-600 font-bold ml-1">ফোন নম্বর বা ইমেইল</label>
                    <div className="relative mt-1">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input
                        type="text"
                        value={loginIdentifier}
                        onChange={(e) => setLoginIdentifier(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-400 outline-none text-sm transition"
                        placeholder="01XXXXXXXXX বা ইমেইল"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-600 font-bold ml-1">পাসওয়ার্ড</label>
                    <div className="relative mt-1">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input
                        type={showLoginPass ? "text" : "password"}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-400 outline-none text-sm transition"
                        placeholder="••••••"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPass(!showLoginPass)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showLoginPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="text-rose-500 text-xs font-bold p-3 bg-rose-50 rounded-xl text-center">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-3.5 rounded-xl text-white font-bold bg-gradient-to-r from-blue-500 to-indigo-500 hover:opacity-90 active:scale-95 transition shadow-lg text-sm"
                  >
                    লগইন করুন
                  </button>
                </form>

                <div className="text-center text-sm text-slate-500 mt-5">
                  <button
                    onClick={() => setShowForgotModal(true)}
                    className="text-blue-600 font-bold hover:underline"
                  >
                    পাসওয়ার্ড ভুলে গেছেন?
                  </button>
                </div>
                <p className="text-center text-sm text-slate-500 mt-3">
                  অ্যাকাউন্ট নেই?{" "}
                  <button
                    onClick={() => setIsLogin(false)}
                    className="text-blue-600 font-bold hover:underline"
                  >
                    রেজিস্ট্রেশন করুন
                  </button>
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="register"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white border border-slate-200 shadow-xl rounded-3xl p-7"
              >
                <div className="flex justify-center mb-4">
                  <div className="w-14 h-14 flex items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 shadow-lg">
                    <Building2 className="text-white w-6 h-6" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-center text-slate-800">কোম্পানি রেজিস্ট্রেশন</h2>
                <p className="text-center text-[11px] text-slate-500 mt-1.5 mb-5 leading-normal">
                  রেজিস্ট্রেশনের পর অ্যাডমিন অ্যাপ্রুভ করলে ড্যাশবোর্ড ব্যবহার করতে পারবেন
                </p>

                <form onSubmit={handleRegisterSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-600 font-bold ml-1">কোম্পানির নাম *</label>
                    <div className="relative mt-1">
                      <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-400 outline-none text-sm transition"
                        placeholder="আপনার কোম্পানির নাম"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-600 font-bold ml-1">মালিকের নাম *</label>
                    <div className="relative mt-1">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input
                        type="text"
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-400 outline-none text-sm transition"
                        placeholder="মালিকের পূর্ণ নাম"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-600 font-bold ml-1">ফোন নম্বর *</label>
                    <div className="relative mt-1">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-400 outline-none text-sm transition"
                        placeholder="01XXXXXXXXX"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-600 font-bold ml-1">ইমেইল *</label>
                    <div className="relative mt-1">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-400 outline-none text-sm transition"
                        placeholder="example@gmail.com"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-600 font-bold ml-1">পাসওয়ার্ড *</label>
                    <div className="relative mt-1">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input
                        type={showRegPass ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-400 outline-none text-sm transition"
                        placeholder="কমপক্ষে ৬ অক্ষর"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPass(!showRegPass)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showRegPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-600 font-bold ml-1">পাসওয়ার্ড নিশ্চিত করুন *</label>
                    <div className="relative mt-1">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-400 outline-none text-sm transition"
                        placeholder="পাসওয়ার্ড নিশ্চিত করুন"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      id="agreeCheckbox"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 rounded"
                    />
                    <label htmlFor="agreeCheckbox" className="text-xs text-slate-600 select-none">
                      শর্তাবলী মেনে নিচ্ছি
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 rounded-xl text-white font-bold bg-gradient-to-r from-indigo-500 to-purple-500 hover:opacity-90 active:scale-95 transition shadow-lg text-sm"
                  >
                    রেজিস্ট্রেশন করুন
                  </button>
                </form>

                <p class="text-center text-sm text-slate-500 mt-4">
                  অ্যাকাউন্ট আছে?{" "}
                  <button
                    onClick={() => setIsLogin(true)}
                    className="text-indigo-600 font-bold hover:underline"
                  >
                    লগইন করুন
                  </button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Forgot Password Modal */}
      <AnimatePresence>
        {showForgotModal && (
          <div className="fixed inset-0 flex items-end justify-center z-50">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForgotModal(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md mx-auto rounded-t-3xl p-6 bg-slate-900 border border-slate-800 shadow-2xl text-white z-10"
            >
              <div className="w-12 h-1 bg-slate-700 rounded-full mx-auto mb-4"></div>
              <h3 className="text-xl font-bold mb-1">পাসওয়ার্ড রিসেট</h3>
              <p className="text-xs text-slate-400 mb-4">আপনার ই-মেইল এড্রেসটি লিখুন</p>
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm"
                placeholder="example@gmail.com"
              />
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setShowForgotModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition font-bold text-sm"
                >
                  বাতিল
                </button>
                <button
                  onClick={handleResetPassword}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition text-sm"
                >
                  লিংক পাঠান
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-slate-100 text-center py-4 text-slate-500 text-xs border-t border-slate-200">
        © 2026 A S Embroidery - সমিতি ম্যানেজার
      </footer>
    </div>
  );
}
