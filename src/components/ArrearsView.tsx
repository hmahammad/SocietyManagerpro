import { useState, useEffect } from "react";
import { collection, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { User, Installment, HistoryEntry, InstallmentStep } from "../types";
import { formatBDT } from "../utils/firestore";
import { Search, Calendar, Info, AlertCircle, Landmark, CreditCard, ChevronRight, User as UserIcon } from "lucide-react";

interface ArrearsViewProps {
  currentUser: User;
  onNavigate: (view: string, params?: any) => void;
}

export default function ArrearsView({ currentUser, onNavigate }: ArrearsViewProps) {
  const [activeTab, setActiveTab] = useState<"savings" | "installments">("savings");
  const [searchQuery, setSearchQuery] = useState("");

  // Real-time Lists
  const [membersArrears, setMembersArrears] = useState<any[]>([]);
  const [loadingSavings, setLoadingSavings] = useState(false);

  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loadingInstallments, setLoadingInstallments] = useState(true);

  // Selected details overlay modals
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);

  const toBanglaDigits = (num: number | string) => {
    const banglaDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
    return num.toString().replace(/\d/g, (d) => banglaDigits[parseInt(d)]);
  };

  const formatNum = (num: number) => {
    return toBanglaDigits(formatBDT(num));
  };

  const formatBanglaDate = (dateStr: string) => {
    if (!dateStr) return "কোনো তথ্য নেই";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = toBanglaDigits(d.getDate());
      const year = toBanglaDigits(d.getFullYear());
      const month = d.toLocaleDateString("bn-BD", { month: "long" });
      return `${day} ${month}, ${year}`;
    } catch {
      return dateStr;
    }
  };

  // 1. Fetch & Listen to Savings Arrears
  useEffect(() => {
    setLoadingSavings(true);
    const unsub = onSnapshot(collection(db, "users"), async (snap) => {
      const list: User[] = [];
      snap.forEach((d) => {
        const u = { docId: d.id, ...d.data() } as User;
        if (u.role === "member") {
          list.push(u);
        }
      });

      // Filter members based on Role (Admins see all, company users see only their members)
      let myMembers = list;
      if (currentUser.role !== "admin") {
        myMembers = list.filter((m) => m.companyId === currentUser.docId);
      }

      try {
        const arrearsData = await Promise.all(
          myMembers.map(async (member) => {
            const histSnap = await getDocs(collection(db, "users", member.docId, "history"));
            let arrearsSum = 0;
            let latestPayDate = "";
            const historyList: HistoryEntry[] = [];

            histSnap.forEach((doc) => {
              const h = { docId: doc.id, ...doc.data() } as HistoryEntry;
              historyList.push(h);
              if (h.type === "savings_arrears") {
                arrearsSum += Number(h.arrears || 0);
              } else if (h.date) {
                if (!latestPayDate || h.date > latestPayDate) {
                  latestPayDate = h.date;
                }
              }
            });

            return {
              member,
              arrearsSum,
              latestPayDate,
              historyList,
            };
          })
        );

        // Filter: Keep members who have outstanding savings arrears > 0
        setMembersArrears(arrearsData.filter((item) => item.arrearsSum > 0));
      } catch (err) {
        console.error("Error loading savings arrears:", err);
      } finally {
        setLoadingSavings(false);
      }
    });

    return () => unsub();
  }, [currentUser]);

  // 2. Fetch & Listen to Project Installments
  useEffect(() => {
    setLoadingInstallments(true);
    const unsub = onSnapshot(collection(db, "installments"), (snap) => {
      const list: Installment[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Installment);
      });
      setInstallments(list);
      setLoadingInstallments(false);
    });
    return () => unsub();
  }, []);

  // Helper: Next Scheduled Savings Date preview
  const getNextSavingsDate = (investType?: string, investDate?: string) => {
    if (!investType || !investDate) return "N/A";
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (investType === "monthly") {
      const selectedDay = parseInt(investDate, 10);
      if (isNaN(selectedDay) || selectedDay < 1 || selectedDay > 31) return "N/A";

      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth();
      let candidate = new Date(currentYear, currentMonth, selectedDay);

      if (candidate.getTime() < today.getTime()) {
        candidate = new Date(currentYear, currentMonth + 1, selectedDay);
      }
      return candidate.toISOString().split("T")[0];
    } else {
      const target = new Date(investDate);
      if (isNaN(target.getTime())) return "N/A";
      return target.toISOString().split("T")[0];
    }
  };

  // --- Filtering calculations ---
  const filteredSavings = membersArrears.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      item.member.name.toLowerCase().includes(q) ||
      (item.member.userId && item.member.userId.toLowerCase().includes(q)) ||
      (item.member.mobile && item.member.mobile.includes(q))
    );
  });

  const filteredInstallments = installments
    .map((inst) => {
      const paidTotal = (inst.schedule || [])
        .reduce((sum, s) => sum + Number(s.paidAmount || 0), 0);
      const remainingDue = (inst.schedule || []).reduce((sum, s) => sum + Math.max(0, Number(s.amount || 0) - Number(s.paidAmount || 0)), 0);

      // Find last paid installment step date
      let lastPaidDate = "";
      (inst.schedule || []).forEach((s) => {
        if (s.status === "paid" && s.paidDate) {
          if (!lastPaidDate || s.paidDate > lastPaidDate) {
            lastPaidDate = s.paidDate;
          }
        }
      });
      if (!lastPaidDate) lastPaidDate = inst.startDate; // fallback to start date

      // Find next unpaid installment step date
      const nextUnpaidStep = (inst.schedule || []).find((s) => s.status !== "paid");
      const nextDueDate = nextUnpaidStep ? nextUnpaidStep.dueDate : "";

      return {
        inst,
        remainingDue,
        lastPaidDate,
        nextDueDate,
      };
    })
    .filter((item) => {
      if (item.remainingDue <= 0) return false;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        item.inst.customerName.toLowerCase().includes(q) ||
        item.inst.productName.toLowerCase().includes(q)
      );
    });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 select-none font-sans min-h-[calc(100vh-4rem)] bg-slate-50">
      
      {/* Title Header */}
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-red-600 flex items-center justify-center text-white shadow-md">
          <AlertCircle className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <h2 className="text-base font-extrabold text-slate-800 tracking-tight">বকেয়া তালিকা (বকেয়া কেন্দ্র)</h2>
          <p className="text-[10px] text-slate-400 font-bold -mt-0.5">বকেয়া সেভিংস এবং কিস্তি লেজারের একনজরে তালিকা</p>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200/60 shadow-xs mb-5">
        <button
          onClick={() => {
            setActiveTab("savings");
            setSearchQuery("");
          }}
          className={`flex-1 py-3 text-center text-xs font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === "savings"
              ? "bg-rose-50 text-rose-600 shadow-xs"
              : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <Landmark className="w-4 h-4" />
          📊 সেভিংস বকেয়া
          {membersArrears.length > 0 && (
            <span className="text-[9px] bg-rose-600 text-white font-extrabold px-1.5 py-0.2 rounded-full">
              {toBanglaDigits(membersArrears.length)}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab("installments");
            setSearchQuery("");
          }}
          className={`flex-1 py-3 text-center text-xs font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === "installments"
              ? "bg-rose-50 text-rose-600 shadow-xs"
              : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <CreditCard className="w-4 h-4" />
          💳 কিস্তি বকেয়া
          {installments.filter(i => {
            const due = (i.schedule || []).reduce((sum, s) => sum + Math.max(0, Number(s.amount || 0) - Number(s.paidAmount || 0)), 0);
            return due > 0;
          }).length > 0 && (
            <span className="text-[9px] bg-rose-600 text-white font-extrabold px-1.5 py-0.2 rounded-full">
              {toBanglaDigits(installments.filter(i => {
                const due = (i.schedule || []).reduce((sum, s) => sum + Math.max(0, Number(s.amount || 0) - Number(s.paidAmount || 0)), 0);
                return due > 0;
              }).length)}
            </span>
          )}
        </button>
      </div>

      {/* Dynamic Search Box */}
      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            activeTab === "savings"
              ? "সদস্য নাম, ইউজার আইডি অথবা মোবাইল নম্বর দিয়ে খুঁজুন..."
              : "কাস্টমার নাম অথবা পণ্যের নাম দিয়ে খুঁজুন..."
          }
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:border-rose-500 shadow-xs transition-all"
        />
      </div>

      {/* --- CONTENT AREA --- */}
      {activeTab === "savings" ? (
        loadingSavings ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/50 shadow-sm">
            <div className="w-10 h-10 border-4 border-rose-100 border-t-rose-600 rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-bold text-slate-400 mt-4">বকেয়া সেভিংস লোড হচ্ছে...</p>
          </div>
        ) : filteredSavings.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/50 shadow-sm flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-3">
              <Landmark className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-700 text-sm">কোনো সেভিংস বকেয়া নেই</h4>
            <p className="text-[10px] text-slate-400 font-bold mt-1">সব সদস্যের সেভিংস সময়মতো পরিশোধিত রয়েছে!</p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold tracking-wide border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-4 text-left">সদস্য বিবরণ</th>
                    <th className="px-5 py-4 text-left">বকেয়া সেভিংস</th>
                    <th className="px-5 py-4 text-left">সর্বশেষ সেভিংস জমার তারিখ</th>
                    <th className="px-5 py-4 text-left">পরবর্তী সেভিংস সময়সূচী</th>
                    <th className="px-5 py-4 text-center">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredSavings.map((item) => {
                    const u = item.member;
                    const nextDate = getNextSavingsDate(u.InvestType, u.investDate || u.InvestDate);
                    return (
                      <tr key={u.docId} className="hover:bg-slate-50/50 transition">
                        {/* Member Details */}
                        <td className="px-5 py-4">
                          <div>
                            <span className="font-bold text-blue-700 text-xs block">{u.name}</span>
                            <span className="text-[9px] text-slate-400 font-mono block mt-0.5">আইডি: {u.userId || "তথ্য নেই"} • {u.mobile}</span>
                          </div>
                        </td>

                        {/* Arrears Amount */}
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-50 text-rose-600 border border-rose-100">
                            ৳{formatNum(item.arrearsSum)}
                          </span>
                        </td>

                        {/* Last Payment Date */}
                        <td className="px-5 py-4 text-slate-600">
                          {item.latestPayDate ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>{formatBanglaDate(item.latestPayDate)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px]">কোনো সঞ্চয় জমা নেই</span>
                          )}
                        </td>

                        {/* Next Scheduled Date */}
                        <td className="px-5 py-4 text-slate-700 font-bold">
                          {nextDate !== "N/A" ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-blue-500" />
                              <span>{formatBanglaDate(nextDate)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px]">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-center">
                          <button
                            onClick={() => onNavigate("profile", { id: u.docId })}
                            className="inline-flex items-center gap-0.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-100/60 rounded-xl font-bold transition text-[10px]"
                          >
                            বিস্তারিত <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        loadingInstallments ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/50 shadow-sm">
            <div className="w-10 h-10 border-4 border-rose-100 border-t-rose-600 rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-bold text-slate-400 mt-4">বকেয়া কিস্তি লোড হচ্ছে...</p>
          </div>
        ) : filteredInstallments.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/50 shadow-sm flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-3">
              <CreditCard className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-700 text-sm">কোনো কিস্তি বকেয়া নেই</h4>
            <p className="text-[10px] text-slate-400 font-bold mt-1">সব কাস্টমারের প্রজেক্ট কিস্তি সম্পূর্ণ পরিশোধিত রয়েছে!</p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold tracking-wide border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-4 text-left">কাস্টমার ও পণ্য</th>
                    <th className="px-5 py-4 text-left">বকেয়া কিস্তি পরিমাণ</th>
                    <th className="px-5 py-4 text-left">সর্বশেষ কিস্তি জমার তারিখ</th>
                    <th className="px-5 py-4 text-left">পরবর্তী কিস্তির তারিখ</th>
                    <th className="px-5 py-4 text-center">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredInstallments.map((item) => {
                    const inst = item.inst;
                    return (
                      <tr key={inst.id} className="hover:bg-slate-50/50 transition">
                        {/* Customer & Product */}
                        <td className="px-5 py-4">
                          <div>
                            <span className="font-bold text-blue-700 text-xs block">{inst.customerName}</span>
                            <span className="text-[9px] bg-slate-100 border border-slate-200/50 text-slate-500 font-semibold px-1.5 py-0.2 rounded mt-0.5 inline-block">
                              📦 {inst.productName}
                            </span>
                          </div>
                        </td>

                        {/* Arrears Amount */}
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-50 text-rose-600 border border-rose-100">
                            ৳{formatNum(item.remainingDue)}
                          </span>
                        </td>

                        {/* Last Payment Date */}
                        <td className="px-5 py-4 text-slate-600">
                          {item.lastPaidDate ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>{formatBanglaDate(item.lastPaidDate)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px]">কোনো জমা নেই</span>
                          )}
                        </td>

                        {/* Next Installment Due Date */}
                        <td className="px-5 py-4 text-slate-700 font-bold">
                          {item.nextDueDate ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-rose-500" />
                              <span>{formatBanglaDate(item.nextDueDate)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px]">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-center">
                          <button
                            onClick={() => setSelectedInstallment(inst)}
                            className="inline-flex items-center gap-0.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-100/60 rounded-xl font-bold transition text-[10px]"
                          >
                            তালিক সিডিউল <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ======================================================= */}
      {/* 1. OVERLAY MODAL: INSTALLMENT SCHEDULE VIEW */}
      {/* ======================================================= */}
      {selectedInstallment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[999] p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-scaleIn">
            <div className="flex justify-between items-center border-b pb-3.5 mb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">কিস্তি সিডিউল বিস্তারিত</h3>
                <h4 className="text-sm font-extrabold text-blue-700 mt-0.5">{selectedInstallment.customerName}</h4>
              </div>
              <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-600 font-bold px-2 py-0.5 rounded-lg">
                📦 {selectedInstallment.productName}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
              <div className="grid grid-cols-2 gap-3.5 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-semibold">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">মোট পরিমাণ</span>
                  <span className="text-slate-800 font-extrabold text-xs block mt-0.5">৳{formatNum(selectedInstallment.totalAmount)}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">বাকি পরিমাণ</span>
                  <span className="text-rose-600 font-extrabold text-xs block mt-0.5">
                    ৳{formatNum(
                      (selectedInstallment.schedule || [])
                        .reduce((sum, s) => sum + Math.max(0, Number(s.amount || 0) - Number(s.paidAmount || 0)), 0)
                    )}
                  </span>
                </div>
              </div>

              <div className="border border-slate-200/60 rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">ধাপ</th>
                      <th className="p-3">তারিখ</th>
                      <th className="p-3 text-right">পরিমাণ</th>
                      <th className="p-3 text-center">স্ট্যাটাস</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {(selectedInstallment.schedule || []).map((s) => {
                      const due = Math.max(0, s.amount - s.paidAmount);
                      const isPaid = s.status === "paid" || due <= 0;
                      return (
                        <tr key={s.month} className={isPaid ? "bg-emerald-50/40" : ""}>
                          <td className="p-3 font-bold text-slate-800">কিস্তি {toBanglaDigits(s.month)}</td>
                          <td className="p-3">
                            <span className="font-mono text-slate-500 text-[11px]">{s.dueDate}</span>
                            {s.paidDate && <div className="text-[9px] text-emerald-600 font-bold mt-0.5">জমাঃ {formatBanglaDate(s.paidDate)}</div>}
                          </td>
                          <td className="p-3 text-right">
                            <span className="font-extrabold text-slate-800">৳{formatNum(s.amount)}</span>
                            {due > 0 && <div className="text-[9px] text-rose-500 font-bold mt-0.5">বকেয়াঃ ৳{formatNum(due)}</div>}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] ${isPaid ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                              {isPaid ? "পরিশোধিত" : "বকেয়া"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50 flex gap-3 -mx-5 -mb-5 mt-4">
              <button
                onClick={() => setSelectedInstallment(null)}
                className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-2xl font-bold transition text-xs text-center cursor-pointer"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
