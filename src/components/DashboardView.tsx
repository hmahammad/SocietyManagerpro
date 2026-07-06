import React, { useState, useEffect } from "react";
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
  collectionGroup,
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
  Paperclip,
  Upload,
} from "lucide-react";

const writtenArrearsKeysGlobal = new Set<string>();

const calculateProjectDurationBn = (startStr: string, endStr: string): string => {
  if (!startStr || !endStr) return "";
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return "";

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
    days += prevMonth.getDate();
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }

  const bnDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  const toBnNum = (n: number) => String(n).split("").map(c => bnDigits[parseInt(c, 10)] || c).join("");

  const parts = [];
  if (years > 0) parts.push(`${toBnNum(years)} বছর`);
  if (months > 0) parts.push(`${toBnNum(months)} মাস`);
  if (days > 0) parts.push(`${toBnNum(days)} দিন`);

  return parts.join(" ") || "০ দিন";
};

interface DashboardViewProps {
  currentUser: User;
  onNavigate: (view: string, params?: any) => void;
  navigationParams?: any;
  totalEntries?: number;
}

type TabMode = "invest" | "projects" | "ledger";

export default function DashboardView({ currentUser, onNavigate, navigationParams, totalEntries = 0 }: DashboardViewProps) {
  const [activeTab, setActiveTab] = useState<TabMode>("invest");
  const [loading, setLoading] = useState(true);

  // Firestore Lists
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [allHistories, setAllHistories] = useState<(HistoryEntry & { userDocId: string })[]>([]);
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
  const currentProject = showProjectDetails
    ? (projects.find((p) => p.id === showProjectDetails.id) || showProjectDetails)
    : null;
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [editingUserShare, setEditingUserShare] = useState<User | null>(null);
  const [customShareValue, setCustomShareValue] = useState<string>("");
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Dynamic Add Form States
  // 1. New Investment form
  const [newInvestTarget, setNewInvestTarget] = useState("");
  const [newInvestAcctType, setNewInvestAcctType] = useState<"business" | "saving" | "">("");
  const [newInvestMode, setNewInvestMode] = useState<"monthly" | "yearly" | "one_time" | "">("");
  const [newInvestAmount, setNewInvestAmount] = useState<number>(0);
  const [newInvestDate, setNewInvestDate] = useState(new Date().toISOString().split("T")[0]);
  const [newInvestMemo, setNewInvestMemo] = useState("");
  const [newInvestProjectId, setNewInvestProjectId] = useState<string>("");
  const [selectedUserSavingsArrears, setSelectedUserSavingsArrears] = useState<number>(0);
  const [selectedUserInstallmentArrears, setSelectedUserInstallmentArrears] = useState<number>(0);

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

  // Project Document states
  const [docUploadLoading, setDocUploadLoading] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocNotes, setNewDocNotes] = useState("");
  const [newDocFile, setNewDocFile] = useState<{ data: string; name: string; type: string } | null>(null);
  const [readingDoc, setReadingDoc] = useState<{ name: string; notes?: string; fileData?: string; fileType?: string } | null>(null);

  // Entry Upload files state
  const [entryFile, setEntryFile] = useState<{ data: string; name: string; type: string } | null>(null);
  const [entryFileLoading, setEntryFileLoading] = useState(false);

  // 4. New Installment form
  const [newInstCustomerName, setNewInstCustomer] = useState("");
  const [newInstProductName, setNewInstProduct] = useState("");
  const [newInstTotalAmount, setNewInstTotal] = useState<number>(0);
  const [newInstDownPayment, setNewInstDown] = useState<number>(0);
  const [newInstMonths, setNewInstMonths] = useState<number>(0);
  const [newInstStartDate, setNewInstStartDate] = useState(new Date().toISOString().split("T")[0]);

  // Loading indicator for saves
  const [saving, setSaving] = useState(false);

  // Trigger opening Add Modal when navigated with openAdd parameter
  useEffect(() => {
    if (navigationParams?.openAdd) {
      handleFabClick();
    }
  }, [navigationParams]);

  // Fetch all main collections in realtime
  useEffect(() => {
    setLoading(true);

    const companyId = currentUser.role === "company" ? currentUser.docId : (currentUser.companyId || "");

    // 1. Role-based Users Query
    const userQuery = currentUser.role === "admin"
      ? collection(db, "users")
      : query(collection(db, "users"), where("companyId", "==", companyId));

    const unsubUsers = onSnapshot(userQuery, (snap) => {
      const list: User[] = [];
      snap.forEach((d) => {
        list.push({ docId: d.id, ...d.data() } as User);
      });
      if (currentUser.role === "company" && !list.some((u) => u.docId === currentUser.docId)) {
        list.push(currentUser);
      }
      setUsers(list);
    });

    // 2. Role-based Projects Query
    const projectQuery = currentUser.role === "admin"
      ? collection(db, "projects")
      : query(collection(db, "projects"), where("companyId", "==", companyId));

    const unsubProjects = onSnapshot(projectQuery, (snap) => {
      const list: Project[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Project);
      });
      setProjects(list);
    });

    // 3. Role-based Accounts (Transactions) Query
    const accountQuery = currentUser.role === "admin"
      ? collection(db, "accounts")
      : query(collection(db, "accounts"), where("companyId", "==", companyId));

    const unsubAccounts = onSnapshot(accountQuery, (snap) => {
      const list: Transaction[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Transaction);
      });
      // sort desc by date
      list.sort((a, b) => b.date.localeCompare(a.date));
      setTransactions(list);
    });

    // 4. Role-based Installments Query
    const installmentQuery = currentUser.role === "admin"
      ? collection(db, "installments")
      : query(collection(db, "installments"), where("companyId", "==", companyId));

    const unsubInstallments = onSnapshot(installmentQuery, (snap) => {
      const list: Installment[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Installment);
      });
      setInstallments(list);
      setLoading(false);
    });

    // 5. Role-based History Query
    let unsubAllHistory: () => void;
    if (currentUser.role === "admin") {
      unsubAllHistory = onSnapshot(collectionGroup(db, "history"), (snap) => {
        const list: (HistoryEntry & { userDocId: string })[] = [];
        snap.forEach((d) => {
          const parentUserDocId = d.ref.parent?.parent?.id || "";
          list.push({ docId: d.id, userDocId: parentUserDocId, ...d.data() } as any);
        });
        setAllHistories(list);
      });
    } else if (currentUser.role === "member") {
      // Member only loads their own history subcollection! Very fast!
      unsubAllHistory = onSnapshot(collection(db, "users", currentUser.docId, "history"), (snap) => {
        const list: (HistoryEntry & { userDocId: string })[] = [];
        snap.forEach((d) => {
          list.push({ docId: d.id, userDocId: currentUser.docId, ...d.data() } as any);
        });
        setAllHistories(list);
      });
    } else {
      // Company role handles history subscription in a separate reactive useEffect below
      unsubAllHistory = () => {};
    }

    return () => {
      unsubUsers();
      unsubProjects();
      unsubAccounts();
      unsubInstallments();
      unsubAllHistory();
    };
  }, [currentUser]);

  // Live sync of all company members' histories for Company role
  useEffect(() => {
    if (currentUser.role !== "company") return;
    if (users.length === 0) return;

    // Filter company members
    const companyMembers = users.filter((u) => u.role === "member" && u.companyId === currentUser.docId);

    const unsubs = companyMembers.map((m) => {
      return onSnapshot(collection(db, "users", m.docId, "history"), (snap) => {
        setAllHistories((prev) => {
          // Remove old history entries for this specific member
          const filtered = prev.filter((h) => h.userDocId !== m.docId);
          const newEntries: any[] = [];
          snap.forEach((docSnap) => {
            newEntries.push({ docId: docSnap.id, userDocId: m.docId, ...docSnap.data() });
          });
          return [...filtered, ...newEntries];
        });
      });
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [users, currentUser]);

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

  // Background check and create missing savings arrears for all company members
  useEffect(() => {
    if (users.length === 0 || allHistories.length === 0) return;

    // Only run if the user is company or admin or member
    const targetMembers = users.filter((u) => {
      if (u.role !== "member") return false;
      if (currentUser.role === "admin") return true;
      const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
      return u.companyId === targetCompanyId;
    });

    const runAutoCheck = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const d of targetMembers) {
        if (!d.InvestType || d.InvestType === "one_time") continue;
        if (!d.investDate || !d.investAmount || Number(d.investAmount) <= 0) continue;

        const investAmount = Number(d.investAmount);
        const investDateObj = new Date(d.investDate);
        const dayOfMonth = investDateObj.getDate();

        // Get this member's history entries
        const existingDocs = allHistories.filter((h) => h.userDocId === d.docId);
        const existingKeys = new Set(existingDocs.map((h) => h.arrearsKey).filter(Boolean));

        const startDate = new Date(d.createdAt || d.joinedDate || investDateObj.getTime());
        startDate.setDate(1);

        const toAdd = [];

        if (d.InvestType === "monthly") {
          let cur = new Date(startDate.getFullYear(), startDate.getMonth(), dayOfMonth);
          while (cur <= today) {
            const key = `arrears-${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
            const cacheKey = `${d.docId}-${key}`;
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
            const cacheKey = `${d.docId}-${key}`;
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

        if (toAdd.length > 0) {
          const historyCol = collection(db, "users", d.docId, "history");
          for (const item of toAdd) {
            try {
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
              console.log(`Auto-added missing arrears for member ${d.name}: ${item.key}`);
            } catch (err) {
              console.error(`Failed to auto-add arrears for member ${d.name}:`, err);
            }
          }
        }
      }
    };

    runAutoCheck();
  }, [users, allHistories, currentUser]);

  // Synchronize computed balances (savingsBalance, investBalance, incomeBalance) to Firestore
  useEffect(() => {
    if (users.length === 0 || allHistories.length === 0) return;

    const syncBalances = async () => {
      const { companyMembers, memberCalculations } = getProjectInvestmentsAndShares();

      for (const m of companyMembers) {
        const calc = memberCalculations[m.docId];
        if (!calc) continue;

        const currentSavings = Math.max(0, parseFloat(calc.savingsBalance.toFixed(2)));
        const currentInvest = Math.max(0, parseFloat(calc.investBalance.toFixed(2)));
        const currentIncome = Math.max(0, parseFloat(calc.incomeBalance.toFixed(2)));

        // Only update if there is a mismatch
        if (
          m.savingsBalance !== currentSavings ||
          m.investBalance !== currentInvest ||
          m.incomeBalance !== currentIncome ||
          m.amount !== currentSavings // Keep amount field in sync with savingsBalance for legacy/compatibility
        ) {
          try {
            const userRef = doc(db, "users", m.docId);
            await updateDoc(userRef, {
              savingsBalance: currentSavings,
              investBalance: currentInvest,
              incomeBalance: currentIncome,
              amount: currentSavings, // savings balance is represented as amount for legacy views
            });
            console.log(`Synced balances for ${m.name}: Savings: ${currentSavings}, Invest: ${currentInvest}, Income: ${currentIncome}`);
          } catch (err) {
            console.error(`Failed to sync balances for ${m.name}:`, err);
          }
        }
      }
    };

    syncBalances();
  }, [users, allHistories, projects, transactions, installments, currentUser]);

  // Auto-calculate project duration based on start and end dates for new project
  useEffect(() => {
    if (newProjStartDate && newProjEndDate) {
      const computed = calculateProjectDurationBn(newProjStartDate, newProjEndDate);
      if (computed) {
        setNewProjDuration(computed);
      }
    }
  }, [newProjStartDate, newProjEndDate]);

  // Auto-calculate project duration based on start and end dates for editing project
  useEffect(() => {
    if (editingProject && editingProject.startDate && editingProject.endDate) {
      const computed = calculateProjectDurationBn(editingProject.startDate, editingProject.endDate);
      if (computed && computed !== editingProject.duration) {
        setEditingProject({
          ...editingProject,
          duration: computed,
        });
      }
    }
  }, [editingProject?.startDate, editingProject?.endDate]);

  // Helper to calculate project investments, member shares, and individual member expenses/income
  const getProjectInvestmentsAndShares = () => {
    // 1. Filter company members
    const companyMembers = users.filter((u) => {
      if (u.role !== "member") return false;
      if (currentUser.role === "admin") return true;
      const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
      return u.companyId === targetCompanyId;
    });

    // 2. Filter company projects
    const companyProjects = projects.filter((p) => {
      if (currentUser.role === "admin") return true;
      const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
      return p.companyId === targetCompanyId;
    });

    // 3. Keep set of member doc IDs for quick lookup
    const memberDocIds = new Set(companyMembers.map((u) => u.docId));

    // 4. Map each history entry to their parent user
    const companyHistories = allHistories.filter((h) => memberDocIds.has(h.userDocId));

    // 5. For each member, compute their total special project investments in history
    const memberSpecialInvMap: Record<string, Record<string, number>> = {}; // userDocId -> { projectId -> amount }
    const memberTotalSpecialInv: Record<string, number> = {}; // userDocId -> total special amount

    companyHistories.forEach((h) => {
      if (h.type === "savings_arrears") return;
      const amt = Number(h.amount || 0);
      if (amt <= 0) return;

      const uId = h.userDocId;
      if (!memberSpecialInvMap[uId]) memberSpecialInvMap[uId] = {};
      
      // If it is targeted to a specific project
      if (h.projectId && h.projectId !== "company") {
        memberSpecialInvMap[uId][h.projectId] = (memberSpecialInvMap[uId][h.projectId] || 0) + amt;
        memberTotalSpecialInv[uId] = (memberTotalSpecialInv[uId] || 0) + amt;
      }
    });

    // 6. Filter company transactions
    const companyTransactions = transactions.filter((t) => {
      if (currentUser.role === "admin") return true;
      const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
      const p = projects.find((proj) => proj.id === t.projectId);
      return p && p.companyId === targetCompanyId;
    });

    // 7. Compute project profit summary
    const projSummary: Record<string, { expense: number; sale: number }> = {};
    companyProjects.forEach((p) => {
      projSummary[p.id] = { expense: 0, sale: 0 };
    });
    companyTransactions.forEach((t) => {
      if (!projSummary[t.projectId]) {
        projSummary[t.projectId] = { expense: 0, sale: 0 };
      }
      const amount = Number(t.amount || 0);
      if (t.type === "expense") projSummary[t.projectId].expense += amount;
      else if (t.type === "sale") projSummary[t.projectId].sale += amount;
    });

    // 8. Filter company installments to get installment incomes (downpayment + paid monthly steps)
    const companyInstallments = installments.filter((inst) => {
      if (currentUser.role === "admin") return true;
      const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
      return inst.companyId === targetCompanyId;
    });

    // Installment incomes are usually associated with a project if the installment's productName matches project name
    const projectInstallmentIncome: Record<string, number> = {};
    companyProjects.forEach((p) => {
      projectInstallmentIncome[p.id] = 0;
    });

    companyInstallments.forEach((inst) => {
      const proj = companyProjects.find((p) => p.name === inst.productName);
      if (proj) {
        const downPayment = Number(inst.downPayment || 0);
        const paidSchedule = (inst.schedule || [])
          .filter((s) => s.status === "paid")
          .reduce((sum, s) => sum + Number(s.amount || 0), 0);
        projectInstallmentIncome[proj.id] += downPayment + paidSchedule;
      }
    });

    // 9. Compute project-specific shares for each business member
    const memberProjectsShare: Record<string, Record<string, number>> = {}; // userDocId -> { projectId -> share fraction }

    companyMembers.forEach((u) => {
      memberProjectsShare[u.docId] = {};
      
      companyProjects.forEach((p) => {
        let share = 0;
        if (u.customShare !== undefined && u.customShare !== null) {
          share = u.customShare / 100;
        } else {
          const partAmt = (memberSpecialInvMap[u.docId] || {})[p.id] || 0;
          const projTotalSpecial = companyMembers.reduce((sum, m) => sum + ((memberSpecialInvMap[m.docId] || {})[p.id] || 0), 0);
          if (projTotalSpecial > 0) {
            share = partAmt / projTotalSpecial;
          } else {
            // Default to equal share among business members if no investments yet
            const businessMembers = companyMembers.filter((m) => m.accountType !== "saving");
            share = businessMembers.length > 0 ? (u.accountType !== "saving" ? 1 / businessMembers.length : 0) : 0;
          }
        }
        memberProjectsShare[u.docId][p.id] = share;
      });
    });

    // 10. For each member, calculate their three balances
    const memberCalculations: Record<string, { 
      expense: number; 
      income: number; 
      shareText: string;
      savingsBalance: number;
      investBalance: number;
      incomeBalance: number;
      totalDeposits: number;
      specialInv: number;
      expenseShare: number;
      incomeShare: number;
      totalSavingsWithdrawals: number;
      totalIncomeWithdrawals: number;
    }> = {};

    const memberGeneralInv: Record<string, number> = {}; // userDocId -> general amount
    const memberProjectsInv: Record<string, Record<string, number>> = {}; // userDocId -> { projectId -> participating amount }
    const projectTotalParticipating: Record<string, number> = {}; // projectId -> total participating amount
    let totalGeneralCompanyPool = 0;

    companyMembers.forEach((u) => {
      const uHistories = companyHistories.filter((h) => h.userDocId === u.docId);

      // A. Special investments
      const specialInv = memberTotalSpecialInv[u.docId] || 0;

      // B. Shared project expenses
      let expenseShare = 0;
      companyProjects.forEach((p) => {
        const pShare = (memberProjectsShare[u.docId] || {})[p.id] || 0;
        const pExpense = (projSummary[p.id] || { expense: 0 }).expense;
        expenseShare += pExpense * pShare;
      });

      // C. Shared project income (Net Profit / Dividend Share)
      let incomeShare = 0;
      companyProjects.forEach((p) => {
        const pShare = (memberProjectsShare[u.docId] || {})[p.id] || 0;
        const pSaleIncome = (projSummary[p.id] || { sale: 0 }).sale;
        const pInstIncome = projectInstallmentIncome[p.id] || 0;
        const pExpense = (projSummary[p.id] || { expense: 0 }).expense;
        const pProfit = Math.max(0, (pSaleIncome + pInstIncome) - pExpense);
        incomeShare += pProfit * pShare;
      });

      // D. Subsequent deposits (type is saving or savings_arrears_paid or installment leftover where projectId is not set)
      let subsequentDeposits = 0;
      uHistories.forEach((h) => {
        const amt = Number(h.amount || 0);
        if (amt > 0 && h.type !== "savings_arrears" && (!h.projectId || h.projectId === "company")) {
          subsequentDeposits += amt;
        }
      });

      const initialDeposit = Number(u.investAmount || 0);
      const totalDeposits = initialDeposit + subsequentDeposits;

      // E. Total withdrawals (history amount < 0)
      let withdrawals = 0;
      uHistories.forEach((h) => {
        const amt = Number(h.amount || 0);
        if (amt < 0 || h.type === "withdraw") {
          withdrawals += Math.abs(amt);
        }
      });

      let totalSavingsWithdrawals = 0;
      let totalIncomeWithdrawals = 0;

      if (u.accountType === "saving") {
        totalSavingsWithdrawals = withdrawals;
      } else if (u.accountType === "business") {
        totalIncomeWithdrawals = withdrawals;
      } else {
        totalSavingsWithdrawals = withdrawals;
      }

      // F. Final Balances
      const investBalance = specialInv + expenseShare;
      const incomeBalance = Math.max(0, incomeShare - totalIncomeWithdrawals);
      const savingsBalance = Math.max(0, totalDeposits - specialInv - expenseShare - totalSavingsWithdrawals);

      memberGeneralInv[u.docId] = savingsBalance;
      totalGeneralCompanyPool += savingsBalance;

      // Calculate memberProjectsInv and projectTotalParticipating
      memberProjectsInv[u.docId] = {};
      companyProjects.forEach((p) => {
        const specAmt = (memberSpecialInvMap[u.docId] || {})[p.id] || 0;
        const pShare = (memberProjectsShare[u.docId] || {})[p.id] || 0;
        const pExpense = (projSummary[p.id] || { expense: 0 }).expense;
        const partAmt = specAmt + (pExpense * pShare);
        
        memberProjectsInv[u.docId][p.id] = partAmt;
        projectTotalParticipating[p.id] = (projectTotalParticipating[p.id] || 0) + partAmt;
      });

      const businessMembers = companyMembers.filter((m) => m.accountType !== "saving");
      const businessTotalSavings = businessMembers.reduce((sum, m) => sum + (m.savingsBalance || 0), 0);
      
      let displayShare = 0;
      if (u.customShare !== undefined && u.customShare !== null) {
        displayShare = u.customShare / 100;
      } else {
        displayShare = businessTotalSavings > 0 ? savingsBalance / businessTotalSavings : 0;
      }

      memberCalculations[u.docId] = {
        expense: parseFloat(expenseShare.toFixed(2)),
        income: parseFloat(incomeShare.toFixed(2)),
        shareText: (displayShare * 100).toFixed(1) + "%",
        savingsBalance: parseFloat(savingsBalance.toFixed(2)),
        investBalance: parseFloat(investBalance.toFixed(2)),
        incomeBalance: parseFloat(incomeBalance.toFixed(2)),
        totalDeposits,
        specialInv,
        expenseShare,
        incomeShare,
        totalSavingsWithdrawals,
        totalIncomeWithdrawals,
      };
    });

    return {
      companyMembers,
      companyProjects,
      projSummary,
      projectTotalParticipating,
      totalGeneralCompanyPool,
      memberSpecialInvMap,
      memberTotalSpecialInv,
      memberGeneralInv,
      memberProjectsShare,
      memberCalculations,
      projectInstallmentIncome,
    };
  };

  // Recalculates stats on changes
  const getDashboardSummary = () => {
    const {
      companyMembers,
      projSummary,
      memberCalculations,
    } = getProjectInvestmentsAndShares();

    const globalTotalDeposit = companyMembers.reduce((sum, u) => sum + Number(u.amount || 0), 0);

    const businessMembers = companyMembers.filter((u) => u.accountType !== "saving");
    const businessTotalDeposit = businessMembers.reduce((sum, u) => sum + Number(u.amount || 0), 0);

    const totalExpense = Object.values(projSummary).reduce((sum, s) => sum + s.expense, 0);
    const projectIncome = Object.values(projSummary).reduce((sum, s) => sum + s.sale, 0);

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
      const instDue = (inst.schedule || []).reduce(
        (stepSum, s) => stepSum + Math.max(0, Number(s.amount || 0) - Number(s.paidAmount || 0)),
        0
      );
      return sum + instDue;
    }, 0);

    // 2. Adjust stats if logged-in user is a member with "only own data" view
    if (currentUser.role === "member" && !currentUser.canSeeAllData) {
      const calc = memberCalculations[currentUser.docId] || { 
        expense: 0, 
        income: 0, 
        savingsBalance: 0, 
        investBalance: 0, 
        incomeBalance: 0 
      };
      const myDeposit = Number(calc.savingsBalance);
      const myBalance = Number(calc.savingsBalance + calc.incomeBalance);

      // Find member's own installments and their due amount
      const myInstallments = companyInstallments.filter((inst) => 
        inst.customerName?.trim().toLowerCase() === currentUser.name?.trim().toLowerCase()
      );
      const myDue = myInstallments.reduce((sum, inst) => {
        const instDue = (inst.schedule || []).reduce(
          (stepSum, s) => stepSum + Math.max(0, Number(s.amount || 0) - Number(s.paidAmount || 0)),
          0
        );
        return sum + instDue;
      }, 0);

      return {
        totalDeposit: myDeposit,
        totalExpense: calc.expense,
        totalIncome: calc.income,
        totalBalance: myBalance,
        totalDue: myDue,
        globalTotalDeposit,
        globalTotalExpense: totalExpense,
        globalTotalIncome: totalIncome,
        businessTotalDeposit,
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
      businessTotalDeposit,
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
    businessTotalDeposit,
  } = getDashboardSummary();

  const {
    companyMembers,
    companyProjects,
    projSummary,
    projectTotalParticipating,
    totalGeneralCompanyPool,
    memberSpecialInvMap,
    memberTotalSpecialInv,
    memberGeneralInv,
    memberProjectsShare,
    memberCalculations,
    projectInstallmentIncome,
  } = getProjectInvestmentsAndShares();

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

  // Reactively calculate savings and installment arrears for the selected user in the investment form
  useEffect(() => {
    if (!newInvestTarget) {
      setSelectedUserSavingsArrears(0);
      setSelectedUserInstallmentArrears(0);
      return;
    }

    const user = users.find((u) => u.docId === newInvestTarget);
    if (!user) return;

    let isSubscribed = true;

    // 1. Calculate savings arrears (any arrears in user history)
    const fetchSavings = async () => {
      try {
        const histSnap = await getDocs(collection(db, "users", newInvestTarget, "history"));
        if (!isSubscribed) return;
        let savingsArr = 0;
        histSnap.forEach((doc) => {
          const h = doc.data() as any;
          if (h.type === "savings_arrears") {
            savingsArr += Number(h.arrears || 0);
          }
        });
        setSelectedUserSavingsArrears(savingsArr);
      } catch (e) {
        console.error("Error fetching savings arrears:", e);
      }
    };
    fetchSavings();

    // 2. Calculate installment arrears up to newInvestDate
    const comparisonDate = newInvestDate || new Date().toISOString().split("T")[0];
    const userInsts = installments.filter((inst) => inst.customerName === user.name && inst.status !== "closed");
    let instArr = 0;
    userInsts.forEach((inst) => {
      (inst.schedule || []).forEach((step) => {
        // Only count unpaid steps that are due on or before comparisonDate
        if (step.dueDate <= comparisonDate && step.status !== "paid") {
          const stepTotal = Number(step.amount || 0);
          const stepPaid = Number(step.paidAmount || 0);
          const stepDue = Math.max(0, stepTotal - stepPaid);
          instArr += stepDue;
        }
      });
    });
    setSelectedUserInstallmentArrears(instArr);

    return () => {
      isSubscribed = false;
    };
  }, [newInvestTarget, newInvestDate, installments, users]);

  // Submit operations
  const handleSubmitEntry = async () => {
    setSaving(true);
    try {
      if (addMode === "invest") {
        if (!newInvestTarget || !newInvestAmount || newInvestAmount <= 0 || !newInvestDate) {
          alert("সঠিক তথ্য পূরণ করুন");
          return;
        }

        const user = users.find((u) => u.docId === newInvestTarget);
        if (!user) {
          alert("ব্যবহারকারী খুঁজে পাওয়া যায়নি");
          return;
        }

        let remaining = newInvestAmount;
        let totalSavingsArrearsPaid = 0;
        let totalInstallmentArrearsPaid = 0;

        // 1. Fetch savings arrears
        const histSnap = await getDocs(collection(db, "users", newInvestTarget, "history"));
        const savingsArrearsDocs: any[] = [];
        histSnap.forEach((doc) => {
          const h = { docId: doc.id, ...doc.data() } as any;
          if (h.type === "savings_arrears") {
            savingsArrearsDocs.push(h);
          }
        });

        // Sort savings arrears by date (oldest first)
        savingsArrearsDocs.sort((a, b) => {
          const dateA = a.date || "";
          const dateB = b.date || "";
          return dateA.localeCompare(dateB);
        });

        // Pay off savings arrears
        for (const arrDoc of savingsArrearsDocs) {
          if (remaining <= 0) break;
          const dueAmt = Number(arrDoc.arrears || 0);
          if (dueAmt <= 0) continue;

          const payAmt = Math.min(remaining, dueAmt);
          remaining = parseFloat((remaining - payAmt).toFixed(2));
          totalSavingsArrearsPaid += payAmt;

          // Write paid history log
          await addDoc(collection(db, "users", newInvestTarget, "history"), {
            amount: payAmt,
            date: newInvestDate,
            memo: `বকেয়া সমন্বয়ঃ ${arrDoc.memo || "সেভিংস জমা"}`,
            InvestType: user.InvestType || "",
            accountType: user.accountType || "",
            createdAt: new Date().toISOString(),
          });

          // Delete or update the original savings_arrears document
          const arrDocRef = doc(db, "users", newInvestTarget, "history", arrDoc.docId);
          if (payAmt >= dueAmt) {
            // Fully paid: delete the arrears document
            await deleteDoc(arrDocRef);
          } else {
            // Partially paid: update arrears field
            await updateDoc(arrDocRef, {
              arrears: parseFloat((dueAmt - payAmt).toFixed(2)),
            });
          }
        }

        // 2. Fetch/Pay Installment arrears
        if (remaining > 0) {
          // Find open installment contracts for the user
          const userInsts = installments.filter(
            (inst) => inst.customerName === user.name && inst.status !== "closed"
          );

          for (const inst of userInsts) {
            if (remaining <= 0) break;

            const scheduleCopy = JSON.parse(JSON.stringify(inst.schedule || [])) as InstallmentStep[];
            let instPaidThisTime = 0;

            for (let i = 0; i < scheduleCopy.length; i++) {
              if (remaining <= 0) break;
              const step = scheduleCopy[i];

              // Skip steps that are not due yet (due date is in the future)
              if (step.dueDate > newInvestDate) {
                continue;
              }

              const stepTotal = Number(step.amount || 0);
              const stepPaid = Number(step.paidAmount || 0);
              const stepDue = Math.max(0, stepTotal - stepPaid);

              if (stepDue > 0) {
                const payAmt = Math.min(remaining, stepDue);
                step.paidAmount = parseFloat((stepPaid + payAmt).toFixed(2));
                remaining = parseFloat((remaining - payAmt).toFixed(2));
                instPaidThisTime += payAmt;

                if (step.paidAmount >= stepTotal) {
                  step.status = "paid";
                } else {
                  step.status = "partial";
                }
                step.paidDate = newInvestDate;
              }
            }

            if (instPaidThisTime > 0) {
              totalInstallmentArrearsPaid += instPaidThisTime;
              const allFullyPaid = scheduleCopy.every((s) => s.status === "paid");
              const computedDue = scheduleCopy.reduce(
                (sum, s) => sum + Math.max(0, s.amount - s.paidAmount),
                0
              );

              const instRef = doc(db, "installments", inst.id);
              await updateDoc(instRef, {
                schedule: scheduleCopy,
                dueAmount: computedDue,
                status: allFullyPaid ? "closed" : "open",
              });
            }
          }
        }

        // 3. Write remaining amount to new investment, OR if a document was uploaded but remaining is 0, write a document receipt entry
        if (remaining > 0 || entryFile) {
          const selectedProj = projects.find((p) => p.id === newInvestProjectId);
          const payload: any = {
            amount: remaining,
            date: newInvestDate,
            memo: remaining > 0 ? (newInvestMemo || "N/A") : `${newInvestMemo || "রশিদ / মেমো ফাইল"} (বকেয়া পরিশোধ রশিদ)`,
            InvestType: newInvestMode,
            accountType: newInvestAcctType,
            createdAt: new Date().toISOString(),
            projectId: selectedProj ? selectedProj.id : "company",
            projectName: selectedProj ? selectedProj.name : "কোম্পানি (সাধারণ)",
          };
          if (entryFile) {
            payload.document = {
              name: entryFile.name,
              fileData: entryFile.data,
              fileType: entryFile.type,
            };
          }
          await addDoc(collection(db, "users", newInvestTarget, "history"), payload);
        }

        // 4. Update the user's total investment balance
        const totalAddedToSavings = parseFloat((totalSavingsArrearsPaid + remaining).toFixed(2));
        const userRef = doc(db, "users", newInvestTarget);

        await updateDoc(userRef, {
          amount: increment(totalAddedToSavings),
          accountType: newInvestAcctType,
          InvestType: newInvestMode,
        });

        alert(`ইনভেস্ট সফলভাবে সম্পন্ন হয়েছে।\nসমন্বয়কৃত সেভিংস বকেয়াঃ ৳${totalSavingsArrearsPaid}\nসমন্বয়কৃত কিস্তি বকেয়াঃ ৳${totalInstallmentArrearsPaid}\nনতুন সেভিংস যুক্ত হয়েছেঃ ৳${remaining}`);

        // Reset
        setNewInvestTarget("");
        setNewInvestAmount(0);
        setNewInvestMemo("");
        setNewInvestProjectId("");
        setSelectedUserSavingsArrears(0);
        setSelectedUserInstallmentArrears(0);
        setEntryFile(null);
        setShowAddModal(false);
      } else if (addMode === "transaction") {
        if (!newTrxProject || !newTrxAmount || newTrxAmount <= 0 || !newTrxDate) {
          alert("সঠিক তথ্য পূরণ করুন");
          return;
        }
        const proj = projects.find((p) => p.id === newTrxProject);
        if (!proj) return;

        const payload: any = {
          projectId: newTrxProject,
          projectName: proj.name,
          type: newTrxType,
          amount: newTrxAmount,
          date: newTrxDate,
          desc: newTrxDesc || "",
          createdAt: new Date().toISOString(),
        };
        if (entryFile) {
          payload.document = {
            name: entryFile.name,
            fileData: entryFile.data,
            fileType: entryFile.type,
          };
        }

        await addDoc(collection(db, "accounts"), payload);

        // Reset
        setNewTrxAmount(0);
        setNewTrxDesc("");
        setEntryFile(null);
        setShowAddModal(false);
      } else if (addMode === "project") {
        if (!newProjName) {
          alert("প্রজেক্টের নাম লিখুন");
          return;
        }

        const payload: any = {
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
        };
        if (entryFile) {
          payload.documents = [
            {
              id: "doc_" + Date.now(),
              name: entryFile.name,
              fileData: entryFile.data,
              fileType: entryFile.type,
              uploadedAt: new Date().toISOString().split("T")[0],
              notes: "প্রজেক্ট চালুকালীন চুক্তিপত্র / মেমো",
            }
          ];
        }

        await addDoc(collection(db, "projects"), payload);

        // Reset
        setNewProjName("");
        setNewProjDesc("");
        setNewProjLocation("");
        setNewProjBudget(0);
        setNewProjDuration("");
        setEntryFile(null);
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
        let remainingToDistribute = remaining;
        for (let i = 1; i <= newInstMonths; i++) {
          const dueDate = new Date(baseDate);
          dueDate.setMonth(dueDate.getMonth() + i);
          const stepAmount = Math.round(remainingToDistribute / (newInstMonths - i + 1));
          schedule.push({
            month: i,
            dueDate: dueDate.toISOString().split("T")[0],
            amount: stepAmount,
            status: "unpaid",
            paidAmount: 0,
          });
          remainingToDistribute -= stepAmount;
        }

        const payload: any = {
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
        };
        if (entryFile) {
          payload.document = {
            name: entryFile.name,
            fileData: entryFile.data,
            fileType: entryFile.type,
          };
        }

        await addDoc(collection(db, "installments"), payload);

        // Reset
        setNewInstCustomer("");
        setNewInstProduct("");
        setNewInstTotal(0);
        setNewInstDown(0);
        setNewInstMonths(0);
        setEntryFile(null);
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
      let remainingToDistribute = remaining;
      for (let i = 1; i <= months; i++) {
        const dueDate = new Date(baseDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        const stepAmount = Math.round(remainingToDistribute / (months - i + 1));
        schedule.push({
          month: i,
          dueDate: dueDate.toISOString().split("T")[0],
          amount: stepAmount,
          status: "unpaid",
          paidAmount: 0,
        });
        remainingToDistribute -= stepAmount;
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
  const handleDeleteInvestHistory = (h: HistoryEntry) => {
    if (!selectedUser) return;
    setConfirmState({
      isOpen: true,
      title: "লেনদেন ডিলিট নিশ্চিতকরণ",
      message: "লেনদেনটি স্থায়ীভাবে ডিলিট করতে চান?",
      onConfirm: async () => {
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
        } finally {
          setConfirmState(null);
        }
      }
    });
  };

  const handleDeleteTrx = (t: Transaction) => {
    setConfirmState({
      isOpen: true,
      title: "লেনদেন ডিলিট নিশ্চিতকরণ",
      message: "লেনদেনটি স্থায়ীভাবে ডিলিট করতে চান?",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "accounts", t.id));
          if (selectedProject) handleShowProjectHistory(selectedProject);
        } catch (e) {
          console.error(e);
          alert("ডিলিট করা যায়নি");
        } finally {
          setConfirmState(null);
        }
      }
    });
  };

  const handleDeleteProject = (p: Project) => {
    setConfirmState({
      isOpen: true,
      title: "প্রজেক্ট ডিলিট নিশ্চিতকরণ",
      message: `"${p.name}" প্রজেক্টটি ডিলিট করলে এর সকল লেনদেন ডিলিট হয়ে যাবে। নিশ্চিত?`,
      onConfirm: async () => {
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
        } finally {
          setConfirmState(null);
        }
      }
    });
  };

  const handleDeleteInstallment = (inst: Installment) => {
    setConfirmState({
      isOpen: true,
      title: "কিস্তি ডিলিট নিশ্চিতকরণ",
      message: `"${inst.customerName}" কিস্তি কন্ট্যাক্টটি ডিলিট করতে চান?`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "installments", inst.id));
          setSelectedProjectInstallment(null);
          setEditingInstallment(null);
        } catch (e) {
          console.error(e);
          alert("ডিলিট করা যায়নি");
        } finally {
          setConfirmState(null);
        }
      }
    });
  };

  // Document Management Handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setNewDocFile(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("ফাইলের সাইজ ৫ মেগাবাইটের বেশি হওয়া যাবে না।");
      e.target.value = "";
      setNewDocFile(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setNewDocFile({
        data: reader.result as string,
        name: file.name,
        type: file.type || "application/octet-stream",
      });
    };
    reader.onerror = (err) => {
      console.error("FileReader error:", err);
      alert("ফাইল পড়তে সমস্যা হয়েছে।");
    };
    reader.readAsDataURL(file);
  };

  const handleEntryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setEntryFile(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("ফাইলের সাইজ ৫ মেগাবাইটের বেশি হওয়া যাবে না।");
      e.target.value = "";
      setEntryFile(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEntryFile({
        data: reader.result as string,
        name: file.name,
        type: file.type || "application/octet-stream",
      });
    };
    reader.onerror = (err) => {
      console.error("FileReader error:", err);
      alert("ফাইল পড়তে সমস্যা হয়েছে।");
    };
    reader.readAsDataURL(file);
  };

  const handleAddDocument = async () => {
    if (!currentProject) return;
    if (!newDocName.trim()) {
      alert("ডকুমেন্টের নাম বা শিরোনাম লিখুন");
      return;
    }

    setDocUploadLoading(true);
    try {
      const docId = "doc_" + Date.now();
      const newDocObj = {
        id: docId,
        name: newDocName.trim(),
        fileData: newDocFile?.data || "",
        fileType: newDocFile?.type || "",
        uploadedAt: new Date().toISOString().split("T")[0],
        notes: newDocNotes.trim(),
      };

      const existingDocs = currentProject.documents || [];
      const updatedDocs = [...existingDocs, newDocObj];

      await updateDoc(doc(db, "projects", currentProject.id), {
        documents: updatedDocs,
      });

      setNewDocName("");
      setNewDocNotes("");
      setNewDocFile(null);
      
      const fileInput = document.getElementById("doc-file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      alert("ডকুমেন্ট সফলভাবে আপলোড করা হয়েছে!");
    } catch (err) {
      console.error("Error uploading document:", err);
      alert("ডকুমেন্ট আপলোড করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
    } finally {
      setDocUploadLoading(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!currentProject) return;
    setConfirmState({
      isOpen: true,
      title: "ডকুমেন্ট ডিলিট নিশ্চিতকরণ",
      message: "এই ডকুমেন্টটি স্থায়ীভাবে ডিলিট করতে চান?",
      onConfirm: async () => {
        try {
          const existingDocs = currentProject.documents || [];
          const updatedDocs = existingDocs.filter((d) => d.id !== docId);

          await updateDoc(doc(db, "projects", currentProject.id), {
            documents: updatedDocs,
          });
        } catch (err) {
          console.error("Error deleting document:", err);
          alert("ডকুমেন্ট ডিলিট করতে সমস্যা হয়েছে।");
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

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
            {currentUser.role === "member" && !currentUser.canSeeAllData ? (
              <>
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl text-center flex flex-col justify-center">
                  <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">মোট জমা (ডিপোজিট)</p>
                  <p className="text-blue-600 font-bold text-sm mt-0.5">৳{formatNum(totalDeposit)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl text-center flex flex-col justify-center">
                  <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">সক্রিয় ব্যালেন্স</p>
                  <p className="text-blue-600 font-bold text-sm mt-0.5">৳{formatNum(totalBalance)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl text-center flex flex-col justify-center">
                  <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">শেয়ার ইনভেস্টমেন্ট (খরচ)</p>
                  <p className="text-rose-500 font-bold text-sm mt-0.5">৳{formatNum(totalExpense)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl text-center flex flex-col justify-center">
                  <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">শেয়ার লভ্যাংশ (আয়)</p>
                  <p className="text-emerald-600 font-bold text-sm mt-0.5">৳{formatNum(totalIncome)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl text-center flex flex-col justify-center col-span-2">
                  <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">মোট সম্পদ (নেট মূল্য)</p>
                  <p className="text-emerald-600 font-bold text-sm mt-0.5">৳{formatNum(totalBalance + totalIncome)}</p>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
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
        <button
          onClick={() => setActiveTab("ledger")}
          className={`flex-1 py-4 text-xs font-bold transition-all relative ${
            activeTab === "ledger" ? "text-blue-600 bg-blue-50/40" : "text-slate-400"
          }`}
        >
          {currentUser.role === "member" && !currentUser.canSeeAllData ? "আমার কিস্তি" : "কিস্তি লেজার"}
          {activeTab === "ledger" && <span className="absolute bottom-0 left-1/4 right-1/4 h-[3px] bg-blue-600 rounded-full"></span>}
        </button>
      </div>

      {/* Tab Panels */}
      <main className="p-4">
        {/* INVESTOR VIEW */}
        {activeTab === "invest" && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
            <table className="min-w-max w-full text-xs text-left divide-y divide-slate-100">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide font-extrabold text-[10px]">
                <tr>
                  <th className="p-3">নাম</th>
                  <th className="p-3 text-right">মোট জমা (ডিপোজিট)</th>
                  <th className="p-3 text-center">শেয়ার %</th>
                  <th className="p-3 text-right text-rose-500">শেয়ার ইনভেস্টমেন্ট (খরচ)</th>
                  <th className="p-3 text-right text-blue-600">সক্রিয় ব্যালেন্স</th>
                  <th className="p-3 text-right text-emerald-600 font-extrabold">শেয়ার লভ্যাংশ (আয়)</th>
                  <th className="p-3 text-right font-black">মোট নেট মূল্য</th>
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
                    const calc = memberCalculations[u.docId] || { expense: 0, income: 0, shareText: "0.0%" };
                    
                    const isSaving = u.accountType === "saving";
                    const shareInvestment = isSaving ? 0 : calc.expense;
                    const activeBalance = isSaving ? uAmt : uAmt - calc.expense;
                    const shareProfit = isSaving ? 0 : calc.income;
                    const netWorth = activeBalance + shareProfit;

                    return (
                      <tr
                        key={u.docId}
                        onClick={() => handleShowUserHistory(u)}
                        className="hover:bg-slate-50/80 cursor-pointer transition font-medium"
                      >
                        <td className="p-3 font-bold text-blue-700">{u.name}</td>
                        <td className="p-3 text-right font-bold text-slate-700">৳{formatNum(uAmt)}</td>
                        <td className="p-3 text-center text-blue-600 font-bold">{calc.shareText}</td>
                        <td className="p-3 text-right text-rose-500 font-bold">৳{formatNum(shareInvestment)}</td>
                        <td className="p-3 text-right text-blue-600 font-bold">৳{formatNum(activeBalance)}</td>
                        <td className="p-3 text-right text-emerald-600 font-bold">৳{formatNum(shareProfit)}</td>
                        <td className={`p-3 text-right font-black ${netWorth >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                          ৳{formatNum(netWorth)}
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
                  <th className="p-3 text-right">বাজেট</th>
                  <th className="p-3 text-right">মোট ইনভেস্ট</th>
                  {currentUser.role === "member" && (
                    <>
                      <th className="p-3 text-right">আমার শেয়ার</th>
                      <th className="p-3 text-right">আমার ইনভেস্ট</th>
                      <th className="p-3 text-right">আমার লভ্যাংশ</th>
                    </>
                  )}
                  <th className="p-3 text-right">অতিরিক্ত/বাকি</th>
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
                    const instIncome = projectInstallmentIncome[p.id] || 0;
                    const totalProjectSale = s.sale + instIncome;
                    const profit = totalProjectSale - s.expense;
                    const totalInv = projectTotalParticipating[p.id] || 0;
                    const budget = p.budget || 0;
                    const diff = totalInv - budget;

                    // Calculate member's own participation
                    const uShare = (memberProjectsShare[currentUser.docId] || {})[p.id] || 0;
                    const uSpec = (memberSpecialInvMap[currentUser.docId] || {})[p.id] || 0;
                    const uGen = memberGeneralInv[currentUser.docId] || 0;
                    const uTotalInv = uSpec + uGen;
                    const myProfit = uShare * profit;

                    return (
                      <tr
                        key={p.id}
                        onClick={() => handleShowProjectHistory(p)}
                        className="hover:bg-slate-50/80 cursor-pointer font-medium"
                      >
                        <td className="p-3 font-bold text-blue-700">{p.name}</td>
                        <td className="p-3 text-right font-bold text-slate-600">৳{formatNum(budget)}</td>
                        <td className="p-3 text-right font-bold text-blue-600">৳{formatNum(totalInv)}</td>
                        {currentUser.role === "member" && (
                          <>
                            <td className="p-3 text-right font-extrabold text-blue-600">{(uShare * 100).toFixed(1)}%</td>
                            <td className="p-3 text-right font-bold text-slate-700">৳{formatNum(uTotalInv)}</td>
                            <td className={`p-3 text-right font-bold ${myProfit >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                              ৳{formatNum(myProfit)}
                            </td>
                          </>
                        )}
                        <td className="p-3 text-right font-bold">
                          {diff > 0 ? (
                            <span className="text-amber-600 font-extrabold">+৳{formatNum(diff)} <span className="text-[10px] text-amber-500 font-medium">(অতিরিক্ত)</span></span>
                          ) : diff < 0 ? (
                            <span className="text-rose-500 font-extrabold">-৳{formatNum(Math.abs(diff))} <span className="text-[10px] text-rose-400 font-medium">(বাকি)</span></span>
                          ) : (
                            <span className="text-slate-400">৳০</span>
                          )}
                        </td>
                        <td className="p-3 text-right text-rose-500 font-bold">৳{formatNum(s.expense)}</td>
                        <td className="p-3 text-right text-emerald-600 font-bold">৳{formatNum(totalProjectSale)}</td>
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
                    if (currentUser.role === "member" && !currentUser.canSeeAllData) {
                      return item.companyId === currentUser.companyId && item.customerName?.trim().toLowerCase() === currentUser.name?.trim().toLowerCase();
                    }
                    const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
                    return item.companyId === targetCompanyId;
                  })
                  .map((item) => {
                  const paidTotal = (item.schedule || [])
                    .reduce((sum, s) => sum + Number(s.paidAmount || 0), 0);
                  let due = (item.schedule || []).reduce((sum, s) => sum + Math.max(0, Number(s.amount || 0) - Number(s.paidAmount || 0)), 0);
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

                    {newInvestTarget && (
                      <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl space-y-1 text-xs mt-2.5">
                        <p className="font-bold text-rose-800">⚠️ বকেয়া তথ্য (Arrears Summary):</p>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <div>
                            <span className="text-[10px] text-rose-600 block">সেভিংস বকেয়া:</span>
                            <span className="font-extrabold text-rose-700">৳{formatNum(selectedUserSavingsArrears)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-rose-600 block">কিস্তি বকেয়া:</span>
                            <span className="font-extrabold text-rose-700">৳{formatNum(selectedUserInstallmentArrears)}</span>
                          </div>
                        </div>
                        {(selectedUserSavingsArrears > 0 || selectedUserInstallmentArrears > 0) && (
                          <p className="text-[9px] text-rose-500 font-bold mt-1.5 leading-normal">
                            * নতুন ইনভেস্ট এন্ট্রি করলে বকেয়া টাকা স্বয়ংক্রিয়ভাবে সমন্বয় (adjust) করে বাকি টাকা সঞ্চয়ে যুক্ত করা হবে।
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">ইনভেস্টের গন্তব্য (প্রজেক্ট)</label>
                    <select
                      value={newInvestProjectId}
                      onChange={(e) => setNewInvestProjectId(e.target.value)}
                      className="w-full border border-slate-200 p-3 rounded-xl mt-1 text-xs outline-none focus:border-indigo-500 font-semibold"
                    >
                      <option value="">কোম্পানি (সাধারণ / সকল প্রজেক্ট)</option>
                      {projects
                        .filter((p) => {
                          if (currentUser.role === "admin") return true;
                          const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
                          return p.companyId === targetCompanyId;
                        })
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
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

              {/* === COMMON MEMO/DOCUMENT UPLOAD INPUT === */}
              <div className="border-t pt-4 mt-4 space-y-2">
                <label className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
                  <Paperclip className="w-3.5 h-3.5" />
                  মেমো বা ডকুমেন্ট সংযুক্ত করুন (ঐচ্ছিক)
                </label>
                
                {!entryFile ? (
                  <div className="relative border border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20 rounded-2xl p-4 transition-all text-center cursor-pointer group">
                    <input
                      type="file"
                      accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                      onChange={handleEntryFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    />
                    <div className="flex flex-col items-center gap-1.5 pointer-events-none">
                      <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                      <span className="text-xs font-bold text-slate-600 group-hover:text-indigo-600 transition-colors">
                        ফাইল সিলেক্ট করুন বা ড্র্যাগ করে ছাড়ুন
                      </span>
                      <span className="text-[9px] text-slate-400 font-medium">
                        রশিদ ছবি, চুক্তিপত্র স্ক্যান কপি বা পিডিএফ (সর্বোচ্চ ৫ মেগাবাইট)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between gap-3 animate-fadeIn">
                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                      <FileText className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                      <div className="text-left overflow-hidden">
                        <p className="text-xs font-bold text-slate-700 truncate" title={entryFile.name}>
                          {entryFile.name}
                        </p>
                        <p className="text-[9px] text-emerald-600 font-extrabold font-mono uppercase tracking-wider">
                          সংযুক্ত ফাইল সফলভাবে লোড হয়েছে
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setEntryFile(null)}
                      className="p-1.5 hover:bg-emerald-100 text-rose-500 rounded-xl transition cursor-pointer flex-shrink-0"
                      title="ফাইলটি মুছে ফেলুন"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
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
                onClick={() => {
                  setShowAddModal(false);
                  setEntryFile(null);
                }}
                className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3.5 rounded-2xl font-bold transition text-xs cursor-pointer"
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
                              {h.document && (
                                <button
                                  onClick={() => setReadingDoc({
                                    name: h.document!.name,
                                    fileData: h.document!.fileData,
                                    fileType: h.document!.fileType,
                                    notes: h.memo || "সংযুক্ত মেমো/ডকুমেন্ট"
                                  })}
                                  className="mt-1 flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg font-bold hover:bg-indigo-100 transition cursor-pointer"
                                >
                                  <Paperclip className="w-3 h-3 text-indigo-500" />
                                  মেমো/রশিদ দেখুন
                                </button>
                              )}
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
                        {t.document && (
                          <button
                            onClick={() => setReadingDoc({
                              name: t.document!.name,
                              fileData: t.document!.fileData,
                              fileType: t.document!.fileType,
                              notes: t.desc || "সংযুক্ত মেমো/ডকুমেন্ট"
                            })}
                            className="mt-1 flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg font-bold hover:bg-indigo-100 transition cursor-pointer"
                          >
                            <Paperclip className="w-3 h-3 text-indigo-500" />
                            মেমো/রশিদ দেখুন
                          </button>
                        )}
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

              {selectedInstallment.document && (
                <div className="bg-indigo-50/70 border border-indigo-100 p-2.5 rounded-xl flex items-center justify-between text-[11px] font-semibold mt-1">
                  <span className="text-indigo-950 flex items-center gap-1.5 truncate">
                    <Paperclip className="w-3.5 h-3.5 text-indigo-500" />
                    চুক্তিপত্র/দলিল: {selectedInstallment.document.name}
                  </span>
                  <button
                    onClick={() => setReadingDoc({
                      name: selectedInstallment.document!.name,
                      fileData: selectedInstallment.document!.fileData,
                      fileType: selectedInstallment.document!.fileType,
                      notes: `গ্রাহকঃ ${selectedInstallment.customerName}\nপণ্যঃ ${selectedInstallment.productName}`
                    })}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[9px] font-bold transition flex items-center gap-0.5 cursor-pointer flex-shrink-0"
                  >
                    <Eye className="w-3 h-3" /> দেখুন
                  </button>
                </div>
              )}

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
              {instTab === "schedule" && (() => {
                const totalAmt = (selectedInstallment.schedule || []).reduce((sum, s) => sum + Number(s.amount || 0), 0);
                const totalPaid = (selectedInstallment.schedule || []).reduce((sum, s) => sum + Number(s.paidAmount || 0), 0);
                const totalRemaining = (selectedInstallment.schedule || []).reduce((sum, s) => sum + Math.max(0, Number(s.amount || 0) - Number(s.paidAmount || 0)), 0);

                return (
                  <div className="space-y-4">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                      <div className="text-center p-2 bg-white rounded-xl shadow-xs border border-slate-100">
                        <span className="text-[9px] text-slate-500 font-bold block uppercase">মোট কিস্তি</span>
                        <span className="text-xs font-black text-slate-800">৳{formatNum(totalAmt)}</span>
                      </div>
                      <div className="text-center p-2 bg-emerald-50/50 rounded-xl shadow-xs border border-emerald-100/50">
                        <span className="text-[9px] text-emerald-600 font-bold block uppercase">মোট পরিশোধ</span>
                        <span className="text-xs font-black text-emerald-700">৳{formatNum(totalPaid)}</span>
                      </div>
                      <div className="text-center p-2 bg-rose-50/50 rounded-xl shadow-xs border border-rose-100/50">
                        <span className="text-[9px] text-rose-600 font-bold block uppercase">মোট বাকি</span>
                        <span className="text-xs font-black text-rose-700">৳{formatNum(totalRemaining)}</span>
                      </div>
                    </div>

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
                        <tfoot className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-200">
                          <tr>
                            <td className="p-2.5 font-extrabold text-slate-900">মোট (Total)</td>
                            <td className="p-2.5 text-emerald-600 font-extrabold">জমাঃ ৳{formatNum(totalPaid)}</td>
                            <td className="p-2.5 text-right text-slate-900 font-extrabold">
                              ৳{formatNum(totalAmt)}
                              {totalRemaining > 0 && <div className="text-[9px] text-rose-600 font-extrabold">বাকিঃ ৳{formatNum(totalRemaining)}</div>}
                            </td>
                            <td className="p-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded font-extrabold text-[8px] uppercase ${totalRemaining === 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                                {totalRemaining === 0 ? "পরিশোধিত" : "বকেয়া"}
                              </span>
                            </td>
                          </tr>
                        </tfoot>
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
                );
              })()}

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
                    handleDeleteInstallment(editingInstallment);
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
      {showProjectDetails && currentProject && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4 text-left max-h-[90vh] overflow-y-auto">
            <h3 className="font-extrabold text-blue-700 text-base border-b pb-2 flex items-center justify-between">
              <span>📄 প্রজেক্টের তথ্য</span>
              <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-bold">
                ID: {currentProject.id.substring(0, 6)}
              </span>
            </h3>

            <div className="space-y-3.5 text-xs font-semibold text-slate-700">
              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">নাম</p>
                  <p className="text-slate-800 font-bold mt-0.5">{currentProject.name}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">টাইপ</p>
                  <p className="text-slate-800 mt-0.5">{currentProject.type || "N/A"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">সম্ভাব্য বাজেট</p>
                  <p className="text-indigo-600 font-bold mt-0.5">৳{formatNum(currentProject.budget || 0)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">স্ট্যাটাস</p>
                  <span className="text-indigo-600 font-bold mt-0.5 inline-block">
                    {currentProject.status === "active"
                      ? "🟢 চলমান"
                      : currentProject.status === "completed"
                      ? "✅ সম্পন্ন"
                      : "🔴 বন্ধ"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">শুরুর তারিখ</p>
                  <p className="font-mono text-slate-600 mt-0.5">{currentProject.startDate || "N/A"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">সম্ভাব্য শেষ তারিখ</p>
                  <p className="font-mono text-slate-600 mt-0.5">{currentProject.endDate || "N/A"}</p>
                </div>
              </div>

              <div>
                <p className="text-[9px] text-slate-400 font-bold uppercase">📍 লোকেশন</p>
                <p className="text-slate-700 mt-0.5">{currentProject.location || "N/A"}</p>
              </div>

              <div>
                <p className="text-[9px] text-slate-400 font-bold uppercase">📝 বিস্তারিত বিবরণ</p>
                <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 p-2.5 rounded-lg mt-1 whitespace-pre-line leading-relaxed">
                  {currentProject.desc || "কোনো বিবরণী লেখা নেই।"}
                </p>
              </div>

              {/* MY SHARE AND PARTICIPATION CARD (FOR MEMBERS ONLY) */}
              {currentUser.role === "member" && (
                <div className="bg-indigo-50 border border-indigo-100 p-3.5 rounded-2xl space-y-1.5 text-xs animate-fadeIn">
                  <h4 className="font-extrabold text-indigo-950 flex items-center gap-1 uppercase tracking-wider text-[11px]">
                    🎯 আমার অংশীদারি ও লভ্যাংশ বিবরণ
                  </h4>
                  <div className="flex justify-between mt-1">
                    <span className="text-indigo-700 font-medium">আমার শেয়ারঃ</span>
                    <span className="font-black text-indigo-950">
                      {(((memberProjectsShare[currentUser.docId] || {})[currentProject.id] || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-indigo-700 font-medium">আমার মোট ইনভেস্টঃ</span>
                    <span className="font-bold text-indigo-950">
                      ৳{formatNum(((memberSpecialInvMap[currentUser.docId] || {})[currentProject.id] || 0) + (memberGeneralInv[currentUser.docId] || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-indigo-100/50 pt-1.5 font-bold">
                    <span className="text-indigo-900">আমার লভ্যাংশ (লাভ/ক্ষতি থেকে)ঃ</span>
                    {(() => {
                      const projSale = (projSummary[currentProject.id] || { sale: 0 }).sale;
                      const projInst = projectInstallmentIncome[currentProject.id] || 0;
                      const projExp = (projSummary[currentProject.id] || { expense: 0 }).expense;
                      const projProfit = (projSale + projInst) - projExp;
                      const myProjProfit = ((memberProjectsShare[currentUser.docId] || {})[currentProject.id] || 0) * projProfit;
                      return (
                        <span className={myProjProfit >= 0 ? "text-emerald-600 font-extrabold" : "text-rose-600 font-extrabold"}>
                          ৳{formatNum(myProjProfit)}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* BUDGET & INVESTMENT ANALYSIS SECTION */}
              <div className="border-b pb-2 space-y-2">
                <h4 className="font-extrabold text-blue-700 text-xs flex items-center gap-1 uppercase tracking-wider">💰 ইনভেস্টমেন্ট ও বাজেট বিশ্লেষণ</h4>
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">নির্দিষ্ট প্রজেক্ট ইনভেস্ট (বিশেষ):</span>
                    <span className="font-bold text-slate-700">
                      ৳{formatNum(companyMembers.reduce((sum, u) => sum + ((memberSpecialInvMap[u.docId] || {})[currentProject.id] || 0), 0))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">সাধারণ তহবিল অংশগ্রহণ (Distributed):</span>
                    <span className="font-bold text-slate-700">
                      ৳{formatNum(companyMembers.reduce((sum, u) => sum + (memberGeneralInv[u.docId] || 0), 0))}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1.5 font-bold">
                    <span className="text-slate-600">সর্বমোট ইনভেস্টমেন্টঃ</span>
                    <span className="text-blue-600">
                      ৳{formatNum(projectTotalParticipating[currentProject.id] || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span className="text-slate-600">ঘাটতি / অতিরিক্ত বাজেটঃ</span>
                    <span>
                      {(projectTotalParticipating[currentProject.id] || 0) - (currentProject.budget || 0) >= 0 ? (
                        <span className="text-emerald-600 font-extrabold">
                          +৳{formatNum((projectTotalParticipating[currentProject.id] || 0) - (currentProject.budget || 0))} (অতিরিক্ত)
                        </span>
                      ) : (
                        <span className="text-rose-500 font-extrabold">
                          -৳{formatNum(Math.abs((projectTotalParticipating[currentProject.id] || 0) - (currentProject.budget || 0)))} (বাকি)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* SHAREHOLDERS LIST FOR THIS PROJECT */}
              <div className="space-y-2 border-b pb-3">
                <h4 className="font-extrabold text-blue-700 text-xs flex items-center gap-1 uppercase tracking-wider">
                  👥 অংশীদার শেয়ারহোল্ডার তালিকা ({currentProject.name})
                </h4>
                <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-2xl bg-slate-50/50 p-2 space-y-1.5">
                  {companyMembers
                    .filter((u) => u.accountType !== "saving")
                    .map((u) => {
                      const uSpec = (memberSpecialInvMap[u.docId] || {})[currentProject.id] || 0;
                      const uGen = memberGeneralInv[u.docId] || 0;
                      const uTotal = uSpec + uGen;
                      const uShare = (memberProjectsShare[u.docId] || {})[currentProject.id] || 0;

                      if (uTotal <= 0 && uShare <= 0) return null;

                      return (
                        <div
                          key={u.docId}
                          className="bg-white border border-slate-100 p-2.5 rounded-xl flex justify-between items-center text-[10px] shadow-sm hover:border-blue-100 transition"
                        >
                          <div>
                            <p className="font-bold text-slate-800 text-xs">{u.name}</p>
                            <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
                              বিশেষঃ ৳{formatNum(uSpec)} | সাধারণঃ ৳{formatNum(uGen)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-extrabold text-blue-600">{(uShare * 100).toFixed(1)}% শেয়ার</p>
                            <p className="text-[9px] text-slate-400 mt-0.5 font-medium">মোটঃ ৳{formatNum(uTotal)}</p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* DOCUMENTS & PROJECT ARCHIVE SECTION */}
              <div className="space-y-3 pt-1">
                <h4 className="font-extrabold text-blue-700 text-xs flex items-center gap-1 uppercase tracking-wider">
                  📁 প্রজেক্ট ডকুমেন্ট ও আর্কাইভ ({currentProject.documents?.length || 0})
                </h4>

                {/* Document List */}
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {!currentProject.documents || currentProject.documents.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic text-center py-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      কোনো ডকুমেন্ট আপলোড করা হয়নি।
                    </p>
                  ) : (
                    currentProject.documents.map((d) => (
                      <div key={d.id} className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl space-y-2 hover:border-blue-100 transition shadow-xs">
                        <div className="flex justify-between items-start gap-1">
                          <div className="space-y-0.5">
                            <p className="font-bold text-slate-800 text-[11px] flex items-center gap-1">
                              <FileText className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                              {d.name}
                            </p>
                            <p className="text-[9px] text-slate-400 font-medium">
                              আপলোডঃ {d.uploadedAt} {d.fileType ? `| ফাইলঃ ${d.fileType.split("/")[1]?.toUpperCase() || "Unknown"}` : ""}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setReadingDoc(d)}
                              className="px-2 py-1 text-[9px] bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 rounded-lg font-bold transition flex items-center gap-0.5 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" /> পড়ুন / ভিউ
                            </button>

                            {(currentUser.role === "admin" || currentUser.role === "company") && (
                              <button
                                onClick={() => handleDeleteDocument(d.id)}
                                className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-100 transition cursor-pointer"
                                title="ডিলিট করুন"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        {d.notes && (
                          <p className="text-[10px] text-slate-500 line-clamp-2 italic bg-white p-1.5 rounded-lg border border-slate-100">
                            {d.notes}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Admin & Company Upload Panel */}
                {(currentUser.role === "admin" || currentUser.role === "company") && (
                  <div className="bg-slate-50/50 border border-slate-100 p-3 rounded-2xl space-y-2.5 mt-2">
                    <p className="font-bold text-slate-700 text-[10px] uppercase tracking-wider border-b pb-1 flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5 text-blue-600" /> নতুন ডকুমেন্ট যুক্ত করুন
                    </p>
                    
                    <div className="space-y-2">
                      <div>
                        <label className="text-[9px] text-slate-500 font-bold block mb-0.5">ডকুমেন্ট নাম / শিরোনাম <span className="text-rose-500">*</span></label>
                        <input
                          type="text"
                          placeholder="যেমন: প্রজেক্ট চুক্তিপত্র, প্ল্যান লেআউট"
                          value={newDocName}
                          onChange={(e) => setNewDocName(e.target.value)}
                          className="w-full bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold focus:border-blue-500 focus:outline-hidden"
                        />
                      </div>

                      <div>
                        <label className="text-[9px] text-slate-500 font-bold block mb-0.5">বিস্তারিত বিবরণ বা নোট</label>
                        <textarea
                          placeholder="প্রজেক্টের তথ্য বা সংক্ষিপ্ত নোট এখানে লিখুন..."
                          rows={2}
                          value={newDocNotes}
                          onChange={(e) => setNewDocNotes(e.target.value)}
                          className="w-full bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold focus:border-blue-500 focus:outline-hidden resize-none"
                        />
                      </div>

                      <div>
                        <label className="text-[9px] text-slate-500 font-bold block mb-0.5">ফাইল আপলোড (ঐচ্ছিক, PDF, Image, TXT ইত্যাদি)</label>
                        <input
                          id="doc-file-input"
                          type="file"
                          onChange={handleFileChange}
                          className="w-full text-[10px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                        />
                        {newDocFile && (
                          <p className="text-[9px] text-emerald-600 font-medium mt-1">
                            ✓ ফাইল সিলেক্টেড: {newDocFile.name}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={handleAddDocument}
                        disabled={docUploadLoading || !newDocName.trim()}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white py-2 rounded-xl text-[10px] font-bold transition flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                      >
                        {docUploadLoading ? "আপলোড হচ্ছে..." : "ডকুমেন্ট যুক্ত করুন"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>

            <button
              onClick={() => setShowProjectDetails(null)}
              className="w-full bg-slate-100 hover:bg-slate-200 py-3 rounded-xl font-bold text-xs cursor-pointer"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 9. PROJECT DOCUMENT READER MODAL */}
      {/* ======================================================== */}
      {readingDoc && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1100] p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 text-left max-h-[85vh] overflow-y-auto">
            <h3 className="font-extrabold text-indigo-700 text-base border-b pb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FileText className="w-5 h-5 text-indigo-600" />
                {readingDoc.name}
              </span>
              <span className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold">
                ডকুমেন্ট ভিউয়ার
              </span>
            </h3>

            <div className="space-y-4 text-xs font-semibold text-slate-700">
              {readingDoc.notes && (
                <div className="space-y-1">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">📝 বিবরণ / ডকুমেন্ট টেক্সট</p>
                  <p className="text-[12px] text-slate-800 bg-slate-50 border border-slate-100 p-3.5 rounded-xl font-medium whitespace-pre-line leading-relaxed">
                    {readingDoc.notes}
                  </p>
                </div>
              )}

              {readingDoc.fileData ? (
                <div className="space-y-2 bg-emerald-50/50 border border-emerald-100 p-3 rounded-2xl">
                  <p className="text-[9px] text-emerald-600 font-extrabold uppercase tracking-wider flex items-center gap-1">
                    📎 সংযুক্ত ফাইল
                  </p>
                  <div className="flex justify-between items-center text-[11px] gap-2">
                    <span className="text-slate-600 truncate flex-1" title={readingDoc.name}>
                      {readingDoc.name}
                    </span>
                    <a
                      href={readingDoc.fileData}
                      download={readingDoc.name}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-bold transition flex items-center gap-1 cursor-pointer flex-shrink-0"
                    >
                      ডাউনলোড / ভিউ করুন
                    </a>
                  </div>
                  {readingDoc.fileType?.startsWith("image/") && (
                    <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden bg-white max-h-60 flex items-center justify-center">
                      <img src={readingDoc.fileData} alt={readingDoc.name} referrerPolicy="no-referrer" className="max-w-full max-h-full object-contain" />
                    </div>
                  )}
                </div>
              ) : (
                !readingDoc.notes && (
                  <p className="text-center py-4 text-slate-400 italic">এই ডকুমেন্টে কোনো তথ্য বা ফাইল সংযুক্ত নেই।</p>
                )
              )}
            </div>

            <button
              onClick={() => setReadingDoc(null)}
              className="w-full bg-slate-100 hover:bg-slate-200 py-2.5 rounded-xl font-bold text-xs cursor-pointer"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CUSTOM CONFIRMATION DIALOG MODAL */}
      {/* ======================================================== */}
      {confirmState?.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[2000] p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-left font-sans border border-slate-100">
            <div className="flex items-center gap-2.5 border-b pb-3 text-rose-600">
              <span className="p-2 rounded-full bg-rose-50 text-rose-600">
                <Trash2 className="w-5 h-5" />
              </span>
              <h3 className="font-extrabold text-slate-800 text-sm sm:text-base">{confirmState.title}</h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
              {confirmState.message}
            </p>

            <div className="flex gap-2.5 pt-3 border-t border-slate-100">
              <button
                onClick={confirmState.onConfirm}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-2.5 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95"
              >
                হ্যাঁ, নিশ্চিত
              </button>
              <button
                onClick={() => setConfirmState(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
