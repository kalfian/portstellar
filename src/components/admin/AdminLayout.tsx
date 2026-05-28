import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

export function AdminLayout() {
  const { logout } = useAuth();
  return (
    <div className="min-h-screen bg-[#0b0e18] text-white flex">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 flex flex-col bg-[#080b14] border-r border-white/6" style={{ backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.06) 0%, transparent 60%)" }}>
        {/* Brand */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-6 h-6 rounded-md bg-blue-600/25 border border-blue-500/30 flex items-center justify-center shrink-0">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="2" fill="#60a5fa"/>
                <circle cx="6" cy="6" r="4.5" stroke="#3b82f6" strokeWidth="1" strokeDasharray="2 1.5"/>
              </svg>
            </div>
            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">Portstellar</span>
          </div>
          <p className="text-sm font-semibold text-white pl-8">Admin</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 space-y-0.5">
          <NavItem to="/admin" icon={<GridIcon />}>Dashboard</NavItem>
          <NavItem to="/admin/config" icon={<EditIcon />}>Config Editor</NavItem>
          <NavItem to="/admin/settings" icon={<SettingsIcon />}>Settings</NavItem>

          <div className="pt-3 pb-1 px-2">
            <div className="border-t border-white/6" />
          </div>

          <NavItem to="/" icon={<GlobeIcon />}>Public Mesh</NavItem>
        </nav>

        {/* User / logout */}
        <div className="p-2.5 border-t border-white/6">
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-white/35 hover:text-red-400 hover:bg-red-500/8 transition-all group"
          >
            <div className="w-6 h-6 rounded-md bg-white/6 group-hover:bg-red-500/10 flex items-center justify-center transition-colors shrink-0">
              <LogoutIcon />
            </div>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="h-full px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function NavItem({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-100 group ${
          isActive
            ? "bg-blue-600/18 text-white font-medium"
            : "text-white/40 hover:text-white/75 hover:bg-white/5"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${isActive ? "bg-blue-500/25" : "bg-white/5 group-hover:bg-white/8"}`}>
            <span className={isActive ? "text-blue-400" : "text-white/40 group-hover:text-white/60"}>{icon}</span>
          </div>
          {children}
          {isActive && <div className="ml-auto w-1 h-1 rounded-full bg-blue-400" />}
        </>
      )}
    </NavLink>
  );
}

function GridIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8.5" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="1" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M10.5 1.5l3 3-8 8H2.5v-3l8-8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7.5 1v1.5M7.5 12.5V14M14 7.5h-1.5M2.5 7.5H1M12.2 2.8l-1.06 1.06M3.86 11.14L2.8 12.2M12.2 12.2l-1.06-1.06M3.86 3.86L2.8 2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7.5 1.5c-2 2-2 9 0 12M7.5 1.5c2 2 2 9 0 12M1.5 7.5h12" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M6 2H3a1 1 0 00-1 1v9a1 1 0 001 1h3M10 10.5l3-3-3-3M13 7.5H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
