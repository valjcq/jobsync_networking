"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { resetPassword } from "@/actions/passwordReset.actions";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ResetPasswordFormSchema } from "@/models/passwordReset.schema";
import Loading from "../Loading";
import { Eye, EyeOff } from "lucide-react";

function ResetPasswordForm({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setError] = useState("");
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<z.infer<typeof ResetPasswordFormSchema>>({
    resolver: zodResolver(ResetPasswordFormSchema),
    mode: "onChange",
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: z.infer<typeof ResetPasswordFormSchema>) => {
    startTransition(async () => {
      setError("");
      const result = await resetPassword({ token, ...data });
      if (result.error) {
        setError(result.error);
      } else {
        setDone(true);
      }
    });
  };

  if (done) {
    return (
      <div className="grid gap-4" role="status">
        <p className="text-sm">Your password has been changed.</p>
        <Button asChild className="w-full">
          <Link href="/signin">Sign in</Link>
        </Button>
      </div>
    );
  }

  const passwordType = showPassword ? "text" : "password";

  return (
    <Form {...form}>
      <form method="POST" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-4">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="password">New password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      id="password"
                      type={passwordType}
                      autoComplete="new-password"
                      spellCheck={false}
                      autoCorrect="off"
                      autoCapitalize="off"
                      {...field}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 text-muted-foreground"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="confirmPassword">
                  Confirm new password
                </FormLabel>
                <FormControl>
                  <Input
                    id="confirmPassword"
                    type={passwordType}
                    autoComplete="new-password"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? <Loading /> : "Change password"}
          </Button>
          <div
            className="flex min-h-8 items-end"
            aria-live="polite"
            aria-atomic="true"
          >
            {errorMessage && (
              <p className="text-sm text-red-500">
                {errorMessage}{" "}
                <Link
                  href="/forgot-password"
                  className="underline underline-offset-4"
                >
                  Request a new link
                </Link>
              </p>
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}

export default ResetPasswordForm;
