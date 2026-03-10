import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Route, Routes, useLocation, useParams } from "react-router-dom";
import styles from "./App.module.css";
import Test from "./components/Test/test";
import { Login, Register, NotFound, PageTemplate} from "./components";
import UserContext from "./context/UserContext";
import Axios from "axios";
import config from "./config/Config";

// Debug log for API base resolution
// eslint-disable-next-line no-console
console.log("[App] API base URL:", config.base_url);

const StrategyLogsRoute = () => {
  const { strategyId } = useParams();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const strategyName = queryParams.get("name") || "";

  return (
    <PageTemplate
      initialPage="strategyLogs"
      initialStrategyId={strategyId}
      initialStrategyName={strategyName}
    />
  );
};



function App() {
  const decodeJwtPayload = (token) => {
    try {
      if (!token || typeof token !== "string") {
        return null;
      }
      const parts = token.split(".");
      if (parts.length !== 3) {
        return null;
      }
      const payload = parts[1];
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
      const base64Decode = (value) => {
        if (typeof window !== "undefined" && typeof window.atob === "function") {
          return window.atob(value);
        }
        return null;
      };
      const decoded = base64Decode(padded);
      if (!decoded) {
        return null;
      }
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  };

  const loadStoredUser = (token) => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) {
        return undefined;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return undefined;
      }
      const payload = decodeJwtPayload(token);
      const tokenUserId = payload?.id ? String(payload.id) : null;
      const storedUserId = parsed?.id ? String(parsed.id) : null;
      if (tokenUserId && storedUserId && tokenUserId !== storedUserId) {
        localStorage.removeItem("user");
        return undefined;
      }
      // Never persist secrets in localStorage.
      delete parsed.ALPACA_API_KEY_ID;
      delete parsed.ALPACA_API_SECRET_KEY;
      delete parsed.ALPACA_LIVE_API_KEY_ID;
      delete parsed.ALPACA_LIVE_API_SECRET_KEY;
      return parsed;
    } catch {
      return undefined;
    }
  };

  const storedToken = localStorage.getItem("auth-token") || undefined;
  const [userData, setUserData] = useState({
    token: storedToken,
    user: loadStoredUser(storedToken),
    ALPACA_API_KEY_ID: undefined,
    ALPACA_API_SECRET_KEY: undefined,
  });

  useEffect(() => {
    const checkLoggedIn = async () => {
      try {
        let token = localStorage.getItem("auth-token");
        if (token == null) {
          localStorage.setItem("auth-token", "");
          token = "";
          localStorage.removeItem("user");
          setUserData({ token: undefined, user: undefined, ALPACA_API_KEY_ID: undefined, ALPACA_API_SECRET_KEY: undefined });
          return;
        }

        const headers = {
          "x-auth-token": token,
        };

        const tokenIsValid = await Axios.post(
          config.base_url + "/api/auth/validate",
          null,
          {
            headers,
          }
        );

        if (tokenIsValid.data) {
          const userRes = await Axios.get(config.base_url + "/api/auth/user", {
            headers,
          });
          
          setUserData({
            token,
            user: userRes.data,
          });

          // Store user data in local storage
          localStorage.setItem("user", JSON.stringify(userRes.data));
        } else {
          localStorage.removeItem("user");
          localStorage.setItem("auth-token", "");
          setUserData({ token: undefined, user: undefined, ALPACA_API_KEY_ID: undefined, ALPACA_API_SECRET_KEY: undefined });
        }
      } catch (error) {
        localStorage.removeItem("user");
        localStorage.setItem("auth-token", "");
        setUserData({ token: undefined, user: undefined, ALPACA_API_KEY_ID: undefined, ALPACA_API_SECRET_KEY: undefined });
        // eslint-disable-next-line no-console
        console.error("[Auth] Failed to restore login session:", error);
      }
    };

    checkLoggedIn();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const sendPing = () => {
      Axios.get(`${config.base_url}/api/ping`)
        .catch(() => {
          if (!cancelled) {
            // eslint-disable-next-line no-console
            console.warn("[KeepAlive] Failed to reach backend ping endpoint.");
          }
        });
    };

    sendPing();
    const intervalId = setInterval(sendPing, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return (
    <Router>
      <UserContext.Provider value={{ userData, setUserData }}>
        <div className={styles.container}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            {userData.user ? (
              <>
                <Route path="/" element={<PageTemplate />} />
                <Route path="/strategies/:strategyId/logs" element={<StrategyLogsRoute />} />
                <Route path="/logs" element={<PageTemplate initialPage="allLogs" />} />
                <Route path="/test" element={<Test />} />
              </>
            ) : (
              <Route path="/" element={<Register />} />
            )}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </UserContext.Provider>
    </Router>
  );
  
}

export default App;
