import { Metadata } from "next";
import AuthPanel from "@/components/auth/AuthPanel";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import { isEmailConfigured } from "@/lib/email";

export const metadata: Metadata = {
  title: "Forgot Password",
};

// SMTP settings are read at request time, not baked in at build time.
export const dynamic = "force-dynamic";

export default function ForgotPassword() {
  if (!isEmailConfigured()) {
    return (
      <AuthPanel
        title="Reset your password"
        description="Password reset by email is not set up on this server."
      >
        <p className="text-sm">
          Ask the person who runs this JobSync server to reset your password.
        </p>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      title="Reset your password"
      description="Enter your account's email and we'll send you a link to choose a new password"
    >
      <ForgotPasswordForm />
    </AuthPanel>
  );
}
