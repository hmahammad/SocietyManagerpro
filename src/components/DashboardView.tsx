import { useState, useEffect } from "react";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
  getDocs,
  query,
  where,
  increment,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { User, Project, Transaction, Installment, HistoryEntry, InstallmentStep } from "../types";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  ROLE_LABELS,
  ACCT_LABELS,
  INVEST_LABELS,
  formatNum,
  formatBDT,
  formatDate,
} from "../utils/firestore";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Briefcase,
  Users,
  Settings,
  Calendar,
  AlertCircle,
  Plus,
  Trash2,
  FileText,
  UserCheck,
  CheckCircle,
  HelpCircle,
  Eye,
  Info,
  LogOut,
} from "lucide-react";

interface DashboardViewProps {
  currentUser: User;
  onNavigate: (view: string, params?: any) => void;
}

type TabMode = "invest" | "projects" | "ledger";

export default function DashboardView({ currentUser, onNavigate }: DashboardViewProps) {
  const [activeTab, setActiveTab] = useState<TabMode>("invest");
  const [loading, setLoading] = useState(true);

  // Firestore Lists
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [totalArrearsAmount, setTotalArrearsAmount] = useState<number>(0);
  const [arrearsLoading, setArrearsLoading] = useState<boolean>(false);

  // Selected details history triggers
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userHistory, setUserHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectTrxs, setProjectTrxs] = useState<Transaction[]>([]);

  const [selectedInstallment, setSelectedProjectInstallment] = useState<Installment | null>(null);
  const [instTab, setInstTab] = useState<"schedule" | "history">("schedule");
  const [investHistoryTab, setInvestHistoryTab] = useState<"schedule" | "history">("schedule");
  const [customPayAmount, setCustomPayAmount] = useState<number>(0);
  const [paymentPreview, setPaymentPreview] = useState<{
    amount: number;
    scheduleCopy: InstallmentStep[];
    computedDue: number;
    allFullyPaid: boolean;
  } | null>(null);

  // Modals view states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [addMode, setAddMode] = useState<"invest" | "transaction" | "project" | "installment">("invest");

  // Edit / Settings Modals
  const [editingInvest, setEditingInvest] = useState<{ entry: HistoryEntry; userId: string } | null>(null);
  const [editingTrx, setEditingTrx] = useState<Transaction | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingInstallment, setEditingInstallment] = useState<Installment | null>(null);
  const [showProjectDetails, setShowProjectDetails] = useState<Project | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [editingUserShare, setEditingUserShare] = useState<User | null>(null);
  const [customShareValue, setCustomShareValue] = useState<string>("");

  // Dynamic Add Form States
  // 1. New Investment form
  const [newInvestTarget, setNewInvestTarget] = useState("");
  const [newInvestAcctType, setNewInvestAcctType] = useState<"business" | "saving" | "">("");
  const [newInvestMode, setNewInvestMode] = useState<"monthly" | "yearly" | "one_time" | "">("");
  const [newInvestAmount, setNewInvestAmount] = useState<number>(0);
  const [newInvestDate, setNewInvestDate] = useState(new Date().toISOString().split("T")[0]);
  const [newInvestMemo, setNewInvestMemo] = useState("");

  // 2. New Transaction form
  const [newTrxProject, setNewProjectTarget] = useState("");
  const [newTrxType, setNewTrxType] = useState<"expense" | "sale">("expense");
  const [newTrxAmount, setNewTrxAmount] = useState<number>(0);
  const [newTrxDate, setNewTrxDate] = useState(new Date().toISOString().split("T")[0]);
  const [newTrxDesc, setNewTrxDesc] = useState("");

  // 3. New Project form
  const [newProjName, setNewProjName] = useState("");
  const [newProjType, setNewProjType] = useState("");
  const [newProjStatus, setNewProjStatus] = useState<"active" | "completed" | "closed">("active");
  const [newProjStartDate, setNewProjStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [newProjEndDate, setNewProjEndDate] = useState("");
  const [newProjDuration, setNewProjDuration] = useState("");
  const [newProjBudget, setNewProjBudget] = useState<number>(0);
  const [newProjLocation, setNewProjLocation] = useState("");
  const [newProjDesc, setNewProjDesc] = useState("");

  // 4. New Installment form
  const [newInstCustomerName, setNewInstCustomer] = useState("");
  const [newInstProductName, setNewInstProduct] = useState("");
  const [newInstTotalAmount, setNewInstTotal] = useState<number>(0);
  const [newInstDownPayment, setNewInstDown] = useState<number>(0);
  const [newInstMonths, setNewInstMonths] = useState<number>(0);
  const [newInstStartDate, setNewInstStartDate] = useState(new Date().toISOString().split("T")[0]);

  // Loading indicator for saves
  const [saving, setSaving] = useState(false);

  // Fetch all main collections in realtime
  useEffect(() => {
    setLoading(true);
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const list: User[] = [];
      snap.forEach((d) => {
        list.push({ docId: d.id, ...d.data() } as User);
      });
      setUsers(list);
    });

    const unsubProjects = onSnapshot(collection(db, "projects"), (snap) => {
      const list: Project[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Project);
      });
      setProjects(list);
    });

    const unsubAccounts = onSnapshot(collection(db, "accounts"), (snap) => {
      const list: Transaction[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Transaction);
      });
      // sort desc by date
      list.sort((a, b) => b.date.localeCompare(a.date));
      setTransactions(list);
    });

    const unsubInstallments = onSnapshot(collection(db, "installments"), (snap) => {
      const list: Installment[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Installment);
      });
      setInstallments(list);
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubProjects();
      unsubAccounts();
      unsubInstallments();
    };
  }, []);

  useEffect(() => {
    if (users.length === 0) {
      setTotalArrearsAmount(0);
      return;
    }

    let isMounted = true;
    const fetchArrears = async () => {
      setArrearsLoading(true);
      let totalArrears = 0;

      // Filter target users whose arrears are loaded
      const targetUsersForArrears = users.filter((u) => {
        if (u.role !== "member") return false;
        if (currentUser.role === "admin") return true;
        const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
        if (u.companyId !== targetCompanyId) return false;
        
        // If they are a member and can't see all data, only fetch their own
        if (currentUser.role === "member" && !currentUser.canSeeAllData) {
          return u.docId === currentUser.docId;
        }
        return true;
      });

      try {
        await Promise.all(
          targetUsersForArrears.map(async (u) => {
            try {
              const histSnap = await getDocs(collection(db, "users", u.docId, "history"));
              histSnap.forEach((doc) => {
                const h = doc.data();
                if (h.type === "savings_arrears") {
                  totalArrears += Number(h.arrears || 0);
                }
              });
            } catch (err) {
              console.error("Error fetching arrears for user", u.docId, err);
            }
          })
        );
      } catch (err) {
        console.error("Error fetching arrears batch", err);
      }

      if (isMounted) {
        setTotalArrearsAmount(totalArrears);
        setArrearsLoading(false);
      }
    };

    fetchArrears();
    return () => {
      isMounted = false;
    };
  }, [users, currentUser]);

  // Recalculates stats on changes
  const getDashboardSummary = () => {
    // 1. Calculate global or company-specific base stats
    const companyMembers = users.filter((u) => {
      if (u.role !== "member") return false;
      if (currentUser.role === "admin") return true;
      const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
      return u.companyId === targetCompanyId;
    });

    const globalTotalDeposit = companyMembers.reduce((sum, u) => sum + Number(u.amount || 0), 0);

    const companyTransactions = transactions.filter((t) => {
      if (currentUser.role === "admin") return true;
      const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
      // Transactions are linked to projects. Let's find if project belongs to company
      const p = projects.find((proj) => proj.id === t.projectId);
      return p && p.companyId === targetCompanyId;
    });

    const totalExpense = companyTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const projectIncome = companyTransactions
      .filter((t) => t.type === "sale")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const companyInstallments = installments.filter((inst) => {
      if (currentUser.role === "admin") return true;
      const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
      return inst.companyId === targetCompanyId;
    });

    const installmentIncome = companyInstallments.reduce((sum, inst) => {
      return (
        sum +
        (inst.schedule || [])
          .filter((s) => s.status === "paid")
          .reduce((stepSum, s) => stepSum + Number(s.amount || 0), 0)
      );
    }, 0);

    const downPaymentIncome = companyInstallments.reduce((sum, inst) => sum + Number(inst.downPayment || 0), 0);

    const totalIncome = projectIncome + installmentIncome + downPaymentIncome;
    const totalBalance = globalTotalDeposit + totalIncome - totalExpense;

    const totalDue = companyInstallments.reduce((sum, inst) => {
      const paid = (inst.schedule || [])
        .filter((s) => s.status === "paid")
        .reduce((stepSum, s) => stepSum + Number(s.amount || 0), 0);
      return sum + Math.max(0, Number(inst.totalAmount || 0) - Number(inst.downPayment || 0) - paid);
    }, 0);

    // 2. Adjust stats if logged-in user is a member with "only own data" view
    if (currentUser.role === "member" && !currentUser.canSeeAllData) {
      const myUser = users.find((u) => u.docId === currentUser.docId) || currentUser;
      const myDeposit = Number(myUser.amount || 0);

      let share = 0;
      if (myUser.customShare !== undefined && myUser.customShare !== null) {
        share = myUser.customShare / 100;
      } else {
        share = globalTotalDeposit > 0 ? myDeposit / globalTotalDeposit : 0;
      }

      const myExpense = totalExpense * share;
      const myIncome = Math.max(0, totalIncome * share);
      const myBalance = myDeposit - myExpense + myIncome;

      return {
        totalDeposit: myDeposit,
        totalExpense: myExpense,
        totalIncome: myIncome,
        totalBalance: myBalance,
        totalDue: 0, // Restricted members don't see installment due
        globalTotalDeposit,
        globalTotalExpense: totalExpense,
        globalTotalIncome: totalIncome,
      };
    }

    return {
      totalDeposit: globalTotalDeposit,
      totalExpense,
      totalIncome,
      totalBalance,
      totalDue,
      globalTotalDeposit,
      globalTotalExpense: totalExpense,
      globalTotalIncome: totalIncome,
    };
  };

  const {
    totalDeposit,
    totalExpense,
    totalIncome,
    totalBalance,
    totalDue,
    globalTotalDeposit,
    globalTotalExpense,
    globalTotalIncome,
  } = getDashboardSummary();

  // Load user details/history modal
  const handleShowUserHistory = async (u: User) => {
    setSelectedUser(u);
    setHistoryLoading(true);
    setInvestHistoryTab("schedule"); // default tab to schedule
    setShowHistoryModal(true);
    try {
      const snap = await getDocs(collection(db, "users", u.docId, "history"));
      const list: HistoryEntry[] = [];
      snap.forEach((doc) => {
        list.push({ docId: doc.id, ...doc.data() } as HistoryEntry);
      });
      list.sort((a, b) => b.date.localeCompare(a.date));
      setUserHistory(list);
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const getSavingsScheduleForUser = (u: User, hList: HistoryEntry[]) => {
    const invType = u.InvestType;
    const invDate = u.investDate;
    const invAmt = Number(u.investAmount || 0);

    if (!invType || invType === "one_time") return [];
    if (!invDate || invAmt <= 0) return [];

    const investDateObj = new Date(invDate);
    const dayOfMonth = investDateObj.getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const baseDate = new Date(u.createdAt || u.joinedDate || investDateObj.getTime());
    baseDate.setDate(1);

    const scheduleList = [];

    const toBanglaDigits = (num: number | string) => {
      const banglaDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
      return num.toString().replace(/\d/g, (d) => banglaDigits[parseInt(d)]);
    };

    if (invType === "monthly") {
      let cur = new Date(baseDate.getFullYear(), baseDate.getMonth(), dayOfMonth);
      
      const limitDate = new Date();
      limitDate.setMonth(limitDate.getMonth() + 2);

      while (cur <= limitDate) {
        const isPast = cur < today;
        const isToday = cur.getFullYear() === today.getFullYear() && cur.getMonth() === today.getMonth() && cur.getDate() === today.getDate();
        
        const matchingPayment = hList.find((h) => {
          if (h.type === "savings_arrears") return false;
          if (!h.date) return false;
          const hd = new Date(h.date);
          return hd.getFullYear() === cur.getFullYear() && hd.getMonth() === cur.getMonth();
        });

        const matchingArrears = hList.find((h) => {
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
          amount: invAmt,
          status,
          payment: matchingPayment,
        });

        cur.setMonth(cur.getMonth() + 1);
      }
    } else if (invType === "yearly") {
      let curYear = baseDate.getFullYear();
      const limitYear = today.getFullYear() + 1;

      while (curYear <= limitYear) {
        const isPast = curYear < today.getFullYear();
        
        const matchingPayment = hList.find((h) => {
          if (h.type === "savings_arrears") return false;
          if (!h.date) return false;
          return new Date(h.date).getFullYear() === curYear;
        });

        const matchingArrears = hList.find((h) => {
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
          amount: invAmt,
          status,
          payment: matchingPayment,
        });

        curYear++;
      }
    }

    return scheduleList.sort((a, b) => b.date.getTime() - a.date.getTime());
  };

  // Load project transactions history modal
  const handleShowProjectHistory = async (p: Project) => {
    setSelectedProject(p);
    setShowHistoryModal(true);
    const list = transactions.filter((t) => t.projectId === p.id);
    setProjectTrxs(list);
  };

  // Load installment steps details modal
  const handleShowInstallment = (inst: Installment) => {
    setSelectedProjectInstallment(inst);
    setInstTab("schedule");
    const nextUnpaidStep = (inst.schedule || []).find((s) => s.status !== "paid");
    setCustomPayAmount(nextUnpaidStep ? nextUnpaidStep.amount - nextUnpaidStep.paidAmount : 0);
    setPaymentPreview(null);
  };

  // Dynamic selector values loading
  const handleNewInvestTargetChange = async (userId: string) => {
    setNewInvestTarget(userId);
    if (!userId) return;
    const user = users.find((u) => u.docId === userId);
    if (user) {
      setNewInvestAcctType(user.accountType || "");
      setNewInvestMode(user.InvestType || "");
    }
  };

  // Submit operations
  const handleSubmitEntry = async () => {
    setSaving(true);
    try {
      if (addMode === "invest") {
        if (!newInvestTarget || !newInvestAmount || newInvestAmount <= 0 || !newInvestDate) {
          alert("সঠিক তথ্য পূরণ করুন");
          return;
        }

        // 1. Update user total amount
        const userRef = doc(db, "users", newInvestTarget);
        await updateDoc(userRef, {
          amount: increment(newInvestAmount),
          accountType: newInvestAcctType,
          InvestType: newInvestMode,
        });

        // 2. Write history entry
        await addDoc(collection(db, "users", newInvestTarget, "history"), {
          amount: newInvestAmount,
          date: newInvestDate,
          memo: newInvestMemo || "N/A",
          InvestType: newInvestMode,
          accountType: newInvestAcctType,
          createdAt: new Date().toISOString(),
        });

        // Reset
        setNewInvestTarget("");
        setNewInvestAmount(0);
        setNewInvestMemo("");
        setShowAddModal(false);
      } else if (addMode === "transaction") {
        if (!newTrxProject || !newTrxAmount || newTrxAmount <= 0 || !newTrxDate) {
          alert("সঠিক তথ্য পূরণ করুন");
          return;
        }
        const proj = projects.find((p) => p.id === newTrxProject);
        if (!proj) return;

        await addDoc(collection(db, "accounts"), {
          projectId: newTrxProject,
          projectName: proj.name,
          type: newTrxType,
          amount: newTrxAmount,
          date: newTrxDate,
          desc: newTrxDesc || "",
          createdAt: new Date().toISOString(),
        });

        // Reset
        setNewTrxAmount(0);
        setNewTrxDesc("");
        setShowAddModal(false);
      } else if (addMode === "project") {
        if (!newProjName) {
          alert("প্রজেক্টের নাম লিখুন");
          return;
        }

        await addDoc(collection(db, "projects"), {
          name: newProjName,
          desc: newProjDesc,
          type: newProjType,
          status: newProjStatus,
          location: newProjLocation,
          startDate: newProjStartDate,
          endDate: newProjEndDate,
          duration: newProjDuration,
          budget: Number(newProjBudget) || 0,
          createdAt: new Date().toISOString(),
          companyId: currentUser.role === "company" ? currentUser.docId : (currentUser.companyId || ""),
        });

        // Reset
        setNewProjName("");
        setNewProjDesc("");
        setNewProjLocation("");
        setNewProjBudget(0);
        setNewProjDuration("");
        setShowAddModal(false);
      } else if (addMode === "installment") {
        if (!newInstCustomerName || !newInstProductName || !newInstTotalAmount || !newInstMonths || !newInstStartDate) {
          alert("আবশ্যক ফিল্ডগুলো পূরণ করুন");
          return;
        }

        const remaining = newInstTotalAmount - newInstDownPayment;
        const monthlyPay = Math.ceil(remaining / newInstMonths);

        // Generate schedule
        const schedule: InstallmentStep[] = [];
        const baseDate = new Date(newInstStartDate);
        for (let i = 1; i <= newInstMonths; i++) {
          const dueDate = new Date(baseDate);
          dueDate.setMonth(dueDate.getMonth() + i);
          schedule.push({
            month: i,
            dueDate: dueDate.toISOString().split("T")[0],
            amount: monthlyPay,
            status: "unpaid",
            paidAmount: 0,
          });
        }

        await addDoc(collection(db, "installments"), {
          customerName: newInstCustomerName,
          productName: newInstProductName,
          totalAmount: newInstTotalAmount,
          downPayment: newInstDownPayment,
          monthlyPay,
          months: newInstMonths,
          startDate: newInstStartDate,
          dueAmount: remaining,
          status: "open",
          schedule,
          createdAt: new Date().toISOString(),
          companyId: currentUser.role === "company" ? currentUser.docId : (currentUser.companyId || ""),
        });

        // Reset
        setNewInstCustomer("");
        setNewInstProduct("");
        setNewInstTotal(0);
        setNewInstDown(0);
        setNewInstMonths(0);
        setShowAddModal(false);
      }
    } catch (e) {
      console.error(e);
      alert("সংরক্ষণ করা যায়নি");
    } finally {
      setSaving(false);
    }
  };

  // Edit saving operations
  const handleUpdateInvest = async () => {
    if (!editingInvest) return;
    setSaving(true);
    try {
      const { entry, userId } = editingInvest;
      const docRef = doc(db, "users", userId, "history", entry.docId);

      // Fetch existing amount to compute diff
      const oldSnap = await getDoc(docRef);
      if (oldSnap.exists()) {
        const oldAmt = Number(oldSnap.data().amount || 0);
        const diff = entry.amount - oldAmt;

        // Update history doc
        await updateDoc(docRef, {
          amount: entry.amount,
          date: entry.date,
          memo: entry.memo || "",
        });

        // Update overall user amount
        await updateDoc(doc(db, "users", userId), {
          amount: increment(diff),
        });

        setEditingInvest(null);
        // Reload history list in view
        if (selectedUser) handleShowUserHistory(selectedUser);
      }
    } catch (e) {
      console.error(e);
      alert("ইনভেস্ট আপডেট করা যায়নি");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTrx = async () => {
    if (!editingTrx) return;
    setSaving(true);
    try {
      const docRef = doc(db, "accounts", editingTrx.id);
      await updateDoc(docRef, {
        amount: Number(editingTrx.amount) || 0,
        type: editingTrx.type,
        date: editingTrx.date,
        desc: editingTrx.desc || "",
      });
      setEditingTrx(null);
      // Reload history list in view
      if (selectedProject) handleShowProjectHistory(selectedProject);
    } catch (e) {
      console.error(e);
      alert("লেনদেন আপডেট করা যায়নি");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProject = async () => {
    if (!editingProject) return;
    setSaving(true);
    try {
      const docRef = doc(db, "projects", editingProject.id);
      await updateDoc(docRef, {
        name: editingProject.name,
        type: editingProject.type || "",
        status: editingProject.status || "active",
        startDate: editingProject.startDate || "",
        endDate: editingProject.endDate || "",
        duration: editingProject.duration || "",
        budget: Number(editingProject.budget) || 0,
        location: editingProject.location || "",
        desc: editingProject.desc || "",
      });
      setEditingProject(null);
      // Reload history view context
      if (selectedProject) handleShowProjectHistory(editingProject);
    } catch (e) {
      console.error(e);
      alert("প্রজেক্ট আপডেট করা যায়নি");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUserShare = async () => {
    if (!editingUserShare) return;
    setSaving(true);
    try {
      const shareVal = customShareValue === "" ? null : parseFloat(customShareValue);
      const userRef = doc(db, "users", editingUserShare.docId);
      
      await updateDoc(userRef, {
        customShare: (shareVal === null || isNaN(shareVal)) ? null : shareVal,
      });

      // Update local selectedUser if matches
      if (selectedUser && selectedUser.docId === editingUserShare.docId) {
        setSelectedUser({
          ...selectedUser,
          customShare: (shareVal === null || isNaN(shareVal)) ? undefined : shareVal,
        });
      }

      alert("শেয়ার পার্সেন্টেজ সফলভাবে আপডেট করা হয়েছে");
      setEditingUserShare(null);
    } catch (e) {
      console.error(e);
      alert("শেয়ার পার্সেন্টেজ আপডেট করা যায়নি");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateInstallmentGeneral = async () => {
    if (!editingInstallment) return;
    setSaving(true);
    try {
      const { id, totalAmount, downPayment, months, startDate, customerName, productName } = editingInstallment;
      const remaining = totalAmount - downPayment;
      const monthlyPay = Math.ceil(remaining / months);

      // Generate new schedule step lists
      const schedule: InstallmentStep[] = [];
      const baseDate = new Date(startDate);
      for (let i = 1; i <= months; i++) {
        const dueDate = new Date(baseDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        schedule.push({
          month: i,
          dueDate: dueDate.toISOString().split("T")[0],
          amount: monthlyPay,
          status: "unpaid",
          paidAmount: 0,
        });
      }

      await updateDoc(doc(db, "installments", id), {
        customerName,
        productName,
        totalAmount,
        downPayment,
        monthlyPay,
        months,
        startDate,
        dueAmount: remaining,
        schedule,
      });

      setEditingInstallment(null);
      setSelectedProjectInstallment(null);
    } catch (e) {
      console.error(e);
      alert("কিস্তি তথ্য আপডেট করা যায়নি");
    } finally {
      setSaving(false);
    }
  };

  // Custom Sequential Installment steps distribution payment calculator preview
  const handleCalculateCustomPayment = () => {
    if (!selectedInstallment || customPayAmount <= 0) return;
    
    let remainingPayment = customPayAmount;
    const scheduleCopy = JSON.parse(JSON.stringify(selectedInstallment.schedule || [])) as InstallmentStep[];
    const todayStr = new Date().toISOString().split("T")[0];

    for (let i = 0; i < scheduleCopy.length; i++) {
      if (remainingPayment <= 0) break;
      const step = scheduleCopy[i];
      const stepTotal = Number(step.amount || 0);
      const stepPaid = Number(step.paidAmount || 0);
      const stepDue = Math.max(0, stepTotal - stepPaid);

      if (stepDue > 0) {
        if (remainingPayment >= stepDue) {
          step.paidAmount = stepTotal;
          step.status = "paid";
          step.paidDate = todayStr;
          remainingPayment = parseFloat((remainingPayment - stepDue).toFixed(2));
        } else {
          step.paidAmount = parseFloat((stepPaid + remainingPayment).toFixed(2));
          step.status = "partial";
          step.paidDate = todayStr;
          remainingPayment = 0;
        }
      }
    }

    const allFullyPaid = scheduleCopy.every((s) => s.status === "paid");
    const computedDue = scheduleCopy.reduce((sum, s) => sum + Math.max(0, s.amount - s.paidAmount), 0);

    setPaymentPreview({
      amount: customPayAmount,
      scheduleCopy,
      computedDue,
      allFullyPaid,
    });
  };

  const handleSaveCustomPayment = async () => {
    if (!selectedInstallment || !paymentPreview) return;
    setSaving(true);
    try {
      const docRef = doc(db, "installments", selectedInstallment.id);
      await updateDoc(docRef, {
        schedule: paymentPreview.scheduleCopy,
        dueAmount: paymentPreview.computedDue,
        status: paymentPreview.allFullyPaid ? "closed" : "open",
      });

      setSelectedProjectInstallment({
        ...selectedInstallment,
        schedule: paymentPreview.scheduleCopy,
        dueAmount: paymentPreview.computedDue,
        status: paymentPreview.allFullyPaid ? "closed" : "open",
      });

      alert("পেমেন্ট সফলভাবে সম্পন্ন হয়েছে");
      setPaymentPreview(null);
      setCustomPayAmount(0);
    } catch (e) {
      console.error(e);
      alert("পেমেন্ট সম্পূর্ণ করা যায়নি");
    } finally {
      setSaving(false);
    }
  };

  // Delete Operations
  const handleDeleteInvestHistory = async (h: HistoryEntry) => {
    if (!selectedUser) return;
    if (!confirm("লেনদেনটি স্থায়ীভাবে ডিলিট করতে চান?")) return;
    try {
      const docRef = doc(db, "users", selectedUser.docId, "history", h.docId);
      const amt = Number(h.amount || 0);

      // Deduct from overall member deposit
      await updateDoc(doc(db, "users", selectedUser.docId), {
        amount: increment(-amt),
      });

      await deleteDoc(docRef);
      handleShowUserHistory(selectedUser);
    } catch (e) {
      console.error(e);
      alert("ডিলিট করা যায়নি");
    }
  };

  const handleDeleteTrx = async (t: Transaction) => {
    if (!confirm("লেনদেনটি স্থায়ীভাবে ডিলিট করতে চান?")) return;
    try {
      await deleteDoc(doc(db, "accounts", t.id));
      if (selectedProject) handleShowProjectHistory(selectedProject);
    } catch (e) {
      console.error(e);
      alert("ডিলিট করা যায়নি");
    }
  };

  const handleDeleteProject = async (p: Project) => {
    if (!confirm(`"${p.name}" প্রজেক্টটি ডিলিট করলে এর সকল লেনদেন ডিলিট হয়ে যাবে। নিশ্চিত?`)) return;
    try {
      // Delete project document
      await deleteDoc(doc(db, "projects", p.id));

      // Batch delete associated transaction files
      const trxsSnap = await getDocs(query(collection(db, "accounts"), where("projectId", "==", p.id)));
      for (const d of trxsSnap.docs) {
        await deleteDoc(d.ref);
      }

      setSelectedProject(null);
      setShowHistoryModal(false);
    } catch (e) {
      console.error(e);
      alert("ডিলিট করা যায়নি");
    }
  };

  const handleDeleteInstallment = async (inst: Installment) => {
    if (!confirm(`"${inst.customerName}" কিস্তি কন্ট্যাক্টটি ডিলিট করতে চান?`)) return;
    try {
      await deleteDoc(doc(db, "installments", inst.id));
      setSelectedProjectInstallment(null);
    } catch (e) {
      console.error(e);
      alert("ডিলিট করা যায়নি");
    }
  };

  // Project profit summary
  const getProjectsProfitSummary = () => {
    const summary: Record<string, { expense: 0; sale: 0 }> = {};
    transactions.forEach((t) => {
      if (!summary[t.projectId]) summary[t.projectId] = { expense: 0, sale: 0 };
      const amount = Number(t.amount || 0);
      if (t.type === "expense") summary[t.projectId].expense += amount;
      else if (t.type === "sale") summary[t.projectId].sale += amount;
    });
    return summary;
  };

  const projSummary = getProjectsProfitSummary();

  const handleFabClick = () => {
    if (activeTab === "invest") {
      setAddMode("invest");
      setShowAddModal(true);
    } else if (activeTab === "projects") {
      setAddMode("transaction");
      setShowAddModal(true);
    } else if (activeTab === "ledger") {
      setAddMode("installment");
      setShowAddModal(true);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="mt-4 text-xs font-bold text-slate-400">ড্যাশবোর্ড লোড হচ্ছে...</p>
      </div>
    );
  }

  const isCompanyOrAdmin = currentUser.role === "company" || currentUser.role === "admin";

  return (
    <div className="min-h-screen bg-slate-50 pb-28 relative">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-br from-blue-700 to-indigo-800 text-white p-5 m-4 rounded-3xl shadow-md">
        <p className="text-[10px] opacity-80 font-bold uppercase tracking-widest">সালাম ও শুভেচ্ছা!</p>
        <h2 className="text-lg sm:text-xl font-extrabold mt-1">স্বাগতম, {currentUser.name} 👋</h2>
        <p className="text-[11px] opacity-90 mt-1 font-medium">আজকের দিনটি শুভ হোক। নিচে আপনার ব্যবসার বর্তমান অবস্থা ও সদস্যদের কিস্তির তথ্য দেওয়া হলো।</p>
      </div>

      {/* Bento Stats Summary */}
      <div className="px-4 mt-1">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-4">
          <div className="grid grid-cols-2 gap-3.5">
            <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl text-center flex flex-col justify-center">
              <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">মোট ইনভেস্ট</p>
              <p className="text-blue-600 font-bold text-sm mt-0.5">৳{formatNum(totalDeposit)}</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl text-center flex flex-col justify-center">
              <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">মোট খরচ</p>
              <p className="text-rose-500 font-bold text-sm mt-0.5">৳{formatNum(totalExpense)}</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl text-center flex flex-col justify-center">
              <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">মোট আয়</p>
              <p className="text-emerald-600 font-bold text-sm mt-0.5">৳{formatNum(totalIncome)}</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl text-center flex flex-col justify-center">
              <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">নগদ ক্যাশ</p>
              <p className="text-emerald-600 font-bold text-sm mt-0.5">৳{formatNum(totalBalance)}</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl text-center flex flex-col justify-center">
              <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">বাকি (কিস্তি)</p>
              <p className="text-rose-500 font-bold text-sm mt-0.5">৳{formatNum(totalDue)}</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl text-center flex flex-col justify-center">
              <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">বকেয়া সেভিংস</p>
              {arrearsLoading ? (
                <p className="text-rose-500 font-bold text-xs mt-1 animate-pulse">লোড হচ্ছে...</p>
              ) : (
                <button
                  onClick={() => onNavigate("arrears")}
                  className="text-rose-500 font-extrabold text-sm mt-0.5 hover:underline block mx-auto"
                >
                  ৳{formatNum(totalArrearsAmount)}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mx-4 mt-5 bg-white border border-slate-200 rounded-2xl overflow-hidden flex shadow-sm">
        <button
          onClick={() => setActiveTab("invest")}
          className={`flex-1 py-4 text-xs font-bold transition-all relative ${
            activeTab === "invest" ? "text-blue-600 bg-blue-50/40" : "text-slate-400"
          }`}
        >
          ইনভেস্টর
          {activeTab === "invest" && <span className="absolute bottom-0 left-1/4 right-1/4 h-[3px] bg-blue-600 rounded-full"></span>}
        </button>
        <button
          onClick={() => setActiveTab("projects")}
          className={`flex-1 py-4 text-xs font-bold transition-all relative ${
            activeTab === "projects" ? "text-blue-600 bg-blue-50/40" : "text-slate-400"
          }`}
        >
          প্রজেক্ট
          {activeTab === "projects" && <span className="absolute bottom-0 left-1/4 right-1/4 h-[3px] bg-blue-600 rounded-full"></span>}
        </button>
        {!(currentUser.role === "member" && !currentUser.canSeeAllData) && (
          <button
            onClick={() => setActiveTab("ledger")}
            className={`flex-1 py-4 text-xs font-bold transition-all relative ${
              activeTab === "ledger" ? "text-blue-600 bg-blue-50/40" : "text-slate-400"
            }`}
          >
            কিস্তি লেজার
            {activeTab === "ledger" && <span className="absolute bottom-0 left-1/4 right-1/4 h-[3px] bg-blue-600 rounded-full"></span>}
          </button>
        )}
      </div>

      {/* Tab Panels */}
      <main className="p-4">
        {/* INVESTOR VIEW */}
        {activeTab === "invest" && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
            <table className="min-w-max w-full text-xs text-left divide-y divide-slate-100">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="p-3">নাম</th>
                  <th className="p-3 text-right">সঞ্চয়</th>
                  <th className="p-3 text-center">শেয়ার %</th>
                  <th className="p-3 text-right">খরচ</th>
                  <th className="p-3 text-right">আয়</th>
                  <th className="p-3 text-right">ব্যালেন্স</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users
                  .filter((u) => {
                    if (u.role !== "member") return false;
                    // If member and cannot see all, they only see themselves
                    if (currentUser.role === "member" && !currentUser.canSeeAllData) {
                      return u.docId === currentUser.docId;
                    }
                    // For company, only members of that company
                    if (currentUser.role === "company") {
                      return u.companyId === currentUser.docId;
                    }
                    return true;
                  })
                  .map((u) => {
                    const uAmt = parseFloat(String(u.amount || 0)) || 0;
                    let share = 0;
                    if (u.customShare !== undefined && u.customShare !== null) {
                      share = u.customShare / 100;
                    } else {
                      share = globalTotalDeposit > 0 ? uAmt / globalTotalDeposit : 0;
                    }
                    const userExpense = globalTotalExpense * share;
                    const userIncome = Math.max(0, globalTotalIncome * share);
                    const finalBalance = uAmt - userExpense + userIncome;

                    return (
                      <tr
                        key={u.docId}
                        onClick={() => handleShowUserHistory(u)}
                        className="hover:bg-slate-50/80 cursor-pointer transition font-medium"
                      >
                        <td className="p-3 font-bold text-blue-700">{u.name}</td>
                        <td className="p-3 text-right font-bold text-slate-700">৳{formatNum(uAmt)}</td>
                        <td className="p-3 text-center text-blue-600 font-bold">{(share * 100).toFixed(1)}%</td>
                        <td className="p-3 text-right text-rose-500 font-bold">৳{formatNum(userExpense)}</td>
                        <td className="p-3 text-right text-emerald-600 font-bold">৳{formatNum(userIncome)}</td>
                        <td className={`p-3 text-right font-bold ${finalBalance >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                          ৳{formatNum(finalBalance)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {/* PROJECTS VIEW */}
        {activeTab === "projects" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="min-w-max w-full text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-500 uppercase">
                <tr className="border-b border-slate-200">
                  <th className="p-3 text-left">প্রজেক্ট</th>
                  <th className="p-3 text-right">খরচ</th>
                  <th className="p-3 text-right">আয়</th>
                  <th className="p-3 text-right">লাভ/ক্ষতি</th>
                  <th className="p-3 text-center">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects
                  .filter((p) => {
                    if (currentUser.role === "admin") return true;
                    const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
                    return p.companyId === targetCompanyId;
                  })
                  .map((p) => {
                  const s = projSummary[p.id] || { expense: 0, sale: 0 };
                  const profit = s.sale - s.expense;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => handleShowProjectHistory(p)}
                      className="hover:bg-slate-50/80 cursor-pointer font-medium"
                    >
                      <td className="p-3 font-bold text-blue-700">{p.name}</td>
                      <td className="p-3 text-right text-rose-500 font-bold">৳{formatNum(s.expense)}</td>
                      <td className="p-3 text-right text-emerald-600 font-bold">৳{formatNum(s.sale)}</td>
                      <td className={`p-3 text-right font-bold ${profit >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                        ৳{formatNum(profit)}
                      </td>
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setShowProjectDetails(p)}
                          className="px-2.5 py-1 text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg border border-blue-100 font-bold transition flex items-center gap-0.5 mx-auto"
                        >
                          <Info className="w-3 h-3" /> ভিউ
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* LEDGER/INSTALLMENT VIEW */}
        {activeTab === "ledger" && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
            <table className="min-w-max w-full text-xs text-left divide-y divide-slate-100">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="p-3">কাস্টমার</th>
                  <th className="p-3">পণ্য</th>
                  <th className="p-3 text-center">তারিখ</th>
                  <th className="p-3 text-right">জমা</th>
                  <th className="p-3 text-right">বাকি</th>
                  <th className="p-3 text-center">স্ট্যাটাস</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {installments
                  .filter((item) => {
                    if (currentUser.role === "admin") return true;
                    if (currentUser.role === "member" && !currentUser.canSeeAllData) return false;
                    const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
                    return item.companyId === targetCompanyId;
                  })
                  .map((item) => {
                  const paidTotal = (item.schedule || [])
                    .filter((s) => s.status === "paid")
                    .reduce((sum, s) => sum + Number(s.amount || 0), 0);
                  let due = Number(item.totalAmount || 0) - Number(item.downPayment || 0) - paidTotal;
                  if (due < 0) due = 0;
                  const isClosed = due <= 0;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => handleShowInstallment(item)}
                      className="hover:bg-slate-50/80 cursor-pointer transition"
                    >
                      <td className="p-3 font-bold text-blue-700">{item.customerName}</td>
                      <td className="p-3 text-slate-600">{item.productName}</td>
                      <td className="p-3 text-center text-slate-500 font-mono">{item.startDate || "N/A"}</td>
                      <td className="p-3 text-right font-bold text-emerald-600">৳{formatNum(paidTotal)}</td>
                      <td className="p-3 text-right font-bold text-rose-500">৳{formatNum(due)}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${isClosed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {isClosed ? "✅ সম্পূর্ণ" : "🟡 চলমান"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Add FAB (floating action button) */}
      {isCompanyOrAdmin && (
        <button
          onClick={handleFabClick}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-full shadow-2xl flex items-center justify-center font-bold text-2xl transition active:scale-95 z-40 cursor-pointer"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* ======================================================== */}
      {/* 1. UNIVERSAL ADD TRANSACTION / PROJECT / CONTRACT MODAL */}
      {/* ======================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end justify-center z-[999]">
          <div className="bg-white w-full max-w-lg rounded-t-[30px] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-slideUp">
            <div className="p-5 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 text-sm">
                {addMode === "invest"
                  ? "নতুন ইনভেস্ট"
                  : addMode === "transaction"
                  ? "প্রজেক্ট লেনদেন"
                  : addMode === "project"
                  ? "নতুন প্রজেক্ট তৈরি"
                  : "নতুন কিস্তি চুক্তি"}
              </h3>
              {/* If on project addMode, allow flipping between creating a transaction or creating a project */}
              {activeTab === "projects" && (
                <button
                  onClick={() => setAddMode(addMode === "transaction" ? "project" : "transaction")}
                  className="px-2.5 py-1 text-[10px] font-bold text-indigo-600 border border-indigo-200 bg-indigo-50 rounded-lg"
                >
                  {addMode === "transaction" ? "নতুন প্রজেক্ট" : "নতুন লেনদেন"}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* A. NEW INVESTMENT FORM */}
              {addMode === "invest" && (
                <div className="space-y-3.5 text-left">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">ইউজার সিলেক্ট করুন</label>
                    <select
                      value={newInvestTarget}
                      onChange={(e) => handleNewInvestTargetChange(e.target.value)}
                      className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-indigo-500"
                    >
                      <option value="">নির্বাচন করুন</option>
                      {users
                        .filter((u) => u.role === "member")
                        .map((u) => (
                          <option key={u.docId} value={u.docId}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">একাউন্টের ধরন</label>
                      <select
                        value={newInvestAcctType}
                        onChange={(e: any) => setNewInvestAcctType(e.target.value)}
                        className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-indigo-500"
                      >
                        <option value="">নির্বাচন করুন</option>
                        <option value="business">বিজনেস</option>
                        <option value="saving">সেভিংস</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">কিস্তির ধরন</label>
                      <select
                        value={newInvestMode}
                        onChange={(e: any) => setNewInvestMode(e.target.value)}
                        className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-indigo-500"
                      >
                        <option value="">নির্বাচন করুন</option>
                        <option value="monthly">মাসিক</option>
                        <option value="yearly">বাৎসরিক</option>
                        <option value="one_time">এককালীন</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">৳ পরিমাণ</label>
                    <input
                      type="number"
                      value={newInvestAmount || ""}
                      onChange={(e) => setNewInvestAmount(parseFloat(e.target.value) || 0)}
                      placeholder="টাকার পরিমাণ লিখুন"
                      className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-indigo-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">তারিখ</label>
                    <input
                      type="date"
                      value={newInvestDate}
                      onChange={(e) => setNewInvestDate(e.target.value)}
                      className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">মেমো নম্বর/মাস</label>
                    <input
                      type="text"
                      value={newInvestMemo}
                      onChange={(e) => setNewInvestMemo(e.target.value)}
                      placeholder="মেমো নম্বর বা বিবরণ"
                      className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* B. NEW TRANSACTION FORM */}
              {addMode === "transaction" && (
                <div className="space-y-3.5 text-left">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">প্রজেক্ট নির্বাচন করুন</label>
                    <select
                      value={newTrxProject}
                      onChange={(e) => setNewProjectTarget(e.target.value)}
                      className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-indigo-500"
                    >
                      <option value="">নির্বাচন করুন</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">লেনদেনের ধরন</label>
                    <select
                      value={newTrxType}
                      onChange={(e: any) => setNewTrxType(e.target.value)}
                      className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-indigo-500"
                    >
                      <option value="expense">খরচ</option>
                      <option value="sale">আয়</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">৳ পরিমাণ</label>
                    <input
                      type="number"
                      value={newTrxAmount || ""}
                      onChange={(e) => setNewTrxAmount(parseFloat(e.target.value) || 0)}
                      placeholder="টাকার পরিমাণ লিখুন"
                      className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-indigo-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">তারিখ</label>
                    <input
                      type="date"
                      value={newTrxDate}
                      onChange={(e) => setNewTrxDate(e.target.value)}
                      className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">বিবরণ</label>
                    <input
                      type="text"
                      value={newTrxDesc}
                      onChange={(e) => setNewTrxDesc(e.target.value)}
                      placeholder="বিবরণ"
                      className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* C. NEW PROJECT CREATION FORM */}
              {addMode === "project" && (
                <div className="space-y-3.5 text-left">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">প্রজেক্ট নাম *</label>
                    <input
                      type="text"
                      value={newProjName}
                      onChange={(e) => setNewProjName(e.target.value)}
                      placeholder="প্রজেক্টের নাম লিখুন"
                      className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-indigo-500 font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">প্রজেক্ট টাইপ</label>
                      <select
                        value={newProjType}
                        onChange={(e) => setNewProjType(e.target.value)}
                        className="w-full border border-slate-200 p-3 rounded-xl text-xs bg-white"
                      >
                        <option value="">নির্বাচন করুন</option>
                        <option value="land">🏞️ জমি</option>
                        <option value="plot">📐 প্লট</option>
                        <option value="flat">🏢 ফ্ল্যাট</option>
                        <option value="house">🏠 বাড়ি</option>
                        <option value="shop">🏪 দোকান</option>
                        <option value="investment">💰 বিনিয়োগ</option>
                        <option value="other">📦 অন্যান্য</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">স্ট্যাটাস</label>
                      <select
                        value={newProjStatus}
                        onChange={(e: any) => setNewProjStatus(e.target.value)}
                        className="w-full border border-slate-200 p-3 rounded-xl text-xs bg-white"
                      >
                        <option value="active">🟢 চলমান</option>
                        <option value="completed">✅ সম্পন্ন</option>
                        <option value="closed">🔴 বন্ধ</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">শুরুর তারিখ</label>
                      <input
                        type="date"
                        value={newProjStartDate}
                        onChange={(e) => setNewProjStartDate(e.target.value)}
                        className="w-full border border-slate-200 p-3 rounded-xl text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">সম্ভাব্য শেষ তারিখ</label>
                      <input
                        type="date"
                        value={newProjEndDate}
                        onChange={(e) => setNewProjEndDate(e.target.value)}
                        className="w-full border border-slate-200 p-3 rounded-xl text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">সম্ভাব্য সময়কাল</label>
                      <input
                        type="text"
                        value={newProjDuration}
                        onChange={(e) => setNewProjDuration(e.target.value)}
                        placeholder="যেমনঃ ৬ মাস / ১ বছর"
                        className="w-full border border-slate-200 p-3 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">সম্ভাব্য বাজেট</label>
                      <input
                        type="number"
                        value={newProjBudget || ""}
                        onChange={(e) => setNewProjBudget(parseFloat(e.target.value) || 0)}
                        placeholder="সম্ভাব্য বাজেট"
                        className="w-full border border-slate-200 p-3 rounded-xl text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">📍 লোকেশন</label>
                    <input
                      type="text"
                      value={newProjLocation}
                      onChange={(e) => setNewProjLocation(e.target.value)}
                      placeholder="লোকেশন লিখুন"
                      className="w-full border border-slate-200 p-3 rounded-xl text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">📝 বিস্তারিত বিবরণ</label>
                    <textarea
                      value={newProjDesc}
                      onChange={(e) => setNewProjDesc(e.target.value)}
                      placeholder="প্রজেক্ট সম্পর্কে বিস্তারিত লিখুন..."
                      rows={3}
                      className="w-full border border-slate-200 p-3 rounded-xl text-xs resize-none"
                    />
                  </div>
                </div>
              )}

              {/* D. NEW INSTALLMENT CONTRACT FORM */}
              {addMode === "installment" && (
                <div className="space-y-3.5 text-left font-semibold">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">কাস্টমার সিলেক্ট করুন *</label>
                    <select
                      value={newInstCustomerName}
                      onChange={(e) => setNewInstCustomer(e.target.value)}
                      className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-indigo-500"
                    >
                      <option value="">সিলেক্ট করুন</option>
                      {users
                        .filter((u) => u.role === "member")
                        .map((u) => (
                          <option key={u.docId} value={u.name}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">প্রোডাক্ট / প্রজেক্ট সিলেক্ট করুন *</label>
                    <select
                      value={newInstProductName}
                      onChange={(e) => setNewInstProduct(e.target.value)}
                      className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-indigo-500"
                    >
                      <option value="">সিলেক্ট করুন</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">মোট মূল্য *</label>
                      <input
                        type="number"
                        value={newInstTotalAmount || ""}
                        onChange={(e) => setNewInstTotal(parseFloat(e.target.value) || 0)}
                        placeholder="মোট মূল্য"
                        className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">অগ্রিম প্রদান</label>
                      <input
                        type="number"
                        value={newInstDownPayment || ""}
                        onChange={(e) => setNewInstDown(parseFloat(e.target.value) || 0)}
                        placeholder="অগ্রিম"
                        className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">কিস্তির মাস সংখ্যা *</label>
                      <input
                        type="number"
                        value={newInstMonths || ""}
                        onChange={(e) => setNewInstMonths(parseInt(e.target.value) || 0)}
                        placeholder="যেমনঃ ১২ বা ২৪"
                        className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">শুরুর তারিখ *</label>
                      <input
                        type="date"
                        value={newInstStartDate}
                        onChange={(e) => setNewInstStartDate(e.target.value)}
                        className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* Calculated monthly installment preview */}
                  {newInstTotalAmount > 0 && newInstMonths > 0 && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center text-xs">
                      <span className="text-slate-500 font-bold">মাসিক কিস্তি (অটো হিসাব):</span>
                      <span className="font-extrabold text-blue-600">
                        ৳{formatNum(Math.ceil((newInstTotalAmount - newInstDownPayment) / newInstMonths))} / মাস
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-5 border-t flex gap-3 bg-slate-50">
              <button
                onClick={handleSubmitEntry}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-2xl font-bold transition text-xs shadow-md disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {saving ? "প্রসেসিং..." : "সেভ করুন"}
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3.5 rounded-2xl font-bold transition text-xs"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. HISTORY LIST MODAL OVERLAY (For Investments & Project Trxs) */}
      {/* ======================================================== */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[999] p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center border-b pb-3 mb-3">
              <h3 className="text-base font-bold text-blue-700">
                {selectedUser ? `${selectedUser.name} - ইনভেস্ট হিস্টোরি` : `${selectedProject?.name} - লেনদেনসমূহ`}
              </h3>
              {selectedProject && isCompanyOrAdmin && (
                <button
                  onClick={() => setEditingProject(selectedProject)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
              {selectedUser && isCompanyOrAdmin && (
                <button
                  onClick={() => {
                    setEditingUserShare(selectedUser);
                    setCustomShareValue(selectedUser.customShare !== undefined && selectedUser.customShare !== null ? String(selectedUser.customShare) : "");
                  }}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
                  title="শেয়ার পার্সেন্টেজ সেটিংস"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {selectedUser ? (
                historyLoading ? (
                  <p className="text-center py-6 text-xs text-slate-400">ইতিহাস লোড হচ্ছে...</p>
                ) : (
                  <>
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-3 shrink-0">
                      <button
                        onClick={() => setInvestHistoryTab("schedule")}
                        className={`flex-1 py-2 text-center text-xs font-bold rounded-xl transition ${
                          investHistoryTab === "schedule" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-400 hover:text-slate-600"
                        }`}
                      >
                        📅 সেভিংস সিডিউল (Schedule)
                      </button>
                      <button
                        onClick={() => setInvestHistoryTab("history")}
                        className={`flex-1 py-2 text-center text-xs font-bold rounded-xl transition ${
                          investHistoryTab === "history" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-400 hover:text-slate-600"
                        }`}
                      >
                        📋 জমার ইতিহাস (History)
                      </button>
                    </div>

                    {investHistoryTab === "schedule" ? (
                      getSavingsScheduleForUser(selectedUser, userHistory).length === 0 ? (
                        <p className="text-center text-slate-400 text-xs py-6">কোনো সেভিংস সিডিউল পাওয়া যায়নি (সেভিংস এর ধরণ ও তারিখ সঠিক নয়)</p>
                      ) : (
                        <div className="divide-y divide-slate-100 space-y-2.5">
                          {getSavingsScheduleForUser(selectedUser, userHistory).map((item, index) => (
                            <div key={index} className="flex justify-between items-center py-2.5">
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
                                  ৳{formatNum(item.amount)}
                                </span>
                                {item.payment?.date && (
                                  <span className="text-[8px] text-slate-400 block font-mono">
                                    জমা: {formatDate(item.payment.date)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    ) : userHistory.length === 0 ? (
                      <p className="text-center py-6 text-xs text-slate-400">কোনো ইতিহাস নেই</p>
                    ) : (
                      userHistory.map((h) => {
                        const isArrears = h.type === "savings_arrears";
                        const amt = isArrears ? Number(h.arrears || 0) : Number(h.amount || 0);

                        return (
                          <div
                            key={h.docId}
                            className={`p-3 rounded-2xl flex justify-between items-center border-l-4 ${isArrears ? "bg-rose-50/50 border-rose-500" : "bg-slate-50 border-blue-500"}`}
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-[10px] font-bold text-slate-400 font-mono">{formatDate(h.date)}</p>
                                {isArrears && (
                                  <span className="text-[8px] bg-rose-100 text-rose-600 font-extrabold px-1.5 py-0.2 rounded-sm">
                                    বকেয়া
                                  </span>
                                )}
                              </div>
                              <p className={`text-xs font-semibold mt-0.5 ${isArrears ? "text-rose-700" : "text-slate-600"}`}>
                                {isArrears ? h.memo : `মেমো: ${h.memo || "N/A"}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <p className={`font-extrabold text-xs ${isArrears ? "text-rose-600" : "text-emerald-600"}`}>
                                ৳{formatNum(amt)}
                              </p>
                              {isCompanyOrAdmin && !isArrears && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setEditingInvest({ entry: h, userId: selectedUser.docId })}
                                    className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded font-bold"
                                  >
                                    এডিট
                                  </button>
                                  <button
                                    onClick={() => handleDeleteInvestHistory(h)}
                                    className="p-1 bg-rose-50 text-rose-500 rounded hover:bg-rose-100"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </>
                )
              ) : selectedProject ? (
                projectTrxs.length === 0 ? (
                  <p className="text-center py-6 text-xs text-slate-400">কোনো লেনদেন নেই</p>
                ) : (
                  projectTrxs.map((t) => (
                    <div
                      key={t.id}
                      className="bg-slate-50 p-3 rounded-2xl flex justify-between items-center border-l-4 border-indigo-500"
                    >
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 font-mono">{formatDate(t.date)}</p>
                        <p className="text-xs font-semibold text-slate-700 mt-0.5">
                          {t.type === "expense" ? "🔴 খরচ" : "🟢 আয়"}
                        </p>
                        {t.desc && <p className="text-[10px] text-slate-500 mt-0.5">{t.desc}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className={`font-extrabold text-xs ${t.type === "sale" ? "text-emerald-600" : "text-rose-500"}`}>
                          ৳{formatNum(t.amount)}
                        </p>
                        {isCompanyOrAdmin && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditingTrx(t)}
                              className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold"
                            >
                              এডিট
                            </button>
                            <button
                              onClick={() => handleDeleteTrx(t)}
                              className="p-1 bg-rose-50 text-rose-500 rounded hover:bg-rose-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )
              ) : null}
            </div>

            <button
              onClick={() => {
                setShowHistoryModal(false);
                setSelectedUser(null);
                setSelectedProject(null);
              }}
              className="w-full bg-slate-100 hover:bg-slate-200 py-3 rounded-xl font-bold text-xs mt-4"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. DETAILED ACTIVE INSTALLMENT CONTRACT STEPS MODAL */}
      {/* ======================================================== */}
      {selectedInstallment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end justify-center z-[999]">
          <div className="bg-white w-full max-w-lg rounded-t-[30px] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-slideUp">
            <div className="p-5 border-b bg-slate-50 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base">{selectedInstallment.customerName}</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">পণ্যঃ {selectedInstallment.productName}</p>
                </div>
                {isCompanyOrAdmin && (
                  <button
                    onClick={() => setEditingInstallment(selectedInstallment)}
                    className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition"
                  >
                    <Settings className="w-4 h-4 text-slate-600" />
                  </button>
                )}
              </div>

              {/* Tabs inside Installment modal */}
              <div className="flex border-b border-slate-200 mt-2">
                <button
                  onClick={() => setInstTab("schedule")}
                  className={`flex-1 pb-2 text-center text-xs font-bold transition-all relative ${
                    instTab === "schedule" ? "text-blue-600" : "text-slate-400"
                  }`}
                >
                  📅 কিস্তি শিডিউল
                  {instTab === "schedule" && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-blue-600 rounded-full"></span>}
                </button>
                <button
                  onClick={() => setInstTab("history")}
                  className={`flex-1 pb-2 text-center text-xs font-bold transition-all relative ${
                    instTab === "history" ? "text-blue-600" : "text-slate-400"
                  }`}
                >
                  📜 পরিশোধের ইতিহাস
                  {instTab === "history" && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-blue-600 rounded-full"></span>}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {/* SCHEDULE STEPS VIEW */}
              {instTab === "schedule" && (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-500 uppercase tracking-wide">
                        <tr>
                          <th className="p-2.5">মাস</th>
                          <th className="p-2.5">তারিখ ও পেমেন্ট</th>
                          <th className="p-2.5 text-right">বাকি পরিমাণ</th>
                          <th className="p-2.5 text-center">অবস্থা</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {(selectedInstallment.schedule || []).map((s) => {
                          const due = Math.max(0, s.amount - s.paidAmount);
                          const isPaid = s.status === "paid" || due <= 0;
                          return (
                            <tr key={s.month} className={isPaid ? "bg-emerald-50/40" : ""}>
                              <td className="p-2.5 font-bold text-slate-800">কিস্তি {s.month}</td>
                              <td className="p-2.5">
                                <span className="font-mono text-slate-500">{s.dueDate}</span>
                                <div className="text-[9px] text-emerald-600 font-bold mt-0.5">জমাঃ ৳{formatNum(s.paidAmount)}</div>
                              </td>
                              <td className="p-2.5 text-right">
                                <span className="font-bold text-slate-800">৳{formatNum(s.amount)}</span>
                                {due > 0 && <div className="text-[9px] text-rose-500 font-bold mt-0.5">বাকিঃ ৳{formatNum(due)}</div>}
                              </td>
                              <td className="p-2.5 text-center">
                                <span className={`px-2 py-0.5 rounded font-extrabold text-[8px] uppercase ${isPaid ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                                  {isPaid ? "পরিশোধিত" : "বকেয়া"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Payment controls */}
                  {selectedInstallment.dueAmount > 0 && isCompanyOrAdmin && (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-150 space-y-3 text-left">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">💵 কাস্টম পরিমাণ পরিশোধ করুন</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={customPayAmount || ""}
                          onChange={(e) => {
                            setCustomPayAmount(parseFloat(e.target.value) || 0);
                            setPaymentPreview(null);
                          }}
                          placeholder="টাকার পরিমাণ"
                          className="flex-1 border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold outline-none bg-white focus:border-emerald-500"
                        />
                        <button
                          onClick={handleCalculateCustomPayment}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-xl text-xs transition active:scale-95 cursor-pointer"
                        >
                          হিসাব করুন
                        </button>
                      </div>

                      {/* Calculated sequential allocation preview */}
                      {paymentPreview && (
                        <div className="mt-3 p-3 bg-indigo-50 border border-indigo-150 rounded-xl space-y-2 text-[11px] text-slate-700 animate-fadeIn">
                          <p className="font-extrabold text-indigo-800 border-b pb-1.5 flex items-center justify-between">
                            <span>📊 পেমেন্ট বণ্টন হিসাব রিভিউ</span>
                            <span className="text-xs bg-indigo-100 px-2 py-0.5 rounded-full text-indigo-700 font-extrabold">৳{formatNum(paymentPreview.amount)}</span>
                          </p>
                          <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                            {paymentPreview.scheduleCopy.map((s, idx) => {
                              const originalStep = (selectedInstallment.schedule || [])[idx];
                              const addedAmount = s.paidAmount - (originalStep?.paidAmount || 0);
                              if (addedAmount <= 0) return null;
                              return (
                                <div key={s.month} className="flex justify-between items-center py-0.5 border-b border-indigo-100/50">
                                  <span>কিস্তি {s.month} ({s.status === "paid" ? "✅ পরিশোধিত" : "🟡 আংশিক"}):</span>
                                  <span className="font-bold text-slate-800">৳{formatNum(originalStep?.paidAmount || 0)} ➔ ৳{formatNum(s.paidAmount)} (+৳{formatNum(addedAmount)})</span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-between items-center font-bold text-slate-800 pt-1 border-t border-indigo-150">
                            <span>নতুন বকেয়া পরিমাণঃ</span>
                            <span className="text-rose-600 font-extrabold">৳{formatNum(paymentPreview.computedDue)}</span>
                          </div>
                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={handleSaveCustomPayment}
                              disabled={saving}
                              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-xl text-[10px] transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                            >
                              ✔️ নিশ্চিত ও সেভ করুন
                            </button>
                            <button
                              onClick={() => setPaymentPreview(null)}
                              className="px-3 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold py-2 rounded-xl text-[10px] transition cursor-pointer"
                            >
                              বাতিল
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* PAYMENTS HISTORY LIST */}
              {instTab === "history" && (
                <div className="space-y-2">
                  {(selectedInstallment.schedule || []).filter((s) => s.status === "paid" || s.paidAmount > 0).length === 0 ? (
                    <p className="text-center text-slate-400 text-xs py-6">কোনো পরিশোধের ইতিহাস নেই</p>
                  ) : (
                    (selectedInstallment.schedule || [])
                      .filter((s) => s.status === "paid" || s.paidAmount > 0)
                      .map((s) => (
                        <div key={s.month} className="bg-slate-50 p-3.5 rounded-2xl flex justify-between items-center border-l-4 border-emerald-500">
                          <div>
                            <span className="text-xs font-bold text-slate-800">কিস্তি নং {s.month}</span>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">পরিশোধের তারিখঃ {s.paidDate || s.dueDate}</p>
                          </div>
                          <span className="text-emerald-600 font-bold text-xs">৳{formatNum(s.paidAmount)}</span>
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>

            <div className="p-5 border-t bg-slate-50 flex gap-3">
              <button
                onClick={() => setSelectedProjectInstallment(null)}
                className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 py-3.5 rounded-2xl font-bold transition text-xs text-center"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. EDIT MODAL FOR INVESTMENTS HISTORY */}
      {/* ======================================================== */}
      {editingInvest && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-left">
            <h3 className="font-bold text-slate-800 text-sm">ইনভেস্ট এডিট</h3>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">পরিমাণ (৳)</label>
              <input
                type="number"
                value={editingInvest.entry.amount || ""}
                onChange={(e) =>
                  setEditingInvest({
                    ...editingInvest,
                    entry: { ...editingInvest.entry, amount: parseFloat(e.target.value) || 0 },
                  })
                }
                className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">তারিখ</label>
              <input
                type="date"
                value={editingInvest.entry.date}
                onChange={(e) =>
                  setEditingInvest({
                    ...editingInvest,
                    entry: { ...editingInvest.entry, date: e.target.value },
                  })
                }
                className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">মেমো নম্বর</label>
              <input
                type="text"
                value={editingInvest.entry.memo || ""}
                onChange={(e) =>
                  setEditingInvest({
                    ...editingInvest,
                    entry: { ...editingInvest.entry, memo: e.target.value },
                  })
                }
                className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleUpdateInvest}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-75"
              >
                আপডেট
              </button>
              <button
                onClick={() => setEditingInvest(null)}
                className="flex-1 bg-slate-100 text-slate-500 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. EDIT MODAL FOR PROJECT TRANSACTION HISTORY */}
      {/* ======================================================== */}
      {editingTrx && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-left">
            <h3 className="font-bold text-slate-800 text-sm">লেনদেন এডিট</h3>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">লেনদেনের ধরন</label>
              <select
                value={editingTrx.type}
                onChange={(e: any) => setEditingTrx({ ...editingTrx, type: e.target.value })}
                className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
              >
                <option value="expense">খরচ</option>
                <option value="sale">আয়</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">পরিমাণ (৳)</label>
              <input
                type="number"
                value={editingTrx.amount || ""}
                onChange={(e) => setEditingTrx({ ...editingTrx, amount: parseFloat(e.target.value) || 0 })}
                className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">তারিখ</label>
              <input
                type="date"
                value={editingTrx.date}
                onChange={(e) => setEditingTrx({ ...editingTrx, date: e.target.value })}
                className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">বিবরণ</label>
              <input
                type="text"
                value={editingTrx.desc || ""}
                onChange={(e) => setEditingTrx({ ...editingTrx, desc: e.target.value })}
                className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleUpdateTrx}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-75"
              >
                আপডেট
              </button>
              <button
                onClick={() => setEditingTrx(null)}
                className="flex-1 bg-slate-100 text-slate-500 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. EDIT MODAL FOR GENERAL PROJECT SETTINGS */}
      {/* ======================================================== */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl max-h-[85vh] overflow-y-auto space-y-4 text-left">
            <h3 className="font-bold text-slate-800 text-sm">প্রজেক্ট সেটিংস এডিট</h3>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">প্রজেক্ট নাম</label>
              <input
                type="text"
                value={editingProject.name}
                onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">টাইপ</label>
              <select
                value={editingProject.type || ""}
                onChange={(e) => setEditingProject({ ...editingProject, type: e.target.value })}
                className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none bg-white"
              >
                <option value="">নির্বাচন করুন</option>
                <option value="land">🏞️ জমি</option>
                <option value="plot">📐 প্লট</option>
                <option value="flat">🏢 ফ্ল্যাট</option>
                <option value="house">🏠 বাড়ি</option>
                <option value="shop">🏪 দোকান</option>
                <option value="investment">💰 বিনিয়োগ</option>
                <option value="other">📦 অন্যান্য</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">স্ট্যাটাস</label>
              <select
                value={editingProject.status || "active"}
                onChange={(e: any) => setEditingProject({ ...editingProject, status: e.target.value })}
                className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none bg-white"
              >
                <option value="active">🟢 চলমান</option>
                <option value="completed">✅ সম্পন্ন</option>
                <option value="closed">🔴 বন্ধ</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">শুরুর তারিখ</label>
                <input
                  type="date"
                  value={editingProject.startDate || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, startDate: e.target.value })}
                  className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">সম্ভাব্য শেষ তারিখ</label>
                <input
                  type="date"
                  value={editingProject.endDate || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, endDate: e.target.value })}
                  className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">সম্ভাব্য সময়কাল</label>
                <input
                  type="text"
                  value={editingProject.duration || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, duration: e.target.value })}
                  className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">সম্ভাব্য বাজেট</label>
                <input
                  type="number"
                  value={editingProject.budget || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, budget: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">📍 লোকেশন</label>
              <input
                type="text"
                value={editingProject.location || ""}
                onChange={(e) => setEditingProject({ ...editingProject, location: e.target.value })}
                className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">📝 প্রজেক্ট বিবরণ</label>
              <textarea
                value={editingProject.desc || ""}
                onChange={(e) => setEditingProject({ ...editingProject, desc: e.target.value })}
                className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none resize-none"
                rows={3}
              />
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <button
                onClick={handleUpdateProject}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-75"
              >
                আপডেট
              </button>
              <button
                onClick={() => handleDeleteProject(editingProject)}
                className="bg-rose-50 border border-rose-200 text-rose-600 px-3.5 py-2.5 rounded-xl text-xs font-bold hover:bg-rose-100 flex items-center justify-center gap-1"
              >
                <Trash2 className="w-4 h-4" /> ডিলিট প্রজেক্ট
              </button>
              <button
                onClick={() => setEditingProject(null)}
                className="flex-1 bg-slate-100 text-slate-500 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. EDIT MODAL FOR INSTALLMENT GENERAL DETAILS */}
      {/* ======================================================== */}
      {editingInstallment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl max-h-[85vh] overflow-y-auto space-y-4 text-left font-semibold">
            <h3 className="font-bold text-slate-800 text-sm">কিস্তি চুক্তি এডিট</h3>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">কাস্টমার নাম *</label>
              <select
                value={editingInstallment.customerName}
                onChange={(e) => setEditingInstallment({ ...editingInstallment, customerName: e.target.value })}
                className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none bg-white focus:border-indigo-500 font-bold"
              >
                <option value="">সিলেক্ট করুন</option>
                {users
                  .filter((u) => u.role === "member")
                  .map((u) => (
                    <option key={u.docId} value={u.name}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">পণ্য / প্রজেক্ট *</label>
              <select
                value={editingInstallment.productName}
                onChange={(e) => setEditingInstallment({ ...editingInstallment, productName: e.target.value })}
                className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none bg-white focus:border-indigo-500 font-bold"
              >
                <option value="">সিলেক্ট করুন</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">মোট মূল্য *</label>
                <input
                  type="number"
                  value={editingInstallment.totalAmount || ""}
                  onChange={(e) =>
                    setEditingInstallment({ ...editingInstallment, totalAmount: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">অগ্রিম প্রদান</label>
                <input
                  type="number"
                  value={editingInstallment.downPayment || ""}
                  onChange={(e) =>
                    setEditingInstallment({ ...editingInstallment, downPayment: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">কিস্তির মাস সংখ্যা *</label>
                <input
                  type="number"
                  value={editingInstallment.months || ""}
                  onChange={(e) => setEditingInstallment({ ...editingInstallment, months: parseInt(e.target.value) || 0 })}
                  className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">শুরুর তারিখ *</label>
                <input
                  type="date"
                  value={editingInstallment.startDate}
                  onChange={(e) => setEditingInstallment({ ...editingInstallment, startDate: e.target.value })}
                  className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none font-mono"
                />
              </div>
            </div>

            {/* Calculated monthly installment preview in Edit Modal */}
            {editingInstallment.totalAmount > 0 && editingInstallment.months > 0 && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center text-xs">
                <span className="text-slate-500 font-bold">মাসিক কিস্তি (অটো হিসাব):</span>
                <span className="font-extrabold text-blue-600">
                  ৳{formatNum(Math.ceil((editingInstallment.totalAmount - (editingInstallment.downPayment || 0)) / editingInstallment.months))} / মাস
                </span>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2 border-t">
              <div className="flex gap-2">
                <button
                  onClick={handleUpdateInstallmentGeneral}
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-75 cursor-pointer"
                >
                  আপডেট করুন
                </button>
                <button
                  onClick={() => setEditingInstallment(null)}
                  className="flex-1 bg-slate-100 text-slate-500 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-200 cursor-pointer"
                >
                  বাতিল
                </button>
              </div>
              {isCompanyOrAdmin && (
                <button
                  onClick={() => {
                    if (confirm(`"${editingInstallment.customerName}" কিস্তি কন্ট্যাক্টটি ডিলিট করতে চান?`)) {
                      handleDeleteInstallment(editingInstallment);
                      setEditingInstallment(null);
                    }
                  }}
                  className="w-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 py-2.5 rounded-xl font-bold transition flex items-center justify-center gap-1 text-xs cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" /> ডিলিট চুক্তি
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CUSTOM SHARE SETTINGS MODAL FOR INVESTORS */}
      {/* ======================================================== */}
      {editingUserShare && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1001] p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-left font-sans">
            <div className="border-b pb-2">
              <h3 className="font-extrabold text-blue-700 text-sm">📈 শেয়ার সেটিংস</h3>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{editingUserShare.name} - এর শেয়ার পার্সেন্টেজ</p>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">কাস্টম শেয়ার পার্সেন্টেজ (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={customShareValue}
                onChange={(e) => setCustomShareValue(e.target.value)}
                placeholder="অটো হিসাবের জন্য খালি রাখুন"
                className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-blue-500 font-bold bg-white"
              />
              <p className="text-[9px] text-slate-400 font-medium mt-1 leading-normal">
                * এখানে মান লিখলে সিস্টেম ঐ নির্দিষ্ট পার্সেন্টেজ অনুযায়ী লাভ/ক্ষতি হিসাব করবে। আর ফাকা রাখলে স্বয়ংক্রিয়ভাবে মোট জমার অনুপাতে শেয়ার হিসাব হবে।
              </p>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={handleUpdateUserShare}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-75 cursor-pointer"
              >
                {saving ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}
              </button>
              <button
                onClick={() => setEditingUserShare(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-500 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 8. SINGLE PROJECT DETAILS INFO MODAL (VIEW ONLY) */}
      {/* ======================================================== */}
      {showProjectDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-left">
            <h3 className="font-extrabold text-blue-700 text-base border-b pb-2">📄 প্রজেক্টের তথ্য</h3>

            <div className="space-y-3.5 text-xs font-semibold text-slate-700">
              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">নাম</p>
                  <p className="text-slate-800 font-bold mt-0.5">{showProjectDetails.name}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">টাইপ</p>
                  <p className="text-slate-800 mt-0.5">{showProjectDetails.type || "N/A"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">সম্ভাব্য বাজেট</p>
                  <p className="text-emerald-600 font-bold mt-0.5">৳{formatNum(showProjectDetails.budget || 0)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">স্ট্যাটাস</p>
                  <span className="text-indigo-600 font-bold mt-0.5 inline-block">
                    {showProjectDetails.status === "active"
                      ? "🟢 চলমান"
                      : showProjectDetails.status === "completed"
                      ? "✅ সম্পন্ন"
                      : "🔴 বন্ধ"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">শুরুর তারিখ</p>
                  <p className="font-mono text-slate-600 mt-0.5">{showProjectDetails.startDate || "N/A"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">সম্ভাব্য শেষ তারিখ</p>
                  <p className="font-mono text-slate-600 mt-0.5">{showProjectDetails.endDate || "N/A"}</p>
                </div>
              </div>

              <div>
                <p className="text-[9px] text-slate-400 font-bold uppercase">📍 লোকেশন</p>
                <p className="text-slate-700 mt-0.5">{showProjectDetails.location || "N/A"}</p>
              </div>

              <div>
                <p className="text-[9px] text-slate-400 font-bold uppercase">📝 বিস্তারিত বিবরণ</p>
                <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 p-2.5 rounded-lg mt-1 whitespace-pre-line leading-relaxed">
                  {showProjectDetails.desc || "কোনো বিবরণী লেখা নেই।"}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowProjectDetails(null)}
              className="w-full bg-slate-100 hover:bg-slate-200 py-3 rounded-xl font-bold text-xs"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
