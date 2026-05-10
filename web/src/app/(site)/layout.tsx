import { Nav } from "@/components/nav";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Nav />
      <main
        className="site-main"
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "24px 24px 80px",
          minHeight: "calc(100vh - 56px)",
        }}
      >
        {children}
      </main>
    </>
  );
}
