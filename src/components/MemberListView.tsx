import { useState, useEffect } from "react";
import { collection, doc, deleteDoc, updateDoc, onSnapshot, getDocs, addDoc } from "firebase/firestore";
import { db } from "../firebase";
import { User } from "../types";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  ROLE_LABELS,
  ACCT_LABELS,
  INVEST_LABELS,
  formatBDT,
} from "../utils/firestore";
import { Search, Plus, ArrowLeft, Trash2, ToggleRight, User as UserIcon } from "lucide-react";

interface MemberListViewProps {
  currentUser: User;
  onNavigate: (view: string, params?: any) => void;
}

export default function MemberListView({ currentUser, onNavigate }: MemberListViewProps) {
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedCompany, setSelectedCompany] = useState<string>("all");

  // Modals/Overlays
  const [statusTarget, setStatusTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [arrearsMap, setArrearsMap] = useState<Record<string, number>>({});
  const [arrearsLoading, setArrearsLoading] = useState(false);

  const toBanglaDigits = (num: number | string) => {
    const banglaDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
    return num.toString().replace(/\d/g, (d) => banglaDigits[parseInt(d)]);
  };

  const getSavingsSchedulePreview = (investType?: string, investDate?: string) => {
    if (!investType || !investDate) return <span className="text-slate-400 text-[10px]">—</span>;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let target: Date;
    let diffDays = 0;

    if (investType === "monthly") {
      const selectedDay = parseInt(investDate, 10);
      if (isNaN(selectedDay) || selectedDay < 1 || selectedDay > 31) return <span className="text-slate-400 text-[10px]">—</span>;

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
      if (isNaN(target.getTime())) return <span className="text-slate-400 text-[10px]">—</span>;

      const diffTime = target.getTime() - today.getTime();
      diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    const typeLabel = investType === "monthly" ? "মাসিক" : investType === "yearly" ? "বাৎসরিক" : "এককালীন";
    const daysStr = toBanglaDigits(Math.abs(diffDays));

    if (diffDays < 0) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-semibold border border-amber-100">
          ⚠️ তারিখ পার
        </span>
      );
    }

    return (
      <div className="font-sans text-[11px] leading-tight">
        <div className="font-bold text-slate-800">
          {investType === "monthly" ? `${toBanglaDigits(investDate)} তারিখ` : investDate}
        </div>
        <div className="text-[10px] mt-0.5">
          {diffDays === 0 ? (
            <span className="text-emerald-600 font-bold bg-emerald-50 px-1 py-0.2 rounded border border-emerald-100/50">আজই জমার দিন</span>
          ) : (
            <span className="text-slate-500 font-medium">
              আর <span className="font-extrabold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-100/60">{daysStr} দিন</span> বাকি
            </span>
          )}
        </div>
      </div>
    );
  };

  useEffect(() => {
    setLoading(true);
    // Realtime listeners
    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const usersList: User[] = [];
      const companyList: { id: string; name: string }[] = [];

      snapshot.forEach((d) => {
        const u = { docId: d.id, ...d.data() } as User;
        usersList.push(u);
        if (u.role === "company") {
          companyList.push({ id: d.id, name: u.companyName || u.name || d.id });
        }
      });

      // Filter based on loggedIn user role
      let filtered: User[] = [];
      if (currentUser.role === "admin") {
        // Admin sees all companies and members
        filtered = usersList.filter((u) => u.role === "member" || u.role === "company");
      } else if (currentUser.role === "company") {
        // Company sees only their members
        filtered = usersList.filter((u) => u.companyId === currentUser.docId && u.role === "member");
      } else if (currentUser.role === "member") {
        // Member sees depending on permission
        if (currentUser.canSeeAllData) {
          filtered = usersList.filter((u) => u.companyId === currentUser.companyId && u.role === "member");
        } else {
          filtered = usersList.filter((u) => u.docId === currentUser.docId);
        }
      }

      // Sort by creation time desc
      filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      setAllUsers(filtered);
      setCompanies(companyList);
      setLoading(false);
    });

    return () => unsub();
  }, [currentUser]);

  useEffect(() => {
    if (allUsers.length === 0) {
      setArrearsMap({});
      return;
    }

    let isMounted = true;
    const fetchArrears = async () => {
      setArrearsLoading(true);
      const tempMap: Record<string, number> = {};
      
      try {
        await Promise.all(
          allUsers.map(async (u) => {
            if (u.role === "company") return;
            try {
              const histSnap = await getDocs(collection(db, "users", u.docId, "history"));
              let total = 0;
              histSnap.forEach((doc) => {
                const h = doc.data();
                if (h.type === "savings_arrears") {
                  total += Number(h.arrears || 0);
                }
              });
              tempMap[u.docId] = total;
            } catch (err) {
              console.error("Error fetching arrears for user", u.docId, err);
            }
          })
        );
      } catch (err) {
        console.error("Error fetching arrears batch", err);
      }

      if (isMounted) {
        setArrearsMap(tempMap);
        setArrearsLoading(false);
      }
    };

    fetchArrears();
    return () => {
      isMounted = false;
    };
  }, [allUsers]);

  const handleStatusChange = async (newStatus: "active" | "pending" | "request" | "deactive") => {
    if (!statusTarget) return;
    setActionLoading(true);
    try {
      await updateDoc(doc(db, "users", statusTarget.docId), { status: newStatus });
      setStatusTarget(null);
    } catch (e) {
      console.error(e);
      alert("স্ট্যাটাস আপডেট করা যায়নি");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      // 1. Delete history subcollection documents
      const histSnap = await getDocs(collection(db, "users", deleteTarget.docId, "history"));
      for (const d of histSnap.docs) {
        await deleteDoc(d.ref);
      }
      // 2. Delete user document
      await deleteDoc(doc(db, "users", deleteTarget.docId));
      setDeleteTarget(null);
    } catch (e) {
      console.error(e);
      alert("ডিলিট করা যায়নি");
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveSubscription = async (user: User) => {
    if (!window.confirm(`আপনি কি এই কোম্পানির ${user.planRequested === "monthly" ? "মাসিক" : "বাৎসরিক"} সাবস্ক্রিপশন সফলভাবে সক্রিয় করতে চান?`)) {
      return;
    }
    setActionLoading(true);
    try {
      const planRequested = user.planRequested || "monthly";
      const days = planRequested === "monthly" ? 30 : 365;
      const expireTime = Date.now() + days * 24 * 60 * 60 * 1000;

      await updateDoc(doc(db, "users", user.docId), {
        plan: planRequested,
        planActiveUntil: expireTime,
        planRequested: null,
        planRequestTxId: "",
        planRequestMobile: "",
        planRequestAmount: 0,
        planRequestAt: 0,
      });

      // Send a notification to the company
      await addDoc(collection(db, "notifications"), {
        title: "🎉 অভিনন্দন! আপনার সাবস্ক্রিপশন অ্যাক্টিভ হয়েছে",
        body: `আপনার ${planRequested === "monthly" ? "মাসিক" : "বাৎসরিক"} প্রিমিয়াম সাবস্ক্রিপশন প্ল্যানটি সফলভাবে ভেরিফাই করে সক্রিয় করা হয়েছে। এখন থেকে আনলিমিটেড সার্ভিস ব্যবহার করতে পারবেন।`,
        senderId: currentUser.docId,
        senderName: "Admin",
        senderRole: "admin",
        targetType: "company",
        targetUserId: user.docId,
        createdAt: new Date().toISOString(),
        readBy: [],
      });

      alert("সাবস্ক্রিপশন সফলভাবে সক্রিয় করা হয়েছে!");
    } catch (e) {
      console.error(e);
      alert("সাবস্ক্রিপশন সক্রিয় করা যায়নি");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubscription = async (user: User) => {
    if (!window.confirm("আপনি কি এই কোম্পানির সাবস্ক্রিপশন রিকোয়েস্ট বাতিল করতে চান?")) {
      return;
    }
    setActionLoading(true);
    try {
      await updateDoc(doc(db, "users", user.docId), {
        planRequested: null,
        planRequestTxId: "",
        planRequestMobile: "",
        planRequestAmount: 0,
        planRequestAt: 0,
      });

      // Send notification to company
      await addDoc(collection(db, "notifications"), {
        title: "⚠️ সাবস্ক্রিপশন রিকোয়েস্ট বাতিল করা হয়েছে",
        body: "দুঃখিত, আপনার সাবস্ক্রিপশন রিকোয়েস্টটি বাতিল করা হয়েছে। অনুগ্রহ করে সঠিক ট্রানজেকশন তথ্য দিয়ে আবার চেষ্টা করুন বা অ্যাডমিনের সাথে যোগাযোগ করুন।",
        senderId: currentUser.docId,
        senderName: "Admin",
        senderRole: "admin",
        targetType: "company",
        targetUserId: user.docId,
        createdAt: new Date().toISOString(),
        readBy: [],
      });

      alert("রিকোয়েস্ট সফলভাবে বাতিল করা হয়েছে");
    } catch (e) {
      console.error(e);
      alert("রিকোয়েস্ট বাতিল করা যায়নি");
    } finally {
      setActionLoading(false);
    }
  };

  // Filter application
  const filteredList = allUsers.filter((u) => {
    // Search filter
    const matchesSearch =
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.mobile?.includes(searchQuery) ||
      u.userId?.toLowerCase().includes(searchQuery.toLowerCase());

    // Status filter
    const matchesStatus =
      selectedStatus === "all" ||
      (selectedStatus === "subscription" ? !!u.planRequested : u.status === selectedStatus);

    // Company filter (For Admin only)
    const matchesCompany =
      currentUser.role !== "admin" ||
      selectedCompany === "all" ||
      u.companyId === selectedCompany ||
      u.docId === selectedCompany;

    return matchesSearch && matchesStatus && matchesCompany;
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 rounded-b-3xl shadow-lg mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">সদস্য তালিকা</h1>
          <p className="text-xs text-blue-100 mt-0.5">
            {loading ? "লোড হচ্ছে..." : `মোট ${filteredList.length} জন`}
          </p>
        </div>
        <div className="flex gap-2">
          {currentUser.role !== "member" && (
            <button
              onClick={() => onNavigate("member-add")}
              className="text-xs bg-white text-blue-600 hover:bg-blue-50 transition px-3 py-1.5 rounded-full font-bold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> নতুন
            </button>
          )}
          <button
            onClick={() => onNavigate("dashboard")}
            className="text-xs bg-white/20 hover:bg-white/30 transition px-3 py-1.5 rounded-full font-semibold flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> ড্যাশবোর্ড
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="নাম বা ফোন বা ইউজার আইডি দিয়ে খুঁজুন..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none text-sm font-medium shadow-sm focus:border-blue-400"
          />
        </div>

        {/* Company Filters (Admin only) */}
        {currentUser.role === "admin" && companies.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">কোম্পানি ফিল্টার</p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setSelectedCompany("all")}
                className={`text-[11px] px-3.5 py-1.5 rounded-full font-bold transition whitespace-nowrap shrink-0 ${
                  selectedCompany === "all" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200"
                }`}
              >
                সব কোম্পানি
              </button>
              {companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCompany(c.id)}
                  className={`text-[11px] px-3.5 py-1.5 rounded-full font-bold transition whitespace-nowrap shrink-0 ${
                    selectedCompany === c.id ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status Overview Grid */}
        <div className="bg-white p-4.5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">সদস্য স্ট্যাটাস সারসংক্ষেপ</span>
            {allUsers.filter((u) => u.status === "request").length > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[9px] font-bold animate-pulse border border-blue-100">
                ● নতুন অ্যাক্টিভেশন রিকোয়েস্ট পেন্ডিং
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Active Card */}
            <div 
              onClick={() => setSelectedStatus("active")}
              className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                selectedStatus === "active" ? "bg-emerald-50/50 border-emerald-300 ring-1 ring-emerald-300" : "bg-slate-50/50 border-slate-100 hover:border-slate-200"
              }`}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>সক্রিয়</span>
              </div>
              <p className="text-base font-black text-slate-800 mt-2">
                {toBanglaDigits(allUsers.filter((u) => u.status === "active").length)} জন
              </p>
            </div>

            {/* Request Card */}
            <div 
              onClick={() => setSelectedStatus("request")}
              className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                selectedStatus === "request" ? "bg-blue-50/50 border-blue-300 ring-1 ring-blue-300" : "bg-slate-50/50 border-slate-100 hover:border-blue-200/60"
              } ${allUsers.filter((u) => u.status === "request").length > 0 ? "relative overflow-hidden" : ""}`}
            >
              {allUsers.filter((u) => u.status === "request").length > 0 && (
                <div className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-bl-lg" />
              )}
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600">
                <span className={`w-1.5 h-1.5 rounded-full bg-blue-500 ${allUsers.filter((u) => u.status === "request").length > 0 ? "animate-ping" : ""}`} />
                <span>রিকোয়েস্ট</span>
              </div>
              <p className="text-base font-black text-slate-800 mt-2">
                {toBanglaDigits(allUsers.filter((u) => u.status === "request").length)} জন
              </p>
            </div>

            {/* Pending Card */}
            <div 
              onClick={() => setSelectedStatus("pending")}
              className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                selectedStatus === "pending" ? "bg-amber-50/50 border-amber-300 ring-1 ring-amber-300" : "bg-slate-50/50 border-slate-100 hover:border-slate-200"
              }`}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>পেন্ডিং</span>
              </div>
              <p className="text-base font-black text-slate-800 mt-2">
                {toBanglaDigits(allUsers.filter((u) => u.status === "pending").length)} জন
              </p>
            </div>

            {/* Deactive Card */}
            <div 
              onClick={() => setSelectedStatus("deactive")}
              className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                selectedStatus === "deactive" ? "bg-red-50/50 border-red-300 ring-1 ring-red-300" : "bg-slate-50/50 border-slate-100 hover:border-slate-200"
              }`}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-500">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span>নিষ্ক্রিয়</span>
              </div>
              <p className="text-base font-black text-slate-800 mt-2">
                {toBanglaDigits(allUsers.filter((u) => u.status === "deactive").length)} জন
              </p>
            </div>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {(currentUser.role === "admin"
            ? ["all", "active", "pending", "request", "deactive", "subscription"]
            : ["all", "active", "pending", "request", "deactive"]
          ).map((status) => {
            const count = status === "all"
              ? allUsers.length
              : status === "subscription"
              ? allUsers.filter((u) => u.planRequested).length
              : allUsers.filter((u) => u.status === status).length;
            return (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                className={`text-[11px] px-3.5 py-1.5 rounded-full font-bold transition whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  selectedStatus === status
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                    : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
                }`}
              >
                <span>{status === "all" ? "সবাই" : status === "subscription" ? "সাবস্ক্রিপশন" : STATUS_LABELS[status] || status}</span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                  selectedStatus === status ? "bg-white/30 text-white" : "bg-slate-100 text-slate-500"
                }`}>
                  {toBanglaDigits(count)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Savings Arrears & Member Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-1">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">সদস্য সংখ্যা</span>
              <p className="text-xl font-black text-slate-800 mt-1">{toBanglaDigits(filteredList.length)} জন</p>
            </div>
            <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl text-xs font-bold font-mono">
              সদস্য
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">মোট সঞ্চয় (সেভিংস)</span>
              <p className="text-xl font-black text-emerald-600 mt-1">৳{toBanglaDigits(formatBDT(filteredList.reduce((sum, m) => sum + (m.amount || 0), 0)))}</p>
            </div>
            <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl text-xs font-bold font-mono">
              সঞ্চয়
            </div>
          </div>

          <div className="bg-rose-50/30 p-4 rounded-2xl border border-rose-100 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-rose-500 uppercase tracking-wide">মোট বকেয়া সেভিংস</span>
              {arrearsLoading ? (
                <p className="text-sm text-rose-400 animate-pulse mt-1.5 font-bold">হিসাব করা হচ্ছে...</p>
              ) : (
                <p className="text-xl font-black text-rose-600 mt-1">
                  ৳{toBanglaDigits(formatBDT(filteredList.reduce((sum, m) => sum + (arrearsMap[m.docId] || 0), 0)))}
                </p>
              )}
            </div>
            <div className="bg-rose-100/50 text-rose-600 p-2.5 rounded-xl text-xs font-bold font-mono">
              বকেয়া
            </div>
          </div>
        </div>

        {/* Members List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-slate-400 text-xs">লোড হচ্ছে...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
            <p className="text-slate-400 text-sm">কোনো সদস্য পাওয়া যায়নি</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-sans text-slate-700 min-w-[750px] lg:min-w-0">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 font-bold">
                    <th className="px-4 py-3.5 text-left">নাম ও ইউজার আইডি</th>
                    <th className="px-4 py-3.5 text-left">মোবাইল</th>
                    <th className="px-4 py-3.5 text-left">
                      {selectedStatus === "subscription" ? "অনুরোধকৃত প্ল্যান" : "সেভিংস ও ধরণ"}
                    </th>
                    <th className="px-4 py-3.5 text-left">
                      {selectedStatus === "subscription" ? "পেমেন্ট নম্বর" : "বকেয়া সেভিংস"}
                    </th>
                    <th className="px-4 py-3.5 text-left">
                      {selectedStatus === "subscription" ? "ট্রানজেকশন আইডি (TxID)" : "পরবর্তী সেভিংস সময়সূচী"}
                    </th>
                    <th className="px-4 py-3.5 text-left">স্ট্যাটাস</th>
                    <th className="px-4 py-3.5 text-center">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium">
                  {filteredList.map((m) => {
                    const displayName = m.companyName || m.name || "—";
                    const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                      displayName
                    )}&backgroundColor=${m.role === "company" ? "7c3aed" : "2563eb"}&textColor=ffffff`;

                    const companyObj = companies.find((c) => c.id === m.companyId);

                    return (
                      <tr key={m.docId} className="hover:bg-slate-50/50 transition-colors">
                        {/* Avatar & Name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <img src={avatar} className="w-8 h-8 rounded-lg shrink-0 object-cover" alt="" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-800 text-xs truncate max-w-[150px]">{displayName}</span>
                                {m.role === "company" && (
                                  <span className="text-[8px] px-1.5 py-0.2 bg-purple-50 text-purple-600 rounded-full font-bold">কোম্পানি</span>
                                )}
                                {m.role === "member" && (
                                  m.canSeeAllData ? (
                                    <span className="text-[8px] px-1.5 py-0.2 bg-emerald-50 text-emerald-600 rounded-full font-bold border border-emerald-100">সকল ডাটা</span>
                                  ) : (
                                    <span className="text-[8px] px-1.5 py-0.2 bg-slate-100 text-slate-500 rounded-full font-bold border border-slate-200">শুধু নিজের ডাটা</span>
                                  )
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{m.userId || m.docId}</span>
                              {currentUser.role === "admin" && m.role === "member" && companyObj && (
                                <span className="text-[9px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded mt-1 inline-block">
                                  🏢 {companyObj.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Mobile */}
                        <td className="px-4 py-3 text-slate-600 font-mono">
                          {m.mobile || "—"}
                        </td>

                        {/* Savings & Type */}
                        <td className="px-4 py-3">
                          {selectedStatus === "subscription" ? (
                            <div className="space-y-0.5">
                              <span className="text-[10px] text-slate-400 font-extrabold uppercase">অনুরোধকৃত প্ল্যান:</span>
                              <p className="font-extrabold text-indigo-700 text-xs">
                                {m.planRequested === "monthly" ? "মাসিক প্ল্যান" : "বাৎসরিক প্ল্যান"}
                              </p>
                              <span className="text-[9px] bg-indigo-50 text-indigo-600 font-extrabold px-1.5 py-0.2 rounded mt-1 inline-block">
                                ৳{m.planRequested === "monthly" ? "৫০০" : "৫,০০০"}
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-400 font-extrabold uppercase">সেভিংস:</span>
                                <span className="font-extrabold text-emerald-700 text-xs">৳{formatBDT(m.savingsBalance !== undefined ? m.savingsBalance : (m.amount || 0))}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-400 font-extrabold uppercase">ইনভেস্ট:</span>
                                <span className="font-extrabold text-blue-700 text-xs">৳{formatBDT(m.investBalance || 0)}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-400 font-extrabold uppercase">ইনকাম:</span>
                                <span className="font-extrabold text-amber-700 text-xs">৳{formatBDT(m.incomeBalance || 0)}</span>
                              </div>
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {m.accountType && (
                                  <span className="text-[8px] bg-blue-50 text-blue-600 font-extrabold px-1.5 py-0.2 rounded">
                                    {ACCT_LABELS[m.accountType] || m.accountType}
                                  </span>
                                )}
                                {m.InvestType && (
                                  <span className="text-[8px] bg-purple-50 text-purple-600 font-extrabold px-1.5 py-0.2 rounded">
                                    {INVEST_LABELS[m.InvestType] || m.InvestType}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Savings Arrears */}
                        <td className="px-4 py-3">
                          {selectedStatus === "subscription" ? (
                            <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                              {m.planRequestMobile || "—"}
                            </span>
                          ) : arrearsLoading ? (
                            <span className="text-slate-300 text-[10px] animate-pulse">লোড হচ্ছে...</span>
                          ) : (
                            (() => {
                              const arrAmt = arrearsMap[m.docId] || 0;
                              if (arrAmt > 0) {
                                return (
                                  <span className="font-extrabold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full text-[10px]">
                                    ৳{toBanglaDigits(formatBDT(arrAmt))}
                                  </span>
                                );
                              }
                              return <span className="text-emerald-600 bg-emerald-50 border border-emerald-100/50 px-2 py-0.5 rounded-full text-[10px] font-bold">কোনো বকেয়া নেই</span>;
                            })()
                          )}
                        </td>

                        {/* Schedule Preview */}
                        <td className="px-4 py-3">
                          {selectedStatus === "subscription" ? (
                            <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                              {m.planRequestTxId || "—"}
                            </span>
                          ) : (
                            getSavingsSchedulePreview(m.InvestType, m.investDate || m.InvestDate)
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          {selectedStatus === "subscription" ? (
                            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-amber-500 text-white animate-pulse">
                              পেন্ডিং যাচাইকরণ
                            </span>
                          ) : (
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${STATUS_COLORS[m.status] || "bg-slate-400 text-white"}`}>
                              {STATUS_LABELS[m.status] || m.status}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-center">
                          {selectedStatus === "subscription" ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleApproveSubscription(m)}
                                className="px-2.5 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[10px] transition shadow-xs active:scale-95 cursor-pointer"
                              >
                                সক্রিয় করুন
                              </button>
                              <button
                                onClick={() => handleRejectSubscription(m)}
                                className="px-2.5 py-1 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-[10px] transition shadow-xs active:scale-95 cursor-pointer"
                              >
                                বাতিল করুন
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => onNavigate("profile", { id: m.docId })}
                                className="p-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 transition"
                                title="প্রোফাইল"
                              >
                                <UserIcon className="w-3.5 h-3.5" />
                              </button>
                              {(currentUser.role === "admin" || (currentUser.role === "company" && m.role === "member")) && (
                                <>
                                  <button
                                    onClick={() => setStatusTarget(m)}
                                    className="p-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-600 transition"
                                    title="স্ট্যাটাস পরিবর্তন"
                                  >
                                    <ToggleRight className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteTarget(m)}
                                    className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition"
                                    title="মুছে ফেলুন"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Status Modal Overlay */}
      {statusTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-800 text-center text-base">স্ট্যাটাস পরিবর্তন করুন</h3>
            <p className="text-center text-blue-600 font-bold text-sm">
              {statusTarget.name || statusTarget.companyName}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["active", "pending", "request", "deactive"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  className={`py-3 rounded-xl text-white font-bold text-xs shadow-sm transition active:scale-95 ${
                    status === "active"
                      ? "bg-emerald-500 hover:bg-emerald-600"
                      : status === "pending"
                      ? "bg-amber-500 hover:bg-amber-600"
                      : status === "request"
                      ? "bg-blue-500 hover:bg-blue-600"
                      : "bg-red-500 hover:bg-red-600"
                  }`}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStatusTarget(null)}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold text-xs transition"
            >
              বাতিল
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Overlay */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-5 text-center">
            <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">সদস্য ডিলিট করুন</h3>
              <p className="text-xs text-slate-500 mt-1">
                &quot;{deleteTarget.name || deleteTarget.companyName}&quot; স্থায়ীভাবে মুছে যাবে।
                এই অ্যাকশন বাতিল করা যাবে না।
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs transition"
              >
                বাতিল
              </button>
              <button
                onClick={handleDeleteMember}
                className="flex-1 py-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs transition"
              >
                ডিলিট করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Loader Overlay */}
      {actionLoading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-[9999]">
          <div className="bg-white px-5 py-4 rounded-xl shadow-xl flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="text-slate-600 text-xs font-semibold">প্রসেসিং হচ্ছে...</p>
          </div>
        </div>
      )}
    </div>
  );
}
