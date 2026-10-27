import Link from "next/link";

interface AuthPanelProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

// Same branding and card as AuthCard, for the auth pages without the
// sign in / create account toggle.
export default function AuthPanel({
  title,
  description,
  children,
}: AuthPanelProps) {
  return (
    <div className="mx-auto w-full max-w-md px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">JobSync</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track your job search, powered by AI
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-xs">
        <div className="mb-5">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/signin" className="underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
