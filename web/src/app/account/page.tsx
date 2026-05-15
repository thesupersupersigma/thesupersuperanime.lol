import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { logOutAction } from "./actions";
import { SignOutButton, ImportButton } from "./account-buttons";

export default async function AccountPage() {
  const user = await getCurrentUser();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#e5e5e5",
      paddingTop: "96px",
      paddingBottom: "48px",
      paddingLeft: "24px",
      paddingRight: "24px",
    }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>

        {!user ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
          }}>
            <LoginForm />
          </div>
        ) : (
          <div style={{ maxWidth: "800px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>

            {/* Header card */}
            <div style={{
              background: "#111",
              border: "1px solid #2a2a2a",
              borderRadius: "16px",
              padding: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 0, left: 0,
                width: "100%", height: "1px",
                background: "linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)",
              }} />
              <div>
                <h1 style={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "#e5e5e5",
                  letterSpacing: "-0.02em",
                  marginBottom: "6px",
                }}>
                  My Account
                </h1>
                <p style={{ color: "#555", fontSize: "13px" }}>
                  Signed in as <span style={{ color: "#a3a3a3", fontWeight: 500 }}>{user.email}</span>
                </p>
              </div>
              <SignOutButton action={logOutAction} />
            </div>

            {/* Features grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>

              {/* Sync status */}
              <div style={{
                background: "#111",
                border: "1px solid #2a2a2a",
                borderRadius: "16px",
                padding: "28px",
                position: "relative",
                overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", top: 0, left: 0,
                  width: "100%", height: "1px",
                  background: "linear-gradient(to right, transparent, rgba(34,197,94,0.5), transparent)",
                }} />
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <div style={{
                    width: "8px", height: "8px",
                    borderRadius: "50%",
                    background: "#22c55e",
                    boxShadow: "0 0 10px rgba(34,197,94,0.7)",
                  }} />
                  <h2 style={{
                    fontFamily: "'Syne', sans-serif",
                    fontSize: "15px",
                    fontWeight: 600,
                    color: "#e5e5e5",
                  }}>
                    Cloud Sync Active
                  </h2>
                </div>
                <p style={{ color: "#555", fontSize: "13px", lineHeight: "1.6" }}>
                  Your watch history and episode progress are synced securely to the cloud.
                </p>
              </div>

              {/* Import */}
              <div style={{
                background: "#111",
                border: "1px solid #2a2a2a",
                borderRadius: "16px",
                padding: "28px",
                position: "relative",
                overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", top: 0, left: 0,
                  width: "100%", height: "1px",
                  background: "linear-gradient(to right, transparent, rgba(59,130,246,0.5), transparent)",
                }} />
                <h2 style={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "#e5e5e5",
                  marginBottom: "10px",
                }}>
                  Import History
                </h2>
                <p style={{ color: "#555", fontSize: "13px", lineHeight: "1.6", marginBottom: "20px" }}>
                  Coming from AniKai or HiAnime? Upload your backup file to instantly restore your watch history.
                </p>
                <ImportButton />
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}