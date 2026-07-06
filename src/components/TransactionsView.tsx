import { useState, useEffect, FormEvent } from "react";
import { db } from "../firebase";
import { User, HistoryEntry, Project, Transaction, Installment, InstallmentStep, TransactionRequest, CompanyPaymentAccount } from "../types";
import { 
  collection, 
  onSnapshot, 
  collectionGroup, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  increment 
} from "firebase/firestore";
import { 
  ArrowLeftRight, 
  Search, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  User as UserIcon, 
  Calendar, 
  Building,
  FileSpreadsheet,
  X,
  Plus,
  Coins,
  CreditCard,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  Check,
  XCircle,
  Eye,
  FileText,
  Settings,
  Copy,
  Trash,
  CheckSquare,
  Edit3
} from "lucide-react";

interface TransactionsViewProps {
  currentUser: User;
  onNavigate: (view: string, params?: any) => void;
}

interface ComputedLedgerItem {
  id: string;
  date: string;
  userDocId: string;
  userName: string;
  type: "saving" | "project_expense" | "project_sale" | "installment_income" | "saving_withdraw";
  typeLabel: string;
  memo: string;
  flow: "IN" | "OUT";
  amount: number;
  projectName: string;
}

export default function TransactionsView({ currentUser, onNavigate }: TransactionsViewProps) {
  // FireStore raw data states
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [companyTransactions, setCompanyTransactions] = useState<Transaction[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [allHistories, setAllHistories] = useState<(HistoryEntry & { userDocId: string })[]>([]);
  const [transactionRequests, setTransactionRequests] = useState<TransactionRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterFlow, setFilterFlow] = useState<"all" | "IN" | "OUT">("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Transaction Modal state
  const [showTrxModal, setShowTrxModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [trxFlow, setTrxFlow] = useState<"IN" | "OUT">("IN");
  const [trxType, setTrxType] = useState<"saving" | "installment">("saving");
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser.role === "member" ? currentUser.docId : "");
  const [trxAmount, setTrxAmount] = useState<string>("");
  const [trxDate, setTrxDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [trxMemo, setTrxMemo] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"mobile_banking" | "bank" | "cash">("mobile_banking");

  // Mobile Banking details
  const [mobileProvider, setMobileProvider] = useState<"bkash" | "nagad" | "rocket" | "upay">("bkash");
  const [mobileAccountNo, setMobileAccountNo] = useState<string>("");
  const [mobileTrxId, setMobileTrxId] = useState<string>("");

  // Bank Transfer details
  const [bankName, setBankName] = useState<string>("Dutch-Bangla Bank");
  const [bankBranch, setBankBranch] = useState<string>("");
  const [bankAccountNo, setBankAccountNo] = useState<string>("");
  const [bankTrxId, setBankTrxId] = useState<string>("");

  // Toast / Status state
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Installment reference selection
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string>("");

  // Rejection & Request UI state
  const [rejectingReqId, setRejectingReqId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [requestFilterTab, setRequestFilterTab] = useState<"pending" | "all_history">("pending");

  // Company Payment Accounts State
  const [companyAccounts, setCompanyAccounts] = useState<CompanyPaymentAccount[]>([]);
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);

  // Navigation tabs for separating transaction concerns (Ledger, Queue, Submit Request, Settings)
  const [activeSubTab, setActiveSubTab] = useState<"ledger" | "requests" | "submit" | "settings">("ledger");

  // Setup real-time listeners for all required collections
  useEffect(() => {
    setLoading(true);

    const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;

    // 1. Users subscription
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const list: User[] = [];
      snap.forEach((d) => {
        list.push({ docId: d.id, ...d.data() } as User);
      });
      setUsers(list);
    });

    // 2. Projects subscription
    const unsubProjects = onSnapshot(collection(db, "projects"), (snap) => {
      const list: Project[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Project);
      });
      setProjects(list);
    });

    // 3. Accounts (Transactions) subscription
    const unsubAccounts = onSnapshot(collection(db, "accounts"), (snap) => {
      const list: Transaction[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Transaction);
      });
      setCompanyTransactions(list);
    });

    // 4. Installments subscription
    const unsubInstallments = onSnapshot(collection(db, "installments"), (snap) => {
      const list: Installment[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Installment);
      });
      setInstallments(list);
    });

    // 5. All User History entries subscription (using collectionGroup)
    const unsubAllHistory = onSnapshot(collectionGroup(db, "history"), (snap) => {
      const list: (HistoryEntry & { userDocId: string })[] = [];
      snap.forEach((d) => {
        const parentUserDocId = d.ref.parent?.parent?.id || "";
        list.push({ docId: d.id, userDocId: parentUserDocId, ...d.data() } as any);
      });
      setAllHistories(list);
      setLoading(false);
    });

    // 6. Transaction Requests subscription
    const unsubRequests = onSnapshot(collection(db, "transaction_requests"), (snap) => {
      const list: TransactionRequest[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as TransactionRequest);
      });
      setTransactionRequests(list);
    });

    // 7. Company Payment Accounts subscription
    const unsubCompanyAccounts = onSnapshot(collection(db, "company_payment_accounts"), (snap) => {
      const list: CompanyPaymentAccount[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as CompanyPaymentAccount);
      });
      setCompanyAccounts(list);
    });

    return () => {
      unsubUsers();
      unsubProjects();
      unsubAccounts();
      unsubInstallments();
      unsubAllHistory();
      unsubRequests();
      unsubCompanyAccounts();
    };
  }, [currentUser]);

  // If the user is a standard member, lock their user filter & transaction form to their own docId
  useEffect(() => {
    if (currentUser.role === "member") {
      setFilterUser(currentUser.docId);
      setSelectedUserId(currentUser.docId);
    }
  }, [currentUser]);

  // Determine current active company details
  const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
  const isAdminOrCompany = currentUser.role === "admin" || currentUser.role === "company";

  // Filter members belonging to the current user's company (unless Admin who sees everything)
  const activeCompanyMembers = users.filter((u) => {
    if (currentUser.role === "admin") return true;
    return u.companyId === targetCompanyId && u.status === "active";
  });

  // Filter projects belonging to current company
  const activeCompanyProjects = projects.filter((p) => {
    if (currentUser.role === "admin") return true;
    return p.companyId === targetCompanyId;
  });

  // Filter company accounts (transactions)
  const activeCompanyTransactions = companyTransactions.filter((t) => {
    if (currentUser.role === "admin") return true;
    const p = projects.find((proj) => proj.id === t.projectId);
    return p && p.companyId === targetCompanyId;
  });

  // Filter company installments
  const activeCompanyInstallments = installments.filter((inst) => {
    if (currentUser.role === "admin") return true;
    return inst.companyId === targetCompanyId;
  });

  // Dynaimcally query active installments of the selected user
  const selectedUserObj = users.find((u) => u.docId === selectedUserId);
  const selectedUserInstallments = installments.filter((inst) => {
    if (!selectedUserObj) return false;
    // Match customer name exactly or handle mapping
    return inst.customerName === selectedUserObj.name && inst.status !== "closed";
  });

  // Update selected installment whenever selectedUserId or active list changes
  useEffect(() => {
    if (selectedUserInstallments.length > 0) {
      setSelectedInstallmentId(selectedUserInstallments[0].id);
    } else {
      setSelectedInstallmentId("");
    }
  }, [selectedUserId, installments]);

  // Handle flow state toggle in form
  const handleFlowToggle = (flow: "IN" | "OUT") => {
    setTrxFlow(flow);
    // If Cash Out (OUT) is selected, force category to general savings withdrawal
    if (flow === "OUT") {
      setTrxType("saving");
    } else {
      // If Cash In is selected, reset payment method from "cash" to "mobile_banking"
      if (paymentMethod === "cash") {
        setPaymentMethod("mobile_banking");
      }
    }
  };

  // ==========================================
  // MATHEMATICAL SHARE CALCULATOR & LEDGER BUILDER
  // ==========================================
  const buildTransactionsLedger = (): ComputedLedgerItem[] => {
    const ledger: ComputedLedgerItem[] = [];

    // 1. Build special investment maps & general company pool
    const memberSpecialInvMap: Record<string, Record<string, number>> = {};
    const memberTotalSpecialInv: Record<string, number> = {};

    allHistories.forEach((h) => {
      const uId = h.userDocId;
      if (!uId) return;

      const amt = Number(h.amount || 0);
      if (h.type === "savings_arrears" || amt === 0) return;

      if (!memberSpecialInvMap[uId]) {
        memberSpecialInvMap[uId] = {};
      }

      // Filter only positive direct savings for special calculations
      if (amt > 0 && h.projectId && h.projectId !== "company") {
        memberSpecialInvMap[uId][h.projectId] = (memberSpecialInvMap[uId][h.projectId] || 0) + amt;
        memberTotalSpecialInv[uId] = (memberTotalSpecialInv[uId] || 0) + amt;
      }
    });

    // 2. Compute participating amounts per project
    const memberGeneralInv: Record<string, number> = {};
    const memberProjectsInv: Record<string, Record<string, number>> = {};
    const projectTotalParticipating: Record<string, number> = {};

    activeCompanyMembers.forEach((u) => {
      const uAmt = Number(u.amount || 0);
      if (u.accountType === "saving") return;

      const totalSpecial = memberTotalSpecialInv[u.docId] || 0;
      const generalAmt = Math.max(0, uAmt - totalSpecial);
      memberGeneralInv[u.docId] = generalAmt;

      memberProjectsInv[u.docId] = {};
      activeCompanyProjects.forEach((p) => {
        const specAmt = (memberSpecialInvMap[u.docId] || {})[p.id] || 0;
        const partAmt = specAmt + generalAmt;
        memberProjectsInv[u.docId][p.id] = partAmt;
        projectTotalParticipating[p.id] = (projectTotalParticipating[p.id] || 0) + partAmt;
      });
    });

    // 3. Compute share fraction per member per project
    const memberProjectsShare: Record<string, Record<string, number>> = {};

    activeCompanyMembers.forEach((u) => {
      memberProjectsShare[u.docId] = {};
      if (u.accountType === "saving") {
        activeCompanyProjects.forEach((p) => {
          memberProjectsShare[u.docId][p.id] = 0;
        });
        return;
      }

      activeCompanyProjects.forEach((p) => {
        let share = 0;
        if (u.customShare !== undefined && u.customShare !== null) {
          share = u.customShare / 100;
        } else {
          const partAmt = (memberProjectsInv[u.docId] || {})[p.id] || 0;
          const projTotal = projectTotalParticipating[p.id] || 0;
          share = projTotal > 0 ? partAmt / projTotal : 0;
        }
        memberProjectsShare[u.docId][p.id] = share;
      });
    });

    // Now, let's assemble all ledger transactions for each member in activeCompanyMembers
    activeCompanyMembers.forEach((member) => {
      const shareData = memberProjectsShare[member.docId] || {};

      // A. DIRECT SAVINGS & GENERAL CASH DEPOSITS & WITHDRAWALS
      const userHistories = allHistories.filter(
        (h) => h.userDocId === member.docId && h.type !== "savings_arrears"
      );

      userHistories.forEach((h) => {
        const amt = Number(h.amount || 0);
        if (amt === 0) return;

        const isWithdraw = h.type === "withdraw" || h.flow === "OUT" || amt < 0;
        const absAmt = Math.abs(amt);

        let typeLabel = "সঞ্চয় জমা (Deposit)";
        let typeVal: "saving" | "saving_withdraw" = "saving";
        if (isWithdraw) {
          typeLabel = "টাকা উত্তোলন (Withdrawal)";
          typeVal = "saving_withdraw";
        } else if (h.type === "savings_arrears_paid") {
          typeLabel = "বকেয়া সঞ্চয় পরিশোধ";
        } else if (h.type === "installment_payment") {
          typeLabel = "কিস্তি পরিশোধ (Installment)";
        }

        // Build elegant details string for the memo
        let paymentInfo = "";
        if (h.paymentMethod === "mobile_banking") {
          paymentInfo = ` [মোবাইল ব্যাংকিং: ${String(h.mobileProvider || "বিকাশ").toUpperCase()}, নম্বর: ${h.accountNo || "N/A"}, TxID: ${h.trxId || "N/A"}]`;
        } else if (h.paymentMethod === "bank") {
          paymentInfo = ` [ব্যাংক ট্রান্সফার: ${h.bankName || "N/A"}, হিসাব: ${h.accountNo || "N/A"}, TxID: ${h.trxId || "N/A"}]`;
        }

        ledger.push({
          id: h.docId,
          date: h.date || new Date().toISOString().split("T")[0],
          userDocId: member.docId,
          userName: member.name,
          type: typeVal,
          typeLabel: typeLabel,
          memo: `${h.memo || "লেনদেন"} ${paymentInfo}`,
          flow: isWithdraw ? "OUT" : "IN",
          amount: absAmt,
          projectName: h.projectName || "কোম্পানি (সাধারণ)"
        });
      });

      // B. PROJECT EXPENSES (OUT)
      activeCompanyTransactions.forEach((t) => {
        if (t.type !== "expense") return;

        const shareFraction = shareData[t.projectId] || 0;
        if (shareFraction <= 0) return;

        const memberShareAmt = parseFloat((t.amount * shareFraction).toFixed(2));
        if (memberShareAmt <= 0) return;

        ledger.push({
          id: `${t.id}-expense-${member.docId}`,
          date: t.date || new Date().toISOString().split("T")[0],
          userDocId: member.docId,
          userName: member.name,
          type: "project_expense",
          typeLabel: "শেয়ার খরচ (Project Expense)",
          memo: `${t.desc || "প্রজেক্টের খরচ কোটা"} (শেয়ার: ${(shareFraction * 100).toFixed(1)}%)`,
          flow: "OUT",
          amount: memberShareAmt,
          projectName: t.projectName || "প্রজেক্ট ব্যয়"
        });
      });

      // C. PROJECT SALES (IN)
      activeCompanyTransactions.forEach((t) => {
        if (t.type !== "sale") return;

        const shareFraction = shareData[t.projectId] || 0;
        if (shareFraction <= 0) return;

        const memberShareAmt = parseFloat((t.amount * shareFraction).toFixed(2));
        if (memberShareAmt <= 0) return;

        ledger.push({
          id: `${t.id}-sale-${member.docId}`,
          date: t.date || new Date().toISOString().split("T")[0],
          userDocId: member.docId,
          userName: member.name,
          type: "project_sale",
          typeLabel: "শেয়ার লভ্যাংশ (Project Sale)",
          memo: `${t.desc || "প্রজেক্ট ফ্ল্যাট/প্লট বিক্রয়"} (শেয়ার: ${(shareFraction * 100).toFixed(1)}%)`,
          flow: "IN",
          amount: memberShareAmt,
          projectName: t.projectName || "প্রজেক্ট বিক্রয়"
        });
      });

      // D. CUSTOMER INSTALLMENT PAYMENTS (IN)
      activeCompanyInstallments.forEach((inst) => {
        const matchedProj = activeCompanyProjects.find((p) => p.name === inst.productName);
        if (!matchedProj) return;

        const shareFraction = shareData[matchedProj.id] || 0;
        if (shareFraction <= 0) return;

        // Downpayment share
        if (inst.downPayment > 0) {
          const dpShareAmt = parseFloat((inst.downPayment * shareFraction).toFixed(2));
          const instDate = inst.startDate || inst.createdAt?.split("T")[0] || new Date().toISOString().split("T")[0];
          ledger.push({
            id: `${inst.id}-downpayment-${member.docId}`,
            date: instDate,
            userDocId: member.docId,
            userName: member.name,
            type: "installment_income",
            typeLabel: "ডাউনপেমেন্ট লভ্যাংশ",
            memo: `গ্রাহক: ${inst.customerName} এর ডাউনপেমেন্ট শেয়ার (${(shareFraction * 100).toFixed(1)}%)`,
            flow: "IN",
            amount: dpShareAmt,
            projectName: matchedProj.name
          });
        }

        // Paid monthly installment steps share
        const paidSteps = (inst.schedule || []).filter((s) => s.status === "paid" || s.paidAmount > 0);
        paidSteps.forEach((step) => {
          const stepPaidAmt = step.paidAmount || step.amount;
          const stepShareAmt = parseFloat((stepPaidAmt * shareFraction).toFixed(2));
          if (stepShareAmt <= 0) return;

          const stepDate = step.paidDate || step.dueDate || new Date().toISOString().split("T")[0];

          ledger.push({
            id: `${inst.id}-step-${step.month}-${member.docId}`,
            date: stepDate,
            userDocId: member.docId,
            userName: member.name,
            type: "installment_income",
            typeLabel: `কিস্তি আদায় লভ্যাংশ (${step.month} নং মাস)`,
            memo: `গ্রাহক: ${inst.customerName} এর কিস্তি শেয়ার (${(shareFraction * 100).toFixed(1)}%)`,
            flow: "IN",
            amount: stepShareAmt,
            projectName: matchedProj.name
          });
        });
      });
    });

    // Sort by date desc (latest first), then by id to ensure stable sort
    return ledger.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.id.localeCompare(a.id);
    });
  };

  const fullLedger = buildTransactionsLedger();

  // Filtered Ledger based on selections
  const filteredLedger = fullLedger.filter((item) => {
    // 1. User Filter
    if (filterUser !== "all" && item.userDocId !== filterUser) {
      return false;
    }

    // 2. Flow Filter
    if (filterFlow !== "all" && item.flow !== filterFlow) {
      return false;
    }

    // 3. Type Filter
    if (filterType !== "all") {
      if (filterType === "saving" && item.type !== "saving" && item.type !== "saving_withdraw") {
        return false;
      }
      if (filterType === "project_expense" && item.type !== "project_expense") {
        return false;
      }
      if (filterType === "project_sale" && item.type !== "project_sale") {
        return false;
      }
      if (filterType === "installment_income" && item.type !== "installment_income") {
        return false;
      }
    }

    // 4. Date range filter
    if (dateFrom && item.date < dateFrom) return false;
    if (dateTo && item.date > dateTo) return false;

    // 5. Search Query (matches user name, memo, project name, or type label)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.userName.toLowerCase().includes(q);
      const matchMemo = item.memo.toLowerCase().includes(q);
      const matchProj = item.projectName.toLowerCase().includes(q);
      const matchLabel = item.typeLabel.toLowerCase().includes(q);
      return matchName || matchMemo || matchProj || matchLabel;
    }

    return true;
  });

  // Calculate Aggregations for the visible ledger
  const totalIn = filteredLedger
    .filter((item) => item.flow === "IN")
    .reduce((sum, item) => sum + item.amount, 0);

  const totalOut = filteredLedger
    .filter((item) => item.flow === "OUT")
    .reduce((sum, item) => sum + item.amount, 0);

  const netBalance = totalIn - totalOut;

  // Filter and sort transaction requests
  const filteredRequests = transactionRequests
    .filter((req) => {
      // 1. Role / Company filter
      if (currentUser.role === "company") {
        if (req.companyId !== targetCompanyId) return false;
      } else if (currentUser.role === "member") {
        if (req.userId !== currentUser.docId) return false;
      }

      // 2. Status Tab Filter
      if (requestFilterTab === "pending") {
        return req.status === "pending";
      }
      return true; // "all_history" shows all
    })
    .sort((a, b) => {
      const aTime = a.createdAt || "";
      const bTime = b.createdAt || "";
      return bTime.localeCompare(aTime);
    });

  // Formatting helpers
  const formatNum = (val: number) => {
    return new Intl.NumberFormat("bn-BD", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const handleExportCSV = () => {
    // Construct CSV content
    const headers = ["Date", "Member Name", "Type", "Description", "Project", "Flow", "Amount (BDT)"];
    const rows = filteredLedger.map((item) => [
      item.date,
      item.userName,
      item.typeLabel,
      item.memo.replace(/,/g, " "),
      item.projectName.replace(/,/g, " "),
      item.flow,
      item.amount
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Transactions_Report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const resetFilters = () => {
    setSearchQuery("");
    if (currentUser.role !== "member") {
      setFilterUser("all");
    }
    setFilterFlow("all");
    setFilterType("all");
    setDateFrom("");
    setDateTo("");
  };

  // Submit operations
  const handleCreateTransaction = async (e: FormEvent) => {
    e.preventDefault();
    
    // Validations
    const amountNum = parseFloat(trxAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setToastMsg({ text: "অনুগ্রহ করে সঠিক পরিমাণ ইনপুট দিন।", type: "error" });
      return;
    }

    if (!selectedUserId) {
      setToastMsg({ text: "অনুগ্রহ করে সদস্য নির্বাচন করুন।", type: "error" });
      return;
    }

    const member = users.find((u) => u.docId === selectedUserId);
    if (!member) {
      setToastMsg({ text: "সদস্য পাওয়া যায়নি।", type: "error" });
      return;
    }

    if (!trxDate) {
      setToastMsg({ text: "অনুগ্রহ করে তারিখ নির্বাচন করুন।", type: "error" });
      return;
    }

    // Payment validation
    if (trxFlow === "IN") {
      if (paymentMethod === "mobile_banking") {
        if (!mobileAccountNo) {
          setToastMsg({ text: "মোবাইল ব্যাংকিং অ্যাকাউন্ট নম্বর দিন।", type: "error" });
          return;
        }
        if (!mobileTrxId) {
          setToastMsg({ text: "মোবাইল ব্যাংকিং ট্রানজেকশন আইডি (TxID) দিন।", type: "error" });
          return;
        }
      } else if (paymentMethod === "bank") {
        if (!bankName) {
          setToastMsg({ text: "ব্যাংকের নাম দিন।", type: "error" });
          return;
        }
        if (!bankAccountNo) {
          setToastMsg({ text: "ব্যাংক হিসাব নম্বর দিন।", type: "error" });
          return;
        }
        if (!bankTrxId) {
          setToastMsg({ text: "ব্যাংক রেফারেন্স / ট্রানজেকশন আইডি দিন।", type: "error" });
          return;
        }
      } else {
        setToastMsg({ text: "ক্যাশ ইন এর জন্য মোবাইল ব্যাংকিং বা ব্যাংক ট্রান্সফার নির্বাচন করুন।", type: "error" });
        return;
      }
    } else {
      // CASH OUT validations
      if (paymentMethod === "mobile_banking") {
        if (!mobileAccountNo) {
          setToastMsg({ text: "যে মোবাইল ব্যাংকিং নম্বরে টাকা উত্তোলন করবেন তা দিন।", type: "error" });
          return;
        }
      } else if (paymentMethod === "bank") {
        if (!bankName) {
          setToastMsg({ text: "ব্যাংকের নাম দিন।", type: "error" });
          return;
        }
        if (!bankAccountNo) {
          setToastMsg({ text: "ব্যাংক হিসাব নম্বর দিন।", type: "error" });
          return;
        }
      }
      // If cash, no additional bank info is required!
    }

    setSubmitting(true);
    setToastMsg(null);

    try {
      if (trxFlow === "OUT") {
        const isCompanyOrAdmin = currentUser.role === "company" || currentUser.role === "admin";
        const savingsBal = member.savingsBalance !== undefined ? member.savingsBalance : Number(member.amount || 0);
        const incomeBal = member.incomeBalance || 0;

        if (isCompanyOrAdmin) {
          const totalAvailable = savingsBal + incomeBal;
          if (totalAvailable < amountNum) {
            throw new Error(`উত্তোলনের জন্য পর্যাপ্ত ব্যালেন্স নেই। মোট উপলব্ধ ব্যালেন্স: ৳${formatNum(totalAvailable)} (সেভিংস: ৳${formatNum(savingsBal)}, ইনকাম: ৳${formatNum(incomeBal)})`);
          }
        } else {
          if (member.accountType === "saving") {
            if (savingsBal < amountNum) {
              throw new Error(`উত্তোলনের জন্য পর্যাপ্ত সেভিংস ব্যালেন্স নেই। আপনার বর্তমান সেভিংস ব্যালেন্স: ৳${formatNum(savingsBal)}`);
            }
          } else if (member.accountType === "business") {
            if (incomeBal < amountNum) {
              throw new Error(`উত্তোলনের জন্য পর্যাপ্ত ইনকাম ব্যালেন্স নেই। আপনার বর্তমান ইনকাম ব্যালেন্স: ৳${formatNum(incomeBal)}`);
            }
          } else {
            if (savingsBal < amountNum) {
              throw new Error(`উত্তোলনের জন্য পর্যাপ্ত সেভিংস ব্যালেন্স নেই। আপনার বর্তমান সেভিংস ব্যালেন্স: ৳${formatNum(savingsBal)}`);
            }
          }
        }
      }

      // Create a pending transaction request
      const reqPayload: any = {
        companyId: member.companyId || targetCompanyId,
        userId: selectedUserId,
        userName: member.name,
        userEmail: member.email || "",
        flow: trxFlow,
        type: trxType,
        amount: amountNum,
        date: trxDate,
        memo: trxMemo || (trxFlow === "OUT" ? "সঞ্চয় থেকে টাকা উত্তোলন (ক্যাশ-আউট)" : (trxType === "saving" ? "সাধারণ সঞ্চয় ডিপোজিট" : "কিস্তি পরিশোধ")),
        paymentMethod,
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      if (paymentMethod === "mobile_banking") {
        reqPayload.mobileProvider = mobileProvider;
        reqPayload.mobileAccountNo = mobileAccountNo;
        reqPayload.mobileTrxId = trxFlow === "IN" ? mobileTrxId : "";
      } else if (paymentMethod === "bank") {
        reqPayload.bankName = bankName;
        reqPayload.bankBranch = bankBranch;
        reqPayload.bankAccountNo = bankAccountNo;
        reqPayload.bankTrxId = trxFlow === "IN" ? bankTrxId : "";
      }

      if (trxFlow === "IN" && trxType === "installment") {
        reqPayload.installmentId = selectedInstallmentId;
        const instObj = installments.find((i) => i.id === selectedInstallmentId);
        if (instObj) {
          reqPayload.installmentName = instObj.productName;
        }
      }

      await addDoc(collection(db, "transaction_requests"), reqPayload);

      setToastMsg({ 
        text: "✅ ট্রানজেকশন রিকোয়েস্ট সফলভাবে জমা দেওয়া হয়েছে! কোম্পানির ম্যানেজার বা এডমিন এপ্রুভ করার পর ব্যালেন্স আপডেট হবে।", 
        type: "success" 
      });

      // Reset form on success (except date & user selection to preserve workflow)
      setTrxAmount("");
      setTrxMemo("");
      setMobileAccountNo("");
      setMobileTrxId("");
      setBankBranch("");
      setBankAccountNo("");
      setBankTrxId("");

      // Automatically hide modal and switch tab after 2.5 seconds on success
      setTimeout(() => {
        setShowTrxModal(false);
        setActiveSubTab("requests");
        setToastMsg(null);
      }, 2500);

    } catch (err: any) {
      console.error(err);
      setToastMsg({ text: err.message || "লেনদেন রিকোয়েস্ট পাঠানো সম্ভব হয়নি। পুনরায় চেষ্টা করুন।", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  // New company payment account states
  const [newAccType, setNewAccType] = useState<"mobile_banking" | "bank">("mobile_banking");
  const [newAccProvider, setNewAccProvider] = useState<string>("bKash");
  const [newAccNumber, setNewAccNumber] = useState<string>("");
  const [newAccTypeLabel, setNewAccTypeLabel] = useState<string>("Personal");
  const [newAccHolderName, setNewAccHolderName] = useState<string>("");

  const handleAddCompanyAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!newAccNumber.trim() || !newAccProvider.trim()) {
      setToastMsg({ text: "অনুগ্রহ করে অ্যাকাউন্ট নম্বর ও প্রদানকারী নির্বাচন করুন।", type: "error" });
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, "company_payment_accounts"), {
        companyId: targetCompanyId,
        type: newAccType,
        providerName: newAccProvider,
        accountNumber: newAccNumber.trim(),
        accountType: newAccTypeLabel.trim(),
        accountName: newAccHolderName.trim(),
        isActive: true,
        createdAt: new Date().toISOString()
      });
      setToastMsg({ text: "✅ কোম্পানি পেমেন্ট অ্যাকাউন্ট সফলভাবে যোগ করা হয়েছে!", type: "success" });
      setNewAccNumber("");
      setNewAccHolderName("");
    } catch (err: any) {
      console.error(err);
      setToastMsg({ text: "অ্যাকাউন্ট যোগ করা যায়নি।", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAccountStatus = async (accId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "company_payment_accounts", accId), {
        isActive: !currentStatus
      });
      setToastMsg({ text: "✅ অ্যাকাউন্টের সক্রিয়তা পরিবর্তন করা হয়েছে।", type: "success" });
    } catch (err) {
      console.error(err);
      setToastMsg({ text: "স্ট্যাটাস পরিবর্তন করা যায়নি।", type: "error" });
    }
  };

  const handleDeleteCompanyAccount = async (accId: string) => {
    if (!window.confirm("আপনি কি নিশ্চিতভাবে এই পেমেন্ট অ্যাকাউন্টটি মুছে ফেলতে চান?")) return;
    try {
      await deleteDoc(doc(db, "company_payment_accounts", accId));
      setToastMsg({ text: "✅ অ্যাকাউন্টটি সফলভাবে মুছে ফেলা হয়েছে।", type: "success" });
    } catch (err) {
      console.error(err);
      setToastMsg({ text: "মুছে ফেলা সম্ভব হয়নি।", type: "error" });
    }
  };

  const handleApproveRequest = async (req: TransactionRequest) => {
    const member = users.find((u) => u.docId === req.userId);
    if (!member) {
      setToastMsg({ text: "সদস্য পাওয়া যায়নি।", type: "error" });
      return;
    }

    setSubmitting(true);
    setToastMsg(null);

    try {
      if (req.flow === "OUT") {
        const savingsBal = member.savingsBalance !== undefined ? member.savingsBalance : Number(member.amount || 0);
        const incomeBal = member.incomeBalance || 0;

        if (member.accountType === "saving") {
          if (savingsBal < req.amount) {
            throw new Error(`উত্তোলনের জন্য পর্যাপ্ত সেভিংস ব্যালেন্স নেই। বর্তমান সেভিংস ব্যালেন্স: ৳${formatNum(savingsBal)}`);
          }
        } else if (member.accountType === "business") {
          if (incomeBal < req.amount) {
            throw new Error(`উত্তোলনের জন্য পর্যাপ্ত ইনকাম ব্যালেন্স নেই। বর্তমান ইনকাম ব্যালেন্স: ৳${formatNum(incomeBal)}`);
          }
        } else {
          if (savingsBal < req.amount) {
            throw new Error(`উত্তোলনের জন্য পর্যাপ্ত সেভিংস ব্যালেন্স নেই। বর্তমান সেভিংস ব্যালেন্স: ৳${formatNum(savingsBal)}`);
          }
        }

        // Add history document
        const historyPayload: any = {
          amount: -req.amount,
          date: req.date,
          memo: req.memo || "সঞ্চয় থেকে টাকা উত্তোলন (ক্যাশ-আউট)",
          type: "withdraw",
          flow: "OUT",
          paymentMethod: req.paymentMethod,
          createdAt: new Date().toISOString(),
          projectName: "কোম্পানি (সাধারণ)",
        };

        if (req.paymentMethod === "mobile_banking") {
          historyPayload.mobileProvider = req.mobileProvider || "";
          historyPayload.accountNo = req.mobileAccountNo || "";
          historyPayload.trxId = req.mobileTrxId || "";
        } else if (req.paymentMethod === "bank") {
          historyPayload.bankName = req.bankName || "";
          historyPayload.bankBranch = req.bankBranch || "";
          historyPayload.accountNo = req.bankAccountNo || "";
          historyPayload.trxId = req.bankTrxId || "";
        }

        const historyCol = collection(db, "users", req.userId, "history");
        await addDoc(historyCol, historyPayload);

        // Update User amount (Decrement savings)
        const userRef = doc(db, "users", req.userId);
        await updateDoc(userRef, {
          amount: increment(-req.amount)
        });

      } else {
        // CASH IN (Deposit / Pay)
        if (req.type === "saving") {
          // Savings Deposit
          let remaining = req.amount;
          let totalSavingsArrearsPaid = 0;

          // Fetch savings arrears
          const histSnap = await getDocs(collection(db, "users", req.userId, "history"));
          const savingsArrearsDocs: any[] = [];
          histSnap.forEach((dDoc) => {
            const h = { docId: dDoc.id, ...dDoc.data() } as any;
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
            await addDoc(collection(db, "users", req.userId, "history"), {
              amount: payAmt,
              date: req.date,
              memo: `বকেয়া সঞ্চয় সমন্বয়ঃ ${arrDoc.memo || "সেভিংস জমা"}`,
              InvestType: member.InvestType || "",
              accountType: member.accountType || "",
              type: "savings_arrears_paid",
              flow: "IN",
              paymentMethod: req.paymentMethod,
              mobileProvider: req.paymentMethod === "mobile_banking" ? req.mobileProvider : null,
              accountNo: req.paymentMethod === "mobile_banking" ? req.mobileAccountNo : req.bankAccountNo,
              trxId: req.paymentMethod === "mobile_banking" ? req.mobileTrxId : req.bankTrxId,
              bankName: req.paymentMethod === "bank" ? req.bankName : null,
              bankBranch: req.paymentMethod === "bank" ? req.bankBranch : null,
              createdAt: new Date().toISOString(),
              projectName: "কোম্পানি (সাধারণ)",
            });

            // Delete or update the original savings_arrears document
            const arrDocRef = doc(db, "users", req.userId, "history", arrDoc.docId);
            if (payAmt >= dueAmt) {
              await deleteDoc(arrDocRef);
            } else {
              await updateDoc(arrDocRef, {
                arrears: parseFloat((dueAmt - payAmt).toFixed(2)),
              });
            }
          }

          // Write remaining amount to new savings
          if (remaining > 0) {
            const historyPayload: any = {
              amount: remaining,
              date: req.date,
              memo: req.memo || "সাধারণ সঞ্চয় ডিপোজিট",
              InvestType: member.InvestType || "",
              accountType: member.accountType || "",
              type: "saving",
              flow: "IN",
              paymentMethod: req.paymentMethod,
              createdAt: new Date().toISOString(),
              projectName: "কোম্পানি (সাধারণ)",
            };

            if (req.paymentMethod === "mobile_banking") {
              historyPayload.mobileProvider = req.mobileProvider;
              historyPayload.accountNo = req.mobileAccountNo;
              historyPayload.trxId = req.mobileTrxId;
            } else {
              historyPayload.bankName = req.bankName;
              historyPayload.bankBranch = req.bankBranch;
              historyPayload.accountNo = req.bankAccountNo;
              historyPayload.trxId = req.bankTrxId;
            }

            const historyCol = collection(db, "users", req.userId, "history");
            await addDoc(historyCol, historyPayload);
          }

          // Update the user's total investment balance
          const totalAddedToSavings = parseFloat((totalSavingsArrearsPaid + remaining).toFixed(2));
          const userRef = doc(db, "users", req.userId);
          await updateDoc(userRef, {
            amount: increment(totalAddedToSavings)
          });

        } else {
          // Installment Payment
          if (!req.installmentId) {
            throw new Error("কিস্তি চুক্তি আইডি পাওয়া যায়নি।");
          }

          const inst = installments.find((i) => i.id === req.installmentId);
          if (!inst) {
            throw new Error("কিস্তি চুক্তিটি পাওয়া যায়নি।");
          }

          let remaining = req.amount;
          const scheduleCopy = JSON.parse(JSON.stringify(inst.schedule || [])) as InstallmentStep[];
          let instPaidThisTime = 0;

          // Settle schedule steps
          for (let i = 0; i < scheduleCopy.length; i++) {
            if (remaining <= 0) break;
            const step = scheduleCopy[i];

            // Ignore steps already paid
            if (step.status === "paid") continue;

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
              step.paidDate = req.date;
            }
          }

          // Update installment in Firestore
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

          // Write paid log to user history for ledger tracing
          const historyPayload: any = {
            amount: instPaidThisTime,
            date: req.date,
            memo: req.memo || `কিস্তি পরিশোধ - প্রজেক্ট: ${inst.productName} (গ্রাহক: ${inst.customerName})`,
            type: "installment_payment",
            flow: "IN",
            paymentMethod: req.paymentMethod,
            createdAt: new Date().toISOString(),
            projectName: inst.productName,
          };

          if (req.paymentMethod === "mobile_banking") {
            historyPayload.mobileProvider = req.mobileProvider;
            historyPayload.accountNo = req.mobileAccountNo;
            historyPayload.trxId = req.mobileTrxId;
          } else {
            historyPayload.bankName = req.bankName;
            historyPayload.bankBranch = req.bankBranch;
            historyPayload.accountNo = req.bankAccountNo;
            historyPayload.trxId = req.bankTrxId;
          }

          const historyCol = collection(db, "users", req.userId, "history");
          await addDoc(historyCol, historyPayload);

          if (remaining > 0) {
            // Leftover remains! Let's deposit it as general savings!
            const userRef = doc(db, "users", req.userId);
            await updateDoc(userRef, {
              amount: increment(remaining)
            });

            // Write leftover history
            const leftoverPayload = { ...historyPayload, amount: remaining, memo: `কিস্তি পরিশোধের অবশিষ্ট অংশ সঞ্চয়ে জমাকৃত`, type: "saving" };
            await addDoc(historyCol, leftoverPayload);
          }
        }
      }

      // Update Transaction Request status
      const requestRef = doc(db, "transaction_requests", req.id);
      await updateDoc(requestRef, {
        status: "approved",
        processedAt: new Date().toISOString(),
        processedBy: currentUser.name || currentUser.email || "কোম্পানি",
      });

      // Create Member notification
      await addDoc(collection(db, "notifications"), {
        title: `ট্রানজেকশন এপ্রুভ হয়েছে`,
        body: `আপনার ৳${formatNum(req.amount)} পরিমাণের ক্যাশ-${req.flow === "IN" ? "ইন" : "আউট"} রিকোয়েস্ট কোম্পানি কর্তৃক এপ্রুভ করা হয়েছে এবং হিসাব বিবরণীতে যোগ করা হয়েছে।`,
        senderId: currentUser.docId,
        senderName: currentUser.companyName || currentUser.name,
        senderRole: currentUser.role === "admin" ? "admin" : "company",
        targetType: "all_members",
        createdAt: new Date().toISOString(),
        readBy: [],
      });

      setToastMsg({ text: "✅ ট্রানজেকশন রিকোয়েস্টটি সফলভাবে এপ্রুভ করা হয়েছে!", type: "success" });
    } catch (err: any) {
      console.error(err);
      setToastMsg({ text: err.message || "এপ্রুভ করা সম্ভব হয়নি।", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectRequest = async (req: TransactionRequest, reason: string) => {
    setSubmitting(true);
    setToastMsg(null);

    try {
      const requestRef = doc(db, "transaction_requests", req.id);
      await updateDoc(requestRef, {
        status: "rejected",
        rejectedReason: reason,
        processedAt: new Date().toISOString(),
        processedBy: currentUser.name || currentUser.email || "কোম্পানি",
      });

      // Create Member notification
      await addDoc(collection(db, "notifications"), {
        title: `ট্রানজেকশন প্রত্যাখ্যাত হয়েছে`,
        body: `আপনার ৳${formatNum(req.amount)} পরিমাণের ক্যাশ-${req.flow === "IN" ? "ইন" : "আউট"} রিকোয়েস্ট বাতিল করা হয়েছে। কারণ: ${reason || "তথ্য অমিল"}`,
        senderId: currentUser.docId,
        senderName: currentUser.companyName || currentUser.name,
        senderRole: currentUser.role === "admin" ? "admin" : "company",
        targetType: "all_members",
        createdAt: new Date().toISOString(),
        readBy: [],
      });

      setToastMsg({ text: "❌ ট্রানজেকশন রিকোয়েস্টটি বাতিল করা হয়েছে।", type: "success" });
    } catch (err: any) {
      console.error(err);
      setToastMsg({ text: err.message || "বাতিল করা সম্ভব হয়নি।", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 font-sans select-none animate-fadeIn">
      {/* Upper header action section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
              <ArrowLeftRight className="w-5 sm:h-5 sm:w-5" />
            </span>
            লেনদেন ও অনুমোদন ব্যবস্থাপনা
          </h1>
          <p className="text-xs text-slate-400 font-bold mt-1.5">
            ব্যাংক বা মোবাইল ব্যাংকিং (বিকাশ/নগদ) ব্যবহার করে সেভিংস বা কিস্তি জমা, উত্তোলন এবং রিয়েল-টাইম হিসাব
          </p>
        </div>

        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {activeSubTab !== "submit" && (
            <button
              onClick={() => setActiveSubTab("submit")}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer transition active:scale-95"
            >
              <Plus className="w-4 h-4" /> লেনদেন করুন
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer transition active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer transition active:scale-95"
          >
            মুদ্রণ
          </button>
        </div>
      </div>

      {/* Modern Inner Navigation Tabs */}
      <div className="flex border-b border-slate-200 mb-6 gap-2 sm:gap-4 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveSubTab("ledger")}
          className={`pb-4 px-2 text-xs sm:text-sm font-black transition-all relative flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeSubTab === "ledger"
              ? "text-indigo-600 border-b-2 border-indigo-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          লেনদেন খাতা
        </button>
        <button
          onClick={() => setActiveSubTab("requests")}
          className={`pb-4 px-2 text-xs sm:text-sm font-black transition-all relative flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeSubTab === "requests"
              ? "text-indigo-600 border-b-2 border-indigo-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Clock className="w-4 h-4" />
          {isAdminOrCompany ? "অনুমোদন অপেক্ষমাণ তালিকা" : "আমার রিকোয়েস্ট সমূহ"}
          {transactionRequests.filter(r => r.status === "pending" && (isAdminOrCompany ? true : r.userId === currentUser.docId)).length > 0 && (
            <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0.5 rounded-full ml-1">
              {transactionRequests.filter(r => r.status === "pending" && (isAdminOrCompany ? true : r.userId === currentUser.docId)).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSubTab("submit")}
          className={`pb-4 px-2 text-xs sm:text-sm font-black transition-all relative flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeSubTab === "submit"
              ? "text-indigo-600 border-b-2 border-indigo-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Coins className="w-4 h-4" />
          নতুন লেনদেন রিকোয়েস্ট
        </button>
        <button
          onClick={() => setActiveSubTab("settings")}
          className={`pb-4 px-2 text-xs sm:text-sm font-black transition-all relative flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeSubTab === "settings"
              ? "text-indigo-600 border-b-2 border-indigo-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Settings className="w-4 h-4" />
          {isAdminOrCompany ? "লেনদেন সেটিংস" : "কোম্পানি পেমেন্ট একাউন্টস"}
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col justify-center items-center py-20">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="mt-4 text-xs font-bold text-slate-400">লেনদেন তথ্য লোড হচ্ছে...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeSubTab === "ledger" && (
            <>
              {/* Summary Dashboard Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total IN (Inflow Card) */}
            <div className="bg-emerald-50/50 border border-emerald-100 p-5 rounded-3xl relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 p-8 opacity-10 bg-emerald-500 rounded-full translate-x-4 -translate-y-4"></div>
              <div>
                <p className="text-[10px] text-emerald-600 uppercase font-black tracking-wider">মোট জমা ও লভ্যাংশ (Total IN)</p>
                <h3 className="text-2xl sm:text-3xl font-black text-emerald-700 mt-2">
                  ৳{formatNum(totalIn)}
                </h3>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 mt-4 bg-white/70 py-1.5 px-3 rounded-xl border border-emerald-100 self-start">
                <TrendingUp className="w-3.5 h-3.5" />
                ব্যালেন্স বৃদ্ধিকারী
              </div>
            </div>

            {/* Total OUT (Outflow Card) */}
            <div className="bg-rose-50/50 border border-rose-100 p-5 rounded-3xl relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 p-8 opacity-10 bg-rose-500 rounded-full translate-x-4 -translate-y-4"></div>
              <div>
                <p className="text-[10px] text-rose-500 uppercase font-black tracking-wider">মোট শেয়ার খরচ ও উত্তোলন (Total OUT)</p>
                <h3 className="text-2xl sm:text-3xl font-black text-rose-700 mt-2">
                  ৳{formatNum(totalOut)}
                </h3>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 mt-4 bg-white/70 py-1.5 px-3 rounded-xl border border-rose-100 self-start">
                <TrendingDown className="w-3.5 h-3.5" />
                ব্যালেন্স হ্রাসকারী
              </div>
            </div>

            {/* Net Worth/Active Balance Card */}
            <div className="bg-indigo-50/50 border border-indigo-100 p-5 rounded-3xl relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 p-8 opacity-10 bg-indigo-500 rounded-full translate-x-4 -translate-y-4"></div>
              <div>
                <p className="text-[10px] text-indigo-600 uppercase font-black tracking-wider">সক্রিয় নিট ব্যালেন্স (Net Active Balance)</p>
                <h3 className="text-2xl sm:text-3xl font-black text-indigo-700 mt-2">
                  ৳{formatNum(netBalance)}
                </h3>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 mt-4 bg-white/70 py-1.5 px-3 rounded-xl border border-indigo-100 self-start">
                <Building className="w-3.5 h-3.5" />
                বর্তমান নিট ফান্ড
              </div>
            </div>
          </div>
          </>
          )}

          {activeSubTab === "requests" && (
            /* Transaction Requests (Approval / Status Queue) */
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/40">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 animate-pulse" />
                </span>
                <div>
                  <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-1.5">
                    <span>{isAdminOrCompany ? "লেনদেন অনুমোদন ও যাচাইকরণ কিউ (Approval Queue)" : "আমার ট্রানজেকশন রিকোয়েস্ট সমূহ"}</span>
                    <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {transactionRequests.filter(r => r.status === "pending" && (isAdminOrCompany ? true : r.userId === currentUser.docId)).length} টি পেন্ডিং
                    </span>
                  </h2>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                    {isAdminOrCompany ? "সদস্যদের ক্যাশ-ইন ও ক্যাশ-আউট রিকোয়েস্ট যাচাই করে এপ্রুভ করুন। এপ্রুভ ছাড়া হিসাব নিকাশ হবে না।" : "আপনার ক্যাশ-ইন বা ক্যাশ-আউট রিকোয়েস্ট সমূহের লাইভ অবস্থা"}
                  </p>
                </div>
              </div>

              {/* Toggle for Pending vs History */}
              <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
                <button
                  onClick={() => setRequestFilterTab("pending")}
                  className={`text-[10px] px-3 py-1.5 rounded-lg font-black transition-all ${
                    requestFilterTab === "pending"
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  পেন্ডিং কিউ
                </button>
                <button
                  onClick={() => setRequestFilterTab("all_history")}
                  className={`text-[10px] px-3 py-1.5 rounded-lg font-black transition-all ${
                    requestFilterTab === "all_history"
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  রিকোয়েস্ট ইতিহাস
                </button>
              </div>
            </div>

            {filteredRequests.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <div className="w-12 h-12 bg-slate-50 border border-slate-100 text-slate-300 flex items-center justify-center rounded-full mx-auto mb-3">
                  <Clock className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-500">বর্তমানে কোনো অপেক্ষমান রিকোয়েস্ট পাওয়া যায়নি।</p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {requestFilterTab === "pending" ? "নতুন ক্যাশ-ইন বা আউট সাবমিট করলে এখানে প্রদর্শিত হবে" : "কোনো ইতিহাস রেকর্ড নেই"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                      <th className="px-5 py-3 text-center w-12">ক্রমিক</th>
                      <th className="px-4 py-3">তারিখ ও সদস্য</th>
                      <th className="px-4 py-3">টাইপ</th>
                      <th className="px-4 py-3">পরিমাণ</th>
                      <th className="px-4 py-3">পেমেন্ট বিবরণ (TxID)</th>
                      <th className="px-4 py-3">বিবরণ / প্রজেক্ট</th>
                      <th className="px-4 py-3">অবস্থা (Status)</th>
                      {isAdminOrCompany && <th className="px-4 py-3 text-right">অনুমোদন অ্যাকশন</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredRequests.map((req, index) => {
                      const isRejectingThis = rejectingReqId === req.id;
                      return (
                        <tr key={req.id} className="hover:bg-slate-50/40 transition">
                          <td className="px-5 py-4 text-center text-slate-400 font-black text-[10px]">
                            {index + 1}
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-bold text-slate-700">{req.date}</p>
                            <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1 mt-0.5">
                              <UserIcon className="w-3 h-3 text-indigo-400" />
                              {req.userName}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            {req.flow === "IN" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black border border-emerald-100">
                                <TrendingUp className="w-3 h-3" />
                                ক্যাশ-ইন ({req.type === "saving" ? "সেভিংস" : "কিস্তি"})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 text-[9px] font-black border border-rose-100">
                                <TrendingDown className="w-3 h-3" />
                                ক্যাশ-আউট
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 font-black text-slate-800 text-sm">
                            ৳{formatNum(req.amount)}
                          </td>
                          <td className="px-4 py-4">
                            {req.paymentMethod === "mobile_banking" ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1 text-[10px] font-black text-indigo-600 uppercase">
                                  <Smartphone className="w-3 h-3 text-indigo-500" />
                                  <span>{req.mobileProvider}</span>
                                </div>
                                <p className="text-slate-600 font-mono text-[11px] font-bold">No: {req.mobileAccountNo}</p>
                                <p className="text-[10px] text-slate-500 font-black bg-slate-100 px-1.5 py-0.5 rounded border inline-block">TxID: {req.mobileTrxId}</p>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1 text-[10px] font-black text-teal-600 uppercase">
                                  <Building className="w-3 h-3 text-teal-500" />
                                  <span>{req.bankName}</span>
                                </div>
                                <p className="text-slate-500 text-[9px] font-bold">Branch: {req.bankBranch || "N/A"}</p>
                                <p className="text-slate-600 font-mono text-[11px] font-bold">Acc: {req.bankAccountNo}</p>
                                <p className="text-[10px] text-slate-500 font-black bg-slate-100 px-1.5 py-0.5 rounded border inline-block">Ref: {req.bankTrxId}</p>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-slate-500 italic max-w-xs truncate">
                            <span className="text-slate-700 font-medium not-italic block">{req.memo}</span>
                            {req.installmentName && (
                              <span className="inline-block text-[9px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md font-extrabold not-italic mt-1 border border-indigo-100/40">
                                কিস্তি চুক্তিঃ {req.installmentName}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {req.status === "pending" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-600 text-[10px] font-extrabold border border-amber-100">
                                <Clock className="w-3.5 h-3.5 animate-pulse text-amber-500" /> অপেক্ষমান (Pending)
                              </span>
                            ) : req.status === "approved" ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-extrabold border border-emerald-100">
                                  <Check className="w-3.5 h-3.5 text-emerald-500" /> এপ্রুভড (Approved)
                                </span>
                                {req.processedBy && (
                                  <p className="text-[9px] text-slate-400 font-medium">By: {req.processedBy}</p>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-600 text-[10px] font-extrabold border border-rose-100">
                                  <XCircle className="w-3.5 h-3.5 text-rose-500" /> বাতিল (Rejected)
                                </span>
                                {req.rejectedReason && (
                                  <p className="text-[9px] text-rose-400 max-w-[150px] leading-tight break-words font-bold">কারণ: {req.rejectedReason}</p>
                                )}
                              </div>
                            )}
                          </td>
                          {isAdminOrCompany && (
                            <td className="px-4 py-4 text-right whitespace-nowrap">
                              {req.status === "pending" ? (
                                isRejectingThis ? (
                                  <div className="flex flex-col gap-1.5 items-end">
                                    <input
                                      type="text"
                                      placeholder="বাতিলের কারণ লিখুন..."
                                      value={rejectionReason}
                                      onChange={(e) => setRejectionReason(e.target.value)}
                                      className="text-[10px] border border-rose-200 rounded-xl px-2.5 py-1.5 w-40 outline-none focus:ring-2 focus:ring-rose-100 text-slate-700 font-medium"
                                    />
                                    <div className="flex gap-1">
                                      <button
                                        onClick={() => {
                                          if (!rejectionReason.trim()) {
                                            setToastMsg({ text: "বাতিলের কারণ উল্লেখ করা আবশ্যক।", type: "error" });
                                            return;
                                          }
                                          handleRejectRequest(req, rejectionReason);
                                          setRejectingReqId(null);
                                          setRejectionReason("");
                                        }}
                                        className="text-[9px] bg-rose-600 hover:bg-rose-700 text-white font-bold px-2.5 py-1 rounded-lg shadow-sm cursor-pointer transition active:scale-95"
                                      >
                                        নিশ্চিত করুন
                                      </button>
                                      <button
                                        onClick={() => {
                                          setRejectingReqId(null);
                                          setRejectionReason("");
                                        }}
                                        className="text-[9px] bg-slate-100 text-slate-500 font-bold px-2.5 py-1 rounded-lg border hover:bg-slate-200 cursor-pointer transition"
                                      >
                                        বাতিল
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      onClick={() => handleApproveRequest(req)}
                                      className="text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white font-black px-3.5 py-2 rounded-xl shadow-sm cursor-pointer active:scale-95 transition flex items-center gap-1"
                                    >
                                      <Check className="w-3.5 h-3.5" /> এপ্রুভ করুন
                                    </button>
                                    <button
                                      onClick={() => setRejectingReqId(req.id)}
                                      className="text-[10px] bg-rose-50 text-rose-600 hover:bg-rose-100 font-black px-3 py-2 rounded-xl border border-rose-100 cursor-pointer active:scale-95 transition flex items-center gap-1"
                                    >
                                      <XCircle className="w-3.5 h-3.5" /> বাতিল
                                    </button>
                                  </div>
                                )
                              ) : (
                                <span className="text-[10px] text-slate-400 font-bold bg-slate-50 px-2 py-1 rounded-lg border border-slate-100/60">
                                  সম্পন্ন (Done)
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}

          {activeSubTab === "ledger" && (
            <>
              {/* Filtering Control Panel */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-extrabold text-slate-700 tracking-wider uppercase flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                লেনদেন ফিল্টারিং ও অনুসন্ধান
              </h3>
              <button
                onClick={resetFilters}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-2.5 py-1 rounded-lg hover:underline cursor-pointer"
              >
                ফিল্টার রিসেট
              </button>
            </div>

            {/* Grid of filtering dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              {/* Member filter (Admin/Company only) */}
              {isAdminOrCompany ? (
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">সদস্য নির্বাচন</label>
                  <select
                    value={filterUser}
                    onChange={(e) => setFilterUser(e.target.value)}
                    className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                  >
                    <option value="all">সকল সদস্য (All Members)</option>
                    {activeCompanyMembers.map((member) => (
                      <option key={member.docId} value={member.docId}>
                        {member.name} ({member.accountType === "saving" ? "সঞ্চয়ী" : "বিজনেস"})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">সদস্য</label>
                  <div className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-100 text-slate-500 flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5" />
                    {currentUser.name} (আপনি)
                  </div>
                </div>
              )}

              {/* Flow filter */}
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">লেনদেনের ধরণ (Flow)</label>
                <select
                  value={filterFlow}
                  onChange={(e) => setFilterFlow(e.target.value as any)}
                  className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                >
                  <option value="all">সব ফ্লো (All In/Out)</option>
                  <option value="IN">শুধুমাত্র ইন (IN / জমা)</option>
                  <option value="OUT">শুধুমাত্র আউট (OUT / খরচ ও উত্তোলন)</option>
                </select>
              </div>

              {/* Category filter */}
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">ক্যাটাগরি</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                >
                  <option value="all">সব ক্যাটাগরি</option>
                  <option value="saving">সঞ্চয় জমা ও উত্তোলন</option>
                  <option value="project_expense">শেয়ার প্রজেক্ট খরচ</option>
                  <option value="project_sale">শেয়ার বিক্রয় আয়</option>
                  <option value="installment_income">শেয়ার কিস্তি আদায়</option>
                </select>
              </div>

              {/* Date From */}
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">তারিখ হতে (From)</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">তারিখ পর্যন্ত (To)</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                />
              </div>
            </div>

            {/* Search Input bar */}
            <div className="relative pt-1">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none mt-1">
                <Search className="h-4 w-4 text-slate-400" />
              </span>
              <input
                type="text"
                placeholder="সদস্য নাম, বিবরণ, মোবাইল নম্বর, ট্রানজেকশন আইডি বা ব্যাংকের নাম লিখে সার্চ করুন..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-xs font-medium bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white text-slate-700 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center mt-1"
                >
                  <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>
          </div>

          {/* Transactions Table Section */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-slate-50/50">
              <h2 className="text-xs font-extrabold text-slate-700 tracking-wider uppercase">
                লেনদেন খাতা তালিকা ({filteredLedger.length} টি)
              </h2>
              <div className="text-[11px] font-bold text-slate-400">
                তারিখের ক্রমানুসারে সাজানো (সর্বশেষ আগে)
              </div>
            </div>

            {filteredLedger.length === 0 ? (
              <div className="p-16 text-center text-slate-400">
                <div className="w-16 h-16 bg-slate-50 border border-slate-100 text-slate-300 flex items-center justify-center rounded-full mx-auto mb-4">
                  <ArrowLeftRight className="w-7 h-7" />
                </div>
                <p className="text-sm font-bold text-slate-600">কোন লেনদেন রেকর্ড পাওয়া যায়নি</p>
                <p className="text-xs text-slate-400 mt-1">ফিল্টারিং পরিবর্তন করে পুনরায় চেষ্টা করুন</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-max w-full text-left text-xs divide-y divide-slate-100">
                  <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase tracking-wider font-extrabold">
                    <tr>
                      <th className="p-4">তারিখ</th>
                      <th className="p-4">সদস্যের নাম</th>
                      <th className="p-4">ক্যাটাগরি</th>
                      <th className="p-4">বিবরণ / লেনদেন আইডি</th>
                      <th className="p-4">সংশ্লিষ্ট প্রজেক্ট</th>
                      <th className="p-4 text-center">ফ্লো</th>
                      <th className="p-4 text-right">পরিমাণ (৳)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLedger.map((item) => {
                      const isFlowIn = item.flow === "IN";
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition font-sans">
                          {/* Date */}
                          <td className="p-4 font-mono font-bold text-slate-500 text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-300" />
                              {item.date}
                            </div>
                          </td>

                          {/* Member Name */}
                          <td className="p-4 font-extrabold text-slate-800 text-[12px]">
                            {item.userName}
                          </td>

                          {/* Category with badge styling */}
                          <td className="p-4">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-tight ${
                              item.type === "saving" 
                                ? "bg-blue-50 text-blue-700 border border-blue-100"
                                : item.type === "saving_withdraw"
                                ? "bg-amber-50 text-amber-700 border border-amber-100"
                                : item.type === "project_expense"
                                ? "bg-rose-50 text-rose-700 border border-rose-100"
                                : item.type === "project_sale"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                : "bg-purple-50 text-purple-700 border border-purple-100"
                            }`}>
                              {item.typeLabel}
                            </span>
                          </td>

                          {/* Memo Description */}
                          <td className="p-4 text-slate-600 font-semibold max-w-sm whitespace-normal break-words text-[11px]">
                            {item.memo}
                          </td>

                          {/* Project Name */}
                          <td className="p-4 text-slate-500 font-bold text-[11px]">
                            {item.projectName}
                          </td>

                          {/* Flow Direction Indicator Badge */}
                          <td className="p-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-black text-[10px] uppercase tracking-wider ${
                              isFlowIn 
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}>
                              {isFlowIn ? (
                                <>
                                  <TrendingUp className="w-3 h-3" />
                                  IN
                                </>
                              ) : (
                                <>
                                  <TrendingDown className="w-3 h-3" />
                                  OUT
                                </>
                              )}
                            </span>
                          </td>

                          {/* Amount */}
                          <td className={`p-4 text-right font-black text-[13px] ${
                            isFlowIn ? "text-emerald-600" : "text-rose-600"
                          }`}>
                            {isFlowIn ? "+" : "-"}৳{formatNum(item.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </>
          )}

          {activeSubTab === "submit" && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden max-w-2xl mx-auto animate-fadeIn">
              {/* Card header */}
              <div className="bg-indigo-600 text-white px-6 py-5">
                <h3 className="text-md sm:text-lg font-black flex items-center gap-2">
                  <Coins className="w-5 h-5" />
                  নতুন মোবাইল/ব্যাংক লেনদেন রিকোয়েস্ট পাঠান (Submit Cash In/Out)
                </h3>
                <p className="text-[10px] text-indigo-100 font-bold mt-1">
                  ব্যাংক বা মোবাইল ব্যাংকিং (বিকাশ/নগদ) ব্যবহার করে সেভিংস ডিপোজিট বা কিস্তি পরিশোধ করুন, অথবা ক্যাশ-আউট রিকোয়েস্ট পাঠান
                </p>
              </div>

              {/* Form body */}
              <form onSubmit={handleCreateTransaction} className="p-6 space-y-5">
                {/* Flow Tab selector: CASH IN or CASH OUT */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">লেনদেনের ধরণ (Transaction Mode)</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => handleFlowToggle("IN")}
                      className={`py-2 text-xs font-black rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        trxFlow === "IN"
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <TrendingUp className="w-4 h-4" />
                      ক্যাশ-ইন (টাকা জমা)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFlowToggle("OUT")}
                      className={`py-2 text-xs font-black rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        trxFlow === "OUT"
                          ? "bg-rose-600 text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <TrendingDown className="w-4 h-4" />
                      ক্যাশ-আউট (উত্তোলন)
                    </button>
                  </div>
                </div>

                {/* Grid: User selector & Subcategory Purpose */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Member selection */}
                  {isAdminOrCompany ? (
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">সদস্য নির্বাচন করুন</label>
                      <select
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        required
                        className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                      >
                        <option value="">-- সদস্য সিলেক্ট করুন --</option>
                        {activeCompanyMembers.map((member) => (
                          <option key={member.docId} value={member.docId}>
                            {member.name} (সেভিংস: ৳{formatNum(member.savingsBalance !== undefined ? member.savingsBalance : (member.amount || 0))} | ইনকাম: ৳{formatNum(member.incomeBalance || 0)})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">সদস্য (আপনি)</label>
                      <div className="w-full text-xs font-black border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-100 text-slate-500 flex items-center gap-1.5">
                        <UserIcon className="w-3.5 h-3.5" />
                        {currentUser.name} (সেভিংস: ৳{formatNum(currentUser.savingsBalance !== undefined ? currentUser.savingsBalance : (currentUser.amount || 0))} | ইনকাম: ৳{formatNum(currentUser.incomeBalance || 0)})
                      </div>
                    </div>
                  )}

                  {/* Sub category Selector */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">উদ্দেশ্য / ক্যাটাগরি</label>
                    {trxFlow === "OUT" ? (
                      <div className="w-full text-xs font-black border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-100 text-slate-500 flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5" />
                        সেভিংস ফান্ড উত্তোলন
                      </div>
                    ) : (
                      <select
                        value={trxType}
                        onChange={(e) => setTrxType(e.target.value as any)}
                        required
                        className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                      >
                        <option value="saving">সাধারণ সেভিংস / সঞ্চয় জমা</option>
                        <option value="installment">গ্রাহক কিস্তি পরিশোধ</option>
                      </select>
                    )}
                  </div>
                </div>

                {/* Installment selection dropdown if Cash In + Installment selected */}
                {trxFlow === "IN" && trxType === "installment" && (
                  <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-2xl space-y-2">
                    <label className="block text-[10px] font-black text-purple-700 uppercase tracking-wider">পরিশোধযোগ্য কিস্তি চুক্তি</label>
                    {selectedUserInstallments.length > 0 ? (
                      <select
                        value={selectedInstallmentId}
                        onChange={(e) => setSelectedInstallmentId(e.target.value)}
                        required
                        className="w-full text-xs font-extrabold border border-purple-200 rounded-xl px-3 py-2 bg-white text-purple-900 outline-none focus:ring-2 focus:ring-purple-100 transition"
                      >
                        <option value="">-- কিস্তি চুক্তি নির্বাচন করুন --</option>
                        {selectedUserInstallments.map((inst) => (
                          <option key={inst.id} value={inst.id}>
                            {inst.productName} (বকেয়া কিস্তিঃ ৳{formatNum(inst.dueAmount)})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-[11px] font-bold text-rose-600 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        নির্বাচিত সদস্যের কোন বকেয়া কিস্তি চুক্তি পাওয়া যায়নি। সঞ্চয় জমা করুন।
                      </div>
                    )}
                  </div>
                )}

                {/* Amount & Date Picker Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Amount field */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">টাকার পরিমাণ (Amount ৳)</label>
                    <input
                      type="number"
                      value={trxAmount}
                      onChange={(e) => setTrxAmount(e.target.value)}
                      placeholder="পরিমাণ (৳)"
                      required
                      min="1"
                      className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                    />
                  </div>

                  {/* Date field */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">তারিখ (Date)</label>
                    <input
                      type="date"
                      value={trxDate}
                      onChange={(e) => setTrxDate(e.target.value)}
                      required
                      className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                    />
                  </div>
                </div>

                {/* PAYMENT METHDOLODY SELECTOR (Mobile Banking, Bank, or Cash) */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">লেনদেন মাধ্যম (Payment Method)</label>
                  <div className={`grid ${trxFlow === "OUT" ? "grid-cols-3" : "grid-cols-2"} gap-2.5`}>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("mobile_banking")}
                      className={`py-3 px-2 sm:px-4 border text-[11px] font-black rounded-2xl flex items-center gap-1.5 justify-center transition cursor-pointer ${
                        paymentMethod === "mobile_banking"
                          ? "border-indigo-600 bg-indigo-50/50 text-indigo-700 font-extrabold"
                          : "border-slate-200 hover:border-slate-300 text-slate-600"
                      }`}
                    >
                      <Smartphone className="w-4 h-4 text-indigo-500" />
                      মোবাইল ব্যাংকিং
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("bank")}
                      className={`py-3 px-2 sm:px-4 border text-[11px] font-black rounded-2xl flex items-center gap-1.5 justify-center transition cursor-pointer ${
                        paymentMethod === "bank"
                          ? "border-indigo-600 bg-indigo-50/50 text-indigo-700 font-extrabold"
                          : "border-slate-200 hover:border-slate-300 text-slate-600"
                      }`}
                    >
                      <CreditCard className="w-4 h-4 text-indigo-500" />
                      ব্যাংক ট্রান্সফার
                    </button>
                    {trxFlow === "OUT" && (
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("cash")}
                        className={`py-3 px-2 sm:px-4 border text-[11px] font-black rounded-2xl flex items-center gap-1.5 justify-center transition cursor-pointer ${
                          paymentMethod === "cash"
                            ? "border-indigo-600 bg-indigo-50/50 text-indigo-700 font-extrabold"
                            : "border-slate-200 hover:border-slate-300 text-slate-600"
                        }`}
                      >
                        <Coins className="w-4 h-4 text-indigo-500" />
                        ক্যাশ লেন
                      </button>
                    )}
                  </div>
                </div>

                {/* DISPLAY COMPANY ACCOUNTS FOR SENDING MONEY */}
                {trxFlow === "IN" && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-1.5 text-amber-800 font-extrabold text-xs">
                      <Info className="w-4 h-4 text-amber-600 shrink-0" />
                      আমাদের একাউন্ট সমূহে টাকা পাঠান (Send Money to our accounts)
                    </div>
                    <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
                      নিচের যেকোনো একটি সক্রিয় একাউন্টে আপনার টাকা পাঠিয়ে প্রমাণ স্বরূপ ট্রানজেকশন আইডি এবং হিসাব নম্বরটি নিচের ফর্মে প্রদান করুন।
                    </p>

                    <div className="space-y-2">
                      {companyAccounts
                        .filter((acc) => acc.companyId === targetCompanyId && acc.type === (paymentMethod === "cash" ? "mobile_banking" : paymentMethod) && acc.isActive)
                        .map((acc) => (
                          <div key={acc.id} className="bg-white border border-slate-100 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase ${
                                  acc.type === "mobile_banking" ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"
                                }`}>
                                  {acc.providerName}
                                </span>
                                {acc.accountType && (
                                  <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-1 rounded">
                                    {acc.accountType}
                                  </span>
                                )}
                                {acc.accountName && (
                                  <span className="text-[10px] font-extrabold text-slate-500">
                                    ({acc.accountName})
                                  </span>
                                )}
                              </div>
                              <div className="text-xs font-black text-slate-700 select-all tracking-wide flex items-center gap-1">
                                {acc.accountNumber}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(acc.accountNumber);
                                setCopiedAccountId(acc.id);
                                setTimeout(() => setCopiedAccountId(null), 1500);
                              }}
                              className="px-2.5 py-1.5 border border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/30 text-slate-600 hover:text-indigo-600 rounded-lg text-[10px] font-black transition flex items-center gap-1 cursor-pointer self-start sm:self-center"
                            >
                              {copiedAccountId === acc.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  কপি হয়েছে
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 animate-pulse" />
                                  নম্বর কপি করুন
                                </>
                              )}
                            </button>
                          </div>
                        ))}

                      {companyAccounts.filter((acc) => acc.companyId === targetCompanyId && acc.type === (paymentMethod === "cash" ? "mobile_banking" : paymentMethod) && acc.isActive).length === 0 && (
                        <div className="text-center py-4 text-[11px] font-black text-slate-400 border border-dashed border-slate-200 rounded-xl">
                          কোনো সক্রিয় {paymentMethod === "mobile_banking" ? "মোবাইল ব্যাংকিং" : "ব্যাংক"} একাউন্ট পাওয়া যায়নি।
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* CONDITIONAL PAYMENT DETAILS FORMS */}
                {paymentMethod === "mobile_banking" && (
                  <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3.5 animate-fadeIn">
                    <div className="flex gap-2">
                      {["bkash", "nagad", "rocket", "upay"].map((provider) => (
                        <button
                          key={provider}
                          type="button"
                          onClick={() => setMobileProvider(provider as any)}
                          className={`flex-1 py-1 px-2 text-[10px] font-black uppercase rounded-lg border transition cursor-pointer ${
                            mobileProvider === provider
                              ? "bg-pink-100 border-pink-400 text-pink-700 font-black shadow-2xs"
                              : "bg-white border-slate-200 text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {provider === "bkash" ? "bKash" : provider === "nagad" ? "Nagad" : provider === "rocket" ? "Rocket" : "Upay"}
                        </button>
                      ))}
                    </div>

                    <div className={`grid grid-cols-1 ${trxFlow === "IN" ? "sm:grid-cols-2" : ""} gap-3`}>
                      <div>
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          {trxFlow === "IN" ? "আপনার একাউন্ট নম্বর (Your Mobile No)" : "যে নম্বরে টাকা নিবেন (Mobile No to Receive)"}
                        </label>
                        <input
                          type="tel"
                          value={mobileAccountNo}
                          onChange={(e) => setMobileAccountNo(e.target.value)}
                          placeholder="017XXXXXXXX"
                          required
                          className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-2.5 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                        />
                      </div>
                      {trxFlow === "IN" && (
                        <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">ট্রানজেকশন আইডি (TxID)</label>
                          <input
                            type="text"
                            value={mobileTrxId}
                            onChange={(e) => setMobileTrxId(e.target.value)}
                            placeholder="যেমন: AX9K2H7F"
                            required={trxFlow === "IN"}
                            className="w-full text-xs font-mono font-extrabold border border-slate-200 rounded-xl px-2.5 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {paymentMethod === "bank" && (
                  <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3.5 animate-fadeIn">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">ব্যাংকের নাম (Bank Name)</label>
                        <select
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-2.5 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                        >
                          <option value="Dutch-Bangla Bank">Dutch-Bangla Bank</option>
                          <option value="Islami Bank Bangladesh">Islami Bank Bangladesh</option>
                          <option value="BRAC Bank">BRAC Bank</option>
                          <option value="Sonali Bank">Sonali Bank</option>
                          <option value="The City Bank">The City Bank</option>
                          <option value="Mutual Trust Bank">Mutual Trust Bank</option>
                          <option value="Other Bank">অন্যান্য ব্যাংক</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">শাখার নাম (Branch)</label>
                        <input
                          type="text"
                          value={bankBranch}
                          onChange={(e) => setBankBranch(e.target.value)}
                          placeholder="যেমন: মতিঝিল শাখা"
                          className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-2.5 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                        />
                      </div>
                    </div>

                    <div className={`grid grid-cols-1 ${trxFlow === "IN" ? "sm:grid-cols-2" : ""} gap-3`}>
                      <div>
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          {trxFlow === "IN" ? "ব্যাংক হিসাব নম্বর (Account No)" : "টাকা গ্রহণের ব্যাংক হিসাব নম্বর (Account No to Receive)"}
                        </label>
                        <input
                          type="text"
                          value={bankAccountNo}
                          onChange={(e) => setBankAccountNo(e.target.value)}
                          placeholder="হিসাব নম্বর লিখুন"
                          required
                          className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-2.5 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                        />
                      </div>
                      {trxFlow === "IN" && (
                        <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">রেফারেন্স / স্লিপ আইডি (Ref No)</label>
                          <input
                            type="text"
                            value={bankTrxId}
                            onChange={(e) => setBankTrxId(e.target.value)}
                            placeholder="যেমন: SLIP-7389"
                            required={trxFlow === "IN"}
                            className="w-full text-xs font-mono font-extrabold border border-slate-200 rounded-xl px-2.5 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {paymentMethod === "cash" && trxFlow === "OUT" && (
                  <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex gap-3 animate-fadeIn">
                    <CheckSquare className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black text-emerald-800">ক্যাশ উত্তোলনের মাধ্যম (Hand-to-Hand Cash)</h4>
                      <p className="text-[10px] text-emerald-700 font-bold leading-relaxed mt-1">
                        ক্যাশ উত্তোলনের ক্ষেত্রে সরাসরি কোম্পানির শাখা বা এজেন্টের মাধ্যমে আপনাকে টাকা প্রদান করা হবে। এক্ষেত্রে কোনো ব্যাংক হিসাব বা মোবাইল একাউন্ট নম্বর সাবমিট করার প্রয়োজন নেই।
                      </p>
                    </div>
                  </div>
                )}

                {/* Memo / Description */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">মন্তব্য / মেমো (Memo / Note)</label>
                  <textarea
                    value={trxMemo}
                    onChange={(e) => setTrxMemo(e.target.value)}
                    placeholder="লেনদেনের অতিরিক্ত বিবরণ বা মেমো এখানে লিখুন..."
                    rows={2}
                    className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition resize-none"
                  />
                </div>

                {/* Toast Message inside Page Form */}
                {toastMsg && (
                  <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2.5 ${
                    toastMsg.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-100 animate-fadeIn"
                      : "bg-rose-50 text-rose-800 border border-rose-100 animate-shake"
                  }`}>
                    {toastMsg.type === "success" ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    )}
                    <span>{toastMsg.text}</span>
                  </div>
                )}

                {/* Submit button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting || (trxFlow === "IN" && trxType === "installment" && !selectedInstallmentId)}
                    className={`w-full py-3.5 text-white rounded-2xl text-xs font-black transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer ${
                      submitting || (trxFlow === "IN" && trxType === "installment" && !selectedInstallmentId)
                        ? "bg-slate-300 cursor-not-allowed"
                        : trxFlow === "OUT"
                        ? "bg-rose-600 hover:bg-rose-700"
                        : "bg-indigo-600 hover:bg-indigo-700"
                    }`}
                  >
                    {submitting ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : trxFlow === "OUT" ? (
                      "ক্যাশ-আউট রিকোয়েস্ট পাঠান"
                    ) : (
                      "ক্যাশ-ইন রিকোয়েস্ট পাঠান"
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeSubTab === "settings" && (
            <div className="space-y-6 animate-fadeIn">
              {/* ADMIN/COMPANY ONLY: Add Account Form */}
              {isAdminOrCompany && (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden max-w-2xl mx-auto">
                  <div className="bg-indigo-600 text-white px-6 py-4">
                    <h3 className="text-sm sm:text-md font-black flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      নতুন পেমেন্ট অ্যাকাউন্ট যুক্ত করুন (Add Payment Account)
                    </h3>
                    <p className="text-[10px] text-indigo-100 font-bold mt-0.5">
                      মেম্বারদের ক্যাশ-ইন করার সুবিধার জন্য বিকাশ, নগদ বা ব্যাংক একাউন্ট যুক্ত করে রাখুন
                    </p>
                  </div>

                  <form onSubmit={handleAddCompanyAccount} className="p-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Account Type Selector */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">অ্যাকাউন্টের ধরণ</label>
                        <select
                          value={newAccType}
                          onChange={(e) => {
                            const val = e.target.value as "mobile_banking" | "bank";
                            setNewAccType(val);
                            setNewAccProvider(val === "mobile_banking" ? "bKash" : "Dutch-Bangla Bank");
                            setNewAccTypeLabel(val === "mobile_banking" ? "Personal" : "Savings");
                          }}
                          className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                        >
                          <option value="mobile_banking">মোবাইল ব্যাংকিং</option>
                          <option value="bank">ব্যাংক একাউন্ট</option>
                        </select>
                      </div>

                      {/* Provider Selection */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">প্রদানকারী (Provider Name)</label>
                        {newAccType === "mobile_banking" ? (
                          <select
                            value={newAccProvider}
                            onChange={(e) => setNewAccProvider(e.target.value)}
                            className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                          >
                            <option value="bKash">bKash</option>
                            <option value="Nagad">Nagad</option>
                            <option value="Rocket">Rocket</option>
                            <option value="Upay">Upay</option>
                          </select>
                        ) : (
                          <select
                            value={newAccProvider}
                            onChange={(e) => setNewAccProvider(e.target.value)}
                            className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                          >
                            <option value="Dutch-Bangla Bank">Dutch-Bangla Bank</option>
                            <option value="Islami Bank Bangladesh">Islami Bank Bangladesh</option>
                            <option value="BRAC Bank">BRAC Bank</option>
                            <option value="Sonali Bank">Sonali Bank</option>
                            <option value="The City Bank">The City Bank</option>
                            <option value="Mutual Trust Bank">Mutual Trust Bank</option>
                            <option value="Other Bank">অন্যান্য ব্যাংক</option>
                          </select>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Account Number */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">অ্যাকাউন্ট নম্বর</label>
                        <input
                          type="text"
                          value={newAccNumber}
                          onChange={(e) => setNewAccNumber(e.target.value)}
                          placeholder={newAccType === "mobile_banking" ? "যেমন: 017XXXXXXXX" : "ব্যাংক অ্যাকাউন্ট নম্বর"}
                          required
                          className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                        />
                      </div>

                      {/* Account Type Label (Personal/Agent/Branch) */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                          {newAccType === "mobile_banking" ? "প্রকার (যেমনঃ Personal/Merchant/Agent)" : "শাখার নাম (Branch)"}
                        </label>
                        <input
                          type="text"
                          value={newAccTypeLabel}
                          onChange={(e) => setNewAccTypeLabel(e.target.value)}
                          placeholder={newAccType === "mobile_banking" ? "Personal, Agent, Merchant" : "যেমন: মতিঝিল শাখা"}
                          className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                        />
                      </div>
                    </div>

                    {/* Account Name */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">হিসাবের নাম (Account Holder Name)</label>
                      <input
                        type="text"
                        value={newAccHolderName}
                        onChange={(e) => setNewAccHolderName(e.target.value)}
                        placeholder="যেমন: রহিম এন্টারপ্রাইজ / জনাব ফয়সাল"
                        className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                      />
                    </div>

                    {/* Toast Alert Inside form if active */}
                    {toastMsg && (
                      <div className="p-3.5 bg-indigo-50 border border-indigo-100 text-indigo-800 text-xs font-bold rounded-xl flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                        <span>{toastMsg.text}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {submitting ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        "সংরক্ষণ করুন (Save Account)"
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* LIST OF SAVED PAYMENTS */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden max-w-4xl mx-auto p-6 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm sm:text-md font-black text-slate-800">কোম্পানি পেমেন্ট অ্যাকাউন্টস তালিকা</h3>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">সব ধরনের মোবাইল ব্যাংকিং ও ব্যাংক ট্রান্সফারের ঠিকানা সমূহের বিবরণ</p>
                  </div>
                  <span className="bg-indigo-50 text-indigo-700 font-black text-[10px] px-2.5 py-1 rounded-full border border-indigo-100">
                    মোট সক্রিয় অ্যাকাউন্টঃ {companyAccounts.filter(a => a.companyId === targetCompanyId && a.isActive).length} টি
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {companyAccounts
                    .filter((acc) => acc.companyId === targetCompanyId)
                    .map((acc) => (
                      <div
                        key={acc.id}
                        className={`p-4 border rounded-2xl space-y-3 transition relative flex flex-col justify-between ${
                          acc.isActive 
                            ? "border-slate-200/80 bg-slate-50/50 hover:bg-white hover:shadow-xs" 
                            : "border-slate-100 bg-slate-100/30 text-slate-400"
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                              acc.type === "mobile_banking" 
                                ? "bg-pink-100 text-pink-700" 
                                : "bg-blue-100 text-blue-700"
                            }`}>
                              {acc.providerName}
                            </span>
                            
                            {!acc.isActive && (
                              <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                নিষ্ক্রিয় (Inactive)
                              </span>
                            )}
                          </div>

                          <div className="space-y-1">
                            <p className="text-[10px] text-slate-400 font-bold">অ্যাকাউন্ট নম্বরঃ</p>
                            <p className={`text-sm font-black tracking-wide ${acc.isActive ? "text-slate-800" : "text-slate-500"}`}>
                              {acc.accountNumber}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500 border-t border-dashed border-slate-200/60 pt-2">
                            <div>
                              <span className="text-slate-400">ধরন / শাখাঃ</span> <br />
                              <span className="font-extrabold text-slate-700">{acc.accountType || "N/A"}</span>
                            </div>
                            <div>
                              <span className="text-slate-400">হিসাবের নামঃ</span> <br />
                              <span className="font-extrabold text-slate-700">{acc.accountName || "N/A"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Action controllers */}
                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 mt-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(acc.accountNumber);
                              setCopiedAccountId(acc.id);
                              setTimeout(() => setCopiedAccountId(null), 1500);
                            }}
                            className="mr-auto px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
                          >
                            {copiedAccountId === acc.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                কপি হয়েছে
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                কপি করুন
                              </>
                            )}
                          </button>

                          {isAdminOrCompany && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleAccountStatus(acc.id, acc.isActive)}
                                className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition border cursor-pointer ${
                                  acc.isActive
                                    ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                                    : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                }`}
                              >
                                {acc.isActive ? "নিষ্ক্রিয় করুন" : "সক্রিয় করুন"}
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => handleDeleteCompanyAccount(acc.id)}
                                className="p-1 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg cursor-pointer transition"
                                title="মুছে ফেলুন"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}

                  {companyAccounts.filter(a => a.companyId === targetCompanyId).length === 0 && (
                    <div className="col-span-full text-center py-8 text-slate-400 font-extrabold text-xs border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                      কোনো পেমেন্ট অ্যাকাউন্ট যুক্ত করা হয়নি।
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* NEW TRANSACTION DIALOG MODAL */}
      {showTrxModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative bg-white rounded-3xl w-full max-w-xl shadow-xl overflow-hidden animate-scaleUp">
            {/* Modal header */}
            <div className="bg-indigo-600 text-white px-6 py-5 flex items-center justify-between">
              <div>
                <h3 className="text-md sm:text-lg font-black flex items-center gap-2">
                  <Coins className="w-5 h-5" />
                  নতুন মোবাইল/ব্যাংক লেনদেন করুন
                </h3>
                <p className="text-[10px] text-indigo-100 font-bold mt-1">
                  ব্যাংক বা মোবাইল ব্যাংকিং দিয়ে ক্যাশ-ইন ও ক্যাশ-আউট করুন
                </p>
              </div>
              <button
                onClick={() => {
                  setShowTrxModal(false);
                  setToastMsg(null);
                }}
                className="p-1.5 hover:bg-white/10 rounded-lg text-white transition shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body & Form */}
            <form onSubmit={handleCreateTransaction} className="p-6 space-y-5">
              {/* Flow Tab selector: CASH IN or CASH OUT */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">লেনদেনের ধরণ (Transaction Mode)</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => handleFlowToggle("IN")}
                    className={`py-2 text-xs font-black rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      trxFlow === "IN"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    ক্যাশ-ইন (টাকা জমা)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFlowToggle("OUT")}
                    className={`py-2 text-xs font-black rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      trxFlow === "OUT"
                        ? "bg-rose-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <TrendingDown className="w-4 h-4" />
                    ক্যাশ-আউট (উত্তোলন)
                  </button>
                </div>
              </div>

              {/* Grid: User selector & Subcategory Purpose */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Member selection */}
                {isAdminOrCompany ? (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">সদস্য নির্বাচন করুন</label>
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      required
                      className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                    >
                      <option value="">-- সদস্য সিলেক্ট করুন --</option>
                      {activeCompanyMembers.map((member) => (
                        <option key={member.docId} value={member.docId}>
                          {member.name} (সেভিংস: ৳{formatNum(member.savingsBalance !== undefined ? member.savingsBalance : (member.amount || 0))} | ইনকাম: ৳{formatNum(member.incomeBalance || 0)})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">সদস্য (আপনি)</label>
                    <div className="w-full text-xs font-black border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-100 text-slate-500 flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5" />
                      {currentUser.name} (সেভিংস: ৳{formatNum(currentUser.savingsBalance !== undefined ? currentUser.savingsBalance : (currentUser.amount || 0))} | ইনকাম: ৳{formatNum(currentUser.incomeBalance || 0)})
                    </div>
                  </div>
                )}

                {/* Sub category Selector (Depositing savings vs installment) */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">উদ্দেশ্য / ক্যাটাগরি</label>
                  {trxFlow === "OUT" ? (
                    <div className="w-full text-xs font-black border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-100 text-slate-500 flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5" />
                      সেভিংস ফান্ড উত্তোলন
                    </div>
                  ) : (
                    <select
                      value={trxType}
                      onChange={(e) => setTrxType(e.target.value as any)}
                      required
                      className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                    >
                      <option value="saving">সাধারণ সেভিংস / সঞ্চয় জমা</option>
                      <option value="installment">গ্রাহক কিস্তি পরিশোধ</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Installment selection dropdown if Cash In + Installment selected */}
              {trxFlow === "IN" && trxType === "installment" && (
                <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-2xl space-y-2">
                  <label className="block text-[10px] font-black text-purple-700 uppercase tracking-wider">পরিশোধযোগ্য কিস্তি চুক্তি</label>
                  {selectedUserInstallments.length > 0 ? (
                    <select
                      value={selectedInstallmentId}
                      onChange={(e) => setSelectedInstallmentId(e.target.value)}
                      required
                      className="w-full text-xs font-extrabold border border-purple-200 rounded-xl px-3 py-2 bg-white text-purple-900 outline-none focus:ring-2 focus:ring-purple-100 transition"
                    >
                      {selectedUserInstallments.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.productName} (বকেয়া কিস্তিঃ ৳{formatNum(inst.dueAmount)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-[11px] font-bold text-rose-600 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      নির্বাচিত সদস্যের কোন বকেয়া কিস্তি চুক্তি পাওয়া যায়নি। সঞ্চয় জমা করুন।
                    </div>
                  )}
                </div>
              )}

              {/* Amount & Date Picker Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Amount field */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">টাকার পরিমাণ (Amount ৳)</label>
                  <input
                    type="number"
                    value={trxAmount}
                    onChange={(e) => setTrxAmount(e.target.value)}
                    placeholder="পরিমাণ (৳)"
                    required
                    min="1"
                    className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                  />
                </div>

                {/* Date field */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">তারিখ (Date)</label>
                  <input
                    type="date"
                    value={trxDate}
                    onChange={(e) => setTrxDate(e.target.value)}
                    required
                    className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
                  />
                </div>
              </div>

              {/* PAYMENT METHDOLODY SELECTOR (Mobile Banking or Bank) */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">লেনদেন মাধ্যম (Payment Method)</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("mobile_banking")}
                    className={`py-3 px-4 border text-xs font-black rounded-2xl flex items-center gap-2 justify-center transition cursor-pointer ${
                      paymentMethod === "mobile_banking"
                        ? "border-indigo-600 bg-indigo-50/50 text-indigo-700 font-extrabold"
                        : "border-slate-200 hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-indigo-500" />
                    মোবাইল ব্যাংকিং (বিকাশ/নগদ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("bank")}
                    className={`py-3 px-4 border text-xs font-black rounded-2xl flex items-center gap-2 justify-center transition cursor-pointer ${
                      paymentMethod === "bank"
                        ? "border-indigo-600 bg-indigo-50/50 text-indigo-700 font-extrabold"
                        : "border-slate-200 hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-indigo-500" />
                    ব্যাংক ট্রান্সফার
                  </button>
                </div>
              </div>

              {/* MOBILE BANKING DETAILS FORM */}
              {paymentMethod === "mobile_banking" ? (
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3.5">
                  <div className="flex gap-2">
                    {/* Providers */}
                    {["bkash", "nagad", "rocket", "upay"].map((provider) => (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => setMobileProvider(provider as any)}
                        className={`flex-1 py-1 px-2 text-[10px] font-black uppercase rounded-lg border transition cursor-pointer ${
                          mobileProvider === provider
                            ? "bg-pink-100 border-pink-400 text-pink-700 font-black shadow-2xs"
                            : "bg-white border-slate-200 text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {provider === "bkash" ? "bKash" : provider === "nagad" ? "Nagad" : provider === "rocket" ? "Rocket" : "Upay"}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Mobile Account No */}
                    <div>
                      <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">একাউন্ট নম্বর (Mobile Number)</label>
                      <input
                        type="tel"
                        value={mobileAccountNo}
                        onChange={(e) => setMobileAccountNo(e.target.value)}
                        placeholder="017XXXXXXXX"
                        className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-2.5 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                      />
                    </div>
                    {/* Transaction ID */}
                    <div>
                      <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">ট্রানজেকশন আইডি (TxID)</label>
                      <input
                        type="text"
                        value={mobileTrxId}
                        onChange={(e) => setMobileTrxId(e.target.value)}
                        placeholder="e.g. AX9K2H7F"
                        className="w-full text-xs font-mono font-extrabold border border-slate-200 rounded-xl px-2.5 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* BANK TRANSFER DETAILS FORM */
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Bank name select */}
                    <div>
                      <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">ব্যাংকের নাম (Bank Name)</label>
                      <select
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-2.5 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                      >
                        <option value="Dutch-Bangla Bank">Dutch-Bangla Bank</option>
                        <option value="Islami Bank Bangladesh">Islami Bank Bangladesh</option>
                        <option value="BRAC Bank">BRAC Bank</option>
                        <option value="Sonali Bank">Sonali Bank</option>
                        <option value="The City Bank">The City Bank</option>
                        <option value="Mutual Trust Bank">Mutual Trust Bank</option>
                        <option value="Other Bank">অন্যান্য ব্যাংক</option>
                      </select>
                    </div>

                    {/* Branch Name */}
                    <div>
                      <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">শাখার নাম (Branch)</label>
                      <input
                        type="text"
                        value={bankBranch}
                        onChange={(e) => setBankBranch(e.target.value)}
                        placeholder="যেমন: মতিঝিল শাখা"
                        className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-2.5 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Bank Account Number */}
                    <div>
                      <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">ব্যাংক হিসাব নম্বর (Account No)</label>
                      <input
                        type="text"
                        value={bankAccountNo}
                        onChange={(e) => setBankAccountNo(e.target.value)}
                        placeholder="হিসাব নম্বর লিখুন"
                        className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-2.5 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                      />
                    </div>
                    {/* Ref / Trx ID */}
                    <div>
                      <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">রেফারেন্স / স্লিপ আইডি (Ref No)</label>
                      <input
                        type="text"
                        value={bankTrxId}
                        onChange={(e) => setBankTrxId(e.target.value)}
                        placeholder="যেমন: SLIP-7389"
                        className="w-full text-xs font-mono font-extrabold border border-slate-200 rounded-xl px-2.5 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Memo / Description */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">মন্তব্য / মেমো (Memo / Note)</label>
                <textarea
                  value={trxMemo}
                  onChange={(e) => setTrxMemo(e.target.value)}
                  placeholder="লেনদেনের অতিরিক্ত বিবরণ বা মেমো এখানে লিখুন..."
                  rows={2}
                  className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition resize-none"
                />
              </div>

              {/* Toast Message inside Modal */}
              {toastMsg && (
                <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2.5 ${
                  toastMsg.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-100 animate-fadeIn"
                    : "bg-rose-50 text-rose-800 border border-rose-100 animate-shake"
                }`}>
                  {toastMsg.type === "success" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  )}
                  <span>{toastMsg.text}</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowTrxModal(false);
                    setToastMsg(null);
                  }}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-black cursor-pointer transition active:scale-95"
                >
                  বাতিল করুন
                </button>
                <button
                  type="submit"
                  disabled={submitting || (trxFlow === "IN" && trxType === "installment" && !selectedInstallmentId)}
                  className={`flex-2 py-3 text-white rounded-2xl text-xs font-black transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer ${
                    submitting || (trxFlow === "IN" && trxType === "installment" && !selectedInstallmentId)
                      ? "bg-slate-300 cursor-not-allowed"
                      : trxFlow === "OUT"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-indigo-600 hover:bg-indigo-700"
                  }`}
                >
                  {submitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : trxFlow === "OUT" ? (
                    "ক্যাশ-আউট নিশ্চিত করুন"
                  ) : (
                    "ক্যাশ-ইন নিশ্চিত করুন"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
