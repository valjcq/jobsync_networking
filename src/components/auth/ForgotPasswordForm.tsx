"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { requestPasswordReset } from "@/actions/passwordReset.actions";
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
import { ForgotPasswordFormSchema } from "@/models/passwordReset.schema";
import Loading from "../Loading";

function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");

  const form = useForm<z.infer<typeof ForgotPasswordFormSchema>>({
    resolver: zodResolver(ForgotPasswordFormSchema),
    mode: "onChange",
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: z.infer<typeof ForgotPasswordFormSchema>) => {
    startTransition(async () => {
      setError("");
      const result = await requestPasswordReset(data);
      if (result.error) {
        setError(result.error);
      } else {
        setSubmittedEmail(data.email);
      }
    });
  };

  if (submittedEmail) {
    return (
      <p className="text-sm" role="status">
        If an account exists for <strong>{submittedEmail}</strong>, we have
        sent it a link to reset the password. The link expires in 1 hour.
        Check your spam folder if it does not arrive within a few minutes.
      </p>
    );
  }

  return (
    <Form {...form}>
      <form method="POST" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="email">Email</FormLabel>
                <FormControl>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="id@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? <Loading /> : "Send reset link"}
          </Button>
          <div
            className="flex min-h-8 items-end"
            aria-live="polite"
            aria-atomic="true"
          >
            {errorMessage && (
              <p className="text-sm text-red-500">{errorMessage}</p>
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}

export default ForgotPasswordForm;
