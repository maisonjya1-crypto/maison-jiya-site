import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Télécharger Maison Jiya Gestion — Android",
  description: "Téléchargement officiel de l’application Android Maison Jiya Gestion.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2d2430",
};

const apkPath = "/api/download/android";

export default function DownloadAndroidApp() {
  return (
    <main style={{
      minHeight: "100dvh",
      display: "grid",
      placeItems: "center",
      padding: "clamp(18px, 5vw, 48px)",
      background: "linear-gradient(145deg,#f7f4f8 0%,#efe6f1 100%)",
      color: "#2d2430",
      fontFamily: "Arial, Helvetica, sans-serif",
    }}>
      <section style={{
        width: "min(100%, 620px)",
        padding: "clamp(24px, 6vw, 48px)",
        border: "1px solid rgba(45,36,48,.12)",
        borderRadius: 28,
        background: "rgba(255,255,255,.96)",
        boxShadow: "0 24px 70px rgba(45,36,48,.16)",
      }}>
        <div style={{
          width: 72,
          height: 72,
          display: "grid",
          placeItems: "center",
          marginBottom: 22,
          borderRadius: 20,
          background: "#2d2430",
          color: "white",
          fontFamily: "Georgia, serif",
          fontSize: 28,
          fontWeight: 700,
        }}>MJ</div>

        <span style={{
          display: "inline-block",
          padding: "7px 10px",
          borderRadius: 999,
          background: "#f1e9f3",
          color: "#6f5680",
          fontSize: 12,
          fontWeight: 800,
        }}>ANDROID · VERSION 2.3</span>

        <h1 style={{ margin: "18px 0 10px", fontSize: "clamp(28px, 7vw, 46px)", lineHeight: 1.02 }}>
          Maison Jiya Gestion
        </h1>
        <p style={{ margin: "0 0 24px", color: "#746b76", fontSize: 15, lineHeight: 1.65 }}>
          Application privée officielle pour gérer les commandes, les produits et le pilotage Maison Jiya.
          L’interface s’adapte automatiquement aux téléphones, tablettes et écrans pliables Android.
        </p>

        <a
          href={apkPath}
          download="Maison-Jiya-Gestion-Android-2.3.apk"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            minHeight: 58,
            padding: "14px 18px",
            borderRadius: 16,
            background: "#2d2430",
            color: "#fff",
            textDecoration: "none",
            fontSize: 16,
            fontWeight: 850,
          }}
        >
          Télécharger l’application Android
        </a>

        <div style={{ marginTop: 20, padding: 16, borderRadius: 16, background: "#f8f5f9", color: "#665d68", fontSize: 13, lineHeight: 1.6 }}>
          <strong style={{ color: "#2d2430" }}>Installation :</strong> ouvre le fichier téléchargé puis autorise l’installation depuis ton navigateur si Android le demande. Les futures versions pourront remplacer l’application actuelle.
        </div>
      </section>
    </main>
  );
}
