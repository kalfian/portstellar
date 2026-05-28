import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { changeAdminPassword } from "../lib/api";

export default function AdminSettingsPage() {
  const { token, logout } = useAuth();
  const nav = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (newPassword !== confirmPassword) return setErr("New passwords don't match");
    if (newPassword.length < 6) return setErr("New password must be at least 6 characters");
    setLoading(true);
    try {
      await changeAdminPassword(token!, currentPassword, newPassword);
      logout();
      nav("/admin/login");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setLoading(false);
    }
  }

  const strengthScore = newPassword.length === 0 ? 0 : newPassword.length < 8 ? 1 : newPassword.length < 12 ? 2 : 3;
  const strengthLabel = ["", "Weak", "Good", "Strong"][strengthScore];
  const strengthColor = ["", "#f87171", "#fbbf24", "#34d399"][strengthScore];

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-xl font-semibold text-white tracking-tight">Settings</h1>
        <p className="text-sm text-white/40 mt-0.5">Manage your admin account</p>
      </div>

      {/* Change password card */}
      <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8">
          <h2 className="text-sm font-semibold text-white">Change Password</h2>
          <p className="text-xs text-white/40 mt-0.5">You'll be signed out after changing your password</p>
        </div>

        <form onSubmit={onSubmit} className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/60 transition-colors"
            />
            {newPassword.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex gap-1 flex-1">
                  {[1, 2, 3].map(n => (
                    <div
                      key={n}
                      className="h-1 flex-1 rounded-full transition-colors duration-300"
                      style={{ backgroundColor: n <= strengthScore ? strengthColor : "rgba(255,255,255,0.1)" }}
                    />
                  ))}
                </div>
                <span className="text-xs shrink-0 transition-colors" style={{ color: strengthColor }}>{strengthLabel}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              className={`w-full bg-white/5 border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none transition-colors ${
                confirmPassword.length > 0 && newPassword !== confirmPassword
                  ? "border-red-500/40 focus:border-red-500/60"
                  : "border-white/10 focus:border-blue-500/60"
              }`}
            />
          </div>

          {err && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-sm text-red-400">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M7 4v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !currentPassword || !newPassword || !confirmPassword}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg px-4 py-2.5 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Updating…
              </>
            ) : "Update Password"}
          </button>
        </form>
      </div>

      {/* Danger zone */}
      <div className="bg-red-500/5 border border-red-500/15 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-red-500/15">
          <h2 className="text-sm font-semibold text-red-400">Danger Zone</h2>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/70">Sign out</p>
            <p className="text-xs text-white/30 mt-0.5">End your current session</p>
          </div>
          <button
            onClick={() => { logout(); nav("/admin/login"); }}
            className="shrink-0 text-sm text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 rounded-lg px-3 py-1.5 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
