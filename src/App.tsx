import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, onSnapshot, collectionGroup } from "firebase/firestore";
import { auth, db } from "./firebase";
import { User } from "./types";
import AuthView from "./components/AuthView";
import DashboardView from "./components/DashboardView";
import MemberListView from "./components/MemberListView";
import MemberAddView from "./components/MemberAddView";
import ProfileView from "./components/ProfileView";
import GlobalHeader from "./components/GlobalHeader";
import GlobalSlider from "./components/GlobalSlider";
import ArrearsView from "./components/ArrearsView";
import NotificationsView from "./components/NotificationsView";
import TransactionsView from "./components/TransactionsView";
import { motion, AnimatePresence } from "motion/react";

type RouteView = "login" | "dashboard" | "member-list" | "member-add" | "profile" | "arrears" | "notifications" | "transactions";

export default function App() {
  const [authStateLoading, setAuthStateLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Language selection state (defaults to "bn")
  const [language, setLanguage] = useState<"bn" | "en">(() => {
    return (localStorage.getItem("app_language") as "bn" | "en") || "bn";
  });

  useEffect(() => {
    localStorage.setItem("app_language", language);
  }, [language]);

  // Theme selection state (defaults to "light")
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("app_theme") as "light" | "dark") || "light";
  });

  useEffect(() => {
    localStorage.setItem("app_theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Mobile bottom navigation bar and FAB visibility state
  const [isNavVisible, setIsNavVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      // Hide on scroll down, show on scroll up
      if (currentScrollY > lastScrollY && currentScrollY > 60) {
        setIsNavVisible(false);
      } else {
        setIsNavVisible(true);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  // Router-like state variables
  const [currentView, setCurrentView] = useState<RouteView>("login");
  const [navigationParams, setNavigationParams] = useState<any>(null);

  // Monitor Auth State
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) {
        setCurrentUser(null);
        setCurrentView("login");
        setAuthStateLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Sync user profile document from Firestore
  useEffect(() => {
    if (!firebaseUser) return;

    setAuthStateLoading(true);
    const q = query(collection(db, "users"), where("uid", "==", firebaseUser.uid));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const docData = snapshot.docs[0];
          const u = { docId: docData.id, ...docData.data() } as User;
          setCurrentUser(u);

          // Role & status safety locks
          const isActive = u.status === "active";
          const isAdmin = u.role === "admin";

          if (!isActive && !isAdmin) {
            // Pending/deactive users can only view their own profile
            setCurrentView("profile");
            setNavigationParams(null);
          } else {
            // Active users or Admins default to dashboard if they are coming from login
            setCurrentView((prev) => (prev === "login" ? "dashboard" : prev));
          }
        } else {
          // No profile doc found (could be newly registered/lag)
          setCurrentUser(null);
        }
        setAuthStateLoading(false);
      },
      (error) => {
        console.error("Firestore user monitor error:", error);
        setAuthStateLoading(false);
      }
    );

    return () => unsub();
  }, [firebaseUser]);

  // Subscription system entry counting
  const [totalEntries, setTotalEntries] = useState(0);

  useEffect(() => {
    if (!currentUser) {
      setTotalEntries(0);
      return;
    }

    const companyId = currentUser.role === "company" ? currentUser.docId : (currentUser.companyId || "");
    if (!companyId) {
      setTotalEntries(0);
      return;
    }

    let usersList: any[] = [];
    let projectsList: any[] = [];
    let installmentsCount = 0;
    let latestLedgerCount = 0;
    let latestHistories: any[] = [];

    const computeTotal = (uList: any[], pList: any[], iCount: number, lCount: number, hList: any[]) => {
      const companyMemberIds = new Set(
        uList.filter((u) => u.role === "member" && u.companyId === companyId).map((u) => u.docId)
      );
      const mCount = companyMemberIds.size;
      const projCount = pList.filter((p) => p.companyId === companyId).length;
      const histCount = hList.filter((h) => companyMemberIds.has(h.userDocId)).length;

      const total = mCount + projCount + iCount + histCount + lCount;
      setTotalEntries(total);
    };

    // Role-based Users Query
    const userQuery = currentUser.role === "admin"
      ? collection(db, "users")
      : query(collection(db, "users"), where("companyId", "==", companyId));

    const unsubUsers = onSnapshot(userQuery, (snap) => {
      usersList = [];
      snap.forEach((d) => {
        usersList.push({ docId: d.id, ...d.data() });
      });
      if (currentUser.role === "company" && !usersList.some((u) => u.docId === currentUser.docId)) {
        usersList.push(currentUser);
      }
      computeTotal(usersList, projectsList, installmentsCount, latestLedgerCount, latestHistories);
    });

    // Role-based Projects Query
    const projectQuery = currentUser.role === "admin"
      ? collection(db, "projects")
      : query(collection(db, "projects"), where("companyId", "==", companyId));

    const unsubProjects = onSnapshot(projectQuery, (snap) => {
      projectsList = [];
      snap.forEach((d) => {
        projectsList.push({ id: d.id, ...d.data() });
      });
      computeTotal(usersList, projectsList, installmentsCount, latestLedgerCount, latestHistories);
    });

    // Role-based Installments Query
    const installmentQuery = currentUser.role === "admin"
      ? collection(db, "installments")
      : query(collection(db, "installments"), where("companyId", "==", companyId));

    const unsubInstallments = onSnapshot(installmentQuery, (snap) => {
      installmentsCount = snap.docs.length;
      computeTotal(usersList, projectsList, installmentsCount, latestLedgerCount, latestHistories);
    });

    // Role-based Accounts Query
    const accountQuery = currentUser.role === "admin"
      ? collection(db, "accounts")
      : query(collection(db, "accounts"), where("companyId", "==", companyId));

    const unsubAccounts = onSnapshot(accountQuery, (snap) => {
      latestLedgerCount = snap.docs.length;
      computeTotal(usersList, projectsList, installmentsCount, latestLedgerCount, latestHistories);
    });

    // Role-based History Query
    let unsubAllHistory: () => void;
    if (currentUser.role === "admin") {
      unsubAllHistory = onSnapshot(collectionGroup(db, "history"), (snap) => {
        latestHistories = [];
        snap.forEach((d) => {
          const parentUserDocId = d.ref.parent?.parent?.id || "";
          latestHistories.push({ docId: d.id, userDocId: parentUserDocId });
        });
        computeTotal(usersList, projectsList, installmentsCount, latestLedgerCount, latestHistories);
      });
    } else if (currentUser.role === "member") {
      unsubAllHistory = onSnapshot(collection(db, "users", currentUser.docId, "history"), (snap) => {
        latestHistories = [];
        snap.forEach((d) => {
          latestHistories.push({ docId: d.id, userDocId: currentUser.docId });
        });
        computeTotal(usersList, projectsList, installmentsCount, latestLedgerCount, latestHistories);
      });
    } else {
      unsubAllHistory = onSnapshot(collectionGroup(db, "history"), (snap) => {
        latestHistories = [];
        snap.forEach((d) => {
          const parentUserDocId = d.ref.parent?.parent?.id || "";
          latestHistories.push({ docId: d.id, userDocId: parentUserDocId });
        });
        computeTotal(usersList, projectsList, installmentsCount, latestLedgerCount, latestHistories);
      });
    }

    return () => {
      unsubUsers();
      unsubProjects();
      unsubInstallments();
      unsubAccounts();
      unsubAllHistory();
    };
  }, [currentUser]);

  const handleNavigate = (view: string, params: any = null) => {
    if (currentUser) {
      const isActive = currentUser.status === "active";
      const isAdmin = currentUser.role === "admin";
      if (!isActive && !isAdmin && view !== "profile") {
        setNavigationParams(null);
        setCurrentView("profile");
        return;
      }
    }
    setNavigationParams(params);
    setCurrentView(view as RouteView);
  };

  if (authStateLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="mt-4 text-xs font-bold text-slate-400">লোডিং হচ্ছে...</p>
      </div>
    );
  }

  if (!firebaseUser || !currentUser) {
    return <AuthView onSuccess={() => {}} language={language} setLanguage={setLanguage} />;
  }

  // Render correct view based on state
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 select-none pb-20 md:pb-0 transition-colors duration-200">
      <GlobalHeader
        currentUser={currentUser}
        currentView={currentView}
        onNavigate={handleNavigate}
        language={language}
        setLanguage={setLanguage}
        theme={theme}
        setTheme={setTheme}
        isNavVisible={isNavVisible}
      />
      <GlobalSlider currentUser={currentUser} language={language} />
      <AnimatePresence mode="wait">
        <motion.div
          key={currentView + (navigationParams?.id || "")}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          {currentView === "dashboard" && (
            <DashboardView currentUser={currentUser} onNavigate={handleNavigate} navigationParams={navigationParams} totalEntries={totalEntries} isNavVisible={isNavVisible} />
          )}

          {currentView === "member-list" && (
            <MemberListView currentUser={currentUser} onNavigate={handleNavigate} />
          )}

          {currentView === "member-add" && (
            <MemberAddView currentUser={currentUser} onNavigate={handleNavigate} totalEntries={totalEntries} />
          )}

          {currentView === "profile" && (
            <ProfileView
              currentUser={currentUser}
              targetId={navigationParams?.id}
              onNavigate={handleNavigate}
              totalEntries={totalEntries}
            />
          )}

          {currentView === "arrears" && (
            <ArrearsView
              currentUser={currentUser}
              onNavigate={handleNavigate}
            />
          )}

          {currentView === "notifications" && (
            <NotificationsView
              currentUser={currentUser}
              onNavigate={handleNavigate}
            />
          )}

          {currentView === "transactions" && (
            <TransactionsView
              currentUser={currentUser}
              onNavigate={handleNavigate}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
