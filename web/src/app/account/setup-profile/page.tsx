import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SetupProfileForm from "./setup-profile-form";

export default async function SetupProfilePage() {
  const user = await getCurrentUser();

  // Not logged in — send to account/login
  if (!user) redirect("/account");

  // Already set up — nothing to do here
  if (user.username) redirect("/");

  return <SetupProfileForm />;
}
