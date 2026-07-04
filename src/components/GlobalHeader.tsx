import { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { User } from "../types";
import { doc, getDoc, collection, query, where, getDocs, limit, onSnapshot } from "firebase/firestore";
import { LayoutDashboard, Users, UserPlus, User as UserIcon, LogOut, Building2, AlertCircle, Bell } from "lucide-react";

interface GlobalHeaderProps {
  currentUser: User;
  currentView: string;
  onNavigate: (view: string, params?: any) => void;
}

export default function GlobalHeader({ currentUser, currentView, onNavigate }: GlobalHeaderProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [adminWhatsapp, setAdminWhatsapp] = useState<string>("");
  const [companyWhatsapp, setCompanyWhatsapp] = useState<string>("");
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

    const fetchCompanyWhatsapp = async () => {
      try {
        const targetCompanyId = currentUser.role === "company" ? currentUser.docId : currentUser.companyId;
        if (targetCompanyId) {
          const companySnap = await getDoc(doc(db, "users", targetCompanyId));
          if (companySnap.exists()) {
            const companyData = companySnap.data() as User;
            setCompanyWhatsapp(companyData.whatsapp || companyData.mobile || "");
          }
        }
      } catch (err) {
        console.error("Error fetching company whatsapp:", err);
      }
    };

    fetchAdminWhatsapp();
    fetchCompanyWhatsapp();
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
    <header className="sticky top-0 z-50 bg-white border-b border-slate-100 shadow-sm font-sans select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Left: Brand logo & name */}
          <div 
            onClick={() => isActiveOrAdmin && onNavigate("dashboard")}
            className="flex items-center gap-2 cursor-pointer active:scale-95 transition animate-fadeIn"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-sm sm:text-base text-slate-800 tracking-tight block">
                {currentUser.companyName || "সোসাইটি ম্যানেজার"}
              </span>
              <span className="text-[9px] text-slate-400 font-bold block -mt-0.5">
                {currentUser.name} ({currentUser.role === "admin" ? "অ্যাডমিন" : currentUser.role === "company" ? "কোম্পানি" : "সদস্য"})
              </span>
            </div>
          </div>

          {/* Center: Navigation Links for Desktop & Tablet */}
          {isActiveOrAdmin && (
            <nav className="hidden md:flex space-x-1">
              <button
                onClick={() => onNavigate("dashboard")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  currentView === "dashboard"
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                ড্যাশবোর্ড
              </button>

              {isCompanyOrAdmin && (
                <>
                  <button
                    onClick={() => onNavigate("member-list")}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      currentView === "member-list"
                        ? "bg-blue-50 text-blue-600"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    সদস্য তালিকা
                  </button>

                  <button
                    onClick={() => onNavigate("arrears")}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      currentView === "arrears"
                        ? "bg-blue-50 text-blue-600"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                  >
                    <AlertCircle className="w-4 h-4" />
                    বকেয়া
                  </button>

                  <button
                    onClick={() => onNavigate("member-add")}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      currentView === "member-add"
                        ? "bg-blue-50 text-blue-600"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                  >
                    <UserPlus className="w-4 h-4" />
                    সদস্য যোগ করুন
                  </button>
                </>
              )}

              <button
                onClick={() => onNavigate("profile")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  currentView === "profile"
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >
                <UserIcon className="w-4 h-4" />
                প্রোফাইল
              </button>
            </nav>
          )}

          {/* Right: User Menu & Notification Bell */}
          <div className="flex items-center gap-2">
            {/* Elegant Header Notification Bell */}
            <button
              onClick={() => onNavigate("notifications")}
              className={`w-9 h-9 rounded-full flex items-center justify-center border transition relative cursor-pointer active:scale-95 shrink-0 ${
                currentView === "notifications"
                  ? "bg-indigo-50 border-indigo-200 text-indigo-600"
                  : "bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800"
              }`}
              title="বিজ্ঞপ্তি"
            >
              <Bell className="w-4.5 h-4.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-600 text-white font-black text-[9px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center border-2 border-white shadow-md animate-bounce">
                  {unreadCount}
                </span>
              )}
            </button>

            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="w-9 h-9 rounded-full overflow-hidden border border-slate-200 hover:border-slate-300 shadow-sm active:scale-95 transition cursor-pointer shrink-0"
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
                    className="fixed inset-0 z-40 bg-black/5" 
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 text-slate-800 animate-fadeIn font-sans">
                    <div className="px-3 py-2 border-b border-slate-100 text-left">
                      <p className="text-xs font-extrabold text-slate-800 truncate">{currentUser.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{currentUser.email}</p>
                    </div>
                    
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          onNavigate("profile");
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs font-bold hover:bg-slate-50 transition flex items-center gap-2 cursor-pointer"
                      >
                        <UserIcon className="w-3.5 h-3.5 text-slate-400" /> প্রোফাইল (Profile)
                      </button>

                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          onNavigate("notifications");
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs font-bold hover:bg-slate-50 transition flex items-center justify-between cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Bell className="w-3.5 h-3.5 text-slate-400" /> বিজ্ঞপ্তি (Notifications)
                        </span>
                        {unreadCount > 0 && (
                          <span className="bg-rose-600 text-white font-black text-[8px] px-1.5 py-0.5 rounded-full">
                            {unreadCount}
                          </span>
                        )}
                      </button>

                      {isCompanyOrAdmin && isActiveOrAdmin && (
                        <>
                          <button
                            onClick={() => {
                              setShowProfileMenu(false);
                              onNavigate("member-list");
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs font-bold hover:bg-slate-50 transition flex items-center gap-2 cursor-pointer"
                          >
                            <Users className="w-3.5 h-3.5 text-slate-400" /> সদস্য তালিকা (Member List)
                          </button>

                          <button
                            onClick={() => {
                              setShowProfileMenu(false);
                              onNavigate("arrears");
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs font-bold hover:bg-slate-50 transition flex items-center gap-2 cursor-pointer"
                          >
                            <AlertCircle className="w-3.5 h-3.5 text-slate-400" /> বকেয়া তালিকা (Arrears List)
                          </button>

                          <button
                            onClick={() => {
                              setShowProfileMenu(false);
                              onNavigate("member-add");
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs font-bold hover:bg-slate-50 transition flex items-center gap-2 cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5 text-slate-400" /> সদস্য যোগ (Add Member)
                          </button>
                        </>
                      )}

                      <hr className="my-1 border-slate-100" />

                      <div className="px-3 py-1.5 space-y-1 text-left">
                        <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">📞 সাপোর্ট ও যোগাযোগ</p>
                        
                        {companyWhatsapp ? (
                          <a
                            href={`https://wa.me/${companyWhatsapp.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between p-1.5 rounded-lg bg-emerald-50/70 hover:bg-emerald-100 text-emerald-800 font-bold text-[10px] transition group"
                          >
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              কোম্পানি সাপোর্ট
                            </span>
                            <span className="text-[9px] text-emerald-600 font-mono tracking-tight group-hover:underline">
                              {companyWhatsapp}
                            </span>
                          </a>
                        ) : null}

                        {adminWhatsapp ? (
                          <a
                            href={`https://wa.me/${adminWhatsapp.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between p-1.5 rounded-lg bg-blue-50/70 hover:bg-blue-100 text-blue-800 font-bold text-[10px] transition group"
                          >
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              ডেভলপার সাপোর্ট
                            </span>
                            <span className="text-[9px] text-blue-600 font-mono tracking-tight group-hover:underline">
                              {adminWhatsapp}
                            </span>
                          </a>
                        ) : null}
                      </div>

                      <hr className="my-1 border-slate-100" />

                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          handleLogout();
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs font-bold hover:bg-rose-50 text-rose-600 transition flex items-center gap-2 cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" /> লগ আউট (Logout)
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Navigation Links (Below Header, horizontal scrollable) */}
        {isActiveOrAdmin && (
          <div className="flex md:hidden overflow-x-auto py-2 border-t border-slate-100/50 scrollbar-none gap-1.5 -mx-4 px-4">
            <button
              onClick={() => onNavigate("dashboard")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer shrink-0 ${
                currentView === "dashboard"
                  ? "bg-blue-50 text-blue-600"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              ড্যাশবোর্ড
            </button>

            {isCompanyOrAdmin && (
              <>
                <button
                  onClick={() => onNavigate("member-list")}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer shrink-0 ${
                    currentView === "member-list"
                      ? "bg-blue-50 text-blue-600"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  সদস্য তালিকা
                </button>

                <button
                  onClick={() => onNavigate("arrears")}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer shrink-0 ${
                    currentView === "arrears"
                      ? "bg-blue-50 text-blue-600"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  বকেয়া
                </button>

                <button
                  onClick={() => onNavigate("member-add")}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer shrink-0 ${
                    currentView === "member-add"
                      ? "bg-blue-50 text-blue-600"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  সদস্য যোগ
                </button>
              </>
            )}

            <button
              onClick={() => onNavigate("profile")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer shrink-0 ${
                currentView === "profile"
                  ? "bg-blue-50 text-blue-600"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <UserIcon className="w-3.5 h-3.5" />
              প্রোফাইল
            </button>
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
              <h3 className="font-extrabold text-slate-800 text-sm sm:text-base">লগআউট নিশ্চিতকরণ</h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
              আপনি কি নিশ্চিতভাবে লগআউট করতে চান?
            </p>

            <div className="flex gap-2.5 pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  auth.signOut().then(() => onNavigate("login"));
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-2.5 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95"
              >
                হ্যাঁ, নিশ্চিত
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
