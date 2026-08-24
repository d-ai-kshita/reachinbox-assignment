import { useEffect, useMemo, useState } from "react";
import "./App.css";

type EmailStatus = "Scheduled" | "Sent" | "Failed";

type EmailItem = {
  id: string;
  recipient: string;
  subject: string;
  time: string;
  status: EmailStatus;
};

type User = {
  id: string;
  name: string;
  email: string;
  avatar: string;
};

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Temporary backend user ID.
// Keep this for now because your current email API uses this ID.
// We can connect emails directly to the Google user later.
const USER_ID = "8f7c2b1a-4d6e-4f91-9c32-5a7b8d1e6f20";

function App() {
  const [activeTab, setActiveTab] =
    useState<"scheduled" | "sent">("scheduled");

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [showCompose, setShowCompose] = useState(false);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [startTime, setStartTime] = useState("");
  const [delayMs, setDelayMs] = useState("2000");
  const [hourlyLimit, setHourlyLimit] = useState("100");

  const [leadFile, setLeadFile] = useState<File | null>(null);
  const [leadCount, setLeadCount] = useState(0);
  const [recipients, setRecipients] = useState<string[]>([]);

  const [scheduled, setScheduled] = useState<EmailItem[]>([]);
  const [sent, setSent] = useState<EmailItem[]>([]);

  const [loading, setLoading] = useState(false);

  const currentEmails = useMemo(
    () => (activeTab === "scheduled" ? scheduled : sent),
    [activeTab, scheduled, sent]
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      return dateString;
    }

    return date.toLocaleString();
  };

  const mapEmail = (email: any): EmailItem => {
    return {
      id: String(email.id),
      recipient: email.recipientEmail,
      subject: email.subject,
      time: formatDate(email.scheduledAt || email.sentAt),
      status:
        email.status === "SENT"
          ? "Sent"
          : email.status === "FAILED"
          ? "Failed"
          : "Scheduled",
    };
  };

  // --------------------------------------------------
  // GOOGLE AUTHENTICATION
  // --------------------------------------------------

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/me`, {
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Not authenticated");
        }

        return response.json();
      })
      .then((data) => {
        if (data.authenticated) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setAuthLoading(false);
      });
  }, []);

  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE}/api/auth/google`;
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    }

    setUser(null);
    setScheduled([]);
    setSent([]);
  };

  // --------------------------------------------------
  // EMAIL DATA
  // --------------------------------------------------

  const fetchScheduledEmails = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/api/emails/scheduled?userId=${USER_ID}`,
        {
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to fetch scheduled emails"
        );
      }

      setScheduled(data.map(mapEmail));

      console.log("SCHEDULED EMAILS:", data);
    } catch (error) {
      console.error("Failed to fetch scheduled emails:", error);
    }
  };

  const fetchSentEmails = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/api/emails/sent?userId=${USER_ID}`,
        {
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to fetch sent emails");
      }

      setSent(data.map(mapEmail));

      console.log("SENT EMAILS:", data);
    } catch (error) {
      console.error("Failed to fetch sent emails:", error);
    }
  };

  const fetchEmails = async () => {
    if (!user) return;

    setLoading(true);

    await Promise.all([
      fetchScheduledEmails(),
      fetchSentEmails(),
    ]);

    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;

    fetchEmails();

    const interval = setInterval(() => {
      fetchEmails();
    }, 3000);

    return () => clearInterval(interval);
  }, [user]);

  // --------------------------------------------------
  // LEAD UPLOAD
  // --------------------------------------------------

  const handleLeadUpload = (file: File | null) => {
    setLeadFile(file);

    if (!file) {
      setLeadCount(0);
      setRecipients([]);
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      const text = String(event.target?.result || "");

      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const emails = lines
        .map((line) => line.replace(/^["']|["']$/g, ""))
        .filter((line) =>
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line)
        );

      setRecipients(emails);
      setLeadCount(emails.length);

      console.log("LEADS LOADED:", emails);
      console.log("LEAD COUNT:", emails.length);
    };

    reader.readAsText(file);
  };

  // --------------------------------------------------
  // SCHEDULE EMAILS
  // --------------------------------------------------

  const handleSchedule = async () => {
    if (!subject.trim() || !body.trim()) {
      alert("Please enter both subject and email body.");
      return;
    }

    if (recipients.length === 0) {
      alert("Please upload a lead file containing email addresses.");
      return;
    }

    if (!startTime) {
      alert("Please select a start time.");
      return;
    }

    const selectedStartTime = new Date(startTime);

    if (isNaN(selectedStartTime.getTime())) {
      alert("Please select a valid start time.");
      return;
    }

    try {
      console.log("=================================");
      console.log("SENDING SCHEDULE REQUEST");
      console.log("Subject:", subject);
      console.log("Recipients:", recipients);
      console.log(
        "Start time:",
        selectedStartTime.toISOString()
      );
      console.log("Delay:", Number(delayMs));
      console.log("Hourly limit:", Number(hourlyLimit));
      console.log("=================================");

      const response = await fetch(
        `${API_BASE}/api/emails/schedule`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            userId: USER_ID,
            senderId: "4b9c2d71-6e35-4a82-b1f7-93d6c8e5a204",
            subject: subject.trim(),
            body: body.trim(),
            startTime: selectedStartTime.toISOString(),
            delayMs: Number(delayMs),
            hourlyLimit: Number(hourlyLimit),
            recipients,
          }),
        }
      );

      console.log(
        "BACKEND RESPONSE STATUS:",
        response.status
      );

      const data = await response.json();

      console.log("BACKEND RESPONSE:", data);

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to schedule emails"
        );
      }

      console.log("SCHEDULE SUCCESS:", data);

      setSubject("");
      setBody("");
      setStartTime("");
      setDelayMs("2000");
      setHourlyLimit("100");
      setLeadFile(null);
      setRecipients([]);
      setLeadCount(0);
      setShowCompose(false);
      setActiveTab("scheduled");

      await fetchEmails();

      alert("Emails scheduled successfully!");
    } catch (error) {
      console.error("=================================");
      console.error("SCHEDULE ERROR:", error);
      console.error("=================================");

      alert(
        error instanceof Error
          ? error.message
          : "Failed to schedule emails"
      );
    }
  };

  // --------------------------------------------------
  // LOADING SCREEN
  // --------------------------------------------------

  if (authLoading) {
    return (
      <div
        className="app"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="empty-state">
          <div className="empty-icon">R</div>
          <h3>Loading ReachInbox...</h3>
          <p>Please wait.</p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // LOGIN SCREEN
  // --------------------------------------------------

  if (!user) {
    return (
      <div
        className="app"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            padding: "40px",
            borderRadius: "20px",
            background: "#111116",
            border: "1px solid #292932",
            textAlign: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "18px",
              background:
                "linear-gradient(135deg, #8b5cf6, #6d28d9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              fontSize: "30px",
              fontWeight: 700,
              color: "#fff",
            }}
          >
            R
          </div>

          <h1
            style={{
              margin: "0 0 10px",
              color: "#fff",
              fontSize: "28px",
            }}
          >
            Welcome to ReachInbox
          </h1>

          <p
            style={{
              margin: "0 0 28px",
              color: "#9696a8",
              fontSize: "15px",
            }}
          >
            Sign in to manage your email campaigns.
          </p>

          <button
            onClick={handleGoogleLogin}
            style={{
              width: "100%",
              padding: "14px 20px",
              border: "none",
              borderRadius: "10px",
              background:
                "linear-gradient(135deg, #8b5cf6, #7c3aed)",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // MAIN DASHBOARD
  // --------------------------------------------------

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R</div>
          <span>ReachInbox</span>
        </div>

        <nav className="navigation">
          <button
            className={`nav-item ${
              activeTab === "scheduled" ? "active" : ""
            }`}
            onClick={() => setActiveTab("scheduled")}
          >
            <span className="nav-icon">◷</span>
            Scheduled
            <span className="nav-count">
              {scheduled.length}
            </span>
          </button>

          <button
            className={`nav-item ${
              activeTab === "sent" ? "active" : ""
            }`}
            onClick={() => setActiveTab("sent")}
          >
            <span className="nav-icon">✓</span>
            Sent
            <span className="nav-count">
              {sent.length}
            </span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="user-card">
            <div className="avatar">
              {user.name?.charAt(0).toUpperCase() || "U"}
            </div>

            <div className="user-info">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>

            <button
              className="logout-button"
              title="Logout"
              onClick={handleLogout}
            >
              ↪
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>
              {activeTab === "scheduled"
                ? "Scheduled"
                : "Sent"}
            </h1>

            <p>
              {activeTab === "scheduled"
                ? "Manage your upcoming email campaigns"
                : "View emails that have already been sent"}
            </p>
          </div>

          <button
            className="compose-button"
            onClick={() => setShowCompose(true)}
          >
            <span>＋</span>
            Compose
          </button>
        </header>

        <section className="content">
          <div className="stats">
            <div className="stat-card">
              <div className="stat-icon purple">✉</div>

              <div>
                <span>Total emails</span>
                <strong>{currentEmails.length}</strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon blue">◷</div>

              <div>
                <span>
                  {activeTab === "scheduled"
                    ? "Upcoming"
                    : "Delivered"}
                </span>

                <strong>{currentEmails.length}</strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green">✓</div>

              <div>
                <span>Success rate</span>
                <strong>100%</strong>
              </div>
            </div>
          </div>

          <div className="table-card">
            <div className="table-header">
              <div>
                <h2>
                  {activeTab === "scheduled"
                    ? "Scheduled emails"
                    : "Sent emails"}
                </h2>

                <span>
                  {currentEmails.length} emails
                </span>
              </div>

              <button
                className="refresh-button"
                onClick={fetchEmails}
                disabled={loading}
              >
                ↻ {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {currentEmails.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">✉</div>

                <h3>No emails yet</h3>

                <p>
                  {activeTab === "scheduled"
                    ? "Create your first scheduled campaign to get started."
                    : "Sent emails will appear here."}
                </p>

                {activeTab === "scheduled" && (
                  <button
                    className="empty-button"
                    onClick={() => setShowCompose(true)}
                  >
                    Compose email
                  </button>
                )}
              </div>
            ) : (
              <div className="email-table">
                <div className="table-row table-head">
                  <div>RECIPIENT</div>
                  <div>SUBJECT</div>
                  <div>TIME</div>
                  <div>STATUS</div>
                </div>

                {currentEmails.map((email) => (
                  <div
                    className="table-row"
                    key={email.id}
                  >
                    <div className="recipient">
                      <div className="mini-avatar">
                        {email.recipient
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <span>{email.recipient}</span>
                    </div>

                    <div className="subject">
                      {email.subject}
                    </div>

                    <div className="email-time">
                      {email.time}
                    </div>

                    <div>
                      <span
                        className={`status ${email.status.toLowerCase()}`}
                      >
                        <span className="status-dot" />
                        {email.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {showCompose && (
        <div
          className="modal-overlay"
          onClick={() => setShowCompose(false)}
        >
          <div
            className="compose-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h2>Compose email</h2>
                <p>
                  Create and schedule your email campaign
                </p>
              </div>

              <button
                className="close-button"
                onClick={() => setShowCompose(false)}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <label>
                Subject

                <input
                  type="text"
                  placeholder="Enter email subject"
                  value={subject}
                  onChange={(event) =>
                    setSubject(event.target.value)
                  }
                />
              </label>

              <label>
                Email body

                <textarea
                  placeholder="Write your email..."
                  value={body}
                  onChange={(event) =>
                    setBody(event.target.value)
                  }
                  rows={7}
                />
              </label>

              <label>
                Leads

                <div className="upload-box">
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={(event) =>
                      handleLeadUpload(
                        event.target.files?.[0] || null
                      )
                    }
                  />

                  <div className="upload-content">
                    <span className="upload-icon">↑</span>

                    <strong>
                      {leadFile
                        ? leadFile.name
                        : "Upload CSV or TXT file"}
                    </strong>

                    <small>
                      {leadCount > 0
                        ? `${leadCount} email addresses detected`
                        : "Upload your lead list to continue"}
                    </small>
                  </div>
                </div>
              </label>

              <div className="form-grid">
                <label>
                  Start time

                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(event) =>
                      setStartTime(event.target.value)
                    }
                  />
                </label>

                <label>
                  Delay between emails

                  <div className="input-with-unit">
                    <input
                      type="number"
                      min="0"
                      value={delayMs}
                      onChange={(event) =>
                        setDelayMs(event.target.value)
                      }
                    />

                    <span>ms</span>
                  </div>
                </label>
              </div>

              <label>
                Hourly sending limit

                <div className="input-with-unit">
                  <input
                    type="number"
                    min="1"
                    value={hourlyLimit}
                    onChange={(event) =>
                      setHourlyLimit(event.target.value)
                    }
                  />

                  <span>emails / hour</span>
                </div>
              </label>

              <div className="campaign-summary">
                <div>
                  <span>Recipients</span>
                  <strong>{leadCount}</strong>
                </div>

                <div>
                  <span>Delay</span>
                  <strong>{delayMs} ms</strong>
                </div>

                <div>
                  <span>Hourly limit</span>
                  <strong>{hourlyLimit}</strong>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="cancel-button"
                onClick={() => setShowCompose(false)}
              >
                Cancel
              </button>

              <button
                className="schedule-button"
                onClick={handleSchedule}
              >
                Schedule campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;