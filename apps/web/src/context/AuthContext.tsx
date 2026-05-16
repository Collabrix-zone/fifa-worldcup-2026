import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { customFetch, ApiError, type AuthUser } from "@workspace/api-client-react";

interface AuthContextType {
  isLoading: boolean;
  isLoggedIn: boolean;
  currentUser: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  signup: (name: string, email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const user = await customFetch<AuthUser>("/api/auth/me", { credentials: "include" });
      setCurrentUser(user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setCurrentUser(null);
      } else if (err instanceof ApiError) {
        setCurrentUser(null);
      } else {
        // Network errors etc — leave as null but don't throw
        setCurrentUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string): Promise<AuthUser> => {
      const user = await customFetch<AuthUser>("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      setCurrentUser(user);
      await queryClient.invalidateQueries();
      return user;
    },
    [queryClient],
  );

  // Cookie sessions are HttpOnly so we can't read them client-side; the
  // signup-vs-login distinction matters because new users go through OTP →
  // payment → identity, while returning users land on the dashboard.
  const signup = useCallback(
    async (name: string, email: string, password: string): Promise<AuthUser> => {
      const user = await customFetch<AuthUser>("/api/auth/signup", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      setCurrentUser(user);
      await queryClient.invalidateQueries();
      return user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await customFetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // ignore
    }
    setCurrentUser(null);
    queryClient.clear();
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isLoggedIn: !!currentUser,
        currentUser,
        login,
        signup,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
