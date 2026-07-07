import { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { User } from "../types";
import { doc, getDoc, collection, query, where, getDocs, limit, onSnapshot } from "firebase/firestore";
import { LayoutDashboard, Users, UserPlus, User as UserIcon, LogOut, Building2, AlertCircle, Bell, ArrowLeftRight, Plus, Sun, Moon, Globe, Settings } from "lucide-react";
import { translations, Language } from "../utils/translations";

interface GlobalHeaderProps {
  currentUser: User;
  currentView: string;
  onNavigate: (view: string, params?: any) => void;
  language?: Language;
  setLanguage?: (lang: Language) => void;
  theme?: "light" | "dark";
  setTheme?: (theme: "light" | "dark") => void;
  isNavVisible?: boolean;
}

export default function GlobalHeader({ currentUser, currentView, onNavigate, language = "bn", setLanguage, theme = "light", setTheme, isNavVisible = true }: GlobalHeaderProps) {
  const t = translations[language];
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [adminWhatsapp, setAdminWhatsapp] = useState<string>("");
  const [companyWhatsapp, setCompanyWhatsapp] = useState<string>("");
  const [displayCompanyName, setDisplayCompanyName] = useState<string>("");
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    const fetchAdminWhatsapp = async () => {
      try {
        const q = query(collection(db, "users"), where("role", "==", "admin"), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const adminData = snap.docs[0].data() as User;
          setAdminWhatsapp(adminData.whatsapp || adminData.mobile || "");
        }
      } catch (err) {
        console.error("Error fetching admin whatsapp:", err);
      }
    };

    const fetchCompanyDetails = async () => {
      try {
        const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
        if (targetCompanyId) {
          const companySnap = await getDoc(doc(db, "users", targetCompanyId));
          if (companySnap.exists()) {
            const companyData = companySnap.data() as User;
            setCompanyWhatsapp(companyData.whatsapp || companyData.mobile || "");
            if (companyData.companyName) {
              setDisplayCompanyName(companyData.companyName);
            } else {
              setDisplayCompanyName("সোসাইটি ম্যানেজার");
            }
          } else {
            setDisplayCompanyName(currentUser.companyName || "সোসাইটি ম্যানেজার");
          }
        } else {
          setDisplayCompanyName(currentUser.companyName || "সোসাইটি ম্যানেজার");
        }
      } catch (err) {
        console.error("Error fetching company details:", err);
        setDisplayCompanyName(currentUser.companyName || "সোসাইটি ম্যানেজার");
      }
    };

    fetchAdminWhatsapp();
    fetchCompanyDetails();
  }, [currentUser]);

  // Sync and count unread notifications
  useEffect(() => {
    if (!currentUser) return;
    
    const q = query(collection(db, "notifications"));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        let count = 0;
        snapshot.forEach((docSnap) => {
          const n = { docId: docSnap.id, ...docSnap.data() } as any;
          
          // Determine if this notification applies to the current user
          let matches = false;
          if (currentUser.role === "admin") {
            matches = true;
          } else if (n.senderId === currentUser.docId) {
            matches = true;
          } else if (currentUser.role === "company") {
            matches = n.targetType === "all_companies";
          } else if (currentUser.role === "member") {
            if (n.targetType === "all_members") matches = true;
            if (n.targetType === "company_members" && n.targetCompanyId === currentUser.companyId) {
              matches = true;
            }
          }
          
          // Count if matched and current user hasn't read it
          if (matches && (!n.readBy || !n.readBy.includes(currentUser.docId))) {
            count++;
          }
        });
        setUnreadCount(count);
      },
      (err) => {
        console.error("Error watching notifications in header:", err);
      }
    );
    return () => unsub();
  }, [currentUser]);

  const isCompanyOrAdmin = currentUser.role === "company" || currentUser.role === "admin";
  const isActiveOrAdmin = currentUser.status === "active" || currentUser.role === "admin";

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-150 dark:border-slate-850 shadow-sm font-sans select-none transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Left: Brand logo & name */}
          <div 
            onClick={() => isActiveOrAdmin && onNavigate("dashboard")}
            className="flex items-center gap-2.5 cursor-pointer active:scale-95 transition animate-fadeIn"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Building2 className="w-5.5 h-5.5" />
            </div>
            <div>
              <span className="font-black text-sm sm:text-base text-slate-800 dark:text-slate-100 tracking-tight block">
                {displayCompanyName || currentUser.companyName || (language === "bn" ? "সোসাইটি ম্যানেজার" : "Society Manager")}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold block -mt-0.5 uppercase tracking-wide">
                {currentUser.name} ({currentUser.role === "admin" ? t.admin : currentUser.role === "company" ? t.company : t.member})
              </span>
            </div>
          </div>

          {/* Center: Navigation Links for Desktop & Tablet */}
          {isActiveOrAdmin && (
            <nav className="hidden md:flex space-x-1">
              <button
                onClick={() => onNavigate("dashboard")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  currentView === "dashboard"
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100"
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                {t.dashboard}
              </button>

              <button
                onClick={() => onNavigate("transactions")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  currentView === "transactions"
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100"
                }`}
              >
                <ArrowLeftRight className="w-4 h-4" />
                {t.transactions}
              </button>

              {isCompanyOrAdmin && (
                <>
                  <button
                    onClick={() => onNavigate("member-list")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      currentView === "member-list"
                        ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100"
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    {t.memberList}
                  </button>

                  <button
                    onClick={() => onNavigate("arrears")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      currentView === "arrears"
                        ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100"
                    }`}
                  >
                    <AlertCircle className="w-4 h-4" />
                    {t.arrears}
                  </button>

                  <button
                    onClick={() => onNavigate("member-add")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      currentView === "member-add"
                        ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100"
                    }`}
                  >
                    <UserPlus className="w-4 h-4" />
                    {t.memberAddFull}
                  </button>
                </>
              )}

              <button
                onClick={() => onNavigate("profile")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  currentView === "profile"
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-slate-100"
                }`}
              >
                <UserIcon className="w-4 h-4" />
                {t.profile}
              </button>
            </nav>
          )}

          {/* Right: User Menu & Notification Bell */}
          <div className="flex items-center gap-2">
            {/* Elegant Header Notification Bell */}
            {isActiveOrAdmin && (
              <button
                onClick={() => onNavigate("notifications")}
                className={`w-10 h-10 rounded-full flex items-center justify-center border transition relative cursor-pointer active:scale-95 shrink-0 ${
                  currentView === "notifications"
                    ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
                title={t.notifications}
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-600 text-white font-black text-[8px] min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center border border-white dark:border-slate-900 shadow-md animate-bounce">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm active:scale-95 transition cursor-pointer shrink-0"
              >
                <img
                  src={currentUser.profilePic || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=2563eb&color=fff`}
                  className="w-full h-full object-cover"
                  alt=""
                />
              </button>

              {showProfileMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40 bg-black/5 dark:bg-black/20" 
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 py-2 z-50 text-slate-800 dark:text-slate-100 animate-fadeIn font-sans transition-colors duration-200">
                    <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 text-left">
                      <p className="text-xs font-extrabold text-slate-800 dark:text-slate-100 truncate">{currentUser.name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{currentUser.email}</p>
                    </div>
                    
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          onNavigate("profile");
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-100"
                      >
                        <UserIcon className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {t.profile}
                      </button>

                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          onNavigate("transactions");
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-100"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {t.transactions}
                      </button>

                      {isCompanyOrAdmin && isActiveOrAdmin && (
                        <>
                          <button
                            onClick={() => {
                              setShowProfileMenu(false);
                              onNavigate("member-list");
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-100"
                          >
                            <Users className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {t.memberList}
                          </button>

                          <button
                            onClick={() => {
                              setShowProfileMenu(false);
                              onNavigate("arrears");
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-100"
                          >
                            <AlertCircle className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {t.arrearsList}
                          </button>

                          <button
                            onClick={() => {
                              setShowProfileMenu(false);
                              onNavigate("member-add");
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-100"
                          >
                            <UserPlus className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {t.memberAddFull}
                          </button>
                        </>
                      )}

                      <hr className="my-1 border-slate-100 dark:border-slate-800" />

                      {/* Settings & Preferences Section */}
                      <div className="px-3.5 py-2 text-left space-y-2">
                        <p className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                          {t.preferences}
                        </p>
                        
                        {/* Day/Night Mode Switcher */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                            {theme === "dark" ? <Moon className="w-3.5 h-3.5 text-indigo-400" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
                            {t.dayNightMode}
                          </span>
                          <button
                            onClick={() => setTheme && setTheme(theme === "dark" ? "light" : "dark")}
                            className="relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none bg-slate-200 dark:bg-indigo-600"
                          >
                            <span
                              className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                theme === "dark" ? "translate-x-3.5" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>

                        {/* Language Switcher */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-blue-500" />
                            {t.changeLanguage}
                          </span>
                          <button
                            onClick={() => setLanguage && setLanguage(language === "bn" ? "en" : "bn")}
                            className="px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[9px] font-black text-slate-700 dark:text-slate-300 active:scale-95 transition cursor-pointer animate-fadeIn"
                          >
                            {language === "bn" ? "English" : "বাংলা"}
                          </button>
                        </div>
                      </div>

                      <hr className="my-1 border-slate-100 dark:border-slate-800" />

                      <div className="px-3.5 py-1.5 space-y-1 text-left">
                        <p className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">{t.supportAndContact}</p>
                        
                        {companyWhatsapp ? (
                          <a
                            href={`https://wa.me/${companyWhatsapp.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between p-1.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 font-bold text-[10px] transition group"
                          >
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              {t.companySupport}
                            </span>
                            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono tracking-tight group-hover:underline">
                              {companyWhatsapp}
                            </span>
                          </a>
                        ) : null}

                        {adminWhatsapp ? (
                          <a
                            href={`https://wa.me/${adminWhatsapp.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between p-1.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-800 dark:text-blue-300 font-bold text-[10px] transition group"
                          >
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              {t.devSupport}
                            </span>
                            <span className="text-[9px] text-blue-600 dark:text-blue-400 font-mono tracking-tight group-hover:underline">
                              {adminWhatsapp}
                            </span>
                          </a>
                        ) : null}
                      </div>

                      <hr className="my-1 border-slate-100 dark:border-slate-800" />

                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          handleLogout();
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 transition flex items-center gap-2 cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" /> {t.logout}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Fixed Mobile Bottom Navigation Bar */}
        {isActiveOrAdmin && (
          <div className={`fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/95 backdrop-blur-md border-t border-slate-150 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] pb-safe transition-all duration-300 transform ${
            isNavVisible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
          }`}>
            <div className="flex items-center justify-around h-14 px-1 relative">
              <button
                onClick={() => onNavigate("dashboard")}
                className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-all duration-200 cursor-pointer ${
                  currentView === "dashboard"
                    ? "text-blue-600 scale-105 font-black"
                    : "text-slate-500 hover:text-slate-800 font-bold"
                }`}
              >
                <LayoutDashboard className={`w-5 h-5 transition-transform ${currentView === "dashboard" ? "scale-110 text-blue-600" : "text-slate-400"}`} />
                <span className="text-[9px] tracking-tight">{t.dashboard}</span>
              </button>

              <button
                onClick={() => onNavigate("transactions")}
                className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-all duration-200 cursor-pointer ${
                  currentView === "transactions"
                    ? "text-blue-600 scale-105 font-black"
                    : "text-slate-500 hover:text-slate-800 font-bold"
                }`}
              >
                <ArrowLeftRight className={`w-5 h-5 transition-transform ${currentView === "transactions" ? "scale-110 text-blue-600" : "text-slate-400"}`} />
                <span className="text-[9px] tracking-tight">{t.transactions}</span>
              </button>

              {isCompanyOrAdmin ? (
                <>
                  {/* Central Large Round Prominent Entry Button */}
                  <div className="flex-1 flex justify-center py-1 select-none">
                    <button
                      onClick={() => onNavigate("dashboard", { openAdd: Date.now() })}
                      className="absolute -top-5 w-14 h-14 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white flex items-center justify-center shadow-[0_4px_15px_rgba(37,99,235,0.35)] active:scale-95 transition-all duration-200 border-4 border-white cursor-pointer z-50 animate-fadeIn"
                    >
                      <Plus className="w-6 h-6 text-white stroke-[3.5px]" />
                    </button>
                    {/* Placeholder space to push other buttons symmetrically */}
                    <div className="w-12 h-10" />
                  </div>

                  <button
                    onClick={() => onNavigate("arrears")}
                    className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-all duration-200 cursor-pointer ${
                      currentView === "arrears"
                        ? "text-blue-600 scale-105 font-black"
                        : "text-slate-500 hover:text-slate-800 font-bold"
                    }`}
                  >
                    <AlertCircle className={`w-5 h-5 transition-transform ${currentView === "arrears" ? "scale-110 text-blue-600" : "text-slate-400"}`} />
                    <span className="text-[9px] tracking-tight">{t.arrears}</span>
                  </button>

                  <button
                    onClick={() => onNavigate("member-list")}
                    className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-all duration-200 cursor-pointer ${
                      currentView === "member-list"
                        ? "text-blue-600 scale-105 font-black"
                        : "text-slate-500 hover:text-slate-800 font-bold"
                    }`}
                  >
                    <Users className={`w-5 h-5 transition-transform ${currentView === "member-list" ? "scale-110 text-blue-600" : "text-slate-400"}`} />
                    <span className="text-[9px] tracking-tight">{t.memberList}</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => onNavigate("arrears")}
                    className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-all duration-200 cursor-pointer ${
                      currentView === "arrears"
                        ? "text-blue-600 scale-105 font-black"
                        : "text-slate-500 hover:text-slate-800 font-bold"
                    }`}
                  >
                    <AlertCircle className={`w-5 h-5 transition-transform ${currentView === "arrears" ? "scale-110 text-blue-600" : "text-slate-400"}`} />
                    <span className="text-[9px] tracking-tight">{t.arrears}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[2000] p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-left font-sans border border-slate-100">
            <div className="flex items-center gap-2.5 border-b pb-3 text-amber-600">
              <span className="p-2 rounded-full bg-amber-50 text-amber-600">
                <LogOut className="w-5 h-5" />
              </span>
              <h3 className="font-extrabold text-slate-800 text-sm sm:text-base">{t.logoutConfirmTitle}</h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
              {t.logoutConfirmMsg}
            </p>

            <div className="flex gap-2.5 pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  auth.signOut().then(() => onNavigate("login"));
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-2.5 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95"
              >
                {t.yesConfirm}
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
