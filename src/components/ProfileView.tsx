import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc, collection, getDocs, onSnapshot, addDoc } from "firebase/firestore";
import { updatePassword, updateProfile, updateEmail } from "firebase/auth";
import { db, auth } from "../firebase";
import { User, HistoryEntry } from "../types";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  ROLE_LABELS,
  ACCT_LABELS,
  INVEST_LABELS,
  formatBDT,
  formatDate,
} from "../utils/firestore";
import {
  ArrowLeft,
  X,
  Camera,
  Save,
  LogOut,
  Wallet,
  Calendar,
  Briefcase,
  MapPin,
  Mail,
  Phone,
  User as UserIcon,
  CreditCard,
  Lock,
  Key,
  ShieldCheck,
  AlertTriangle,
  Upload,
} from "lucide-react";

interface ProfileViewProps {
  currentUser: User;
  targetId?: string | null;
  onNavigate: (view: string, params?: any) => void;
}

export default function ProfileView({ currentUser, targetId, onNavigate }: ProfileViewProps) {
  const [loading, setLoading] = useState(true);
  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [totalArrears, setTotalArrears] = useState(0);

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [dob, setDob] = useState("");
  const [address, setAddress] = useState("");
  const [nidType, setNidType] = useState("NID");
  const [nidNumber, setNidNumber] = useState("");
  const [accountType, setAccountType] = useState<"business" | "saving" | "">("");
  const [investType, setInvestType] = useState<"monthly" | "yearly" | "one_time" | "">("");
  const [investAmount, setInvestAmount] = useState<number>(0);
  const [investDate, setInvestDate] = useState("");
  const [canSeeAllData, setCanSeeAllData] = useState<boolean>(false);
  const [role, setRole] = useState<"member" | "company" | "admin" | "">("");
  const [status, setStatus] = useState<"active" | "pending" | "request" | "deactive" | "">("");

  // Company-only form states
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");

  // Images state
  const [profilePic, setProfilePic] = useState("");
  const [idFrontUrl, setIdFrontUrl] = useState("");
  const [idBackUrl, setIdBackUrl] = useState("");

  // Own Password change states
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  // Lightbox modal state
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingsTab, setSavingsTab] = useState<"schedule" | "history">("schedule");

  const isOwnProfile = !targetId || targetId === currentUser.docId;
  const isAdminOrCompany = currentUser.role === "admin" || currentUser.role === "company";

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      const activeId = targetId || currentUser.docId;
      try {
        const uDoc = await getDoc(doc(db, "users", activeId));
        if (uDoc.exists()) {
          const d = { docId: uDoc.id, ...uDoc.data() } as User;
          setTargetUser(d);

          // Map to inputs
          setName(d.name || "");
          setEmail(d.email || "");
          setMobile(d.mobile || "");
          setDob(d.dob || d.birthDate || "");
          setAddress(d.address || "");
          setNidType(d.nidType || "NID");
          setNidNumber(d.nidNumber || "");
          setAccountType(d.accountType || "");
          setInvestType(d.InvestType || "");
          setInvestAmount(d.investAmount || 0);
          setInvestDate(d.investDate || "");
          setCanSeeAllData(d.canSeeAllData || false);
          setProfilePic(d.profilePic || "");
          setIdFrontUrl(d.idFrontUrl || "");
          setIdBackUrl(d.idBackUrl || "");
          setCompanyName(d.companyName || "");
          setCompanyAddress(d.companyAddress || "");
          setRole(d.role || "member");
          setStatus(d.status || "pending");

          if (d.role !== "company") {
            // Fetch history & calculate arrears
            const histSnap = await getDocs(collection(db, "users", activeId, "history"));
            const histList: HistoryEntry[] = [];
            histSnap.forEach((doc) => {
              histList.push({ docId: doc.id, ...doc.data() } as HistoryEntry);
            });

            // Sort history by date desc
            histList.sort((a, b) => b.date.localeCompare(a.date));

            // Auto-check and write missing arrears
            await autoCheckAndSaveArrears(activeId, d, histList);

            // Fetch history again to get newly added arrears
            const updatedHistSnap = await getDocs(collection(db, "users", activeId, "history"));
            const updatedHistList: HistoryEntry[] = [];
            updatedHistSnap.forEach((doc) => {
              updatedHistList.push({ docId: doc.id, ...doc.data() } as HistoryEntry);
            });
            updatedHistList.sort((a, b) => b.date.localeCompare(a.date));

            setHistory(updatedHistList);

            const totalArrearsAmt = updatedHistList
              .filter((h) => h.type === "savings_arrears")
              .reduce((sum, h) => sum + Number(h.arrears || 0), 0);
            setTotalArrears(totalArrearsAmt);
          }
        } else {
          showToast("প্রোফাইল পাওয়া যায়নি", "error");
        }
      } catch (err) {
        console.error(err);
        showToast("প্রোফাইল লোড করতে ত্রুটি হয়েছে", "error");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [targetId, currentUser]);

  const autoCheckAndSaveArrears = async (userId: string, d: User, existingDocs: HistoryEntry[]) => {
    if (!d.InvestType || d.InvestType === "one_time") return;
    if (!d.investDate || !d.investAmount || Number(d.investAmount) <= 0) return;

    const investAmount = Number(d.investAmount);
    const investDateObj = new Date(d.investDate);
    const dayOfMonth = investDateObj.getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingKeys = new Set(existingDocs.map((h) => h.arrearsKey).filter(Boolean));

    // Choose base start date
    const startDate = new Date(d.createdAt || d.joinedDate || investDateObj.getTime());
    startDate.setDate(1);

    const toAdd = [];

    if (d.InvestType === "monthly") {
      let cur = new Date(startDate.getFullYear(), startDate.getMonth(), dayOfMonth);
      while (cur < today) {
        const key = `arrears-${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
        if (!existingKeys.has(key)) {
          // Check if a real payment was made this month
          const hasPayment = existingDocs.some((h) => {
            if (h.type === "savings_arrears") return false;
            if (!h.date) return false;
            const hd = new Date(h.date);
            return hd.getFullYear() === cur.getFullYear() && hd.getMonth() === cur.getMonth();
          });
          if (!hasPayment) {
            toAdd.push({
              key,
              date: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(
                dayOfMonth
              ).padStart(2, "0")}`,
              label: cur.toLocaleDateString("bn-BD", { month: "long", year: "numeric" }),
            });
          }
        }
        cur.setMonth(cur.getMonth() + 1);
      }
    } else if (d.InvestType === "yearly") {
      let curYear = startDate.getFullYear();
      while (curYear < today.getFullYear()) {
        const key = `arrears-${curYear}`;
        if (!existingKeys.has(key)) {
          const hasPayment = existingDocs.some((h) => {
            if (h.type === "savings_arrears") return false;
            if (!h.date) return false;
            return new Date(h.date).getFullYear() === curYear;
          });
          if (!hasPayment) {
            toAdd.push({
              key,
              date: `${curYear}-${String(investDateObj.getMonth() + 1).padStart(
                2,
                "0"
              )}-${String(dayOfMonth).padStart(2, "0")}`,
              label: `${curYear} সাল`,
            });
          }
        }
        curYear++;
      }
    }

    // Write missing arrears docs
    const historyCol = collection(db, "users", userId, "history");
    for (const item of toAdd) {
      await addDoc(historyCol, {
        amount: 0,
        arrears: investAmount,
        date: item.date,
        memo: `${item.label} সেভিংস জমা করা হয়নি`,
        InvestType: d.InvestType,
        type: "savings_arrears",
        arrearsKey: item.key,
        createdAt: new Date().toISOString(),
      });
    }
  };

  const getSavingsSchedule = () => {
    if (!targetUser || !targetUser.InvestType || targetUser.InvestType === "one_time") return [];
    if (!targetUser.investDate || !targetUser.investAmount || Number(targetUser.investAmount) <= 0) return [];

    const amount = Number(targetUser.investAmount);
    const investDateObj = new Date(targetUser.investDate);
    const dayOfMonth = investDateObj.getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const baseDate = new Date(targetUser.createdAt || targetUser.joinedDate || investDateObj.getTime());
    baseDate.setDate(1);

    const scheduleList = [];

    const toBanglaDigits = (num: number | string) => {
      const banglaDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
      return num.toString().replace(/\d/g, (d) => banglaDigits[parseInt(d)]);
    };

    if (targetUser.InvestType === "monthly") {
      // Let's generate from registration month up to next month
      let cur = new Date(baseDate.getFullYear(), baseDate.getMonth(), dayOfMonth);
      
      const limitDate = new Date();
      limitDate.setMonth(limitDate.getMonth() + 2);

      while (cur <= limitDate) {
        const isPast = cur < today;
        const isToday = cur.getFullYear() === today.getFullYear() && cur.getMonth() === today.getMonth() && cur.getDate() === today.getDate();
        
        // Find matching payment in history list
        const matchingPayment = history.find((h) => {
          if (h.type === "savings_arrears") return false;
          if (!h.date) return false;
          const hd = new Date(h.date);
          return hd.getFullYear() === cur.getFullYear() && hd.getMonth() === cur.getMonth();
        });

        // Find matching arrears doc in history list
        const matchingArrears = history.find((h) => {
          return h.type === "savings_arrears" && h.arrearsKey === `arrears-${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
        });

        let status: "paid" | "overdue" | "upcoming" = "upcoming";
        if (matchingPayment) {
          status = "paid";
        } else if (matchingArrears || (isPast && !isToday)) {
          status = "overdue";
        } else {
          status = "upcoming";
        }

        scheduleList.push({
          date: new Date(cur),
          label: cur.toLocaleDateString("bn-BD", { month: "long" }) + " " + toBanglaDigits(cur.getFullYear()),
          dayOfMonth: toBanglaDigits(dayOfMonth),
          amount,
          status,
          payment: matchingPayment,
        });

        cur.setMonth(cur.getMonth() + 1);
      }
    } else if (targetUser.InvestType === "yearly") {
      let curYear = baseDate.getFullYear();
      const limitYear = today.getFullYear() + 1;

      while (curYear <= limitYear) {
        const isPast = curYear < today.getFullYear();
        
        // Find matching payment in history
        const matchingPayment = history.find((h) => {
          if (h.type === "savings_arrears") return false;
          if (!h.date) return false;
          return new Date(h.date).getFullYear() === curYear;
        });

        // Find matching arrears in history
        const matchingArrears = history.find((h) => {
          return h.type === "savings_arrears" && h.arrearsKey === `arrears-${curYear}`;
        });

        let status: "paid" | "overdue" | "upcoming" = "upcoming";
        if (matchingPayment) {
          status = "paid";
        } else if (matchingArrears || isPast) {
          status = "overdue";
        } else {
          status = "upcoming";
        }

        const dueDateStr = `${curYear}-${String(investDateObj.getMonth() + 1).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;

        scheduleList.push({
          date: new Date(dueDateStr),
          label: toBanglaDigits(curYear) + " সাল",
          dayOfMonth: toBanglaDigits(dayOfMonth),
          amount,
          status,
          payment: matchingPayment,
        });

        curYear++;
      }
    }

    return scheduleList.sort((a, b) => b.date.getTime() - a.date.getTime());
  };

  const handleCloudinaryUpload = async (file: File, fieldName: "profilePic" | "idFrontUrl" | "idBackUrl") => {
    showToast("আপলোড হচ্ছে...");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", "shebaa");

      const res = await fetch("https://api.cloudinary.com/v1_1/dviugos0u/image/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!data.secure_url) {
        showToast("❌ আপলোড ব্যর্থ হয়েছে!", "error");
        return;
      }

      const url = data.secure_url;
      if (fieldName === "profilePic") setProfilePic(url);
      else if (fieldName === "idFrontUrl") setIdFrontUrl(url);
      else if (fieldName === "idBackUrl") setIdBackUrl(url);

      showToast("✅ আপলোড সফল হয়েছে!");
    } catch (e) {
      console.error(e);
      showToast("❌ আপলোড সমস্যা!", "error");
    }
  };

  const handleSaveProfile = async () => {
    if (!targetUser) return;
    setSaving(true);
    try {
      const activeId = targetId || currentUser.docId;
      const updateObj: Record<string, any> = {
        name: name.trim(),
        nidType,
        nidNumber: nidNumber.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
        dob,
        address: address.trim(),
        accountType,
        InvestType: investType,
        investAmount: Number(investAmount) || 0,
        investDate,
        profilePic,
        idFrontUrl,
        idBackUrl,
        canSeeAllData,
      };

      if (role === "company" || targetUser.role === "company") {
        updateObj.companyName = companyName.trim();
        updateObj.companyAddress = companyAddress.trim();
      }

      if (currentUser.role === "admin") {
        updateObj.role = role;
        updateObj.status = status;
      }

      // Sync with Firebase Auth for own profile updates
      if (isOwnProfile) {
        const user = auth.currentUser;
        if (user) {
          if (email.trim() && email.trim() !== user.email) {
            try {
              await updateEmail(user, email.trim());
            } catch (err: any) {
              console.warn("Auth email update failed:", err);
              if (err.code === "auth/requires-recent-login") {
                showToast("❌ নিরাপত্তার স্বার্থে পুনরায় লগইন করে ইমেইল পরিবর্তন করতে হবে।", "error");
                setSaving(false);
                return;
              }
            }
          }
          try {
            await updateProfile(user, {
              displayName: name.trim(),
              photoURL: profilePic || undefined,
            });
          } catch (err) {
            console.warn("Auth profile update failed:", err);
          }
        }
      }

      await updateDoc(doc(db, "users", activeId), updateObj);
      showToast("✅ আপডেট সফল হয়েছে!");
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      console.error(e);
      showToast("❌ আপডেট ব্যর্থ হয়েছে!", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRequestActivation = async () => {
    if (!targetUser) return;
    setSaving(true);
    try {
      const activeId = targetId || currentUser.docId;
      const updateObj: Record<string, any> = {
        name: name.trim(),
        nidType,
        nidNumber: nidNumber.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
        dob,
        address: address.trim(),
        profilePic,
        idFrontUrl,
        idBackUrl,
        companyName: companyName.trim(),
        companyAddress: companyAddress.trim(),
        status: "request",
      };

      await updateDoc(doc(db, "users", activeId), updateObj);
      showToast("✅ অ্যাক্টিভেশন রিকোয়েস্ট সফলভাবে পাঠানো হয়েছে!");
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      console.error(e);
      showToast("❌ রিকোয়েস্ট পাঠাতে ব্যর্থ হয়েছে!", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPass || newPass.length < 6) {
      showToast("❌ পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে", "error");
      return;
    }
    if (newPass !== confirmPass) {
      showToast("❌ পাসওয়ার্ড দুটো মিলছে না", "error");
      return;
    }

    try {
      const user = auth.currentUser;
      if (user) {
        await updatePassword(user, newPass);
        setNewPass("");
        setConfirmPass("");
        showToast("✅ পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে");
      }
    } catch (e: any) {
      if (e.code === "auth/requires-recent-login") {
        showToast("❌ নিরাপত্তার জন্য আবার লগইন করে পাসওয়ার্ড বদলান", "error");
      } else {
        showToast("❌ পাসওয়ার্ড পরিবর্তন হয়নি: " + e.message, "error");
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="mt-4 text-xs font-bold text-slate-400">প্রোফাইল লোড হচ্ছে...</p>
      </div>
    );
  }

  // Determine who can edit this profile
  const targetRole = role || "member";
  const targetStatus = status || "pending";

  let editable = false;
  if (currentUser.role === "admin") {
    editable = true;
  } else if (currentUser.role === "company") {
    if (targetRole === "member") {
      editable = true;
    } else if (targetRole === "company" && isOwnProfile) {
      editable = targetStatus === "pending";
    }
  }

  const isCompanyProfileComplete = () => {
    return (
      companyName.trim() !== "" &&
      companyAddress.trim() !== "" &&
      name.trim() !== "" &&
      mobile.trim() !== "" &&
      dob !== "" &&
      address.trim() !== "" &&
      nidNumber.trim() !== "" &&
      profilePic !== "" &&
      idFrontUrl !== "" &&
      idBackUrl !== ""
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 px-4 py-3 rounded-2xl text-white text-sm font-semibold shadow-xl z-[99999] ${
            toast.type === "success" ? "bg-emerald-500" : "bg-red-500"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header card */}
      <div className="max-w-md mx-auto px-4 mt-6">
        <div className="rounded-3xl p-6 mb-4 text-white shadow-xl bg-slate-900 relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/5 rounded-full"></div>
          <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-white/5 rounded-full"></div>

          <button
            onClick={() => onNavigate(currentUser.role === "member" ? "dashboard" : "member-list")}
            className="absolute top-4 right-4 text-white/40 hover:text-white/90 transition p-1"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4 relative">
            <div className="relative">
              <img
                onClick={() => profilePic && setLightboxUrl(profilePic)}
                src={profilePic || "https://api.dicebear.com/7.x/avataaars/svg?seed=User"}
                className="w-20 h-20 rounded-2xl border-2 border-white/20 bg-white/10 object-cover cursor-pointer"
                alt=""
              />
              {editable && (
                <>
                  <input
                    type="file"
                    id="profilePicUpload"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleCloudinaryUpload(e.target.files[0], "profilePic")}
                  />
                  <label
                    htmlFor="profilePicUpload"
                    className="absolute -bottom-2 -right-2 bg-indigo-500 p-1.5 rounded-full cursor-pointer shadow-lg hover:bg-indigo-600"
                  >
                    <Camera className="w-3.5 h-3.5 text-white" />
                  </label>
                </>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold leading-tight truncate">
                {targetUser?.companyName || targetUser?.name || "ব্যবহারকারী"}
              </h2>
              <p className="text-[10px] opacity-60 font-mono mt-0.5">
                {role.toUpperCase()} | ID: {targetUser?.userId || targetUser?.docId}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold ${STATUS_COLORS[status]}`}>
                  {STATUS_LABELS[status] || status}
                </span>
                <span className="text-[9px] px-2.5 py-0.5 rounded-full font-bold bg-slate-700 text-white">
                  {ROLE_LABELS[role]}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Company Profile Completeness Checklist (Only for pending companies viewing their own profile) */}
        {role === "company" && isOwnProfile && status === "pending" && (
          <div className="bg-amber-50 border border-amber-200 p-5 rounded-3xl mb-4 space-y-3">
            <h3 className="text-xs font-black text-amber-800 flex items-center gap-1.5 uppercase">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              প্রোফাইল তথ্য অসম্পূর্ণ
            </h3>
            <p className="text-[11px] text-amber-700 leading-relaxed font-semibold">
              সমিতি ম্যানেজারের ড্যাশবোর্ড অ্যাক্টিভেশন রিকোয়েস্ট পাঠাতে নিচের সকল তথ্য পূরণ করা বাধ্যতামূলক:
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px] text-slate-600 pt-1 border-t border-amber-200/50">
              <div className="flex items-center gap-1.5">
                <span className={`text-xs ${companyName.trim() ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}`}>
                  {companyName.trim() ? "✓" : "○"}
                </span>
                <span className={companyName.trim() ? "text-slate-700 font-medium" : "text-slate-400"}>কোম্পানির নাম</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs ${companyAddress.trim() ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}`}>
                  {companyAddress.trim() ? "✓" : "○"}
                </span>
                <span className={companyAddress.trim() ? "text-slate-700 font-medium" : "text-slate-400"}>কোম্পানির ঠিকানা</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs ${name.trim() ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}`}>
                  {name.trim() ? "✓" : "○"}
                </span>
                <span className={name.trim() ? "text-slate-700 font-medium" : "text-slate-400"}>মালিকের নাম</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs ${mobile.trim() ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}`}>
                  {mobile.trim() ? "✓" : "○"}
                </span>
                <span className={mobile.trim() ? "text-slate-700 font-medium" : "text-slate-400"}>মোবাইল নম্বর</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs ${dob ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}`}>
                  {dob ? "✓" : "○"}
                </span>
                <span className={dob ? "text-slate-700 font-medium" : "text-slate-400"}>জন্ম তারিখ</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs ${address.trim() ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}`}>
                  {address.trim() ? "✓" : "○"}
                </span>
                <span className={address.trim() ? "text-slate-700 font-medium" : "text-slate-400"}>স্থায়ী ঠিকানা</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs ${nidNumber.trim() ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}`}>
                  {nidNumber.trim() ? "✓" : "○"}
                </span>
                <span className={nidNumber.trim() ? "text-slate-700 font-medium" : "text-slate-400"}>ডকুমেন্ট নম্বর</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs ${profilePic ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}`}>
                  {profilePic ? "✓" : "○"}
                </span>
                <span className={profilePic ? "text-slate-700 font-medium" : "text-slate-400"}>কোম্পানি লোগো / ছবি</span>
              </div>
              <div className="flex items-center gap-1.5 col-span-2">
                <span className={`text-xs ${idFrontUrl ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}`}>
                  {idFrontUrl ? "✓" : "○"}
                </span>
                <span className={idFrontUrl ? "text-slate-700 font-medium" : "text-slate-400"}>পরিচয়পত্র/ট্রেড লাইসেন্স ডকুমেন্ট (সামনে)</span>
              </div>
              <div className="flex items-center gap-1.5 col-span-2">
                <span className={`text-xs ${idBackUrl ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}`}>
                  {idBackUrl ? "✓" : "○"}
                </span>
                <span className={idBackUrl ? "text-slate-700 font-medium" : "text-slate-400"}>পরিচয়পত্র/ট্রেড লাইসেন্স ডকুমেন্ট (পিছনে)</span>
              </div>
            </div>
          </div>
        )}

        {/* Admin Control Panel (Only visible to Admin) */}
        {currentUser.role === "admin" && (
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-5 rounded-3xl shadow-lg border border-indigo-500/20 space-y-4 mb-4">
            <span className="text-[11px] font-bold text-indigo-400 block uppercase tracking-wide">
              🛡️ অ্যাডমিন নিয়ন্ত্রণ প্যানেল (Admin Controls)
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-300 mb-1 ml-1 block">👥 ব্যবহারকারী রোল</label>
                <select
                  value={role}
                  onChange={(e: any) => setRole(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white px-3 py-2.5 rounded-xl font-semibold text-xs outline-none focus:border-indigo-400"
                >
                  <option value="member">মেম্বার (Member)</option>
                  <option value="company">কোম্পানি (Company)</option>
                  <option value="admin">অ্যাডমিন (Admin)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-300 mb-1 ml-1 block">⚙️ অ্যাকাউন্ট স্ট্যাটাস</label>
                <select
                  value={status}
                  onChange={(e: any) => setStatus(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white px-3 py-2.5 rounded-xl font-semibold text-xs outline-none focus:border-indigo-400"
                >
                  <option value="active">সক্রিয় (Active)</option>
                  <option value="pending">পেন্ডিং (Pending)</option>
                  <option value="request">রিকোয়েস্ট (Request)</option>
                  <option value="deactive">নিষ্ক্রিয় (Deactive)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Financial Summary Section for Members */}
        {role !== "company" && targetUser && (
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4 mb-4">
            <span className="text-[11px] font-bold text-indigo-600 block uppercase tracking-wide">
              💰 আর্থিক সারসংক্ষেপ
            </span>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-emerald-50 rounded-2xl p-3 text-center">
                <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">মোট সঞ্চয়</p>
                <p className="text-xl font-bold text-emerald-700">৳{formatBDT(targetUser.amount || 0)}</p>
              </div>
              <div className="bg-indigo-50 rounded-2xl p-3 text-center">
                <p className="text-[9px] font-bold text-indigo-600 uppercase mb-1">মোট কিস্তি</p>
                <p className="text-xl font-bold text-indigo-700">
                  {history.filter((h) => h.type !== "savings_arrears").length} বার
                </p>
              </div>
              <div className="bg-blue-50 rounded-2xl p-3 text-center">
                <p className="text-[9px] font-bold text-blue-600 uppercase mb-1">প্রতি কিস্তি</p>
                <p className="text-xl font-bold text-blue-700">৳{formatBDT(targetUser.investAmount || 0)}</p>
              </div>
              <div className="bg-rose-50 rounded-2xl p-3 text-center">
                <p className="text-[9px] font-bold text-rose-600 uppercase mb-1">সঞ্চয় বকেয়া</p>
                <p className="text-xl font-bold text-rose-700">৳{formatBDT(totalArrears)}</p>
              </div>
            </div>

            <div className="flex gap-1.5 flex-wrap mt-3">
              {targetUser.accountType && (
                <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded-full">
                  {ACCT_LABELS[targetUser.accountType]}
                </span>
              )}
              {targetUser.InvestType && (
                <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-3 py-1 rounded-full">
                  {INVEST_LABELS[targetUser.InvestType]}
                </span>
              )}
              {targetUser.investDate && (
                <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-3 py-1 rounded-full">
                  জমার তারিখ: {targetUser.investDate}
                </span>
              )}
            </div>
          </div>
        )}

        {/* History Log List for Members */}
        {role !== "company" && (
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4 mb-4">
            {/* Elegant Sub-tabs */}
            <div className="flex bg-slate-100 p-1.5 rounded-2xl">
              <button
                onClick={() => setSavingsTab("schedule")}
                className={`flex-1 py-2 text-center text-xs font-bold rounded-xl transition ${
                  savingsTab === "schedule" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                📅 সেভিংস সিডিউল (Schedule)
              </button>
              <button
                onClick={() => setSavingsTab("history")}
                className={`flex-1 py-2 text-center text-xs font-bold rounded-xl transition ${
                  savingsTab === "history" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                📋 জমার ইতিহাস (History)
              </button>
            </div>

            {savingsTab === "schedule" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                    সঞ্চয় জমার তালিকা ও স্থিতি
                  </span>
                  <span className="text-[9px] bg-indigo-50 text-indigo-600 font-extrabold px-2 py-0.5 rounded-full">
                    মোট সঞ্চয়
                  </span>
                </div>
                {getSavingsSchedule().length === 0 ? (
                  <p className="text-center text-slate-400 text-xs py-6">কোনো সেভিংস সিডিউল পাওয়া যায়নি (সঞ্চয়ের ধরণ ও তারিখ সঠিক নয়)</p>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1 space-y-2">
                    {getSavingsSchedule().map((item, index) => {
                      return (
                        <div key={index} className="flex justify-between items-center py-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-800">{item.label}</span>
                              {item.status === "paid" && (
                                <span className="text-[8px] bg-emerald-100 text-emerald-700 font-extrabold px-1.5 py-0.5 rounded-sm">
                                  পরিশোধিত
                                </span>
                              )}
                              {item.status === "overdue" && (
                                <span className="text-[8px] bg-rose-100 text-rose-700 font-extrabold px-1.5 py-0.5 rounded-sm">
                                  বকেয়া
                                </span>
                              )}
                              {item.status === "upcoming" && (
                                <span className="text-[8px] bg-blue-100 text-blue-700 font-extrabold px-1.5 py-0.5 rounded-sm">
                                  আসন্ন
                                </span>
                              )}
                            </div>
                            <p className="text-[9px] text-slate-400 mt-0.5">
                              জমার দিন: প্রতি মাসের {item.dayOfMonth} তারিখ
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={`text-xs font-bold block ${item.status === "paid" ? "text-emerald-600" : item.status === "overdue" ? "text-rose-600" : "text-slate-600"}`}>
                              ৳{formatBDT(item.amount)}
                            </span>
                            {item.payment?.date && (
                              <span className="text-[8px] text-slate-400 block font-mono">
                                জমা: {formatDate(item.payment.date)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                    লেনদেন ও জমার রসিদ সমূহ
                  </span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-600 font-bold px-2.5 py-0.5 rounded-full">
                    {history.length} টি
                  </span>
                </div>
                {history.length === 0 ? (
                  <p className="text-center text-slate-400 text-xs py-6">এখনো কোনো জমা নেই</p>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
                    {history.map((h) => {
                      const isArrears = h.type === "savings_arrears";
                      const amt = isArrears ? Number(h.arrears || 0) : Number(h.amount || 0);

                      return (
                        <div key={h.docId} className="flex justify-between items-center py-2.5">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs font-bold ${isArrears ? "text-rose-600" : "text-slate-800"}`}>
                                {isArrears ? "বকেয়া " : ""}৳{formatBDT(amt)}
                              </span>
                              {!isArrears && h.InvestType && (
                                <span className="text-[8px] bg-slate-100 text-slate-500 font-extrabold px-1.5 py-0.5 rounded-sm uppercase">
                                  {INVEST_LABELS[h.InvestType] || h.InvestType}
                                </span>
                              )}
                              {isArrears && (
                                <span className="text-[8px] bg-rose-100 text-rose-600 font-extrabold px-1.5 py-0.5 rounded-sm uppercase">
                                  বকেয়া
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(h.date)}</p>
                            {h.memo && h.memo !== "N/A" && (
                              <p className="text-[9px] text-slate-500 mt-0.5 truncate max-w-[200px]">{h.memo}</p>
                            )}
                          </div>
                          <div className={`font-bold text-sm ${isArrears ? "text-rose-400" : "text-emerald-500"}`}>
                            {isArrears ? <AlertTriangle className="w-4 h-4" /> : "↑"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Member Installment & Account info */}
        {role !== "company" && (
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4 mb-4">
            <span className="text-[11px] font-bold text-indigo-600 block uppercase tracking-wide">
              ⚙️ অ্যাকাউন্টের ধরন ও কিস্তির তথ্য
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-indigo-500 mb-1 ml-1 block">💳 একাউন্ট টাইপ</label>
                <select
                  disabled={!editable}
                  value={accountType}
                  onChange={(e: any) => setAccountType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl font-semibold text-xs outline-none focus:bg-white focus:border-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  <option value="">নির্বাচন করুন</option>
                  <option value="business">বিজনেস</option>
                  <option value="saving">সেভিংস</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-indigo-500 mb-1 ml-1 block">📅 কিস্তির ধরন</label>
                <select
                  disabled={!editable}
                  value={investType}
                  onChange={(e: any) => setInvestType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl font-semibold text-xs outline-none focus:bg-white focus:border-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  <option value="">নির্বাচন করুন</option>
                  <option value="monthly">মাসিক</option>
                  <option value="yearly">বাৎসরিক</option>
                  <option value="one_time">এককালীন</option>
                </select>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl space-y-3 border border-slate-100">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">কিস্তির বিস্তারিত</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-semibold text-slate-500 mb-0.5 ml-1 block">প্রতি কিস্তি পরিমাণ</label>
                  <input
                    type="number"
                    disabled={!editable}
                    value={investAmount || ""}
                    onChange={(e) => setInvestAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-semibold focus:border-indigo-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-semibold text-slate-500 mb-0.5 ml-1 block">কিস্তি জমার তারিখ</label>
                  <input
                    type="date"
                    disabled={!editable}
                    value={investDate}
                    onChange={(e) => setInvestDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-semibold focus:border-indigo-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Data View Permission Setting */}
            <div className="pt-3 border-t border-slate-100">
              <label className="text-[10px] font-bold text-indigo-500 mb-1 ml-1 block">👁️ ডাটা ভিউ পারমিশন (Data View Permission)</label>
              <select
                disabled={!editable}
                value={canSeeAllData ? "all" : "self"}
                onChange={(e: any) => setCanSeeAllData(e.target.value === "all")}
                className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl font-semibold text-xs outline-none focus:bg-white focus:border-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
              >
                <option value="self">শুধু নিজের ডাটা দেখতে পারবে (Show Only Own Data)</option>
                <option value="all">সকল মেম্বারদের ডাটা দেখতে পারবে (Show All Members' Data)</option>
              </select>
              <p className="text-[9px] text-slate-400 font-bold mt-1.5 ml-1 leading-normal">
                মেম্বার ড্যাশবোর্ডে ও সদস্য তালিকায় অন্য সদস্যদের ডাটা দেখতে পারবে কিনা তা এখান থেকে নির্ধারণ করা যাবে।
              </p>
            </div>
          </div>
        )}

        {/* Company information for Company profile */}
        {role === "company" && (
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3.5 mb-4">
            <span className="text-[11px] font-bold text-indigo-600 block uppercase tracking-wide">
              🏢 কোম্পানির তথ্য
            </span>
            <div>
              <label className="text-[10px] font-bold text-indigo-500 mb-1 ml-1 block">কোম্পানির নাম</label>
              <input
                type="text"
                disabled={!editable}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 disabled:opacity-75"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-indigo-500 mb-1 ml-1 block">কোম্পানি ঠিকানা</label>
              <input
                type="text"
                disabled={!editable}
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 disabled:opacity-75"
              />
            </div>
          </div>
        )}

        {/* Personal & identity info */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4 mb-4">
          <span className="text-[11px] font-bold text-indigo-600 block uppercase tracking-wide">
            👤 ব্যক্তিগত ও পরিচয়পত্র তথ্য
          </span>

          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-semibold text-slate-500 mb-1 ml-1 block">পূর্ণ নাম</label>
              <input
                type="text"
                disabled={!editable}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 disabled:opacity-75"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-semibold text-slate-500 mb-1 ml-1 block">ডকুমেন্ট টাইপ</label>
                <select
                  disabled={!editable}
                  value={nidType}
                  onChange={(e) => setNidType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl font-semibold text-xs focus:bg-white focus:border-indigo-500 disabled:opacity-75"
                >
                  <option value="NID">NID</option>
                  <option value="Birth Certificate">জন্ম সনদ</option>
                  <option value="Birth">জন্ম নিবন্ধন</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-semibold text-slate-500 mb-1 ml-1 block">ডকুমেন্ট নম্বর</label>
                <input
                  type="text"
                  disabled={!editable}
                  value={nidNumber}
                  onChange={(e) => setNidNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 disabled:opacity-75"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-semibold text-slate-500 mb-1 ml-1 block">মোবাইল নম্বর</label>
                <input
                  type="tel"
                  disabled={!editable}
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 disabled:opacity-75"
                />
              </div>
              <div>
                <label className="text-[9px] font-semibold text-slate-500 mb-1 ml-1 block">জন্ম তারিখ</label>
                <input
                  type="date"
                  disabled={!editable}
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 disabled:opacity-75"
                />
              </div>
            </div>

            <div>
              <label className="text-[9px] font-semibold text-slate-500 mb-1 ml-1 block">ইমেইল</label>
              <input
                type="email"
                disabled={!editable}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 disabled:opacity-75"
              />
            </div>

            <div>
              <label className="text-[9px] font-semibold text-slate-500 mb-1 ml-1 block">স্থায়ী ঠিকানা</label>
              <input
                type="text"
                disabled={!editable}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 disabled:opacity-75"
              />
            </div>

            {/* NID Documents */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="text-center p-3 border-2 border-dashed border-slate-200 rounded-2xl relative">
                {editable && (
                  <input
                    type="file"
                    id="idFrontUpload"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleCloudinaryUpload(e.target.files[0], "idFrontUrl")}
                  />
                )}
                <label htmlFor="idFrontUpload" className="cursor-pointer block">
                  <Upload className="w-5 h-5 mx-auto mb-1 text-slate-300" />
                  <span className="text-[10px] font-bold text-slate-400 block">NID সামনে</span>
                </label>
                {idFrontUrl && (
                  <img
                    onClick={() => setLightboxUrl(idFrontUrl)}
                    src={idFrontUrl}
                    className="mt-2 h-14 mx-auto rounded shadow-sm object-cover cursor-pointer hover:opacity-80 transition"
                    alt=""
                  />
                )}
              </div>

              <div className="text-center p-3 border-2 border-dashed border-slate-200 rounded-2xl relative">
                {editable && (
                  <input
                    type="file"
                    id="idBackUpload"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleCloudinaryUpload(e.target.files[0], "idBackUrl")}
                  />
                )}
                <label htmlFor="idBackUpload" className="cursor-pointer block">
                  <Upload className="w-5 h-5 mx-auto mb-1 text-slate-300" />
                  <span className="text-[10px] font-bold text-slate-400 block">NID পিছনে</span>
                </label>
                {idBackUrl && (
                  <img
                    onClick={() => setLightboxUrl(idBackUrl)}
                    src={idBackUrl}
                    className="mt-2 h-14 mx-auto rounded shadow-sm object-cover cursor-pointer hover:opacity-80 transition"
                    alt=""
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Change password only for own profile */}
        {isOwnProfile && (
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4 mb-5">
            <span className="text-[11px] font-bold text-indigo-600 block uppercase tracking-wide">
              🔒 পাসওয়ার্ড পরিবর্তন
            </span>
            <div className="space-y-3 mt-3">
              <input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none"
                placeholder="নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)"
              />
              <input
                type="password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none"
                placeholder="পাসওয়ার্ড নিশ্চিত করুন"
              />
              <button
                onClick={handleChangePassword}
                className="w-full py-3 rounded-2xl border-2 border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition flex items-center justify-center gap-2"
              >
                <Key className="w-4 h-4" /> পাসওয়ার্ড পরিবর্তন করুন
              </button>
            </div>
          </div>
        )}

        {/* Status Message for Requested or Pending Profile */}
        {isOwnProfile && role === "company" && status === "request" && (
          <div className="bg-blue-50 border border-blue-200 p-5 rounded-3xl mb-5 space-y-2 text-center">
            <h3 className="text-sm font-bold text-blue-800 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-5 h-5 text-blue-500" />
              অ্যাক্টিভেশন রিকোয়েস্ট পাঠানো হয়েছে
            </h3>
            <p className="text-xs text-blue-700 leading-relaxed">
              আপনার প্রোফাইল সম্পূর্ণ করে অ্যাক্টিভেশন রিকোয়েস্ট পাঠানো হয়েছে। অ্যাডমিন ভেরিফাই করে শীঘ্রই আপনার অ্যাকাউন্ট অ্যাক্টিভেট করবেন। দয়া করে অপেক্ষা করুন।
            </p>
          </div>
        )}

        {/* Save updates buttons */}
        {editable && (
          <div className="space-y-3 mb-4">
            {role === "company" && isOwnProfile && status === "pending" && (
              <button
                onClick={handleRequestActivation}
                disabled={saving || !isCompanyProfileComplete()}
                className={`w-full font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition active:scale-95 text-white ${
                  isCompanyProfileComplete()
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 cursor-pointer"
                    : "bg-slate-300 cursor-not-allowed opacity-75"
                }`}
              >
                <ShieldCheck className="w-5 h-5" />
                <span>{saving ? "প্রসেস হচ্ছে..." : "অ্যাক্টিভেশন রিকোয়েস্ট পাঠান"}</span>
              </button>
            )}

            {/* Keep the standard save button available for updates */}
            {(!isOwnProfile || status === "pending" || currentUser.role === "admin") && (
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="w-full bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-md transition disabled:opacity-75 disabled:cursor-not-allowed text-xs"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "সেভ হচ্ছে..." : "প্রোফাইল তথ্য আপডেট করুন"}</span>
              </button>
            )}
          </div>
        )}

        {/* Logout */}
        {isOwnProfile && (
          <button
            onClick={() => auth.signOut().then(() => onNavigate("login"))}
            className="w-full border-2 border-red-100 hover:bg-rose-50 text-rose-500 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition text-xs mb-4"
          >
            <LogOut className="w-4 h-4" /> লগআউট
          </button>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 bg-black/95 z-[99999] flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img src={lightboxUrl} className="max-w-full max-h-[90vh] rounded-xl shadow-2xl" alt="Document Fullview" />
        </div>
      )}
    </div>
  );
}
