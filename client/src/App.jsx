import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ChatWidget from "./components/ChatWidget.jsx";
import Login from "./pages/Login.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import { api } from "./api.js";

function useAdminSession() {
  const [status, setStatus] = useState("checking"); // checking | authed | anonymous
  const [profile, setProfile] = useState(null); // { username, display_name, role, role_label, is_env_admin }

  useEffect(() => {
    api
      .me()
      .then((data) => {
        setProfile(data);
        setStatus("authed");
      })
      .catch(() => setStatus("anonymous"));
  }, []);

  return { status, profile, setStatus, setProfile };
}

function AdminGate() {
  const session = useAdminSession();

  if (session.status === "checking") {
    return <div className="page-loading">Проверка сессии…</div>;
  }
  if (session.status === "anonymous") {
    return (
      <Login
        onLoggedIn={(data) => {
          session.setProfile(data);
          session.setStatus("authed");
        }}
      />
    );
  }
  return (
    <AdminDashboard
      profile={session.profile}
      onLogout={() => session.setStatus("anonymous")}
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatWidget />} />
        <Route path="/admin" element={<AdminGate />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
