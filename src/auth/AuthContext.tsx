import { createContext, useContext, useMemo, useState } from "react";
import { adminLogin } from "../lib/api";

const TOKEN_KEY = "portstellar.admin.token";

interface AuthCtx {
  token: string | null;
  isAuthenticated: boolean;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));

  const value = useMemo<AuthCtx>(() => ({
    token,
    isAuthenticated: !!token,
    login: async (password: string) => {
      const res = await adminLogin(password);
      localStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
    },
    logout: () => {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
    },
  }), [token]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
