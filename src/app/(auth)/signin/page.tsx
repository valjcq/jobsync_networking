import { Metadata } from "next";
import AuthCard from "@/components/auth/AuthCard";
import { isEmailConfigured } from "@/lib/email";

export const metadata: Metadata = {
  title: "Sign In",
};

// SMTP settings are read at request time, not baked in at build time.
export const dynamic = "force-dynamic";

export default function Signin() {
  return <AuthCard mode="signin" canResetPassword={isEmailConfigured()} />;
}
