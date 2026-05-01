/**
 * AdminAuthContext — global "admin logged-in" state, persisted to localStorage.
 * Provides:
 *   - isAdmin: boolean
 *   - password: string (when authenticated)
 *   - login(pwd) -> Promise<boolean>
 *   - logout()
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { adminLogin } from "../lib/api";

const ctx = createContext(null);
const KEY = "signlang.admin.password.v1";

export function AdminAuthProvider({ children }) {
  const [password, setPassword] = useState(() => {
    try {
      return localStorage.getItem(KEY) || "";
    } catch {
      return "";
    }
  });
  const [verifying, setVerifying] = useState(false);

  // On mount: if we have a stored password, silently re-validate it
  useEffect(() => {
    if (!password) return;
    (async () => {
      try {
        await adminLogin(password);
      } catch {
        try {
          localStorage.removeItem(KEY);
        } catch {}
        setPassword("");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      isAdmin: !!password,
      password,
      verifying,
      async login(pwd) {
        setVerifying(true);
        try {
          await adminLogin(pwd);
          try {
            localStorage.setItem(KEY, pwd);
          } catch {}
          setPassword(pwd);
          return true;
        } catch {
          return false;
        } finally {
          setVerifying(false);
        }
      },
      logout() {
        try {
          localStorage.removeItem(KEY);
        } catch {}
        setPassword("");
      },
      // Replace the cached admin password (used after a successful
      // password rotation in the Enseñanzas panel).
      replacePassword(newPwd) {
        try {
          if (newPwd) localStorage.setItem(KEY, newPwd);
          else localStorage.removeItem(KEY);
        } catch {}
        setPassword(newPwd || "");
      },
    }),
    [password, verifying],
  );
  return <ctx.Provider value={value}>{children}</ctx.Provider>;
}

export function useAdminAuth() {
  const v = useContext(ctx);
  if (!v) {
    return { isAdmin: false, password: "", verifying: false, login: async () => false, logout: () => {}, replacePassword: () => {} };
  }
  return v;
}
