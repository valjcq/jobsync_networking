import { z } from "zod";

export const ForgotPasswordFormSchema = z.object({
  email: z
    .string({
      error: "Email is required.",
    })
    .min(3, {
      message: "Email must be at least 3 characters.",
    })
    .email("Please enter a valid email."),
});

export const ResetPasswordFormSchema = z
  .object({
    password: z
      .string({
        error: "Please enter your new password.",
      })
      .min(6, {
        message: "Password must be at least 6 characters.",
      }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
