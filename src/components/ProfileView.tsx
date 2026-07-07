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
  normalizePhoneNumber,
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
  Award,
  Zap,
  CheckCircle,
  Clock,
  Sparkles,
} from "lucide-react";

const writtenArrearsKeysGlobal = new Set<string>();

const toBanglaDigitsLocal = (num: number | string) => {
  const banglaDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return num.toString().replace(/\d/g, (d) => banglaDigits[parseInt(d)]);
};

interface ProfileViewProps {
  currentUser: User;
  targetId?: string | null;
  onNavigate: (view: string, params?: any) => void;
  totalEntries?: number;
}

export default function ProfileView({ currentUser, targetId, onNavigate, totalEntries = 0 }: ProfileViewProps) {
  const [loading, setLoading] = useState(true);
  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [totalArrears, setTotalArrears] = useState(0);

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
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

  // Guardian info state variables
  const [guardianRelation, setGuardianRelation] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianNid, setGuardianNid] = useState("");
  const [guardianAddress, setGuardianAddress] = useState("");

  // Company-only form states
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");

  // Images state
  const [profilePic, setProfilePic] = useState("");
  const [idFrontUrl, setIdFrontUrl] = useState("");
  const [idBackUrl, setIdBackUrl] = useState("");

  // Lightbox modal state
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingsTab, setSavingsTab] = useState<"schedule" | "history">("schedule");

  // Subscription / Billing States
  const [showBillingForm, setShowBillingForm] = useState(false);
  const [billingPlan, setBillingPlan] = useState<"monthly" | "yearly">("monthly");
  const [billingGateway, setBillingGateway] = useState<"bkash" | "nagad">("bkash");
  const [billingPhone, setBillingPhone] = useState("");
  const [billingTxId, setBillingTxId] = useState("");
  const [billingSubmitting, setBillingSubmitting] = useState(false);

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
          setWhatsapp(d.whatsapp || "");
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
          setGuardianRelation(d.guardianRelation || "");
          setGuardianName(d.guardianName || "");
          setGuardianNid(d.guardianNid || "");
          setGuardianAddress(d.guardianAddress || "");

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
      while (cur <= today) {
        const key = `arrears-${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
        const cacheKey = `${userId}-${key}`;
        if (!existingKeys.has(key) && !writtenArrearsKeysGlobal.has(cacheKey)) {
          // Check if a real payment was made this month
          const hasPayment = existingDocs.some((h) => {
            if (h.type === "savings_arrears") return false;
            if (!h.date) return false;
            const hd = new Date(h.date);
            return hd.getFullYear() === cur.getFullYear() && hd.getMonth() === cur.getMonth();
          });
          if (!hasPayment) {
            writtenArrearsKeysGlobal.add(cacheKey);
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
      while (curYear <= today.getFullYear()) {
        const key = `arrears-${curYear}`;
        const cacheKey = `${userId}-${key}`;
        if (!existingKeys.has(key) && !writtenArrearsKeysGlobal.has(cacheKey)) {
          const hasPayment = existingDocs.some((h) => {
            if (h.type === "savings_arrears") return false;
            if (!h.date) return false;
            return new Date(h.date).getFullYear() === curYear;
          });
          if (!hasPayment) {
            writtenArrearsKeysGlobal.add(cacheKey);
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
    if (nidNumber.trim()) {
      const cleanNid = nidNumber.replace(/\D/g, "");
      if (cleanNid.length < 10 || cleanNid.length > 17) {
        showToast("❌ পরিচয়পত্র নম্বরটি ১০ থেকে ১৭ ডিজিটের হতে হবে", "error");
        return;
      }
    }
    setSaving(true);
    try {
      const normMobile = normalizePhoneNumber(mobile);
      const normWhatsapp = whatsapp.trim() ? normalizePhoneNumber(whatsapp) : "";
      
      const activeId = targetId || currentUser.docId;
      const updateObj: Record<string, any> = {
        name: name.trim(),
        nidType,
        nidNumber: nidNumber.trim(),
        email: email.trim(),
        mobile: normMobile,
        whatsapp: normWhatsapp,
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
        guardianRelation: guardianRelation.trim(),
        guardianName: guardianName.trim(),
        guardianNid: guardianNid.trim(),
        guardianAddress: guardianAddress.trim(),
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
    if (nidNumber.trim()) {
      const cleanNid = nidNumber.replace(/\D/g, "");
      if (cleanNid.length < 10 || cleanNid.length > 17) {
        showToast("❌ পরিচয়পত্র নম্বরটি ১০ থেকে ১৭ ডিজিটের হতে হবে", "error");
        return;
      }
    }
    setSaving(true);
    try {
      const normMobile = normalizePhoneNumber(mobile);
      const normWhatsapp = whatsapp.trim() ? normalizePhoneNumber(whatsapp) : "";
      const activeId = targetId || currentUser.docId;
      const updateObj: Record<string, any> = {
        name: name.trim(),
        nidType,
        nidNumber: nidNumber.trim(),
        email: email.trim(),
        mobile: normMobile,
        whatsapp: normWhatsapp,
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

      // Create admin notification
      await addDoc(collection(db, "notifications"), {
        title: `${companyName.trim() || name.trim()} অ্যাক্টিভেশন রিকোয়েস্ট পাঠিয়েছে`,
        body: `${name.trim()} (${companyName.trim()}) তাদের কোম্পানি আইডি অ্যাক্টিভেট করার জন্য রিকোয়েস্ট পাঠিয়েছে। অনুগ্রহ করে মেম্বার লিস্টে গিয়ে ভেরিফাই এবং অ্যাক্টিভেট করুন।`,
        senderId: activeId,
        senderName: companyName.trim() || name.trim(),
        senderRole: "company",
        targetType: "admin",
        createdAt: new Date().toISOString(),
        readBy: [],
      });

      showToast("✅ অ্যাক্টিভেশন রিকোয়েস্ট সফলভাবে পাঠানো হয়েছে!");
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      console.error(e);
      showToast("❌ রিকোয়েস্ট পাঠাতে ব্যর্থ হয়েছে!", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitUpgradeRequest = async () => {
    if (!billingPhone || billingPhone.trim().length < 11) {
      showToast("❌ সঠিক বিকাশ/নগদ নম্বর লিখুন", "error");
      return;
    }
    if (!billingTxId || billingTxId.trim().length < 8) {
      showToast("❌ সঠিক ট্রানজেকশন আইডি (TxID) লিখুন", "error");
      return;
    }

    setBillingSubmitting(true);
    try {
      const activeId = targetId || currentUser.docId;
      const upgradeObj = {
        planRequested: billingPlan,
        planRequestTxId: billingTxId.trim(),
        planRequestMobile: billingPhone.trim(),
        planRequestAmount: billingPlan === "monthly" ? 500 : 5000,
        planRequestAt: Date.now(),
      };

      await updateDoc(doc(db, "users", activeId), upgradeObj);

      // Create admin notification
      await addDoc(collection(db, "notifications"), {
        title: `${companyName || name} সাবস্ক্রিপশন রিকোয়েস্ট পাঠিয়েছে`,
        body: `${companyName || name} তাদের সাবস্ক্রিপশন প্ল্যান ${billingPlan === "monthly" ? "মাসিক (৳৫০০)" : "বাৎসরিক (৳৫০০০)"} এ আপগ্রেড করার জন্য আবেদন করেছে। পেমেন্ট নম্বর: ${billingPhone}, TrxID: ${billingTxId}`,
        senderId: activeId,
        senderName: companyName || name,
        senderRole: "company",
        targetType: "admin",
        createdAt: new Date().toISOString(),
        readBy: [],
      });

      showToast("✅ সাবস্ক্রিপশন রিকোয়েস্ট সফলভাবে পাঠানো হয়েছে!");
      setShowBillingForm(false);
      setBillingPhone("");
      setBillingTxId("");
      
      // Force trigger state reload if targetUser is present
      if (targetUser) {
        setTargetUser({
          ...targetUser,
          ...upgradeObj,
        });
      }
    } catch (err) {
      console.error(err);
      showToast("❌ রিকোয়েস্ট পাঠাতে ব্যর্থ হয়েছে!", "error");
    } finally {
      setBillingSubmitting(false);
    }
  };

  const handleInstantSimulatorUpgrade = async (planType: "monthly" | "yearly") => {
    setBillingSubmitting(true);
    try {
      const activeId = targetId || currentUser.docId;
      const days = planType === "monthly" ? 30 : 365;
      const expireTime = Date.now() + days * 24 * 60 * 60 * 1000;

      const premiumObj = {
        plan: planType,
        planActiveUntil: expireTime,
        planRequested: null,
        planRequestTxId: "",
        planRequestMobile: "",
        planRequestAmount: 0,
        planRequestAt: 0,
      };

      await updateDoc(doc(db, "users", activeId), premiumObj);
      showToast(`⚡ সিমুলেটর: সফলভাবে ${planType === "monthly" ? "মাসিক" : "বাৎসরিক"} প্রিমিয়াম একটিভ হয়েছে!`);
      
      if (targetUser) {
        setTargetUser({
          ...targetUser,
          ...premiumObj,
        });
      }
    } catch (err) {
      console.error(err);
      showToast("❌ সিমুলেশন অ্যাক্টিভেশন ব্যর্থ হয়েছে", "error");
    } finally {
      setBillingSubmitting(false);
    }
  };

  const handleCancelUpgrade = async () => {
    setBillingSubmitting(true);
    try {
      const activeId = targetId || currentUser.docId;
      const cancelObj = {
        planRequested: null,
        planRequestTxId: "",
        planRequestMobile: "",
        planRequestAmount: 0,
        planRequestAt: 0,
      };

      await updateDoc(doc(db, "users", activeId), cancelObj);
      showToast("✅ পেন্ডিং রিকোয়েস্ট বাতিল করা হয়েছে");
      
      if (targetUser) {
        setTargetUser({
          ...targetUser,
          ...cancelObj,
        });
      }
    } catch (err) {
      console.error(err);
      showToast("❌ রিকোয়েস্ট বাতিল করা যায়নি", "error");
    } finally {
      setBillingSubmitting(false);
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
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px] text-slate-600 pt-1 border-t border-amber-200/50 font-medium">
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
                <span className={nidNumber.trim() ? "text-slate-700 font-medium" : "text-slate-400"}>এনআইডি নম্বর</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs ${profilePic ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}`}>
                  {profilePic ? "✓" : "○"}
                </span>
                <span className={profilePic ? "text-slate-700 font-medium" : "text-slate-400"}>প্রোফাইল ছবি</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs ${idFrontUrl ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}`}>
                  {idFrontUrl ? "✓" : "○"}
                </span>
                <span className={idFrontUrl ? "text-slate-700 font-medium" : "text-slate-400"}>NID সামনে</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs ${idBackUrl ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}`}>
                  {idBackUrl ? "✓" : "○"}
                </span>
                <span className={idBackUrl ? "text-slate-700 font-medium" : "text-slate-400"}>NID পিছনে</span>
              </div>
            </div>
          </div>
        )}

        {/* Account Status Setting - Only visible to Admin or Company if editing someone else's profile */}
        {isAdminOrCompany && !isOwnProfile && (
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3 mb-4">
            <span className="text-[11px] font-bold text-indigo-600 block uppercase tracking-wide">
              ⚙️ অ্যাকাউন্ট স্ট্যাটাস
            </span>
            <div>
              <label className="text-[10px] font-bold text-indigo-500 mb-1 ml-1 block">স্ট্যাটাস নির্ধারণ করুন</label>
              <select
                disabled={!editable}
                value={status}
                onChange={(e: any) => setStatus(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl font-semibold text-xs outline-none focus:bg-white focus:border-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
              >
                <option value="active">সক্রিয় (Active)</option>
                <option value="pending">পেন্ডিং (Pending)</option>
                <option value="request">রিকোয়েস্ট (Request)</option>
                <option value="deactive">নিষ্ক্রিয় (Deactive)</option>
              </select>
            </div>
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

            {/* Data View Permission Setting - Only visible to Admin or Company when editing a member profile */}
            {isAdminOrCompany && (
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
            )}
          </div>
        )}

        {/* Subscription / Billing Section (Only for Company viewing own profile) */}
        {role === "company" && isOwnProfile && (
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4 mb-4 relative overflow-hidden">
            {/* Top background glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                💎 সাবস্ক্রিপশন প্ল্যান ও বিলিং
              </span>
              <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold ${
                targetUser?.plan === "monthly" || targetUser?.plan === "yearly"
                  ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}>
                {targetUser?.plan === "monthly" 
                  ? "মাসিক প্রিমিয়াম" 
                  : targetUser?.plan === "yearly" 
                  ? "বাৎসরিক প্রিমিয়াম" 
                  : "ফ্রি প্ল্যান"}
              </span>
            </div>

            {/* If Premium Active */}
            {(targetUser?.plan === "monthly" || targetUser?.plan === "yearly") && (
              <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-2xl space-y-2">
                <div className="flex items-start gap-2.5">
                  <div className="bg-indigo-500 p-1.5 rounded-xl text-white shrink-0 mt-0.5">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-indigo-900 leading-tight">
                      প্রিমিয়াম প্ল্যান সক্রিয় রয়েছে!
                    </h4>
                    <p className="text-[10px] text-indigo-700/80 font-bold mt-0.5">
                      আপনার সিস্টেমে আনলিমিটেড মেম্বার এবং ট্রানজেকশন এন্ট্রি সক্রিয় আছে।
                    </p>
                  </div>
                </div>

                {targetUser?.planActiveUntil && (
                  <div className="pt-2 border-t border-indigo-100 flex items-center justify-between text-[9px] font-semibold text-indigo-600">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      মেয়াদ শেষ হবে:
                    </span>
                    <span className="font-mono">
                      {new Date(targetUser.planActiveUntil).toLocaleDateString("bn-BD", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* If Free Plan */}
            {(!targetUser?.plan || targetUser?.plan === "free") && (
              <div className="space-y-3">
                <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center text-[11px] font-bold text-slate-700">
                    <span>📊 ফ্রি প্ল্যান ব্যবহারের প্রগ্রেস</span>
                    <span className="font-mono text-xs">
                      {toBanglaDigitsLocal(totalEntries)} / ৫০ টি এন্ট্রি
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        totalEntries >= 45 
                          ? "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" 
                          : totalEntries >= 35 
                          ? "bg-amber-500" 
                          : "bg-indigo-600"
                      }`}
                      style={{ width: `${Math.min(100, (totalEntries / 50) * 100)}%` }}
                    />
                  </div>

                  {totalEntries >= 50 ? (
                    <p className="text-[10px] text-rose-600 font-bold leading-normal flex items-start gap-1">
                      <span className="shrink-0">⚠️</span>
                      আপনার ফ্রি প্ল্যানের ৫০ টি এন্ট্রি সীমা পূর্ণ হয়েছে! নতুন মেম্বার বা ট্রানজেকশন যোগ করতে প্ল্যান আপগ্রেড করুন।
                    </p>
                  ) : totalEntries >= 40 ? (
                    <p className="text-[10px] text-amber-600 font-bold leading-normal flex items-start gap-1">
                      <span className="shrink-0">⚠️</span>
                      আপনি সীমার কাছাকাছি আছেন। দ্রুত মেম্বার বা ট্রানজেকশন যোগ করতে প্রিমিয়াম প্ল্যানে আপগ্রেড করুন।
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-400 font-medium leading-normal">
                      ফ্রি প্ল্যানে সর্বোচ্চ ৫০ টি ডাটা এন্ট্রি (মেম্বার, কিস্তি, ডিপোজিট, ট্রানজেকশন) করতে পারবেন।
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Pending Activation Request */}
            {targetUser?.planRequested && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-2">
                <div className="flex items-start gap-2 text-amber-800">
                  <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <h4 className="text-xs font-bold uppercase leading-tight text-amber-900">
                      আপগ্রেড রিকোয়েস্ট পেন্ডিং
                    </h4>
                    <p className="text-[10px] text-amber-700 leading-normal mt-0.5">
                      আপনি <b>{targetUser.planRequested === "monthly" ? "মাসিক" : "বাৎসরিক"}</b> প্ল্যানটির জন্য রিকোয়েস্ট করেছেন। অ্যাডমিন খুব শীঘ্রই এটি ভেরিফাই করে সক্রিয় করবেন।
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-amber-200/50 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-amber-700 font-semibold font-mono">
                  <span>পেমেন্ট নং: {targetUser.planRequestMobile}</span>
                  <span>TxID: {targetUser.planRequestTxId}</span>
                </div>

                <button
                  disabled={billingSubmitting}
                  onClick={handleCancelUpgrade}
                  className="w-full bg-amber-200/60 hover:bg-amber-200 hover:text-amber-900 border border-amber-300 text-amber-800 py-1.5 rounded-xl text-[10px] font-bold transition active:scale-98 cursor-pointer"
                >
                  {billingSubmitting ? "অনুরোধ বাতিল হচ্ছে..." : "রিকোয়েস্ট বাতিল করুন"}
                </button>
              </div>
            )}

            {/* Upgrade Plan Buttons & Accordion */}
            {!targetUser?.planRequested && (
              <div className="space-y-3 pt-1">
                {!showBillingForm ? (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        setBillingPlan("monthly");
                        setShowBillingForm(true);
                      }}
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-3 py-3 rounded-2xl text-xs font-bold text-center shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/25 active:scale-95 transition-all cursor-pointer flex flex-col items-center justify-center gap-1"
                    >
                      <Zap className="w-4 h-4 text-amber-300 fill-amber-300 animate-pulse" />
                      <span>মাসিক প্ল্যান</span>
                      <span className="text-[9px] opacity-90 font-mono font-black">৳৫০০ / মাস</span>
                    </button>

                    <button
                      onClick={() => {
                        setBillingPlan("yearly");
                        setShowBillingForm(true);
                      }}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-3 py-3 rounded-2xl text-xs font-bold text-center shadow-lg shadow-pink-500/10 hover:shadow-pink-500/25 active:scale-95 transition-all cursor-pointer flex flex-col items-center justify-center gap-1 relative overflow-hidden"
                    >
                      {/* Ribbon / Badge */}
                      <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-950 font-black text-[7px] px-2 py-0.5 rounded-bl-lg transform uppercase tracking-widest scale-95 origin-top-right">
                        ২ মাস ফ্রি
                      </div>
                      <Sparkles className="w-4 h-4 text-yellow-300" />
                      <span>বাৎসরিক প্ল্যান</span>
                      <span className="text-[9px] opacity-90 font-mono font-black">৳৫০০০ / বছর</span>
                    </button>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-indigo-100 p-4 rounded-2xl space-y-3.5 relative">
                    <button
                      onClick={() => setShowBillingForm(false)}
                      className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    <div className="text-center pb-2 border-b border-slate-200">
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center justify-center gap-1">
                        💳 {billingPlan === "monthly" ? "মাসিক প্ল্যান (৳৫০০)" : "বাৎসরিক প্ল্যান (৳৫০০০)"} আপগ্রেড
                      </h4>
                      <p className="text-[9px] text-slate-500 font-bold mt-1">বিকাশ বা নগদ এর মাধ্যমে টাকা পাঠিয়ে পেমেন্ট সম্পন্ন করুন।</p>
                    </div>

                    {/* Step 1: Gateway Selection */}
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase ml-1">১. পেমেন্ট গেটওয়ে নির্বাচন করুন</span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setBillingGateway("bkash")}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border cursor-pointer ${
                            billingGateway === "bkash"
                              ? "bg-pink-50 text-pink-700 border-pink-400"
                              : "bg-white text-slate-600 border-slate-200"
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-pink-500 animate-ping"></span>
                          বিকাশ (bKash)
                        </button>
                        <button
                          type="button"
                          onClick={() => setBillingGateway("nagad")}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border cursor-pointer ${
                            billingGateway === "nagad"
                              ? "bg-orange-50 text-orange-700 border-orange-400"
                              : "bg-white text-slate-600 border-slate-200"
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping"></span>
                          নগদ (Nagad)
                        </button>
                      </div>
                    </div>

                    {/* Step 2: Payment Instructions */}
                    <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 space-y-1">
                      <p className="text-[10px] text-slate-700 leading-normal font-semibold">
                        📲 নিচের <b>Personal</b> নম্বরে <span className="text-indigo-600 underline font-black">{billingPlan === "monthly" ? "৳৫০০" : "৳৫০০০"}</span> টাকা <b>Send Money</b> করুন:
                      </p>
                      <div className="flex items-center justify-between text-xs bg-white px-3 py-2 rounded-lg border border-slate-200 font-mono font-bold text-slate-800">
                        <span>{billingGateway === "bkash" ? "01789-123456" : "01987-654321"}</span>
                        <span className="text-[9px] bg-indigo-100 text-indigo-700 font-sans px-1.5 py-0.5 rounded-full">পার্সোনাল</span>
                      </div>
                    </div>

                    {/* Step 3: Payment details inputs */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 mb-1 ml-1 block">আপনার নম্বর</label>
                        <input
                          type="tel"
                          placeholder="017xxxxxxxx"
                          value={billingPhone}
                          onChange={(e) => setBillingPhone(e.target.value)}
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 mb-1 ml-1 block">ট্রানজেকশন আইডি (TxID)</label>
                        <input
                          type="text"
                          placeholder="8J2K9L4M"
                          value={billingTxId}
                          onChange={(e) => setBillingTxId(e.target.value)}
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 uppercase"
                        />
                      </div>
                    </div>

                    {/* Submission button */}
                    <button
                      type="button"
                      disabled={billingSubmitting}
                      onClick={handleSubmitUpgradeRequest}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-2.5 rounded-xl text-xs font-bold tracking-wide transition active:scale-98 shadow-md cursor-pointer disabled:opacity-75"
                    >
                      {billingSubmitting ? "রিকোয়েস্ট সাবমিট হচ্ছে..." : "পেমেন্ট নিশ্চিতকরণ ও সাবমিট"}
                    </button>

                    {/* Simulator Button - Best DX ever! */}
                    <div className="pt-2 border-t border-slate-200/50 flex flex-col gap-1.5">
                      <p className="text-[8px] text-slate-400 font-black text-center uppercase tracking-widest">
                        ⚙️ Developer Preview Simulator
                      </p>
                      <button
                        type="button"
                        disabled={billingSubmitting}
                        onClick={() => handleInstantSimulatorUpgrade(billingPlan)}
                        className="w-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 py-2 rounded-xl text-[10px] font-black transition active:scale-98 cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                        <span>সরাসরি টেস্ট করার জন্য অ্যাক্টিভেট করুন (সিমুলেটর)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
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
                  onChange={(e) => setNidNumber(e.target.value.replace(/\D/g, "").slice(0, 17))}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 disabled:opacity-75"
                  placeholder="১০-১৭ ডিজিট"
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
                <label className="text-[9px] font-semibold text-slate-500 mb-1 ml-1 block">হোয়াটসঅ্যাপ নম্বর</label>
                <input
                  type="tel"
                  disabled={!editable}
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 disabled:opacity-75"
                  placeholder="যেমন: +8801700000000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
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
              <div>
                <label className="text-[9px] font-semibold text-slate-500 mb-1 ml-1 block">ইমেইল</label>
                <input
                  type="email"
                  disabled={!editable}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 disabled:opacity-75"
                />
              </div>
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

            {role !== "company" && (
              <div className="border-t border-slate-100 pt-4 mt-2 space-y-3">
                <span className="text-[10px] font-extrabold text-indigo-600 block uppercase tracking-wide">
                  👥 অভিভাবকের তথ্য (Guardian Information)
                </span>

                <div>
                  <label className="text-[9px] font-semibold text-slate-500 mb-1 ml-1 block">অভিভাবকের নাম</label>
                  <input
                    type="text"
                    disabled={!editable}
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 disabled:opacity-75"
                    placeholder="অভিভাবকের নাম"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-semibold text-slate-500 mb-1 ml-1 block">অভিভাবকের সাথে সম্পর্ক</label>
                    <select
                      disabled={!editable}
                      value={guardianRelation}
                      onChange={(e) => setGuardianRelation(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl font-semibold text-xs focus:bg-white focus:border-indigo-500 disabled:opacity-75"
                    >
                      <option value="">নির্বাচন করুন</option>
                      <option value="পিতা">পিতা</option>
                      <option value="মাতা">মাতা</option>
                      <option value="স্বামী">স্বামী</option>
                      <option value="স্ত্রী">স্ত্রী</option>
                      <option value="ভাই">ভাই</option>
                      <option value="বোন">বোন</option>
                      <option value="অন্যান্য">অন্যান্য</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-semibold text-slate-500 mb-1 ml-1 block">অভিভাবকের এনআইডি নম্বর</label>
                    <input
                      type="text"
                      disabled={!editable}
                      value={guardianNid}
                      onChange={(e) => setGuardianNid(e.target.value.replace(/\D/g, "").slice(0, 17))}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 disabled:opacity-75"
                      placeholder="১০-১৭ ডিজিট"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-semibold text-slate-500 mb-1 ml-1 block">অভিভাবকের ঠিকানা</label>
                  <textarea
                    disabled={!editable}
                    value={guardianAddress}
                    onChange={(e) => setGuardianAddress(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-semibold focus:bg-white focus:border-indigo-500 disabled:opacity-75 resize-none"
                    placeholder="অভিভাবকের বিস্তারিত ঠিকানা..."
                  />
                </div>
              </div>
            )}

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
