import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { User } from "./types";
import AuthView from "./components/AuthView";
import DashboardView from "./components/DashboardView";
import MemberListView from "./components/MemberListView";
import MemberAddView from "./components/MemberAddView";
import ProfileView from "./components/ProfileView";
import GlobalHeader from "./components/GlobalHeader";
import ArrearsView from "./components/ArrearsView";
import { motion, AnimatePresence } from "motion/react";

type RouteView = "login" | "dashboard" | "member-list" | "member-add" | "profile" | "arrears";

export default function App() {
  const [authStateLoading, setAuthStateLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

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

  const handleNavigate = (view: string, params: any = null) => {
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
    return <AuthView onSuccess={() => {}} />;
  }

  // Render correct view based on state
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 select-none">
      <GlobalHeader currentUser={currentUser} currentView={currentView} onNavigate={handleNavigate} />
      <AnimatePresence mode="wait">
        <motion.div
          key={currentView + (navigationParams?.id || "")}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          {currentView === "dashboard" && (
            <DashboardView currentUser={currentUser} onNavigate={handleNavigate} />
          )}

          {currentView === "member-list" && (
            <MemberListView currentUser={currentUser} onNavigate={handleNavigate} />
          )}

          {currentView === "member-add" && (
            <MemberAddView currentUser={currentUser} onNavigate={handleNavigate} />
          )}

          {currentView === "profile" && (
            <ProfileView
              currentUser={currentUser}
              targetId={navigationParams?.id}
              onNavigate={handleNavigate}
            />
          )}

          {currentView === "arrears" && (
            <ArrearsView
              currentUser={currentUser}
              onNavigate={handleNavigate}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
