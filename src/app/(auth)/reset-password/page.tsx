import { Metadata } from "next";
import Link from "next/link";
import AuthPanel from "@/components/auth/AuthPanel";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import { findUsableResetToken } from "@/lib/passwordReset";

export const metadata: Metadata = {
  title: "Choose a New Password",
};

export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const record = token ? await findUsableResetToken(token) : null;

  if (!token || !record) {
    return (
      <AuthPanel
        title="Link expired"
        description="This reset link is invalid, has already been used, or has expired."
      >
        <Link
          href="/forgot-password"
          className="text-sm underline underline-offset-4"
        >
          Request a new link
        </Link>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      title="Choose a new password"
      description="Enter your new password twice"
    >
      <ResetPasswordForm token={token} />
    </AuthPanel>
  );
}
