import { useState } from "react";
import { auth } from "../firebase";
import { User } from "../types";
import { LayoutDashboard, Users, UserPlus, User as UserIcon, LogOut, Building2, AlertCircle } from "lucide-react";

interface GlobalHeaderProps {
  currentUser: User;
  currentView: string;
  onNavigate: (view: string, params?: any) => void;
}

export default function GlobalHeader({ currentUser, currentView, onNavigate }: GlobalHeaderProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const isCompanyOrAdmin = currentUser.role === "company" || currentUser.role === "admin";
  const isActiveOrAdmin = currentUser.status === "active" || currentUser.role === "admin";

  const handleLogout = () => {
    if (confirm("আপনি কি নিশ্চিতভাবে লগআউট করতে চান?")) {
      auth.signOut().then(() => onNavigate("login"));
    }
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

          {/* Right: User Menu */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="w-9 h-9 rounded-full overflow-hidden border border-slate-200 hover:border-slate-300 shadow-sm active:scale-95 transition cursor-pointer"
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
    </header>
  );
}
