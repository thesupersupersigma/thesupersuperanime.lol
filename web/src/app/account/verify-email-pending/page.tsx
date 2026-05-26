import { getCurrentUser } from "@/lib/auth";
import VerifyEmailPendingClient from "./client";

export default async function VerifyEmailPendingPage() {
  const user = await getCurrentUser();
  return <VerifyEmailPendingClient email={user?.email ?? ""} />;
}
